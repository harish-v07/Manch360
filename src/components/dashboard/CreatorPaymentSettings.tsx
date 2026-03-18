import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, CreditCard } from "lucide-react";

export default function CreatorPaymentSettings() {
    const [loading, setLoading] = useState(false);
    const [hasPaymentDetails, setHasPaymentDetails] = useState(false);
    const [formData, setFormData] = useState({
        bank_account_number: "",
        confirm_account_number: "",
        bank_ifsc_code: "",
        bank_account_name: "",
        email: "",
        phone: "",
        pan_number: "",
    });

    useEffect(() => {
        checkPaymentDetails();
    }, []);

    const checkPaymentDetails = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from("profiles")
                .select("razorpay_account_id, bank_account_name, bank_ifsc_code, email, pan_card_number")
                .eq("id", user.id)
                .single();

            if (profile?.razorpay_account_id) {
                setHasPaymentDetails(true);
                setFormData(prev => ({
                    ...prev,
                    bank_account_name: profile.bank_account_name || "",
                    bank_ifsc_code: profile.bank_ifsc_code || "",
                    email: profile.email || user.email || "",
                    pan_number: profile.pan_card_number || "",
                }));
            }
        } catch (error) {
            console.error("Error checking payment details:", error);
        }
    };

    const validateIFSC = (ifsc: string) => {
        const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
        return ifscRegex.test(ifsc);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (formData.bank_account_number !== formData.confirm_account_number) {
                toast.error("Account numbers do not match");
                setLoading(false);
                return;
            }

            if (!validateIFSC(formData.bank_ifsc_code.toUpperCase())) {
                toast.error("Invalid IFSC code format");
                setLoading(false);
                return;
            }

            if (formData.bank_account_number.length < 9 || formData.bank_account_number.length > 18) {
                toast.error("Account number must be between 9 and 18 digits");
                setLoading(false);
                return;
            }

            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
            if (!formData.pan_number || !panRegex.test(formData.pan_number.toUpperCase())) {
                toast.error("Invalid PAN card number format");
                setLoading(false);
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error("Please login to continue");
                setLoading(false);
                return;
            }

            const { data, error } = await supabase.functions.invoke("create-linked-account", {
                body: {
                    bank_account_number: formData.bank_account_number,
                    bank_ifsc_code: formData.bank_ifsc_code.toUpperCase(),
                    bank_account_name: formData.bank_account_name,
                    pan: formData.pan_number.toUpperCase(),
                    email: formData.email,
                    phone: formData.phone,
                },
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            toast.success("Payment details added successfully! You can now receive payments.");
            setHasPaymentDetails(true);

            setFormData(prev => ({
                ...prev,
                bank_account_number: "",
                confirm_account_number: "",
                pan_number: "",
            }));
        } catch (error: any) {
            console.error("Error adding payment details:", error);
            toast.error(error.message || "Failed to add payment details");
        } finally {
            setLoading(false);
        }
    };

    if (hasPaymentDetails) {
        return (
            <Card className="shadow-soft dark:bg-zinc-900/40 dark:border-zinc-800 transition-colors">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 dark:text-white transition-colors text-xl font-black">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        Verified
                    </CardTitle>
                    <CardDescription className="dark:text-zinc-500 transition-colors">
                        Your payment details are set up. You will receive payments directly to your bank account.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-950/50 border dark:border-zinc-800">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">Account Holder Name</Label>
                            <p className="text-base font-bold mt-1 dark:text-white">{formData.bank_account_name}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-950/50 border dark:border-zinc-800">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">IFSC Code</Label>
                            <p className="text-base font-bold mt-1 dark:text-white uppercase">{formData.bank_ifsc_code}</p>
                        </div>
                    </div>
                    
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-6 transition-colors">
                        <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                            💡 Payments from learners will be automatically transferred to your bank account within 24-48 hours of purchase.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setHasPaymentDetails(false)}
                        className="w-full h-12 rounded-xl dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-all font-bold"
                    >
                        Edit Payment Details
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-soft dark:bg-zinc-900/40 dark:border-zinc-800 transition-colors">
            <CardHeader>
                <CardTitle className="dark:text-white transition-colors text-xl font-black">Add Payment Details</CardTitle>
                <CardDescription className="dark:text-zinc-500 transition-colors">
                    Add your bank account details to receive payments from learners
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-500/20 rounded-2xl p-6 mb-8 flex gap-4 transition-colors">
                    <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-bold mb-2">Important:</p>
                        <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>Your bank account details are securely encrypted</li>
                            <li>Ensure the account holder name matches your bank records</li>
                            <li>Double-check your account number and IFSC code</li>
                            <li>PAN is required for verification</li>
                        </ul>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="bank_account_name" className="dark:text-zinc-300">Account Holder Name *</Label>
                        <Input
                            id="bank_account_name"
                            type="text"
                            placeholder="As per bank records"
                            value={formData.bank_account_name}
                            onChange={(e) => setFormData({ ...formData, bank_account_name: e.target.value })}
                            required
                            className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="pan_number" className="dark:text-zinc-300">PAN Number *</Label>
                            <Input
                                id="pan_number"
                                type="text"
                                placeholder="ABCDE1234F"
                                value={formData.pan_number || ""}
                                onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase().slice(0, 10) })}
                                required
                                minLength={10}
                                maxLength={10}
                                className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bank_ifsc_code" className="dark:text-zinc-300">IFSC Code *</Label>
                            <Input
                                id="bank_ifsc_code"
                                type="text"
                                placeholder="e.g., SBIN0001234"
                                value={formData.bank_ifsc_code}
                                onChange={(e) => setFormData({ ...formData, bank_ifsc_code: e.target.value.toUpperCase() })}
                                required
                                maxLength={11}
                                className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bank_account_number" className="dark:text-zinc-300">Bank Account Number *</Label>
                        <Input
                            id="bank_account_number"
                            type="text"
                            placeholder="Enter account number"
                            value={formData.bank_account_number}
                            onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value.replace(/\D/g, '') })}
                            required
                            minLength={9}
                            maxLength={18}
                            className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm_account_number" className="dark:text-zinc-300">Confirm Account Number *</Label>
                        <Input
                            id="confirm_account_number"
                            type="text"
                            placeholder="Re-enter account number"
                            value={formData.confirm_account_number}
                            onChange={(e) => setFormData({ ...formData, confirm_account_number: e.target.value.replace(/\D/g, '') })}
                            required
                            minLength={9}
                            maxLength={18}
                            className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="dark:text-zinc-300">Email (Optional)</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="your@email.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone" className="dark:text-zinc-300">Phone Number (Optional)</Label>
                            <Input
                                id="phone"
                                type="tel"
                                placeholder="10-digit mobile number"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                                maxLength={10}
                                className="dark:bg-zinc-950 dark:border-zinc-800 transition-colors"
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold transition-all shadow-lg shadow-primary/20">
                        {loading ? "Setting up..." : "Add Payment Details"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
