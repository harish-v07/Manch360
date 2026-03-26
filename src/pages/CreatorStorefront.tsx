import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { S3Media } from "@/components/S3Media";

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

  const invokeEdgeFunction = async (functionName: string, body: any) => {
    try {
      // Use direct fetch instead of Supabase SDK since it's more reliable
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

      console.log(`${functionName} response status:`, response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${functionName} failed with status ${response.status}:`, errorText);

        try {
          const errorData = JSON.parse(errorText);
          return { data: null, error: new Error(errorData.error || `Request failed with status ${response.status}`) };
        } catch (e) {
          return { data: null, error: new Error(`Request failed: ${errorText}`) };
        }
      }

      const data = await response.json();

      // Check if the response contains an error field
      if (data && data.error) {
        console.error(`${functionName} returned error:`, data);
        return { data: null, error: new Error(data.error) };
      }

      return { data, error: null };
    } catch (error: any) {
      console.error(`${functionName} request failed:`, error);
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

    // Fetch user enrollments if logged in
    const { data: { user } } = await supabase.auth.getUser();
    if (user && coursesResult.data) {
      const courseIds = coursesResult.data.map(c => c.id);
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", user.id)
        .in("course_id", courseIds);

      if (enrollments) {
        setUserEnrollments(new Set(enrollments.map(e => e.course_id)));
      }
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

    // Check if already enrolled
    const { data: existingEnrollment } = await supabase
      .from("enrollments")
      .select("*")
      .eq("user_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle();

    if (existingEnrollment) {
      toast.info("You're already enrolled in this course!");
      navigate(`/course/${course.id}`);
      return;
    }

    // For free courses, enroll immediately
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
        toast.success("Successfully enrolled! Redirecting to course...");
        setTimeout(() => navigate(`/course/${course.id}`), 1000);
      }
    } else {
      // Paid course flow using Razorpay
      try {
        setEnrolling(course.id);

        // 1. Create Order via Edge Function
        const orderPayload = {
          amount: course.price,
          currency: 'INR',
          description: `Enrollment for ${course.title}`,
          receipt: `rcpt_${Date.now()}_${course.id.substring(0, 8)}`, // Keep under 40 chars
          course_id: course.id, // For Route transfer
        };

        console.log('Creating Razorpay order with payload:', orderPayload);

        const { data: orderData, error: orderError } = await invokeEdgeFunction('create-razorpay-order', orderPayload);

        console.log('Order creation response:', { orderData, orderError });

        if (orderError || !orderData) {
          const errorMessage = orderError?.message || orderData?.error || 'Failed to create order';
          console.error('Order creation failed:', errorMessage);
          throw new Error(errorMessage);
        }

        // 2. Open Razorpay Checkout
        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_YOUR_KEY_HERE", // Fallback for dev, but should be in env
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Manch360",
          description: course.title,
          order_id: orderData.id,
          handler: async function (response: any) {
            // 3. Verify Payment via Edge Function
            const { data: verifyData, error: verifyError } = await invokeEdgeFunction('verify-razorpay-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyError || !verifyData.success) {
              toast.error("Payment verification failed");
              return;
            }

            // 4. Enroll User
            const { error: enrollError } = await supabase.from("enrollments").insert({
              user_id: user.id,
              course_id: course.id,
              progress: 0,
            });

            if (enrollError) {
              toast.error("Payment successful but enrollment failed. Please contact support.");
            } else {
              toast.success("Payment successful! Redirecting to course...");
              setTimeout(() => navigate(`/course/${course.id}`), 1000);
            }
          },
          prefill: {
            name: creator.name, // Ideally user's name
            email: user.email,
          },
          theme: {
            color: "#3399cc",
          },
        };

        const rzp1 = new (window as any).Razorpay(options);
        rzp1.open();

      } catch (error) {
        console.error("Payment error:", error);
        toast.error("Failed to initiate payment");
      } finally {
        setEnrolling(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="flex items-center justify-center pt-32">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 pt-32">
          <p className="text-center text-muted-foreground">Creator not found</p>
        </div>
      </div>
    );
  }

  // Block access to suspended/banned creator storefronts
  const isSuspended =
    creator.status === "suspended" &&
    creator.suspended_until &&
    new Date(creator.suspended_until) > new Date();
  const isBanned = creator.status === "banned";

  if (isSuspended || isBanned) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 pt-32 flex flex-col items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3">Storefront Unavailable</h2>
            <p className="text-muted-foreground mb-6">
              This creator's storefront is currently unavailable. Please check back later.
            </p>
            <a href="/explore">
              <button className="px-6 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Browse Other Creators
              </button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const socialLinks = typeof creator.social_links === 'object' && creator.social_links !== null
    ? creator.social_links as { instagram?: string; twitter?: string; website?: string }
    : {};

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="pt-20">
        {/* Banner */}
        <div className="relative h-64 bg-gradient-to-r from-primary/20 to-secondary/20 overflow-hidden">
          {creator.banner_url && (
            <S3Media
              src={creator.banner_url}
              alt="Storefront Banner"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
        </div>

        <div className="container mx-auto px-4 -mt-20 relative z-10">
          <div className="bg-background rounded-xl shadow-soft p-8 mb-8">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {creator.avatar_url ? (
                <div className="w-32 h-32 rounded-full border-4 border-background shadow-lg overflow-hidden bg-background">
                  <S3Media
                    src={creator.avatar_url}
                    alt={creator.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 rounded-full border-4 border-background shadow-lg bg-primary/10 flex items-center justify-center text-4xl font-bold text-primary">
                  {creator.name?.charAt(0)}
                </div>
              )}

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h1 className="text-4xl font-bold">{creator.name}</h1>
                  {creator.is_verified && (
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 bg-blue-100 dark:bg-blue-950 dark:text-blue-300 px-3 py-1 rounded-full">
                      <ShieldCheck className="h-4 w-4" />
                      Verified Seller
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mb-4">{creator.bio || "No bio available"}</p>

                {(socialLinks.instagram || socialLinks.twitter || socialLinks.website) && (
                  <div className="flex gap-3">
                    {socialLinks.instagram && (
                      <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Instagram
                        </Button>
                      </a>
                    )}
                    {socialLinks.twitter && (
                      <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Twitter
                        </Button>
                      </a>
                    )}
                    {socialLinks.website && (
                      <a href={socialLinks.website} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Website
                        </Button>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Tabs defaultValue="courses" className="mb-12">
            <div className="flex justify-center mb-10">
              <TabsList className="bg-gray-100/80 dark:bg-zinc-900/80 p-1.5 rounded-[2rem] border border-gray-100 dark:border-zinc-800 h-auto gap-1">
                <TabsTrigger 
                  value="courses"
                  className="px-12 py-3.5 rounded-[1.5rem] font-bold text-base data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-primary data-[state=active]:shadow-md transition-all text-muted-foreground"
                >
                  Courses
                </TabsTrigger>
                <TabsTrigger 
                  value="products"
                  className="px-12 py-3.5 rounded-[1.5rem] font-bold text-base data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-primary data-[state=active]:shadow-md transition-all text-muted-foreground"
                >
                  Products
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="courses" className="mt-8">
              {courses.length === 0 ? (
                <Card className="shadow-soft">
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No courses available yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {courses.map((course) => (
                    <Card
                      key={course.id}
                      className="shadow-soft hover:shadow-hover transition-all cursor-pointer hover:-translate-y-0.5"
                      onClick={() => navigate(`/course-preview/${course.id}`)}
                    >
                      <CardHeader>
                        <CardTitle>{course.title}</CardTitle>
                        <CardDescription>{course.category}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                          {course.description}
                        </p>
                        <div className="flex justify-between items-center">
                          {course.is_free ? (
                            <span className="text-2xl font-bold text-green-600">FREE</span>
                          ) : (
                            <span className="text-2xl font-bold text-primary">₹{course.price}</span>
                          )}
                          {userEnrollments.has(course.id) ? (
                            <Button
                              onClick={(e) => { e.stopPropagation(); navigate(`/course/${course.id}`); }}
                              variant="secondary"
                            >
                              View Course
                            </Button>
                          ) : (
                            <Button
                              onClick={(e) => { e.stopPropagation(); handleEnroll(course); }}
                              disabled={enrolling === course.id}
                            >
                              {enrolling === course.id ? "Enrolling..." : "Enroll Now"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="products" className="mt-0 outline-none">
              {products.length === 0 ? (
                <Card className="shadow-soft border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-[2.5rem]">
                  <CardContent className="py-20 text-center">
                    <p className="text-muted-foreground font-bold text-lg">No products available yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {products.map((product) => (
                    <Card
                      key={product.id}
                      className="group overflow-hidden border-none shadow-soft hover:shadow-hover dark:bg-zinc-900/40 transition-all rounded-[2.5rem] bg-white cursor-pointer"
                      onClick={() => navigate(`/product/${product.id}`)}
                    >
                      {product.media_urls && product.media_urls.length > 0 && (
                        <div className="aspect-square w-full overflow-hidden relative">
                          <S3Media src={product.media_urls[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" controls={false} />
                        </div>
                      )}
                      <CardHeader className="pt-6 px-6 pb-2">
                        <CardTitle className="text-xl font-bold dark:text-white leading-tight mb-2 truncate">{product.name}</CardTitle>
                        <div className="flex justify-between items-center">
                          <span className="text-xl font-black text-primary">₹{product.price}</span>
                          <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground opacity-70">
                            {product.type}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 pb-8 px-6">
                        <Button
                          variant="outline"
                          className="w-full h-12 rounded-[1.25rem] border-gray-100 dark:border-zinc-800 font-bold text-sm text-primary hover:bg-primary/5 hover:border-primary/20 transition-all dark:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/product/${product.id}`);
                          }}
                        >
                          View Details
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Footer />
    </div>
  );
}