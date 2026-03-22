import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Authenticate with Shiprocket and return a bearer token
async function getShiprocketToken(): Promise<string> {
    const email = Deno.env.get("SHIPROCKET_EMAIL");
    const password = Deno.env.get("SHIPROCKET_PASSWORD");

    if (!email || !password) {
        throw new Error("Shiprocket credentials not configured");
    }

    const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shiprocket auth failed: ${text}`);
    }

    const data = await res.json();
    if (!data.token) throw new Error("No token in Shiprocket auth response");
    return data.token;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Authenticate the calling user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // Use anon client to verify user identity
        const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Service client for DB writes
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Parse pickup address from request
        const { contactName, phone, address, city, state, pincode } = await req.json();

        if (!contactName || !phone || !address || !city || !state || !pincode) {
            return new Response(JSON.stringify({ error: "All pickup address fields are required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Get user profile to make a unique pickup_name
        const { data: profile } = await supabase
            .from("profiles")
            .select("id, name, email")
            .eq("id", user.id)
            .single();

        if (!profile) {
            return new Response(JSON.stringify({ error: "Profile not found" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Generate a clean pickup location name from the seller's contact name
        const cleanName = contactName.replace(/[^a-zA-Z0-9_ ]/g, '').trim().replace(/\s+/g, '_').substring(0, 30);
        const pickupName = cleanName || `seller_${user.id.substring(0, 8)}`;

        // Authorize with Shiprocket
        const token = await getShiprocketToken();

        // Register pickup address in Shiprocket
        const pickupPayload = {
            pickup_location: pickupName,
            name: contactName,
            email: profile.email,
            phone: phone,
            address: address,
            address_2: "",
            city: city,
            state: state,
            country: "India",
            pin_code: pincode,
        };

        const srRes = await fetch(
            "https://apiv2.shiprocket.in/v1/external/settings/company/addpickup",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(pickupPayload),
            }
        );

        const srData = await srRes.json();

        // If Shiprocket returns success or address already exists, we treat it as OK
        const isSuccess = srRes.ok || srData?.status === 200 ||
            (srData?.message && srData.message.toLowerCase().includes("already"));

        if (!isSuccess) {
            console.error("Shiprocket pickup registration error:", srData);
            return new Response(
                JSON.stringify({ error: srData?.message || "Failed to register pickup with Shiprocket" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Save pickup info in the seller's profile
        const { error: updateError } = await supabase
            .from("profiles")
            .update({
                pickup_name: pickupName,
                pickup_address: { contactName, phone, address, city, state, pincode },
                pickup_registered: true,
            })
            .eq("id", user.id);

        if (updateError) {
            console.error("Profile update error:", updateError);
            return new Response(JSON.stringify({ error: "Failed to save pickup address" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(
            JSON.stringify({ success: true, pickup_name: pickupName }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        console.error("register-pickup error:", err);
        return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
