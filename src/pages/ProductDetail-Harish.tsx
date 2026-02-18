import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ShoppingCart, MapPin, CreditCard } from "lucide-react";
import { useCart } from "@/hooks/useCart";

export default function ProductDetail() {
    const { productId } = useParams();
    const navigate = useNavigate();
    const { addItem } = useCart();
    const [product, setProduct] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const [addingToCart, setAddingToCart] = useState(false);
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

    useEffect(() => {
        fetchProduct();
    }, [productId]);

    const fetchProduct = async () => {
        const { data, error } = await supabase
            .from("products")
            .select("*, creator_id, profiles(name, avatar_url)")
            .eq("id", productId)
            .single();

        if (error) {
            toast.error("Product not found");
            navigate("/explore");
        } else {
            setProduct(data);
        }
        setLoading(false);
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

    const handleAddToCart = () => {
        if (!product) return;

        setAddingToCart(true);
        addItem({
            id: product.id,
            name: product.name,
            price: Number(product.price),
            type: product.type,
            description: product.description,
            image_url: product.media_urls?.[0] || '',
        });
        setAddingToCart(false);
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

    const handleProceedToPayment = async () => {
        // Validate address
        if (!address.fullName || !address.phone || !address.addressLine || !address.city || !address.state || !address.pincode) {
            toast.error("Please fill in all address fields");
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error("Please sign in to continue");
            navigate("/auth");
            return;
        }

        try {
            setProcessingPayment(true);

            // Create Razorpay order
            const orderPayload = {
                amount: product.price,
                currency: 'INR',
                description: `Purchase of ${product.name}`,
                receipt: `rcpt_${Date.now()}_${product.id.substring(0, 8)}`,
                creator_id: product.creator_id, // For Razorpay Route transfer
                item_id: product.id,
                item_type: 'product',
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
                description: product.name,
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

                        // Create order record
                        const { error: orderInsertError } = await supabase.from("orders").insert({
                            user_id: user.id,
                            item_id: product.id,
                            product_id: product.id,
                            item_type: 'product',
                            amount: product.price,
                            status: 'completed',
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        });

                        if (orderInsertError) {
                            toast.error("Payment successful but order creation failed. Please contact support.");
                        } else {
                            toast.success("Payment successful! Your order has been placed.");
                            setCheckoutDialogOpen(false);
                            setTimeout(() => navigate("/dashboard"), 2000);
                        }
                    } catch (error) {
                        console.error("Order creation error:", error);
                        toast.error("Payment successful but order creation failed. Please contact support.");
                    } finally {
                        setProcessingPayment(false);
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
                        setProcessingPayment(false);
                    }
                }
            };

            const rzp1 = new (window as any).Razorpay(options);
            rzp1.open();

        } catch (error) {
            console.error("Payment error:", error);
            toast.error("Failed to initiate payment");
            setProcessingPayment(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-hero">
                <Navbar />
                <div className="container mx-auto px-4 pt-32">
                    <div className="text-center">Loading...</div>
                </div>
            </div>
        );
    }

    if (!product) {
        return null;
    }

    const currentMedia = product.media_urls?.[currentMediaIndex];
    const isVideo = currentMedia?.includes('.mp4') || currentMedia?.includes('.webm');

    return (
        <div className="min-h-screen bg-gradient-hero">
            <Navbar />
            <div className="container mx-auto px-4 pt-32 pb-20">
                <Button
                    variant="ghost"
                    onClick={() => navigate(-1)}
                    className="mb-6"
                >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Media Gallery */}
                    <div className="space-y-4">
                        <Card className="shadow-hover overflow-hidden">
                            <CardContent className="p-0">
                                <div className="relative aspect-square bg-muted">
                                    {currentMedia ? (
                                        <>
                                            {isVideo ? (
                                                <video
                                                    src={currentMedia}
                                                    className="w-full h-full object-contain"
                                                    controls
                                                />
                                            ) : (
                                                <img
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
                                                        className="absolute left-2 top-1/2 -translate-y-1/2"
                                                        onClick={prevMedia}
                                                        disabled={currentMediaIndex === 0}
                                                    >
                                                        <ChevronLeft className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        size="icon"
                                                        className="absolute right-2 top-1/2 -translate-y-1/2"
                                                        onClick={nextMedia}
                                                        disabled={currentMediaIndex === product.media_urls.length - 1}
                                                    >
                                                        <ChevronRight className="h-4 w-4" />
                                                    </Button>
                                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm">
                                                        {currentMediaIndex + 1} / {product.media_urls.length}
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
                            <div className="grid grid-cols-4 gap-2">
                                {product.media_urls.map((url: string, index: number) => {
                                    const isThumbVideo = url.includes('.mp4') || url.includes('.webm');
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => setCurrentMediaIndex(index)}
                                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${currentMediaIndex === index
                                                ? 'border-primary shadow-md'
                                                : 'border-transparent hover:border-primary/50'
                                                }`}
                                        >
                                            {isThumbVideo ? (
                                                <video src={url} className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={url} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div className="space-y-6">
                        <div>
                            <h1 className="text-4xl font-bold mb-2">{product.name}</h1>
                            <p className="text-3xl font-bold text-primary">₹{product.price}</p>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="px-4 py-2 rounded-full text-sm bg-secondary text-secondary-foreground">
                                {product.type}
                            </span>
                        </div>

                        <div className="prose prose-sm max-w-none">
                            <h3 className="text-lg font-semibold mb-2">Description</h3>
                            <p className="text-muted-foreground whitespace-pre-wrap">
                                {product.description || "No description available"}
                            </p>
                        </div>

                        <div className="space-y-3">
                            <Button
                                className="w-full"
                                size="lg"
                                onClick={handleAddToCart}
                                disabled={addingToCart}
                            >
                                <ShoppingCart className="mr-2 h-5 w-5" />
                                {addingToCart ? "Adding..." : "Add to Cart"}
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full"
                                size="lg"
                                onClick={handleBuyNow}
                            >
                                Buy Now
                            </Button>
                        </div>

                        {product.profiles && (
                            <Card className="shadow-soft">
                                <CardContent className="p-4">
                                    <p className="text-sm text-muted-foreground mb-2">Sold by</p>
                                    <div className="flex items-center gap-3">
                                        {product.profiles.avatar_url && (
                                            <img
                                                src={product.profiles.avatar_url}
                                                alt={product.profiles.name}
                                                className="w-10 h-10 rounded-full"
                                            />
                                        )}
                                        <p className="font-semibold">{product.profiles.name}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>

                {/* Checkout Dialog */}
                <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Confirm Your Order</DialogTitle>
                            <DialogDescription>
                                Review your order details and provide delivery information
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            {/* Order Summary */}
                            <div className="border rounded-lg p-4 bg-muted/50">
                                <h3 className="font-semibold mb-3 flex items-center gap-2">
                                    <ShoppingCart className="h-4 w-4" />
                                    Order Summary
                                </h3>
                                <div className="flex gap-4">
                                    {product?.media_urls?.[0] && (
                                        <img
                                            src={product.media_urls[0]}
                                            alt={product.name}
                                            className="w-20 h-20 object-cover rounded"
                                        />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-medium">{product?.name}</p>
                                        <p className="text-sm text-muted-foreground">{product?.type}</p>
                                        <p className="text-lg font-bold text-primary mt-1">₹{product?.price}</p>
                                    </div>
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
                                        <span>Price (1 item)</span>
                                        <span>₹{product?.price}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span>Delivery Charges</span>
                                        <span className="text-green-600">FREE</span>
                                    </div>
                                    <div className="border-t pt-2 flex justify-between font-bold text-lg">
                                        <span>Total Amount</span>
                                        <span className="text-primary">₹{product?.price}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setCheckoutDialogOpen(false)}
                                disabled={processingPayment}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleProceedToPayment}
                                disabled={processingPayment}
                                className="gap-2"
                            >
                                <CreditCard className="h-4 w-4" />
                                {processingPayment ? "Processing..." : "Proceed to Payment"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
