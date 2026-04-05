import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink, ShieldCheck, Heart, BookOpen, Package } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { S3Media } from "@/components/S3Media";
import CoursePreviewInline from "@/components/dashboard/CoursePreviewInline";
import ProductDetailInline from "@/components/dashboard/ProductDetailInline";
import { Navbar } from "@/components/Navbar";

export default function CreatorStorefront() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [creator, setCreator] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [userEnrollments, setUserEnrollments] = useState<Set<string>>(new Set());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [activeSubView, setActiveSubView] = useState<"profile" | "product" | "course">("profile");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const invokeEdgeFunction = async (functionName: string, body: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          return { data: null, error: new Error(errorData.error || `Request failed with status ${response.status}`) };
        } catch (e) {
          return { data: null, error: new Error(`Request failed: ${errorText}`) };
        }
      }

      const data = await response.json();
      if (data && data.error) {
        return { data: null, error: new Error(data.error) };
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  useEffect(() => {
    if (creatorId) {
      fetchCreatorData();
    }
  }, [creatorId]);

  const fetchCreatorData = async () => {
    const [creatorResult, coursesResult, productsResult] = await Promise.all([
      supabase.from("public_profiles_with_roles" as any).select("id, name, bio, avatar_url, banner_url, social_links, status, suspended_until, is_verified").eq("id", creatorId).single(),
      supabase.from("courses").select("*").eq("creator_id", creatorId).eq("status", "published"),
      supabase.from("products").select("*").eq("creator_id", creatorId),
    ]);

    if (creatorResult.data) setCreator(creatorResult.data);
    if (coursesResult.data) setCourses(coursesResult.data);
    if (productsResult.data) setProducts(productsResult.data);

    const { data: { user } } = await supabase.auth.getUser();
    if (user && coursesResult.data) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (roleData) {
        setCurrentUserRole(roleData.role);
      }

      const courseIds = coursesResult.data.map(c => c.id);
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", user.id)
        .in("course_id", courseIds);

      if (enrollments) {
        setUserEnrollments(new Set(enrollments.map(e => e.course_id)));
      }

      const { data: subData } = await supabase
        .from("subscriptions" as any)
        .select("id")
        .eq("learner_id", user.id)
        .eq("creator_id", creatorId)
        .maybeSingle();

      setIsSubscribed(!!subData);
    }

    setLoading(false);
  };

  const handleEnroll = async (course: any) => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to enroll");
      navigate("/auth");
      return;
    }

    if (course.is_free) {
      setEnrolling(course.id);
      const { error } = await supabase.from("enrollments").insert({
        user_id: user.id,
        course_id: course.id,
        progress: 0,
      });
      setEnrolling(null);
      if (error) {
        toast.error("Error enrolling in course");
      } else {
        toast.success("Successfully enrolled!");
        setUserEnrollments(prev => new Set(prev).add(course.id));
        setTimeout(() => { navigate(`/dashboard?tab=dashboard&viewId=${course.id}`); }, 1000);
      }
    } else {
      try {
        setEnrolling(course.id);
        const { data: orderData, error: orderError } = await invokeEdgeFunction('create-razorpay-order', {
          amount: course.price,
          currency: 'INR',
          description: `Enrollment for ${course.title}`,
          receipt: `rcpt_${Date.now()}_${course.id.substring(0, 8)}`,
          course_id: course.id,
        });

        if (orderError || !orderData) throw new Error(orderError?.message || 'Failed to create order');

        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_YOUR_KEY_HERE",
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Manch360",
          description: course.title,
          order_id: orderData.id,
          handler: async function (response: any) {
            const { data: verifyData, error: verifyError } = await invokeEdgeFunction('verify-razorpay-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyError || !verifyData.success) {
              toast.error("Payment verification failed");
              return;
            }

            const { error: enrollError } = await supabase.from("enrollments").insert({
              user_id: user.id,
              course_id: course.id,
              progress: 0,
            });

            if (enrollError) {
              toast.error("Payment successful but enrollment failed.");
            } else {
              toast.success("Payment successful!");
              setUserEnrollments(prev => new Set(prev).add(course.id));
              setTimeout(() => { navigate(`/dashboard?tab=dashboard&viewId=${course.id}`); }, 1000);
            }
          },
          prefill: { name: creator.name, email: user.email },
          theme: { color: "#3399cc" },
        };

        const rzp1 = new (window as any).Razorpay(options);
        rzp1.open();
      } catch (error) {
        toast.error("Failed to initiate payment");
      } finally {
        setEnrolling(null);
      }
    }
  };

  const handleToggleSubscription = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to subscribe");
      navigate("/auth");
      return;
    }

    setSubscribing(true);
    try {
      if (isSubscribed) {
        await supabase.from("subscriptions" as any).delete().eq("learner_id", user.id).eq("creator_id", creatorId);
        setIsSubscribed(false);
        toast.success("Unsubscribed successfully");
      } else {
        await supabase.from("subscriptions" as any).insert({ learner_id: user.id, creator_id: creatorId });
        setIsSubscribed(true);
        toast.success("Subscribed!");
      }
    } catch (error) {
      toast.error("Failed to update subscription");
    } finally {
      setSubscribing(false);
    }
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
          <p className="text-sm text-muted-foreground mt-2 font-medium">Loading storefront...</p>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-3 dark:text-white">Creator not found</h2>
          <p className="text-muted-foreground mb-6">This creator profile doesn't exist or has been removed.</p>
          <Button onClick={() => navigate("/")} className="rounded-2xl h-11 px-6 font-bold">Go Home</Button>
        </div>
      </div>
    );
  }

  const isSuspended = creator.status === "suspended" && creator.suspended_until && new Date(creator.suspended_until) > new Date();
  const isBanned = creator.status === "banned";

  if (isSuspended || isBanned) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-3 dark:text-white">Storefront Unavailable</h2>
          <p className="text-muted-foreground mb-6">This creator's storefront is currently unavailable.</p>
          <Button onClick={() => navigate("/")} className="rounded-2xl h-11 px-6 font-bold">Go Home</Button>
        </div>
      </div>
    );
  }

  const socialLinks = typeof creator.social_links === 'object' && creator.social_links !== null ? creator.social_links as { instagram?: string; twitter?: string; website?: string } : {};

  // Render inline sub-views for product/course detail
  if (activeSubView === "product" && selectedItemId) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-[#030303] transition-all duration-500">
        <Navbar hideExplore minimal />
        <div className="max-w-[1240px] mx-auto px-6 md:px-10 pt-24 pb-10 lg:pt-28 lg:pb-12">
          <ProductDetailInline productId={selectedItemId} onBack={() => { setActiveSubView("profile"); setSelectedItemId(null); }} />
        </div>
      </div>
    );
  }

  if (activeSubView === "course" && selectedItemId) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-[#030303] transition-all duration-500">
        <Navbar hideExplore minimal />
        <div className="max-w-[1240px] mx-auto px-6 md:px-10 pt-24 pb-10 lg:pt-28 lg:pb-12">
          <CoursePreviewInline courseId={selectedItemId} onBack={() => { setActiveSubView("profile"); setSelectedItemId(null); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#030303] transition-all duration-500">
      <Navbar hideExplore minimal />
      <div className="max-w-[1240px] mx-auto px-6 md:px-10 pt-24 pb-10 lg:pt-28 lg:pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="relative rounded-[2.5rem] overflow-hidden bg-white dark:bg-zinc-900/40 border border-gray-100 dark:border-zinc-800 shadow-soft mb-10">
          <div className="h-48 relative bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-zinc-800 dark:to-zinc-900">
            {creator.banner_url && <S3Media src={creator.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />}
            <div className="absolute inset-0 bg-black/10" />
          </div>
          <div className="px-10 pb-10">
            <div className="flex flex-col md:flex-row gap-8 items-start -mt-12 relative z-10">
              {creator.avatar_url ? (
                <div className="w-32 h-32 rounded-3xl border-8 border-white dark:border-zinc-900 shadow-2xl overflow-hidden bg-white dark:bg-zinc-800">
                  <S3Media src={creator.avatar_url} alt={creator.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-32 h-32 rounded-3xl border-8 border-white dark:border-zinc-900 shadow-2xl bg-primary/10 flex items-center justify-center text-4xl font-black text-primary uppercase">
                  {creator.name?.charAt(0)}
                </div>
              )}
              <div className="flex-1 md:pt-14">
                <div className="flex flex-wrap items-center gap-4 mb-3">
                  <h1 className="text-3xl font-black text-black dark:text-white tracking-tight">{creator.name}</h1>
                  {creator.is_verified && (
                    <span className="flex items-center gap-2 text-xs font-black tracking-widest uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-4 py-1.5 rounded-full">
                      <ShieldCheck className="h-4 w-4" /> Verified Store
                    </span>
                  )}
                </div>
                <p className="text-base text-gray-500 dark:text-zinc-500 font-medium max-w-2xl leading-relaxed mb-5">{creator.bio || "Crafting digital experiences and sharing knowledge with the community."}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {currentUserRole !== 'creator' && (
                    <Button onClick={handleToggleSubscription} disabled={subscribing} className={`h-11 px-6 rounded-2xl font-bold transition-all ${isSubscribed ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400" : "bg-primary text-white"}`}>
                      <Heart className={`h-4 w-4 mr-2 ${isSubscribed ? "fill-current" : ""}`} />
                      {subscribing ? "..." : isSubscribed ? "Subscribed" : "Subscribe"}
                    </Button>
                  )}
                  {(socialLinks.instagram || socialLinks.twitter || socialLinks.website) && (
                    <div className="flex gap-2">
                      {socialLinks.instagram && <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="rounded-xl border-gray-200 dark:border-zinc-800 font-bold"><ExternalLink className="mr-2 h-3.5 w-3.5" />Instagram</Button></a>}
                      {socialLinks.twitter && <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="rounded-xl border-gray-200 dark:border-zinc-800 font-bold"><ExternalLink className="mr-2 h-3.5 w-3.5" />Twitter</Button></a>}
                      {socialLinks.website && <a href={socialLinks.website} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="rounded-xl border-gray-200 dark:border-zinc-800 font-bold"><ExternalLink className="mr-2 h-3.5 w-3.5" />Website</Button></a>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <Tabs defaultValue="courses" className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
            <TabsList className="bg-gray-100/80 dark:bg-zinc-900/80 p-1.5 rounded-[2rem] border border-gray-100 dark:border-zinc-800 h-auto gap-1">
              <TabsTrigger value="courses" className="px-10 py-3.5 rounded-[1.5rem] font-bold text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-primary data-[state=active]:shadow-md transition-all flex items-center gap-2.5 text-muted-foreground"><BookOpen className="h-4 w-4" />Courses</TabsTrigger>
              <TabsTrigger value="products" className="px-10 py-3.5 rounded-[1.5rem] font-bold text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-primary data-[state=active]:shadow-md transition-all flex items-center gap-2.5 text-muted-foreground"><Package className="h-4 w-4" />Products</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="courses" className="outline-none mt-0">
            {courses.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900/40 rounded-[2rem] p-20 border border-gray-100 dark:border-zinc-800 text-center shadow-soft"><p className="text-gray-500 dark:text-zinc-500 font-bold">No published courses yet.</p></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {courses.map((course) => (
                  <Card key={course.id} className="overflow-hidden shadow-soft hover:shadow-hover dark:bg-zinc-900/40 dark:border-zinc-800 transition-all border-gray-100 rounded-[2rem] group cursor-pointer" onClick={() => { 
                    if (userEnrollments.has(course.id)) {
                      navigate(`/dashboard?tab=dashboard&viewId=${course.id}`);
                    } else {
                      setSelectedItemId(course.id); 
                      setActiveSubView("course"); 
                    }
                  }}>
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 dark:bg-primary/10 px-3 py-1 rounded-full">{course.category}</span>
                        <div className="flex items-center gap-1.5 text-lg font-black dark:text-white">{course.is_free ? <span className="text-emerald-500">FREE</span> : <span className="text-primary">₹{course.price}</span>}</div>
                      </div>
                      <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">{course.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500 dark:text-zinc-500 mb-6 line-clamp-3 font-medium h-[60px]">{course.description}</p>
                      {userEnrollments.has(course.id) ? (
                        <Button className="w-full h-12 rounded-2xl font-black text-sm transition-all hover:scale-[1.02] active:scale-95" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard?tab=dashboard&viewId=${course.id}`); }}>View Course</Button>
                      ) : (
                        <Button className="w-full h-12 rounded-2xl font-black text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/10" onClick={(e) => { e.stopPropagation(); handleEnroll(course); }} disabled={enrolling === course.id}>{enrolling === course.id ? "Enrolling..." : "Enroll Now"}</Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="products" className="outline-none mt-0">
            {products.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900/40 rounded-[2rem] p-20 border border-gray-100 dark:border-zinc-800 text-center shadow-soft"><p className="text-gray-500 dark:text-zinc-500 font-bold">No products available yet.</p></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {products.map((product) => (
                  <Card key={product.id} className="group overflow-hidden border-none shadow-soft hover:shadow-hover dark:bg-zinc-900/40 transition-all rounded-[2.5rem] bg-white cursor-pointer" onClick={() => { setSelectedItemId(product.id); setActiveSubView("product"); }}>
                    {product.media_urls && product.media_urls.length > 0 && (
                      <div className="aspect-square w-full overflow-hidden relative bg-black/5 dark:bg-black/20"><S3Media src={product.media_urls[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" controls={false} /></div>
                    )}
                    <CardHeader className="pt-6 px-6 pb-2">
                      <CardTitle className="text-xl font-bold dark:text-white leading-tight mb-2 truncate">{product.name}</CardTitle>
                      <div className="flex justify-between items-center">
                        <span className="text-xl font-black text-primary">₹{product.price}</span>
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground opacity-70">{product.type}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 pb-8 px-6">
                      <Button variant="outline" className="w-full h-12 rounded-[1.25rem] border-gray-100 dark:border-zinc-800 font-bold text-sm text-primary hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all dark:text-primary dark:hover:bg-primary/10 dark:hover:text-primary" onClick={(e) => { e.stopPropagation(); setSelectedItemId(product.id); setActiveSubView("product"); }}>View Details</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}