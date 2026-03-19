import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Download, Package, Lock, FileArchive, Loader2 } from "lucide-react";
import { S3Media } from "@/components/S3Media";
import { getS3ViewUrl } from "@/lib/s3-upload";

interface DigitalProductInlineProps {
  productId: string;
  onBack: () => void;
}

export default function DigitalProductInline({ productId, onBack }: DigitalProductInlineProps) {
  const [product, setProduct] = useState<any>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    checkAccessAndFetchProduct();
  }, [productId]);

  const checkAccessAndFetchProduct = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch Product Details
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select(`
          *,
          public_profiles:creator_id (name)
        `)
        .eq("id", productId)
        .single();

      if (productError || !productData) {
        toast.error("Digital product not found");
        onBack();
        return;
      }
      
      setProduct(productData);

      // Verify Access (Is Creator OR Has valid Paid Order)
      const isCreator = productData.creator_id === user.id;
      
      let userHasPurchased = false;
      if (!isCreator) {
        const { data: ordersData } = await supabase
          .from("orders")
          .select("id, status")
          .eq("product_id", productId)
          .eq("user_id", user.id)
          .eq("status", "completed")
          .limit(1);

        userHasPurchased = !!ordersData && ordersData.length > 0;
      }

      setHasAccess(isCreator || userHasPurchased);

    } catch (err: any) {
      console.error("Error fetching digital product:", err);
      toast.error("Failed to load digital product details.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!product?.file_url) {
        toast.error("Download link is missing for this product.");
        return;
    }
    
    try {
        setDownloading(true);
        const signedUrl = await getS3ViewUrl(product.file_url);
        window.open(signedUrl, "_blank");
    } catch (err) {
        console.error("Failed to generate download url:", err);
        toast.error("Failed to generate a secure download link.");
    } finally {
        setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground font-medium">Verifying access...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Button variant="ghost" onClick={onBack} className="mb-6 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to My Orders
        </Button>
        <Card className="shadow-soft p-12 text-center border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl">
          <Lock className="mx-auto h-16 w-16 text-muted-foreground mb-6" />
          <h2 className="text-3xl font-black mb-4 dark:text-white tracking-tight">Access Denied</h2>
          <p className="text-muted-foreground mb-8 text-lg max-w-md mx-auto">
            You haven't purchased this digital product yet, or your payment is still processing.
          </p>
          <Button 
            className="rounded-2xl h-12 px-8 font-bold shadow-lg shadow-primary/20"
            onClick={onBack}
          >
            Return to Orders
          </Button>
        </Card>
      </div>
    );
  }

  const mediaUrls = product?.media_urls || [];
  const primaryMedia = mediaUrls.length > 0 ? mediaUrls[0] : null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" onClick={onBack} className="hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to My Orders
        </Button>
        <div className="text-right">
          <h2 className="text-xl font-black dark:text-white tracking-tight">{product?.name}</h2>
          <p className="text-xs text-primary font-bold uppercase tracking-widest leading-none mt-1">
            By {product?.public_profiles?.name || "Creator"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column: Product Info & Image */}
          <div className="md:col-span-1 space-y-6">
              <Card className="shadow-soft overflow-hidden border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl">
                  {primaryMedia ? (
                      <div className="aspect-square relative w-full overflow-hidden">
                          <S3Media src={primaryMedia} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" />
                      </div>
                  ) : (
                      <div className="aspect-square bg-gray-50 dark:bg-zinc-800 flex flex-col items-center justify-center text-primary/20">
                          <Package className="h-16 w-16 mb-4" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Digital Product</span>
                      </div>
                  )}
                  <CardHeader className="p-6">
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 w-fit px-3 py-1 rounded-full mb-4 flex items-center gap-2">
                          <FileArchive className="h-3.5 w-3.5" />
                          Digital Download
                      </div>
                      <CardTitle className="text-2xl font-black dark:text-white tracking-tight leading-tight">
                        {product?.name}
                      </CardTitle>
                  </CardHeader>
              </Card>
          </div>

          {/* Right Column: Download & Instructions */}
          <div className="md:col-span-2 space-y-6">
              <Card className="shadow-soft border-none bg-primary/5 dark:bg-primary/10 backdrop-blur-sm rounded-3xl overflow-hidden relative group">
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Download className="h-32 w-32 rotate-12" />
                  </div>
                  <CardHeader className="p-8">
                      <CardTitle className="flex items-center gap-3 text-2xl font-black dark:text-white tracking-tight">
                          <Download className="h-6 w-6 text-primary" />
                          Secure Download
                      </CardTitle>
                      <CardDescription className="text-base font-medium text-muted-foreground mt-2">
                          You have unlimited access to download this file.
                      </CardDescription>
                  </CardHeader>
                  <CardContent className="px-8 pb-8">
                      {product?.file_url ? (
                          <Button 
                              size="lg" 
                              className="w-full sm:w-auto h-14 px-10 rounded-2xl font-black text-lg gap-3 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden" 
                              onClick={handleDownload}
                              disabled={downloading}
                          >
                              {downloading ? (
                                <Loader2 className="h-6 w-6 animate-spin text-white" />
                              ) : (
                                <Download className="h-6 w-6" />
                              )}
                              {downloading ? "Generating..." : "Download Files"}
                          </Button>
                      ) : (
                          <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-sm font-bold flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                              The creator hasn't attached a valid file yet.
                          </div>
                      )}
                  </CardContent>
              </Card>

              {product?.usage_instructions && (
                  <Card className="shadow-soft border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl overflow-hidden">
                      <CardHeader className="p-8 pb-4">
                          <CardTitle className="text-xl font-black dark:text-white tracking-tight uppercase tracking-widest text-xs opacity-50">Usage Setup & Instructions</CardTitle>
                      </CardHeader>
                      <CardContent className="px-8 pb-8">
                          <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground font-medium whitespace-pre-wrap leading-relaxed">
                              {product.usage_instructions}
                          </div>
                      </CardContent>
                  </Card>
              )}

              <Card className="shadow-soft border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl overflow-hidden">
                  <CardHeader className="p-8 pb-4">
                      <CardTitle className="text-xl font-black dark:text-white tracking-tight uppercase tracking-widest text-xs opacity-50">Product Description</CardTitle>
                  </CardHeader>
                  <CardContent className="px-8 pb-8">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground font-medium whitespace-pre-wrap">
                          {product?.description || "No description provided."}
                      </div>
                  </CardContent>
              </Card>
          </div>
      </div>
    </div>
  );
}
