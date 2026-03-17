import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Sparkles, Users, TrendingUp, ChevronRight, ArrowRight, Play, Star, CheckCircle2 } from "lucide-react";
import creator1 from "@/assets/featured-creator-1.jpg";
import creator2 from "@/assets/featured-creator-2.jpg";
import creator3 from "@/assets/featured-creator-3.jpg";

export default function Landing() {
  const revealRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.1 }
    );

    revealRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const addToRefs = (el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-32 px-4 overflow-hidden border-b border-border/50 bg-background">
        <div className="mesh-gradient-container">
          <div className="mesh-blob mesh-blob-1" />
          <div className="mesh-blob mesh-blob-2" />
          <div className="mesh-blob mesh-blob-3" />
          <div className="mesh-blob mesh-blob-4" />
        </div>
        <div className="absolute inset-0 dot-grid opacity-[0.03] pointer-events-none" />

        <div className="container mx-auto relative z-10">
          <div className="max-w-5xl mx-auto text-center space-y-10 pt-16">
            <h1 className="text-7xl md:text-[100px] font-black tracking-[-0.05em] leading-[0.9] animate-fade-in text-foreground drop-shadow-sm">
              Empower your
              <span className="block text-foreground/90">
                creativity
              </span>
            </h1>

            <p className="text-xl md:text-3xl text-muted-foreground max-w-2xl mx-auto leading-relaxed stagger-1 animate-fade-in font-semibold tracking-tight">
              Teach. Share. Earn.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4 stagger-2 animate-fade-in">
              <Link to="/auth?mode=signup">
                <Button size="lg" className="h-14 px-8 text-lg rounded-full font-bold shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-300">
                  Join for free
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link to="/explore">
                <Button size="lg" variant="ghost" className="h-14 px-8 text-lg rounded-full font-semibold group">
                  Explore Creators
                  <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-32 px-4 bg-muted/20 dark:bg-black transition-colors duration-500">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center mb-20 reveal-on-scroll" ref={addToRefs}>
            <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tighter dark:text-white">How It Works</h2>
            <p className="text-lg text-muted-foreground font-medium dark:text-white/40">
              Start your creative journey in three simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: <Sparkles className="w-6 h-6" />,
                title: "Create your space",
                desc: "Set up your creator profile and customize your storefront to showcase your unique brand.",
                color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                hoverClass: "hover:border-purple-500/50 hover:shadow-purple-500/20 dark:hover:border-purple-500/40 dark:hover:shadow-purple-500/40"
              },
              {
                icon: <Users className="w-6 h-6" />,
                title: "Upload your content",
                desc: "Share your knowledge through courses or sell your creative products directly to your audience.",
                color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                hoverClass: "hover:border-emerald-500/50 hover:shadow-emerald-500/20 dark:hover:border-emerald-500/40 dark:hover:shadow-emerald-500/40"
              },
              {
                icon: <TrendingUp className="w-6 h-6" />,
                title: "Start earning",
                desc: "Connect with learners and customers while building a sustainable creative business.",
                color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
                hoverClass: "hover:border-orange-500/50 hover:shadow-orange-500/20 dark:hover:border-orange-500/40 dark:hover:shadow-orange-500/40"
              }
            ].map((step, i) => (
              <Card 
                key={i} 
                className={`flex flex-col items-center text-center p-8 space-y-6 reveal-on-scroll stagger-${i+1} border-border/50 bg-card dark:bg-[#111111] dark:border-white/10 rounded-[2rem] shadow-sm transition-all duration-500 hover:scale-[1.02] ${step.hoverClass}`}
                ref={addToRefs}
              >
                <div className={`w-16 h-16 rounded-full ${step.color} flex items-center justify-center`}>
                  {step.icon}
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold tracking-tight dark:text-white">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm font-medium dark:text-white/40">
                    {step.desc}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Creators */}
      <section className="py-20 px-4 bg-background border-y border-border/50 dark:bg-black dark:border-white/10 transition-colors duration-500">
        <div className="container mx-auto">
          <div className="text-center mb-12 space-y-3 reveal-on-scroll" ref={addToRefs}>
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-foreground dark:text-white">Featured Creators</h2>
            <p className="text-base text-muted-foreground max-w-lg mx-auto font-medium dark:text-white/40">
              Discover talented creators sharing their passion and expertise
            </p>
          </div>
 
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { img: creator1, name: "Art & Design", tag: "Visual Arts" },
              { img: creator2, name: "Music Production", tag: "Music" },
              { img: creator3, name: "Dance & Movement", tag: "Performance" },
            ].map((creator, idx) => (
              <Card 
                key={idx} 
                className="group overflow-hidden border border-border/50 bg-card dark:bg-[#111111] dark:border-white/10 rounded-xl reveal-on-scroll stagger-1 transition-all duration-500 hover:scale-[1.01] hover:border-black/20 dark:hover:border-white/30 hover:shadow-xl dark:hover:shadow-white/10"
                ref={addToRefs}
              >
                <div className="relative aspect-video overflow-hidden">
                  <img 
                    src={creator.img} 
                    alt={creator.name} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                  />
                </div>
                <CardContent className="p-5 space-y-4">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-muted dark:bg-white/5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground dark:text-white/40">
                    {creator.tag}
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-foreground dark:text-white">
                      {creator.name}
                    </h3>
                    <Link to="/explore" className="inline-flex items-center text-xs font-bold text-muted-foreground dark:text-white/30 group-hover:text-primary dark:group-hover:text-white transition-colors duration-300">
                      View Storefront <ArrowRight className="ml-1 w-3 h-3 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-4 relative overflow-hidden">
        <div className="container mx-auto relative z-10">
          <div className="max-w-5xl mx-auto bg-[#111111] border border-white/10 rounded-[3rem] p-12 md:p-24 text-center space-y-10 reveal-on-scroll relative overflow-hidden" ref={addToRefs}>
            <div className="relative z-10 space-y-6">
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-white">Ready to start creating?</h2>
              <p className="text-xl text-white/40 max-w-2xl mx-auto leading-relaxed font-medium">
                Join Manch360 today and turn your expertise into a thriving creative business.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                <Link to="/auth?mode=signup">
                  <Button size="lg" className="rounded-full px-10 h-14 text-lg font-bold bg-white text-black hover:bg-white/90 transition-all duration-300">
                    Get Started Now
                  </Button>
                </Link>
                <Link to="/explore">
                  <Button size="lg" variant="outline" className="rounded-full px-10 h-14 text-lg font-bold border-white/20 text-white bg-transparent hover:bg-white/[0.05] hover:border-white/40 transition-all duration-300">
                    Explore Creators
                  </Button>
                </Link>
              </div>
            </div>
            {/* Premium background glow for the dark CTA */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}