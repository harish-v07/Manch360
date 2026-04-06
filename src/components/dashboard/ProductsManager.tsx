import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Upload, X, BookOpen, Eye, Users, Search } from "lucide-react";
import { productSchema } from "@/lib/validation";
import { uploadToS3 } from "@/lib/s3-upload";
import { S3Media } from "@/components/S3Media";

interface ProductsManagerProps {
  onProductChange?: () => void;
  isAddDialogOpen?: boolean;
  onAddDialogChange?: (open: boolean) => void;
}

export default function ProductsManager({
  onProductChange,
  isAddDialogOpen,
  onAddDialogChange
}: ProductsManagerProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [existingMediaUrls, setExistingMediaUrls] = useState<string[]>([]);
  const [digitalFile, setDigitalFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    type: "digital" as "digital" | "physical" | "service",
    media_urls: [] as string[],
    file_url: "",
    usage_instructions: "",
    weight: "0.5",
  });

  const dialogOpen = isAddDialogOpen !== undefined ? isAddDialogOpen : internalDialogOpen;
  const setDialogOpen = onAddDialogChange || setInternalDialogOpen;

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error fetching products");
      console.error(error);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file types
    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
    ];
    const invalidFiles = files.filter(
      (file) => !validTypes.includes(file.type),
    );
    if (invalidFiles.length > 0) {
      toast.error(
        "Please upload valid images (JPEG, PNG, GIF, WebP) or videos (MP4, WebM)",
      );
      return;
    }

    // Validate file sizes (max 50MB each)
    const oversizedFiles = files.filter((file) => file.size > 50 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast.error("Each file must be less than 50MB");
      return;
    }

    // Add new files to existing ones
    const newFiles = [...mediaFiles, ...files];
    setMediaFiles(newFiles);

    // Create previews for new files
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMedia = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingMedia = (index: number) => {
    setExistingMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadMedia = async (): Promise<string[]> => {
    if (mediaFiles.length === 0) return [];

    try {
      const uploadPromises = mediaFiles.map(async (file) => {
        const { url } = await uploadToS3(file, "products");
        return url;
      });

      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error("Error uploading media:", error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      // Upload new media if present
      let newMediaUrls: string[] = [];
      if (mediaFiles.length > 0) {
        newMediaUrls = await uploadMedia();
      }

      // Combine existing and new media URLs
      const allMediaUrls = [...existingMediaUrls, ...newMediaUrls];

      let finalFileUrl = formData.file_url;
      if (digitalFile) {
        const { url } = await uploadToS3(digitalFile, "products/files", (percent) => {
          setUploadProgress(percent);
        });
        finalFileUrl = url;
      }

      // Validate input
      const validation = productSchema.safeParse({
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        type: formData.type,
        media_urls: allMediaUrls,
        file_url: finalFileUrl || "",
        usage_instructions: formData.usage_instructions || "",
        weight: parseFloat(formData.weight) || 0.5,
      });

      if (!validation.success) {
        toast.error(validation.error.issues[0].message);
        setUploading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (editingProduct) {
        // Update existing product
        const { error } = await supabase
          .from("products")
          .update({
            name: validation.data.name,
            description: validation.data.description,
            price: validation.data.price,
            type: validation.data.type as "digital" | "physical",
            media_urls: allMediaUrls,
            file_url: finalFileUrl,
            usage_instructions: validation.data.usage_instructions,
            weight: validation.data.weight,
          })
          .eq("id", editingProduct.id);

        if (error) {
          toast.error("Error updating product");
          console.error(error);
        } else {
          toast.success("Product updated successfully!");
          setDialogOpen(false);
          resetForm();
          fetchProducts();
          onProductChange?.();
        }
      } else {
        // Create new product
        const { error } = await supabase.from("products").insert([
          {
            creator_id: user.id,
            name: validation.data.name,
            description: validation.data.description,
            price: validation.data.price,
            type: validation.data.type as "digital" | "physical",
            media_urls: allMediaUrls,
            file_url: finalFileUrl,
            usage_instructions: validation.data.usage_instructions,
            weight: validation.data.weight,
          },
        ]);

        if (error) {
          toast.error("Error creating product");
          console.error(error);
        } else {
          toast.success("Product created successfully!");
          setDialogOpen(false);
          resetForm();
          fetchProducts();
          onProductChange?.();
        }
      }
    } catch (error) {
      toast.error("Error uploading media or saving product");
      console.error(error);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: "",
      type: "digital",
      media_urls: [],
      file_url: "",
      usage_instructions: "",
      weight: "0.5",
    });
    setMediaFiles([]);
    setMediaPreviews([]);
    setExistingMediaUrls([]);
    setDigitalFile(null);
    setEditingProduct(null);
    setUploadProgress(0);
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      price: product.price.toString(),
      type: product.type,
      media_urls: product.media_urls || [],
      file_url: product.file_url || "",
      usage_instructions: product.usage_instructions || "",
      weight: product.weight?.toString() || "0.5",
    });
    setExistingMediaUrls(product.media_urls || []);
    setMediaFiles([]);
    setMediaPreviews([]);
    setDigitalFile(null);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      toast.error("Error deleting product");
    } else {
      toast.success("Product deleted");
      fetchProducts();
      onProductChange?.();
    }
  };

  if (loading) {
    return <div className="text-center py-6 dark:text-zinc-500 transition-colors text-sm">Loading products...</div>;
  }

  return (
    <div>
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-h-[90vh] flex flex-col dark:bg-zinc-950 dark:border-zinc-800 rounded-3xl max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl dark:text-white transition-colors">
              {editingProduct ? "Edit Product" : "Create New Product"}
            </DialogTitle>
            <DialogDescription className="text-sm dark:text-zinc-500 transition-colors">
              {editingProduct
                ? "Update your product details"
                : "Add a new product to your storefront"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Product Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
                className="h-11 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
                className="dark:bg-zinc-900 dark:border-zinc-800 rounded-xl text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Price (₹)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  required
                  className="h-11 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(
                    value: "digital" | "physical" | "service",
                  ) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger className="h-11 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-zinc-950 dark:border-zinc-800">
                    <SelectItem value="digital">Digital</SelectItem>
                    <SelectItem value="physical">Physical</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.type === "digital" && (
              <div className="space-y-4 border rounded-xl p-3 bg-muted/30 dark:bg-zinc-900/50 dark:border-zinc-800 transition-colors">
                <h3 className="font-bold text-[10px] dark:text-zinc-200 uppercase tracking-widest">
                  Digital Product Details
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="product-file" className="text-[10px] dark:text-zinc-400 font-bold">FILE (.ZIP)</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="product-file"
                      type="file"
                      accept=".zip,.rar,.7z,application/zip,application/x-zip-compressed,application/octet-stream"
                      className="h-10 text-xs flex-1 cursor-pointer dark:bg-zinc-900 dark:border-zinc-800 rounded-xl"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file) {
                          // 200MB limit
                          if (file.size > 200 * 1024 * 1024) {
                            toast.error("Digital file must be less than 200MB");
                            e.target.value = '';
                            setDigitalFile(null);
                            return;
                          }
                        }
                        setDigitalFile(file);
                      }}
                    />
                    {(digitalFile || formData.file_url) && (
                      <span className="text-[10px] text-green-600 dark:text-emerald-400 font-black whitespace-nowrap uppercase">
                        {digitalFile ? "READY" : "UPLOADED"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mt-3">
                  <Label htmlFor="usage_instructions" className="text-[10px] dark:text-zinc-400 font-bold uppercase tracking-widest">
                    Usage Instructions
                  </Label>
                  <Textarea
                    id="usage_instructions"
                    value={formData.usage_instructions}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        usage_instructions: e.target.value,
                      })
                    }
                    placeholder="Instructions for the buyer..."
                    rows={3}
                    className="dark:bg-zinc-900 dark:border-zinc-800 rounded-xl text-xs"
                  />
                </div>
              </div>
            )}

            {formData.type === "physical" && (
              <div className="space-y-4 border rounded-xl p-3 bg-muted/30 dark:bg-zinc-900/50 dark:border-zinc-800 transition-colors">
                <h3 className="font-bold text-[10px] dark:text-zinc-200 uppercase tracking-widest">
                  Physical Product Details
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="weight" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">
                    Package Weight (kg)
                  </Label>
                  <p className="text-[10px] text-muted-foreground dark:text-zinc-500 mb-1">
                    Used to calculate accurate shipping rates via Shiprocket.
                  </p>
                  <Input
                    id="weight"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1000"
                    value={formData.weight}
                    onChange={(e) =>
                      setFormData({ ...formData, weight: e.target.value })
                    }
                    required
                    className="h-11 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Product Media</Label>
              <div className="border border-dashed rounded-xl p-3 dark:border-zinc-800 transition-colors">
                {/* Show existing media */}
                {existingMediaUrls.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <p className="text-[10px] text-muted-foreground dark:text-zinc-500 font-bold uppercase tracking-widest">
                      Existing
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {existingMediaUrls.map((url, index) => (
                        <div key={`existing-${index}`} className="relative group aspect-square">
                          <S3Media
                            src={url}
                            className="w-full h-full object-cover rounded-lg dark:opacity-80 group-hover:opacity-100 transition-opacity"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -top-1 -right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                            onClick={() => removeExistingMedia(index)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show new media previews */}
                {mediaPreviews.length > 0 ? (
                  <div className="space-y-3">
                    {existingMediaUrls.length > 0 && (
                      <p className="text-[10px] text-muted-foreground dark:text-zinc-500 font-bold uppercase tracking-widest">
                        New
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      {mediaPreviews.map((preview, index) => (
                        <div key={index} className="relative group aspect-square">
                          {mediaFiles[index]?.type.startsWith("video/") ? (
                            <video
                              src={preview}
                              className="w-full h-full object-cover rounded-lg dark:opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                          ) : (
                            <img
                              src={preview}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-full object-cover rounded-lg dark:opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                          )}
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -top-1 -right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                            onClick={() => removeMedia(index)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <label
                      htmlFor="media-upload"
                      className="flex items-center justify-center cursor-pointer h-10 border border-dashed rounded-xl dark:border-zinc-800 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5 mr-2 dark:text-zinc-500" />
                      <span className="text-xs dark:text-zinc-400 font-bold">Add more</span>
                      <input
                        id="media-upload"
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={handleMediaChange}
                      />
                    </label>
                  </div>
                ) : existingMediaUrls.length === 0 ? (
                  <label
                    htmlFor="media-upload"
                    className="flex flex-col items-center justify-center cursor-pointer py-6 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <Upload className="h-6 w-6 text-muted-foreground dark:text-zinc-600 mb-2" />
                    <span className="text-xs text-muted-foreground dark:text-zinc-400 font-medium">
                      Select images or videos
                    </span>
                    <input
                      id="media-upload"
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={handleMediaChange}
                    />
                  </label>
                ) : (
                  <label
                    htmlFor="media-upload"
                    className="flex items-center justify-center cursor-pointer h-10 border border-dashed rounded-xl dark:border-zinc-800 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 mr-2 dark:text-zinc-500" />
                    <span className="text-xs dark:text-zinc-400 font-bold">Add more media</span>
                    <input
                      id="media-upload"
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={handleMediaChange}
                    />
                  </label>
                )}
              </div>
            </div>
            <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all" disabled={uploading}>
              {uploading
                ? `Uploading...`
                : editingProduct
                  ? "Update Product"
                  : "Create Product"}
            </Button>
          </form>
          </div>
        </DialogContent>
      </Dialog>

      {products.length === 0 ? (
        <Card className="shadow-soft dark:bg-zinc-900/40 dark:border-zinc-800 rounded-2xl">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground dark:text-zinc-500 mb-4 font-medium transition-colors">
              You haven't added any products yet.
            </p>
            <Button 
              onClick={() => setDialogOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 rounded-xl transition-all"
            >
              Add Your First Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 rounded-2xl bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 font-medium"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 transition-all duration-500">
          {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.type?.toLowerCase().includes(searchQuery.toLowerCase())).map((product) => (
            <Card
              key={product.id}
              className="shadow-soft hover:shadow-hover dark:bg-zinc-900/40 dark:border-zinc-800/50 backdrop-blur-sm transition-all group overflow-hidden rounded-2xl"
            >
              {product.media_urls && product.media_urls.length > 0 && (
                <div className="aspect-video w-full overflow-hidden transition-all duration-500 group-hover:scale-105">
                  <S3Media
                    src={product.media_urls[0]}
                    alt={product.name}
                    className="w-full h-full object-cover dark:opacity-80 group-hover:opacity-100 transition-opacity"
                    controls={false}
                  />
                </div>
              )}
              <CardHeader className="p-5">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg dark:text-white transition-colors">{product.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(product)}
                      className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"
                          className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-rose-400">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="dark:bg-zinc-950 dark:border-zinc-800 rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-lg dark:text-white">Delete Product?</AlertDialogTitle>
                          <AlertDialogDescription className="text-sm dark:text-zinc-500">
                            This will permanently delete{" "}
                            <strong className="dark:text-zinc-300">{product.name}</strong>. This cannot be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="h-10 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(product.id)}
                            className="h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <p className="text-[15px] text-muted-foreground dark:text-zinc-500 mb-5 font-medium line-clamp-2 transition-colors">
                  {product.description}
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-xl font-black text-black dark:text-white transition-colors">
                    ₹{product.price}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-emerald-100/10 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/20 transition-all">
                    {product.type}
                  </span>
                </div>
                {product.media_urls && product.media_urls.length > 1 && (
                  <p className="text-[11px] font-black text-gray-400 dark:text-zinc-600 mt-4 transition-colors uppercase tracking-widest">
                    +{product.media_urls.length - 1} more media
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
