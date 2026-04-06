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

        // 3. Fetch Order Details
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
                id,
                amount,
                status,
                shipment_status,
                delivery_address,
                item_type,
                product_id,
                created_at,
                profiles!orders_user_id_fkey (
                    name,
                    email
                ),
                products (
                    name,
                    creator_id,
                    price,
                    description,
                    weight
                )
            `)
            .eq('id', order_id)
            .single();

        if (orderError || !order) {
            throw new Error(`Order not found: ${orderError ? JSON.stringify(orderError) : 'No data returned'}`);
        }

        // Validate Physical Product
        if (order.item_type !== 'product' || !order.products) {
            throw new Error('Only physical products can be shipped via Shiprocket');
        }

        // Verify the user owns the product
        if (order.products.creator_id !== user.id) {
            throw new Error('Unauthorized: You do not have permission to ship this order');
        }

        if (order.shipment_status === 'shipped' || order.shipment_status === 'delivered') {
            throw new Error('Order has already been shipped');
        }

        if (order.shipment_status === 'cancelled' || order.status === 'cancelled') {
            throw new Error('Cannot ship a cancelled order');
        }

        // 4. Fetch Creator's Pickup Address from Profiles
        const { data: creatorProfile, error: creatorError } = await supabase
            .from('profiles')
            .select('pickup_name')
            .eq('id', user.id)
            .single();

        if (creatorError || !creatorProfile?.pickup_name) {
            throw new Error('You must register a pickup address in the Shipping tab first.');
        }

        const pickupLocation = creatorProfile.pickup_name;

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

        // 6. Map Order to Shiprocket Payload
        const deliveryAddress = order.delivery_address as any;
        const buyer = order.profiles as any;

        // Shiprocket requires first and last name
        const nameParts = (deliveryAddress.fullName || buyer.name || "Customer").split(" ");
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

        const srOrderPayload = {
            order_id: `CHR-${order.id.substring(0, 8).toUpperCase()}-${Date.now().toString().substring(8)}`, // Unique custom order ID
            order_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
            pickup_location: pickupLocation, // Has to match exact nickname created in SR
            billing_customer_name: firstName,
            billing_last_name: lastName,
            billing_address: deliveryAddress.addressLine,
            billing_address_2: "",
            billing_city: deliveryAddress.city,
            billing_pincode: deliveryAddress.pincode,
            billing_state: deliveryAddress.state,
            billing_country: "India",
            billing_email: buyer.email || "buyer@creatorhub.com",
            billing_phone: deliveryAddress.phone || buyer.phone || "9999999999",
            shipping_is_billing: true,
            order_items: [
                {
                    name: order.products.name,
                    sku: `SKU-${order.product_id?.substring(0, 6).toUpperCase()}`,
                    units: 1,
                    selling_price: order.amount,
                    discount: 0,
                    tax: 0,
                    hsn: "441110" // Generic HSN
                }
            ],
            payment_method: "Prepaid",
            sub_total: order.amount,
            length: 10,
            breadth: 10,
            height: 10,
            weight: order.products.weight || 0.5 
        };

        console.log("Creating Shiprocket Order with payload:", srOrderPayload);

        // 7. Create Order & Generate AWB in Shiprocket
        const createRes = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${srToken}`
            },
            body: JSON.stringify(srOrderPayload)
        });

        const srData = await createRes.json();

        if (!createRes.ok || !srData.order_id) {
            console.error('Shiprocket order creation failed:', srData);
            throw new Error(srData.message || 'Failed to create shipment in Shiprocket');
        }

        // 8. Save Shipment to Supabase
        const { error: insertError } = await supabase
            .from('shipments')
            .insert({
                order_id: order.id,
                shiprocket_order_id: srData.order_id.toString(),
                shiprocket_shipment_id: srData.shipment_id.toString(),
                awb_code: srData.awb_code || null,
                courier_name: srData.courier_name || null,
            });

        if (insertError) {
            console.error("Failed to insert shipment record:", insertError);
            throw new Error(`Shipment created in Shiprocket but failed to save locally: ${JSON.stringify(insertError)}`);
        }

        // 9. Update Order Shipment Status
        const newShipmentStatus = srData.awb_code ? 'shipped' : 'processing';
        const { error: updateError } = await supabase
            .from('orders')
            .update({ shipment_status: newShipmentStatus })
            .eq('id', order.id);

        if (updateError) {
            console.error("Failed to update order status:", updateError);
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: 'Shipment created successfully',
                awb_code: srData.awb_code,
                courier: srData.courier_name
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
