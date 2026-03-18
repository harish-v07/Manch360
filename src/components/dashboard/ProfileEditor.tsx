import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { profileSchema } from "@/lib/validation";
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
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function ProfileEditor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    show_watermark: false,
  });
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
    } else if (data) {
      setFormData({
        name: data.name || "",
        email: data.email || "",
        show_watermark: data.show_watermark || false,
      });

      // Fetch role from user_roles table
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      setUserRole(roleData?.role || "learner");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate input
    const validation = profileSchema.safeParse({ ...formData, bio: "", banner_url: "", avatar_url: "", social_links: {} });
    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        name: formData.name,
        email: formData.email,
        show_watermark: formData.show_watermark,
      })
      .eq("id", user.id);

    if (error) {
      toast.error("Error updating profile");
      console.error(error);
    } else {
      toast.success("Profile updated successfully!");
    }

    setLoading(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const { error } = await supabase.functions.invoke('delete-account', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        toast.error("Failed to delete account");
        console.error(error);
      } else {
        toast.success("Account deleted successfully");
        await supabase.auth.signOut();
        navigate("/");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="shadow-soft dark:bg-zinc-900/40 dark:border-zinc-800 transition-colors">
      <CardHeader>
        <CardTitle className="dark:text-white transition-colors">Edit Profile</CardTitle>
        <CardDescription className="dark:text-zinc-500 transition-colors">Update your personal information</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="dark:text-zinc-300 transition-colors">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Your name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="dark:text-zinc-300 transition-colors">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
            />
          </div>

          {userRole === "creator" && (
            <div className="flex items-center justify-between space-x-2 rounded-2xl border p-6 dark:border-zinc-800 dark:bg-zinc-950/50 transition-colors">
              <div className="space-y-0.5">
                <Label htmlFor="watermark" className="dark:text-zinc-200 transition-colors">Enable Watermark</Label>
                <p className="text-sm text-muted-foreground dark:text-zinc-500 transition-colors">
                  Display your name as a watermark on course content
                </p>
              </div>
              <Switch
                id="watermark"
                checked={formData.show_watermark}
                onCheckedChange={(checked) => setFormData({ ...formData, show_watermark: checked })}
              />
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-white font-bold transition-all">
            {loading ? "Saving..." : "Save Changes"}
          </Button>

          <div className="mt-8 pt-6 border-t border-border dark:border-zinc-800">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" disabled={deleting}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="dark:bg-zinc-950 dark:border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle className="dark:text-white">Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription className="dark:text-zinc-500">
                    This action cannot be undone. This will permanently delete your account
                    and remove all your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting..." : "Delete Account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
