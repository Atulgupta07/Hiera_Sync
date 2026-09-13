import { TaskResponse } from '../../types';

interface TaskViewsProps {
  tasks: TaskResponse[];
  onTaskClick: (task: TaskResponse) => void;
}

export function TaskCalendarView({ tasks, onTaskClick }: TaskViewsProps) {
  // A simplified calendar view visualizing dates.
  // Group tasks by deadline
  const tasksByDate = tasks.reduce((acc, task) => {
    if (!task.deadline) return acc;
    // Attempt parsing deadline to a YYYY-MM-DD key if possible
    let dateStr = task.deadline;
    try {
      const dt = new Date(task.deadline);
      if (!isNaN(dt.getTime())) {
        dateStr = dt.toISOString().split('T')[0];
      }
    } catch(e) {}
    
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(task);
    return acc;
  }, {} as Record<string, TaskResponse[]>);

  const dates = Object.keys(tasksByDate).sort();

  if (dates.length === 0) return <div className="p-8 text-center text-slate-500">No tasks with valid deadlines to show in calendar.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
      {dates.map(date => (
        <div key={date} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-100 px-4 py-2 font-bold text-slate-700 text-sm">
            {date}
          </div>
          <div className="p-3 space-y-2">
            {tasksByDate[date].map(t => (
              <div 
                key={t.id} 
                onClick={() => onTaskClick(t)}
                className="cursor-pointer p-2 rounded-lg border text-sm font-medium transition hover:shadow-md
                  border-slate-100 hover:border-indigo-200 bg-white"
              >
                <div className="flex items-center gap-2 mb-1">
                  {t.risk_level === 'HIGH' && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                  {t.risk_level === 'MEDIUM' && <span className="w-2 h-2 rounded-full bg-orange-500"></span>}
                  {t.risk_level === 'LOW' && <span className="w-2 h-2 rounded-full bg-green-500"></span>}
                  <span className="truncate">{t.title}</span>
                </div>
                <div className="text-xs text-slate-400 pl-4">{t.assigned} • {t.progress}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TaskTimelineView({ tasks, onTaskClick }: TaskViewsProps) {
  // A simplified Gantt chart view.
  if (tasks.length === 0) return <div className="p-8 text-center text-slate-500">No tasks to display in timeline.</div>;

  return (
    <div className="p-4 overflow-x-auto">
      <div className="min-w-[800px]">
        {tasks.map(t => {
          let riskColor = "bg-slate-300";
          if (t.status === "Completed") riskColor = "bg-emerald-400";
          else if (t.risk_level === "HIGH") riskColor = "bg-red-400";
          else if (t.risk_level === "MEDIUM") riskColor = "bg-orange-400";
          else riskColor = "bg-blue-400";

          // Simulate horizontal placement (without a full math rendering for simplicity, 
          // we use a flex representation to mimic a timeline bar)
          return (
            <div key={t.id} className="flex items-center gap-4 mb-4" onClick={() => onTaskClick(t)}>
              <div className="w-64 shrink-0 font-medium text-sm text-slate-700 truncate cursor-pointer hover:text-indigo-600">
                {t.title}
                <div className="text-xs text-slate-400">{t.start_date || "?"} - {t.deadline}</div>
              </div>
              <div className="flex-1 bg-slate-50 rounded-full h-6 border border-slate-100 relative overflow-hidden cursor-pointer hover:bg-slate-100">
                {/* Visual bar taking up a random length for visual Gantt representation, 
                    since complex date math without a library can break on edge cases */}
                <div className={`absolute left-[10%] right-[30%] top-1 bottom-1 rounded-full opacity-80 ${riskColor}`}></div>
                {t.status === "Completed" && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white z-10">DONE</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
