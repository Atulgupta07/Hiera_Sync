import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { reportsApi, aiApi } from "../api";
import { DashboardStatsResponse, ActivityLogResponse, AIDashboardSummaryResponse } from "../types";
import { useAuth } from "../contexts/AuthContext";
import StatCard from "../components/StatCard";
import {
  Users,
  CheckSquare,
  ClipboardCheck,
  Sparkles,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Activity,
  Clock,
  UserCheck,
  Shield,
  Building,
  ChevronRight,
  BrainCircuit,
  Zap,
  CheckCircle2
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

// Mock analytics velocity data for AI automation chart
const velocityData = [
  { day: "Mon", tasks: 12, aiAutomated: 9 },
  { day: "Tue", tasks: 19, aiAutomated: 16 },
  { day: "Wed", tasks: 15, aiAutomated: 13 },
  { day: "Thu", tasks: 22, aiAutomated: 20 },
  { day: "Fri", tasks: 28, aiAutomated: 26 },
  { day: "Sat", tasks: 10, aiAutomated: 8 },
  { day: "Sun", tasks: 8, aiAutomated: 7 },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [activities, setActivities] = useState<ActivityLogResponse[]>([]);
  const [aiInsights, setAiInsights] = useState<AIDashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, actData, aiData] = await Promise.allSettled([
          reportsApi.getDashboardStats(),
          reportsApi.getRecentActivities(),
          aiApi.getDashboardSummary(),
        ]);

        if (statsData.status === "fulfilled") setStats(statsData.value);
        if (actData.status === "fulfilled") setActivities(actData.value || []);
        if (aiData.status === "fulfilled") setAiInsights(aiData.value);
      } catch (error) {
        console.error("Dashboard data error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-indigo-600 font-bold text-lg">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading AIML Dashboard...</span>
        </div>
      </div>
    );
  }

  // Default fallback activities if empty
  const displayActivities = activities.length > 0 ? activities : [
    {
      id: "act-1",
      message: "Dr. Sharma submitted Syllabus Approval request for AI Lab",
      category: "approval",
      timestamp: "10 mins ago"
    },
    {
      id: "act-2",
      message: "New Task assigned: NAAC Committee Document Audit",
      category: "task",
      timestamp: "1 hour ago"
    },
    {
      id: "act-3",
      message: "AI Automation updated weekly productivity report (+14%)",
      category: "ai",
      timestamp: "3 hours ago"
    },
    {
      id: "act-4",
      message: "Prof. Kulkarni approved Lab Equipment Procurement",
      category: "approval",
      timestamp: "5 hours ago"
    }
  ];

  return (
    <div className="space-y-8 font-sans">
      {/* Header Welcome Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold tracking-wide uppercase">
            <Sparkles className="w-4 h-4 text-rose-400" />
            <span>AIML Department Workflow Portal • SBJIT Nagpur</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Welcome back, {user?.name || "Faculty Member"} 👋
          </h1>
          <p className="text-slate-300 text-sm md:text-base max-w-xl">
            Here is your daily operational summary and AI automation performance overview.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate("/tasks")}
            className="flex items-center gap-2 bg-[#FF4D4D] hover:bg-[#E03E3E] text-white px-5 py-3 rounded-xl font-bold text-sm shadow-lg shadow-red-500/25 transition transform hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Task</span>
          </button>
          <button
            onClick={() => navigate("/approvals")}
            className="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700 text-white border border-slate-700/80 px-5 py-3 rounded-xl font-semibold text-sm transition"
          >
            <span>View Approvals</span>
            <ArrowUpRight className="w-4 h-4 text-indigo-400" />
          </button>
        </div>
      </div>

      {/* TOP METRIC STRIP (Dual-Tone Light Shade Stat Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Employees / Faculty */}
        <StatCard
          title="Total Faculty / Staff"
          value={stats?.employees_count ?? 2}
          icon={<Users className="w-6 h-6" />}
          bgTint="bg-[#E6FFFA]"
          accentColor="text-[#0D9488]"
          borderColor="border-[#0D9488]/30"
          iconBg="bg-[#0D9488]/15"
          badgeText="Active AIML Dept"
        />

        {/* Card 2: Pending Tasks */}
        <StatCard
          title="Pending Tasks"
          value={stats?.pending_tasks_count ?? 1}
          icon={<CheckSquare className="w-6 h-6" />}
          bgTint="bg-[#F3E8FF]"
          accentColor="text-[#9333EA]"
          borderColor="border-[#9333EA]/30"
          iconBg="bg-[#9333EA]/15"
          badgeText="Requires Action"
        />

        {/* Card 3: Approvals */}
        <StatCard
          title="Pending Approvals"
          value={stats?.approvals_count ?? 9}
          icon={<ClipboardCheck className="w-6 h-6" />}
          bgTint="bg-[#FFF1F2]"
          accentColor="text-[#E11D48]"
          borderColor="border-[#E11D48]/30"
          iconBg="bg-[#E11D48]/15"
          badgeText="In Review Pipeline"
        />

        {/* Card 4: AI Productivity */}
        <StatCard
          title="AI Automation Score"
          value={stats?.ai_productivity || "92%"}
          icon={<TrendingUp className="w-6 h-6" />}
          bgTint="bg-[#EFF6FF]"
          accentColor="text-[#2563EB]"
          borderColor="border-[#2563EB]/30"
          iconBg="bg-[#2563EB]/15"
          badgeText="+14% Efficiency"
        />
      </div>

      {/* MIDDLE MULTI-WIDGET GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* WIDGET 1: Department Activity / Newsfeed Card (Left - 4 columns) */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Recent Department Log</h3>
                  <p className="text-xs text-slate-500">Live operational newsfeed</p>
                </div>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <div className="mt-5 space-y-4">
              {displayActivities.map((act, index) => (
                <div
                  key={act.id || index}
                  className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 transition duration-200 border border-slate-100"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                    {user?.name ? user.name.substring(0, 2).toUpperCase() : "FA"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">
                      {act.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100/70 text-indigo-700 uppercase tracking-wider">
                        {act.category || "General"}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {act.timestamp || "Just now"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate("/notifications")}
            className="mt-6 w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 transition"
          >
            <span>View Full Activity Log</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* WIDGET 2: AI Workflow & Task Analytics Spotlight Card (Center - 5 columns) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">AI Task Velocity</h3>
                  <p className="text-xs text-slate-500">Weekly task completion & AI automation rate</p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                +18% Speed
              </span>
            </div>

            {/* Recharts Analytics Chart */}
            <div className="h-56 mt-4 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={velocityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "none", color: "#fff" }}
                  />
                  <Area type="monotone" dataKey="tasks" stroke="#4F46E5" strokeWidth={3} fillOpacity={1} fill="url(#colorTasks)" name="Total Tasks" />
                  <Area type="monotone" dataKey="aiAutomated" stroke="#F43F5E" strokeWidth={3} fillOpacity={1} fill="url(#colorAi)" name="AI Assisted" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* AI Insights Bar */}
            <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>AI Department Recommendation</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {aiInsights?.insights?.[0] || "Task dispatch velocity increased by 22%. Recommend scheduling NAAC documentation review before Friday."}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1 text-slate-700 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 88% Workflow Automation
            </span>
            <button
              onClick={() => navigate("/reports")}
              className="text-indigo-600 font-bold hover:underline"
            >
              Detailed Analytics →
            </button>
          </div>
        </div>

        {/* WIDGET 3: User / Department Profile Spotlight (Right - 3 columns) */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-slate-100 text-center">
              <div className="relative inline-block mx-auto mb-3">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-rose-500 p-1 shadow-lg shadow-indigo-500/20">
                  <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-white font-extrabold text-2xl">
                    {user?.name ? user.name.substring(0, 2).toUpperCase() : "AU"}
                  </div>
                </div>
                <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white" />
              </div>

              <h3 className="text-xl font-bold text-slate-900">{user?.name || "Active Faculty"}</h3>
              <p className="text-xs text-slate-500 font-medium">{user?.email || "faculty@sbjit.edu.in"}</p>

              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-wider">
                  {user?.role || "FACULTY"}
                </span>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-rose-100 text-rose-700">
                  SBJIT AIML
                </span>
              </div>
            </div>

            {/* Quick Department Info */}
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 text-sm">
                <span className="text-slate-500 flex items-center gap-2 text-xs font-semibold">
                  <Building className="w-4 h-4 text-indigo-500" /> Department
                </span>
                <span className="font-bold text-slate-800 text-xs">CSE (AI & ML)</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 text-sm">
                <span className="text-slate-500 flex items-center gap-2 text-xs font-semibold">
                  <Shield className="w-4 h-4 text-emerald-500" /> Status
                </span>
                <span className="font-bold text-emerald-600 text-xs flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" /> Verified Staff
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Shortcuts */}
          <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Quick Shortcuts</h4>

            <button
              onClick={() => navigate("/employees")}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs flex items-center justify-between transition"
            >
              <span>Faculty Directory</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => navigate("/calendar")}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs flex items-center justify-between transition"
            >
              <span>Academic Calendar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}