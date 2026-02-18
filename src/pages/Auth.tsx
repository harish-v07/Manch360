import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { signUpSchema, signInSchema, forgotPasswordSchema } from "@/lib/validation";


export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSignup, setIsSignup] = useState(searchParams.get("mode") === "signup");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "learner" as "creator" | "learner",
  });

  useEffect(() => {
    // Sync state with URL params
    const mode = searchParams.get("mode");
    if (mode === "signup") {
      setIsSignup(true);
      setIsForgotPassword(false);
    } else {
      setIsSignup(false);
    }
  }, [searchParams]);

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);



  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validation = forgotPasswordSchema.safeParse({ email: formData.email });
      if (!validation.success) {
        toast.error(validation.error.issues[0].message);
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(validation.data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast.success("Password reset link sent! Check your email.");
      setIsForgotPassword(false);
      setFormData({ ...formData, email: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignup) {
        // Validate signup data
        const validation = signUpSchema.safeParse(formData);
        if (!validation.success) {
          toast.error(validation.error.issues[0].message);
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: validation.data.email,
          password: validation.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              name: validation.data.name,
              role: validation.data.role,
            },
          },
        });

        if (error) throw error;

        toast.success("Account created! Please check your email to verify.");
        navigate("/dashboard");
      } else {
        // Validate signin data
        const validation = signInSchema.safeParse({
          email: formData.email,
          password: formData.password,
        });
        if (!validation.success) {
          toast.error(validation.error.issues[0].message);
          setLoading(false);
          return;
        }

        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: validation.data.email,
          password: validation.data.password,
        });

        if (error) throw error;

        // Store session information in the database
        if (authData.session) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({
              active_session_id: authData.session.access_token.substring(0, 50),
              session_created_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString(),
            })
            .eq("id", authData.user.id);

          if (updateError) {
            console.error("Failed to update session info:", updateError);
          }
        }

        toast.success("Welcome back!");
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
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
              {isForgotPassword ? "Reset Password" : isSignup ? "Join CreatorHub" : "Welcome Back"}
            </CardTitle>
            <CardDescription className="text-center">
              {isForgotPassword ? "Enter your email to receive a password reset link" : isSignup ? "Start your creative journey today" : "Sign in to your account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit} className="space-y-4">
              {!isForgotPassword && isSignup && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">I am a...</Label>
                    <Select value={formData.role} onValueChange={(value: "creator" | "learner") => setFormData({ ...formData, role: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="learner">Learner</SelectItem>
                        <SelectItem value="creator">Creator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              {!isForgotPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Processing..." : isForgotPassword ? "Send Reset Link" : isSignup ? "Sign Up" : "Sign In"}
              </Button>

              {!isForgotPassword && !isSignup && (
                <div className="text-center text-sm">
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <div className="text-center text-sm">
                {isForgotPassword ? (
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(false)}
                    className="text-primary hover:underline"
                  >
                    Back to sign in
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSignup(!isSignup)}
                    className="text-primary hover:underline"
                  >
                    {isSignup ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
                  </button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}