import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LearnerSidebar } from "./LearnerSidebar";
import LearnerOrdersManager from "./LearnerOrdersManager";
import ExploreInline from "./ExploreInline";
import LearnerCartInline from "./LearnerCartInline";
import CoursePreviewInline from "./CoursePreviewInline";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import LearnerSettings from "./LearnerSettings";
import AdminDashboardInline from "./AdminDashboardInline";

import CreatorStorefrontInline from "./CreatorStorefrontInline";

interface LearnerDashboardProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin?: boolean;
  viewId?: string | null;
  onViewIdChange?: (id: string | null) => void;
  tabClickCounter?: number;
}

export default function LearnerDashboard({ activeTab, onTabChange, isAdmin, viewId, onViewIdChange, tabClickCounter }: LearnerDashboardProps) {
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingCourseId, setViewingCourseIdInternal] = useState<string | null>(
    activeTab === "dashboard" && viewId ? viewId : null
  );
  const [viewingStorefrontId, setViewingStorefrontIdInternal] = useState<string | null>(
    activeTab === "explore" && viewId ? viewId : null
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previousTab, setPreviousTab] = useState("dashboard");

  const setViewingCourseId = (id: string | null) => {
    setViewingCourseIdInternal(id);
    onViewIdChange?.(id);
  };

  const setViewingStorefrontId = (id: string | null) => {
    setViewingStorefrontIdInternal(id);
    onViewIdChange?.(id);
  };

  useEffect(() => {
    fetchEnrollments();

    // Listen for cross-tab navigation events from child components
    const handleTabChange = (e: any) => {
      if (e.detail) onTabChange(e.detail);
    };
    window.addEventListener('changeTab', handleTabChange);
    return () => window.removeEventListener('changeTab', handleTabChange);
  }, [onTabChange]);

  // Handle Settings Overlay Logic
  useEffect(() => {
    if (activeTab === "profile") {
      setIsSettingsOpen(true);
    } else {
      setPreviousTab(activeTab);
      setIsSettingsOpen(false);
    }
  }, [activeTab]);

  // Clear previews when user clicks a sidebar tab
  useEffect(() => {
    if (tabClickCounter && tabClickCounter > 0) {
      setViewingCourseIdInternal(null);
      setViewingStorefrontIdInternal(null);
    }
  }, [tabClickCounter]);

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    onTabChange(previousTab);
  };

  const fetchEnrollments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          *,
          courses (*)
        `)
        .eq("user_id", user.id);

      if (error) throw error;
      setEnrollments(data || []);
    } catch (error) {
      console.error("Error fetching enrollments:", error);
      toast.error("Failed to load your courses");
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    const displayTab = activeTab === "profile" ? previousTab : activeTab;

    switch (displayTab) {
      case "dashboard":
        if (viewingCourseId) {
          return <CoursePreviewInline courseId={viewingCourseId} onBack={() => setViewingCourseId(null)} />;
        }
        return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-black dark:text-white tracking-tight">My Learning</h1>
                <p className="text-muted-foreground font-medium mt-1">Pick up where you left off</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : enrollments.length === 0 ? (
              <Card className="shadow-soft border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl">
                <CardContent className="py-20 text-center">
                  <div className="w-20 h-20 bg-primary/5 dark:bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <BookOpen className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 dark:text-white">No courses yet</h3>
                  <p className="text-muted-foreground mb-8 max-w-sm mx-auto">You haven't enrolled in any courses yet. Start your journey today!</p>
                  <Button 
                    onClick={() => onTabChange("explore")}
                    className="rounded-2xl h-12 px-8 font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
                  >
                    Discover Courses
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {enrollments.map((enrollment) => (
                  <Card 
                    key={enrollment.id} 
                    className="group border-none shadow-soft hover:shadow-hover transition-all cursor-pointer rounded-3xl overflow-hidden bg-white dark:bg-zinc-900/40 backdrop-blur-sm hover:-translate-y-1"
                    onClick={() => setViewingCourseId(enrollment.courses?.id)}
                  >
                    <div className="aspect-video bg-gray-100 dark:bg-zinc-800 relative overflow-hidden">
                      {enrollment.courses?.thumbnail_url ? (
                        <img 
                          src={enrollment.courses.thumbnail_url} 
                          alt={enrollment.courses.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-primary/20">
                          <BookOpen className="w-12 h-12" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <span className="text-white font-bold text-sm">Continue Learning →</span>
                      </div>
                    </div>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 dark:bg-primary/10 px-2 py-0.5 rounded-full">
                          {enrollment.courses?.category || "General"}
                        </span>
                      </div>
                      <CardTitle className="text-lg font-bold line-clamp-1 group-hover:text-primary transition-colors">
                        {enrollment.courses?.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-60">
                            <span>Progress</span>
                            <span>{enrollment.progress || 0}%</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-primary h-full transition-all duration-1000"
                              style={{ width: `${enrollment.progress || 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      case "explore":
        if (viewingStorefrontId) {
          return <CreatorStorefrontInline creatorId={viewingStorefrontId} onBack={() => setViewingStorefrontId(null)} />;
        }
        return <ExploreInline onViewStorefront={(id) => setViewingStorefrontId(id)} />;
      case "cart":
        return <LearnerCartInline />;
      case "orders":
        return <LearnerOrdersManager />;
      case "admin":
        return <AdminDashboardInline />;
      default:
        return null;
    }
  };

  return (
    <>
      <LearnerSidebar activeTab={isSettingsOpen ? "profile" : activeTab} onTabChange={onTabChange} isAdmin={isAdmin} />
      <main className="flex-1 pl-16 h-screen overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto px-8 pt-12 pb-20">
          {renderContent()}
        </div>
      </main>

      <Dialog open={isSettingsOpen} onOpenChange={handleCloseSettings}>
        <DialogContent className="max-w-[1000px] w-[95vw] h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-3xl bg-transparent">
          <LearnerSettings onClose={handleCloseSettings} />
        </DialogContent>
      </Dialog>
    </>
  );
}