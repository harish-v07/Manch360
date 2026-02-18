import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) throw new Error("No authorization header");

        const token = authHeader.replace("Bearer ", "");

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) throw new Error("User not authenticated");

        const { bank_account_number, bank_ifsc_code, bank_account_name, pan, phone } = await req.json();

        if (!bank_account_number || !bank_ifsc_code || !bank_account_name || !pan) {
            throw new Error("Missing required fields");
        }

        const key_id = Deno.env.get("RAZORPAY_KEY_ID");
        const key_secret = Deno.env.get("RAZORPAY_KEY_SECRET");
        if (!key_id || !key_secret) throw new Error("Razorpay API keys not configured");

        const auth = btoa(`${key_id}:${key_secret}`);
        const rzpHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Basic ${auth}`,
        };

        // ─────────────────────────────────────────────────────────────
        // Check if user already has a linked account in their profile
        // If yes, skip account creation and go straight to bank details
        // ─────────────────────────────────────────────────────────────
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("razorpay_account_id")
            .eq("id", user.id)
            .single();

        let accountId = profile?.razorpay_account_id?.startsWith("acc_")
            ? profile.razorpay_account_id
            : null;

        if (accountId) {
            console.log("Reusing existing linked account:", accountId);
        } else {
            // ─────────────────────────────────────────────────────────────
            // STEP 1: Create Linked Account
            // Use a unique email with timestamp to avoid collision with
            // previous failed attempts that used the same email.
            // ─────────────────────────────────────────────────────────────
            const timestamp = Date.now();
            const uniqueEmail = `creator_${user.id.replace(/-/g, "").slice(0, 8)}_${timestamp}@noreply.creatorhub.app`;

            const accountPayload = {
                email: uniqueEmail,
                phone: phone || "9000000000",
                profile: {
                    category: "education",
                    subcategory: "elearning",
                    addresses: {
                        registered: {
                            street1: "123 Creator Street",
                            street2: "Floor 1",
                            city: "Mumbai",
                            state: "Maharashtra",
                            postal_code: "400001",
                            country: "IN"
                        }
                    }
                },
                legal_business_name: bank_account_name,
                business_type: "individual",
                contact_name: bank_account_name,
                type: "route",
            };

            console.log("STEP 1: Creating Razorpay Route Linked Account with email:", uniqueEmail);
            const accountResponse = await fetch("https://api.razorpay.com/v2/accounts", {
                method: "POST",
                headers: rzpHeaders,
                body: JSON.stringify(accountPayload),
            });

            const accountData = await accountResponse.json();
            console.log("Account creation response:", accountResponse.status, JSON.stringify(accountData));

            if (!accountResponse.ok) {
                throw new Error(`Account creation failed: ${accountData.error?.description || JSON.stringify(accountData)}`);
            }

            accountId = accountData.id;
            console.log("Linked Account created:", accountId);

            // Save acc_ ID immediately so retries can reuse it
            await supabaseAdmin
                .from("profiles")
                .update({ razorpay_account_id: accountId })
                .eq("id", user.id);
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 2: Request the "route" product for this account
        // (Safe to call even if already requested — Razorpay is idempotent)
        // ─────────────────────────────────────────────────────────────
        console.log("STEP 2: Requesting Route product for account:", accountId);
        const productResponse = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}/products`, {
            method: "POST",
            headers: rzpHeaders,
            body: JSON.stringify({ product_name: "route" }),
        });

        const productData = await productResponse.json();
        console.log("Product request response:", productResponse.status, JSON.stringify(productData));

        // If product already exists, fetch it instead
        let productId = productData.id;
        if (!productResponse.ok) {
            if (productData.error?.description?.includes("already")) {
                // Product already requested — fetch existing product ID
                console.log("Product already exists, fetching product list...");
                const listResp = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}/products`, {
                    method: "GET",
                    headers: rzpHeaders,
                });
                const listData = await listResp.json();
                console.log("Product list:", JSON.stringify(listData));
                productId = listData.items?.[0]?.id || listData[0]?.id;
                if (!productId) throw new Error(`Product request failed: ${productData.error?.description}`);
            } else {
                throw new Error(`Product request failed: ${productData.error?.description || JSON.stringify(productData)}`);
            }
        }

        console.log("Route product ID:", productId);

        // ─────────────────────────────────────────────────────────────
        // STEP 3: PATCH the product with bank/settlement details
        // ─────────────────────────────────────────────────────────────
        const settlementPayload = {
            settlements: {
                account_number: bank_account_number,
                ifsc_code: bank_ifsc_code,
                beneficiary_name: bank_account_name,
            },
            tnc_accepted: true,
        };

        console.log("STEP 3: Adding bank/settlement details...");
        const settlementResponse = await fetch(
            `https://api.razorpay.com/v2/accounts/${accountId}/products/${productId}`,
            {
                method: "PATCH",
                headers: rzpHeaders,
                body: JSON.stringify(settlementPayload),
            }
        );

        const settlementData = await settlementResponse.json();
        console.log("Settlement response:", settlementResponse.status, JSON.stringify(settlementData));

        if (!settlementResponse.ok) {
            throw new Error(`Settlement update failed: ${settlementData.error?.description || JSON.stringify(settlementData)}`);
        }

        console.log("Bank details added successfully to account:", accountId);

        // ─────────────────────────────────────────────────────────────
        // STEP 4: Submit stakeholder details to trigger KYC activation
        // This automates the "check the box" consent form in the dashboard
        // ─────────────────────────────────────────────────────────────
        const stakeholderPayload = {
            name: bank_account_name,
            email: user.email || `creator_${user.id.slice(0, 8)}@noreply.creatorhub.app`,
            relationship: {
                director: true,
            },
            phone: {
                primary: phone || "9000000000",
            },
            addresses: {
                residential: {
                    street: "123 Creator Street",
                    city: "Mumbai",
                    state: "Maharashtra",
                    postal_code: "400001",
                    country: "IN",
                },
            },
            kyc: {
                pan: pan,
            },
        };

        console.log("STEP 4: Submitting stakeholder details for KYC activation...");
        const stakeholderResponse = await fetch(
            `https://api.razorpay.com/v2/accounts/${accountId}/stakeholders`,
            {
                method: "POST",
                headers: rzpHeaders,
                body: JSON.stringify(stakeholderPayload),
            }
        );

        const stakeholderData = await stakeholderResponse.json();
        console.log("Stakeholder response:", stakeholderResponse.status, JSON.stringify(stakeholderData));

        if (!stakeholderResponse.ok) {
            // Non-fatal: log the error but don't fail the whole flow
            // The account is still created and bank details are saved
            console.error("Stakeholder submission failed (non-fatal):", stakeholderData.error?.description);
        } else {
            console.log("Stakeholder submitted successfully. KYC verification initiated.");
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 5: Save all details to the creator's profile
        // ─────────────────────────────────────────────────────────────
        const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({
                razorpay_account_id: accountId,
                bank_account_number: bank_account_number.slice(-4),
                bank_ifsc_code: bank_ifsc_code,
                bank_account_name: bank_account_name,
                pan_card_number: pan,
                payment_details_verified: true,
                payment_details_added_at: new Date().toISOString(),
            })
            .eq("id", user.id);

        if (updateError) {
            console.error("Database update error:", updateError);
            throw new Error("Failed to update profile");
        }

        console.log("Profile updated with Route account:", accountId);

        return new Response(
            JSON.stringify({
                success: true,
                account_id: accountId,
                message: "Payment details added successfully. Razorpay will verify your bank account shortly.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );

    } catch (error) {
        console.error("Error in create-linked-account:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }
});
