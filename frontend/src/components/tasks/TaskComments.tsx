import { useState, useEffect } from 'react';
import { commentsApi } from '../../api';
import { TaskCommentResponse } from '../../types';
// import { useAuth } from '../../contexts/AuthContext';

export default function TaskComments({ taskId }: { taskId: string }) {
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
      setComments(data);
    } catch (e) {
      console.error("Failed to load comments");
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
    <div className="mt-6 border-t pt-4">
      <h3 className="text-lg font-semibold mb-4">Comments</h3>
      <div className="space-y-4 max-h-60 overflow-y-auto mb-4 p-2 bg-gray-50 rounded">
        {comments.map(c => (
          <div key={c.id} className="bg-white p-3 rounded shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-sm text-indigo-700">{c.author_name}</span>
              <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleString()}</span>
            </div>
            <p className="text-sm text-gray-700">{c.content}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="text-sm text-gray-500">No comments yet.</p>}
      </div>
      <div className="flex gap-2">
        <input 
          type="text" 
          value={newComment} 
          onChange={e => setNewComment(e.target.value)} 
          placeholder="Add a comment... (use @name to mention)" 
          className="flex-1 border rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button onClick={handlePost} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">
          Post
        </button>
      </div>
    </div>
  );
}
