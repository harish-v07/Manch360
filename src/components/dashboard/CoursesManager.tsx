import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit, Trash2, BookOpen, Eye, Users, Upload, X, Image as ImageIcon } from "lucide-react";
import { uploadToS3 } from "@/lib/s3-upload";
import { useS3Url } from "@/hooks/useS3Url";
import { S3Media } from "@/components/S3Media";
import { useNavigate } from "react-router-dom";
import { courseSchema } from "@/lib/validation";

interface CoursesManagerProps {
  onCourseChange?: () => void;
  isAddDialogOpen?: boolean;
  onAddDialogChange?: (open: boolean) => void;
  onViewCourse?: (courseId: string) => void;
}

export default function CoursesManager({ onCourseChange, isAddDialogOpen, onAddDialogChange, onViewCourse }: CoursesManagerProps) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [courseLearners, setCourseLearners] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    category: "",
    status: "draft",
    is_free: false,
    thumbnail_url: "",
  });
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const { s3Url: signedBannerUrl } = useS3Url(formData?.thumbnail_url || undefined);
  const currentBannerPreview = bannerPreview || signedBannerUrl;

  const dialogOpen = isAddDialogOpen !== undefined ? isAddDialogOpen : internalDialogOpen;
  const setDialogOpen = onAddDialogChange || setInternalDialogOpen;

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error fetching courses");
      console.error(error);
    } else {
      setCourses(data || []);

      // Fetch learner counts for each course
      if (data && data.length > 0) {
        const courseIds = data.map(c => c.id);
        const { data: enrollmentsData } = await supabase
          .from("enrollments")
          .select("course_id")
          .in("course_id", courseIds);

        // Count enrollments per course
        const counts: Record<string, number> = {};
        enrollmentsData?.forEach(enrollment => {
          counts[enrollment.course_id] = (counts[enrollment.course_id] || 0) + 1;
        });
        setCourseLearners(counts);
      }
    }
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error("Image must be less than 5MB");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setBannerFile(file);
    setBannerPreview(previewUrl);
  };

  const removeImage = () => {
    setBannerFile(null);
    setBannerPreview(null);
    setFormData(prev => ({ ...prev, thumbnail_url: "" }));
    if (bannerInputRef.current) bannerInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    const validation = courseSchema.safeParse({
      title: formData.title,
      description: formData.description,
      price: formData.is_free ? 0 : parseFloat(formData.price),
      category: formData.category,
      status: formData.status,
    });

    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);
    try {
      let finalThumbnailUrl = formData.thumbnail_url;

      if (bannerFile) {
        const sanitizeFile = (file: File) => {
          const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/-+/g, '-');
          return new File([file], cleanName, { type: file.type });
        };
        const safeFile = sanitizeFile(bannerFile);
        const result = await uploadToS3(safeFile, "courses");
        finalThumbnailUrl = result.url;
      }

      const courseData = {
        title: validation.data.title,
        description: validation.data.description,
        price: validation.data.price,
        category: validation.data.category,
        status: validation.data.status,
        is_free: formData.is_free,
        thumbnail_url: finalThumbnailUrl,
      };

      if (editingCourse) {
        const { error } = await supabase
          .from("courses")
          .update(courseData)
          .eq("id", editingCourse.id);

        if (error) throw error;
        toast.success("Course updated successfully!");
      } else {
        const { error } = await supabase.from("courses").insert({
          ...courseData,
          creator_id: user.id,
        });

        if (error) throw error;
        toast.success("Course created successfully!");
      }

      setDialogOpen(false);
      setEditingCourse(null);
      setBannerFile(null);
      setBannerPreview(null);
      setFormData({ title: "", description: "", price: "", category: "", status: "draft", is_free: false, thumbnail_url: "" });
      fetchCourses();
      onCourseChange?.();
    } catch (error: any) {
      toast.error(error.message || "Error saving course");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (course: any) => {
    setEditingCourse(course);
    setFormData({
      title: course.title,
      description: course.description || "",
      price: course.price.toString(),
      category: course.category || "",
      status: course.status,
      is_free: course.is_free,
      thumbnail_url: course.thumbnail_url || "",
    });
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingCourse(null);
      setBannerFile(null);
      setBannerPreview(null);
      setFormData({ title: "", description: "", price: "", category: "", status: "draft", is_free: false, thumbnail_url: "" });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("courses").delete().eq("id", id);

    if (error) {
      toast.error("Error deleting course");
    } else {
      toast.success("Course deleted");
      fetchCourses();
      onCourseChange?.();
    }
  };

  if (loading) {
    return <div className="text-center py-6 dark:text-zinc-500 text-sm">Loading courses...</div>;
  }

  return (
    <div>
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-xl dark:bg-zinc-950 dark:border-zinc-800 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl dark:text-white transition-colors">{editingCourse ? "Edit Course" : "Create New Course"}</DialogTitle>
            <DialogDescription className="text-sm dark:text-zinc-500 transition-colors">
              {editingCourse ? "Update the details for your course" : "Fill in the details for your new course"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Course Banner (Optional)</Label>
              <div className="border-2 border-dashed rounded-xl p-1 overflow-hidden h-32 relative group bg-zinc-900/50 dark:border-zinc-800">
                {currentBannerPreview ? (
                  <>
                    <img src={currentBannerPreview} alt="Banner Preview" className="w-full h-full object-cover rounded-lg" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => bannerInputRef.current?.click()}
                        className="mr-2 h-8 rounded-lg"
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={removeImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div
                    className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-zinc-500 hover:bg-zinc-800/50 rounded-lg transition-colors"
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    <Upload className="h-6 w-6 mb-1 opacity-50" />
                    <span className="text-xs font-bold">Upload Course Banner</span>
                    <span className="text-[10px] opacity-70 mt-1 uppercase tracking-widest">Recommended: 1200 x 400px</span>
                  </div>
                )}
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Course Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="h-11 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="dark:bg-zinc-900 dark:border-zinc-800 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_free"
                  checked={formData.is_free}
                  onChange={(e) => setFormData({ ...formData, is_free: e.target.checked, price: e.target.checked ? "0" : formData.price })}
                  className="h-4 w-4 rounded border-gray-300 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                />
                <Label htmlFor="is_free" className="text-sm dark:text-zinc-300 font-medium">Make this course free</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Price (₹)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    disabled={formData.is_free}
                    required={!formData.is_free}
                    className="h-11 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Category</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="h-11 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs dark:text-zinc-300 uppercase tracking-widest font-bold">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger className="h-11 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-zinc-950 dark:border-zinc-800">
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
              {editingCourse ? "Update Course" : "Create Course"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {courses.length === 0 ? (
        <Card className="shadow-soft dark:bg-zinc-900/40 dark:border-zinc-800 rounded-2xl">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground dark:text-zinc-500 mb-4 font-medium transition-colors">You haven't created any courses yet.</p>
            <Button 
              onClick={() => setDialogOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 rounded-xl transition-all"
            >
              Create Your First Course
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 transition-all duration-500">
          {courses.map((course) => (
            <Card key={course.id} className="shadow-soft hover:shadow-hover dark:bg-zinc-900/40 dark:border-zinc-800/50 backdrop-blur-sm transition-all group overflow-hidden rounded-2xl flex flex-col">
              <div className="h-32 bg-zinc-800 relative overflow-hidden shrink-0">
                {course.thumbnail_url ? (
                  <S3Media 
                    src={course.thumbnail_url} 
                    alt={course.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    controls={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700">
                    <ImageIcon className="h-10 w-10 opacity-20" />
                  </div>
                )}
                <div className="absolute top-3 left-3">
                  <span className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg backdrop-blur-md transition-all",
                    course.status === 'published' 
                      ? "bg-emerald-500/80 text-white" 
                      : "bg-zinc-800/80 text-zinc-400"
                  )}>
                    {course.status}
                  </span>
                </div>
              </div>
              <CardHeader className="relative p-6 pb-0">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl dark:text-white transition-colors">{course.title}</CardTitle>
                    <CardDescription className="mt-1 text-xs text-primary dark:text-primary font-bold transition-colors uppercase tracking-widest">{course.category}</CardDescription>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onViewCourse ? onViewCourse(course.id) : navigate(`/course/${course.id}`)}
                      title="View Course & Comments"
                      className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/course/${course.id}/lessons`)} 
                      className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white">
                      <BookOpen className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(course)}
                      className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white">
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
                          <AlertDialogTitle className="text-lg dark:text-white">Delete Course?</AlertDialogTitle>
                          <AlertDialogDescription className="text-sm dark:text-zinc-500">
                            This will permanently delete <strong className="dark:text-zinc-300">{course.title}</strong> and all its lessons. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="h-10 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(course.id)}
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
              <CardContent className="p-6 pt-0">
                <p className="text-base text-muted-foreground dark:text-zinc-500 mb-6 font-medium line-clamp-2 transition-colors">{course.description}</p>
                <div className="flex justify-between items-center text-base border-t dark:border-zinc-800/50 pt-5">
                  <span className="font-black text-black dark:text-white">
                    {course.is_free ? (
                      <span className="text-emerald-500">FREE</span>
                    ) : (
                      `₹${course.price}`
                    )}
                  </span>
                </div>
                <div className="text-[10px] font-bold text-gray-400 dark:text-zinc-600 flex items-center gap-2 transition-colors uppercase tracking-wider">
                  <Users className="h-3 w-3" />
                  {courseLearners[course.id] || 0} learner{(courseLearners[course.id] || 0) !== 1 ? 's' : ''} enrolled
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}