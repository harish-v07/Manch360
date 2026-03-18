import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, ExternalLink, BookOpen, Package } from "lucide-react";
import { S3Media } from "@/components/S3Media";
import CoursePreviewInline from "./CoursePreviewInline";
import ProductDetailInline from "./ProductDetailInline";

interface CreatorStorefrontInlineProps {
  creatorId: string;
  onBack: () => void;
}

export default function CreatorStorefrontInline({ creatorId, onBack }: CreatorStorefrontInlineProps) {
  const [creator, setCreator] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubView, setActiveSubView] = useState<"profile" | "product" | "course">("profile");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (creatorId) {
      fetchCreatorData();
    }
  }, [creatorId]);

  const fetchCreatorData = async () => {
    try {
      const { data: creatorData, error: creatorError } = await supabase
        .from("public_profiles_with_roles" as any)
        .select("id, name, bio, avatar_url, banner_url, social_links, is_verified")
        .eq("id", creatorId)
        .single();

      if (creatorError || !creatorData) {
        toast.error("Creator not found");
        onBack();
        return;
      }

      setCreator(creatorData);

      const [coursesResult, productsResult] = await Promise.all([
        supabase.from("courses").select("*").eq("creator_id", creatorId).eq("status", "published"),
        supabase.from("products").select("*").eq("creator_id", creatorId),
      ]);

      if (coursesResult.data) setCourses(coursesResult.data);
      if (productsResult.data) setProducts(productsResult.data);
    } catch (error) {
      console.error("Error fetching creator data:", error);
      toast.error("Failed to load storefront");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (activeSubView === "product" && selectedId) {
    return <ProductDetailInline productId={selectedId} onBack={() => setActiveSubView("profile")} />;
  }

  if (activeSubView === "course" && selectedId) {
    return <CoursePreviewInline courseId={selectedId} onBack={() => setActiveSubView("profile")} />;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between mb-8">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white rounded-xl"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Network
        </Button>
      </div>

      {/* Banner & Profile */}
      <div className="relative rounded-[2.5rem] overflow-hidden bg-white dark:bg-zinc-900/40 border border-gray-100 dark:border-zinc-800 shadow-soft mb-10">
        <div className="h-48 relative bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-zinc-800 dark:to-zinc-900">
          {creator.banner_url && (
            <S3Media
              src={creator.banner_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-90"
            />
          )}
          <div className="absolute inset-0 bg-black/10" />
        </div>

        <div className="px-10 pb-10">
          <div className="flex flex-col md:flex-row gap-8 items-start -mt-12 relative z-10">
            {creator.avatar_url ? (
              <div className="w-32 h-32 rounded-3xl border-8 border-white dark:border-zinc-900 shadow-2xl overflow-hidden bg-white dark:bg-zinc-800">
                <S3Media
                  src={creator.avatar_url}
                  alt={creator.name}
                  className="w-full h-full object-cover"
                />
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
                    <ShieldCheck className="h-4 w-4" />
                    Verified Store
                  </span>
                )}
              </div>
              <p className="text-base text-gray-500 dark:text-zinc-500 font-medium max-w-2xl leading-relaxed">
                {creator.bio || "Crafting digital experiences and sharing knowledge with the community."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="courses" className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
          <TabsList className="bg-gray-100/50 dark:bg-zinc-900/50 p-1.5 rounded-2xl border border-gray-100 dark:border-zinc-800 h-auto">
            <TabsTrigger 
              value="courses" 
              className="px-8 py-3 rounded-xl font-black text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2"
            >
              <BookOpen className="h-4 w-4" />
              Courses
            </TabsTrigger>
            <TabsTrigger 
              value="products" 
              className="px-8 py-3 rounded-xl font-black text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2"
            >
              <Package className="h-4 w-4" />
              Products
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="courses" className="outline-none mt-0">
          {courses.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900/40 rounded-[2rem] p-20 border border-gray-100 dark:border-zinc-800 text-center shadow-soft">
              <p className="text-gray-500 dark:text-zinc-500 font-bold">No published courses yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {courses.map((course) => (
                <Card key={course.id} className="overflow-hidden shadow-soft hover:shadow-hover dark:bg-zinc-900/40 dark:border-zinc-800 transition-all border-gray-100 rounded-[2rem] group">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 dark:bg-primary/10 px-3 py-1 rounded-full">{course.category}</span>
                      <div className="flex items-center gap-1.5 text-xs font-black dark:text-white">
                        {course.is_free ? (
                          <span className="text-emerald-500">FREE</span>
                        ) : (
                          <span className="text-primary">₹{course.price}</span>
                        )}
                      </div>
                    </div>
                    <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">{course.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-500 dark:text-zinc-500 mb-6 line-clamp-3 font-medium h-[60px]">
                      {course.description}
                    </p>
                    <Button 
                      className="w-full h-12 rounded-2xl font-black text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/10"
                      onClick={() => {
                        setSelectedId(course.id);
                        setActiveSubView("course");
                      }}
                    >
                      View Course
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="products" className="outline-none mt-0">
          {products.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900/40 rounded-[2rem] p-20 border border-gray-100 dark:border-zinc-800 text-center shadow-soft">
              <p className="text-gray-500 dark:text-zinc-500 font-bold">No products available yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.map((product) => (
                <Card key={product.id} className="overflow-hidden shadow-soft hover:shadow-hover dark:bg-zinc-900/40 dark:border-zinc-800 transition-all border-gray-100 rounded-[2rem] group">
                   {product.media_urls && product.media_urls.length > 0 && (
                    <div className="aspect-square relative overflow-hidden bg-black/5 dark:bg-black/20">
                      <S3Media src={product.media_urls[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" controls={false} />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold truncate">{product.name}</CardTitle>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-black text-primary">₹{product.price}</span>
                      <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{product.type}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2 pb-6">
                    <Button 
                      variant="outline" 
                      className="w-full h-10 rounded-xl border-gray-100 dark:border-zinc-800 font-bold text-xs"
                      onClick={() => {
                        setSelectedId(product.id);
                        setActiveSubView("product");
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
  );
}
