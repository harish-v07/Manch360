import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { IndianRupee, TrendingUp, Users, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface CourseEarnings {
    id: string;
    title: string;
    price: number;
    is_free: boolean;
    enrollments: number;
    revenue: number;
}

export default function EarningsManager() {
    const [courseEarnings, setCourseEarnings] = useState<CourseEarnings[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalEarnings, setTotalEarnings] = useState(0);
    const [totalEnrollments, setTotalEnrollments] = useState(0);

    useEffect(() => {
        fetchEarnings();
    }, []);

    const fetchEarnings = async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch all courses by creator
        const { data: courses, error: coursesError } = await supabase
            .from("courses")
            .select("id, title, price, is_free")
            .eq("creator_id", user.id);

        if (coursesError) {
            toast.error("Error fetching courses");
            console.error(coursesError);
            setLoading(false);
            return;
        }

        if (!courses || courses.length === 0) {
            setLoading(false);
            return;
        }

        // Fetch enrollments for all courses
        const courseIds = courses.map((c) => c.id);
        const { data: enrollments, error: enrollmentsError } = await supabase
            .from("enrollments")
            .select("course_id")
            .in("course_id", courseIds);

        if (enrollmentsError) {
            toast.error("Error fetching enrollments");
            console.error(enrollmentsError);
            setLoading(false);
            return;
        }

        // Count enrollments per course
        const enrollmentCounts: Record<string, number> = {};
        enrollments?.forEach((enrollment) => {
            enrollmentCounts[enrollment.course_id] =
                (enrollmentCounts[enrollment.course_id] || 0) + 1;
        });

        // Calculate earnings per course
        const earningsData: CourseEarnings[] = courses.map((course) => {
            const enrollmentCount = enrollmentCounts[course.id] || 0;
            const revenue = course.is_free ? 0 : course.price * enrollmentCount;

            return {
                id: course.id,
                title: course.title,
                price: course.price,
                is_free: course.is_free,
                enrollments: enrollmentCount,
                revenue: revenue,
            };
        });

        // Calculate totals
        const total = earningsData.reduce((sum, course) => sum + course.revenue, 0);
        const totalEnroll = earningsData.reduce(
            (sum, course) => sum + course.enrollments,
            0
        );

        setCourseEarnings(earningsData);
        setTotalEarnings(total);
        setTotalEnrollments(totalEnroll);
        setLoading(false);
    };

    if (loading) {
        return <div className="text-center py-6 dark:text-zinc-500 text-sm">Loading earnings...</div>;
    }

    return (
        <div>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5 transition-all animate-in fade-in slide-in-from-bottom-2">
                <Card className="border-none bg-white dark:bg-zinc-900 shadow-sm rounded-2xl overflow-hidden p-1">
                    <div className="bg-indigo-50/50 dark:bg-zinc-900/40 p-5 rounded-xl h-full flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-xl shadow-sm">
                                <IndianRupee className="h-4 w-4 dark:text-indigo-400" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 bg-white/50 dark:bg-zinc-800/50 px-2 py-0.5 rounded-full">TOTAL</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-2">TOTAL EARNINGS</p>
                            <p className="text-4xl font-black dark:text-white">₹{totalEarnings.toLocaleString()}</p>
                        </div>
                    </div>
                </Card>

                <Card className="border-none bg-white dark:bg-zinc-900 shadow-sm rounded-2xl overflow-hidden p-1">
                    <div className="bg-emerald-50/50 dark:bg-zinc-900/40 p-5 rounded-xl h-full flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-xl shadow-sm">
                                <Users className="h-4 w-4 dark:text-emerald-400" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-white/50 dark:bg-zinc-800/50 px-2 py-0.5 rounded-full">ENROLLED</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-2">LEARNERS</p>
                            <p className="text-4xl font-black dark:text-white">{totalEnrollments}</p>
                        </div>
                    </div>
                </Card>

                <Card className="border-none bg-white dark:bg-zinc-900 shadow-sm rounded-2xl overflow-hidden p-1">
                    <div className="bg-violet-50/50 dark:bg-zinc-900/40 p-5 rounded-xl h-full flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-xl shadow-sm">
                                <TrendingUp className="h-4 w-4 dark:text-violet-400" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-violet-400 bg-white/50 dark:bg-zinc-800/50 px-2 py-0.5 rounded-full">AVG</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-2">AVERAGE/COURSE</p>
                            <p className="text-4xl font-black dark:text-white">
                                ₹{courseEarnings.length > 0 ? (totalEarnings / courseEarnings.length).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) : "0"}
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Course Earnings Breakdown */}
            <Card className="shadow-soft dark:bg-zinc-900/40 dark:border-zinc-800 rounded-2xl">
                <CardHeader className="p-5">
                    <CardTitle className="text-lg font-black dark:text-white">Earnings Breakdown</CardTitle>
                    <CardDescription className="text-xs dark:text-zinc-500">Revenue and enrollment details per course</CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                    {courseEarnings.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground bg-gray-50/50 dark:bg-zinc-900/20 rounded-xl">
                            <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            <p className="text-xs font-medium dark:text-zinc-600 uppercase tracking-widest">No transaction data available</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {courseEarnings.map((course) => (
                                <div
                                    key={course.id}
                                    className="flex items-center justify-between p-4 rounded-xl dark:bg-zinc-900/50 border border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all group"
                                >
                                    <div className="flex-1">
                                        <h3 className="text-sm font-black dark:text-zinc-200">{course.title}</h3>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <span className="text-xs font-bold text-gray-500 dark:text-primary">
                                                {course.is_free ? "FREE" : `₹${course.price}`}
                                            </span>
                                            <span className="text-gray-300 dark:text-zinc-800">•</span>
                                            <span className="text-[10px] font-black text-gray-400 dark:text-zinc-600 uppercase tracking-widest">
                                                {course.enrollments} {course.enrollments === 1 ? 'LEARNER' : 'LEARNERS'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-black dark:text-white group-hover:scale-105 transition-transform">
                                            ₹{course.revenue.toLocaleString()}
                                        </div>
                                        <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Total Revenue</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
