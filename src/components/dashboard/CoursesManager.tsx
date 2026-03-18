import { useState, useEffect } from "react";
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
import { Plus, Edit, Trash2, BookOpen, Eye, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { courseSchema } from "@/lib/validation";

interface CoursesManagerProps {
  onCourseChange?: () => void;
  isAddDialogOpen?: boolean;
  onAddDialogChange?: (open: boolean) => void;
}

export default function CoursesManager({ onCourseChange, isAddDialogOpen, onAddDialogChange }: CoursesManagerProps) {
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
  });

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

    if (editingCourse) {
      // Update existing course
      const { error } = await supabase
        .from("courses")
        .update({
          title: validation.data.title,
          description: validation.data.description,
          price: validation.data.price,
          category: validation.data.category,
          status: validation.data.status,
          is_free: formData.is_free,
        })
        .eq("id", editingCourse.id);

      if (error) {
        toast.error("Error updating course");
        console.error(error);
      } else {
        toast.success("Course updated successfully!");
        setDialogOpen(false);
        setEditingCourse(null);
        setFormData({ title: "", description: "", price: "", category: "", status: "draft", is_free: false });
        fetchCourses();
        onCourseChange?.();
      }
    } else {
      // Create new course
      const { error } = await supabase.from("courses").insert({
        creator_id: user.id,
        title: validation.data.title,
        description: validation.data.description,
        price: validation.data.price,
        category: validation.data.category,
        status: validation.data.status,
        is_free: formData.is_free,
      });

      if (error) {
        toast.error("Error creating course");
        console.error(error);
      } else {
        toast.success("Course created successfully!");
        setDialogOpen(false);
        setFormData({ title: "", description: "", price: "", category: "", status: "draft", is_free: false });
        fetchCourses();
        onCourseChange?.();
      }
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
    });
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingCourse(null);
      setFormData({ title: "", description: "", price: "", category: "", status: "draft", is_free: false });
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
    return <div className="text-center py-8 dark:text-zinc-500">Loading courses...</div>;
  }

  return (
    <div>
      {/* Redundant header and button moved to parent CreatorDashboard.tsx header area */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl dark:bg-zinc-950 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white transition-colors">{editingCourse ? "Edit Course" : "Create New Course"}</DialogTitle>
            <DialogDescription className="dark:text-zinc-500 transition-colors">
              {editingCourse ? "Update the details for your course" : "Fill in the details for your new course"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="dark:text-zinc-300">Course Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="dark:bg-zinc-900 dark:border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="dark:text-zinc-300">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="dark:bg-zinc-900 dark:border-zinc-800"
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
                <Label htmlFor="is_free" className="dark:text-zinc-300">Make this course free</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price" className="dark:text-zinc-300">Price (₹)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    disabled={formData.is_free}
                    required={!formData.is_free}
                    className="dark:bg-zinc-900 dark:border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category" className="dark:text-zinc-300">Category</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="dark:bg-zinc-900 dark:border-zinc-800"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="dark:text-zinc-300">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger className="dark:bg-zinc-900 dark:border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-zinc-950 dark:border-zinc-800">
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-bold transition-all">
              {editingCourse ? "Update Course" : "Create Course"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {courses.length === 0 ? (
        <Card className="shadow-soft dark:bg-zinc-900/40 dark:border-zinc-800">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground dark:text-zinc-500 mb-4 font-medium transition-colors">You haven't created any courses yet.</p>
            <Button 
              onClick={() => setDialogOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white font-bold transition-all"
            >
              Create Your First Course
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-500">
          {courses.map((course) => (
            <Card key={course.id} className="shadow-soft hover:shadow-hover dark:bg-zinc-900/40 dark:border-zinc-800/50 backdrop-blur-sm transition-all group overflow-hidden">
              <CardHeader className="relative">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="dark:text-white transition-colors">{course.title}</CardTitle>
                    <CardDescription className="mt-2 text-primary dark:text-primary font-bold transition-colors">{course.category}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(`/course/${course.id}`)}
                      title="View Course & Comments"
                      className="hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/course/${course.id}/lessons`)} 
                      className="hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white">
                      <BookOpen className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(course)}
                      className="hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"
                          className="hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-rose-400">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="dark:bg-zinc-950 dark:border-zinc-800">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="dark:text-white">Delete Course?</AlertDialogTitle>
                          <AlertDialogDescription className="dark:text-zinc-500">
                            This will permanently delete <strong className="dark:text-zinc-300">{course.title}</strong> and all its lessons. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(course.id)}
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
                <p className="text-sm text-muted-foreground dark:text-zinc-500 mb-6 font-medium line-clamp-2 transition-colors">{course.description}</p>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex gap-2 items-center">
                    <span className="text-xl font-black text-black dark:text-white transition-colors">
                      {course.is_free ? "FREE" : `₹${course.price}`}
                    </span>
                    {course.is_free && (
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 transition-colors">
                        Free Access
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                    course.status === "published" 
                      ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400" 
                      : "bg-muted dark:bg-zinc-800 text-muted-foreground dark:text-zinc-500"
                  )}>
                    {course.status}
                  </span>
                </div>
                <div className="text-xs font-bold text-gray-500 dark:text-zinc-600 flex items-center gap-2 transition-colors">
                  <Users className="h-3.5 w-3.5" />
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