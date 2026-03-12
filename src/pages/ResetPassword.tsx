import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { resetPasswordSchema } from "@/lib/validation";

export default function ResetPassword() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        password: "",
        confirmPassword: "",
    });

    useEffect(() => {
        // Listen for PASSWORD_RECOVERY event - this fires when user clicks the reset link
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "PASSWORD_RECOVERY") {
                // Valid reset session — stay on this page
                return;
            }
        });

        // Also check if there's any session at all (in case page is loaded after event fired)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                toast.error("Invalid or expired reset link");
                navigate("/auth");
            }
        });

        return () => subscription.unsubscribe();
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Validate password data
            const validation = resetPasswordSchema.safeParse(formData);
            if (!validation.success) {
                toast.error(validation.error.issues[0].message);
                setLoading(false);
                return;
            }

            // Update the user's password
            const { error } = await supabase.auth.updateUser({
                password: validation.data.password,
            });

            if (error) throw error;

            toast.success("Password updated successfully!");

            // Sign out and redirect to login
            await supabase.auth.signOut();
            navigate("/auth");
        } catch (error: any) {
            toast.error(error.message || "Failed to reset password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-hero">
            <Navbar />
            <div className="container mx-auto px-4 pt-32 pb-20">
                <Card className="max-w-md mx-auto shadow-hover">
                    <CardHeader>
                        <CardTitle className="text-2xl text-center">
                            Set New Password
                        </CardTitle>
                        <CardDescription className="text-center">
                            Enter your new password below
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">New Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    required
                                    minLength={8}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Must be at least 8 characters
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="••••••••"
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    required
                                    minLength={8}
                                />
                            </div>

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Updating..." : "Reset Password"}
                            </Button>

                            <div className="text-center text-sm">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await supabase.auth.signOut();
                                        navigate("/auth");
                                    }}
                                    className="text-primary hover:underline"
                                >
                                    Back to sign in
                                </button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
