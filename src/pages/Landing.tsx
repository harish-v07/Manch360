import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Sparkles, Users, TrendingUp } from "lucide-react";
import heroBanner from "@/assets/hero-banner.jpg";
import creator1 from "@/assets/featured-creator-1.jpg";
import creator2 from "@/assets/featured-creator-2.jpg";
import creator3 from "@/assets/featured-creator-3.jpg";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 gradient-hero relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url(${heroBanner})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="container mx-auto relative z-10">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Empower your creativity.
              <br />
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Teach. Share. Earn.
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8">
              Your all-in-one platform to teach courses, sell products, and grow your creative business.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth?mode=signup">
                <Button size="lg" variant="default">
                  Join
                </Button>
              </Link>
              <Link to="/explore">
                <Button size="lg" variant="outline">
                  Explore Creators
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">How It Works</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Start your creative journey in three simple steps
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="border-2 hover:border-primary transition-all duration-300 shadow-soft hover:shadow-hover gradient-card">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Create your space</h3>
                <p className="text-muted-foreground">
                  Set up your creator profile and customize your storefront to showcase your unique brand.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-secondary transition-all duration-300 shadow-soft hover:shadow-hover gradient-card">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-secondary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Upload your content</h3>
                <p className="text-muted-foreground">
                  Share your knowledge through courses or sell your creative products directly to your audience.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-accent transition-all duration-300 shadow-soft hover:shadow-hover gradient-card">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Start earning</h3>
                <p className="text-muted-foreground">
                  Connect with learners and customers while building a sustainable creative business.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Featured Creators */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">Featured Creators</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Discover talented creators sharing their passion and expertise
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { img: creator1, name: "Art & Design", tag: "Visual Arts" },
              { img: creator2, name: "Music Production", tag: "Music" },
              { img: creator3, name: "Dance & Movement", tag: "Performance" },
            ].map((creator, idx) => (
              <Card key={idx} className="overflow-hidden hover:scale-105 transition-transform duration-300 shadow-soft hover:shadow-hover">
                <img src={creator.img} alt={creator.name} className="w-full h-48 object-cover" />
                <CardContent className="p-6">
                  <div className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm mb-3">
                    {creator.tag}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{creator.name}</h3>
                  <Link to="/explore">
                    <Button variant="ghost" className="mt-2 p-0 h-auto">
                      View Storefront →
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}