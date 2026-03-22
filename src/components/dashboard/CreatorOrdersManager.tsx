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
import { cn } from "@/lib/utils";

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
          shipments (
            awb_code,
            courier_name
          )
        `)
                .in("product_id", productIds)
                .eq("item_type", "product")
                .order("created_at", { ascending: false });

            if (error) throw error;

            // Fetch buyer names from public_profiles (bypasses RLS)
            const ordersList = (data as any[]) || [];
            const buyerIds = [...new Set(ordersList.map(o => o.user_id).filter(Boolean))];
            
            let buyerMap: Record<string, { name: string; email: string }> = {};
            if (buyerIds.length > 0) {
                const { data: buyers } = await supabase
                    .from("public_profiles")
                    .select("id, name, email")
                    .in("id", buyerIds);
                
                if (buyers) {
                    buyerMap = Object.fromEntries(buyers.map(b => [b.id, { name: b.name, email: b.email }]));
                }
            }

            // Merge buyer info into orders
            const ordersWithBuyers = ordersList.map(o => ({
                ...o,
                profiles: buyerMap[o.user_id] || null
            }));

            setOrders(ordersWithBuyers);
        } catch (err: any) {
            console.error("Error fetching creator orders:", err);
            toast.error("Failed to load orders");
        } finally {
            setLoading(false);
        }
    };

    const shipmentStatusColors: Record<string, string> = {
        pending: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/50",
        shipped: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50",
        delivered: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50",
        failed: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50",
        cancelled: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
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

    if (loading) {
        return <div className="text-center py-6 dark:text-zinc-500 text-sm">Loading orders...</div>;
    }

    return (
        <div className="space-y-5">
            {!pickupRegistered && (
                <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 transition-all">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-300">
                        <p className="font-black uppercase tracking-widest">Pickup address missing</p>
                        <p className="mt-1 font-medium opacity-80 leading-relaxed">
                            Register your pickup address in **Settings &rsaquo; Shipping** to start fulfillment.
                        </p>
                    </div>
                </div>
            )}

            <Card className="shadow-soft dark:bg-zinc-900/40 dark:border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader className="p-5">
                    <CardTitle className="flex items-center gap-2 text-lg font-black dark:text-white">
                        <Package className="h-4 w-4 text-primary" />
                        Order History
                    </CardTitle>
                    <CardDescription className="text-xs dark:text-zinc-500">
                        Manage fulfillment and track your product sales
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                    {orders.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50/50 dark:bg-zinc-900/20 rounded-xl border border-dashed dark:border-zinc-800">
                            <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p className="text-xs font-black dark:text-zinc-600 uppercase tracking-widest">No orders found</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {orders.map((order) => {
                                const addr = order.delivery_address as any;
                                const shipment = order.shipments?.[0];
                                const buyer = order.profiles as any;

                                return (
                                    <div key={order.id} className="border border-gray-100 dark:border-zinc-800/50 rounded-xl p-4 space-y-4 dark:bg-zinc-900/30 hover:border-primary/20 transition-all">
                                        <div className="flex items-start justify-between gap-4 flex-wrap">
                                            <div className="space-y-1">
                                                <p className="font-black text-lg dark:text-zinc-200">{order.products?.name || "Product"}</p>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-black text-gray-400 dark:text-zinc-600 uppercase tracking-widest">#{order.id.substring(0, 8).toUpperCase()}</span>
                                                    <span className="text-gray-300 dark:text-zinc-800">•</span>
                                                    <span className="text-sm font-bold text-gray-400 dark:text-zinc-500">
                                                        {new Date(order.created_at).toLocaleDateString("en-IN", {
                                                            day: "numeric",
                                                            month: "short",
                                                            year: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit"
                                                        })}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium text-gray-500 dark:text-zinc-500">
                                                    Buyer: <span className="font-bold dark:text-zinc-400">{addr?.fullName || buyer?.name || "Unknown"}</span>
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <span className="font-black text-lg text-primary">₹{Number(order.amount).toLocaleString()}</span>
                                                <div className="flex gap-1.5 flex-wrap justify-end">
                                                    <span className={cn(
                                                        "text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest border transition-all",
                                                        order.status === "completed" 
                                                            ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30" 
                                                            : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30"
                                                    )}>
                                                        {order.status}
                                                    </span>
                                                    {order.products?.type === "physical" && (
                                                        <span className={cn(
                                                            "text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest border shadow-sm transition-all",
                                                            shipmentStatusColors[order.shipment_status] || "bg-gray-100 dark:bg-zinc-800"
                                                        )}>
                                                            {order.shipment_status}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Delivery address */}
                                        {addr && (
                                            <div className="flex items-start gap-3 text-xs text-gray-500 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-950/50 rounded-xl p-3 border border-gray-100 dark:border-zinc-800/50 group">
                                                <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary group-hover:scale-110 transition-transform" />
                                                <span className="font-medium leading-relaxed">
                                                    <span className="font-bold dark:text-zinc-400">{addr.fullName}</span> &bull; {addr.phone}<br />
                                                    {addr.addressLine}, {addr.city}, {addr.state} – <span className="font-mono">{addr.pincode}</span>
                                                </span>
                                            </div>
                                        )}

                                        {/* Shipment info */}
                                        {order.products?.type === "physical" && shipment && (
                                            <div className="flex items-center justify-between bg-primary/5 dark:bg-primary/5 rounded-xl p-3 border border-primary/10">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg shadow-sm">
                                                        <Truck className="h-3.5 w-3.5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest dark:text-zinc-300">{shipment.courier_name || "Assigned Courier"}</p>
                                                        {shipment.awb_code && (
                                                            <p className="text-[9px] text-muted-foreground font-mono mt-0.5">AWB: {shipment.awb_code}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1.5">
                                                    {shipment.awb_code ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="gap-1.5 text-[10px] h-8 px-3 rounded-lg font-black uppercase tracking-wider"
                                                            onClick={() => window.open(`https://shiprocket.co/tracking/${shipment.awb_code}`, "_blank")}
                                                        >
                                                            <ExternalLink className="h-3 w-3" />
                                                            Track
                                                        </Button>
                                                    ) : order.shipment_status !== "cancelled" && (
                                                        <Button
                                                            size="sm"
                                                            className="gap-1.5 text-[10px] h-8 px-3 rounded-lg font-black uppercase tracking-wider bg-primary text-white hover:bg-primary/90"
                                                            onClick={() => handleReadyToShip(order.id)}
                                                            disabled={shippingOrderId === order.id}
                                                        >
                                                            <Truck className="h-3 w-3" />
                                                            {shippingOrderId === order.id ? "Working..." : "Ready to Ship"}
                                                        </Button>
                                                    )}
                                                    
                                                    {order.shipment_status !== "cancelled" && order.shipment_status !== "delivered" && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[10px] font-bold h-8"
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="rounded-2xl dark:bg-zinc-950 dark:border-zinc-800">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="dark:text-white">Refund & Cancel?</AlertDialogTitle>
                                                                    <AlertDialogDescription className="text-xs dark:text-zinc-500">
                                                                        This will immediately refund the buyer and cancel any pending shipments. This cannot be undone.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="h-10 rounded-xl dark:bg-zinc-900 border-none dark:text-zinc-400">Keep Order</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        onClick={() => cancelOrder(order.id)}
                                                                        className="h-10 rounded-xl bg-destructive hover:bg-destructive/90 text-white"
                                                                    >
                                                                        Confirm Refund
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Create Shipment button for physical orders where shipment is completely missing */}
                                        {order.products?.type === "physical" && !shipment && order.shipment_status !== "cancelled" && (
                                            <div className="flex justify-end gap-2 pt-2">
                                                <Button
                                                    size="sm"
                                                    className="gap-2 text-[10px] h-9 px-4 rounded-xl font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90"
                                                    onClick={() => handleCreateShipment(order.id)}
                                                    disabled={!pickupRegistered || shippingOrderId === order.id}
                                                >
                                                    <Truck className="h-3.5 w-3.5" />
                                                    {shippingOrderId === order.id ? "Initializing..." : "Create Shipment"}
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-9 px-4 text-rose-500 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-[10px] font-black uppercase tracking-widest rounded-xl"
                                                        >
                                                            Cancel Order
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent className="rounded-2xl dark:bg-zinc-950 dark:border-zinc-800">
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle className="dark:text-white">Cancel Order?</AlertDialogTitle>
                                                            <AlertDialogDescription className="text-xs dark:text-zinc-500">
                                                                Immediate refund will be processed via Razorpay.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel className="h-10 rounded-xl dark:bg-zinc-900 border-none">Oops, Keep it</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => cancelOrder(order.id)}
                                                                className="h-10 rounded-xl bg-destructive text-white"
                                                            >
                                                                Refund & Cancel
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
