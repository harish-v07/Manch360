import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { amount, currency = 'INR', description, receipt, course_id, product_id } = body;

    // Validate required fields
    if (!amount) {
      console.error('Missing required field: amount');
      return new Response(
        JSON.stringify({ error: 'Missing required field: amount' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Received request:', { amount, currency, description, receipt, course_id, product_id });

    const key_id = Deno.env.get('RAZORPAY_KEY_ID');
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET');

    console.log('Razorpay keys present:', {
      key_id: key_id ? 'present' : 'missing',
      key_secret: key_secret ? 'present' : 'missing'
    });

    if (!key_id || !key_secret) {
      console.error("Missing Razorpay keys");
      return new Response(
        JSON.stringify({ error: 'Razorpay API keys not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const auth = btoa(`${key_id}:${key_secret}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch creator's Razorpay account ID if course_id or product_id is provided
    let creatorAccountId = null;
    let creatorPercentage = 85; // Creator gets 85%, platform keeps 15%

    if (course_id) {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('creator_id')
        .eq('id', course_id)
        .single();

      if (courseError) {
        console.error('Error fetching course:', courseError);
      } else if (course?.creator_id) {
        // Fetch creator's profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('razorpay_account_id')
          .eq('id', course.creator_id)
          .single();

        if (profileError) {
          console.error('Error fetching creator profile:', profileError);
        } else if (profile?.razorpay_account_id) {
          creatorAccountId = profile.razorpay_account_id;
          console.log('Found creator account for course:', creatorAccountId);
        } else {
          console.log('Creator has not set up payment details yet');
        }
      }
    } else if (product_id) {
      console.log('Looking up product:', product_id);
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('creator_id')
        .eq('id', product_id)
        .single();

      console.log('Product query result:', JSON.stringify({ product, productError }));

      if (productError) {
        console.error('Error fetching product:', productError);
      } else if (product?.creator_id) {
        console.log('Found creator_id:', product.creator_id);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('razorpay_account_id')
          .eq('id', product.creator_id)
          .single();

        console.log('Profile query result:', JSON.stringify({ profile, profileError }));

        if (profileError) {
          console.error('Error fetching creator profile:', profileError);
        } else if (profile?.razorpay_account_id) {
          creatorAccountId = profile.razorpay_account_id;
          console.log('Found creator account for product:', creatorAccountId);
        } else {
          console.log('Creator has no razorpay_account_id. Profile:', JSON.stringify(profile));
        }
      } else {
        console.log('No creator_id on product:', JSON.stringify(product));
      }
    }

    console.log('Final creatorAccountId:', creatorAccountId);
    console.log('Will create transfer:', !!(creatorAccountId && creatorAccountId.startsWith('acc_')));

    const options: any = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency,
      receipt,
      notes: {
        description,
      },
    };

    // Razorpay Route: Automatically split payment to creator's linked account
    if (creatorAccountId && creatorAccountId.startsWith('acc_')) {
      const creatorAmount = Math.round(amount * 100 * creatorPercentage / 100);
      // Razorpay minimum transfer amount is ₹1 (100 paise)
      if (creatorAmount >= 100) {
        options.transfers = [
          {
            account: creatorAccountId,
            amount: creatorAmount,
            currency: currency,
            notes: {
              description: `Creator payout - ${creatorPercentage}% of sale`,
            },
            linked_account_notes: ["description"],
            on_hold: 0,
          }
        ];
        console.log(`Route transfer: ${creatorPercentage}% (₹${creatorAmount / 100}) → ${creatorAccountId}`);
      } else {
        console.log(`Skipping transfer: creator amount ${creatorAmount} paise is below ₹1 minimum. Order amount too small.`);
      }
    } else if (creatorAccountId) {
      console.log('Creator account found but not a Route account (acc_...). Skipping transfer:', creatorAccountId);
    }

    console.log("Creating order with Razorpay:", options);

    let razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify(options),
    });

    let orderData = await razorpayResponse.json();
    console.log('Razorpay response status:', razorpayResponse.status);
    console.log('Razorpay response data:', orderData);

    // If transfer failed due to unactivated account, retry without transfer
    if (!razorpayResponse.ok && options.transfers &&
      (orderData.error?.description?.includes('activated') ||
        orderData.error?.description?.includes('activation') ||
        orderData.error?.reason === 'input_validation_failed')) {
      console.log('Transfer rejected (account not activated). Retrying order without transfer...');
      delete options.transfers;
      razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: JSON.stringify(options),
      });
      orderData = await razorpayResponse.json();
      console.log('Retry response status:', razorpayResponse.status);
      console.log('Retry response data:', orderData);
    }

    if (!razorpayResponse.ok) {
      console.error("Razorpay API Error:", orderData);
      const errorMessage = orderData.error?.description || "Failed to create order with Razorpay";
      return new Response(
        JSON.stringify({
          error: errorMessage,
          razorpay_error: orderData.error
        }),
        {
          status: razorpayResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Order created successfully:', orderData.id);
    return new Response(
      JSON.stringify(orderData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error creating Razorpay order:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error occurred',
        stack: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
