import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit, Shield, Ban, UserCheck, ChevronDown, ChevronUp, RefreshCw, Sparkles, CheckCircle2, XCircle, Clock, AlertTriangle, FileText, UserSquare2, IdCard, Search, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { getS3ViewUrl } from "@/lib/s3-upload";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  created_at: string;
  status: string;
  suspended_until: string | null;
  role: string;
  verification_status?: string;
  is_verified?: boolean;
}

interface AiScore {
  face_match_percentage: number;
  document_authentic: boolean;
  name_match: boolean;
  id_format_valid: boolean;
  confidence_score: number;
  reasoning: string;
  recommendation: "Approve" | "Reject" | "Review";
}

interface VerificationRequest {
  id: string;
  name: string;
  email: string;
  bio: string;
  verification_status: string;
  kyc_selfie_url: string | null;
  kyc_document_url: string | null;
  kyc_document_type: string | null;
  kyc_full_name: string | null;
  kyc_mobile: string | null;
  kyc_address: string | null;
  kyc_id_number: string | null;
  aiScore?: AiScore | null;
  scoring?: boolean;
  selfieDataUrl?: string;
  docDataUrl?: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [suspendDays, setSuspendDays] = useState<string>("7");
  const [currentAdminId, setCurrentAdminId] = useState<string>("");
  const [pendingBanUser, setPendingBanUser] = useState<UserProfile | null>(null);

