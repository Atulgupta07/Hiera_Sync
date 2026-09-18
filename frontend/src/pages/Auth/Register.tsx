import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { authApi } from "../../api";

import {
  User,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Network
} from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "", // Added role field
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.role) {
      setError("Please select a role before creating your account.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setError("");
    setLoading(true);
    
    try {
      await authApi.register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role, // Pass selected role
      });
      navigate("/login", { state: { message: "Registration successful! Please log in." } });
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Side - Branding */}
        <div className="md:w-1/2 bg-blue-100 flex flex-col justify-center items-center p-10 text-center">
          <img
            src="/login-image.svg" // We'll reuse or replace this if needed
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            alt="Register Illustration"
            className="w-3/4 mb-6 mix-blend-multiply"
          />
          <h2 className="text-2xl font-extrabold text-blue-700">Join HieraSync</h2>
          <p className="text-gray-600 mt-2 text-sm">
            Create an account to manage workflows, collaborate with faculty, and utilize AI assistance.
          </p>
        </div>

        {/* Right Side - Form */}
        <div className="md:w-1/2 p-10 bg-[#1e3a8a] text-white">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/20">
              <Network className="text-white w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold">Sign Up</h1>
            <p className="text-blue-200 text-sm mt-1">Create your department portal account</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-xl mb-6 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-blue-200 mb-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white text-gray-900 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-200 mb-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white text-gray-900 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  placeholder="you@campuspulse.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-200 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-white text-gray-900 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-200 mb-1">Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-white text-gray-900 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-200 mb-1">Role</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-gray-400" />
                </div>
                <select
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-white text-gray-900 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm appearance-none"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="" disabled>Select Role ▼</option>
                  <option value="FACULTY">Faculty</option>
                  <option value="HOD">HOD/Admin</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-[#1e3a8a] font-bold py-3 rounded-xl shadow-lg hover:bg-gray-100 transition mt-6 disabled:opacity-70 flex justify-center items-center gap-2"
            >
              {loading ? "Registering..." : "Sign Up →"}
            </button>
          </form>

          <p className="text-center text-xs text-blue-200 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-white hover:underline font-semibold">
              Log in here
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
