import React, { useState, useEffect } from 'react';
import { ReportResponse, ReportCreate, TaskAttachmentResponse } from '../../types';
import { reportsApi } from '../../api/reports';
import { CheckCircle2, XCircle, Clock, Save, FileText, File } from 'lucide-react';

export default function TaskReports({ taskId, role }: { taskId: string, role: string }) {
  const [reports, setReports] = useState<ReportResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newReport, setNewReport] = useState<ReportCreate>({ title: '', description: '' });
  const [updating, setUpdating] = useState(false);

  const isHod = role === 'HOD' || role === 'ADMIN';

  useEffect(() => {
    fetchReports();
  }, [taskId]);

  const fetchReports = async () => {
    try {
      const data = await reportsApi.getTaskReports(taskId);
      setReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const submitReport = async () => {
    if (!newReport.title || !newReport.description) return alert("Title and Description are required");
    setUpdating(true);
    try {
      await reportsApi.createTaskReport(taskId, newReport);
      setShowForm(false);
      setNewReport({ title: '', description: '' });
      fetchReports();
    } catch (err) {
      alert("Failed to submit report");
    } finally {
      setUpdating(false);
    }
  };

  const reviewReport = async (reportId: string, status: string) => {
    const notes = prompt("Enter review notes (optional):");
    setUpdating(true);
    try {
      await reportsApi.updateTaskReport(reportId, { status, review_notes: notes || undefined });
      fetchReports();
    } catch (err) {
      alert("Failed to review report");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500">Loading reports...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-500" /> Task Reports
        </h3>
        {!isHod && (
          <button 
            onClick={() => setShowForm(!showForm)}
            className="text-xs bg-indigo-50 text-indigo-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition"
          >
            {showForm ? "Cancel" : "Submit New Report"}
          </button>
        )}
      </div>

      {showForm && !isHod && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <input 
            type="text" 
            placeholder="Report Title..." 
            value={newReport.title}
            onChange={e => setNewReport({...newReport, title: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <textarea 
            placeholder="Detailed description of work completed..."
            value={newReport.description}
            onChange={e => setNewReport({...newReport, description: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm h-24"
          />
          <div className="flex justify-end">
            <button 
              onClick={submitReport}
              disabled={updating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Submit Report
            </button>
          </div>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="text-sm text-slate-500 italic bg-slate-50 p-4 rounded-xl border border-slate-100">
          No reports submitted yet.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{report.title}</h4>
                  <p className="text-xs text-slate-500">By {report.faculty_name} • {new Date(report.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                  report.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                  report.status === 'REJECTED' || report.status === 'RECHECK' ? 'bg-rose-100 text-rose-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {report.status}
                </span>
              </div>
              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">{report.description}</p>
              
              {report.review_notes && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100 text-sm text-amber-900">
                  <strong className="block mb-1 text-xs uppercase tracking-wider">Reviewer Notes:</strong>
                  {report.review_notes}
                </div>
              )}

              {isHod && report.status === 'SUBMITTED' && (
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                  <button onClick={() => reviewReport(report.id, 'APPROVED')} disabled={updating} className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition">
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                  <button onClick={() => reviewReport(report.id, 'RECHECK')} disabled={updating} className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition">
                    <Clock className="w-4 h-4" /> Request Re-check
                  </button>
                  <button onClick={() => reviewReport(report.id, 'REJECTED')} disabled={updating} className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition">
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
