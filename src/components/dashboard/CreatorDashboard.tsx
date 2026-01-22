import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Package, Store, DollarSign, Share2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CoursesManager from "./CoursesManager";
import ProductsManager from "./ProductsManager";
import StorefrontEditor from "./StorefrontEditor";
import ProfileEditor from "./ProfileEditor";
import EarningsManager from "./EarningsManager";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function CreatorDashboard() {
  const [stats, setStats] = useState({
    totalCourses: 0,
    totalSales: 0,
    totalLearners: 0,
    productsListed: 0,
  });
  const [userId, setUserId] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchUserId();

    // Subscribe to real-time updates for enrollments
    const enrollmentsChannel = supabase
      .channel('dashboard_enrollments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'enrollments',
        },
        () => {
          fetchStats(); // Refresh stats when enrollments change
        }
      )
      .subscribe();

    // Subscribe to real-time updates for orders
    const ordersChannel = supabase
      .channel('dashboard_orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          fetchStats(); // Refresh stats when orders change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(enrollmentsChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  const fetchUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch total courses
      const { count: coursesCount } = await supabase
        .from("courses")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.id);

      // Fetch total products
      const { count: productsCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", user.id);

      // Fetch creator's course IDs for learner and sales calculations
      const { data: creatorCourses } = await supabase
        .from("courses")
        .select("id")
        .eq("creator_id", user.id);

      const courseIds = creatorCourses?.map(c => c.id) || [];

      // Fetch creator's product IDs for sales calculations
      const { data: creatorProducts } = await supabase
        .from("products")
        .select("id")
        .eq("creator_id", user.id);

      const productIds = creatorProducts?.map(p => p.id) || [];

      // Fetch unique learners (enrolled users)
      let learnersCount = 0;
      if (courseIds.length > 0) {
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("user_id")
          .in("course_id", courseIds);

        const uniqueLearners = new Set(enrollments?.map(e => e.user_id) || []);
        learnersCount = uniqueLearners.size;
      }

      // Fetch total sales from completed orders (both courses and products)
      let totalSales = 0;

      // Get course sales
      if (courseIds.length > 0) {
        const { data: courseOrders } = await supabase
          .from("orders")
          .select("amount")
          .eq("status", "completed")
          .in("item_id", courseIds);

        totalSales += courseOrders?.reduce((sum, order) => sum + Number(order.amount), 0) || 0;
      }

      // Get product sales
      if (productIds.length > 0) {
        const { data: productOrders } = await supabase
          .from("orders")
          .select("amount")
          .eq("status", "completed")
          .in("product_id", productIds);

        totalSales += productOrders?.reduce((sum, order) => sum + Number(order.amount), 0) || 0;
      }

      setStats({
        totalCourses: coursesCount || 0,
        totalSales,
        totalLearners: learnersCount,
        productsListed: productsCount || 0,
      });
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold">Creator Dashboard</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Share2 className="h-4 w-4" />
              Share Storefront
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Share Your Storefront</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Copy this link to share your creator page with others
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/creator/${userId}`}
                  className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
                />
                <Button size="sm" onClick={handleCopyShareLink} className="gap-2">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardDescription>Total Courses</CardDescription>
            <CardTitle className="text-3xl">{stats.totalCourses}</CardTitle>
          </CardHeader>
          <CardContent>
            <BookOpen className="text-primary w-8 h-8" />
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardDescription>Total Sales</CardDescription>
            <CardTitle className="text-3xl">${stats.totalSales.toFixed(2)}</CardTitle>
          </CardHeader>
          <CardContent>
            <DollarSign className="text-secondary w-8 h-8" />
            <p className="text-xs text-muted-foreground mt-2">From completed orders</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardDescription>Total Learners</CardDescription>
            <CardTitle className="text-3xl">{stats.totalLearners}</CardTitle>
          </CardHeader>
          <CardContent>
            <Store className="text-accent w-8 h-8" />
            <p className="text-xs text-muted-foreground mt-2">Unique enrolled users</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardDescription>Products Listed</CardDescription>
            <CardTitle className="text-3xl">{stats.productsListed}</CardTitle>
          </CardHeader>
          <CardContent>
            <Package className="text-primary w-8 h-8" />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="courses" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-3xl mb-8">
          <TabsTrigger value="courses">My Courses</TabsTrigger>
          <TabsTrigger value="products">My Products</TabsTrigger>
          <TabsTrigger value="storefront">Storefront</TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="courses">
          <CoursesManager onCourseChange={fetchStats} />
        </TabsContent>

        <TabsContent value="products">
          <ProductsManager onProductChange={fetchStats} />
        </TabsContent>

        <TabsContent value="storefront">
          <StorefrontEditor />
        </TabsContent>

        <TabsContent value="earnings">
          <EarningsManager />
        </TabsContent>

        <TabsContent value="profile">
          <ProfileEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}