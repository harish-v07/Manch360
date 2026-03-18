import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Navbar } from "@/components/Navbar";
import CreatorDashboard from "@/components/dashboard/CreatorDashboard";
import LearnerDashboard from "@/components/dashboard/LearnerDashboard";
import { useSessionMonitor } from "@/hooks/useSessionMonitor";

export default function Dashboard() {
  useSessionMonitor();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      } else {
        fetchUserRole(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      } else {
        fetchUserRole(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error fetching user role:", error);
      setLoading(false);
      return;
    }

    setUserRole(data?.role || "learner");
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-primary/20 rounded-full"></div>
          <div className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
        <div className="mt-8 text-center animate-pulse">
          <p className="text-xl font-black tracking-tight dark:text-white">MANCH360</p>
          <p className="text-sm text-muted-foreground mt-2 font-medium">Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  if (userRole === "creator") {
    return (
      <div className="min-h-screen bg-background flex overflow-hidden">
        <CreatorDashboard activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-20">
        <LearnerDashboard />
      </div>
    </div>
  );
}