import { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Upload, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { uploadToS3 } from "@/lib/s3-upload";

type Step = 1 | 2 | 3;

export default function VerificationForm({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState<Step>(1);
    const [loading, setLoading] = useState(false);

    // Step 1: Personal Details
    const [fullName, setFullName] = useState("");
    const [mobile, setMobile] = useState("");
    const [address, setAddress] = useState("");

    // Step 2: Document
    const [docType, setDocType] = useState<string>("aadhaar");
    const [idNumber, setIdNumber] = useState("");
    const [docFile, setDocFile] = useState<File | null>(null);
    const [docPreview, setDocPreview] = useState<string | null>(null);

    // Step 3: Selfie
    const webcamRef = useRef<Webcam>(null);
    const [selfieSrc, setSelfieSrc] = useState<string | null>(null);

    const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setDocFile(file);
            const url = URL.createObjectURL(file);
            setDocPreview(url);
        }
    };

    const captureSelfie = useCallback(() => {
        if (webcamRef.current) {
            const imageSrc = webcamRef.current.getScreenshot();
            setSelfieSrc(imageSrc);
        }
    }, [webcamRef]);

    // Convert base64 data URL to File object for S3 upload
    const dataURLtoFile = (dataurl: string, filename: string) => {
        let arr = dataurl.split(','),
            mime = arr[0].match(/:(.*?);/)![1],
            bstr = atob(arr[arr.length - 1]),
            n = bstr.length,
            u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    };

    const handleSubmit = async () => {
        if (!fullName || !mobile || !address || !docType || !idNumber || !docFile || !selfieSrc) {
            toast.error("Please complete all fields and capture a selfie.");
            return;
        }

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // 1. Upload Document to S3
            const docExt = docFile.name.split('.').pop();
            const docResult = await uploadToS3(docFile, `kyc/${user.id}/document.${docExt}`);

            // 2. Upload Selfie to S3
            const selfieFile = dataURLtoFile(selfieSrc, `selfie.jpg`);
            const selfieResult = await uploadToS3(selfieFile, `kyc/${user.id}/selfie.jpg`);

            // 3. Update Profile
            const { error } = await supabase
                .from("profiles")
                .update({
                    kyc_full_name: fullName,
                    kyc_mobile: mobile,
                    kyc_address: address,
                    kyc_document_type: docType,
                    kyc_id_number: idNumber,
                    kyc_document_url: docResult.key,
                    kyc_selfie_url: selfieResult.key,
                    verification_status: "pending",
                    verification_notes: "Manual review requested after documentation upload."
                })
                .eq("id", user.id);

            if (error) throw error;

            toast.success("Verification request submitted successfully!");
            onComplete();
        } catch (error: any) {
            console.error("KYC submission error:", error);
            toast.error(error.message || "Failed to submit KYC details");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-2xl mx-auto border-2 border-primary/20">
            <CardHeader>
                <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-2xl">Complete KYC Verification</CardTitle>
                    <div className="flex gap-2 text-sm font-semibold text-muted-foreground">
                        <span className={step >= 1 ? "text-primary" : ""}>Step 1</span> •
                        <span className={step >= 2 ? "text-primary" : ""}>Step 2</span> •
                        <span className={step >= 3 ? "text-primary" : ""}>Step 3</span>
                    </div>
                </div>
                <CardDescription>
                    Verify your identity to get the verified seller badge. We use AI to match your selfie with your government ID.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {step === 1 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <h3 className="font-semibold text-lg border-b pb-2">Personal Details</h3>
                        <div className="space-y-2">
                            <Label htmlFor="fullName">Full Name (as per ID)</Label>
                            <Input
                                id="fullName"
                                placeholder="John Doe"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobile">Mobile Number</Label>
                            <Input
                                id="mobile"
                                placeholder="9876543210"
                                value={mobile}
                                onChange={e => setMobile(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="address">Full Residential Address</Label>
                            <Textarea
                                id="address"
                                placeholder="Flat No, Building, Street, City, State, PIN"
                                rows={3}
                                value={address}
                                onChange={e => setAddress(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <h3 className="font-semibold text-lg border-b pb-2">Government ID</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="docType">Document Type</Label>
                                <Select value={docType} onValueChange={setDocType}>
                                    <SelectTrigger id="docType">
                                        <SelectValue placeholder="Select ID Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="aadhaar">Aadhaar Card</SelectItem>
                                        <SelectItem value="pan">PAN Card</SelectItem>
                                        <SelectItem value="driving_license">Driving License</SelectItem>
                                        <SelectItem value="passport">Passport</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="idNumber">ID Number</Label>
                                <Input
                                    id="idNumber"
                                    placeholder="Enter your ID document number"
                                    value={idNumber}
                                    onChange={e => setIdNumber(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-2">
                            <Label>Upload Clear Photo of ID</Label>
                            <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-muted/30 relative overflow-hidden transition-all hover:bg-muted/50">
                                {docPreview ? (
                                    <div className="relative w-full aspect-video">
                                        <img src={docPreview} alt="Document Preview" className="w-full h-full object-contain rounded-md" />
                                    </div>
                                ) : (
                                    <div className="text-center space-y-2 p-4">
                                        <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
                                        <p className="text-sm font-medium">Click to upload or drag and drop</p>
                                        <p className="text-xs text-muted-foreground">JPG, PNG up to 5MB</p>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleDocUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md flex items-start gap-3 text-sm">
                            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-blue-800 dark:text-blue-300">
                                Ensure all details, including your face and ID number, are clearly visible. Do not upload photocopies or black & white scans.
                            </p>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <h3 className="font-semibold text-lg border-b pb-2">Live Selfie</h3>
                        <p className="text-sm text-muted-foreground">
                            Please take a clear selfie in a well-lit area. This will be matched against your ID photo.
                        </p>

                        <div className="max-w-sm mx-auto">
                            {!selfieSrc ? (
                                <div className="rounded-xl overflow-hidden border-4 border-muted relative aspect-square bg-black">
                                    <Webcam
                                        audio={false}
                                        ref={webcamRef}
                                        screenshotFormat="image/jpeg"
                                        videoConstraints={{ facingMode: "user", aspectRatio: 1 }}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                                        <Button onClick={captureSelfie} size="lg" className="rounded-full shadow-lg h-14 px-8 gap-2">
                                            <Camera className="h-5 w-5" /> Take Selfie
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl overflow-hidden border-4 border-primary relative aspect-square">
                                    <img src={selfieSrc} alt="Selfie" className="w-full h-full object-cover" />
                                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                                        <Button onClick={() => setSelfieSrc(null)} variant="destructive" size="sm" className="shadow-lg">
                                            Retake
                                        </Button>
                                        <div className="bg-green-500 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 text-sm font-semibold">
                                            <CheckCircle2 className="h-4 w-4" /> Captured
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex justify-between border-t bg-muted/10 p-6">
                <Button
                    variant="outline"
                    onClick={() => setStep(s => (s - 1) as Step)}
                    disabled={step === 1 || loading}
                    className="gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </Button>

                {step < 3 ? (
                    <Button
                        onClick={() => setStep(s => (s + 1) as Step)}
                        disabled={
                            (step === 1 && (!fullName || !mobile || !address)) ||
                            (step === 2 && (!docType || !idNumber || !docFile))
                        }
                        className="gap-2"
                    >
                        Next <ArrowRight className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button
                        onClick={handleSubmit}
                        disabled={!selfieSrc || loading}
                        className="gap-2 min-w-[140px]"
                    >
                        {loading ? "Submitting..." : (
                            <>Submit KYC <CheckCircle2 className="h-4 w-4" /></>
                        )}
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
