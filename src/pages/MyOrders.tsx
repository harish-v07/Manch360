import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { toast } from "sonner";
import { ShoppingBag, Package, ExternalLink, MapPin, Truck, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
    completed: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    processing: "bg-blue-100 text-blue-700 border-blue-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
};

const shipmentStatusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    shipped: "bg-blue-100 text-blue-700 border-blue-200",
    delivered: "bg-green-100 text-green-700 border-green-200",
    failed: "bg-red-100 text-red-700 border-red-200",
};

export default function MyOrders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate("/auth");
                return;
            }

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
                .eq("item_type", "product")
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

    return (
        <div className="min-h-screen bg-gradient-hero">
            <Navbar />
            <div className="container mx-auto px-4 pt-32 pb-20 max-w-3xl">
                <div className="flex items-center gap-3 mb-8">
                    <ShoppingBag className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold">My Orders</h1>
                        <p className="text-muted-foreground text-sm">Track all your product orders</p>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-20 text-muted-foreground">Loading your orders...</div>
                ) : orders.length === 0 ? (
                    <Card className="text-center py-16">
                        <CardContent>
                            <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-40" />
                            <p className="text-lg font-semibold mb-2">No orders yet</p>
                            <p className="text-muted-foreground mb-6">Your product orders will appear here once you make a purchase.</p>
                            <Button onClick={() => navigate("/explore")}>Explore Products</Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {orders.map((order) => {
                            const shipment = order.shipments?.[0];
                            const addr = order.delivery_address as any;

                            return (
                                <Card key={order.id} className="shadow-soft">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <CardTitle className="text-base font-semibold">
                                                    {order.products?.name || "Product"}
                                                </CardTitle>
                                                <CardDescription className="text-xs mt-1">
                                                    Order #{order.id.substring(0, 8).toUpperCase()} &bull;{" "}
                                                    {new Date(order.created_at).toLocaleDateString("en-IN", {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                    })}
                                                </CardDescription>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <span className="text-lg font-bold text-primary">₹{Number(order.amount).toFixed(2)}</span>
                                                <div className="flex gap-2 flex-wrap justify-end">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[order.status] || ""}`}>
                                                        Payment: {order.status}
                                                    </span>
                                                    {order.products?.type === "physical" && (
                                                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${shipmentStatusColors[order.shipment_status] || ""}`}>
                                                            Shipment: {order.shipment_status}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="space-y-3 pt-0">
                                        {/* Delivery address */}
                                        {addr && (
                                            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                                                <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" />
                                                <p>
                                                    {addr.fullName}, {addr.addressLine}, {addr.city}, {addr.state} – {addr.pincode}
                                                </p>
                                            </div>
                                        )}

                                        {/* Shipment tracking */}
                                        {order.products?.type === "physical" && (
                                            <div className="bg-muted/30 rounded-lg p-3">
                                                {shipment ? (
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-2">
                                                            <Truck className="h-4 w-4 text-primary flex-shrink-0" />
                                                            <div>
                                                                <p className="text-sm font-medium">
                                                                    {shipment.courier_name || "Courier"}
                                                                </p>
                                                                {shipment.awb_code && (
                                                                    <p className="text-xs text-muted-foreground">
                                                                        AWB: <span className="font-mono font-medium">{shipment.awb_code}</span>
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {shipment.awb_code && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="gap-2 flex-shrink-0"
                                                                onClick={() => handleTrack(shipment.awb_code!)}
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                                Track
                                                            </Button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Truck className="h-4 w-4" />
                                                        <span>
                                                            {order.shipment_status === "pending"
                                                                ? "Shipment is being prepared..."
                                                                : order.shipment_status === "failed"
                                                                    ? "Shipment could not be created. Please contact support."
                                                                    : "Awaiting shipment details"}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {order.products?.type === "digital" && (
                                            <div className="bg-muted/30 rounded-lg p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-2">
                                                        <Package className="h-4 w-4 text-primary flex-shrink-0" />
                                                        <p className="text-sm font-medium">Digital Product</p>
                                                    </div>
                                                    {order.products.file_url ? (
                                                        <Button
                                                            size="sm"
                                                            className="gap-2 flex-shrink-0"
                                                            onClick={() => window.open(order.products!.file_url, "_blank")}
                                                        >
                                                            <Download className="h-3 w-3" />
                                                            Download File
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">No file provided</span>
                                                    )}
                                                </div>
                                                {order.products.usage_instructions && (
                                                    <div className="text-sm border-t pt-3 mt-1">
                                                        <p className="font-semibold mb-1">How to use:</p>
                                                        <p className="text-muted-foreground whitespace-pre-wrap">{order.products.usage_instructions}</p>
                                                    </div>
                                                )}
                                                {!order.products.usage_instructions && !order.products.file_url && (
                                                    <p className="text-xs text-muted-foreground italic">Digital product – no shipping required.</p>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
