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
        const { order_id } = await req.json();

        if (!order_id) {
            throw new Error('Order ID is required');
        }

        // Authenticate the calling user
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Missing Authorization header');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // 1. Verify Requesting User
        const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
        
        if (userError || !user) {
            console.error("Auth error:", userError);
            throw new Error('Unauthorized');
        }

        // 2. Initialize Service client for admin DB operations
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 3. Fetch Order Details & Shipment Details
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
                id,
                shipment_status,
                products ( creator_id ),
                shipments ( shiprocket_shipment_id, awb_code, courier_name )
            `)
            .eq('id', order_id)
            .single();

        if (orderError || !order) {
            throw new Error(`Order not found`);
        }

        // Verify the user owns the product
        if (order.products?.creator_id !== user.id) {
            throw new Error('Unauthorized: You do not have permission to ship this order');
        }

        const shipment = order.shipments && order.shipments.length > 0 ? order.shipments[0] : null;

        if (!shipment || !shipment.shiprocket_shipment_id) {
            throw new Error('Shipment record not found for this order. It may not have been created in Shiprocket yet.');
        }

        const srShipmentId = shipment.shiprocket_shipment_id;

        // 5. Authenticate with Shiprocket
        const srEmail = Deno.env.get("SHIPROCKET_EMAIL");
        const srPassword = Deno.env.get("SHIPROCKET_PASSWORD");

        if (!srEmail || !srPassword) {
            throw new Error('Shiprocket credentials are not configured');
        }

        const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: srEmail, password: srPassword }),
        });

        if (!authRes.ok) {
            console.error('Shiprocket auth failed:', await authRes.text());
            throw new Error('Failed to authenticate with Shiprocket');
        }

        const { token: srToken } = await authRes.json();

        let awbCode = shipment.awb_code;
        let courierName = shipment.courier_name;

        // 6. Generate AWB
        if (!awbCode) {
            console.log(`Requesting AWB for shipment ${srShipmentId}...`);
            const awbRes = await fetch("https://apiv2.shiprocket.in/v1/external/courier/assign/awb", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${srToken}`
                },
                body: JSON.stringify({
                    shipment_id: srShipmentId
                })
            });
            const awbData = await awbRes.json();
            if (awbRes.ok && awbData.awb_assign_status) {
                awbCode = awbData.response?.data?.awb_code || awbCode;
                courierName = awbData.response?.data?.courier_name || courierName;
                console.log(`AWB assigned: ${awbCode} via ${courierName}`);
            } else {
                console.error(`Failed to assign AWB:`, awbData);
                throw new Error(awbData.message || 'Failed to generate AWB tracking code from Shiprocket');
            }
        }

        // 7. Request Pickup
        console.log(`Requesting pickup for shipment ${srShipmentId}...`);
        const pickupRes = await fetch("https://apiv2.shiprocket.in/v1/external/courier/generate/pickup", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${srToken}`
            },
            body: JSON.stringify({
                shipment_id: [srShipmentId]
            })
        });
        const pickupData = await pickupRes.json();
        
        // Sometimes pickup fails but returns 200 with error message, check pickup_status
        if (pickupRes.ok && pickupData.pickup_status === 1) {
            console.log("Pickup requested successfully");
        } else {
             console.error(`Failed to request pickup:`, pickupData);
             // Even if pickup fails, we might still have generated the AWB. We should save the AWB instead of discarding it.
             // We will not throw an error, we will just warn the user.
        }

        // 8. Update Shipment in Supabase
        const { error: updateError } = await supabase
            .from('shipments')
            .update({
                awb_code: awbCode,
                courier_name: courierName,
            })
            .eq('shiprocket_shipment_id', srShipmentId);

        if (updateError) {
            console.error("Failed to update shipment record:", updateError);
            throw new Error(`Failed to save AWB tracking locally: ${JSON.stringify(updateError)}`);
        }

        // 9. Update Order Shipment Status
        const newShipmentStatus = awbCode ? 'shipped' : 'processing';
        await supabase
            .from('orders')
            .update({ shipment_status: newShipmentStatus })
            .eq('id', order.id);

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: pickupData.pickup_status === 1 ? 'AWB assigned and pickup requested successfully' : `AWB created but pickup failed: ${pickupData.message || 'Unknown error'}`,
                awb_code: awbCode,
                courier: courierName
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('Shipment Error:', err);
        return new Response(
            JSON.stringify({ error: err.message || 'Internal server error processing shipment', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
