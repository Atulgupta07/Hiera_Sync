import { useState, useEffect, useRef } from 'react';
import { attachmentsApi } from '../../api';
import { TaskAttachmentResponse } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Paperclip, Trash2, Download } from 'lucide-react';
import { getAuthToken } from '../../api/client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export default function TaskAttachments({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<TaskAttachmentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdminOrHod = user?.role === "ADMIN" || user?.role === "HOD";

  useEffect(() => {
    fetchAttachments();
  }, [taskId]);

  const fetchAttachments = async () => {
    try {
      const data = await attachmentsApi.getForTask(taskId);
      setAttachments(data || []);
    } catch (e) {
      console.error("Failed to load attachments");
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      await attachmentsApi.upload(taskId, file);
      fetchAttachments();
    } catch (e: any) {
      alert("Upload failed: " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm("Are you sure you want to delete this attachment?")) return;
    try {
      await attachmentsApi.delete(taskId, attachmentId);
      fetchAttachments();
    } catch (e) {
      alert("Failed to delete attachment");
    }
  };

  const openFile = async (attachment: TaskAttachmentResponse) => {
    try {
      const token = getAuthToken() || localStorage.getItem('token') || localStorage.getItem('access_token');
      const fileUrl = `${API_BASE_URL}/attachments/${taskId}/${attachment.id}/download`;
      const response = await fetch(fileUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);

      const blob = await response.blob();
      const ext = attachment.file_type ? attachment.file_type.toLowerCase() : '';
      let mimeType = blob.type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        if (ext === 'pdf' || attachment.file_name.endsWith('.pdf')) {
          mimeType = 'application/pdf';
        } else if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
          mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        }
      }
      const blobUrl = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error('File preview error:', err);
      const token = getAuthToken() || localStorage.getItem('token') || localStorage.getItem('access_token');
      const queryUrl = `${API_BASE_URL}/attachments/${taskId}/${attachment.id}/download?token=${encodeURIComponent(token || '')}`;
      window.open(queryUrl, '_blank');
    }
  };


  return (
    <div className="mt-6 border-t pt-4 font-sans">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800"><Paperclip className="w-5 h-5 text-indigo-600" /> Attachments</h3>
        
        {/* Completely HIDE Upload File button for ADMIN / HOD */}
        {!isAdminOrHod && (
          <>
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={loading}
              className="text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200 transition flex items-center gap-1.5"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {loading ? 'Uploading...' : 'Upload File'}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg"
            />
          </>
        )}
      </div>

      <div className="space-y-2">
        {attachments.map(a => (
          <div key={a.id} className="flex justify-between items-center bg-slate-50 hover:bg-indigo-50/50 p-3 rounded-xl border border-slate-200 transition text-sm group">
            <div 
              onClick={() => openFile(a)}
              className="flex items-center gap-3 overflow-hidden cursor-pointer flex-1"
              title="Click to view file in new tab"
            >
              <span className="font-semibold text-indigo-900 group-hover:text-indigo-600 truncate underline underline-offset-2 decoration-indigo-300">
                {a.file_name}
              </span>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded uppercase">
                {a.file_type}
              </span>
              <span className="text-xs text-slate-400">{(a.file_size / 1024).toFixed(1)} KB</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button 
                onClick={() => openFile(a)}
                className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-lg hover:bg-white transition"
                title="View in new tab"
              >
                <Download className="w-4 h-4" />
              </button>
              {(!isAdminOrHod && a.uploaded_by === user?.name) && (
                <button onClick={() => handleDelete(a.id)} className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-white transition" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && attachments.length === 0 && <p className="text-xs text-slate-400 italic">No files attached to this task.</p>}
      </div>
    </div>
  );
}
