import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { product_id, delivery_pincode } = await req.json();

        if (!product_id || !delivery_pincode) {
            return new Response(
                JSON.stringify({ error: 'product_id and delivery_pincode are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate pincode format
        if (!/^\d{6}$/.test(delivery_pincode)) {
            return new Response(
                JSON.stringify({ error: 'Invalid pincode. Must be 6 digits.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get the product's creator_id and weight
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('creator_id, name, weight')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return new Response(
                JSON.stringify({ error: 'Product not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Get the creator's pickup address pincode
        const { data: creatorProfile, error: profileError } = await supabase
            .from('profiles')
            .select('pickup_address')
            .eq('id', product.creator_id)
            .single();

        if (profileError || !creatorProfile) {
            return new Response(
                JSON.stringify({ error: 'Creator profile not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const pickupAddress = creatorProfile.pickup_address as any;
        const pickupPincode = pickupAddress?.pincode;

        if (!pickupPincode) {
            return new Response(
                JSON.stringify({ error: 'Creator has not registered a pickup address. Shipping rates unavailable.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 3. Authenticate with Shiprocket
        const srEmail = Deno.env.get("SHIPROCKET_EMAIL");
        const srPassword = Deno.env.get("SHIPROCKET_PASSWORD");

        if (!srEmail || !srPassword) {
            return new Response(
                JSON.stringify({ error: 'Shipping service not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: srEmail, password: srPassword }),
        });

        if (!authRes.ok) {
            console.error('Shiprocket auth failed:', await authRes.text());
            return new Response(
                JSON.stringify({ error: 'Shipping service authentication failed' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { token: srToken } = await authRes.json();

        // 4. Call Shiprocket Serviceability API
        const weight = product.weight || 0.5; // Use product weight or default to 0.5kg
        const cod = 0; // Prepaid only

        const serviceUrl = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${delivery_pincode}&weight=${weight}&cod=${cod}`;

        console.log(`Checking shipping rate: pickup=${pickupPincode}, delivery=${delivery_pincode}`);

        const serviceRes = await fetch(serviceUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${srToken}`
            }
        });

        const serviceData = await serviceRes.json();

        if (!serviceRes.ok || serviceData.status !== 200) {
            console.error('Serviceability check failed:', serviceData);
            return new Response(
                JSON.stringify({ error: 'Shipping not available for this pincode. Please try a different address.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const availableCouriers = serviceData.data?.available_courier_companies;
        if (!availableCouriers || availableCouriers.length === 0) {
            return new Response(
                JSON.stringify({ error: 'No shipping partners available for this pincode route.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Select the best courier — recommended first, then cheapest
        const recommendedCourier = availableCouriers.find((c: any) => c.is_recommended === 1);

        // Sort by rate (cheapest first) as fallback
        const sortedByRate = [...availableCouriers].sort((a: any, b: any) => 
            (a.rate || a.freight_charge || 999999) - (b.rate || b.freight_charge || 999999)
        );
        const cheapestCourier = sortedByRate[0];

        // Pick recommended if available, otherwise cheapest
        const bestCourier = recommendedCourier || cheapestCourier;

        // Calculate the total shipping charge
        const shippingCharge = bestCourier.rate || bestCourier.freight_charge || 0;

        // Build response
        const result = {
            success: true,
            shipping_charge: Math.ceil(shippingCharge), // Round up to nearest rupee
            courier_name: bestCourier.courier_name || 'Standard Shipping',
            estimated_delivery_days: bestCourier.estimated_delivery_days || bestCourier.etd || null,
            estimated_delivery_date: bestCourier.etd_date || null,
            courier_company_id: bestCourier.courier_company_id || bestCourier.id,
            is_recommended: bestCourier.is_recommended === 1,
            rating: bestCourier.rating || null,
            pickup_pincode: pickupPincode,
            delivery_pincode: delivery_pincode,
        };

        console.log(`Best courier: ${result.courier_name} @ ₹${result.shipping_charge}, ETA: ${result.estimated_delivery_days}`);

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('check-shipping-rate error:', err);
        return new Response(
            JSON.stringify({ error: err.message || 'Failed to check shipping rate' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
