import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  const isSubmitting = useState(false)[0]; // We use a ref actually but keeping state for UI
  const isSubmittingRef = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
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
    // Check if user is already logged in, but skip redirect for PASSWORD_RECOVERY sessions
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        // User clicked a reset link — don't redirect, let ResetPassword page handle it
        return;
      }
      if (event === "SIGNED_IN" && session && !isSubmittingRef.current) {
        // Only auto-redirect if NOT in the middle of a manual handleSubmit login
        navigate("/dashboard");
      }
    });

    // Also handle initial page load (session already exists)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Check if it's a recovery session by looking at the URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const type = hashParams.get("type");
        if (type === "recovery") {
          // It's a password reset flow — redirect to reset page
          navigate("/reset-password");
          return;
        }
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
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

        isSubmittingRef.current = true;
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

        if (error) {
          isSubmittingRef.current = false;
          throw error;
        }

        toast.success("Account created! Please check your email to verify.");
        setTimeout(() => {
          isSubmittingRef.current = false;
          navigate("/dashboard");
        }, 100);
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

        isSubmittingRef.current = true;
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: validation.data.email,
          password: validation.data.password,
        });

        if (error) {
          isSubmittingRef.current = false;
          throw error;
        }

        // ── Check if user is suspended or banned ──────────────────────────
        const { data: profile } = await supabase
          .from("profiles")
          .select("status, suspended_until")
          .eq("id", authData.user.id)
          .single();

        if (profile?.status === "banned") {
          await supabase.auth.signOut();
          toast.error("Your account has been banned. Contact support for help.", { duration: 8000 });
          setLoading(false);
          return;
        }

        if (profile?.status === "suspended") {
          const until = profile.suspended_until ? new Date(profile.suspended_until) : null;
          if (until && until > new Date()) {
            await supabase.auth.signOut();
            toast.error(
              `Your account is suspended until ${until.toLocaleDateString()}. Contact support.`,
              { duration: 8000 }
            );
            setLoading(false);
            return;
          }
        }

        // Write a unique session token so only this device stays as the active session.
        // When a second login happens, this token is overwritten, and the first device
        // gets kicked out by useSessionMonitor within 30 seconds.
        const sessionToken = crypto.randomUUID();
        localStorage.setItem("ch_session_token", sessionToken);
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            active_session_id: sessionToken,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", authData.user.id);

        if (updateError) {
          console.error("Failed to update active session ID:", updateError);
          // We continue anyway, but it's good to log
        }

        toast.success("Welcome back!");
        // Small buffer to ensure LocalStorage and DB are "settled" before Dashboard mounts
        setTimeout(() => {
          isSubmittingRef.current = false;
          navigate("/dashboard");
        }, 100);
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Navbar showCart={false} />
      <div className="container mx-auto px-4 pt-32 pb-20">
        <Card className="max-w-md mx-auto shadow-hover">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              {isForgotPassword ? "Reset Password" : isSignup ? "Join Manch360" : "Welcome Back"}
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
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
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