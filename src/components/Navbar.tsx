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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Manch360
          </Link>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Cart />
            {session && !isResetPasswordPage ? (
              <>
                <Link to="/explore">
                  <Button variant="ghost">Explore</Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="ghost">
                    <User className="mr-2 h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
                <Link to="/my-orders">
                  <Button variant="ghost">
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    My Orders
                  </Button>
                </Link>
                {isAdmin && (
                  <Link to="/admin">
                    <Button variant="ghost" className="text-purple-500 hover:text-purple-600 hover:bg-purple-500/10">
                      <Shield className="mr-2 h-4 w-4" />
                      Admin
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/explore">
                  <Button variant="ghost">Explore</Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (isResetPasswordPage) await supabase.auth.signOut();
                    navigate("/auth");
                  }}
                >
                  Sign In
                </Button>
                <Button
                  variant="default"
                  onClick={async () => {
                    if (isResetPasswordPage) await supabase.auth.signOut();
                    navigate("/auth?mode=signup");
                  }}
                >
                  Join
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};