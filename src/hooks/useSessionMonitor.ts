import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Custom hook to monitor session validity and auto-logout on session invalidation
 * Checks every 30 seconds if the current session is still the active session
 */
export function useSessionMonitor() {
    const navigate = useNavigate();
    const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isCheckingRef = useRef(false);

    useEffect(() => {
        const validateSession = async () => {
            // Prevent concurrent checks
            if (isCheckingRef.current) return;
            isCheckingRef.current = true;

            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();

                if (!session) {
                    // No session, user is already logged out
                    isCheckingRef.current = false;
                    return;
                }

                // Call the validate-session Edge Function
                const { data, error } = await supabase.functions.invoke(
                    "validate-session",
                    {
                        headers: {
                            Authorization: `Bearer ${session.access_token}`,
                        },
                    }
                );

                if (error) {
                    console.error("Session validation error:", error);
                    isCheckingRef.current = false;
                    return;
                }

                // If session is invalid, logout the user
                if (!data.valid) {
                    // Clear the interval
                    if (checkIntervalRef.current) {
                        clearInterval(checkIntervalRef.current);
                        checkIntervalRef.current = null;
                    }

                    // Sign out the user
                    await supabase.auth.signOut();

                    // Show notification
                    toast.error(
                        data.message || "You have been logged out because you logged in from another device.",
                        { duration: 5000 }
                    );

                    // Redirect to auth page
                    navigate("/auth");
                }
            } catch (error) {
                console.error("Error validating session:", error);
            } finally {
                isCheckingRef.current = false;
            }
        };

        // Start the interval to check session validity every 30 seconds
        checkIntervalRef.current = setInterval(validateSession, 30000);

        // Run initial check
        validateSession();

        // Cleanup on unmount
        return () => {
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
        };
    }, [navigate]);
}
