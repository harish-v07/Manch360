import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Reply, Pencil } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CommentForm } from "./CommentForm";

interface CommentItemProps {
    comment: any;
    currentUserId: string;
    courseCreatorId: string;
    onCommentAdded: () => void;
    onCommentDeleted: () => void;
    depth?: number;
}

export function CommentItem({
    comment,
    currentUserId,
    courseCreatorId,
    onCommentAdded,
    onCommentDeleted,
    depth = 0,
}: CommentItemProps) {
    const [showReplyForm, setShowReplyForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const isOwnComment = comment.user_id === currentUserId;
    const isCreator = comment.user_id === courseCreatorId;
    const canDelete = isOwnComment || currentUserId === courseCreatorId;

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this comment?")) return;

        setIsDeleting(true);
        const { error } = await supabase
            .from("course_comments")
            .delete()
            .eq("id", comment.id);

        if (error) {
            toast.error("Failed to delete comment");
            console.error(error);
        } else {
            toast.success("Comment deleted");
            onCommentDeleted();
        }
        setIsDeleting(false);
    };

    const handleReplySuccess = () => {
        setShowReplyForm(false);
        onCommentAdded();
    };

    const handleEditSuccess = () => {
        setIsEditing(false);
        onCommentAdded();
    };

    return (
        <div className={`${depth > 0 ? "ml-8 mt-4" : "mt-4"}`}>
            <div className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={comment.profiles?.avatar_url} />
                    <AvatarFallback>
                        {comment.profiles?.name?.charAt(0)?.toUpperCase() || "U"}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                            {comment.profiles?.name || "Unknown User"}
                        </span>
                        {isCreator && (
                            <Badge variant="secondary" className="text-xs">
                                Creator
                            </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.created_at), {
                                addSuffix: true,
                            })}
                        </span>
                    </div>

                    {isEditing ? (
                        <div className="mt-3 mb-2">
                            <CommentForm
                                courseId={comment.course_id}
                                lessonId={comment.lesson_id}
                                commentId={comment.id}
                                initialContent={comment.content}
                                onSuccess={handleEditSuccess}
                                onCancel={() => setIsEditing(false)}
                            />
                        </div>
                    ) : (
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                            {comment.content}
                        </p>
                    )}

                    <div className="flex gap-2 mt-2">
                        {depth < 3 && !isEditing && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowReplyForm(!showReplyForm)}
                                className="h-7 text-xs"
                            >
                                <Reply className="h-3 w-3 mr-1" />
                                Reply
                            </Button>
                        )}

                        {isOwnComment && !isEditing && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsEditing(true)}
                                className="h-7 text-xs"
                            >
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                            </Button>
                        )}

                        {canDelete && !isEditing && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="h-7 text-xs text-destructive hover:text-destructive"
                            >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                            </Button>
                        )}
                    </div>

                    {showReplyForm && (
                        <div className="mt-3">
                            <CommentForm
                                courseId={comment.course_id}
                                lessonId={comment.lesson_id}
                                parentCommentId={comment.id}
                                onSuccess={handleReplySuccess}
                                onCancel={() => setShowReplyForm(false)}
                                placeholder={`Reply to ${comment.profiles?.name}...`}
                            />
                        </div>
                    )}

                    {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-2">
                            {comment.replies.map((reply: any) => (
                                <CommentItem
                                    key={reply.id}
                                    comment={reply}
                                    currentUserId={currentUserId}
                                    courseCreatorId={courseCreatorId}
                                    onCommentAdded={onCommentAdded}
                                    onCommentDeleted={onCommentDeleted}
                                    depth={depth + 1}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
