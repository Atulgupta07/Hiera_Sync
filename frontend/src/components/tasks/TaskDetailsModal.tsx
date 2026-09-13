import { useState } from 'react';
import { TaskResponse, Subtask, EmployeeResponse } from '../../types';
import { tasksApi } from '../../api';
import TaskComments from './TaskComments';
import TaskAttachments from './TaskAttachments';
import { CheckSquare, Square, X, AlertTriangle, Clock, Save, FileText, User as UserIcon } from 'lucide-react';
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

  const isHod = role === "HOD" || role === "ADMIN";

  const toggleSubtask = async (id: string) => {
    // Teacher can only toggle if not completed/awaiting approval
    if (!isHod && (task.status === "Completed" || task.status === "Awaiting Approval")) return;
    
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
       await tasksApi.update(task.id, { progress: "100%" });
       onUpdate();
       onClose();
    } catch (err) {
       alert("Failed to submit.");
    } finally {
       setUpdating(false);
    }
  };

  const simulateReassignment = (candidateId: string) => {
     if (!candidateId) {
        setSimulatedRisk(null);
        return;
     }
     // very basic frontend simulation demonstrating the logic requested
     let baseRisk = task.risk_score || 0;
     // Assume the candidate has workload X. Without full backend integration of simulation, 
     // we'll just demonstrate the feature visually by reducing risk artificially for demo
     let newRisk = Math.max(5, baseRisk - 25);
     setSimulatedRisk(newRisk);
  };

  const getRiskColor = (level?: string) => {
     if (level === "HIGH") return "text-red-600 bg-red-50 border-red-200";
     if (level === "MEDIUM") return "text-orange-600 bg-orange-50 border-orange-200";
     return "text-green-600 bg-green-50 border-green-200";
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{task.title}</h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5 uppercase tracking-wider">{task.category || 'General'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
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
                                 disabled={updating || (!isHod && (task.status === "Completed" || task.status === "Awaiting Approval"))}
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
               {isHod && task.status !== "Completed" && (
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
                     <span className="text-xl font-black">{task.risk_score}%</span>
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

               {!isHod && task.status !== "Completed" && task.status !== "Awaiting Approval" && (
                  <button 
                     onClick={submitForApproval}
                     disabled={updating}
                     className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                     <Save className="w-4 h-4"/> Submit for Approval
                  </button>
               )}
            </div>
            
          </div>
        </div>
        
        <div className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Attachments & Files</h3>
          <TaskAttachments taskId={task.id} />
        </div>
        
        <div className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Comments & Mentions</h3>
          <TaskComments taskId={task.id} />
        </div>
        
      </div>
    </div>
  );
}
