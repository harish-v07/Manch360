import { useState } from "react";
import { cn } from "@/lib/utils";
import { User, Moon, Sun } from "lucide-react";
import ProfileEditor from "./ProfileEditor";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

interface LearnerSettingsProps {
  onClose: () => void;
}

export default function LearnerSettings({ onClose }: LearnerSettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState("profile");
  const { theme, setTheme } = useTheme();

  const subTabs = [
    { id: "profile", label: "General", icon: User },
    { id: "appearance", label: "Appearance", icon: Moon },
  ];

  const renderContent = () => {
    switch (activeSubTab) {
      case "profile":
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <h3 className="text-xl font-black mb-1 dark:text-white transition-colors">General Profile</h3>
              <p className="text-sm text-gray-400 dark:text-zinc-500 font-medium transition-colors">Update your personal information and profile picture.</p>
            </div>
            <ProfileEditor />
          </div>
        );
      case "appearance":
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <h3 className="text-xl font-black mb-1 dark:text-white transition-colors">Appearance</h3>
              <p className="text-sm text-gray-400 dark:text-zinc-500 font-medium transition-colors">Choose how you want Manch360 to look for you.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => setTheme("light")}
                className={cn(
                  "p-6 rounded-3xl border-2 transition-all duration-300 text-left group",
                  theme === "light" 
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" 
                    : "border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-gray-200 dark:hover:border-zinc-700"
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                    theme === "light" ? "bg-primary text-white" : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500"
                  )}>
                    <Sun className="h-6 w-6" />
                  </div>
                  {theme === "light" && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    </div>
                  )}
                </div>
                <h4 className="font-black text-gray-900 dark:text-white transition-colors text-lg">Light Mode</h4>
                <p className="text-[11px] text-gray-500 dark:text-zinc-500 font-semibold uppercase tracking-wider mt-1">Clean & Modern</p>
              </button>

              <button 
                onClick={() => setTheme("dark")}
                className={cn(
                  "p-6 rounded-3xl border-2 transition-all duration-300 text-left group",
                  theme === "dark" 
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" 
                    : "border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-gray-200 dark:hover:border-zinc-700"
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                    theme === "dark" ? "bg-primary text-white" : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500"
                  )}>
                    <Moon className="h-6 w-6" />
                  </div>
                  {theme === "dark" && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    </div>
                  )}
                </div>
                <h4 className="font-black text-gray-900 dark:text-white transition-colors text-lg">Dark Mode</h4>
                <p className="text-[11px] text-gray-500 dark:text-zinc-500 font-semibold uppercase tracking-wider mt-1">Sleek & Visual</p>
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full w-full bg-white dark:bg-zinc-950 rounded-[2rem] overflow-hidden isolate shadow-2xl transition-colors duration-500">
      {/* Side Nav */}
      <div className="w-64 bg-gray-50/50 dark:bg-zinc-900/50 border-r border-gray-100 dark:border-zinc-900 p-6 flex flex-col gap-1 transition-colors">
        <div className="flex items-center justify-between mb-8 px-2">
          <h2 className="text-xl font-black text-black dark:text-white transition-colors">Settings</h2>
        </div>
        
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm group",
              activeSubTab === tab.id 
                ? "bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm border border-gray-100 dark:border-zinc-700" 
                : "text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100/50 dark:hover:bg-zinc-800/50"
            )}
          >
            <tab.icon className={cn(
              "h-4 w-4 transition-colors",
              activeSubTab === tab.id ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-zinc-300"
            )} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar relative bg-white dark:bg-transparent">
        {renderContent()}
      </div>
    </div>
  );
}
