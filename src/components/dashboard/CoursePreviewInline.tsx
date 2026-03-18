import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getS3ViewUrl } from "@/lib/s3-upload";
import { toast } from "sonner";
import { ArrowLeft, PlayCircle, FileText, CheckCircle2, Maximize2, Minimize2 } from "lucide-react";
import { CourseComments } from "@/components/course/CourseComments";

interface CoursePreviewInlineProps {
  courseId: string;
  onBack: () => void;
}

export default function CoursePreviewInline({ courseId, onBack }: CoursePreviewInlineProps) {
  const [course, setCourse] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [currentLesson, setCurrentLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [contentUrl, setContentUrl] = useState<string>("");
  const [creatorName, setCreatorName] = useState<string>("");
  const [showWatermark, setShowWatermark] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const contentWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCourseDetails();
  }, [courseId]);

  useEffect(() => {
    if (currentLesson) {
      loadLessonContent();
    }
  }, [currentLesson]);

  useEffect(() => {
    const handleFsChange = () =>
      setIsFullscreen(document.fullscreenElement === contentWrapperRef.current);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      contentWrapperRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const fetchCourseDetails = async () => {
    try {
      const { data: courseData, error: courseError } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .single();

      if (courseError || !courseData) {
        toast.error("Course not found");
        onBack();
        return;
      }

      setCourse(courseData);

      // Fetch creator profile
      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("name, show_watermark")
        .eq("id", courseData.creator_id)
        .single();

      if (creatorProfile) {
        setCreatorName(creatorProfile.name);
        setShowWatermark(creatorProfile.show_watermark || false);
      }

      // Load lessons
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
    } catch (error) {
      console.error("Error fetching course details:", error);
      toast.error("Failed to load course details");
    } finally {
      setLoading(false);
    }
  };

  const loadLessonContent = async () => {
    if (!currentLesson?.content_url) return;
    setContentUrl("");

    if (currentLesson.content_url.startsWith('http')) {
      try {
        const signedUrl = await getS3ViewUrl(currentLesson.content_url);
        setContentUrl(signedUrl);
      } catch (error) {
        console.error("Error fetching S3 signed URL:", error);
        toast.error("Failed to load content.");
      }
    } else {
      const { data } = supabase.storage
        .from('course-content')
        .getPublicUrl(currentLesson.content_url);
      setContentUrl(data.publicUrl);
    }
  };

  const renderContent = () => {
    if (!currentLesson || !contentUrl) return null;
    const fileExt = currentLesson.content_url.split('.').pop()?.toLowerCase();

    if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
      return (
        <video
          controls
          controlsList="nodownload nofullscreen"
          className="w-full rounded-xl"
          style={isFullscreen ? { width: '100%', height: '100%', objectFit: 'contain' } : {}}
          key={contentUrl}
        >
          <source src={contentUrl} type={`video/${fileExt}`} />
          Your browser does not support video playback.
        </video>
      );
    }

    if (fileExt === 'pdf') {
      return (
        <div className="w-full rounded-xl overflow-hidden border dark:border-zinc-800 bg-muted dark:bg-zinc-900">
          <iframe
            src={`${contentUrl}#toolbar=0&navpanes=0`}
            className="w-full h-[600px]"
            title={currentLesson.title}
          />
        </div>
      );
    }

    if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExt)) {
      return (
        <div className="w-full rounded-xl border dark:border-zinc-800 p-4 bg-muted dark:bg-zinc-900">
          <img
            src={contentUrl}
            alt={currentLesson.title}
            className="w-full rounded-xl"
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      );
    }

    return (
      <div className="text-center py-20 bg-muted dark:bg-zinc-900 rounded-xl">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground font-medium">Content preview not available for this file type.</p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-8">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white rounded-xl"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Courses
        </Button>
        <div className="text-right">
          <h2 className="text-xl font-black dark:text-white tracking-tight">{course?.title}</h2>
          <p className="text-xs text-primary font-bold uppercase tracking-widest">{course?.category}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-soft dark:bg-zinc-900/40 backdrop-blur-sm overflow-hidden rounded-3xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold dark:text-white">
                {currentLesson?.title || "Course Overview"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                ref={contentWrapperRef}
                className="relative overflow-hidden rounded-2xl bg-black/5 dark:bg-black/20"
                style={isFullscreen ? { background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' } : {}}
              >
                {renderContent()}
                
                {showWatermark && creatorName && (
                  <div className="absolute bottom-4 right-4 pointer-events-none select-none z-10">
                    <span className="text-[10px] font-bold text-white/50 bg-black/30 backdrop-blur-md px-3 py-1 rounded-md border border-white/10 uppercase tracking-widest">
                      {creatorName}
                    </span>
                  </div>
                )}

                <button
                  onClick={toggleFullscreen}
                  className="absolute top-4 right-4 z-10 p-2.5 rounded-xl text-white/70 hover:text-white hover:bg-black/50 transition-all backdrop-blur-sm"
                >
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </div>
            </CardContent>
          </Card>

          {currentLesson && (
            <div className="bg-white dark:bg-zinc-900/40 rounded-3xl p-6 border border-gray-100 dark:border-zinc-800 shadow-sm">
              <CourseComments
                courseId={courseId}
                lessonId={currentLesson.id}
                courseCreatorId={course.creator_id}
              />
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-none shadow-soft dark:bg-zinc-900/40 backdrop-blur-sm rounded-3xl">
            <CardHeader>
              <CardTitle className="text-lg font-bold dark:text-white">Course Index</CardTitle>
              <CardDescription className="text-xs font-medium dark:text-zinc-500">
                {lessons.length} lessons available
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {lessons.map((lesson, index) => (
                  <button
                    key={lesson.id}
                    onClick={() => setCurrentLesson(lesson)}
                    className={`w-full text-left p-4 rounded-2xl transition-all duration-300 border flex items-center gap-4 ${
                      currentLesson?.id === lesson.id
                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                        : 'bg-white dark:bg-zinc-900/40 border-gray-100 dark:border-zinc-800 hover:border-primary/50 dark:text-zinc-300'
                    }`}
                  >
                    <div className={`p-2 rounded-xl ${currentLesson?.id === lesson.id ? 'bg-white/20' : 'bg-primary/5 dark:bg-primary/10'}`}>
                      <PlayCircle className={`h-4 w-4 ${currentLesson?.id === lesson.id ? 'text-white' : 'text-primary'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">
                        {index + 1}. {lesson.title}
                      </p>
                      <p className={`text-[10px] uppercase tracking-widest font-black opacity-60 mt-0.5`}>
                        {lesson.content_url?.split('.').pop()?.toUpperCase()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
