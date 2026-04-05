import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, ExternalLink, Heart } from "lucide-react";
import { S3Media } from "@/components/S3Media";
import { toast } from "sonner";

interface SubscriptionsInlineProps {
  onViewStorefront?: (creatorId: string) => void;
}

export default function SubscriptionsInline({ onViewStorefront }: SubscriptionsInlineProps) {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch subscription records for the current learner
      const { data: subs, error: subsError } = await supabase
        .from("subscriptions" as any)
        .select("creator_id, created_at")
        .eq("learner_id", user.id);

      if (subsError) {
        console.error("Error fetching subscriptions:", subsError);
        setLoading(false);
        return;
      }

      if (!subs || subs.length === 0) {
        setSubscriptions([]);
        setLoading(false);
        return;
      }

      // Fetch creator profiles for subscribed creators
      const creatorIds = (subs as any[]).map((s: any) => s.creator_id);
      const { data: creators, error: creatorsError } = await supabase
        .from("public_profiles_with_roles" as any)
        .select("*")
        .in("id", creatorIds);

      if (creatorsError) {
        console.error("Error fetching creator profiles:", creatorsError);
      }

      setSubscriptions(creators || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async (creatorId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("subscriptions" as any)
        .delete()
        .eq("learner_id", user.id)
        .eq("creator_id", creatorId);

      if (error) {
        toast.error("Failed to unsubscribe");
        return;
      }

      toast.success("Unsubscribed successfully");
      setSubscriptions(prev => prev.filter(c => c.id !== creatorId));
    } catch (error) {
      console.error("Error unsubscribing:", error);
      toast.error("Failed to unsubscribe");
    }
  };

  const handleViewStorefront = (creatorId: string) => {
    if (onViewStorefront) {
      onViewStorefront(creatorId);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="max-w-4xl mb-12">
        <h1 className="text-4xl font-black dark:text-white tracking-tight mb-4">My Subscriptions</h1>
        <p className="text-xl text-muted-foreground font-medium mb-8">
          Creators you follow. Subscribe to new creators via their shared profile links.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-zinc-500 font-medium">Loading your subscriptions...</p>
        </div>
      ) : subscriptions.length === 0 ? (
        <Card className="shadow-soft border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl max-w-2xl">
          <CardContent className="py-20 text-center">
            <div className="w-20 h-20 bg-primary/5 dark:bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Heart className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2 dark:text-white">No subscriptions yet</h3>
            <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
              When a creator shares their page link with you, visit their profile and click <strong>Subscribe</strong> to follow them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {subscriptions.map((creator) => (
            <Card key={creator.id} className="group overflow-hidden border-none shadow-soft hover:shadow-hover transition-all hover:scale-[1.02] rounded-[2rem] bg-white dark:bg-zinc-900/40 backdrop-blur-sm flex flex-col h-full">
              <div className="relative h-32 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-zinc-800 dark:to-zinc-900 overflow-hidden flex-shrink-0">
                {creator.banner_url && (
                  <S3Media
                    src={creator.banner_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700"
                  />
                )}
                <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
              </div>
              <CardHeader className="relative pb-2">
                <div className="flex items-start justify-between">
                  {creator.avatar_url ? (
                    <div className="w-16 h-16 rounded-2xl border-4 border-white dark:border-zinc-950 absolute -top-10 left-6 shadow-xl overflow-hidden bg-white dark:bg-zinc-900">
                      <S3Media
                        src={creator.avatar_url}
                        alt={creator.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl border-4 border-white dark:border-zinc-950 absolute -top-10 left-6 shadow-xl bg-primary/10 flex items-center justify-center text-xl font-black text-primary uppercase">
                      {creator.name?.charAt(0)}
                    </div>
                  )}
                  {creator.is_verified && (
                    <span className="flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3 py-1 rounded-full ml-auto">
                      <ShieldCheck className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                </div>
                <div className="mt-10">
                  <CardTitle className="text-lg dark:text-white group-hover:text-primary transition-colors font-bold">
                    {creator.name || "Creator"}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <p className="text-sm text-gray-500 dark:text-zinc-500 mb-6 line-clamp-2 font-medium min-h-[40px] leading-relaxed">
                  {creator.bio || "Crafting digital experiences and sharing knowledge with the community."}
                </p>
                <div className="mt-auto flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => handleViewStorefront(creator.id)}
                    className="flex-1 h-11 rounded-2xl border-gray-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-primary dark:hover:border-primary hover:bg-primary hover:text-white hover:border-primary transition-all duration-300 font-bold gap-2"
                  >
                    View Storefront
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleUnsubscribe(creator.id)}
                    className="h-11 w-11 rounded-2xl text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all duration-300 flex-shrink-0"
                    title="Unsubscribe"
                  >
                    <Heart className="h-4 w-4 fill-current" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
