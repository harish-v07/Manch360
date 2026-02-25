import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";
import { S3Media } from "@/components/S3Media";

export default function Explore() {
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
    creator.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    creator.bio?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="pt-32 pb-20 px-4">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h1 className="text-5xl font-bold mb-4">Explore Creators</h1>
            <p className="text-xl text-muted-foreground mb-8">
              Discover talented creators and learn from the best
            </p>

            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by creator, category, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg rounded-xl"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading creators...</p>
            </div>
          ) : filteredCreators.length === 0 ? (
            <Card className="shadow-soft max-w-2xl mx-auto">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? "No creators found matching your search." : "No creators available yet."}
                </p>
                <p className="text-sm text-muted-foreground">
                  Be the first to join as a creator!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredCreators.map((creator) => (
                <Card key={creator.id} className="overflow-hidden shadow-soft hover:shadow-hover transition-all hover:scale-105">
                  <div className="relative h-32 bg-gradient-to-r from-primary/20 to-secondary/20 overflow-hidden">
                    {creator.banner_url && (
                      <S3Media
                        src={creator.banner_url}
                        alt="Creator Banner"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <CardHeader className="relative">
                    {creator.avatar_url ? (
                      <div className="w-20 h-20 rounded-full border-4 border-background absolute -top-10 left-6 shadow-lg overflow-hidden bg-background">
                        <S3Media
                          src={creator.avatar_url}
                          alt={creator.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full border-4 border-background absolute -top-10 left-6 shadow-lg bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                        {creator.name?.charAt(0)}
                      </div>
                    )}
                    <CardTitle className="mt-12">{creator.name || "Creator"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                      {creator.bio || "No bio available"}
                    </p>
                    <Link to={`/creator/${creator.id}`}>
                      <Button variant="outline" className="w-full">
                        View Storefront
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}