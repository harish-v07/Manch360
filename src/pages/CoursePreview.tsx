import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    ChevronDown,
    ChevronUp,
    PlayCircle,
    FileText,
    Music,
    Image,
    ArrowLeft,
    Clock,
    BookOpen,
    Users,
    Lock,
} from "lucide-react";

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
        return <Image className="h-4 w-4 text-blue-500 flex-shrink-0" />;
    if (ext === "pdf")
        return <FileText className="h-4 w-4 text-orange-500 flex-shrink-0" />;
    return <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
}

function isVideo(contentUrl: string | null): boolean {
    if (!contentUrl) return false;
    const ext = contentUrl.split(".").pop()?.toLowerCase();
    return ["mp4", "webm", "ogg"].includes(ext || "");
}

export default function CoursePreview() {
    const { courseId } = useParams();
    const navigate = useNavigate();

    const [course, setCourse] = useState<any>(null);
    const [lessons, setLessons] = useState<any[]>([]);
    const [enrollmentCount, setEnrollmentCount] = useState(0);
    const [isEnrolled, setIsEnrolled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [enrolling, setEnrolling] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchData();
    }, [courseId]);

    const fetchData = async () => {
        // Fetch course
        const { data: courseData, error: courseError } = await supabase
            .from("courses")
            .select("*, profiles(name, avatar_url)")
            .eq("id", courseId)
            .single();

        if (courseError || !courseData) {
            toast.error("Course not found");
            navigate(-1);
            return;
        }
        setCourse(courseData);

        // Fetch lessons (titles only — no content_url needed for preview)
        const { data: lessonsData } = await supabase
            .from("lessons")
            .select("id, title, section, duration_seconds, content_url, order_index")
            .eq("course_id", courseId)
            .order("order_index", { ascending: true });

        if (lessonsData) {
            setLessons(lessonsData);
            // Auto-expand first section
            const firstSection = lessonsData[0]?.section || "Course Content";
            setExpandedSections(new Set([firstSection]));
        }

        // Enrollment count
        const { count } = await supabase
            .from("enrollments")
            .select("*", { count: "exact", head: true })
            .eq("course_id", courseId);
        setEnrollmentCount(count || 0);

        // Check if current user is enrolled
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: enrollment } = await supabase
                .from("enrollments")
                .select("id")
                .eq("course_id", courseId)
                .eq("user_id", user.id)
                .maybeSingle();
            setIsEnrolled(!!enrollment);
        }

        setLoading(false);
    };

    const handleEnroll = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            navigate("/auth");
            return;
        }
        if (isEnrolled) {
            navigate(`/course/${courseId}`);
            return;
        }
        if (course?.is_free) {
            setEnrolling(true);
            const { error } = await supabase.from("enrollments").insert({
                user_id: user.id,
                course_id: courseId,
                progress: 0,
            });
            if (error) {
                toast.error("Error enrolling");
            } else {
                toast.success("Enrolled! Starting course…");
                navigate(`/course/${courseId}`);
            }
            setEnrolling(false);
        } else {
            // For paid courses, navigate to storefront creator page
            navigate(`/creator/${course.creator_id}`);
        }
    };

    // Group lessons by section
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

    const expandAll = () => setExpandedSections(new Set(sectionNames));
    const anyCollapsed = sectionNames.some((s) => !expandedSections.has(s));

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar />
                <div className="container mx-auto px-4 pt-32 text-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container mx-auto px-4 pt-28 pb-20 max-w-4xl">
                <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>

                {/* Header */}
                <div className="mb-8">
                    <Badge variant="secondary" className="mb-3">
                        {course.category || "Course"}
                    </Badge>
                    <h1 className="text-3xl font-bold mb-3">{course.title}</h1>
                    <p className="text-muted-foreground mb-4 leading-relaxed">{course.description}</p>

                    {/* Creator */}
                    {course.profiles && (
                        <div className="flex items-center gap-2 mb-4">
                            {course.profiles.avatar_url && (
                                <img
                                    src={course.profiles.avatar_url}
                                    alt={course.profiles.name}
                                    className="w-7 h-7 rounded-full"
                                />
                            )}
                            <span className="text-sm text-muted-foreground">
                                by <span className="font-medium text-foreground">{course.profiles.name}</span>
                            </span>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
                        <span className="flex items-center gap-1.5">
                            <BookOpen className="h-4 w-4" />
                            {lessons.length} lesson{lessons.length !== 1 ? "s" : ""}
                        </span>
                        {videoCount > 0 && (
                            <span className="flex items-center gap-1.5">
                                <PlayCircle className="h-4 w-4" />
                                {videoCount} video{videoCount !== 1 ? "s" : ""}
                            </span>
                        )}
                        {totalDuration > 0 && (
                            <span className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4" />
                                {formatDuration(totalDuration)} total
                            </span>
                        )}
                    </div>

                    {/* Price + CTA */}
                    <div className="flex items-center gap-4">
                        <span className="text-3xl font-bold text-primary">
                            {course.is_free ? "FREE" : `₹${course.price}`}
                        </span>
                        <Button size="lg" onClick={handleEnroll} disabled={enrolling}>
                            {enrolling
                                ? "Enrolling…"
                                : isEnrolled
                                    ? "View Course"
                                    : course.is_free
                                        ? "Enroll Now — It's Free!"
                                        : "Enroll Now"}
                        </Button>
                    </div>
                </div>

                {/* Course Content Accordion */}
                {lessons.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xl font-bold">Course content</h2>
                            {sectionNames.length > 1 && (
                                <button
                                    className="text-sm text-primary font-semibold hover:underline"
                                    onClick={anyCollapsed ? expandAll : () => setExpandedSections(new Set())}
                                >
                                    {anyCollapsed ? "Expand all sections" : "Collapse all"}
                                </button>
                            )}
                        </div>

                        <p className="text-sm text-muted-foreground mb-4">
                            {sectionNames.length} section{sectionNames.length !== 1 ? "s" : ""} •{" "}
                            {lessons.length} lecture{lessons.length !== 1 ? "s" : ""}
                            {totalDuration > 0 && ` • ${formatDuration(totalDuration)} total length`}
                        </p>

                        <div className="border rounded-lg overflow-hidden divide-y">
                            {sectionNames.map((sectionName) => {
                                const sectionLessons = sections[sectionName];
                                const isOpen = expandedSections.has(sectionName);
                                const sectionDuration = sectionLessons.reduce(
                                    (s, l) => s + (l.duration_seconds || 0),
                                    0
                                );
                                return (
                                    <div key={sectionName}>
                                        {/* Section header */}
                                        <button
                                            className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-left"
                                            onClick={() => toggleSection(sectionName)}
                                        >
                                            <div className="flex items-center gap-2">
                                                {isOpen ? (
                                                    <ChevronUp className="h-4 w-4 flex-shrink-0" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                                                )}
                                                <span className="font-semibold">{sectionName}</span>
                                            </div>
                                            <span className="text-sm text-muted-foreground whitespace-nowrap ml-4">
                                                {sectionLessons.length} lecture
                                                {sectionLessons.length !== 1 ? "s" : ""}
                                                {sectionDuration > 0 && ` • ${formatDuration(sectionDuration)}`}
                                            </span>
                                        </button>

                                        {/* Lesson list */}
                                        {isOpen && (
                                            <div className="divide-y">
                                                {sectionLessons.map((lesson) => (
                                                    <div
                                                        key={lesson.id}
                                                        className="flex items-center gap-3 px-6 py-3 bg-background hover:bg-muted/20 transition-colors"
                                                    >
                                                        {getLessonIcon(lesson.content_url)}
                                                        <span className="flex-1 text-sm">{lesson.title}</span>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {lesson.duration_seconds ? (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {formatDuration(lesson.duration_seconds)}
                                                                </span>
                                                            ) : lesson.content_url ? null : (
                                                                <Lock className="h-3 w-3 text-muted-foreground" />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {lessons.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border rounded-lg">
                        <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>Course content coming soon</p>
                    </div>
                )}
            </div>
        </div>
    );
}
