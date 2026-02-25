import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getS3ViewUrl } from "@/lib/s3-upload";
import { toast } from "sonner";
import { ArrowLeft, PlayCircle, FileText, Lock, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { CourseComments } from "@/components/course/CourseComments";

export default function CourseViewer() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [currentLesson, setCurrentLesson] = useState<any>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contentUrl, setContentUrl] = useState<string>("");
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState<string>("");
  const [showWatermark, setShowWatermark] = useState(false);

  useEffect(() => {
    checkEnrollmentAndFetchCourse();
  }, [courseId]);

  useEffect(() => {
    if (currentLesson) {
      loadLessonContent();
    }
  }, [currentLesson]);

  const checkEnrollmentAndFetchCourse = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .single();

    if (courseError || !courseData) {
      toast.error("Course not found");
      navigate("/dashboard");
      return;
    }

    setCourse(courseData);

    // Fetch creator profile for watermark
    const { data: creatorProfile } = await supabase
      .from("public_profiles")
      .select("name, show_watermark")
      .eq("id", courseData.creator_id)
      .single();

    if (creatorProfile) {
      setCreatorName(creatorProfile.name);
      setShowWatermark(creatorProfile.show_watermark);
      console.log("Watermark settings:", {
        creatorName: creatorProfile.name,
        showWatermark: creatorProfile.show_watermark
      });
    }

    const { data: enrollmentData } = await supabase
      .from("enrollments")
      .select("*")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .maybeSingle();

    const isCreator = courseData.creator_id === user.id;
    setIsEnrolled(!!enrollmentData || courseData.is_free || isCreator);
    if (enrollmentData) {
      setEnrollmentId(enrollmentData.id);
    }

    // Load lessons if enrolled, course is free, OR user is the creator
    if (enrollmentData || courseData.is_free || isCreator) {
      const { data: lessonsData, error: lessonsError } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", courseId)
        .order("order_index", { ascending: true });

      if (!lessonsError && lessonsData) {
        setLessons(lessonsData);
        if (lessonsData.length > 0) {
          setCurrentLesson(lessonsData[0]);
        }
      }

      // Fetch completed lessons
      const { data: completionsData } = await supabase
        .from("lesson_completions")
        .select("lesson_id")
        .eq("user_id", user.id)
        .eq("course_id", courseId);

      if (completionsData) {
        setCompletedLessons(new Set(completionsData.map(c => c.lesson_id)));
      }
    }

    setLoading(false);
  };

  const loadLessonContent = async () => {
    if (!currentLesson?.content_url) return;
    setContentUrl(""); // Reset while loading

    // Check if it's an absolute URL (like AWS S3) or a relative path (Supabase)
    if (currentLesson.content_url.startsWith('http')) {
      try {
        console.log("Fetching signed URL for:", currentLesson.content_url);
        const signedUrl = await getS3ViewUrl(currentLesson.content_url);
        console.log("Got signed URL:", signedUrl?.substring(0, 80) + "...");
        setContentUrl(signedUrl);
      } catch (error) {
        console.error("Error fetching S3 signed URL:", error);
        toast.error("Failed to load content. Please check your connection and try again.");
        // Do NOT fall back to raw URL — it's private and will just show AccessDenied
      }
    } else {
      const { data } = supabase.storage
        .from('course-content')
        .getPublicUrl(currentLesson.content_url);
      setContentUrl(data.publicUrl);
    }
  };

  const handleEnrollFree = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("enrollments").insert({
      user_id: user.id,
      course_id: courseId,
      progress: 0,
    });

    if (error) {
      toast.error("Error enrolling in course");
    } else {
      toast.success("Successfully enrolled!");
      checkEnrollmentAndFetchCourse();
    }
  };

  const handleMarkComplete = async () => {
    if (!currentLesson) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("lesson_completions").insert({
      user_id: user.id,
      lesson_id: currentLesson.id,
      course_id: courseId,
    });

    if (error) {
      if (error.code === '23505') {
        toast.info("Lesson already marked as complete");
      } else {
        toast.error("Error marking lesson complete");
      }
    } else {
      setCompletedLessons(prev => new Set([...prev, currentLesson.id]));
      toast.success("Lesson marked complete!");

      // Move to next lesson if available
      const currentIndex = lessons.findIndex(l => l.id === currentLesson.id);
      if (currentIndex < lessons.length - 1) {
        setCurrentLesson(lessons[currentIndex + 1]);
      }
    }
  };

  const renderContent = () => {
    if (!currentLesson || !contentUrl) return null;

    const fileExt = currentLesson.content_url.split('.').pop()?.toLowerCase();

    if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
      return (
        <video controls controlsList="nodownload" className="w-full rounded-lg" key={contentUrl}>
          <source src={contentUrl} type={`video/${fileExt}`} />
          Your browser does not support video playback.
        </video>
      );
    }

    if (fileExt === 'pdf') {
      return (
        <div className="w-full rounded-lg overflow-hidden border bg-muted">
          <iframe
            src={contentUrl}
            className="w-full h-[700px]"
            title={currentLesson.title}
          />
        </div>
      );
    }

    if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExt)) {
      return (
        <div className="w-full rounded-lg border p-4 bg-muted">
          <img
            src={contentUrl}
            alt={currentLesson.title}
            className="w-full rounded-lg"
            onContextMenu={(e) => e.preventDefault()}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          />
        </div>
      );
    }

    if (['mp3', 'wav'].includes(fileExt)) {
      return (
        <audio controls controlsList="nodownload" className="w-full">
          <source src={contentUrl} type={`audio/${fileExt}`} />
          Your browser does not support audio playback.
        </audio>
      );
    }

    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Content not available for preview.</p>
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading course...</div>;
  }

  if (!isEnrolled && !course?.is_free) {
    return (
      <>
        <Navbar />
        <div className="container mx-auto py-12 px-4 text-center">
          <Lock className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-4">Course Access Required</h2>
          <p className="text-muted-foreground mb-6">
            You need to enroll in this course to access the content.
          </p>
          <Button onClick={() => navigate("/explore")}>Browse Courses</Button>
        </div>
      </>
    );
  }

  if (course?.is_free && !isEnrolled) {
    return (
      <>
        <Navbar />
        <div className="container mx-auto py-12 px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">{course.title}</h2>
          <p className="text-muted-foreground mb-6">{course.description}</p>
          <div className="mb-6">
            <span className="text-3xl font-bold text-green-600">FREE</span>
          </div>
          <Button onClick={handleEnrollFree} size="lg">
            Enroll Now - It's Free!
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>{currentLesson?.title || course?.title}</CardTitle>
                <CardDescription>{course?.category}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative overflow-hidden">
                  {renderContent()}
                  {showWatermark && creatorName && (
                    <div className="absolute bottom-3 right-3 pointer-events-none select-none z-10">
                      <span
                        style={{
                          fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
                          fontSize: "11px",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          color: "rgba(255,255,255,0.55)",
                          background: "rgba(0,0,0,0.32)",
                          backdropFilter: "blur(4px)",
                          padding: "3px 9px",
                          borderRadius: "4px",
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                          lineHeight: 1.4,
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        {creatorName}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={handleMarkComplete}
                    disabled={completedLessons.has(currentLesson?.id)}
                    className="gap-2"
                  >
                    {completedLessons.has(currentLesson?.id) ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Completed
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Mark as Complete
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Course Content</CardTitle>
                <CardDescription>{lessons.length} lessons</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {lessons.map((lesson, index) => (
                    <button
                      key={lesson.id}
                      onClick={() => setCurrentLesson(lesson)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${currentLesson?.id === lesson.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        {completedLessons.has(lesson.id) ? (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
                        ) : (
                          <PlayCircle className="h-4 w-4 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {index + 1}. {lesson.title}
                          </p>
                          <p className="text-xs opacity-80">
                            {lesson.content_url?.split('.').pop()?.toUpperCase()}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Comment Section - Only visible to enrolled users */}
        {currentLesson && (
          <CourseComments
            courseId={courseId!}
            lessonId={currentLesson.id}
            courseCreatorId={course.creator_id}
          />
        )}
      </div>
    </>
  );
}
