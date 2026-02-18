import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

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
            // Validation
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

            // PAN Validation
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

            // Call Edge Function to create linked account
            const { data, error } = await supabase.functions.invoke("create-linked-account", {
                body: {
                    bank_account_number: formData.bank_account_number,
                    bank_ifsc_code: formData.bank_ifsc_code.toUpperCase(),
                    bank_account_name: formData.bank_account_name,
                    pan: formData.pan_number.toUpperCase(), // Send PAN
                    email: formData.email,
                    phone: formData.phone,
                },
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            });

            if (error) {
                throw error;
            }

            if (data.error) {
                throw new Error(data.error);
            }

            toast.success("Payment details added successfully! You can now receive payments.");
            setHasPaymentDetails(true);

            // Clear sensitive data
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
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        Payment Details Verified
                    </CardTitle>
                    <CardDescription>
                        Your payment details are set up. You will receive payments directly to your bank account.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Account Holder Name</Label>
                        <p className="text-sm font-medium mt-1">{formData.bank_account_name}</p>
                    </div>
                    <div>
                        <Label>IFSC Code</Label>
                        <p className="text-sm font-medium mt-1">{formData.bank_ifsc_code}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-800">
                            💡 Payments from learners will be automatically transferred to your bank account within 24-48 hours.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setHasPaymentDetails(false)}
                        className="w-full mt-4"
                    >
                        Edit Payment Details
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Add Payment Details</CardTitle>
                <CardDescription>
                    Add your bank account details to receive payments from learners
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                        <p className="font-medium mb-1">Important:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li>Your bank account details are securely encrypted</li>
                            <li>Ensure the account holder name matches your bank records</li>
                            <li>Double-check your account number and IFSC code</li>
                            <li>PAN is required for Razorpay verification</li>
                        </ul>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="bank_account_name">Account Holder Name *</Label>
                        <Input
                            id="bank_account_name"
                            type="text"
                            placeholder="As per bank records"
                            value={formData.bank_account_name}
                            onChange={(e) => setFormData({ ...formData, bank_account_name: e.target.value })}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="pan_number">PAN Number *</Label>
                        <Input
                            id="pan_number"
                            type="text"
                            placeholder="ABCDE1234F"
                            value={formData.pan_number || ""}
                            onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase().slice(0, 10) })}
                            required
                            minLength={10}
                            maxLength={10}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bank_account_number">Bank Account Number *</Label>
                        <Input
                            id="bank_account_number"
                            type="text"
                            placeholder="Enter account number"
                            value={formData.bank_account_number}
                            onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value.replace(/\D/g, '') })}
                            required
                            minLength={9}
                            maxLength={18}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm_account_number">Confirm Account Number *</Label>
                        <Input
                            id="confirm_account_number"
                            type="text"
                            placeholder="Re-enter account number"
                            value={formData.confirm_account_number}
                            onChange={(e) => setFormData({ ...formData, confirm_account_number: e.target.value.replace(/\D/g, '') })}
                            required
                            minLength={9}
                            maxLength={18}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bank_ifsc_code">IFSC Code *</Label>
                        <Input
                            id="bank_ifsc_code"
                            type="text"
                            placeholder="e.g., SBIN0001234"
                            value={formData.bank_ifsc_code}
                            onChange={(e) => setFormData({ ...formData, bank_ifsc_code: e.target.value.toUpperCase() })}
                            required
                            maxLength={11}
                        />
                        <p className="text-xs text-muted-foreground">
                            Find your IFSC code on your bank passbook or cheque
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email (Optional)</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="your@email.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number (Optional)</Label>
                        <Input
                            id="phone"
                            type="tel"
                            placeholder="10-digit mobile number"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                            maxLength={10}
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Setting up..." : "Add Payment Details"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
