import { useState, useEffect } from "react";
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
import { Plus, Edit, Trash2, BookOpen, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { courseSchema } from "@/lib/validation";

export default function CoursesManager({ onCourseChange }: { onCourseChange?: () => void }) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [courseLearners, setCourseLearners] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    category: "",
    status: "draft",
    is_free: false,
  });

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
    return <div className="text-center py-8">Loading courses...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold">My Courses</h2>
          <p className="text-muted-foreground">Manage your course offerings</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add New Course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCourse ? "Edit Course" : "Create New Course"}</DialogTitle>
              <DialogDescription>
                {editingCourse ? "Update the details for your course" : "Fill in the details for your new course"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Course Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_free"
                    checked={formData.is_free}
                    onChange={(e) => setFormData({ ...formData, is_free: e.target.checked, price: e.target.checked ? "0" : formData.price })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="is_free">Make this course free</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Price (₹)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      disabled={formData.is_free}
                      required={!formData.is_free}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">
                {editingCourse ? "Update Course" : "Create Course"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {courses.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">You haven't created any courses yet.</p>
            <Button onClick={() => setDialogOpen(true)}>Create Your First Course</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {courses.map((course) => (
            <Card key={course.id} className="shadow-soft hover:shadow-hover transition-all">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{course.title}</CardTitle>
                    <CardDescription className="mt-2">{course.category}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(`/course/${course.id}`)}
                      title="View Course & Comments"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/course/${course.id}/lessons`)}>
                      <BookOpen className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(course)}>
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
                          <AlertDialogTitle>Delete Course?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete <strong>{course.title}</strong> and all its lessons. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
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
                <p className="text-sm text-muted-foreground mb-4">{course.description}</p>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex gap-2 items-center">
                    <span className="text-lg font-bold text-primary">
                      {course.is_free ? "FREE" : `₹${course.price}`}
                    </span>
                    {course.is_free && (
                      <span className="px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100">
                        Free Access
                      </span>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs ${course.status === "published" ? "bg-secondary text-secondary-foreground" : "bg-muted"
                    }`}>
                    {course.status}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  👥 {courseLearners[course.id] || 0} learner{(courseLearners[course.id] || 0) !== 1 ? 's' : ''} enrolled
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}