import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Search, ShieldCheck, ExternalLink } from "lucide-react";
import { S3Media } from "@/components/S3Media";

export default function CreatorExplore() {
  const [creators, setCreators] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="relative max-w-2xl mx-auto shadow-2xl rounded-2xl overflow-hidden">
        <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-zinc-500 h-5 w-5" />
        <Input
          type="text"
          placeholder="Search creators by name, niche or keyword..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-14 h-16 text-lg border-none bg-white dark:bg-zinc-900 focus-visible:ring-primary dark:text-white transition-all shadow-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-zinc-500 font-medium">Discovering creators...</p>
        </div>
      ) : filteredCreators.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900/40 rounded-[2.5rem] p-20 border border-gray-100 dark:border-zinc-800 text-center">
          <p className="text-gray-500 dark:text-zinc-500 font-bold text-xl mb-2">No creators found</p>
          <p className="text-gray-400 dark:text-zinc-600 text-sm">Try a different search term or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredCreators.map((creator) => (
            <Card key={creator.id} className="overflow-hidden shadow-soft hover:shadow-hover dark:bg-zinc-900/40 dark:border-zinc-800 transition-all group border-gray-100">
              <div className="relative h-28 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-zinc-800 dark:to-zinc-900 overflow-hidden">
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
                  <div className="relative">
                    {creator.avatar_url ? (
                      <div className="w-16 h-16 rounded-2xl border-4 border-white dark:border-zinc-950 absolute -top-12 left-0 shadow-xl overflow-hidden bg-white dark:bg-zinc-900">
                        <S3Media
                          src={creator.avatar_url}
                          alt={creator.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-2xl border-4 border-white dark:border-zinc-950 absolute -top-12 left-0 shadow-xl bg-primary/10 flex items-center justify-center text-xl font-black text-primary uppercase">
                        {creator.name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  {creator.is_verified && (
                    <span className="flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3 py-1 rounded-full">
                      <ShieldCheck className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                </div>
                <div className="mt-8">
                  <CardTitle className="text-lg dark:text-white group-hover:text-primary transition-colors">{creator.name || "Creator"}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 dark:text-zinc-500 mb-6 line-clamp-2 font-medium min-h-[40px]">
                  {creator.bio || "Crafting digital experiences and sharing knowledge."}
                </p>
                <Link to={`/creator/${creator.id}`}>
                  <Button variant="outline" className="w-full h-11 rounded-xl border-gray-200 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-all font-bold gap-2">
                    View Storefront
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
