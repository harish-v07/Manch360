import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Search, ShieldCheck, ExternalLink } from "lucide-react";
import { S3Media } from "@/components/S3Media";
import CreatorStorefrontInline from "./CreatorStorefrontInline";

interface ExploreInlineProps {
  onViewStorefront?: (creatorId: string) => void;
}

export default function ExploreInline({ onViewStorefront }: ExploreInlineProps) {
  const [creators, setCreators] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [internalPreviewId, setInternalPreviewId] = useState<string | null>(null);

  useEffect(() => {
    fetchCreators();
  }, []);

  const fetchCreators = async () => {
    const { data, error } = await supabase
      .from("public_profiles_with_roles" as any)
      .select("*")
      .eq("role", "creator")
      .eq("status", "active");

    if (error) {
      console.error("Error fetching creators:", error);
    } else {
      setCreators(data || []);
    }
    setLoading(false);
  };

  const filteredCreators = creators.filter((creator) =>
    (creator.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (creator.bio || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewStorefront = (creatorId: string) => {
    if (onViewStorefront) {
      onViewStorefront(creatorId);
    } else {
      setInternalPreviewId(creatorId);
    }
  };

  if (internalPreviewId) {
    return (
      <CreatorStorefrontInline 
        creatorId={internalPreviewId} 
        onBack={() => setInternalPreviewId(null)} 
      />
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="max-w-4xl mb-12">
        <h1 className="text-4xl font-black dark:text-white tracking-tight mb-4">Explore Creators</h1>
        <p className="text-xl text-muted-foreground font-medium mb-8">
          Discover talented creators and learn from the best in the network.
        </p>

        <div className="relative max-w-xl">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
          <Input
            type="text"
            placeholder="Search by creator, category, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-14 text-lg rounded-2xl bg-white dark:bg-zinc-900 border-none shadow-soft focus-visible:ring-primary/20 transition-all font-medium"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-zinc-500 font-medium">Discovering creators...</p>
        </div>
      ) : filteredCreators.length === 0 ? (
        <Card className="shadow-soft border-none bg-white dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl max-w-2xl">
          <CardContent className="py-20 text-center">
            <p className="text-muted-foreground font-medium mb-4">
              {searchQuery ? "No creators found matching your search." : "No creators available yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredCreators.map((creator) => (
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
                <div className="mt-auto">
                  <Button 
                    variant="outline" 
                    onClick={() => handleViewStorefront(creator.id)}
                    className="w-full h-11 rounded-2xl border-gray-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-primary dark:hover:border-primary hover:bg-primary hover:text-white hover:border-primary transition-all duration-300 font-bold gap-2"
                  >
                    View Storefront
                    <ExternalLink className="h-3.5 w-3.5" />
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
