import loginImage from "../../assets/login image.jpg";
import { useNavigate, Link } from "react-router-dom";
import { useState, FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  BrainCircuit,
  Sparkles,
  ShieldCheck,
  GraduationCap
} from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ email, password });
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      {/* Container Split Card */}
      <div className="w-full max-w-5xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200/80 grid grid-cols-1 md:grid-cols-12 min-h-[640px]">
        
        {/* LEFT BRANDING PANEL */}
        <div className="md:col-span-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden text-white">
          {/* Subtle Glow Orbs */}
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-rose-500/20 rounded-full blur-3xl" />

          {/* Top Logo */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 to-indigo-600 p-0.5 shadow-lg shadow-indigo-500/30">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <BrainCircuit className="w-7 h-7 text-indigo-400" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-wide text-white">HieraSync <span className="text-indigo-400">AI</span></h2>
              <p className="text-xs text-indigo-200/80 font-medium">CSE AIML Department Portal</p>
            </div>
          </div>

          {/* Center Graphic & Department Hero */}
          <div className="relative z-10 my-8 flex flex-col items-center text-center">
            <div className="relative mb-6 group">
              <div className="absolute -inset-1 bg-gradient-to-r from-rose-500 to-indigo-600 rounded-3xl blur-md opacity-40 group-hover:opacity-75 transition duration-500" />
              <div className="relative bg-slate-900/90 rounded-2xl p-4 border border-slate-800 shadow-2xl">
                <img
                  src={loginImage}
                  alt="Education AI"
                  className="w-full max-w-xs object-contain rounded-xl max-h-56"
                />
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-3">
              <GraduationCap className="w-3.5 h-3.5 text-rose-400" />
              <span>SBJIT Nagpur • AIML Department</span>
            </div>

            <h3 className="text-2xl font-bold text-white leading-snug">
              Intelligent Workflow & Faculty Management
            </h3>
            <p className="text-slate-300 text-sm mt-2 max-w-sm leading-relaxed">
              Streamlining tasks, approvals, schedule management, and academic reporting in one unified AI-driven workspace.
            </p>
          </div>

          {/* Bottom Security Badge */}
          <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Secure Campus Access</span>
            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-rose-400" /> Powered by AI</span>
          </div>
        </div>

        {/* RIGHT AUTHENTICATION FORM */}
        <div className="md:col-span-6 p-8 lg:p-12 flex flex-col justify-between bg-white">
          <div>
            <div className="mb-8">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                Department Sign In
              </span>
              <h2 className="text-3xl font-extrabold text-slate-900 mt-3">Welcome Back</h2>
              <p className="text-slate-600 text-sm mt-1">Please enter your credentials to access your dashboard.</p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm mb-6 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  College Email Address
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400 pointer-events-none">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    placeholder="name@sbjit.edu.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 rounded-xl py-3 pl-12 pr-4 text-base text-slate-900 placeholder-slate-400 transition-all outline-none"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-slate-800">
                    Password
                  </label>
                  <button 
                    type="button" 
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400 pointer-events-none">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 rounded-xl py-3 pl-12 pr-12 text-base text-slate-900 placeholder-slate-400 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-700 font-medium">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                  />
                  <span>Remember me on this device</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-rose-600 hover:from-indigo-700 hover:to-rose-700 text-white font-bold text-base shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-3 transition duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed mt-4"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer link */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-600">
              Don't have an account?{" "}
              <Link to="/register" className="text-indigo-600 hover:text-indigo-800 font-bold transition">
                Create an Account
              </Link>
            </p>
            <p className="text-xs text-slate-400 mt-4">
              HieraSync AI • SBJIT Nagpur AIML Department Management
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}