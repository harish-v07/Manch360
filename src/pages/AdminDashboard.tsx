import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit, Shield, Ban, UserCheck, ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  created_at: string;
  status: string;
  suspended_until: string | null;
  role: string;
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

      // Kick out active session immediately by clearing active_session_id
      await supabase
        .from("profiles")
        .update({ active_session_id: null })
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

      // Kick out immediately
      await supabase
        .from("profiles")
        .update({ active_session_id: null })
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
      // Suspension expired — auto-mark active
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

      {/* ── Ban confirmation dialog (outside table to avoid nesting) ── */}
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

      <div className="container mx-auto p-8 pt-28">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <CardTitle>Admin Dashboard</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={fetchUsers}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
            <CardDescription>
              Manage user accounts, roles, and access. Total: <strong>{users.length}</strong> users.
            </CardDescription>
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

                                {/* Suspend for N days */}
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

                                {/* Permanent Ban — opens confirmation dialog */}
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

                          {/* ── Unban / Reactivate button — visible directly in row ── */}
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
                                    This will restore <strong>{user.email}</strong>'s access to the platform. They will be able to log in immediately.
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
      </div>
    </div>
  );
}
