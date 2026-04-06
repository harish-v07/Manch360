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
                products ( creator_id, weight ),
                shipments ( shiprocket_order_id, shiprocket_shipment_id, awb_code, courier_name )
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
        const srOrderId = shipment.shiprocket_order_id;

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

        // 6. Assign AWB and Request Pickup
        if (!awbCode) {
            console.log(`Shipment ${srShipmentId} needs AWB. Fetching serviceability...`);
            
            // Get postcodes and weights for a more robust serviceability check
            const { data: fullOrder } = await supabase
                .from('orders')
                .select(`
                    id, 
                    amount, 
                    delivery_address,
                    profiles!orders_user_id_fkey (
                        pickup_address
                    )
                `)
                .eq('id', order_id)
                .single();
            
            const deliveryAddr = (fullOrder?.delivery_address as any) || {};
            const pickupAddr = (fullOrder?.profiles as any)?.pickup_address || {};
            
            const deliveryPostcode = deliveryAddr.pincode;
            const pickupPostcode = pickupAddr.pincode || "641030"; // Fallback to Coimbatore
            const weight = order.products.weight || 0.5;
            const isCod = 0;

            // Use shipment_id instead of order_id to avoid "Order doesn't exist"
            const serviceUrl = `https://apiv2.shiprocket.in/v1/external/courier/serviceability?pickup_postcode=${pickupPostcode}&delivery_postcode=${deliveryPostcode}&weight=${weight}&cod=${isCod}&shipment_id=${srShipmentId}`;
            
            console.log(`Calling serviceability: ${serviceUrl}`);
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
                throw new Error(`Shiprocket Serviceability Error: ${serviceData.message || 'No services available'}`);
            }

            const availableCouriers = serviceData.data?.available_courier_companies;
            if (!availableCouriers || availableCouriers.length === 0) {
                throw new Error('No courier partners found for this pin code route.');
            }

            // Select the best courier (Recommended or first available)
            const bestCourier = availableCouriers.find((c: any) => c.is_recommended === 1) || availableCouriers[0];
            const courierId = bestCourier.courier_company_id || bestCourier.id;
            
            if (!courierId) {
                throw new Error('Could not determine a valid Courier ID from Shiprocket.');
            }

            console.log(`Selected courier: ${bestCourier.courier_name} (ID: ${courierId})`);

            // Generate AWB with specific Courier ID
            const awbPayload = {
                shipment_id: Number(srShipmentId),
                courier_id: Number(courierId),
                is_return: 0 // Explicitly set to non-return
            };
            
            console.log(`Requesting AWB with payload:`, awbPayload);
            const awbRes = await fetch("https://apiv2.shiprocket.in/v1/external/courier/assign/awb", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${srToken}`
                },
                body: JSON.stringify(awbPayload)
            });
            
            const awbData = await awbRes.json();
            
            // Check for success (Shiprocket uses various success codes)
            if (awbRes.ok && (awbData.awb_assign_status === 1 || awbData.status === 1 || awbData.status_code === 1)) {
                awbCode = awbData.response?.data?.awb_code || awbCode;
                courierName = awbData.response?.data?.courier_name || bestCourier.courier_name;
                console.log(`AWB assigned: ${awbCode} via ${courierName}`);
            } else {
                console.error(`Shiprocket AWB Assignment Failed:`, awbData);
                let errMsg = awbData.message || 'Failed to assign AWB';
                
                // Handle specific compliance/flagged account error
                if (errMsg.toLowerCase().includes('disputed') || errMsg.toLowerCase().includes('compliance')) {
                    errMsg = "Your Shiprocket account is flagged for compliance. Please contact compliance@shiprocket.com to verify your account before you can ship via API.";
                }
                
                // Inspect errors object if it exists
                if (awbData.errors) {
                    const errorDetails = typeof awbData.errors === 'string' 
                        ? awbData.errors 
                        : JSON.stringify(awbData.errors);
                    errMsg = `${errMsg}: ${errorDetails}`;
                }
                
                if (errMsg.toLowerCase().includes('balance') || errMsg.toLowerCase().includes('credit')) {
                    errMsg = "Insufficient Shiprocket wallet balance. Please top up your wallet.";
                }
                
                throw new Error(errMsg);
            }
        }

        // 8. Request Pickup
        console.log(`Requesting pickup for shipment ${srShipmentId}...`);
        const pickupRes = await fetch("https://apiv2.shiprocket.in/v1/external/courier/generate/pickup", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${srToken}`
            },
            body: JSON.stringify({
                shipment_id: [Number(srShipmentId)]
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
