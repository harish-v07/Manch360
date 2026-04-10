import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ShoppingCart, ArrowLeft, Package, User, CreditCard, MapPin, Truck, Loader2 } from "lucide-react";
import { S3Media } from "@/components/S3Media";
import { useCart } from "@/hooks/useCart";

interface ProductDetailInlineProps {
  productId: string;
  onBack: () => void;
}

export default function ProductDetailInline({ productId, onBack }: ProductDetailInlineProps) {
  const { addItem } = useCart();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [address, setAddress] = useState({
    fullName: "",
    phone: "",
    addressLine: "",
    city: "",
    state: "",
    pincode: "",
  });

  // Shipping rate state
  const [shippingRate, setShippingRate] = useState<{
    shipping_charge: number;
    courier_name: string;
    estimated_delivery_days: string | null;
    estimated_delivery_date: string | null;
    is_recommended: boolean;
  } | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  const isOwner = userId && product && userId === product.creator_id;
  const isCreator = userRole === 'creator';
  const hidePurchase = isOwner || isCreator;
  const isPhysical = product?.type === "physical";

  // Auto-fetch shipping rate when pincode is 6 digits
  const fetchShippingRate = useCallback(async (pincode: string) => {
    if (!pincode || pincode.length !== 6 || !product?.id || !isPhysical) return;
    
    setShippingLoading(true);
    setShippingError(null);
    setShippingRate(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/check-shipping-rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          product_id: product.id,
          delivery_pincode: pincode,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setShippingError(data.error || 'Unable to calculate shipping');
        return;
      }

      setShippingRate({
        shipping_charge: data.shipping_charge,
        courier_name: data.courier_name,
        estimated_delivery_days: data.estimated_delivery_days,
        estimated_delivery_date: data.estimated_delivery_date,
        is_recommended: data.is_recommended,
      });
    } catch (err: any) {
      console.error('Shipping rate fetch error:', err);
      setShippingError('Failed to calculate shipping rate');
    } finally {
      setShippingLoading(false);
    }
  }, [product?.id]);

  // Watch pincode changes
  useEffect(() => {
    if (address.pincode.length === 6) {
      fetchShippingRate(address.pincode);
    } else {
      setShippingRate(null);
      setShippingError(null);
    }
  }, [address.pincode, fetchShippingRate]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      type: product.type,
      description: product.description,
      image_url: product.media_urls?.[0],
    });
  };

  const handleBuyNow = () => {
    if (!product) return;
    setCheckoutDialogOpen(true);
  };

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
        return { data: null, error: new Error(errorText) };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  const handleProceedToPayment = async () => {
    if (!address.fullName || !address.phone || !address.addressLine || !address.city || !address.state || !address.pincode) {
      toast.error("Please fill in all address fields");
      return;
    }

    if (isPhysical && !shippingRate) {
      toast.error("Please wait for shipping rate to be calculated");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to continue");
      return;
    }

    const totalAmount = product.price + (shippingRate?.shipping_charge || 0);

    try {
      setProcessingPayment(true);
      const orderPayload = {
        amount: totalAmount,
        currency: 'INR',
        description: `Purchase of ${product.name} (incl. shipping)`,
        receipt: `rcpt_${Date.now()}_inline`,
        product_id: product.id,
      };

      const { data: orderData, error: orderError } = await invokeEdgeFunction('create-razorpay-order', orderPayload);
      if (orderError || !orderData) throw new Error(orderError?.message || 'Failed to create order');

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Manch360",
        description: product.name,
        order_id: orderData.id,
        handler: async function (response: any) {
          try {
            const { data: verifyData, error: verifyError } = await invokeEdgeFunction('verify-razorpay-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyError || !verifyData.success) {
              toast.error("Payment verification failed");
              return;
            }

            const { error: orderError } = await supabase.from("orders").insert({
              user_id: user.id,
              item_id: product.id,
              product_id: product.id,
              item_type: 'product',
              amount: totalAmount,
              status: 'completed',
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              delivery_address: {
                fullName: address.fullName,
                phone: address.phone,
                addressLine: address.addressLine,
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                ...(shippingRate ? {
                  shipping_charge: shippingRate.shipping_charge,
                  courier_name: shippingRate.courier_name,
                } : {})
              },
              shipment_status: 'pending',
            });

            if (orderError) throw orderError;
            
            toast.success("Payment successful! Your order has been placed.");
            setCheckoutDialogOpen(false);
          } catch (error) {
            console.error("Order creation error:", error);
            toast.error("Order creation failed. Please contact support.");
          } finally {
            setProcessingPayment(false);
          }
        },
        prefill: {
          name: address.fullName,
          email: user.email,
          contact: address.phone,
        },
        theme: { color: "#3399cc" },
        modal: { ondismiss: () => setProcessingPayment(false) }
      };

      const rzp1 = new (window as any).Razorpay(options);
      rzp1.open();
    } catch (error: any) {
      console.error("Payment error:", error);
      toast.error(error.message || "Failed to initiate payment");
      setProcessingPayment(false);
    }
  };

  useEffect(() => {
    fetchProduct();
    fetchUserContext();
  }, [productId]);

  const fetchUserContext = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleData) setUserRole(roleData.role);
    }
  };

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
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">
              {hidePurchase ? "Purchase Restricted" : "Secure Purchase"}
            </h3>
            <div className="space-y-4">
              {hidePurchase ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                    {isOwner ? <User className="h-8 w-8 text-primary" /> : <Package className="h-8 w-8 text-primary" />}
                  </div>
                  <div>
                    <p className="font-black text-xl text-black dark:text-white mb-1">
                      {isOwner ? "Product Owner" : "Creator Account"}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium">
                      {isOwner 
                        ? "You created this product. Purchase actions are disabled for owners." 
                        : "Creators cannot purchase products in the network."}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    className="w-full h-14 rounded-2xl font-black text-lg shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 gap-3"
                    onClick={handleAddToCart}
                  >
                    <ShoppingCart className="h-5 w-5" />
                    Add to Cart
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-14 rounded-2xl font-black text-lg border-2 border-primary/30 hover:border-primary hover:bg-primary text-primary hover:text-white transition-all hover:scale-[1.02] active:scale-95 gap-3 shadow-sm"
                    onClick={handleBuyNow}
                  >
                    <CreditCard className="h-5 w-5" />
                    Buy Now
                  </Button>
                </>
              )}
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

      {/* Checkout Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border-none bg-white dark:bg-zinc-950 p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <MapPin className="text-primary h-6 w-6" />
              Delivery Details
            </DialogTitle>
            <DialogDescription className="font-medium text-muted-foreground mt-2">
              We'll use this information for shipping physical products and your order confirmation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="fullName" className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">Full Name *</Label>
                <Input
                  id="fullName"
                  value={address.fullName}
                  onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                  placeholder="Enter your full name"
                  className="rounded-xl h-12 bg-gray-50 dark:bg-zinc-900 border-none font-medium"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="phone" className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">Phone Number *</Label>
                <Input
                  id="phone"
                  value={address.phone}
                  onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  className="rounded-xl h-12 bg-gray-50 dark:bg-zinc-900 border-none font-medium"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="addressLine" className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">Shipping Address *</Label>
                <Textarea
                  id="addressLine"
                  value={address.addressLine}
                  onChange={(e) => setAddress({ ...address, addressLine: e.target.value })}
                  placeholder="House No., Building Name, Street, Area"
                  rows={2}
                  className="rounded-xl bg-gray-50 dark:bg-zinc-900 border-none font-medium p-4 resize-none"
                />
              </div>
              <div>
                <Label htmlFor="city" className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">City *</Label>
                <Input
                  id="city"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  className="rounded-xl h-12 bg-gray-50 dark:bg-zinc-900 border-none font-medium"
                />
              </div>
              <div>
                <Label htmlFor="state" className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">State *</Label>
                <Input
                  id="state"
                  value={address.state}
                  onChange={(e) => setAddress({ ...address, state: e.target.value })}
                  className="rounded-xl h-12 bg-gray-50 dark:bg-zinc-900 border-none font-medium"
                />
              </div>
              <div>
                <Label htmlFor="pincode" className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">Pincode *</Label>
                <Input
                  id="pincode"
                  value={address.pincode}
                  onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                  maxLength={6}
                  className="rounded-xl h-12 bg-gray-50 dark:bg-zinc-900 border-none font-medium"
                />
              </div>
            </div>

            {/* Price Summary */}
            <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 space-y-4">
              {/* Shipping Rate Display */}
              {isPhysical && (
                <div className="bg-gray-50 dark:bg-zinc-900/50 p-5 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-4 w-4 text-primary" />
                    <p className="text-xs font-black uppercase tracking-widest opacity-60">Shipping</p>
                  </div>
                  
                  {shippingLoading ? (
                    <div className="flex items-center gap-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <p className="text-sm font-medium text-muted-foreground">Calculating shipping rate...</p>
                    </div>
                  ) : shippingError ? (
                    <div className="py-2">
                      <p className="text-sm font-medium text-rose-500">{shippingError}</p>
                    </div>
                  ) : shippingRate ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-bold dark:text-white">{shippingRate.courier_name}</p>
                          {shippingRate.estimated_delivery_days && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Estimated delivery: {shippingRate.estimated_delivery_days}{/^\d+$/.test(String(shippingRate.estimated_delivery_days)) ? ' Days' : ''}
                              {shippingRate.estimated_delivery_date && ` (${shippingRate.estimated_delivery_date})`}
                            </p>
                          )}
                        </div>
                        <p className="text-lg font-black text-primary">₹{shippingRate.shipping_charge}</p>
                      </div>
                      {shippingRate.is_recommended && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                          ✓ Recommended
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">Enter pincode to calculate shipping</p>
                  )}
                </div>
              )}


              {/* Total */}
              <div className="flex justify-between items-center bg-gray-50 dark:bg-zinc-900/50 p-6 rounded-2xl">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest opacity-60">Total Amount</p>
                  <p className="text-2xl font-black text-primary">
                    ₹{shippingRate ? (product?.price + shippingRate.shipping_charge) : product?.price}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Product: ₹{product?.price}</p>
                  {shippingRate && (
                    <p className="text-xs font-medium text-muted-foreground">Shipping: ₹{shippingRate.shipping_charge}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-8 gap-3 sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setCheckoutDialogOpen(false)}
              className="rounded-2xl h-12 px-6 font-bold text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleProceedToPayment}
              disabled={processingPayment || shippingLoading || (isPhysical && !shippingRate)}
              className="rounded-2xl h-12 px-8 font-black bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 gap-3"
            >
              <CreditCard className="h-5 w-5" />
              {processingPayment ? "Processing..." : "Complete Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
