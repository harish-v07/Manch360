import { useState, useEffect } from "react";
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
import { Plus, Edit, Trash2, Upload, X } from "lucide-react";
import { productSchema } from "@/lib/validation";
import { uploadToS3 } from "@/lib/s3-upload";
import { S3Media } from "@/components/S3Media";

export default function ProductsManager({
  onProductChange,
}: {
  onProductChange?: () => void;
}) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [existingMediaUrls, setExistingMediaUrls] = useState<string[]>([]);
  const [digitalFile, setDigitalFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    type: "digital" as "digital" | "physical" | "service",
    media_urls: [] as string[],
    file_url: "",
    usage_instructions: "",
  });

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
        const { url } = await uploadToS3(digitalFile, "products/files");
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
    });
    setMediaFiles([]);
    setMediaPreviews([]);
    setExistingMediaUrls([]);
    setDigitalFile(null);
    setEditingProduct(null);
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
    return <div className="text-center py-8">Loading products...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold">My Products</h2>
          <p className="text-muted-foreground">Manage your product listings</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add New Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? "Edit Product" : "Create New Product"}
              </DialogTitle>
              <DialogDescription>
                {editingProduct
                  ? "Update your product details"
                  : "Add a new product to your storefront"}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price (₹)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(
                      value: "digital" | "physical" | "service",
                    ) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="digital">Digital</SelectItem>
                      <SelectItem value="physical">Physical</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.type === "digital" && (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                  <h3 className="font-semibold text-sm">
                    Digital Product File & Instructions
                  </h3>

                  <div className="space-y-2">
                    <Label>Product File (.zip)</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept=".zip,.rar,.7z"
                        className="flex-1 cursor-pointer"
                        onChange={(e) =>
                          setDigitalFile(e.target.files?.[0] || null)
                        }
                      />
                      {(digitalFile || formData.file_url) && (
                        <span className="text-sm text-green-600 font-medium whitespace-nowrap">
                          {digitalFile ? digitalFile.name : "File uploaded"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload the file that buyers will download after purchase.
                    </p>
                  </div>

                  <div className="space-y-2 mt-4">
                    <Label htmlFor="usage_instructions">
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
                      placeholder="Explain how to run, install, or use this digital product..."
                      rows={4}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Product Images/Videos (Multiple)</Label>
                <div className="border-2 border-dashed rounded-lg p-4">
                  {/* Show existing media */}
                  {existingMediaUrls.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <p className="text-sm text-muted-foreground">
                        Existing Media
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        {existingMediaUrls.map((url, index) => (
                          <div key={`existing-${index}`} className="relative">
                            <S3Media
                              src={url}
                              className="w-full h-32 object-cover rounded"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6"
                              onClick={() => removeExistingMedia(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Show new media previews */}
                  {mediaPreviews.length > 0 ? (
                    <div className="space-y-4">
                      {existingMediaUrls.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          New Media
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        {mediaPreviews.map((preview, index) => (
                          <div key={index} className="relative">
                            {mediaFiles[index]?.type.startsWith("video/") ? (
                              <video
                                src={preview}
                                className="w-full h-32 object-cover rounded"
                                controls
                              />
                            ) : (
                              <img
                                src={preview}
                                alt={`Preview ${index + 1}`}
                                className="w-full h-32 object-cover rounded"
                              />
                            )}
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6"
                              onClick={() => removeMedia(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <label
                        htmlFor="media-upload"
                        className="flex items-center justify-center cursor-pointer py-2 border-2 border-dashed rounded"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        <span className="text-sm">Add more</span>
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
                      className="flex flex-col items-center justify-center cursor-pointer py-8"
                    >
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">
                        Click to upload images or videos
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">
                        Max 50MB each, multiple files allowed
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
                      className="flex items-center justify-center cursor-pointer py-2 border-2 border-dashed rounded"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      <span className="text-sm">Add more media</span>
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
              <Button type="submit" className="w-full" disabled={uploading}>
                {uploading
                  ? editingProduct
                    ? "Updating..."
                    : "Creating..."
                  : editingProduct
                    ? "Update Product"
                    : "Create Product"}
              </Button>
            </form>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {products.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              You haven't added any products yet.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              Add Your First Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {products.map((product) => (
            <Card
              key={product.id}
              className="shadow-soft hover:shadow-hover transition-all"
            >
              {product.media_urls && product.media_urls.length > 0 && (
                <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                  <S3Media
                    src={product.media_urls[0]}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    controls={false}
                  />
                </div>
              )}
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{product.name}</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(product)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete{" "}
                            <strong>{product.name}</strong>. This cannot be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(product.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {product.description}
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-primary">
                    ₹{product.price}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs bg-secondary text-secondary-foreground">
                    {product.type}
                  </span>
                </div>
                {product.media_urls && product.media_urls.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    +{product.media_urls.length - 1} more
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
