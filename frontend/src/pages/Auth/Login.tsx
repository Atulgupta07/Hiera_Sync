import { useNavigate, Link } from "react-router-dom";
import { useState, FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";

import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  GraduationCap,
  ShieldCheck,
  BrainCircuit,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleIntent, setRoleIntent] = useState("FACULTY");
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e?: FormEvent) => {
    if (e) e.preventDefault();

    setError("");
    setLoading(true);

    try {
      await login({
        email,
        password,
        rememberMe,
      });

      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-canvas">

      {/* AMBIENT BACKGROUND GLOWS */}
      <div className="login-ambient-glow login-glow-1" />
      <div className="login-ambient-glow login-glow-2" />
      <div className="login-ambient-glow login-glow-3" />

      {/* CENTERED AUTHENTICATION COMPOSITION */}
      <div className="login-container">

        {/* LEFT SIDE: PREMIUM CAMPUS VISUAL HERO CARD */}
        <section className="login-visual-panel">

          <div className="login-visual-image-wrapper">

            {/* Campus Photo Background */}
            <img
              src="/sbjit-campus.jpg"
              alt="SB Jain Institute of Technology, Management & Research, Nagpur"
              className="login-visual-bg-img"
            />

            {/* Glossy Multi-Gradient & Sheen Overlays */}
            <div className="login-visual-gradient-overlay" />
            <div className="login-visual-sheen" />

            {/* Layered Content Over Image */}
            <div className="login-visual-content">

              {/* Brand Logo Header */}
              <Link to="/" className="login-brand-link">
                <div className="login-brand-logo">
                  <GraduationCap size={24} />
                </div>

                <div>
                  <div className="login-brand-title">
                    HiéraSync <span className="login-brand-ai">AI</span>
                  </div>
                  <div className="login-brand-sub">
                    Academic Workflow Management
                  </div>
                </div>
              </Link>

              {/* Main Tagline & Hero Copy */}
              <div className="login-hero-text">
                <div className="login-institution-tag">
                  <Sparkles size={13} className="text-amber-300" />
                  <span>SBJIT NAGPUR • CSE (AI & ML)</span>
                </div>

                <h2>
                  Intelligent Departmental Governance & Academic Workflows
                </h2>

                <p>
                  A unified academic workspace for faculty members, task pipelines,
                  approval queues, and institutional intelligence.
                </p>
              </div>

              {/* Frosted Glass Feature Cards */}
              <div className="login-feature-cards">

                <div className="login-feature-card">
                  <div className="login-feature-icon plum">
                    <BrainCircuit size={18} />
                  </div>
                  <div>
                    <strong>AI-Powered Automation</strong>
                    <span>Automated departmental reporting and deadline tracking</span>
                  </div>
                </div>

                <div className="login-feature-card">
                  <div className="login-feature-icon emerald">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <strong>Institutional Verification</strong>
                    <span>Direct HOD & Dean approval management workflow</span>
                  </div>
                </div>

              </div>

              {/* Security Badge Footer */}
              <div className="login-security-footer">
                <div className="login-security-item">
                  <ShieldCheck size={16} />
                  <span>Enterprise Grade Security</span>
                </div>
                <span>•</span>
                <div className="login-security-item">
                  <span>SBJIT Campus Portal v2.4</span>
                </div>
              </div>

            </div>

          </div>

        </section>


        {/* RIGHT SIDE: PREMIUM AUTHENTICATION CARD */}
        <section className="login-card-panel">

          <div className="login-card">

            {/* Mobile Header Brand */}
            <div className="login-mobile-brand">
              <Link to="/" className="login-brand-link-mobile">
                <div className="login-brand-logo-mobile">
                  <GraduationCap size={22} />
                </div>
                <div>
                  <div className="login-brand-title-mobile">
                    HiéraSync <span className="login-brand-ai">AI</span>
                  </div>
                  <div className="login-brand-sub-mobile">
                    SBJIT NAGPUR
                  </div>
                </div>
              </Link>
            </div>

            {/* Login Header */}
            <div className="login-header-group">
              <div className="login-eyebrow">
                <span className="login-eyebrow-bar" />
                <span>DEPARTMENT SIGN IN</span>
              </div>

              <h1>Welcome Back</h1>

              <p>
                Sign in to access your HieraSync academic workspace.
              </p>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="login-error-banner">
                <span>{error}</span>
              </div>
            )}

            {/* =====================================================
                LOGIN FORM
            ===================================================== */}
            <form onSubmit={handleLogin} className="login-form">

              {/* Account Type Selector */}
              <div className="login-field-group">
                <label htmlFor="account-type" className="login-label">
                  Account Type
                </label>

                <div className="login-select-wrapper">
                  <select
                    id="account-type"
                    value={roleIntent}
                    onChange={(e) => setRoleIntent(e.target.value)}
                    className="login-select"
                  >
                    <option value="FACULTY">
                      Faculty / Staff
                    </option>
                    <option value="ADMIN">
                      Administrator / HOD
                    </option>
                    <option value="STUDENT">
                      Student / Member
                    </option>
                  </select>
                </div>
              </div>

              {/* Email Address Field */}
              <div className="login-field-group">
                <label htmlFor="email" className="login-label">
                  College Email Address
                </label>

                <div className="login-input-wrapper">
                  <Mail size={17} className="login-input-icon" />
                  <input
                    id="email"
                    type="email"
                    placeholder="name@sbjit.edu.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="login-input"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="login-field-group">
                <div className="login-label-row">
                  <label htmlFor="password" className="login-label">
                    Password
                  </label>

                  <button
                    type="button"
                    className="login-forgot-btn"
                  >
                    Forgot Password?
                  </button>
                </div>

                <div className="login-input-wrapper">
                  <Lock size={17} className="login-input-icon" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="login-input login-input-password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="login-eye-btn"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="login-remember-row">
                <label className="login-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="login-checkbox"
                  />
                  <span>Remember me on this device</span>
                </label>
              </div>

              {/* Primary Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="login-submit-btn"
              >
                {loading ? (
                  <>
                    <div className="login-spinner" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight size={18} className="login-btn-arrow" />
                  </>
                )}
              </button>

            </form>

            {/* Login Footer */}
            <div className="login-card-footer">
              <p>
                Don't have an account?{" "}
                <Link to="/register" className="login-register-link">
                  Create an Account
                </Link>
              </p>

              <div className="login-footer-meta">
                <span>HIÉRASYNC AI</span>
                <span>•</span>
                <span>SBJIT NAGPUR</span>
                <span>•</span>
                <span>CSE AI & ML</span>
              </div>
            </div>

          </div>

        </section>

      </div>

    </div>
  );
}