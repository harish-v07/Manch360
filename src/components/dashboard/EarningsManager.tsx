import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { IndianRupee, TrendingUp, Users, BookOpen } from "lucide-react";

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
        return <div className="text-center py-8">Loading earnings...</div>;
    }

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-2xl font-semibold">Earnings</h2>
                <p className="text-muted-foreground">
                    Track your revenue and enrollment statistics
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card className="shadow-soft">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
                        <IndianRupee className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ₹{totalEarnings.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            From paid enrollments
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-soft">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Enrollments
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalEnrollments}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Across all courses
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-soft">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Average Revenue
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ₹
                            {courseEarnings.length > 0
                                ? (totalEarnings / courseEarnings.length).toFixed(2)
                                : "0.00"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Per course</p>
                    </CardContent>
                </Card>
            </div>

            {/* Course Earnings Breakdown */}
            <Card className="shadow-soft">
                <CardHeader>
                    <CardTitle>Course Earnings Breakdown</CardTitle>
                    <CardDescription>
                        Revenue and enrollment details for each course
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {courseEarnings.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>No courses yet. Create a course to start earning!</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {courseEarnings.map((course) => (
                                <div
                                    key={course.id}
                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex-1">
                                        <h3 className="font-medium">{course.title}</h3>
                                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                            <span>
                                                {course.is_free ? (
                                                    <span className="text-green-600 font-medium">
                                                        FREE
                                                    </span>
                                                ) : (
                                                    `₹${course.price.toFixed(2)}`
                                                )}
                                            </span>
                                            <span>•</span>
                                            <span>
                                                {course.enrollments} enrollment
                                                {course.enrollments !== 1 ? "s" : ""}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-bold">
                                            ₹{course.revenue.toFixed(2)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">Revenue</div>
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
