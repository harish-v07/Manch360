import { cn } from "@/lib/utils";
import { 
  BookOpen, 
  Package, 
  IndianRupee, 
  ShoppingBag, 
  Settings, 
  LogOut,
  LayoutDashboard,
  Compass
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface CreatorSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const CreatorSidebar = ({ activeTab, onTabChange }: CreatorSidebarProps) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const navItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "courses", icon: BookOpen, label: "Courses" },
    { id: "products", icon: Package, label: "Products" },
    { id: "orders", icon: ShoppingBag, label: "Orders" },
    { id: "earnings", icon: IndianRupee, label: "Earnings" },
    { id: "explore", icon: Compass, label: "Explore" },
  ];

  return (
    <div className="fixed left-0 top-0 h-screen w-[64px] flex flex-col items-center py-6 bg-white dark:bg-zinc-950 border-r border-gray-100 dark:border-zinc-900 z-50 transition-all duration-300">
      {/* Brand Logo */}
      <Link to="/" className="mb-10 text-center">
        <div className="text-2xl font-black tracking-tighter text-black dark:text-white">M</div>
      </Link>

      {/* Navigation Icons - Small Size */}
      <div className="flex-1 flex flex-col gap-5 w-full items-center">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300",
              activeTab === item.id 
                ? "bg-black text-white shadow-lg shadow-black/20 dark:bg-primary dark:shadow-primary/20" 
                : "text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-900"
            )}
            title={item.label}
          >
            <item.icon className={cn("h-5 w-5", activeTab === item.id ? "stroke-[2.5px]" : "stroke-[2px]")} />
          </button>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col gap-5 items-center pb-6">
        <button
          onClick={() => onTabChange("profile")}
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300",
            activeTab === "profile" 
              ? "bg-black text-white shadow-lg shadow-black/20 dark:bg-primary dark:shadow-primary/20" 
              : "text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-900"
          )}
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all duration-300"
          title="Logout"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
