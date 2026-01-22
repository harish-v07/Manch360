import { ShoppingCart, X, Plus, Minus, MapPin, CreditCard } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { useCart } from "@/hooks/useCart";
import { Badge } from "./ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export const Cart = () => {
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

  const handleCheckout = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to checkout");
      return;
    }

    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    // Open checkout dialog instead of directly proceeding to payment
    setCheckoutDialogOpen(true);
  };

  const handleProceedToPayment = async () => {
    // Validate address
    if (!address.fullName || !address.phone || !address.addressLine || !address.city || !address.state || !address.pincode) {
      toast.error("Please fill in all address fields");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to continue");
      return;
    }

    try {
      setProcessing(true);

      // Calculate total amount
      const totalAmount = getTotalPrice();

      // Create Razorpay order
      const orderPayload = {
        amount: totalAmount,
        currency: 'INR',
        description: `Purchase of ${items.length} item(s)`,
        receipt: `rcpt_${Date.now()}_cart`,
      };

      const { data: orderData, error: orderError } = await invokeEdgeFunction('create-razorpay-order', orderPayload);

      if (orderError || !orderData) {
        throw new Error(orderError?.message || 'Failed to create order');
      }

      // Open Razorpay Checkout
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "CreatorHub",
        description: `Purchase of ${items.length} products`,
        order_id: orderData.id,
        handler: async function (response: any) {
          try {
            // Verify Payment
            const { data: verifyData, error: verifyError } = await invokeEdgeFunction('verify-razorpay-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyError || !verifyData.success) {
              toast.error("Payment verification failed");
              return;
            }

            // Create order records for each cart item
            const orderPromises = items.map(item =>
              supabase.from("orders").insert({
                user_id: user.id,
                item_id: item.id,
                product_id: item.id,
                item_type: 'product',
                amount: item.price * item.quantity,
                status: 'completed',
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              })
            );

            const results = await Promise.all(orderPromises);
            const hasError = results.some(result => result.error);

            if (hasError) {
              toast.error("Payment successful but order creation failed. Please contact support.");
            } else {
              toast.success("Payment successful! Your orders have been placed.");
              clearCart();
              setCheckoutDialogOpen(false);
            }
          } catch (error) {
            console.error("Order creation error:", error);
            toast.error("Payment successful but order creation failed. Please contact support.");
          } finally {
            setProcessing(false);
          }
        },
        prefill: {
          name: address.fullName,
          email: user.email,
          contact: address.phone,
        },
        theme: {
          color: "#3399cc",
        },
        modal: {
          ondismiss: function () {
            setProcessing(false);
          }
        }
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
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              >
                {totalItems}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-lg p-0 gap-0 flex flex-col h-full">
          <div className="p-6 pb-4 border-b flex-shrink-0">
            <SheetHeader>
              <SheetTitle>Shopping Cart ({totalItems} items)</SheetTitle>
            </SheetHeader>
          </div>

          {items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center text-muted-foreground">
                <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Your cart is empty</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-4 p-4 border rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-semibold">{item.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {item.description}
                      </p>
                      <p className="text-lg font-bold text-primary mt-2">
                        ₹{item.price}
                      </p>
                    </div>

                    <div className="flex flex-col items-end justify-between">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="h-8 w-8"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="h-8 w-8"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t p-6 pt-4 space-y-4 flex-shrink-0 bg-background">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-primary">₹{getTotalPrice().toFixed(2)}</span>
                </div>
                <Button className="w-full" size="lg" onClick={handleCheckout} disabled={processing}>
                  {processing ? "Processing..." : "Proceed to Checkout"}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Checkout Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Your Order</DialogTitle>
            <DialogDescription>
              Review your cart items and provide delivery information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Cart Summary */}
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Order Summary ({items.length} items)
              </h3>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3 text-sm">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-muted-foreground">Qty: {item.quantity}</p>
                      <p className="font-semibold text-primary">₹{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Address */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Delivery Address
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={address.fullName}
                    onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    value={address.phone}
                    onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="addressLine">Address *</Label>
                  <Textarea
                    id="addressLine"
                    value={address.addressLine}
                    onChange={(e) => setAddress({ ...address, addressLine: e.target.value })}
                    placeholder="House No., Building Name, Street, Area"
                    rows={2}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    placeholder="State"
                  />
                </div>
                <div>
                  <Label htmlFor="pincode">Pincode *</Label>
                  <Input
                    id="pincode"
                    value={address.pincode}
                    onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                    placeholder="6-digit pincode"
                    maxLength={6}
                  />
                </div>
              </div>
            </div>

            {/* Price Details */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Price Details</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Price ({getTotalItems()} items)</span>
                  <span>₹{getTotalPrice().toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Delivery Charges</span>
                  <span className="text-green-600">FREE</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total Amount</span>
                  <span className="text-primary">₹{getTotalPrice().toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckoutDialogOpen(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProceedToPayment}
              disabled={processing}
              className="gap-2"
            >
              <CreditCard className="h-4 w-4" />
              {processing ? "Processing..." : "Proceed to Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
