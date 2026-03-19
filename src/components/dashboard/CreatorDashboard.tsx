import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  Package, 
  IndianRupee, 
  Share2, 
  Copy, 
  Check, 
  TrendingUp,
  Users,
  LayoutDashboard,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CoursesManager from "./CoursesManager";
import ProductsManager from "./ProductsManager";
import EarningsManager from "./EarningsManager";
import { CreatorSidebar } from "./CreatorSidebar";
import CreatorSettings from "./CreatorSettings";
import ExploreInline from "./ExploreInline";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import CreatorOrdersManager from "./CreatorOrdersManager";
import AdminDashboardInline from "./AdminDashboardInline";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import CoursePreviewInline from "./CoursePreviewInline";
import CreatorStorefrontInline from "./CreatorStorefrontInline";

interface CreatorDashboardProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isAdmin?: boolean;
  viewId?: string | null;
  onViewIdChange?: (id: string | null) => void;
  tabClickCounter?: number;
}

export default function CreatorDashboard({ activeTab: propsActiveTab, onTabChange: propsOnTabChange, isAdmin, viewId, onViewIdChange, tabClickCounter }: CreatorDashboardProps) {
  const [internalActiveTab, setInternalActiveTab] = useState("dashboard");
  const activeTab = propsActiveTab || internalActiveTab;
  const onTabChange = propsOnTabChange || setInternalActiveTab;
  
  const [previousTab, setPreviousTab] = useState("dashboard");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [previewCourseId, setPreviewCourseIdInternal] = useState<string | null>(
    activeTab === "courses" && viewId ? viewId : null
  );
  const [previewCreatorId, setPreviewCreatorIdInternal] = useState<string | null>(
    activeTab === "explore" && viewId ? viewId : null
  );

  const setPreviewCourseId = (id: string | null) => {
    setPreviewCourseIdInternal(id);
    onViewIdChange?.(id);
  };

  const setPreviewCreatorId = (id: string | null) => {
    setPreviewCreatorIdInternal(id);
    onViewIdChange?.(id);
  };

  const [stats, setStats] = useState({
    totalCourses: 0,
    totalSales: 0,
    totalLearners: 0,
    productsListed: 0,
  });
  const [userId, setUserId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [verificationStatus, setVerificationStatus] = useState<string>("unverified");
  const [verificationNotes, setVerificationNotes] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
    fetchStats();
    fetchUserId();
    fetchVerificationStatus();

    const enrollmentsChannel = supabase.channel('dashboard_enrollments').on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments' }, () => fetchStats()).subscribe();
    const ordersChannel = supabase.channel('dashboard_orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchStats()).subscribe();

    return () => {
      supabase.removeChannel(enrollmentsChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  // Handle Settings Overlay
  useEffect(() => {
    if (activeTab === "profile") {
      setIsSettingsOpen(true);
    } else {
      setPreviousTab(activeTab);
      setIsSettingsOpen(false);
      setShowAddModal(false);
    }
  }, [activeTab]);

  // Clear previews when user clicks a sidebar tab (tabClickCounter changes)
  useEffect(() => {
    if (tabClickCounter && tabClickCounter > 0) {
      setPreviewCourseIdInternal(null);
      setPreviewCreatorIdInternal(null);
    }
  }, [tabClickCounter]);

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    onTabChange(previousTab);
  };

  const fetchUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);
  };

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (data) setProfile(data);
  };

  const fetchVerificationStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("verification_status, verification_notes").eq("id", user.id).single();
    if (data) {
      setVerificationStatus(data.verification_status || "unverified");
      setVerificationNotes(data.verification_notes || null);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count: coursesCount } = await supabase.from("courses").select("*", { count: "exact", head: true }).eq("creator_id", user.id);
      const { count: productsCount } = await supabase.from("products").select("*", { count: "exact", head: true }).eq("creator_id", user.id);
      const { data: creatorCourses } = await supabase.from("courses").select("id").eq("creator_id", user.id);
      const courseIds = creatorCourses?.map(c => c.id) || [];
      const { data: creatorProducts } = await supabase.from("products").select("id").eq("creator_id", user.id);
      const productIds = creatorProducts?.map(p => p.id) || [];

      let learnersCount = 0;
      if (courseIds.length > 0) {
        const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
        learnersCount = new Set(enrollments?.map(e => e.user_id) || []).size;
      }

      let totalSales = 0;
      if (courseIds.length > 0) {
        const { data: courseOrders } = await supabase.from("orders").select("amount").eq("status", "completed").in("item_id", courseIds);
        totalSales += courseOrders?.reduce((sum, order) => sum + Number(order.amount), 0) || 0;
      }
      if (productIds.length > 0) {
        const { data: productOrders } = await supabase.from("orders").select("amount").eq("status", "completed").in("product_id", productIds);
        totalSales += productOrders?.reduce((sum, order) => sum + Number(order.amount), 0) || 0;
      }

      setStats({ totalCourses: coursesCount || 0, totalSales, totalLearners: learnersCount, productsListed: productsCount || 0 });
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error("Failed to load dashboard stats");
    }
  };

  const handleCopyShareLink = async () => {
    const shareUrl = `${window.location.origin}/creator/${userId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Share link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const getAddButtonText = () => {
    if (activeTab === "courses") return "Add New Course";
    if (activeTab === "products") return "Add New Product";
    return "";
  };

  const showHeaderAddButton = activeTab === "courses" || activeTab === "products";

  return (
    <div className="flex w-full min-h-screen bg-gray-50/50 dark:bg-[#030303] dashboard-font transition-all duration-500">
      <CreatorSidebar activeTab={isSettingsOpen ? "profile" : activeTab} onTabChange={onTabChange} isAdmin={isAdmin} />
      
      <main className="flex-1 ml-16 transition-all duration-300">
        <div className="max-w-[1240px] mx-auto px-6 md:px-10 py-10 lg:py-12">
          {/* Header Section - hidden on explore tab since ExploreInline has its own */}
          {activeTab !== "explore" && (
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-12 px-2">
            <div className="flex-1 min-w-0">
             <h1 className="text-3xl md:text-4xl font-black text-black dark:text-white tracking-tight transition-all duration-500 overflow-hidden text-ellipsis whitespace-nowrap">
              {previewCourseId ? "Course Preview" :
               previewCreatorId ? "Storefront Preview" :
               activeTab === "dashboard" ? `Welcome back, ${profile?.name || 'Creator'}` : 
               activeTab === "courses" ? "Courses Manager" : 
               activeTab === "products" ? "Products Store" : 
               activeTab === "orders" ? "Sales & Orders" : 
               activeTab === "earnings" ? "Revenue Analytics" : 
               activeTab === "explore" ? "Creator Network" : "Settings"}
            </h1>
            <p className="text-base md:text-lg text-gray-500 dark:text-zinc-500 font-medium transition-colors mt-1">
                {previewCourseId ? "Review your course content as it appears to learners." :
                 previewCreatorId ? "Preview how this storefront appears to the community." :
                 activeTab === "dashboard" ? "Here's what's happening today." : 
                 activeTab === "explore" ? "Connect with other creators and browse the marketplace." :
                 `Manage your ${activeTab} content and track performance.`}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Hide these buttons in preview mode */}
              {!previewCourseId && !previewCreatorId && (
                <>
                  {/* Only show Share button on Dashboard tab */}
                  {activeTab === "dashboard" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-11 px-6 rounded-2xl border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-gray-50 dark:hover:bg-zinc-900 !text-black dark:!text-zinc-300 font-bold transition-all hover:scale-105 active:scale-95 shadow-sm">
                      <Share2 className="mr-2 h-4 w-4 !text-black dark:!text-zinc-300" />
                      <span className="!text-black dark:!text-zinc-300">Share Page</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 rounded-2xl p-5 shadow-2xl border-none bg-white dark:bg-zinc-950">
                    <div className="space-y-4 text-black dark:text-white">
                      <div>
                        <h3 className="text-base font-black mb-1">Share Your Store</h3>
                        <p className="text-xs text-gray-500 dark:text-zinc-500 font-medium leading-snug">
                          Let people explore your unique creations and courses.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/creator/${userId}`}
                          className="flex-1 px-3 py-2.5 text-[10px] border dark:border-zinc-800 rounded-xl bg-gray-50 dark:bg-zinc-900 font-mono text-gray-600 dark:text-zinc-400 focus:outline-none"
                        />
                        <Button size="icon" onClick={handleCopyShareLink} className="rounded-xl h-9 w-9 flex-shrink-0 bg-black dark:bg-primary hover:bg-gray-800 dark:hover:bg-primary/90">
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Add New Button for Courses/Products in Header */}
              {showHeaderAddButton && (
                <Button 
                  onClick={() => setShowAddModal(true)}
                  className="h-11 px-6 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {getAddButtonText()}
                </Button>
              )}
                </>
              )}
            </div>
          </div>
          )}

          {/* Stats Section - ONLY visible on Dashboard tab and NOT in preview mode */}
          {activeTab === "dashboard" && !previewCourseId && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16 px-2 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
              <StatCard label="Active Courses" value={stats.totalCourses} icon={<BookOpen className="h-5 w-5 text-black dark:text-white" />} color="bg-indigo-50 dark:bg-zinc-900/40" borderColor="dark:border-indigo-500/10" />
              <StatCard label="Total Revenue" value={`₹${stats.totalSales.toLocaleString()}`} icon={<TrendingUp className="h-5 w-5 text-black dark:text-white" />} color="bg-emerald-50 dark:bg-zinc-900/40" borderColor="dark:border-emerald-500/10" />
              <StatCard label="Total Students" value={stats.totalLearners} icon={<Users className="h-5 w-5 text-black dark:text-white" />} color="bg-violet-50 dark:bg-zinc-900/40" borderColor="dark:border-violet-500/10" />
              <StatCard label="Products" value={stats.productsListed} icon={<Package className="h-5 w-5 text-black dark:text-white" />} color="bg-orange-50 dark:bg-zinc-900/40" borderColor="dark:border-orange-500/10" />
            </div>
          )}

          {/* Main Content Area */}
          <div className="px-2 pb-20">
            <Tabs value={activeTab} className="w-full">
              <TabsContent value="dashboard" className="mt-0 outline-none">
                <div className="bg-white dark:bg-zinc-900/40 rounded-3xl p-10 shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col items-center justify-center text-center backdrop-blur-sm">
                  <LayoutDashboard className="h-16 w-16 text-indigo-600 dark:text-indigo-400 mb-5" />
                  <h2 className="text-2xl font-black mb-3 text-black dark:text-white">Welcome to your Dashboard</h2>
                  <p className="text-gray-500 dark:text-zinc-500 max-w-sm text-sm font-medium leading-relaxed">Explore your courses, products, and earnings using the sidebar navigation. Your stats and share options are right above.</p>
                </div>
              </TabsContent>
              <TabsContent value="courses" className="mt-0 outline-none">
                {previewCourseId ? (
                  <CoursePreviewInline 
                    courseId={previewCourseId} 
                    onBack={() => setPreviewCourseId(null)} 
                  />
                ) : (
                  <CoursesManager 
                    onCourseChange={fetchStats} 
                    isAddDialogOpen={activeTab === "courses" && showAddModal}
                    onAddDialogChange={(open) => setShowAddModal(open)}
                    onViewCourse={(id) => setPreviewCourseId(id)}
                  />
                )}
              </TabsContent>
              <TabsContent value="products" className="mt-0 outline-none">
                <ProductsManager 
                  onProductChange={fetchStats} 
                  isAddDialogOpen={activeTab === "products" && showAddModal}
                  onAddDialogChange={(open) => setShowAddModal(open)}
                />
              </TabsContent>
              <TabsContent value="orders" className="mt-0 outline-none"><CreatorOrdersManager /></TabsContent>
              <TabsContent value="earnings" className="mt-0 outline-none"><EarningsManager /></TabsContent>
              <TabsContent value="explore" className="mt-0 outline-none">
                {previewCreatorId ? (
                  <CreatorStorefrontInline 
                    creatorId={previewCreatorId} 
                    onBack={() => setPreviewCreatorId(null)} 
                  />
                ) : (
                  <ExploreInline 
                    onViewStorefront={(id) => setPreviewCreatorId(id)}
                  />
                )}
              </TabsContent>
              <TabsContent value="admin" className="mt-0 outline-none">
                <AdminDashboardInline />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Settings Modal - Reference Inspired */}
      <Dialog open={isSettingsOpen} onOpenChange={handleCloseSettings}>
        <DialogContent className="max-w-[1000px] w-[95vw] h-[85vh] p-0 overflow-hidden border-none shadow-2xl rounded-3xl bg-transparent">
          <CreatorSettings 
            verificationStatus={verificationStatus}
            verificationNotes={verificationNotes}
            onVerificationComplete={fetchVerificationStatus}
            onClose={handleCloseSettings}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon, color, sub, borderColor }: { label: string; value: string | number; icon: React.ReactNode; color: string; sub?: string; borderColor?: string }) {
  return (
    <Card className={cn("border-none shadow-none rounded-2xl bg-white dark:bg-zinc-900 hover:bg-gray-50/50 dark:hover:bg-zinc-800 transition-all p-1", borderColor)}>
      <div className={cn("w-full h-full rounded-xl p-6 flex flex-col justify-between group cursor-default transition-all duration-500 border border-transparent", color, borderColor && "dark:border-opacity-100")}>
        <div className="flex justify-between items-start mb-5">
          <div className="p-3 bg-white dark:bg-zinc-800 rounded-xl shadow-sm text-black dark:text-white group-hover:scale-110 transition-transform duration-500">
            {icon}
          </div>
          {sub && <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 bg-white/50 dark:bg-zinc-800/50 px-2.5 py-1 rounded-full">{sub}</span>}
        </div>
        <div>
          <p className="text-gray-500 dark:text-zinc-500 font-bold uppercase tracking-widest text-[10px] mb-1.5 px-1">{label}</p>
          <p className="text-3xl font-black text-black dark:text-white tracking-tight leading-none group-hover:translate-x-1 transition-transform duration-500">{value}</p>
        </div>
      </div>
    </Card>
  );
}