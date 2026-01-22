import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ProfileEditor from "./ProfileEditor";

export default function LearnerDashboard() {
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    fetchEnrollments();
    fetchOrders();
  }, []);

  const fetchEnrollments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("enrollments")
      .select("*, courses(*)")
      .eq("user_id", user.id);

    setEnrollments(data || []);
  };

  const fetchOrders = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("orders")
      .select(`
        *,
        products (
          name,
          description,
          media_urls,
          type
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setOrders(data || []);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">My Learning</h1>

      <Tabs defaultValue="courses" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg mb-8">
          <TabsTrigger value="courses">My Courses</TabsTrigger>
          <TabsTrigger value="orders">My Orders</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="courses">
          {enrollments.length === 0 ? (
            <Card className="shadow-soft">
              <CardContent className="py-12 text-center">
                <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">You haven't enrolled in any courses yet.</p>
                <p className="text-sm text-muted-foreground">
                  Visit the <a href="/explore" className="text-primary hover:underline">Explore</a> page to discover courses!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrollments.map((enrollment) => (
                <Card key={enrollment.id} className="shadow-soft hover:shadow-hover transition-all cursor-pointer"
                  onClick={() => navigate(`/course/${enrollment.courses?.id}`)}>
                  <CardHeader>
                    <CardTitle>{enrollment.courses?.title}</CardTitle>
                    <CardDescription>{enrollment.courses?.category}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span className="font-medium">{enrollment.progress}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${enrollment.progress}%` }}
                        />
                      </div>
                      <Button className="w-full" size="sm">
                        Continue Learning
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders">
          {orders.length === 0 ? (
            <Card className="shadow-soft">
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">You haven't made any purchases yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} className="shadow-soft">
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      {/* Product Image */}
                      {order.products?.media_urls && order.products.media_urls.length > 0 && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                          {order.products.media_urls[0].includes('.mp4') || order.products.media_urls[0].includes('.webm') ? (
                            <video src={order.products.media_urls[0]} className="w-full h-full object-cover" />
                          ) : (
                            <img src={order.products.media_urls[0]} alt={order.products.name} className="w-full h-full object-cover" />
                          )}
                        </div>
                      )}

                      {/* Order Details */}
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-lg">{order.products?.name || 'Product'}</p>
                            <p className="text-sm text-muted-foreground">
                              Order #{order.id.slice(0, 8)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-primary">₹{Number(order.amount).toFixed(2)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mt-3">
                          {order.products?.type && (
                            <span className="px-3 py-1 rounded-full text-xs bg-secondary text-secondary-foreground">
                              {order.products.type}
                            </span>
                          )}
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                              order.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                order.status === 'processing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            }`}>
                            {order.status}
                          </span>
                          <p className="text-xs text-muted-foreground ml-auto">
                            {new Date(order.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="profile">
          <ProfileEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}