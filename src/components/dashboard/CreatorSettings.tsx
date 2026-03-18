import { useState } from "react";
import { cn } from "@/lib/utils";
import { User, Truck, CreditCard, ShieldCheck, Clock, ShieldAlert, Sparkles, Store } from "lucide-react";
import ProfileEditor from "./ProfileEditor";
import PickupAddressSettings from "./PickupAddressSettings";
import CreatorPaymentSettings from "./CreatorPaymentSettings";
import VerificationForm from "./VerificationForm";
import StorefrontEditor from "./StorefrontEditor";
import { Button } from "@/components/ui/button";

interface CreatorSettingsProps {
  verificationStatus: string;
  verificationNotes: string | null;
  onVerificationComplete: () => void;
  onClose: () => void;
}

export default function CreatorSettings({ 
  verificationStatus, 
  verificationNotes, 
  onVerificationComplete,
  onClose
}: CreatorSettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState("profile");
  const [showVerificationForm, setShowVerificationForm] = useState(false);

  const subTabs = [
    { id: "profile", label: "General", icon: User },
    { id: "storefront", label: "Storefront", icon: Store },
    { id: "shipping", label: "Shipping", icon: Truck },
    { id: "bank", label: "Bank Details", icon: CreditCard },
  ];

  const renderContent = () => {
    switch (activeSubTab) {
      case "profile":
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <h3 className="text-xl font-black mb-1 dark:text-white transition-colors">General Profile</h3>
              <p className="text-sm text-gray-400 dark:text-zinc-500 font-medium transition-colors">Update your public information and branding.</p>
            </div>

            {/* KYC Banner */}
            <div className={cn(
              "p-6 rounded-[1.5rem] transition-all duration-500 border border-transparent shadow-sm",
              verificationStatus === "verified" ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-500/20" :
              verificationStatus === "pending" ? "bg-amber-50/70 dark:bg-amber-950/20 border-amber-100 dark:border-amber-500/20" :
              verificationStatus === "rejected" ? "bg-rose-50/70 dark:bg-rose-950/20 border-rose-100 dark:border-rose-500/20" :
              "bg-blue-50/70 dark:bg-blue-950/20 border-blue-100 dark:border-blue-500/20"
            )}>
              <div className="flex items-center gap-4 justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm",
                    verificationStatus === "verified" ? "bg-emerald-500 text-white" :
                    verificationStatus === "pending" ? "bg-amber-500 text-white" :
                    verificationStatus === "rejected" ? "bg-rose-500 text-white" :
                    "bg-blue-600 dark:bg-primary text-white"
                  )}>
                    {verificationStatus === "verified" && <ShieldCheck className="h-6 w-6" />}
                    {verificationStatus === "pending" && <Clock className="h-6 w-6" />}
                    {verificationStatus === "rejected" && <ShieldAlert className="h-6 w-6" />}
                    {verificationStatus === "unverified" && <Sparkles className="h-6 w-6" />}
                  </div>
                  <div>
                    <h4 className="font-black text-gray-900 dark:text-white leading-none mb-1 transition-colors">
                      {verificationStatus === "verified" ? "Verified" :
                       verificationStatus === "pending" ? "Pending" :
                       verificationStatus === "rejected" ? "Rejected" :
                       "Verification"}
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                      {verificationStatus === "verified" ? "Profile Secure" :
                       verificationStatus === "pending" ? "In Review" :
                       verificationStatus === "rejected" ? "Action Required" :
                       "Build Trust"}
                    </p>
                  </div>
                </div>
                
                {!showVerificationForm && (verificationStatus === "unverified" || verificationStatus === "rejected") && (
                  <Button 
                    onClick={() => setShowVerificationForm(true)}
                    size="sm"
                    className="rounded-full h-9 px-4 font-bold bg-black dark:bg-primary hover:bg-gray-800 dark:hover:bg-primary/90 text-xs text-white"
                  >
                    Start KYC
                  </Button>
                )}
              </div>
              
              {showVerificationForm && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-zinc-800">
                  <VerificationForm onComplete={() => {
                    setShowVerificationForm(false);
                    onVerificationComplete();
                  }} />
                </div>
              )}
            </div>
            <ProfileEditor />
          </div>
        );
      case "storefront":
        return (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-xl font-black mb-6 dark:text-white">Storefront Editor</h3>
            <StorefrontEditor />
          </div>
        );
      case "shipping":
        return (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-xl font-black mb-6 dark:text-white">Shipping Address</h3>
            <PickupAddressSettings />
          </div>
        );
      case "bank":
        return (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-xl font-black mb-6 dark:text-white">Bank Details</h3>
            <CreatorPaymentSettings />
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
