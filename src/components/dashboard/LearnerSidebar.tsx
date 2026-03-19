import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  BookOpen, 
  Settings, 
  LogOut,
  Compass,
  ShoppingBag,
  ShoppingCart,
  Shield
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCart } from "@/hooks/useCart";
interface LearnerSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin?: boolean;
}

export function LearnerSidebar({ activeTab, onTabChange, isAdmin }: LearnerSidebarProps) {
  const navigate = useNavigate();
  const { getTotalItems } = useCart();
  const cartItemCount = getTotalItems();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  const navItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "My Learning" },
    { id: "orders", icon: ShoppingBag, label: "My Orders" },
    { id: "explore", icon: Compass, label: "Explore" },
    { id: "cart", icon: ShoppingCart, label: "Cart" },
    ...(isAdmin ? [{ id: "admin", icon: Shield, label: "Admin" }] : []),
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 flex flex-col bg-white dark:bg-zinc-950 border-r border-gray-100 dark:border-zinc-900 transition-all duration-500 z-50">
      {/* Branding */}
      <div className="h-16 flex items-center justify-center">
        <span className="text-2xl font-black text-black dark:text-white tracking-tighter">M</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-4 pt-6">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 relative group",
              activeTab === item.id
                ? "bg-black dark:bg-primary text-white shadow-lg shadow-primary/20 scale-110"
                : "text-gray-400 dark:text-zinc-600 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-900"
            )}
          >
            <item.icon className={cn("h-5 w-5", activeTab === item.id ? "h-6 w-6" : "h-5 w-5")} />
            
            {item.id === 'cart' && cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-950 animate-in zoom-in duration-300">
                {cartItemCount}
              </span>
            )}

            {/* Tooltip emulation */}
            <span className="absolute left-16 px-2 py-1 rounded bg-black text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[100]">
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-4 pb-6">
        <button
          onClick={() => onTabChange("profile")}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 relative group",
            activeTab === "profile"
              ? "bg-black dark:bg-primary text-white shadow-lg"
              : "text-gray-400 dark:text-zinc-600 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-900"
          )}
        >
          <Settings className="h-5 w-5" />
          <span className="absolute left-16 px-2 py-1 rounded bg-black text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[100]">
            Settings
          </span>
        </button>
        <button
          onClick={handleLogout}
          className="w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 text-gray-400 dark:text-zinc-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 relative group"
        >
          <LogOut className="h-5 w-5" />
          <span className="absolute left-16 px-2 py-1 rounded bg-black text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[100]">
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
}
