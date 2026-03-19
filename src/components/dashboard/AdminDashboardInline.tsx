import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

export default function AdminDashboardInline() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [roleToUpdate, setRoleToUpdate] = useState<string>("");
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
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setCurrentAdminId(session.user.id);
      fetchUsers();
      fetchVerificationRequests();
    }
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

    const { data: rolesData } = await supabase.from("user_roles").select("*");
    const roleMap = new Map(rolesData?.map(r => [r.user_id, r.role]) || []);

    const usersWithRoles = (profilesData || []).map((profile) => ({
      ...profile,
      status: profile.status || "active",
      role: roleMap.get(profile.id) || "learner",
    }));

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

    const requestsWithImages = await Promise.all((data || []).map(async (req: any) => {
      let selfieDataUrl = null;
      let docDataUrl = null;
      try {
        if (req.kyc_selfie_url) selfieDataUrl = await getS3ViewUrl(req.kyc_selfie_url);
      } catch (e) { }
      try {
        if (req.kyc_document_url) docDataUrl = await getS3ViewUrl(req.kyc_document_url);
      } catch (e) { }

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
    if (!response.ok) throw new Error(json.error || "Edge function failed");
    return json;
  };

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

  const handleApprove = async (req: VerificationRequest) => {
    try {
      await invokeVerifySeller({ userId: req.id, action: "approve" });
      toast.success(`${req.name} has been verified`);
      fetchVerificationRequests();
    } catch (err: any) {
      toast.error("Failed to approve: " + err.message);
    }
  };

  const handleReject = async () => {
    if (!rejectUser) return;
    try {
      await invokeVerifySeller({ userId: rejectUser.id, action: "reject", notes: rejectNotes });
      toast.success(`${rejectUser.name}'s verification rejected`);
      setRejectUser(null);
      setRejectNotes("");
      fetchVerificationRequests();
    } catch (err: any) {
      toast.error("Failed to reject: " + err.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        body: { userId },
      });
      if (error) throw error;
      toast.success("User deleted successfully");
      fetchUsers();
    } catch (error) {
      toast.error("Failed to delete user");
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser || !roleToUpdate) return;
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: roleToUpdate as any })
        .eq("user_id", selectedUser.id);
      if (error) throw error;
      toast.success("Role updated successfully");
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast.error("Failed to update role");
    }
  };

  const handleSuspend = async (userId: string) => {
    const days = parseInt(suspendDays, 10);
    const until = new Date();
    until.setDate(until.getDate() + days);
    try {
      const { error } = await supabase.from("profiles").update({ status: "suspended", suspended_until: until.toISOString() }).eq("id", userId);
      if (error) throw error;
      toast.success(`User suspended for ${days} days`);
      fetchUsers();
    } catch (error) {
      toast.error("Failed to suspend user");
    }
  };

  const handleBan = async (userId: string) => {
    try {
      const { error } = await supabase.from("profiles").update({ status: "banned", suspended_until: null }).eq("id", userId);
      if (error) throw error;
      toast.success("User banned permanently");
      fetchUsers();
    } catch (error) {
      toast.error("Failed to ban user");
    }
  };

  const handleReactivate = async (userId: string) => {
    try {
      const { error } = await supabase.from("profiles").update({ status: "active", suspended_until: null }).eq("id", userId);
      if (error) throw error;
      toast.success("User reactivated");
      fetchUsers();
    } catch (error) {
      toast.error("Failed to reactivate");
    }
  };

  const getStatusBadge = (user: UserProfile) => {
    if (user.status === "banned") return <Badge variant="destructive" className="rounded-xl px-3 py-1 font-bold">Banned</Badge>;
    if (user.status === "suspended") {
      const until = user.suspended_until ? new Date(user.suspended_until) : null;
      if (until && until > new Date()) {
        const daysLeft = Math.ceil((until.getTime() - Date.now()) / 86400000);
        return <Badge className="bg-yellow-500 text-white rounded-xl px-3 py-1 font-bold">Suspended ({daysLeft}d)</Badge>;
      }
      return <Badge className="bg-yellow-500 text-white rounded-xl px-3 py-1 font-bold">Suspended</Badge>;
    }
    return <Badge className="bg-green-600 text-white rounded-xl px-3 py-1 font-bold">Active</Badge>;
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = { admin: "bg-purple-600", creator: "bg-blue-600", learner: "bg-zinc-600" };
    return <Badge className={`${colors[role] || "bg-zinc-600"} text-white rounded-xl px-3 py-1 font-bold`}>{role}</Badge>;
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

  if (loading && users.length === 0) {
    return <div className="py-20 text-center"><RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary mb-4" /><p>Loading Admin Data...</p></div>;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
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

      <div className="flex items-center gap-3 mb-8">
        <Shield className="h-8 w-8 text-primary" />
        <h1 className="text-4xl font-black dark:text-white tracking-tight">Admin Dashboard</h1>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-8 p-1 bg-gray-100/50 dark:bg-zinc-900/50 rounded-2xl h-14">
          <TabsTrigger value="users" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px]">Users</TabsTrigger>
          <TabsTrigger value="verification" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px]">Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="border-none shadow-soft rounded-[2rem] overflow-hidden bg-white dark:bg-zinc-900/40 backdrop-blur-sm">
            <CardHeader className="p-8 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black">All Users</CardTitle>
                  <CardDescription className="font-medium">Total: {users.length} registered accounts</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchUsers} className="rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800">
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-gray-100 dark:border-zinc-800">
                    <TableHead className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Name</TableHead>
                    <TableHead className="py-5 font-black uppercase tracking-widest text-[10px]">Role</TableHead>
                    <TableHead className="py-5 font-black uppercase tracking-widest text-[10px]">Status</TableHead>
                    <TableHead className="py-5 font-black uppercase tracking-widest text-[10px]">Joined</TableHead>
                    <TableHead className="py-5 font-black uppercase tracking-widest text-[10px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className={`border-gray-50 dark:border-zinc-800/50 group ${user.id === currentAdminId ? "bg-primary/5" : ""}`}>
                      <TableCell className="px-8 py-5">
                        <p className="font-black text-black dark:text-white">
                          {user.name}
                          {user.id === currentAdminId && <span className="ml-2 text-[10px] opacity-50">(you)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium">{user.email}</p>
                      </TableCell>
                      <TableCell className="py-5">{getRoleBadge(user.role)}</TableCell>
                      <TableCell className="py-5">{getStatusBadge(user)}</TableCell>
                      <TableCell className="py-5">
                        <p className="text-sm font-medium opacity-60">
                          {new Date(user.created_at).toLocaleDateString()}
                        </p>
                      </TableCell>
                      <TableCell className="py-5">
                        <div className="flex gap-2">
                          {/* ── Edit Role ── */}
                          {user.id !== currentAdminId && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="rounded-2xl h-10 w-10 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-600 bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 transition-all font-black"
                              onClick={() => { setSelectedUser(user); setRoleToUpdate(user.role); }}
                            >
                              <Edit className="h-5 w-5" />
                            </Button>
                          )}

                          {/* ── Account Control ── */}
                          {user.id !== currentAdminId && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="rounded-2xl h-10 w-10 p-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800 transition-all"
                                >
                                  <div className="flex items-center justify-center translate-x-1">
                                    <Ban className="h-5 w-5" />
                                    <ChevronDown className="h-4 w-4 ml-0.5 opacity-50" />
                                  </div>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-3xl border-none shadow-2xl p-6 bg-white dark:bg-zinc-950 min-w-[280px]">
                                <p className="font-black uppercase tracking-widest text-[10px] opacity-60 mb-6">Account Control</p>
                                
                                <div className="space-y-6">
                                  <div className="space-y-3">
                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-50">Suspend for (days)</Label>
                                    <div className="flex gap-2">
                                      <Input
                                        type="number"
                                        min="1"
                                        value={suspendDays}
                                        onChange={(e) => setSuspendDays(e.target.value)}
                                        className="h-11 rounded-2xl border-none bg-zinc-50 dark:bg-zinc-900 font-bold px-4"
                                      />
                                      <Button
                                        size="sm"
                                        className="rounded-2xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-black h-11 px-6 hover:bg-green-200"
                                        onClick={() => handleSuspend(user.id)}
                                      >
                                        Apply
                                      </Button>
                                    </div>
                                  </div>

                                  <DropdownMenuSeparator className="bg-gray-100 dark:bg-zinc-900" />

                                  <div className="space-y-2">
                                    {user.status !== "active" && (
                                      <DropdownMenuItem 
                                        onClick={() => handleReactivate(user.id)} 
                                        className="rounded-2xl h-11 px-4 font-black text-green-600 focus:text-green-600 cursor-pointer flex items-center gap-3 hover:bg-green-50 dark:hover:bg-green-900/20"
                                      >
                                        <UserCheck className="h-5 w-5" /> Reactivate User
                                      </DropdownMenuItem>
                                    )}

                                    <DropdownMenuItem 
                                      onClick={() => handleBan(user.id)} 
                                      className="rounded-2xl h-11 px-4 font-black text-rose-600 focus:text-rose-600 cursor-pointer flex items-center gap-3 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                    >
                                      <Ban className="h-5 w-5" /> Ban Permanently
                                    </DropdownMenuItem>
                                  </div>
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}

                          {/* ── Delete Account ── */}
                          {user.id !== currentAdminId && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="rounded-2xl h-10 w-10 p-0 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 transition-all"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-[2.5rem] border-none p-10 bg-white dark:bg-zinc-950 shadow-2xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-3xl font-black tracking-tight">Delete Account?</AlertDialogTitle>
                                  <AlertDialogDescription className="font-medium text-base text-zinc-500 mt-2">
                                    You are about to permanently delete <strong>{user.name}</strong>. This will remove all their data from our servers. This action is irreversible.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="mt-8 gap-3">
                                  <AlertDialogCancel className="rounded-[1.2rem] h-14 px-10 font-black border-none bg-zinc-100 hover:bg-zinc-200">Wait, Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-[1.2rem] h-14 px-10 font-black bg-rose-600 text-white hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20"
                                    onClick={() => handleDeleteUser(user.id)}
                                  >
                                    Confirm Delete
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
           <Card className="border-none shadow-soft rounded-[2rem] overflow-hidden bg-white dark:bg-zinc-900/40 backdrop-blur-sm">
            <CardHeader className="p-8 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black">Verification Requests</CardTitle>
                  <CardDescription className="font-medium">Review seller KYC applications</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchVerificationRequests} className="rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800">
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                </Button>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email…"
                  value={verSearch}
                  onChange={(e) => setVerSearch(e.target.value)}
                  className="pl-9 rounded-xl border-none bg-gray-100/50 dark:bg-zinc-900/50"
                />
              </div>
            </CardHeader>
            <CardContent className="p-8">
              {verLoading ? (
                <div className="text-center py-20">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading requests…</p>
                </div>
              ) : (() => {
                const filtered = verificationRequests.filter(r =>
                  r.name?.toLowerCase().includes(verSearch.toLowerCase()) ||
                  r.email?.toLowerCase().includes(verSearch.toLowerCase())
                );
                return filtered.length === 0 ? (
                  <div className="text-center py-20 opacity-40">
                    <CheckCircle2 className="h-16 w-16 mx-auto mb-4" />
                    <p className="font-black uppercase tracking-widest text-xs">No pending requests</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filtered.map((req) => {
                      const isExpanded = expandedId === req.id;
                      return (
                        <div key={req.id} className="rounded-3xl bg-gray-50/50 dark:bg-zinc-900/50 border border-transparent hover:border-gray-200 dark:hover:border-zinc-800 transition-all overflow-hidden">
                           <button
                             className="w-full flex items-center justify-between gap-4 p-6 text-left"
                             onClick={() => setExpandedId(isExpanded ? null : req.id)}
                           >
                             <div className="flex items-center gap-4 min-w-0">
                               <div className="min-w-0">
                                 <div className="flex items-center gap-2">
                                   <span className="font-black text-lg text-black dark:text-white truncate">{req.name}</span>
                                   {getVerStatusBadge(req.verification_status)}
                                 </div>
                                 <p className="text-sm text-muted-foreground font-medium truncate">{req.email}</p>
                               </div>
                             </div>
                             <div className="flex items-center gap-2 flex-shrink-0">
                               {req.verification_status === "pending" && (
                                 <>
                                   <Button size="sm" variant="outline" className="rounded-xl font-bold h-9 text-xs gap-2"
                                     onClick={(e) => { e.stopPropagation(); handleGetAiScore(req); }}
                                     disabled={req.scoring}>
                                     {req.scoring ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
                                     AI Score
                                   </Button>
                                   <Button size="sm" className="rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white h-9 text-xs gap-2"
                                     onClick={(e) => { e.stopPropagation(); handleApprove(req); }}>
                                     <CheckCircle2 className="h-3 w-3" /> Approve
                                   </Button>
                                   <Button size="sm" variant="destructive" className="rounded-xl font-bold h-9 text-xs gap-2"
                                     onClick={(e) => { e.stopPropagation(); setRejectUser(req); setRejectNotes(""); }}>
                                     <XCircle className="h-3 w-3" /> Reject
                                   </Button>
                                 </>
                               )}
                               {req.verification_status === "verified" && (
                                 <Button size="sm" variant="destructive" className="rounded-xl font-bold h-9 text-xs gap-2"
                                   onClick={(e) => { e.stopPropagation(); setRejectUser(req); setRejectNotes(""); }}>
                                   <XCircle className="h-3 w-3" /> Revoke
                                 </Button>
                               )}
                               {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                             </div>
                           </button>

                           {isExpanded && (
                             <div className="p-6 pt-0 space-y-6">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                 <div className="space-y-3 p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800">
                                   <h4 className="font-black uppercase tracking-widest text-[10px] opacity-60 flex items-center gap-2">
                                     <UserSquare2 className="h-3 w-3" /> Personal Details
                                   </h4>
                                   <div className="space-y-2">
                                     <p className="text-sm"><span className="font-bold">Legal Name:</span> {req.kyc_full_name || "N/A"}</p>
                                     <p className="text-sm"><span className="font-bold">Mobile:</span> {req.kyc_mobile || "N/A"}</p>
                                     <p className="text-sm"><span className="font-bold">Address:</span> {req.kyc_address || "N/A"}</p>
                                   </div>
                                 </div>
                                 <div className="space-y-3 p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800">
                                   <h4 className="font-black uppercase tracking-widest text-[10px] opacity-60 flex items-center gap-2">
                                     <IdCard className="h-3 w-3" /> Document Details
                                   </h4>
                                   <div className="space-y-2">
                                     <p className="text-sm"><span className="font-bold">Type:</span> <span className="uppercase">{req.kyc_document_type?.replace('_', ' ') || "N/A"}</span></p>
                                     <p className="text-sm"><span className="font-bold">Number:</span> {req.kyc_id_number || "N/A"}</p>
                                   </div>
                                 </div>
                               </div>

                               {(req.selfieDataUrl || req.docDataUrl) && (
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                   {req.selfieDataUrl && (
                                     <div className="space-y-2">
                                       <p className="font-black uppercase tracking-widest text-[10px] opacity-60">Live Selfie</p>
                                       <div
                                         className="relative aspect-video rounded-2xl overflow-hidden border-2 border-gray-100 dark:border-zinc-800 bg-black cursor-zoom-in group"
                                         onClick={() => setLightboxImg(req.selfieDataUrl!)}
                                       >
                                         <img src={req.selfieDataUrl} alt="KYC Selfie" className="w-full h-full object-cover" />
                                         <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                           <ZoomIn className="h-8 w-8 text-white" />
                                         </div>
                                       </div>
                                     </div>
                                   )}
                                   {req.docDataUrl && (
                                     <div className="space-y-2">
                                       <p className="font-black uppercase tracking-widest text-[10px] opacity-60">Government ID</p>
                                       <div
                                         className="relative aspect-video rounded-2xl overflow-hidden border-2 border-gray-100 dark:border-zinc-800 bg-black cursor-zoom-in group"
                                         onClick={() => setLightboxImg(req.docDataUrl!)}
                                       >
                                         <img src={req.docDataUrl} alt="KYC Document" className="w-full h-full object-contain" />
                                         <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                           <ZoomIn className="h-8 w-8 text-white" />
                                         </div>
                                       </div>
                                     </div>
                                   )}
                                 </div>
                               )}

                               {req.aiScore && (
                                 <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 space-y-6">
                                   <div className="flex items-center justify-between border-b border-gray-50 dark:border-zinc-900 pb-4">
                                     <div className="flex items-center gap-3">
                                       <Sparkles className="h-5 w-5 text-primary" />
                                       <span className="font-black text-lg">AI Verification Analysis</span>
                                     </div>
                                     <div className="flex items-center gap-4">
                                       <div className="flex flex-col items-end">
                                         <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Confidence</span>
                                         <span className={`text-2xl font-black ${getScoreColor(req.aiScore.confidence_score)}`}>
                                           {req.aiScore.confidence_score}%
                                         </span>
                                       </div>
                                       <Badge className={`rounded-xl px-4 py-1.5 font-bold ${req.aiScore.recommendation === "Approve" ? "bg-green-600" :
                                         req.aiScore.recommendation === "Reject" ? "bg-rose-600" : "bg-yellow-500"
                                         } text-white`}>
                                         {req.aiScore.recommendation}
                                       </Badge>
                                     </div>
                                   </div>
                                   
                                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                     {[
                                       { label: "Face Match", value: `${req.aiScore.face_match_percentage}%`, ok: req.aiScore.face_match_percentage >= 80 },
                                       { label: "Authentic", value: req.aiScore.document_authentic ? "Yes" : "No", ok: req.aiScore.document_authentic },
                                       { label: "Name Match", value: req.aiScore.name_match ? "Yes" : "Mismatch", ok: req.aiScore.name_match },
                                       { label: "Format", value: req.aiScore.id_format_valid ? "Valid" : "Invalid", ok: req.aiScore.id_format_valid },
                                     ].map(({ label, value, ok }) => (
                                       <div key={label} className="bg-gray-50 dark:bg-zinc-900 rounded-xl p-4 border border-transparent">
                                         <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">{label}</p>
                                         <div className="flex items-center gap-2">
                                           {ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                                           <span className="font-bold text-sm">{value}</span>
                                         </div>
                                       </div>
                                     ))}
                                   </div>

                                   <div className="bg-gray-50 dark:bg-zinc-900 rounded-2xl p-5 border border-transparent">
                                     <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-2">AI Reasoning</p>
                                     <p className="text-sm font-medium leading-relaxed">{req.aiScore.reasoning}</p>
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

      {/* Reusable Dialogs for Role Edit / Rejection */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="rounded-3xl border-none p-8 bg-white dark:bg-zinc-950 shadow-2xl">
           <DialogHeader>
             <DialogTitle className="text-2xl font-black">Edit User Role</DialogTitle>
             <DialogDescription className="font-medium">Update permissions for {selectedUser?.name}</DialogDescription>
           </DialogHeader>
           <div className="py-6 space-y-4">
             <Label className="font-black uppercase tracking-widest text-[10px] opacity-60">Select Role</Label>
             <Select value={roleToUpdate} onValueChange={setRoleToUpdate}>
               <SelectTrigger className="rounded-xl h-12 border-none bg-gray-50 dark:bg-zinc-900 font-bold focus:ring-0">
                 <SelectValue />
               </SelectTrigger>
               <SelectContent className="rounded-2xl border-none bg-white dark:bg-zinc-900 shadow-xl">
                 <SelectItem value="learner">Learner</SelectItem>
                 <SelectItem value="creator">Creator</SelectItem>
                 <SelectItem value="admin">Admin</SelectItem>
               </SelectContent>
             </Select>
           </div>
           <DialogFooter>
             <Button onClick={handleUpdateRole} className="rounded-2xl h-12 px-8 font-black bg-primary text-white hover:bg-primary/90 transition-all">Save Changes</Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectUser} onOpenChange={(open) => { if (!open) { setRejectUser(null); setRejectNotes(""); } }}>
        <DialogContent className="rounded-3xl border-none p-8 bg-white dark:bg-zinc-950 shadow-2xl text-black dark:text-white">
           <DialogHeader>
             <DialogTitle className="text-2xl font-black">Reject Verification</DialogTitle>
             <DialogDescription className="font-medium">Provide a reason for rejecting {rejectUser?.name}</DialogDescription>
           </DialogHeader>
           <div className="py-6 space-y-4">
             <Label className="font-black uppercase tracking-widest text-[10px] opacity-60">Rejection Reason</Label>
             <Textarea
               placeholder="e.g. Image blurry, name mismatch..."
               value={rejectNotes}
               onChange={(e) => setRejectNotes(e.target.value)}
               className="rounded-2xl border-none bg-gray-50 dark:bg-zinc-900 min-h-[120px] p-4 font-medium focus-visible:ring-0"
             />
           </div>
           <DialogFooter className="gap-3">
             <Button variant="ghost" onClick={() => setRejectUser(null)} className="rounded-2xl h-12 px-8 font-black">Cancel</Button>
             <Button variant="destructive" onClick={handleReject} className="rounded-2xl h-12 px-8 font-black">Reject Request</Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