  // Verification tab state
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [verLoading, setVerLoading] = useState(false);
  const [rejectUser, setRejectUser] = useState<VerificationRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verSearch, setVerSearch] = useState("");
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      toast.error("Please log in to access this page");
      navigate("/auth");
      return;
    }

    setCurrentAdminId(session.user.id);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      toast.error("Access denied. Admin privileges required.");
      navigate("/dashboard");
      return;
    }

    fetchUsers();
    fetchVerificationRequests();
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name, email, created_at, status, suspended_until")
      .order("created_at", { ascending: false });

    if (profilesError) {
      console.error("Error fetching users:", profilesError);
      toast.error("Failed to load users");
      setLoading(false);
      return;
    }

    const usersWithRoles = await Promise.all(
      (profilesData || []).map(async (profile) => {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id)
          .single();
        return {
          ...profile,
          status: profile.status || "active",
          role: roleData?.role || "learner",
        };
      })
    );

    setUsers(usersWithRoles);
    setLoading(false);
  };

  const fetchVerificationRequests = async () => {
    setVerLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, bio, verification_status, kyc_selfie_url, kyc_document_url, kyc_document_type, kyc_full_name, kyc_mobile, kyc_address, kyc_id_number")
      .in("verification_status", ["pending", "verified", "rejected"])
      .order("updated_at" as any, { ascending: false });

    if (error) {
      console.error("Error fetching verification requests:", error);
      setVerLoading(false);
      return;
    }

    // Load signed URLs for the images
    const requestsWithImages = await Promise.all((data || []).map(async (req: any) => {
      let selfieDataUrl = null;
      let docDataUrl = null;
      try {
        if (req.kyc_selfie_url) selfieDataUrl = await getS3ViewUrl(req.kyc_selfie_url);
      } catch (e) { console.error("Selfie load error", e) }
      try {
        if (req.kyc_document_url) docDataUrl = await getS3ViewUrl(req.kyc_document_url);
      } catch (e) { console.error("Doc load error", e) }

      return {
        ...req,
        aiScore: null,
        scoring: false,
        selfieDataUrl,
        docDataUrl
      };
    }));

    setVerificationRequests(requestsWithImages);
    setVerLoading(false);
  };

  // ── Invoke verify-seller edge function ────────────────────────────────────
  const invokeVerifySeller = async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/verify-seller`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error((json.details ? `${json.error}: ${json.details}` : json.error) || "Edge function failed");
    return json;
  };

  // ── Get AI Score ──────────────────────────────────────────────────────────
  const handleGetAiScore = async (req: VerificationRequest) => {
    setVerificationRequests((prev) =>
      prev.map((r) => r.id === req.id ? { ...r, scoring: true } : r)
    );
    try {
      const result = await invokeVerifySeller({ userId: req.id, action: "score" });
      setVerificationRequests((prev) =>
        prev.map((r) => r.id === req.id ? { ...r, aiScore: result.ai_score, scoring: false } : r)
      );
    } catch (err: any) {
      toast.error("Failed to get AI score: " + err.message);
      setVerificationRequests((prev) =>
        prev.map((r) => r.id === req.id ? { ...r, scoring: false } : r)
      );
    }
  };

  // ── Approve verification ──────────────────────────────────────────────────
  const handleApprove = async (req: VerificationRequest) => {
    try {
      await invokeVerifySeller({ userId: req.id, action: "approve" });
      toast.success(`${req.name} has been verified ✓`);
      fetchVerificationRequests();
    } catch (err: any) {
      toast.error("Failed to approve: " + err.message);
    }
  };

  // ── Reject verification ───────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectUser) return;
    try {
      await invokeVerifySeller({ userId: rejectUser.id, action: "reject", notes: rejectNotes });
      toast.success(`${rejectUser.name}'s verification has been rejected`);
      setRejectUser(null);
      setRejectNotes("");
      fetchVerificationRequests();
    } catch (err: any) {
      toast.error("Failed to reject: " + err.message);
    }
  };

  // ── Delete account entirely from DB ──────────────────────────────────────
  const handleDeleteUser = async (userId: string) => {
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        body: { userId },
      });
      if (error) throw error;
      toast.success("User deleted successfully");
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Failed to delete user");
    }
  };

  // ── Change role ───────────────────────────────────────────────────────────
  const handleUpdateRole = async () => {
    if (!selectedUser || !newRole) return;
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as "admin" | "creator" | "learner" })
        .eq("user_id", selectedUser.id);
      if (error) throw error;
      toast.success("Role updated successfully");
      setSelectedUser(null);
      setNewRole("");
      fetchUsers();
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error("Failed to update role");
    }
  };

  // ── Suspend temporarily ───────────────────────────────────────────────────
  const handleSuspend = async (userId: string) => {
    const days = parseInt(suspendDays, 10);
    if (!days || days < 1) {
      toast.error("Please enter a valid number of days");
      return;
    }
    const until = new Date();
    until.setDate(until.getDate() + days);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "suspended", suspended_until: until.toISOString() })
        .eq("id", userId);
      if (error) throw error;

      await supabase
        .from("profiles")
        .update({ active_session_id: null } as any)
        .eq("id", userId);

      toast.success(`User suspended for ${days} day(s)`);
      fetchUsers();
    } catch (error) {
      console.error("Error suspending user:", error);
      toast.error("Failed to suspend user");
    }
  };

  // ── Ban permanently ───────────────────────────────────────────────────────
  const handleBan = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "banned", suspended_until: null })
        .eq("id", userId);
      if (error) throw error;

      await supabase
        .from("profiles")
        .update({ active_session_id: null } as any)
        .eq("id", userId);

      toast.success("User banned permanently");
      fetchUsers();
    } catch (error) {
      console.error("Error banning user:", error);
      toast.error("Failed to ban user");
    }
  };

  // ── Reactivate ────────────────────────────────────────────────────────────
  const handleReactivate = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "active", suspended_until: null })
        .eq("id", userId);
      if (error) throw error;
      toast.success("User reactivated successfully");
      fetchUsers();
    } catch (error) {
      console.error("Error reactivating user:", error);
      toast.error("Failed to reactivate user");
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getStatusBadge = (user: UserProfile) => {
    if (user.status === "banned") {
      return <Badge variant="destructive">Banned</Badge>;
    }
    if (user.status === "suspended") {
      const until = user.suspended_until ? new Date(user.suspended_until) : null;
      if (until && until > new Date()) {
        const daysLeft = Math.ceil((until.getTime() - Date.now()) / 86400000);
        return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Suspended ({daysLeft}d left)</Badge>;
      }
      handleReactivate(user.id);
      return <Badge className="bg-green-600 text-white">Active</Badge>;
    }
    return <Badge className="bg-green-600 text-white">Active</Badge>;
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-purple-600 text-white",
      creator: "bg-blue-600 text-white",
      learner: "bg-gray-500 text-white",
    };
    return <Badge className={colors[role] || colors.learner}>{role}</Badge>;
  };

  const getVerStatusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-yellow-500 text-white gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    if (status === "verified") return <Badge className="bg-green-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" />Verified</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
    return <Badge variant="secondary">Unverified</Badge>;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto p-8 text-center pt-32">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading admin dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* ── Lightbox ── */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <img src={lightboxImg} alt="Full view" className="max-h-full max-w-full rounded-lg shadow-2xl object-contain" />
          <button className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none" onClick={() => setLightboxImg(null)}>✕</button>
        </div>
      )}

      {/* ── Ban confirmation dialog ── */}
      <AlertDialog open={!!pendingBanUser} onOpenChange={(open) => { if (!open) setPendingBanUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban User — {pendingBanUser?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>permanently ban</strong> <strong>{pendingBanUser?.email}</strong> from logging in.
              Their data will remain in the database. You can unban them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingBanUser(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pendingBanUser) { handleBan(pendingBanUser.id); setPendingBanUser(null); } }}
            >
              Ban Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reject verification dialog ── */}
      <Dialog open={!!rejectUser} onOpenChange={(open) => { if (!open) { setRejectUser(null); setRejectNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Verification — {rejectUser?.name}</DialogTitle>
            <DialogDescription>
              Provide a reason for rejection. This will be shown to the seller.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label>Rejection Reason (optional)</Label>
            <Textarea
              placeholder="e.g. Insufficient profile information, no bio provided..."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectUser(null); setRejectNotes(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}>Reject Verification</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto p-8 pt-28">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="verification" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Verification Requests
              {verificationRequests.filter(r => r.verification_status === "pending").length > 0 && (
                <span className="ml-1 bg-yellow-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {verificationRequests.filter(r => r.verification_status === "pending").length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ══ USER MANAGEMENT TAB ══════════════════════════════════════════════ */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Users</CardTitle>
                    <CardDescription>
                      Manage user accounts, roles, and access. Total: <strong>{users.length}</strong> users.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchUsers}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id} className={user.id === currentAdminId ? "bg-primary/5" : ""}>
                          <TableCell className="font-medium">
                            {user.name}
                            {user.id === currentAdminId && (
                              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                          <TableCell>{getRoleBadge(user.role)}</TableCell>
                          <TableCell>{getStatusBadge(user)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">

                              {/* ── Edit Role ── */}
                              {user.id !== currentAdminId && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => { setSelectedUser(user); setNewRole(user.role); }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Change Role — {selectedUser?.name}</DialogTitle>
                                      <DialogDescription>
                                        Update this user's platform role.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                      <Label>Role</Label>
                                      <Select value={newRole} onValueChange={setNewRole}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="learner">Learner</SelectItem>
                                          <SelectItem value="creator">Creator</SelectItem>
                                          <SelectItem value="admin">Admin</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <DialogFooter>
                                      <Button onClick={handleUpdateRole}>Save Changes</Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              )}

                              {/* ── Suspend / Ban / Reactivate dropdown ── */}
                              {user.id !== currentAdminId && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                      <Ban className="h-4 w-4 mr-1" />
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>Account Control</DropdownMenuLabel>
                                    <DropdownMenuSeparator />

                                    <div className="px-2 py-1.5">
                                      <Label className="text-xs text-muted-foreground mb-1 block">
                                        Suspend for (days)
                                      </Label>
                                      <div className="flex gap-2">
                                        <Input
                                          type="number"
                                          min="1"
                                          value={suspendDays}
                                          onChange={(e) => setSuspendDays(e.target.value)}
                                          className="h-7 text-sm"
                                        />
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => handleSuspend(user.id)}
                                        >
                                          Apply
                                        </Button>
                                      </div>
                                    </div>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600 cursor-pointer"
                                      onClick={() => setPendingBanUser(user)}
                                    >
                                      <Ban className="h-4 w-4 mr-2" />
                                      Ban Permanently
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}

                              {/* ── Unban / Reactivate ── */}
                              {user.id !== currentAdminId && (user.status === "suspended" || user.status === "banned") && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="text-green-600 border-green-600 hover:bg-green-600/10">
                                      <UserCheck className="h-4 w-4 mr-1" />
                                      Unban
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Unban / Reactivate — {user.name}</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will restore <strong>{user.email}</strong>'s access to the platform.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-green-600 text-white hover:bg-green-700"
                                        onClick={() => handleReactivate(user.id)}
                                      >
                                        Yes, Reactivate
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}

                              {/* ── Delete Account ── */}
                              {user.id !== currentAdminId && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Account — {user.name}</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete <strong>{user.name}</strong>'s account and ALL their data
                                        (courses, products, enrollments, orders). This action <strong>cannot be undone</strong>.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={() => handleDeleteUser(user.id)}
                                      >
                                        Delete Forever
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}

                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ VERIFICATION TAB ═════════════════════════════════════════════════ */}
          <TabsContent value="verification">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <CardTitle>Seller Verification Requests</CardTitle>
                    </div>
                    <CardDescription className="mt-1">
                      Click a row to expand full KYC details. Use Gemini AI to score before approving.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchVerificationRequests}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>

                {/* Search bar */}
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email…"
                    value={verSearch}
                    onChange={(e) => setVerSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>

              <CardContent>
                {verLoading ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">Loading requests…</p>
                  </div>
                ) : (() => {
                  const filtered = verificationRequests.filter(r =>
                    r.name?.toLowerCase().includes(verSearch.toLowerCase()) ||
                    r.email?.toLowerCase().includes(verSearch.toLowerCase())
                  );
                  return filtered.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">{verSearch ? "No matches found" : "No verification requests yet"}</p>
                      <p className="text-sm mt-1">{verSearch ? "Try a different search term." : "When sellers apply for verification, they'll appear here."}</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filtered.map((req) => {
                        const isExpanded = expandedId === req.id;
                        return (
                          <div key={req.id}>
                            {/* ── Compact row ── */}
                            <button
                              className="w-full flex items-center justify-between gap-3 py-3 px-1 hover:bg-muted/30 transition-colors text-left"
                              onClick={() => setExpandedId(isExpanded ? null : req.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold truncate">{req.name}</span>
                                    {getVerStatusBadge(req.verification_status)}
                                  </div>
                                  <p className="text-sm text-muted-foreground truncate">{req.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {req.verification_status === "pending" && (
                                  <>
                                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                                      onClick={(e) => { e.stopPropagation(); handleGetAiScore(req); }}
                                      disabled={req.scoring}>
                                      {req.scoring ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
                                      AI Score
                                    </Button>
                                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs gap-1"
                                      onClick={(e) => { e.stopPropagation(); handleApprove(req); }}>
                                      <CheckCircle2 className="h-3 w-3" /> Approve
                                    </Button>
                                    <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                                      onClick={(e) => { e.stopPropagation(); setRejectUser(req); setRejectNotes(""); }}>
                                      <XCircle className="h-3 w-3" /> Reject
                                    </Button>
                                  </>
                                )}
                                {req.verification_status === "verified" && (
                                  <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                                    onClick={(e) => { e.stopPropagation(); setRejectUser(req); setRejectNotes(""); }}>
                                    <XCircle className="h-3 w-3" /> Revoke
                                  </Button>
                                )}
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </button>

                            {/* ── Expanded details ── */}
                            {isExpanded && (
                              <div className="pb-5 pt-2 px-1 space-y-4">

                                {/* KYC text details */}
                                {req.kyc_full_name && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2 bg-muted/20 p-4 rounded-lg border">
                                      <h4 className="font-semibold flex items-center gap-2 text-sm border-b pb-2">
                                        <UserSquare2 className="h-4 w-4 text-primary" /> Personal Details
                                      </h4>
                                      <p className="text-sm"><span className="text-muted-foreground">Legal Name:</span> {req.kyc_full_name}</p>
                                      <p className="text-sm"><span className="text-muted-foreground">Mobile:</span> {req.kyc_mobile}</p>
                                      <p className="text-sm"><span className="text-muted-foreground">Address:</span> {req.kyc_address}</p>
                                    </div>
                                    <div className="space-y-2 bg-muted/20 p-4 rounded-lg border">
                                      <h4 className="font-semibold flex items-center gap-2 text-sm border-b pb-2">
                                        <IdCard className="h-4 w-4 text-primary" /> Document Details
                                      </h4>
                                      <p className="text-sm"><span className="text-muted-foreground">Type:</span> <span className="uppercase">{req.kyc_document_type?.replace('_', ' ')}</span></p>
                                      <p className="text-sm"><span className="text-muted-foreground">ID Number:</span> {req.kyc_id_number}</p>
                                    </div>
                                  </div>
                                )}

                                {/* KYC Images — clickable for fullscreen */}
                                {(req.selfieDataUrl || req.docDataUrl) && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {req.selfieDataUrl && (
                                      <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase text-muted-foreground">Live Selfie</p>
                                        <div
                                          className="relative aspect-square md:aspect-video rounded-lg overflow-hidden border-2 bg-black cursor-zoom-in group"
                                          onClick={() => setLightboxImg(req.selfieDataUrl!)}
                                        >
                                          <img src={req.selfieDataUrl} alt="KYC Selfie" className="w-full h-full object-cover" />
                                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                            <ZoomIn className="h-7 w-7 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {req.docDataUrl && (
                                      <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase text-muted-foreground">Government ID Photo</p>
                                        <div
                                          className="relative aspect-video rounded-lg overflow-hidden border-2 bg-black cursor-zoom-in group"
                                          onClick={() => setLightboxImg(req.docDataUrl!)}
                                        >
                                          <img src={req.docDataUrl} alt="KYC Document" className="w-full h-full object-contain" />
                                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                            <ZoomIn className="h-7 w-7 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* AI Score panel */}
                                {req.aiScore && (
                                  <div className="rounded-lg border bg-muted/40 p-5 space-y-4">
                                    <div className="flex items-center justify-between border-b pb-3">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="h-5 w-5 text-primary" />
                                        <span className="font-bold text-lg">Gemini Vision Analysis</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">Confidence:</span>
                                        <span className={`text-xl font-bold ${getScoreColor(req.aiScore.confidence_score)}`}>
                                          {req.aiScore.confidence_score}%
                                        </span>
                                        <Badge className={`ml-2 ${req.aiScore.recommendation === "Approve" ? "bg-green-600" :
                                          req.aiScore.recommendation === "Reject" ? "bg-red-600" : "bg-yellow-500"
                                          } text-white`}>
                                          {req.aiScore.recommendation}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                      {[
                                        { label: "Face Match", value: `${req.aiScore.face_match_percentage}%`, ok: req.aiScore.face_match_percentage >= 80 },
                                        { label: "Doc Authentic", value: req.aiScore.document_authentic ? "Yes" : "No", ok: req.aiScore.document_authentic },
                                        { label: "Name Match", value: req.aiScore.name_match ? "Yes" : "Mismatch", ok: req.aiScore.name_match },
                                        { label: "ID Format", value: req.aiScore.id_format_valid ? "Valid" : "Invalid", ok: req.aiScore.id_format_valid },
                                      ].map(({ label, value, ok }) => (
                                        <div key={label} className="bg-background rounded-md p-3 border">
                                          <p className="text-xs text-muted-foreground mb-1">{label}</p>
                                          <div className="flex items-center gap-2">
                                            {ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                            <span className="font-semibold text-sm">{value}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="bg-background rounded-md p-4 border">
                                      <p className="text-sm font-semibold mb-1">AI Reasoning:</p>
                                      <p className="text-sm text-foreground/80">{req.aiScore.reasoning}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
