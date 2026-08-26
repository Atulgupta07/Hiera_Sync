import {
  BrowserRouter,
  Routes,
  Route,
  Link,
} from "react-router-dom";

import { lazy, Suspense } from "react";

import MainLayout from "./layouts/MainLayout";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Chatbot from "./components/Chatbot";

import {
  ArrowRight,
  GraduationCap,
} from "lucide-react";

import "./App.css";


/* =====================================================
   EXISTING PAGES — DO NOT CHANGE
===================================================== */

const Notifications = lazy(
  () => import("./pages/Notifications")
);

const Dashboard = lazy(
  () => import("./pages/Dashboard")
);

const Employees = lazy(
  () => import("./pages/Employees")
);

const Tasks = lazy(
  () => import("./pages/Tasks")
);

const CalendarPage = lazy(
  () => import("./pages/CalendarPage")
);

const Approvals = lazy(
  () => import("./pages/Approvals")
);

const Reports = lazy(
  () => import("./pages/Reports")
);

const Settings = lazy(
  () => import("./pages/Settings")
);

const Login = lazy(
  () => import("./pages/Auth/Login")
);

const Register = lazy(
  () => import("./pages/Auth/Register")
);

const JoinDepartment = lazy(
  () => import("./pages/JoinDepartment")
);

const CreateDepartment = lazy(
  () => import("./pages/CreateDepartment")
);


/* =====================================================
   LANDING PAGE ONLY
===================================================== */

function LandingPage() {
  return (
    <div className="hs-landing">

      {/* HEADER */}
      <header className="hs-header">
        <div className="hs-header-inner">

          <Link to="/" className="hs-logo-area">

            <div className="hs-logo">
              <GraduationCap size={27} />
            </div>

            <div>
              <div className="hs-brand">
                HieraSync <span>AI</span>
              </div>

              <div className="hs-brand-college">
                SBJIT NAGPUR
              </div>
            </div>

          </Link>


          <Link
            to="/login"
            className="hs-signin"
          >
            Sign In
            <ArrowRight size={17} />
          </Link>

        </div>
      </header>


      {/* MAIN LANDING */}
      <main className="hs-main">

        {/* LEFT */}
        <section className="hs-content">

          <div className="hs-college-name">

            <span>
              SB JAIN INSTITUTE OF TECHNOLOGY,
            </span>

            <span>
              MANAGEMENT & RESEARCH
            </span>

            <strong>
              NAGPUR
            </strong>

          </div>


          <h1 className="hs-title">
            HieraSync <span>AI</span>
          </h1>


          <h2 className="hs-department">
            CSE (AI & ML) Department
          </h2>


          <p className="hs-description">
            Smart academic workflow management
            for a connected and efficient department.
          </p>


          <Link
            to="/login"
            className="hs-enter"
          >
            <span>Enter HieraSync</span>
            <ArrowRight size={20} />
          </Link>

        </section>


        {/* RIGHT — COLLEGE PHOTO */}
        <section className="hs-photo-section">

          <div className="hs-photo">

            <img
              src="/sbjit-campus.jpg"
              alt="SB Jain Institute of Technology, Management & Research, Nagpur"
            />

            <div className="hs-photo-bottom">
              <GraduationCap size={17} />
              <span>SBJIT Nagpur</span>
            </div>

          </div>

        </section>

      </main>


      {/* FOOTER */}
      <footer className="hs-footer">
        <span>HieraSync AI</span>
        <span>•</span>
        <span>CSE (AI & ML)</span>
        <span>•</span>
        <span>SBJIT Nagpur</span>
        <span>•</span>
        <span>© 2026</span>
      </footer>

    </div>
  );
}


/* =====================================================
   APP — EXISTING ROUTES UNCHANGED
===================================================== */

function App() {
  return (
    <AuthProvider>

      <BrowserRouter>

        <Suspense
          fallback={
            <div className="app-loading">
              <div className="loading-spinner"></div>
              <p>Loading HieraSync...</p>
            </div>
          }
        >

          <Routes>

            {/* ONLY LANDING PAGE */}
            <Route
              path="/"
              element={<LandingPage />}
            />


            {/* LOGIN — UNCHANGED */}
            <Route
              path="/login"
              element={<Login />}
            />


            {/* REGISTER — UNCHANGED */}
            <Route
              path="/register"
              element={<Register />}
            />


            {/* ALL INTERNAL PAGES — UNCHANGED */}
            <Route element={<ProtectedRoute />}>

              <Route element={<MainLayout />}>

                <Route
                  path="/dashboard"
                  element={<Dashboard />}
                />

                <Route
                  path="/employees"
                  element={<Employees />}
                />

                <Route
                  path="/tasks"
                  element={<Tasks />}
                />

                <Route
                  path="/calendar"
                  element={<CalendarPage />}
                />

                <Route
                  path="/approvals"
                  element={<Approvals />}
                />

                <Route
                  path="/reports"
                  element={<Reports />}
                />

                <Route
                  path="/settings"
                  element={<Settings />}
                />

                <Route
                  path="/notifications"
                  element={<Notifications />}
                />

                <Route
                  path="/join-department"
                  element={<JoinDepartment />}
                />

                <Route
                  path="/create-department"
                  element={<CreateDepartment />}
                />

              </Route>

            </Route>

          </Routes>

          <Chatbot />

        </Suspense>

      </BrowserRouter>

    </AuthProvider>
  );
}

export default App;