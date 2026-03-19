import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "./ui/button";
import { User, LogOut, Shield, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { ThemeToggle } from "./ThemeToggle";
import { Cart } from "./Cart";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isResetPasswordPage = location.pathname === "/reset-password";
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkAdminRole(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkAdminRole(session.user.id);
      } else {
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    setIsAdmin(data?.role === "admin");
  };

  const handleLogout = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from("profiles")
        .update({ active_session_id: null })
        .eq("id", session.user.id);
    }
    localStorage.removeItem("ch_session_token");
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/70 backdrop-blur-md border-b border-border/40 transition-all duration-300">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-2xl font-black tracking-tighter text-foreground hover:opacity-80 transition-opacity">
            Manch360
          </Link>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden md:flex items-center gap-1 mr-2">
              <Link to="/explore">
                <Button variant="ghost" className="font-semibold text-sm">Explore</Button>
              </Link>
            </div>
            
            <ThemeToggle />
            <Cart />
            
            {session && !isResetPasswordPage ? (
              <div className="flex items-center gap-2">
                <Link to="/my-orders" className="hidden sm:block">
                  <Button variant="ghost" className="font-semibold">
                    My Orders
                  </Button>
                </Link>
                <Link to="/dashboard" className="hidden sm:block">
                  <Button variant="ghost" className="font-semibold">
                    Dashboard
                  </Button>
                </Link>
                {isAdmin && (
                  <Link to="/dashboard?tab=admin" className="hidden lg:block">
                    <Button variant="ghost" className="text-accent hover:text-accent hover:bg-accent/10 font-bold">
                      Admin
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="font-semibold text-sm hidden sm:flex"
                  onClick={async () => {
                    if (isResetPasswordPage) await supabase.auth.signOut();
                    navigate("/auth");
                  }}
                >
                  Sign In
                </Button>
                <Button
                  variant="default"
                  className="rounded-full px-6 font-bold shadow-lg shadow-primary/20"
                  onClick={async () => {
                    if (isResetPasswordPage) await supabase.auth.signOut();
                    navigate("/auth?mode=signup");
                  }}
                >
                  Join
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};