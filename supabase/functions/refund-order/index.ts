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

        // 1. Initialize Supabase anon client
        const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);

        // Extract the JWT token specifically
        const token = authHeader.replace('Bearer ', '');
        
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
        
        if (userError || !user) {
            console.error("Auth error:", userError);
            throw new Error('Unauthorized');
        }

        // 2. Initialize Service client for admin DB operations
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 3. Fetch the order details, making sure the requesting user is the creator
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
                id,
                amount,
                status,
                shipment_status,
                razorpay_payment_id,
                item_type,
                product_id,
                item_id
            `)
            .eq('id', order_id)
            .single();

        if (orderError || !order) {
            throw new Error('Order not found');
        }

        // Verify the user owns the product/course associated with this order
        let isOwner = false;
        if (order.item_type === 'product' && order.product_id) {
            const { data: product } = await supabase
                .from('products')
                .select('creator_id')
                .eq('id', order.product_id)
                .single();
            isOwner = product?.creator_id === user.id;
        } else if (order.item_type === 'course' && order.item_id) {
            const { data: course } = await supabase
                .from('courses')
                .select('creator_id')
                .eq('id', order.item_id)
                .single();
            isOwner = course?.creator_id === user.id;
        }

        // For refunding, we also allow the buyer to cancel if their order hasn't shipped, 
        // but right now this endpoint is specifically built for the creator cancellation flow.
        if (!isOwner) {
            // Check if they are the buyer
            const { data: buyerOrder } = await supabase
                .from('orders')
                .select('user_id')
                .eq('id', order_id)
                .single();
                
            if (buyerOrder?.user_id !== user.id) {
                throw new Error('Unauthorized: You do not have permission to refund this order');
            }
        }

        if (order.status === 'cancelled') {
            return new Response(
                JSON.stringify({ success: true, message: 'Order is already cancelled' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 4. Process Razorpay Refund if payment exists
        if (order.razorpay_payment_id) {
            const key_id = Deno.env.get('RAZORPAY_KEY_ID');
            const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET');

            if (!key_id || !key_secret) {
                console.error("Razorpay API keys missing in edge function secrets");
                throw new Error("Payment gateway configuration error");
            }

            const basicAuth = btoa(`${key_id}:${key_secret}`);

            console.log(`Processing refund for payment ${order.razorpay_payment_id} (Amount: ${order.amount})`);

            // Razorpay Refund API
            // Note: Amount should be in paise. If order.amount is in rupees, multiply by 100.
            const refundAmountPaise = Math.round(Number(order.amount) * 100);

            const refundRes = await fetch(`https://api.razorpay.com/v1/payments/${order.razorpay_payment_id}/refund`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${basicAuth}`
                },
                body: JSON.stringify({
                    amount: refundAmountPaise,
                    speed: 'normal'
                })
            });

            const refundData = await refundRes.json();

            // If it failed and isn't because it was already fully refunded
            if (!refundRes.ok && refundData.error?.code !== 'BAD_REQUEST_ERROR' && !refundData.error?.description?.includes('has been fully refunded')) {
                console.error("Razorpay refund failed:", refundData);
                throw new Error(`Refund failed: ${refundData.error?.description || 'Unknown error from payment gateway'}`);
            }
            
            console.log("Razorpay refund successful or already refunded:", refundData.id || "Already refunded");
        }

        // 4.5. Cancel Shiprocket Order if it's a physical product and has shipments
        if (order.item_type === 'product') {
            const { data: shipments } = await supabase
                .from('shipments')
                .select('shiprocket_order_id')
                .eq('order_id', order_id)
                .single();

            if (shipments?.shiprocket_order_id) {
                console.log(`Cancelling Shiprocket order: ${shipments.shiprocket_order_id}`);
                const srEmail = Deno.env.get("SHIPROCKET_EMAIL");
                const srPassword = Deno.env.get("SHIPROCKET_PASSWORD");

                if (srEmail && srPassword) {
                    try {
                        // 1. Get Shiprocket Token
                        const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email: srEmail, password: srPassword }),
                        });

                        if (authRes.ok) {
                            const authData = await authRes.json();
                            const srToken = authData.token;

                            // 2. Cancel Order
                            const cancelRes = await fetch("https://apiv2.shiprocket.in/v1/external/orders/cancel", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${srToken}`
                                },
                                body: JSON.stringify({ ids: [parseInt(shipments.shiprocket_order_id)] })
                            });

                            const cancelData = await cancelRes.json();
                            console.log("Shiprocket cancel response:", cancelData);
                        } else {
                            console.error("Failed to authenticate with Shiprocket during cancellation");
                        }
                    } catch (srErr) {
                        console.error("Shiprocket cancellation error:", srErr);
                        // We log the error but don't fail the whole refund process if SR fails
                    }
                }
            }
        }

        // 5. Update Database Status to Cancelled
        const { error: updateError } = await supabase
            .from('orders')
            .update({ 
                status: 'cancelled',
                shipment_status: 'cancelled' 
            })
            .eq('id', order_id);

        if (updateError) {
            console.error("Failed to update order status in DB:", updateError);
            throw new Error('Refund processed but failed to update order status');
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Refund processed successfully and order cancelled' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('Refund Error:', err);
        return new Response(
            JSON.stringify({ error: err.message || 'Internal server error processing refund', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
