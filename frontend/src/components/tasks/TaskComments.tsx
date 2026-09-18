import { useState, useEffect } from 'react';
import { commentsApi } from '../../api';
import { TaskCommentResponse } from '../../types';
// import { useAuth } from '../../contexts/AuthContext';

export default function TaskComments({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<TaskCommentResponse[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchComments();
  }, [taskId]);

  const fetchComments = async () => {
    try {
      const data = await commentsApi.getForTask(taskId);
      setComments(data || []);
    } catch (e) {
      console.error("Failed to load comments");
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!newComment.trim()) return;
    try {
      const mentions = newComment.match(/@(\w+)/g)?.map(m => m.substring(1)) || [];
      await commentsApi.create(taskId, { content: newComment, mentions });
      setNewComment("");
      fetchComments();
    } catch (e) {
      alert("Failed to post comment");
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Loading comments...</div>;

  return (
    <div className="mt-6 border-t pt-4 font-sans">
      <h3 className="text-lg font-semibold text-slate-800 mb-3">💬 Comments & Updates</h3>
      <div className="space-y-3 max-h-60 overflow-y-auto mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
        {comments.map(c => (
          <div className="comment-item" key={c.id}>
            <div className="comment-avatar">
              {(c.author_name || "U").charAt(0).toUpperCase()}
            </div>
            <div className="comment-content">
              <div className="comment-header">
                <strong>{c.author_name}</strong>
                <span className="comment-role">{c.author_role || "FACULTY"}</span>
                <span className="comment-time">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <div className="comment-bubble">
                {c.content}
              </div>
            </div>
          </div>
        ))}
        {comments.length === 0 && <p className="text-xs text-slate-400 italic">No comments in audit trail yet.</p>}
      </div>
      <div className="comment-composer">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment or update..."
        />
        <button
          type="button"
          onClick={handlePost}
          disabled={!newComment.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
