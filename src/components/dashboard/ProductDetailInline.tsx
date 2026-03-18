import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ShoppingCart, ArrowLeft, Package, User } from "lucide-react";
import { S3Media } from "@/components/S3Media";

interface ProductDetailInlineProps {
  productId: string;
  onBack: () => void;
}

export default function ProductDetailInline({ productId, onBack }: ProductDetailInlineProps) {
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*, public_profiles:creator_id(name, avatar_url)")
        .eq("id", productId)
        .single();

      if (error) {
        toast.error("Product not found");
        onBack();
      } else {
        setProduct(data);
      }
    } catch (error) {
      console.error("Error fetching product:", error);
    } finally {
      setLoading(false);
    }
  };

  const nextMedia = () => {
    if (product?.media_urls && currentMediaIndex < product.media_urls.length - 1) {
      setCurrentMediaIndex(currentMediaIndex + 1);
    }
  };

  const prevMedia = () => {
    if (currentMediaIndex > 0) {
      setCurrentMediaIndex(currentMediaIndex - 1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!product) return null;

  const currentMedia = product.media_urls?.[currentMediaIndex];
  const isVideo = currentMedia?.includes('.mp4') || currentMedia?.includes('.webm');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between mb-8">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white rounded-xl"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Storefront
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        {/* Media Gallery */}
        <div className="space-y-6">
          <Card className="border-none shadow-soft overflow-hidden rounded-[2.5rem] bg-black/5 dark:bg-black/20">
            <CardContent className="p-0">
              <div className="relative aspect-square">
                {currentMedia ? (
                  <>
                    {isVideo ? (
                      <video
                        src={currentMedia}
                        className="w-full h-full object-contain"
                        controls
                      />
                    ) : (
                      <S3Media
                        src={currentMedia}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    )}

                    {product.media_urls.length > 1 && (
                      <>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full h-12 w-12 bg-white/20 hover:bg-white/40 backdrop-blur-md border-none text-white transition-all shadow-xl"
                          onClick={prevMedia}
                          disabled={currentMediaIndex === 0}
                        >
                          <ChevronLeft className="h-6 w-6" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full h-12 w-12 bg-white/20 hover:bg-white/40 backdrop-blur-md border-none text-white transition-all shadow-xl"
                          onClick={nextMedia}
                          disabled={currentMediaIndex === product.media_urls.length - 1}
                        >
                          <ChevronRight className="h-6 w-6" />
                        </Button>
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md px-5 py-2 rounded-full text-xs font-black text-white border border-white/10 uppercase tracking-widest">
                          {currentMediaIndex + 1} <span className="opacity-40 mx-1">/</span> {product.media_urls.length}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No media available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Thumbnails */}
          {product.media_urls && product.media_urls.length > 1 && (
            <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
              {product.media_urls.map((url: string, index: number) => {
                const isThumbVideo = url.includes('.mp4') || url.includes('.webm');
                return (
                  <button
                    key={index}
                    onClick={() => setCurrentMediaIndex(index)}
                    className={`relative w-24 h-24 rounded-2xl overflow-hidden border-2 flex-shrink-0 transition-all duration-300 ${currentMediaIndex === index
                      ? 'border-primary shadow-lg scale-105'
                      : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                  >
                    {isThumbVideo ? (
                      <video src={url} className="w-full h-full object-cover" />
                    ) : (
                      <S3Media src={url} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-10 py-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
               <span className="px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-primary/5 text-primary border border-primary/10">
                {product.type}
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-black dark:text-white tracking-tight leading-tight">{product.name}</h1>
            <p className="text-3xl font-black text-primary">₹{product.price}</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">Product Description</h3>
            <p className="text-gray-600 dark:text-zinc-400 font-medium leading-relaxed whitespace-pre-wrap text-base">
              {product.description || "Uniquely crafted product with attention to detail and quality."}
            </p>
          </div>

          <div className="p-8 rounded-[2rem] bg-gray-50/50 dark:bg-zinc-900/40 border border-gray-100 dark:border-zinc-800 space-y-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">Secure Purchase</h3>
            <div className="space-y-4">
               <Button
                className="w-full h-14 rounded-2xl font-black text-lg shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 gap-3"
                onClick={() => toast.info("Direct purchase available in public storefront")}
              >
                <ShoppingCart className="h-5 w-5" />
                Add to Cart
              </Button>
            </div>
          </div>

          {product.public_profiles && (
            <div className="flex items-center gap-5 p-6 rounded-3xl bg-white dark:bg-zinc-900/20 border border-gray-100 dark:border-zinc-800 shadow-sm transition-all hover:shadow-md">
                <div className="relative">
                  {product.public_profiles.avatar_url ? (
                    <S3Media
                      src={product.public_profiles.avatar_url}
                      alt={product.public_profiles.name}
                      className="w-14 h-14 rounded-2xl object-cover shadow-sm"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-black text-primary capitalize">
                      {product.public_profiles.name?.charAt(0)}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-white dark:bg-zinc-900 rounded-lg p-1 shadow-sm border border-gray-100 dark:border-zinc-800">
                    <User className="h-3 w-3 text-primary" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-0.5">Verified Seller</p>
                  <p className="font-black text-black dark:text-white text-lg">{product.public_profiles.name}</p>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
