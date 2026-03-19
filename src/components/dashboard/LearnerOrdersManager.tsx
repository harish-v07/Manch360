import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShoppingBag, Package, ExternalLink, MapPin, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DigitalProductInline from "./DigitalProductInline";
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

interface Shipment {
    awb_code: string | null;
    courier_name: string | null;
    shiprocket_order_id: string | null;
}

interface Order {
    id: string;
    amount: number;
    status: string;
    shipment_status: string;
    created_at: string;
    delivery_address: any;
    product_id: string | null;
    products: { name: string; type: string; file_url?: string; usage_instructions?: string } | null;
    shipments: Shipment[];
}

const statusColors: Record<string, string> = {
    completed: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800",
    processing: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
    cancelled: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
};

const shipmentStatusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800",
    shipped: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
    delivered: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
    failed: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
    cancelled: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
};

export default function LearnerOrdersManager() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewingProductId, setViewingProductId] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from("orders")
                .select(`
                  id,
                  amount,
                  status,
                  shipment_status,
                  created_at,
                  delivery_address,
                  product_id,
                  products (
                    name,
                    type,
                    file_url,
                    usage_instructions
                  ),
                  shipments (
                    awb_code,
                    courier_name,
                    shiprocket_order_id
                  )
                `)
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            if (error) throw error;
            setOrders((data as any) || []);
        } catch (err: any) {
            console.error("Error fetching orders:", err);
            toast.error("Failed to load your orders");
        } finally {
            setLoading(false);
        }
    };

    const handleTrack = (awb: string) => {
        window.open(`https://shiprocket.co/tracking/${awb}`, "_blank");
    };

    const cancelOrder = async (orderId: string) => {
        try {
            const toastId = toast.loading("Processing refund and cancelling order...");
            
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
                throw new Error(data.error || "Failed to process cancellation");
            }
            
            await fetchOrders();
            toast.success("Order cancelled and refund initiated", { id: toastId });
        } catch (err: any) {
            console.error("Cancel error:", err);
            toast.error(err.message || "Failed to cancel order");
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            {viewingProductId ? (
                <DigitalProductInline 
                    productId={viewingProductId} 
                    onBack={() => setViewingProductId(null)} 
                />
            ) : (
                <>
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-4xl font-black dark:text-white tracking-tight">My Orders</h1>
                            <p className="text-muted-foreground font-medium mt-1">Track and manage your purchases</p>
                        </div>
                    </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : orders.length === 0 ? (
                <Card className="shadow-soft border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl">
                    <CardContent className="py-20 text-center">
                        <div className="w-20 h-20 bg-primary/5 dark:bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <ShoppingBag className="w-10 h-10 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold mb-2 dark:text-white">No orders yet</h3>
                        <p className="text-muted-foreground mb-8 max-w-sm mx-auto">Your purchases will appear here. Ready to find something new?</p>
                        <Button 
                            className="rounded-2xl h-12 px-8 font-bold shadow-lg shadow-primary/20"
                            onClick={() => window.dispatchEvent(new CustomEvent('changeTab', { detail: 'explore' }))}
                        >
                            Explore Products
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6">
                    {orders.map((order) => {
                        const shipment = order.shipments?.[0];
                        const addr = order.delivery_address as any;
                        const isPhysical = order.products?.type === "physical";

                        return (
                            <Card key={order.id} className="border-none shadow-soft overflow-hidden rounded-3xl bg-white dark:bg-zinc-900/40 backdrop-blur-sm">
                                <CardHeader className="pb-4">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                        <div>
                                            <CardTitle className="text-lg font-bold dark:text-white group-hover:text-primary transition-colors">
                                                {order.products?.name || "Product"}
                                            </CardTitle>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                                    Order #{order.id.substring(0, 8).toUpperCase()}
                                                </span>
                                                <span className="text-[10px] opacity-30 font-black">•</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                                    {new Date(order.created_at).toLocaleDateString("en-IN", {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:items-end gap-2">
                                            <span className="text-2xl font-black text-primary">₹{Number(order.amount).toFixed(2)}</span>
                                            <div className="flex gap-2 flex-wrap md:justify-end">
                                                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${statusColors[order.status] || ""}`}>
                                                    {order.status}
                                                </span>
                                                {isPhysical && (
                                                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${shipmentStatusColors[order.shipment_status] || ""}`}>
                                                        {order.shipment_status}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Delivery address */}
                                        {addr && (
                                            <div className="flex items-start gap-3 text-sm bg-gray-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800">
                                                <MapPin className="h-5 w-5 flex-shrink-0 text-primary mt-0.5" />
                                                <div className="space-y-1">
                                                    <p className="font-bold dark:text-zinc-200">{addr.fullName}</p>
                                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                                        {addr.addressLine}, {addr.city}, {addr.state} – {addr.pincode}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Shipment or Digital Access */}
                                        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                                            {isPhysical ? (
                                                <div className="flex items-center gap-3">
                                                    <Truck className="h-5 w-5 text-primary" />
                                                    <div className="space-y-0.5">
                                                        <p className="font-bold text-sm dark:text-zinc-200">
                                                            {shipment?.courier_name || "Shipping Status"}
                                                        </p>
                                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                                            {shipment?.awb_code ? `AWB: ${shipment.awb_code}` : order.shipment_status}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <Package className="h-5 w-5 text-primary" />
                                                    <div className="space-y-0.5">
                                                        <p className="font-bold text-sm dark:text-zinc-200">Digital Access</p>
                                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Instant Delivery</p>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                {isPhysical ? (
                                                    shipment?.awb_code ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="rounded-xl h-9 px-4 font-bold border-gray-200 dark:border-zinc-700"
                                                            onClick={() => handleTrack(shipment.awb_code!)}
                                                        >
                                                            <ExternalLink className="h-4 w-4 mr-2" />
                                                            Track
                                                        </Button>
                                                    ) : order.status === "completed" && order.shipment_status === "pending" && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="rounded-xl h-9 px-4 font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                                                >
                                                                    Cancel Order
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="rounded-3xl border-none">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Cancel Order?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        Immediate refund will be processed to your account.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="rounded-xl">Wait, Keep it</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        onClick={() => cancelOrder(order.id)}
                                                                        className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white"
                                                                    >
                                                                        Confirm & Refund
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        className="rounded-xl h-9 px-4 font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                                        onClick={() => setViewingProductId(order.product_id)}
                                                    >
                                                        Access Product
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
            </>
            )}
        </div>
    );
}
