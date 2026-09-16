import { useState, useEffect } from 'react';
import { commentsApi } from '../../api';
import { TaskCommentResponse } from '../../types';
// import { useAuth } from '../../contexts/AuthContext';

export default function TaskComments({ taskId, readOnly = false }: { taskId: string; readOnly?: boolean }) {
  // const { user } = useAuth();
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
      // Basic mention detection: grab anything with @
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
      <h3 className="text-lg font-semibold text-slate-800 mb-3">Audit Trail & Comments</h3>
      <div className="space-y-3 max-h-60 overflow-y-auto mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
        {comments.map(c => (
          <div key={c.id} className="bg-white p-3 rounded-lg shadow-xs border border-slate-100">
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold text-xs text-indigo-700">{c.author_name}</span>
              <span className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{c.content}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="text-xs text-slate-400 italic">No comments in audit trail yet.</p>}
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <input 
            type="text" 
            value={newComment} 
            onChange={e => setNewComment(e.target.value)} 
            placeholder="Add a comment... (use @name to mention)" 
            className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
          <button onClick={handlePost} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-700 transition">
            Post
          </button>
        </div>
      )}
    </div>
  );
}
