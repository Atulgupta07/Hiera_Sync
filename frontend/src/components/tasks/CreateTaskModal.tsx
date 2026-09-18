import { useState, useEffect } from "react";
import { tasksApi, employeesApi } from "../../api";
import { TaskCreate, EmployeeResponse } from "../../types";

export default function CreateTaskModal({ onClose, onSuccess, initialData = {} }: any) {
  const [facultyList, setFacultyList] = useState<EmployeeResponse[]>([]);
  const [taskForm, setTaskForm] = useState<TaskCreate>({
    title: initialData.title || "", 
    description: initialData.description || "", 
    category: "General", assigned: "", assigned_id: "", assignees: [], assignee_ids: [],
    start_date: "", 
    deadline: initialData.deadline || "", 
    deadline_time: "", priority: "High",
    estimated_effort: "", reminder: "1 day before", require_approval: false,
    status: "Pending", progress: "0%", subtasks: []
  });

  useEffect(() => {
    employeesApi.getAll().then(setFacultyList);
  }, []);

  const handleCreateTask = async () => {
    if(!taskForm.title || !taskForm.assignee_ids?.length || !taskForm.deadline) {
      alert("Please fill required fields: Title, Assigned Faculty, and Deadline Date");
      return;
    }
    
    const selectedNames = taskForm.assignee_ids!.map(id => facultyList.find(f => f.id === id)?.name || "");
    const primaryId = taskForm.assignee_ids![0];
    const primaryName = selectedNames[0];
    
    const payload: TaskCreate = { 
      ...taskForm, 
      assigned_id: primaryId,
      assigned: primaryName,
      assignees: selectedNames 
    };

    try {
      const createdTask = await tasksApi.create(payload);
      onSuccess(createdTask);
    } catch(err: any) {
      alert("Error creating task: " + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-indigo-900 mb-4 border-b pb-2">Convert to Task / Create Task</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Task Name *</label>
              <input type="text" className="w-full border p-2.5 rounded-lg bg-slate-50 focus:bg-white" value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex justify-between items-center">
                  <span>Assigned Faculty *</span>
                  <span className="text-xs text-slate-500 font-normal">
                    {(taskForm.assignee_ids || []).length} / 2 Faculty
                  </span>
                </label>
                
                <div className="w-full border p-2.5 rounded-lg bg-slate-50 flex flex-col gap-2">
                  {(taskForm.assignee_ids || []).map(id => {
                    const fac = facultyList.find(f => f.id === id);
                    return (
                      <div key={id} className="flex justify-between items-center bg-white border border-slate-200 rounded px-3 py-1.5 shadow-sm">
                        <span className="text-sm font-medium text-slate-700">{fac?.name}</span>
                        <button type="button" onClick={() => setTaskForm({...taskForm, assignee_ids: (taskForm.assignee_ids || []).filter(aid => aid !== id)})} className="text-slate-400 hover:text-red-500">X</button>
                      </div>
                    );
                  })}
                  
                  {(taskForm.assignee_ids || []).length < 2 && (
                    <select className="w-full mt-1 border-none bg-transparent text-sm text-indigo-600 font-medium focus:outline-none cursor-pointer" value="" onChange={e => {
                        if(e.target.value && !(taskForm.assignee_ids || []).includes(e.target.value)) {
                          setTaskForm({...taskForm, assignee_ids: [...(taskForm.assignee_ids || []), e.target.value]});
                        }
                      }}>
                      <option value="">+ Add Faculty</option>
                      {facultyList.filter(f => !(taskForm.assignee_ids || []).includes(f.id)).map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea className="w-full border p-2.5 rounded-lg bg-slate-50 focus:bg-white" rows={2} value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})}></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input type="date" className="w-full border p-2.5 rounded-lg bg-slate-50 focus:bg-white" value={taskForm.start_date} onChange={e => setTaskForm({...taskForm, start_date: e.target.value})} />
            </div>
            <div className="flex gap-2">
               <div className="flex-1">
                 <label className="block text-sm font-medium text-slate-700 mb-1">Deadline Date *</label>
                 <input type="date" className="w-full border p-2.5 rounded-lg bg-slate-50 focus:bg-white" value={taskForm.deadline} onChange={e => setTaskForm({...taskForm, deadline: e.target.value})} />
               </div>
               <div className="flex-1">
                 <label className="block text-sm font-medium text-slate-700 mb-1">Deadline Time</label>
                 <input type="time" className="w-full border p-2.5 rounded-lg bg-slate-50 focus:bg-white" value={taskForm.deadline_time} onChange={e => setTaskForm({...taskForm, deadline_time: e.target.value})} />
               </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority & Estimated Effort</label>
              <div className="flex gap-2">
                 <select className="flex-1 border p-2.5 rounded-lg bg-slate-50" value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: e.target.value})}>
                    <option>High</option><option>Medium</option><option>Low</option>
                 </select>
                 <input type="text" placeholder="e.g. 4 hours" className="flex-1 border p-2.5 rounded-lg bg-slate-50" value={taskForm.estimated_effort} onChange={e => setTaskForm({...taskForm, estimated_effort: e.target.value})} />
              </div>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500" checked={taskForm.require_approval} onChange={e => setTaskForm({...taskForm, require_approval: e.target.checked})} />
                <span className="text-sm font-medium text-slate-700">Require HOD Approval to Complete</span>
              </label>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
             <button onClick={onClose} className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
             <button onClick={handleCreateTask} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Create Task</button>
          </div>
        </div>
    </div>
  );
}
