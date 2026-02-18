import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { amount, currency = 'INR', description, receipt, creator_id, item_id, item_type } = body;

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

    console.log('Received request:', { amount, currency, description, receipt, creator_id, item_id, item_type });

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

    // Prepare order options
    const options: any = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency,
      receipt,
      notes: {
        description,
        item_id: item_id || '',
        item_type: item_type || '',
      },
    };

    // If creator_id is provided, fetch creator's Razorpay account and add transfer
    if (creator_id) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.3');
        const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');

        const { data: creator, error: creatorError } = await supabase
          .from('profiles')
          .select('razorpay_account_id, bank_account_name')
          .eq('id', creator_id)
          .single();

        if (creatorError || !creator) {
          console.error('Creator not found:', creatorError);
        } else if (creator.razorpay_account_id) {
          // Add transfer to creator (100% of amount, no platform fee)
          options.transfers = [
            {
              account: creator.razorpay_account_id,
              amount: Math.round(amount * 100), // Transfer full amount to creator
              currency: currency,
              notes: {
                creator_id: creator_id,
                item_id: item_id || '',
                item_type: item_type || '',
              },
              linked_account_notes: [
                `Payment for ${item_type || 'item'}: ${description || 'N/A'}`
              ],
              on_hold: 0, // Transfer immediately
            }
          ];
          console.log('Added transfer to creator:', creator.razorpay_account_id);
        } else {
          console.log('Creator has not added payment details yet');
        }
      } catch (error) {
        console.error('Error fetching creator details:', error);
        // Continue without transfer if there's an error
      }
    }

    console.log("Creating order with Razorpay:", options);

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify(options),
    });

    const orderData = await razorpayResponse.json();
    console.log('Razorpay response status:', razorpayResponse.status);
    console.log('Razorpay response data:', orderData);

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
