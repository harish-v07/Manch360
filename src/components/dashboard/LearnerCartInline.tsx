import { ShoppingCart, X, Plus, Minus, MapPin, CreditCard, ShoppingBag, Truck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/hooks/useCart";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { S3Media } from "@/components/S3Media";

export default function LearnerCartInline() {
  const { items, removeItem, updateQuantity, getTotalItems, getTotalPrice, clearCart } = useCart();
  const totalItems = getTotalItems();
  const [processing, setProcessing] = useState(false);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
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

  // Add check for physical items
  const hasPhysicalItems = items.some(item => item.type === "physical");

  // Auto-fetch shipping rate when pincode is 6 digits
  const fetchShippingRate = useCallback(async (pincode: string) => {
    if (!pincode || pincode.length !== 6 || items.length === 0 || !hasPhysicalItems) return;
    
    setShippingLoading(true);
    setShippingError(null);
    setShippingRate(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Use first item's product_id for shipping rate (same creator assumed)
      const response = await fetch(`${supabaseUrl}/functions/v1/check-shipping-rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          product_id: items[0].id,
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
  }, [items]);

  // Watch pincode changes
  useEffect(() => {
    if (address.pincode.length === 6) {
      fetchShippingRate(address.pincode);
    } else {
      setShippingRate(null);
      setShippingError(null);
    }
  }, [address.pincode, fetchShippingRate]);

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

    if (hasPhysicalItems && !shippingRate) {
      toast.error("Please wait for shipping rate calculation");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to continue");
      return;
    }

    const totalAmount = getTotalPrice() + (shippingRate?.shipping_charge || 0);

    try {
      setProcessing(true);
      const orderPayload = {
        amount: totalAmount,
        currency: 'INR',
        description: `Purchase of ${items.length} item(s) (incl. shipping)`,
        receipt: `rcpt_${Date.now()}_cart`,
        product_id: items[0]?.id,
      };

      const { data: orderData, error: orderError } = await invokeEdgeFunction('create-razorpay-order', orderPayload);

      if (orderError || !orderData) {
        throw new Error(orderError?.message || 'Failed to create order');
      }

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Manch360",
        description: `Purchase of ${items.length} products`,
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

            // Distribute shipping charge across items proportionally
            const productTotal = getTotalPrice();
            const orderPromises = items.map((item, index) => {
              const itemTotal = item.price * item.quantity;
              
              let itemShipping = 0;
              if (hasPhysicalItems && shippingRate) {
                // Last item gets the remainder to avoid rounding issues
                itemShipping = index === items.length - 1
                  ? shippingRate.shipping_charge - items.slice(0, -1).reduce((sum, i) => sum + Math.round(shippingRate.shipping_charge * (i.price * i.quantity) / productTotal), 0)
                  : Math.round(shippingRate.shipping_charge * itemTotal / productTotal);
              }
              
              return supabase.from("orders").insert({
                user_id: user.id,
                item_id: item.id,
                product_id: item.id,
                item_type: 'product',
                amount: itemTotal + itemShipping,
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
                  ...(itemShipping > 0 ? {
                    shipping_charge: itemShipping,
                    courier_name: shippingRate?.courier_name,
                  } : {})
                },
                shipment_status: 'pending',
              });
            });

            await Promise.all(orderPromises);
            toast.success("Payment successful! Your orders have been placed.");
            clearCart();
            setCheckoutDialogOpen(false);
          } catch (error) {
            console.error("Order creation error:", error);
            toast.error("Order creation failed. Please contact support.");
          } finally {
            setProcessing(false);
          }
        },
        prefill: {
          name: address.fullName,
          email: user.email,
          contact: address.phone,
        },
        theme: { color: "#3399cc" },
        modal: { ondismiss: () => setProcessing(false) }
      };

      const rzp1 = new (window as any).Razorpay(options);
      rzp1.open();
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to initiate payment");
      setProcessing(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black dark:text-white tracking-tight">Shopping Cart</h1>
          <p className="text-muted-foreground font-medium mt-1">Review your items and checkout</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-soft border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl">
          <CardContent className="py-20 text-center">
            <div className="w-20 h-20 bg-primary/5 dark:bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <ShoppingCart className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2 dark:text-white">Your cart is empty</h3>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">Looks like you haven't added anything yet. Discover amazing creations in the store!</p>
            <Button 
              className="rounded-2xl h-12 px-8 font-bold shadow-lg shadow-primary/20"
              onClick={() => window.dispatchEvent(new CustomEvent('changeTab', { detail: 'explore' }))}
            >
              Explore Products
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <Card key={item.id} className="border-none shadow-soft rounded-3xl bg-white dark:bg-zinc-900/40 backdrop-blur-sm overflow-hidden">
                <CardContent className="p-6 flex gap-6">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gray-100 dark:bg-zinc-800 flex-shrink-0">
                    {item.image_url ? (
                      <S3Media src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-primary/20">
                        <ShoppingBag className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="text-lg font-bold dark:text-white line-clamp-1">{item.name}</h3>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-8 w-8 rounded-xl text-muted-foreground hover:text-rose-500">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-xl font-black text-primary">₹{item.price}</div>
                      <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-800 rounded-2xl p-1 px-2">
                        <Button variant="ghost" size="icon" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="h-8 w-8 rounded-xl">
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-black">{item.quantity}</span>
                        <Button variant="ghost" size="icon" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="h-8 w-8 rounded-xl">
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-6">
            <Card className="border-none shadow-soft rounded-3xl bg-white dark:bg-zinc-900/40 backdrop-blur-sm sticky top-8">
              <CardHeader>
                <CardTitle className="text-xl font-bold dark:text-white">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="opacity-60">Subtotal</span>
                    <span className="dark:text-white font-bold">₹{getTotalPrice().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="opacity-60">Shipping</span>
                    <span className="dark:text-white font-bold text-xs">
                      {shippingRate ? `₹${shippingRate.shipping_charge}` : (hasPhysicalItems ? 'Calculated at checkout' : 'Not Applicable')}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-gray-100 dark:border-zinc-800 flex justify-between">
                    <span className="text-lg font-bold dark:text-white">Total</span>
                    <span className="text-2xl font-black text-primary">
                      ₹{(getTotalPrice() + (shippingRate?.shipping_charge || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
                <Button 
                  className="w-full h-14 rounded-2xl font-black text-lg shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 bg-primary hover:bg-primary/90 text-white" 
                  onClick={() => setCheckoutDialogOpen(true)}
                  disabled={processing}
                >
                  {processing ? "Processing..." : "Proceed to Checkout"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

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

            {/* Shipping & Price Summary */}
            <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 space-y-4">
              {/* Shipping Rate Display */}
              {hasPhysicalItems && (
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
                    ₹{(getTotalPrice() + (shippingRate?.shipping_charge || 0)).toFixed(2)}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Products: ₹{getTotalPrice().toFixed(2)}</p>
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
              disabled={processing || shippingLoading || (hasPhysicalItems && !shippingRate)}
              className="rounded-2xl h-12 px-8 font-black bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 gap-3"
            >
              <CreditCard className="h-5 w-5" />
              {processing ? "Processing..." : "Complete Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
