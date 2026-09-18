import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { tasksApi, aiApi, reportsApi } from "../api";
import { Activity, Clock3, CheckSquare, ListTodo, TrendingUp, AlertCircle } from "lucide-react";
import "./Dashboard.css";

export default function FacultyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [stats, setStats] = useState({
     tasks: 0,
     requests: 0,
     goals: 0
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [tasks, requests, goals, actData, aiData] = await Promise.allSettled([
          tasksApi.getAll(),
          fetch("http://localhost:8000/api/v1/task-requests", { headers: { "Authorization": `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()),
          fetch("http://localhost:8000/api/v1/goals", { headers: { "Authorization": `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()),
          reportsApi.getRecentActivities(),
          aiApi.getDashboardSummary()
        ]);
        
        setStats({
          tasks: tasks.status === 'fulfilled' ? tasks.value.filter((t: any) => t.status !== 'Completed').length : 0,
          requests: requests.status === 'fulfilled' && Array.isArray(requests.value) ? requests.value.length : 0,
          goals: goals.status === 'fulfilled' && Array.isArray(goals.value) ? goals.value.length : 0,
        });
        
        if (actData.status === 'fulfilled') setActivities(actData.value || []);
        if (aiData.status === 'fulfilled' && aiData.value?.teacher_priorities) {
           setPriorities(aiData.value.teacher_priorities);
        }
      } catch (err) {}
    };
    fetchStats();
  }, []);

  return (
    <div className="admin-dashboard">
      <section className="dashboard-hero">
        <div className="hero-content">
          <h1>Welcome, <strong>{user?.name.split(" ")[0]}</strong></h1>
          <p>Here is your academic workflow and priorities.</p>
          <div className="hero-actions">
            <button className="primary-action" onClick={() => navigate("/tasks")}><CheckSquare size={16} /> My Tasks</button>
            <button className="secondary-action" onClick={() => navigate("/task-requests")}><ListTodo size={16} /> My Requests</button>
          </div>
        </div>
      </section>
      
      <section className="kpi-grid">
         <div className="kpi-card kpi-indigo" onClick={() => navigate("/tasks")}>
            <div className="kpi-top">
               <div><span>Active Tasks</span><strong>{stats.tasks}</strong></div>
               <div className="kpi-icon"><CheckSquare size={20} /></div>
            </div>
         </div>
         <div className="kpi-card kpi-purple" onClick={() => navigate("/task-requests")}>
            <div className="kpi-top">
               <div><span>My Requests</span><strong>{stats.requests}</strong></div>
               <div className="kpi-icon"><ListTodo size={20} /></div>
            </div>
         </div>
         <div className="kpi-card kpi-emerald" onClick={() => navigate("/goals")}>
            <div className="kpi-top">
               <div><span>My Goals</span><strong>{stats.goals}</strong></div>
               <div className="kpi-icon"><TrendingUp size={20} /></div>
            </div>
         </div>
      </section>
      
      <section className="dashboard-main-grid">
        <div className="dashboard-panel activity-panel">
          <div className="panel-header">
            <div className="panel-title">
               <div className="panel-icon plum"><Activity size={18} /></div>
               <div><h2>Recent Activity</h2></div>
            </div>
          </div>
          <div className="activity-list">
            {activities.length === 0 && <p className="p-4 text-sm text-gray-500">No recent activities.</p>}
            {activities.slice(0, 4).map((act, i) => (
              <div className="activity-row" key={i}>
                <div className="activity-number">{i + 1}</div>
                <div className="activity-content">
                  <strong>{act.message}</strong>
                  <div className="activity-meta"><span><Clock3 size={11} /> {act.timestamp || 'Just now'}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="dashboard-panel review-panel">
          <div className="panel-header">
            <div className="panel-title">
               <div className="panel-icon amber"><AlertCircle size={18} /></div>
               <div><h2>Attention Required</h2></div>
            </div>
          </div>
          <div className="review-stack p-4 space-y-3">
             {priorities.length === 0 && <p className="text-sm text-gray-500">You are all caught up!</p>}
             {priorities.map((p, i) => (
               <div key={i} className="p-3 bg-red-50 rounded-lg border border-red-100 flex items-center gap-3 cursor-pointer" onClick={() => navigate("/tasks")}>
                  <AlertCircle className="text-red-500" size={20} />
                  <div>
                    <h4 className="text-sm font-bold text-red-700">{p.title}</h4>
                    <p className="text-xs text-red-600">{p.why?.[0]}</p>
                  </div>
               </div>
             ))}
          </div>
        </div>
      </section>
    </div>
  );
}
