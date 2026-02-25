import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Enforces one active session per user.
 * On login, Auth.tsx writes a UUID token to localStorage ("ch_session_token")
 * and to profiles.active_session_id. This hook polls every 30 seconds and
 * compares the local token against the DB value. If they differ (another
 * device logged in), this session is signed out automatically.
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

                // If no local token (e.g. session predates this feature), establish one
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

                // Fetch the active session token from DB
                const { data: profile, error: profileError } = await supabase
                    .from("profiles")
                    .select("active_session_id")
                    .eq("id", session.user.id)
                    .single();

                if (profileError) {
                    console.error("Session monitor: failed to fetch profile:", profileError.message);
                    isCheckingRef.current = false;
                    return;
                }

                // Token mismatch → another device just logged in, kick this one out
                if (profile?.active_session_id && profile.active_session_id !== localToken) {
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
