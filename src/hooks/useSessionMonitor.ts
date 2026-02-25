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

                // If no local token, establish one this device
                if (!localToken) {
                    const newToken = crypto.randomUUID();
                    localStorage.setItem("ch_session_token", newToken);
                    await supabase
                        .from("profiles")
                        .update({
                            active_session_id: newToken,
                            last_activity_at: new Date().toISOString(),
                        })
                        .eq("id", session.user.id);
                    isCheckingRef.current = false;
                    return;
                }

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
                    await supabase.auth.signOut();
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
                    await supabase.auth.signOut();
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
