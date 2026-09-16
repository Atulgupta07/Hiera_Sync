import { useState } from 'react';
import { TaskResponse, Subtask, EmployeeResponse } from '../../types';
import { tasksApi } from '../../api';
import TaskComments from './TaskComments';
import TaskAttachments from './TaskAttachments';
import { CheckSquare, Square, X, AlertTriangle, Clock, Save, FileText, User as UserIcon, CheckCircle2 } from 'lucide-react';

interface TaskDetailsModalProps {
  task: TaskResponse;
  role: string;
  onClose: () => void;
  onUpdate: () => void;
  facultyList?: EmployeeResponse[]; // passed if HOD
}

export default function TaskDetailsModal({ task, role, onClose, onUpdate, facultyList = [] }: TaskDetailsModalProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks || []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [updating, setUpdating] = useState(false);
  const [simulatedRisk, setSimulatedRisk] = useState<number | null>(null);
  const [adminRemarks, setAdminRemarks] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const isHod = role === "HOD" || role === "ADMIN";

  const toggleSubtask = async (id: string) => {
    // Teacher can only toggle if not completed/awaiting approval
    if (!isHod && (task.status === "Completed" || task.status === "COMPLETED" || task.status === "Awaiting Approval")) return;
    
    const updated = subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s);
    setSubtasks(updated);
    
    // Automatically save subtasks
    setUpdating(true);
    try {
      await tasksApi.update(task.id, { subtasks: updated });
      onUpdate();
    } catch (err) {
      alert("Failed to update checklist.");
      // revert
      setSubtasks(subtasks);
    } finally {
      setUpdating(false);
    }
  };

  const addSubtask = async () => {
    if (!newSubtaskTitle.trim() || !isHod) return;
    const newSt: Subtask = { id: Date.now().toString(), title: newSubtaskTitle, completed: false };
    const updated = [...subtasks, newSt];
    setSubtasks(updated);
    setNewSubtaskTitle("");
    
    setUpdating(true);
    try {
      await tasksApi.update(task.id, { subtasks: updated });
      onUpdate();
    } catch (err) {
      alert("Failed to add subtask.");
    } finally {
      setUpdating(false);
    }
  };

  const removeSubtask = async (id: string) => {
    if (!isHod) return;
    const updated = subtasks.filter(s => s.id !== id);
    setSubtasks(updated);
    setUpdating(true);
    try {
      await tasksApi.update(task.id, { subtasks: updated });
      onUpdate();
    } catch (err) {
      alert("Failed to remove subtask.");
    } finally {
      setUpdating(false);
    }
  };

  const submitForApproval = async () => {
    setUpdating(true);
    try {
      await tasksApi.update(task.id, { progress: "100%", status: "Awaiting Approval" });
      onUpdate();
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        onClose();
      }, 2500);
    } catch (err) {
      alert("Failed to submit task.");
    } finally {
      setUpdating(false);
    }
  };

  const handleReviewDecision = async (decision: 'APPROVE' | 'RECHECK' | 'REJECT') => {
    if (decision === 'RECHECK' && !adminRemarks.trim()) {
      alert("Please enter revision feedback notes for re-check.");
      return;
    }
    if (decision === 'REJECT' && !adminRemarks.trim()) {
      alert("Please enter a reason for rejection.");
      return;
    }

    setUpdating(true);
    try {
      await tasksApi.review(task.id, decision, adminRemarks);
      setAdminRemarks("");
      onUpdate();
      onClose();
    } catch (err: any) {
      alert("Review action failed: " + (err.message || "Unknown error"));
    } finally {
      setUpdating(false);
    }
  };

  const simulateReassignment = (candidateId: string) => {
     if (!candidateId) {
        setSimulatedRisk(null);
        return;
     }
     let baseRisk = task.risk_score || 0;
     let newRisk = Math.max(5, baseRisk - 25);
     setSimulatedRisk(newRisk);
  };

  const getRiskColor = (level?: string) => {
     if (level === "HIGH") return "text-red-600 bg-red-50 border-red-200";
     if (level === "MEDIUM") return "text-orange-600 bg-orange-50 border-orange-200";
     return "text-green-600 bg-green-50 border-green-200";
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4 font-sans">
        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
          
          {/* HEADER (PRESERVED) */}
          <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center z-10 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-slate-800">{task.title}</h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5 uppercase tracking-wider">{task.category || 'GENERAL'}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* MAIN BODY (PRESERVED UPPER SECTION) */}
          <div className="p-6 space-y-6 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Left Column: Metadata & Checklist */}
              <div className="md:col-span-2 space-y-6">
                 
                 <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 text-slate-700 mb-2"><FileText className="w-4 h-4"/> Description</h3>
                    <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
                       {task.description || "No description provided."}
                    </p>
                 </div>

                 <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 text-slate-700 mb-3"><CheckSquare className="w-4 h-4"/> Checklist / Subtasks</h3>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                       {subtasks.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No subtasks defined.</p>
                       ) : (
                          subtasks.map(st => (
                             <div key={st.id} className="flex items-start gap-3 group">
                                <button 
                                   onClick={() => toggleSubtask(st.id)}
                                   disabled={updating || (!isHod && (task.status === "Completed" || task.status === "COMPLETED" || task.status === "Awaiting Approval"))}
                                   className="mt-0.5 text-indigo-600 disabled:opacity-50"
                                >
                                   {st.completed ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                </button>
                                <span className={`text-sm flex-1 ${st.completed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                                   {st.title}
                                </span>
                                {isHod && (
                                   <button onClick={() => removeSubtask(st.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                                      <X className="w-4 h-4"/>
                                   </button>
                                )}
                             </div>
                          ))
                       )}
                       
                       {isHod && (
                          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                             <input 
                                type="text" 
                                placeholder="New subtask..." 
                                value={newSubtaskTitle}
                                onChange={e => setNewSubtaskTitle(e.target.value)}
                                className="flex-1 border text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                                onKeyDown={e => e.key === 'Enter' && addSubtask()}
                             />
                             <button onClick={addSubtask} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">Add</button>
                          </div>
                       )}
                    </div>
                 </div>
                 
                 {/* Reassignment Simulation (HOD Only) */}
                 {isHod && task.status !== "Completed" && task.status !== "COMPLETED" && (
                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                       <h3 className="text-sm font-bold flex items-center gap-2 text-indigo-900 mb-2">🤖 Reassignment Simulation</h3>
                       <div className="flex items-center gap-3">
                          <select onChange={e => simulateReassignment(e.target.value)} className="text-sm border rounded-lg px-3 py-2 flex-1">
                             <option value="">Simulate reassignment to...</option>
                             {facultyList.filter(f => f.name !== task.assigned).map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                             ))}
                          </select>
                       </div>
                       {simulatedRisk !== null && (
                          <div className="mt-3 text-sm text-indigo-800 bg-white p-3 rounded-lg border border-indigo-100">
                             New predicted risk: <b className={simulatedRisk > 50 ? 'text-orange-600' : 'text-green-600'}>{simulatedRisk}%</b>.
                             Recommendation: Reassigning this task could {task.risk_score && simulatedRisk < task.risk_score ? "reduce" : "increase"} deadline risk by {Math.abs((task.risk_score||0) - simulatedRisk)}%.
                          </div>
                       )}
                    </div>
                 )}
              </div>

              {/* Right Column: Risk & Metadata */}
              <div className="space-y-6">
                 <div className={`p-4 rounded-xl border ${getRiskColor(task.risk_level)}`}>
                    <div className="flex justify-between items-center mb-3">
                       <h3 className="font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Deadline Risk</h3>
                       <span className="text-xl font-black">{task.risk_score || 0}%</span>
                    </div>
                    <div className="space-y-2">
                       {(task.risk_factors || []).map((factor, idx) => (
                          <div key={idx} className="flex gap-2 text-xs font-medium opacity-80 leading-snug">
                             <span className="shrink-0">•</span> <span>{factor}</span>
                          </div>
                       ))}
                       {(!task.risk_factors || task.risk_factors.length === 0) && (
                          <div className="text-xs font-medium opacity-80">Sufficient time and normal workload.</div>
                       )}
                    </div>
                 </div>

                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4 text-sm">
                    <div>
                       <div className="text-xs font-semibold text-slate-400 mb-0.5">Assigned To</div>
                       <div className="font-bold text-slate-700 flex items-center gap-2"><UserIcon className="w-3.5 h-3.5"/> {task.assigned}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <div className="text-xs font-semibold text-slate-400 mb-0.5">Start Date</div>
                          <div className="font-medium text-slate-700">{task.start_date || "-"}</div>
                       </div>
                       <div>
                          <div className="text-xs font-semibold text-slate-400 mb-0.5">Deadline</div>
                          <div className="font-medium text-red-600 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> {task.deadline}</div>
                       </div>
                    </div>
                    <div>
                       <div className="text-xs font-semibold text-slate-400 mb-0.5">Estimated Effort</div>
                       <div className="font-medium text-slate-700">{task.estimated_effort || "-"}</div>
                    </div>
                    <div>
                       <div className="text-xs font-semibold text-slate-400 mb-0.5">Status</div>
                       <div className="font-medium text-slate-700">{task.status}</div>
                    </div>
                    <div>
                       <div className="text-xs font-semibold text-slate-400 mb-0.5">Progress</div>
                       <div className="w-full bg-slate-200 rounded-full h-2 mt-1">
                          <div className="bg-indigo-600 h-2 rounded-full" style={{ width: task.progress || '0%' }}></div>
                       </div>
                       <div className="text-xs font-bold text-slate-500 mt-1 text-right">{task.progress || '0%'}</div>
                    </div>
                 </div>

                 {/* Faculty Task Submission Button */}
                 {!isHod && task.status !== "Completed" && task.status !== "COMPLETED" && task.status !== "Awaiting Approval" && (
                    <button 
                       onClick={submitForApproval}
                       disabled={updating}
                       className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-md shadow-emerald-600/20 disabled:opacity-50"
                    >
                       <Save className="w-4 h-4"/> Submit Task
                    </button>
                 )}
              </div>
              
            </div>

            {/* Attachments Section */}
            <div className="mt-8 border-t border-slate-200 pt-6">
              <TaskAttachments taskId={task.id} />
            </div>
            
            {/* Audit Trail & Comments */}
            <div className="mt-8 border-t border-slate-200 pt-6">
              <TaskComments taskId={task.id} readOnly={isHod} />
            </div>

          </div>

          {/* ADMIN / HOD REVIEW DECISION ACTION BAR */}
          {isHod && (
            <div className="p-6 border-t border-slate-100 bg-slate-50/90 rounded-b-2xl space-y-3.5 shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                📋 Reviewer Decision Actions
              </h3>
              
              <div>
                <textarea
                  value={adminRemarks}
                  onChange={(e) => setAdminRemarks(e.target.value)}
                  placeholder="Enter revision notes or rejection remarks for assigned faculty..."
                  rows={2}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-800 placeholder-slate-400 font-medium leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleReviewDecision('APPROVE')}
                  disabled={updating}
                  className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Approve task and mark completed"
                >
                  <span>🟢 Approve</span>
                </button>

                <button
                  onClick={() => handleReviewDecision('RECHECK')}
                  disabled={updating}
                  className="py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Request revision from faculty"
                >
                  <span>🟡 Re-check</span>
                </button>

                <button
                  onClick={() => handleReviewDecision('REJECT')}
                  disabled={updating}
                  className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Reject task and request re-execution"
                >
                  <span>🔴 Reject</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* FACULTY INSTANT GREEN CHECKMARK SUCCESS MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 font-sans animate-fadeIn">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 flex flex-col items-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 border-4 border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-inner animate-bounce">
              <CheckCircle2 className="w-12 h-12 text-[#10B981]" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-800">Task Submitted Successfully!</h3>
              <p className="text-xs text-slate-500 font-medium mt-1.5 leading-relaxed">
                Your deliverables have been sent to Admin/HOD for review.
              </p>
            </div>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                onClose();
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
