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
  GraduationCap,
  ShieldCheck,
} from "lucide-react";

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
    <div className="min-h-screen w-full bg-[#f4f6f8] flex">

      {/* =====================================================
          LEFT COLLEGE / BRANDING SECTION
      ===================================================== */}

      <section className="hidden lg:flex lg:w-[48%] relative min-h-screen overflow-hidden bg-[#17365d]">

        {/* College Image */}
        <img
          src={loginImage}
          alt="SB Jain Institute of Technology, Management & Research"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Professional dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#102a49]/95 via-[#17365d]/75 to-[#17365d]/45" />

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d2038]/95 via-transparent to-[#17365d]/25" />

        {/* Content */}
        <div className="relative z-10 w-full min-h-screen flex flex-col justify-between p-10 xl:p-14">

          {/* Top Brand */}
          <Link
            to="/"
            className="flex items-center gap-4 w-fit"
          >
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-lg">
              <GraduationCap
                size={27}
                className="text-[#17365d]"
              />
            </div>

            <div>
              <div className="text-[27px] font-extrabold tracking-tight text-white leading-none">
                HieraSync <span className="text-[#e3a1aa]">AI</span>
              </div>

              <div className="mt-1.5 text-[11px] font-semibold tracking-[2px] text-white/75 uppercase">
                Academic Workflow Management
              </div>
            </div>
          </Link>


          {/* Main Image Content */}
          <div className="max-w-xl">

            <div className="w-14 h-1 bg-[#b32135] mb-7 rounded-full" />

            <p className="text-[13px] font-bold tracking-[2px] text-white/80 uppercase mb-4">
              SB Jain Institute of Technology,
              Management & Research
            </p>

            <h1 className="text-5xl xl:text-[64px] font-black tracking-[-2px] leading-[1.02] text-white">
              HieraSync
              <span className="text-[#e3a1aa]"> AI</span>
            </h1>

            <p className="mt-5 text-lg xl:text-xl text-white/90 font-medium leading-relaxed max-w-lg">
              A unified academic workspace for
              faculty, tasks, approvals, schedules
              and department reporting.
            </p>

            <div className="mt-7 flex items-center gap-3">
              <div className="h-9 w-[3px] rounded-full bg-[#b32135]" />

              <div>
                <p className="text-sm font-bold text-white">
                  CSE (AI & ML) Department
                </p>

                <p className="text-xs text-white/65 mt-1">
                  SBJIT Nagpur
                </p>
              </div>
            </div>

          </div>


          {/* Bottom Security */}
          <div className="flex items-center justify-between border-t border-white/20 pt-5">

            <div className="flex items-center gap-2 text-xs font-medium text-white/75">
              <ShieldCheck
                size={17}
                className="text-white"
              />
              Secure Campus Access
            </div>

            <div className="text-xs text-white/60">
              © 2026 HieraSync AI
            </div>

          </div>

        </div>
      </section>


      {/* =====================================================
          RIGHT LOGIN SECTION
      ===================================================== */}

      <section className="w-full lg:w-[52%] min-h-screen flex items-center justify-center px-5 py-8 sm:px-8 lg:px-12 xl:px-20 bg-[#f7f8fa]">

        <div className="w-full max-w-[540px]">

          {/* Mobile Brand */}
          <div className="lg:hidden mb-8">

            <Link
              to="/"
              className="inline-flex items-center gap-3"
            >

              <div className="w-11 h-11 rounded-xl bg-[#17365d] flex items-center justify-center">
                <GraduationCap
                  size={24}
                  className="text-white"
                />
              </div>

              <div>
                <div className="text-xl font-extrabold text-[#17365d]">
                  HieraSync <span className="text-[#b32135]">AI</span>
                </div>

                <div className="text-[9px] font-bold tracking-[1.5px] text-slate-500">
                  SBJIT NAGPUR
                </div>
              </div>

            </Link>

          </div>


          {/* Login Header */}
          <div className="mb-8">

            <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[1.5px] uppercase text-[#17365d] mb-4">

              <span className="w-7 h-[2px] bg-[#b32135]" />

              Department Sign In

            </div>

            <h2 className="text-[36px] sm:text-[42px] font-extrabold tracking-[-1.5px] text-[#172238] leading-tight">
              Welcome Back
            </h2>

            <p className="mt-2 text-[15px] text-[#6d7887]">
              Sign in to access your HieraSync academic workspace.
            </p>

          </div>


          {/* Error */}
          {error && (
            <div className="mb-6 px-4 py-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}


          {/* =====================================================
              LOGIN FORM
          ===================================================== */}

          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >

            {/* Account Type */}
            <div>

              <label className="block text-[13px] font-bold text-[#26364d] mb-2">
                Account Type
              </label>

              <select
                value={roleIntent}
                onChange={(e) => setRoleIntent(e.target.value)}
                className="
                  w-full
                  h-[52px]
                  px-4
                  rounded-lg
                  bg-white
                  border border-[#d8dde4]
                  text-[#172238]
                  text-[14px]
                  font-medium
                  outline-none
                  transition
                  focus:border-[#17365d]
                  focus:ring-4
                  focus:ring-[#17365d]/10
                "
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


            {/* Email */}
            <div>

              <label className="block text-[13px] font-bold text-[#26364d] mb-2">
                College Email Address
              </label>

              <div className="relative">

                <Mail
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8793a2]"
                />

                <input
                  type="email"
                  placeholder="name@sbjit.edu.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="
                    w-full
                    h-[52px]
                    pl-11
                    pr-4
                    rounded-lg
                    bg-white
                    border border-[#d8dde4]
                    text-[#172238]
                    text-[14px]
                    outline-none
                    placeholder:text-[#a1aab5]
                    transition
                    focus:border-[#17365d]
                    focus:ring-4
                    focus:ring-[#17365d]/10
                  "
                />

              </div>

            </div>


            {/* Password */}
            <div>

              <div className="flex items-center justify-between mb-2">

                <label className="text-[13px] font-bold text-[#26364d]">
                  Password
                </label>

                <button
                  type="button"
                  className="text-[12px] font-bold text-[#b32135] hover:text-[#8f1829] transition"
                >
                  Forgot Password?
                </button>

              </div>

              <div className="relative">

                <Lock
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8793a2]"
                />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  required
                  className="
                    w-full
                    h-[52px]
                    pl-11
                    pr-12
                    rounded-lg
                    bg-white
                    border border-[#d8dde4]
                    text-[#172238]
                    text-[14px]
                    outline-none
                    placeholder:text-[#a1aab5]
                    transition
                    focus:border-[#17365d]
                    focus:ring-4
                    focus:ring-[#17365d]/10
                  "
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  className="
                    absolute
                    right-4
                    top-1/2
                    -translate-y-1/2
                    text-[#8793a2]
                    hover:text-[#17365d]
                    transition
                  "
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>

              </div>

            </div>


            {/* Remember Me */}
            <div className="flex items-center pt-1">

              <label className="flex items-center gap-2.5 cursor-pointer">

                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) =>
                    setRememberMe(e.target.checked)
                  }
                  className="
                    w-4
                    h-4
                    rounded
                    border-[#cbd2da]
                    accent-[#17365d]
                    cursor-pointer
                  "
                />

                <span className="text-[13px] font-medium text-[#596678]">
                  Remember me on this device
                </span>

              </label>

            </div>


            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="
                group
                w-full
                h-[54px]
                mt-2
                rounded-lg
                bg-[#17365d]
                hover:bg-[#0e2b4c]
                text-white
                font-bold
                text-[15px]
                flex
                items-center
                justify-center
                gap-3
                shadow-[0_10px_25px_rgba(23,54,93,0.20)]
                hover:shadow-[0_14px_30px_rgba(23,54,93,0.28)]
                transition-all
                duration-200
                disabled:opacity-60
                disabled:cursor-not-allowed
              "
            >

              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>

                  <ArrowRight
                    size={19}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </>
              )}

            </button>

          </form>


          {/* =====================================================
              FOOTER
          ===================================================== */}

          <div className="mt-9 pt-6 border-t border-[#e1e5ea] text-center">

            <p className="text-[13px] text-[#697586]">

              Don't have an account?{" "}

              <Link
                to="/register"
                className="font-bold text-[#b32135] hover:text-[#8f1829] transition"
              >
                Create an Account
              </Link>

            </p>

            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-semibold tracking-wide text-[#9aa3ae] uppercase">

              <span>
                HieraSync AI
              </span>

              <span>•</span>

              <span>
                SBJIT Nagpur
              </span>

              <span>•</span>

              <span>
                CSE AI & ML
              </span>

            </div>

          </div>

        </div>

      </section>

    </div>
  );
}