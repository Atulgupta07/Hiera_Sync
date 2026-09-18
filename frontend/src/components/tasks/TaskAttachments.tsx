import { useState, useEffect, useRef } from 'react';
import { attachmentsApi } from '../../api';
import { TaskAttachmentResponse } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Paperclip } from 'lucide-react';
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
    } catch (e: any) {
      alert("Failed to delete attachment: " + (e?.response?.data?.detail || e.message || "Unknown error"));
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

  const hodReferences = attachments.filter(a => a.attachment_type === 'HOD_REFERENCE' || a.uploaded_by_role === 'HOD' || a.uploaded_by_role === 'ADMIN');
  const taskAttachments = attachments.filter(a => a.attachment_type === 'TASK_ATTACHMENT' || (a.attachment_type !== 'HOD_REFERENCE' && a.uploaded_by_role !== 'HOD' && a.uploaded_by_role !== 'ADMIN'));

  return (
    <div className="mt-6 border-t pt-4 font-sans space-y-8">
      {/* HOD Reference Documents Section */}
      <div>
        <div className="attachment-section-header">
          <div>
            <h3>📚 HOD Reference Documents</h3>
            <p>Documents provided by HOD for task guidance</p>
          </div>
          {isAdminOrHod && (
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={loading}
              className="text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200 transition flex items-center gap-1.5"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {loading ? 'Uploading...' : 'Add Reference Document'}
            </button>
          )}
        </div>
        <div className="attachment-list">
          {hodReferences.length > 0 ? (
            hodReferences.map((attachment) => (
              <div className="attachment-file-card" key={attachment.id}>
                <div className="file-icon">📄</div>
                <div className="file-details">
                  <strong>{attachment.file_name}</strong>
                  <span>{(attachment.file_size / 1024).toFixed(1)} KB • {attachment.uploaded_by_role || "HOD"}</span>
                </div>
                <div className="file-actions">
                  <button type="button" onClick={() => openFile(attachment)}>View</button>
                  <button type="button" onClick={() => openFile(attachment)}>Download</button>
                  {(isAdminOrHod && attachment.uploaded_by === user?.name) && (
                    <button type="button" onClick={() => handleDelete(attachment.id)}>Delete</button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-file-state">
              <div className="empty-file-icon">📚</div>
              <strong>No reference documents</strong>
              <span>HOD has not provided any reference documents yet.</span>
            </div>
          )}
        </div>
      </div>

      {/* Faculty Task Attachments Section */}
      <div>
        <div className="attachment-section-header" style={{marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #e7eaf1"}}>
          <div>
            <h3>📎 Task Attachments</h3>
            <p>Files related to this task</p>
          </div>
          
          {!isAdminOrHod && (
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={loading}
              className="text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200 transition flex items-center gap-1.5"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {loading ? 'Uploading...' : 'Upload File'}
            </button>
          )}
        </div>

        <div className="attachment-list">
          {taskAttachments.length > 0 ? (
            taskAttachments.map((attachment) => (
              <div className="attachment-file-card" key={attachment.id}>
                <div className="file-icon">📄</div>
                <div className="file-details">
                  <strong>{attachment.file_name}</strong>
                  <span>{(attachment.file_size / 1024).toFixed(1)} KB • {attachment.uploaded_by_role || "User"}</span>
                </div>
                <div className="file-actions">
                  <button type="button" onClick={() => openFile(attachment)}>View</button>
                  <button type="button" onClick={() => openFile(attachment)}>Download</button>
                  {((!isAdminOrHod && attachment.uploaded_by === user?.name) || isAdminOrHod) && (
                    <button type="button" onClick={() => handleDelete(attachment.id)}>Delete</button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-file-state">
              <div className="empty-file-icon">📎</div>
              <strong>No task attachments</strong>
              <span>No files have been attached to this task yet.</span>
            </div>
          )}
        </div>
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg"
      />
    </div>
  );
}
