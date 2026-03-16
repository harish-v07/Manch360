import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Package, MapPin, AlertTriangle, ExternalLink, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Order {
    id: string;
    user_id: string;
    amount: number;
    status: string;
    shipment_status: string;
    created_at: string;
    delivery_address: any;
    product_id: string | null;
    products: { name: string; type: string } | null;
    profiles: { name: string; email: string } | null;
    shipments: { awb_code: string | null; courier_name: string | null }[];
}

export default function CreatorOrdersManager() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [pickupRegistered, setPickupRegistered] = useState(true);
    const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);

    useEffect(() => {
        fetchOrders();
        checkPickupStatus();
    }, []);

    const checkPickupStatus = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
            .from("profiles")
            .select("pickup_registered")
            .eq("id", user.id)
            .single();
        setPickupRegistered(!!data?.pickup_registered);
    };

    const fetchOrders = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get creator's product IDs
            const { data: products } = await supabase
                .from("products")
                .select("id")
                .eq("creator_id", user.id);

            if (!products || products.length === 0) {
                setOrders([]);
                setLoading(false);
                return;
            }

            const productIds = products.map((p) => p.id);

            const { data, error } = await supabase
                .from("orders")
                .select(`
          id,
          user_id,
          amount,
          status,
          shipment_status,
          created_at,
          delivery_address,
          product_id,
          products (
            name,
            type
          ),
          profiles!orders_user_id_fkey (
            name,
            email
          ),
          shipments (
            awb_code,
            courier_name
          )
        `)
                .in("product_id", productIds)
                .eq("item_type", "product")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setOrders((data as any) || []);
        } catch (err: any) {
            console.error("Error fetching creator orders:", err);
            toast.error("Failed to load orders");
        } finally {
            setLoading(false);
        }
    };

    const shipmentStatusColors: Record<string, string> = {
        pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
        shipped: "bg-blue-100 text-blue-700 border-blue-200",
        delivered: "bg-green-100 text-green-700 border-green-200",
        failed: "bg-red-100 text-red-700 border-red-200",
        cancelled: "bg-red-100 text-red-700 border-red-200",
    };

    const cancelOrder = async (orderId: string) => {
        try {
            toast.loading("Processing refund and cancelling order...", { id: "cancel-order" });
            
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");
            
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const res = await fetch(`${supabaseUrl}/functions/v1/refund-order`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                    "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({ order_id: orderId }),
            });

            const data = await res.json();
            
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to process refund");
            }
            
            // Optimistic update — reflect immediately in UI
            setOrders(prev => prev.map(o =>
                o.id === orderId
                    ? { ...o, shipment_status: "cancelled", status: "cancelled" }
                    : o
            ));
            toast.success("Order cancelled and refund initiated successfully", { id: "cancel-order" });
        } catch (err: any) {
            console.error("Cancel/Refund error:", err);
            toast.error(err.message || "Failed to cancel order", { id: "cancel-order" });
        }
    };
    const handleCreateShipment = async (orderId: string) => {
        try {
            setShippingOrderId(orderId);
            toast.loading("Connecting to Shiprocket...", { id: `ship-${orderId}` });
            
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");
            
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const res = await fetch(`${supabaseUrl}/functions/v1/create-shipment`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                    "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({ order_id: orderId }),
            });

            const data = await res.json();
            
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to create shipment");
            }
            
            toast.success("Shipment created successfully! Please click 'Ready to Ship' next.", { id: `ship-${orderId}` });
            await fetchOrders();
        } catch (err: any) {
            console.error("Shipping error:", err);
            toast.error(err.message || "Failed to create shipment", { id: `ship-${orderId}` });
        } finally {
            setShippingOrderId(null);
        }
    };

    const handleReadyToShip = async (orderId: string) => {
        try {
            setShippingOrderId(orderId);
            toast.loading("Generating AWB...", { id: `ready-${orderId}` });
            
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");
            
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const res = await fetch(`${supabaseUrl}/functions/v1/ready-to-ship`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                    "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({ order_id: orderId }),
            });

            const data = await res.json();
            
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to process Ready to Ship request");
            }
            
            toast.success("AWB assigned and pickup requested!", { id: `ready-${orderId}` });
            await fetchOrders();
        } catch (err: any) {
            console.error("Ready to ship error:", err);
            toast.error(err.message || "Failed to process request", { id: `ready-${orderId}` });
        } finally {
            setShippingOrderId(null);
        }
    };

    return (
        <div className="space-y-6">
            {!pickupRegistered && (
                <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                        <p className="font-medium">Pickup address not registered</p>
                        <p className="mt-1">
                            Go to the <strong>Shipping</strong> tab to register your pickup address before you can ship physical product orders.
                        </p>
                    </div>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Product Orders
                    </CardTitle>
                    <CardDescription>
                        Orders placed for your physical and digital products
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-muted-foreground text-sm text-center py-8">Loading orders...</p>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p>No product orders yet</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {orders.map((order) => {
                                const addr = order.delivery_address as any;
                                const shipment = order.shipments?.[0];
                                const buyer = order.profiles as any;

                                return (
                                    <div key={order.id} className="border rounded-lg p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-4 flex-wrap">
                                            <div>
                                                <p className="font-semibold text-sm">{order.products?.name || "Product"}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Order #{order.id.substring(0, 8).toUpperCase()} &bull;{" "}
                                                    {new Date(order.created_at).toLocaleDateString("en-IN", {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                    })}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Buyer: <span className="font-medium">{buyer?.name || "Unknown"}</span>
                                                    {buyer?.email && <span> ({buyer.email})</span>}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <span className="font-bold text-primary">₹{Number(order.amount).toFixed(2)}</span>
                                                <div className="flex gap-2 flex-wrap justify-end">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${order.status === "completed" ? "bg-green-100 text-green-700 border-green-200" : "bg-yellow-100 text-yellow-700 border-yellow-200"
                                                        }`}>
                                                        {order.status}
                                                    </span>
                                                    {order.products?.type === "physical" && (
                                                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${shipmentStatusColors[order.shipment_status] || ""}`}>
                                                            {order.shipment_status}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Delivery address */}
                                        {addr && (
                                            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                                                <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary" />
                                                <span>
                                                    {addr.fullName} · {addr.phone}<br />
                                                    {addr.addressLine}, {addr.city}, {addr.state} – {addr.pincode}
                                                </span>
                                            </div>
                                        )}

                                        {/* Shipment info */}
                                        {order.products?.type === "physical" && shipment && (
                                            <div className="flex items-center justify-between bg-muted/30 rounded p-2">
                                                <div className="flex items-center gap-2">
                                                    <Truck className="h-4 w-4 text-primary" />
                                                    <div>
                                                        <p className="text-xs font-medium">{shipment.courier_name || "Courier"}</p>
                                                        {shipment.awb_code && (
                                                            <p className="text-xs text-muted-foreground font-mono">AWB: {shipment.awb_code}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {shipment.awb_code ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="gap-1 text-xs h-7"
                                                            onClick={() => window.open(`https://shiprocket.co/tracking/${shipment.awb_code}`, "_blank")}
                                                        >
                                                            <ExternalLink className="h-3 w-3" />
                                                            Track
                                                        </Button>
                                                    ) : order.shipment_status !== "cancelled" && (
                                                        <Button
                                                            size="sm"
                                                            className="gap-1 text-xs h-7 bg-green-600 text-white hover:bg-green-700"
                                                            onClick={() => handleReadyToShip(order.id)}
                                                            disabled={shippingOrderId === order.id}
                                                        >
                                                            <Truck className="h-3 w-3" />
                                                            {shippingOrderId === order.id ? "Processing..." : "Ready to Ship"}
                                                        </Button>
                                                    )}
                                                    
                                                    {order.shipment_status !== "cancelled" && order.shipment_status !== "delivered" && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="gap-1 text-xs h-7 text-red-600 border-red-300 hover:bg-red-50"
                                                                >
                                                                    Cancel Order
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        This action will immediately refund the buyer via Razorpay and cancel the shipment in Shiprocket if it has been created. This action cannot be undone.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Keep Order</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        onClick={() => cancelOrder(order.id)}
                                                                        className="bg-red-600 hover:bg-red-700 text-white"
                                                                    >
                                                                        Yes, Cancel Order
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Create Shipment / Cancel button for physical orders where shipment is completely missing */}
                                        {order.products?.type === "physical" && !shipment && order.shipment_status !== "cancelled" && (
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    className="gap-1 text-xs h-7 bg-primary text-primary-foreground hover:bg-primary/90"
                                                    onClick={() => handleCreateShipment(order.id)}
                                                    disabled={!pickupRegistered || shippingOrderId === order.id}
                                                >
                                                    <Truck className="h-3 w-3" />
                                                    {shippingOrderId === order.id ? "Creating..." : "Create Shipment"}
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="gap-1 text-xs h-7 text-red-600 border-red-300 hover:bg-red-50"
                                                        >
                                                            Cancel Order
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This action will immediately refund the buyer via Razorpay and cancel the order. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Keep Order</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => cancelOrder(order.id)}
                                                                className="bg-red-600 hover:bg-red-700 text-white"
                                                            >
                                                                Yes, Cancel Order
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        )}


                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
