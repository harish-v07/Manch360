import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getS3ViewUrl } from "@/lib/s3-upload";
import { toast } from "sonner";
import { ArrowLeft, PlayCircle, FileText, CheckCircle2, Maximize2, Minimize2, CreditCard, GraduationCap, Lock, BookOpen, Loader2, Clock, Users, ChevronDown, ChevronUp, Music, Image as ImageIcon, User } from "lucide-react";
import { CourseComments } from "@/components/course/CourseComments";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? s + "s" : ""}`.trim();
  return `${s}s`;
}

function getLessonIcon(contentUrl: string | null) {
  if (!contentUrl) return <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
  const ext = contentUrl.split(".").pop()?.toLowerCase();
  if (["mp4", "webm", "ogg"].includes(ext || ""))
    return <PlayCircle className="h-4 w-4 text-primary flex-shrink-0" />;
  if (["mp3", "wav"].includes(ext || ""))
    return <Music className="h-4 w-4 text-purple-500 flex-shrink-0" />;
  if (["jpg", "jpeg", "png", "gif"].includes(ext || ""))
    return <ImageIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  if (ext === "pdf")
    return <FileText className="h-4 w-4 text-orange-500 flex-shrink-0" />;
  return <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
}

function isVideo(contentUrl: string | null): boolean {
  if (!contentUrl) return false;
  const ext = contentUrl.split(".").pop()?.toLowerCase();
  return ["mp4", "webm", "ogg"].includes(ext || "");
}

interface CoursePreviewInlineProps {
  courseId: string;
  onBack: () => void;
}

export default function CoursePreviewInline({ courseId, onBack }: CoursePreviewInlineProps) {
  const [course, setCourse] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [currentLesson, setCurrentLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [contentUrl, setContentUrl] = useState<string>("");
  const [creatorName, setCreatorName] = useState<string>("");
  const [showWatermark, setShowWatermark] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const contentWrapperRef = useRef<HTMLDivElement>(null);

  const isOwner = userId && course && userId === course.creator_id;
  const isUserCreator = userRole === 'creator';
  const hideEnroll = isOwner || isUserCreator;
  const canAccessContent = isEnrolled || isOwner;

  const invokeEdgeFunction = async (functionName: string, body: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { data: null, error: new Error(errorText) };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  const isCreator = userId && course && userId === course.creator_id;

  const handleEnroll = async () => {
    try {
      setEnrolling(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to enroll");
        return;
      }

      if (course?.is_free) {
        const { error } = await supabase.from("enrollments").insert({
          user_id: user.id,
          course_id: courseId,
          progress: 0,
        });

        if (error) throw error;
        toast.success("Enrolled successfully!");
        setIsEnrolled(true);
      } else {
        const orderPayload = {
          amount: course.price,
          currency: 'INR',
          description: `Enrollment for ${course.title}`,
          receipt: `rcpt_${Date.now()}_course`,
          product_id: course.id,
        };

        const { data: orderData, error: orderError } = await invokeEdgeFunction('create-razorpay-order', orderPayload);
        if (orderError || !orderData) throw new Error(orderError?.message || 'Failed to create order');

        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Manch360",
          description: `Enrollment for ${course.title}`,
          order_id: orderData.id,
          handler: async function (response: any) {
            try {
              const { data: verifyData, error: verifyError } = await invokeEdgeFunction('verify-razorpay-payment', {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });

              if (verifyError || !verifyData.success) {
                toast.error("Payment verification failed");
                return;
              }

              const { error: enrollError } = await supabase.from("enrollments").insert({
                user_id: user.id,
                course_id: courseId,
                progress: 0,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });

              if (enrollError) throw enrollError;
              
              toast.success("Payment successful! You are now enrolled.");
              setIsEnrolled(true);
            } catch (error) {
              console.error("Enrollment error:", error);
              toast.error("Enrollment failed after payment. Please contact support.");
            }
          },
          prefill: {
            email: user.email,
          },
          theme: { color: "#3399cc" },
        };

        const rzp1 = new (window as any).Razorpay(options);
        rzp1.open();
      }
    } catch (error: any) {
      console.error("Enrollment error:", error);
      toast.error(error.message || "Failed to enroll");
    } finally {
      setEnrolling(false);
    }
  };

  useEffect(() => {
    fetchCourseDetails();
  }, [courseId]);

  useEffect(() => {
    if (currentLesson && canAccessContent) {
      loadLessonContent();
    }
  }, [currentLesson, canAccessContent]);

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

      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("name, show_watermark")
        .eq("id", courseData.creator_id)
        .single();

      if (creatorProfile) {
        setCreatorName(creatorProfile.name);
        setShowWatermark(creatorProfile.show_watermark || false);
      }

      const { data: lessonsData, error: lessonsError } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", courseId)
        .order("order_index", { ascending: true });

      if (!lessonsError && lessonsData) {
        setLessons(lessonsData);
        if (lessonsData.length > 0) {
          setCurrentLesson(lessonsData[0]);
          const firstSection = lessonsData[0]?.section || "Course Content";
          setExpandedSections(new Set([firstSection]));
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (roleData) setUserRole(roleData.role);

        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("course_id", courseId)
          .eq("user_id", session.user.id)
          .maybeSingle();
        
        setIsEnrolled(!!enrollment);
      }
    } catch (error) {
      console.error("Error fetching course details:", error);
      toast.error("Failed to load course details");
    } finally {
      setLoading(false);
    }
  };

  const loadLessonContent = async () => {
    if (!currentLesson?.content_url || !canAccessContent) return;
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
    if (!currentLesson) return null;
    if (!contentUrl) return (
      <div className="flex flex-col items-center justify-center py-24 bg-zinc-900 rounded-2xl">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-zinc-400 font-medium">Loading lesson content...</p>
      </div>
    );

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

  const renderPreview = () => {
    const sections = lessons.reduce<Record<string, any[]>>((acc, lesson) => {
      const sec = lesson.section || "Course Content";
      if (!acc[sec]) acc[sec] = [];
      acc[sec].push(lesson);
      return acc;
    }, {});

    const totalDuration = lessons.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
    const videoCount = lessons.filter((l) => isVideo(l.content_url)).length;
    const sectionNames = Object.keys(sections);

    const toggleSection = (name: string) => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        next.has(name) ? next.delete(name) : next.add(name);
        return next;
      });
    };

    return (
      <div className="max-w-4xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Button variant="ghost" onClick={onBack} className="mb-8 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:text-zinc-400 rounded-xl">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 dark:bg-primary/10 px-3 py-1 rounded-full">
              {course?.category || "Course"}
            </span>
          </div>
          <h1 className="text-4xl font-black mb-4 dark:text-white tracking-tight">{course?.title}</h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-3xl">{course?.description}</p>

          <div className="flex flex-wrap gap-6 text-sm font-bold text-muted-foreground mb-8 pb-8 border-b dark:border-zinc-800">
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
            </span>
            {videoCount > 0 && (
              <span className="flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-primary" />
                {videoCount} {videoCount === 1 ? "video" : "videos"}
              </span>
            )}
            {totalDuration > 0 && (
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {formatDuration(totalDuration)}
              </span>
            )}
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Join other learners
            </span>
          </div>

          <div className="flex items-center gap-6 p-6 bg-primary/5 dark:bg-primary/10 rounded-3xl border border-primary/10 mb-12">
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-widest text-primary/60 mb-1">Lifetime Access</span>
              <span className="text-4xl font-black text-primary">
                {course?.is_free ? "FREE" : `₹${course?.price}`}
              </span>
            </div>
            <Button 
              size="lg" 
              onClick={handleEnroll} 
              disabled={enrolling || hideEnroll}
              className="ml-auto h-14 px-10 rounded-2xl font-black text-lg transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/20"
            >
              {enrolling ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : isOwner ? (
                "Course Owner"
              ) : isUserCreator ? (
                "Creator Account"
              ) : isEnrolled ? (
                "Continue Learning"
              ) : course?.is_free ? (
                "Enroll for Free"
              ) : (
                "Enroll Now"
              )}
            </Button>
          </div>

          {lessons.length > 0 ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-black dark:text-white tracking-tight">Course Curriculum</h2>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {sectionNames.length} {sectionNames.length === 1 ? "section" : "sections"}
                </p>
              </div>

              <div className="space-y-4">
                {sectionNames.map((sectionName) => {
                  const sectionLessons = sections[sectionName];
                  const isOpen = expandedSections.has(sectionName);
                  return (
                    <div key={sectionName} className="overflow-hidden bg-white dark:bg-zinc-900/40 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm">
                      <button
                        className="w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                        onClick={() => toggleSection(sectionName)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/5 dark:bg-primary/10 rounded-xl">
                            {isOpen ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
                          </div>
                          <span className="font-bold text-lg dark:text-white">{sectionName}</span>
                        </div>
                        <span className="text-xs font-black text-muted-foreground uppercase tracking-widest bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full">
                          {sectionLessons.length} {sectionLessons.length === 1 ? "Lesson" : "Lessons"}
                        </span>
                      </button>

                      <div className={cn("overflow-hidden transition-all duration-300 ease-in-out", isOpen ? "max-h-[1000px] border-t dark:border-zinc-800" : "max-h-0")}>
                        <div className="divide-y dark:divide-zinc-800">
                          {sectionLessons.map((lesson, idx) => (
                            <div key={lesson.id} className="flex items-center gap-4 p-5 hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                              <div className="w-8 h-8 flex items-center justify-center text-xs font-black text-primary/40">
                                {(idx + 1).toString().padStart(2, '0')}
                              </div>
                              <div className="flex-1">
                                <p className="font-bold text-sm dark:text-zinc-200">{lesson.title}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    {lesson.content_url?.split('.').pop()?.toUpperCase() || "Lesson"}
                                  </span>
                                </div>
                              </div>
                              <Lock className="h-4 w-4 text-muted-foreground/30" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 bg-gray-50 dark:bg-zinc-900/40 rounded-[2.5rem] border-2 border-dashed border-gray-100 dark:border-zinc-800">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-primary/20" />
              <h3 className="text-xl font-bold dark:text-white mb-2">Course content coming soon</h3>
              <p className="text-muted-foreground max-w-xs mx-auto text-sm">The creator is currently preparing the lessons for this course.</p>
            </div>
          )}
        </div>
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

  // Choose between Preview Mode and Learning Mode
  if (!canAccessContent) {
    return renderPreview();
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
        <div className="flex items-center gap-6">
          {hideEnroll ? (
            <div className="flex items-center gap-2 px-6 py-3 bg-primary/10 text-primary rounded-2xl border border-primary/20 font-black text-sm uppercase tracking-widest shadow-sm">
              <User className="h-4 w-4" />
              {isOwner ? "Course Owner" : "Creator Account"}
            </div>
          ) : isEnrolled ? (
            <div className="flex items-center gap-2 px-6 py-3 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20 font-black text-sm uppercase tracking-widest">
              <CheckCircle2 className="h-4 w-4" />
              Already Enrolled
            </div>
          ) : null}
          <div className="text-right">
            <h2 className="text-xl font-black dark:text-white tracking-tight">{course?.title}</h2>
            <p className="text-xs text-primary font-bold uppercase tracking-widest">{course?.category}</p>
          </div>
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
