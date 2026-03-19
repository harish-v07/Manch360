import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Enforces one active session per user AND kicks out suspended/banned users.
 * Polls every 30 seconds.
 */
export function useSessionMonitor() {
    const navigate = useNavigate();
    const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isCheckingRef = useRef(false);

    useEffect(() => {
        const validateSession = async () => {
            if (isCheckingRef.current) return;
            isCheckingRef.current = true;

            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();

                if (!session) {
                    isCheckingRef.current = false;
                    return;
                }

                const localToken = localStorage.getItem("ch_session_token");

                // Fetch profile — session token + status
                const { data: profile, error: profileError } = await supabase
                    .from("profiles")
                    .select("active_session_id, status, suspended_until")
                    .eq("id", session.user.id)
                    .single();

                if (profileError) {
                    console.error("Session monitor: failed to fetch profile:", profileError.message);
                    isCheckingRef.current = false;
                    return;
                }

                // If no local token, ADOPT whatever the DB has (written by Auth.tsx at login).
                // Do NOT generate a new token and overwrite — that would kick out the very browser
                // that just logged in (race condition).
                if (!localToken) {
                    console.log("Session monitor: No local token found. This might be a fresh login or cleared storage. Checking DB...");
                    if (profile?.active_session_id) {
                        // Wait a bit longer to ensure Auth.tsx has finished its work and DB has settled
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // Re-fetch to be absolutely sure after delay
                        const { data: freshProfile } = await supabase
                            .from("profiles")
                            .select("active_session_id")
                            .eq("id", session.user.id)
                            .single();
                        
                        if (freshProfile?.active_session_id) {
                            console.log("Session monitor: Adopting active session ID from DB:", freshProfile.active_session_id);
                            localStorage.setItem("ch_session_token", freshProfile.active_session_id);
                        }
                    } else {
                        // No token anywhere — establish one fresh (e.g. user existed before this feature)
                        console.log("Session monitor: No token anywhere, establishing fresh one.");
                        const newToken = crypto.randomUUID();
                        localStorage.setItem("ch_session_token", newToken);
                        await supabase
                            .from("profiles")
                            .update({
                                active_session_id: newToken,
                                last_activity_at: new Date().toISOString(),
                            })
                            .eq("id", session.user.id);
                    }
                    isCheckingRef.current = false;
                    return;
                }

                // ── Check suspend/ban ──────────────────────────────────────
                if (profile?.status === "banned") {
                    if (checkIntervalRef.current) {
                        clearInterval(checkIntervalRef.current);
                        checkIntervalRef.current = null;
                    }
                    localStorage.removeItem("ch_session_token");
                    await supabase.auth.signOut();
                    toast.error("Your account has been banned. Contact support for help.", { duration: 8000 });
                    navigate("/auth");
                    return;
                }

                if (profile?.status === "suspended") {
                    const until = profile.suspended_until ? new Date(profile.suspended_until) : null;
                    if (until && until > new Date()) {
                        if (checkIntervalRef.current) {
                            clearInterval(checkIntervalRef.current);
                            checkIntervalRef.current = null;
                        }
                        localStorage.removeItem("ch_session_token");
                        await supabase.auth.signOut();
                        toast.error(
                            `Your account is suspended until ${until.toLocaleDateString()}. Contact support for help.`,
                            { duration: 8000 }
                        );
                        navigate("/auth");
                        return;
                    }
                }

                // ── Check single-session token mismatch ────────────────────
                // If active_session_id is null, admin kicked the token — force logout
                if (!profile?.active_session_id) {
                    if (checkIntervalRef.current) {
                        clearInterval(checkIntervalRef.current);
                        checkIntervalRef.current = null;
                    }
                    localStorage.removeItem("ch_session_token");
                    // scope:'local' — only clear THIS browser's session, not all devices
                    await supabase.auth.signOut({ scope: "local" });
                    toast.error("Your session was ended by an administrator.", { duration: 6000 });
                    navigate("/auth");
                    return;
                }

                if (profile.active_session_id !== localToken) {
                    if (checkIntervalRef.current) {
                        clearInterval(checkIntervalRef.current);
                        checkIntervalRef.current = null;
                    }
                    localStorage.removeItem("ch_session_token");
                    // scope:'local' — only clear THIS browser's session.
                    // If we used global, it would also kill the new session on the other device!
                    await supabase.auth.signOut({ scope: "local" });
                    toast.error(
                        "You have been logged out because you signed in from another device.",
                        { duration: 6000 }
                    );
                    navigate("/auth");
                }
            } catch (err) {
                console.error("Session monitor error:", err);
            } finally {
                isCheckingRef.current = false;
            }
        };

        validateSession();
        checkIntervalRef.current = setInterval(validateSession, 30000);

        return () => {
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
        };
    }, [navigate]);
}
