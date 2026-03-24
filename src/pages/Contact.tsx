import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Contact = () => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    message: ""
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('contact_messages')
        .insert([
          { 
            first_name: formData.firstName, 
            last_name: formData.lastName, 
            email: formData.email, 
            message: formData.message 
          }
        ]);

      if (error) throw error;

      toast({
        title: "Message Sent",
        description: "We'll get back to you as soon as possible!",
      });
      setFormData({ firstName: "", lastName: "", email: "", message: "" });
    } catch (error: any) {
      console.error("Error submitting form:", error);
      toast({
        title: "Submission failed",
        description: error.message || "Failed to send message. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 py-12 relative transition-colors duration-500 dark:bg-black">
      {/* Background Accents */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse delay-700" />
      </div>

      <Card className="w-full max-w-lg relative z-10 border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl rounded-[2rem] dark:bg-[#111111] dark:border-white/10 transition-all duration-500">
        <CardHeader className="text-center space-y-4 pt-6 px-8">
          <CardTitle className="text-4xl md:text-5xl font-black tracking-tighter transition-all dark:text-white">
            Get in Touch
          </CardTitle>
          <CardDescription className="text-lg font-medium dark:text-white/40">
            I'd like to hear from you!
            <br />
            <span className="text-sm">If you have any inquiries or just want to say hi, please use the contact form!</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-white/30 ml-1">
                  First Name
                </label>
                <Input
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="rounded-xl h-12 bg-background dark:bg-black border-border/50 dark:border-white/10 transition-all focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-white/30 ml-1">
                  Last Name
                </label>
                <Input
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="rounded-xl h-12 bg-background dark:bg-black border-border/50 dark:border-white/10 transition-all focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-white/30 ml-1">
                Email *
              </label>
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="rounded-xl h-12 bg-background dark:bg-black border-border/50 dark:border-white/10 transition-all focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-white/30 ml-1">
                Message
              </label>
              <Textarea
                placeholder="How can we help you?"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="rounded-2xl min-h-[120px] bg-background dark:bg-black border-border/50 dark:border-white/10 transition-all focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
            <Button 
              type="submit" 
              disabled={loading}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-lg transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Message"
              )}
            </Button>
            
            <div className="text-center pt-2">
              <Link to="/" className="text-xs font-medium text-muted-foreground hover:text-primary dark:text-white/20 dark:hover:text-white transition-colors">
                Back to Home
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Contact;
