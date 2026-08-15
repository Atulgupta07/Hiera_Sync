import {
  BrowserRouter,
  Routes,
  Route,
  Link
} from "react-router-dom";


import { lazy, Suspense } from "react";
import MainLayout from "./layouts/MainLayout";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Chatbot from "./components/Chatbot";

const Notifications = lazy(() => import("./pages/Notifications"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Employees = lazy(() => import("./pages/Employees"));
const Tasks = lazy(() => import("./pages/Tasks"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const Approvals = lazy(() => import("./pages/Approvals"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Auth/Login"));
const Register = lazy(() => import("./pages/Auth/Register"));
const JoinDepartment = lazy(() => import("./pages/JoinDepartment"));
const CreateDepartment = lazy(() => import("./pages/CreateDepartment"));
import { Users, Workflow, Bot, ArrowRight, GraduationCap, Sparkles } from "lucide-react";

// Landing Page
function LandingPage() {
  return (
    <div className="relative min-h-screen bg-slate-950 flex flex-col justify-between overflow-hidden font-sans">
      {/* Background Academic & Tech Visual Pattern */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-20 scale-105 transition-transform duration-1000"
        style={{ 
          backgroundImage: `url('https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=1920')` 
        }}
      />

      {/* Radiant Gradient Blurs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-[30rem] h-[30rem] bg-rose-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Dark Translucent Backdrop Overlay */}
      <div className="relative z-10 min-h-screen bg-slate-950/70 backdrop-blur-md flex flex-col justify-between px-6 py-10 md:px-12 lg:px-20">
        
        {/* Top Header Branding */}
        <header className="flex justify-between items-center max-w-7xl w-full mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-rose-500 to-indigo-600 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-rose-400" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-white tracking-wider">HIERASYNC <span className="text-indigo-400">AI</span></span>
              <p className="text-xs text-slate-400 font-medium">SBJIT Nagpur • AIML Dept</p>
            </div>
          </div>

          <Link
            to="/login"
            className="hidden sm:flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/70 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            Sign In <ArrowRight className="w-4 h-4 text-indigo-400" />
          </Link>
        </header>

        {/* Hero Section */}
        <main className="max-w-6xl w-full mx-auto my-auto py-10 text-center flex flex-col items-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-sm font-semibold mb-6 shadow-inner">
            <GraduationCap className="w-4 h-4 text-rose-400" />
            <span>AI-Powered Academic Workflow Management</span>
          </div>

          {/* Prominent White Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl">
            WELCOME TO <span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-400 via-indigo-300 to-cyan-400">HIERASYNC AI</span>
          </h1>

          <p className="mt-4 text-lg md:text-xl text-slate-300 max-w-2xl font-medium leading-relaxed">
            Empowering CSE AI & ML Department • SBJIT Nagpur
          </p>
          <p className="mt-2 text-sm md:text-base text-slate-400 max-w-xl">
            Streamlining faculty operations, automated task approvals, and department analytics with intelligent AI support.
          </p>

          {/* Primary CTA */}
          <div className="mt-8">
            <Link
              to="/login"
              className="inline-flex items-center gap-3 bg-[#FF4D4D] hover:bg-[#E03E3E] text-white px-9 py-4 rounded-xl font-bold text-base shadow-lg shadow-red-500/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>Explore Login Portal</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          {/* Feature Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-14 text-left">
            {/* Card 1 */}
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800/80 p-6 shadow-xl hover:border-rose-500/40 transition duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <Users className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Faculty Management</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Centralized faculty profiles, workload distribution, and department directory management.
              </p>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800/80 p-6 shadow-xl hover:border-indigo-500/40 transition duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <Workflow className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Smart Workflow</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Seamless multi-level task dispatch, real-time approval pipelines, and deadline notifications.
              </p>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800/80 p-6 shadow-xl hover:border-cyan-500/40 transition duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <Bot className="w-6 h-6 text-cyan-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">AI Task Assistant</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Automated productivity tracking, intelligent scheduling recommendations, and AI reporting.
              </p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 py-3 max-w-7xl w-full mx-auto border-t border-slate-800/60 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© 2026 HieraSync AI • SBJIT Nagpur AIML Department</span>
          <span>Designed for Academic Excellence</span>
        </footer>
      </div>
    </div>
  );
}

function App(){

  return(
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={
          <div className="flex h-screen w-screen items-center justify-center bg-blue-50">
            <div className="w-10 h-10 border-4 border-t-blue-600 border-r-transparent border-b-blue-600 border-l-transparent rounded-full animate-spin"></div>
          </div>
        }>
          <Routes>
            {/* Landing */}
            <Route path="/" element={<LandingPage/>} />
            
            {/* Login & Register */}
            <Route path="/login" element={<Login/>} />
            <Route path="/register" element={<Register/>} />
            
            {/* Main Application */}
            <Route element={<ProtectedRoute />}>
              <Route element={<MainLayout/>}>
                <Route path="/dashboard" element={<Dashboard/>} />
                <Route path="/employees" element={<Employees/>} />
                <Route path="/tasks" element={<Tasks/>} />
                <Route path="/calendar" element={<CalendarPage/>} />
                <Route path="/approvals" element={<Approvals/>} />
                <Route path="/reports" element={<Reports/>} />
                <Route path="/settings" element={<Settings/>} />
                <Route path="/notifications" element={<Notifications/>} />
                <Route path="/join-department" element={<JoinDepartment/>} />
                <Route path="/create-department" element={<CreateDepartment/>} />
              </Route>
            </Route>
          </Routes>
          <Chatbot/>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );

}



export default App;