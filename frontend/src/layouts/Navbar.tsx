import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { searchApi } from "../api";
import { FaSearch, FaBell, FaUserCircle, FaSignOutAlt } from "react-icons/fa";
import { GraduationCap } from "lucide-react";

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await searchApi.globalSearch(search);
        setResults(data.results || []);
      } catch (err) {
        console.error("Search error", err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  return (
    <header className="h-20 bg-white border-b border-slate-200/80 shadow-xs flex items-center justify-between px-6 lg:px-8 z-30 font-sans">
      
      {/* Search Input Box */}
      <div className="relative">
        <div className="flex items-center bg-slate-100/90 border border-slate-200 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100 rounded-xl px-4 py-2.5 w-72 sm:w-96 transition-all duration-200">
          <FaSearch className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, faculty, notifications..."
            className="outline-none ml-3 w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 font-medium"
          />
        </div>

        {/* Search Suggestions Dropdown */}
        {search && (
          <div className="absolute top-14 left-0 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 max-h-96 overflow-y-auto divide-y divide-slate-100">
            {isSearching ? (
              <div className="p-4 text-slate-500 text-center text-sm font-medium">Searching department records...</div>
            ) : results.length > 0 ? (
              results.map((item, index) => (
                <div
                  key={item.id || index}
                  onClick={() => {
                    setSearch("");
                    if (item.type === "faculty") navigate("/employees");
                    else if (item.type === "task") navigate("/tasks");
                    else if (item.type === "event") navigate("/calendar");
                    else if (item.type === "notification") navigate("/notifications");
                    else navigate("/dashboard");
                  }}
                  className="px-5 py-3 hover:bg-indigo-50/70 cursor-pointer text-slate-800 flex flex-col transition"
                >
                  <span className="font-bold text-sm text-slate-900">{item.title}</span>
                  <span className="text-xs text-indigo-600 font-semibold capitalize mt-0.5">{item.type}</span>
                </div>
              ))
            ) : (
              <div className="p-4 text-slate-500 text-center text-sm font-medium">No results found</div>
            )}
          </div>
        )}
      </div>

      {/* Right Header Navigation */}
      <div className="flex items-center gap-5 sm:gap-7">
        
        {/* Department Badge */}
        <div className="hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100">
          <GraduationCap className="w-4 h-4 text-indigo-600" />
          <div className="text-left">
            <h3 className="font-bold text-xs text-indigo-900 leading-tight">AIML Department - SBJIT</h3>
            <p className="text-[11px] text-indigo-600 font-medium leading-tight">Nagpur Campus</p>
          </div>
        </div>

        {/* Notification Bell Button */}
        <button
          onClick={() => navigate("/notifications")}
          className="relative p-2.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition shadow-xs"
          title="Notifications"
        >
          <FaBell className="text-lg" />
          {/* Active pulse badge indicator */}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-white text-[10px] font-bold items-center justify-center">
              3
            </span>
          </span>
        </button>

        {/* User Profile Dropdown Menu */}
        <div className="relative group">
          <div className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 px-3.5 py-1.5 rounded-xl cursor-pointer transition">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-rose-500 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
              {user?.name ? user.name.substring(0, 2).toUpperCase() : <FaUserCircle className="text-xl" />}
            </div>
            
            <div className="hidden sm:block text-left">
              <h3 className="font-bold text-sm text-slate-800 leading-tight">{user?.name || "Faculty Member"}</h3>
              <p className="text-xs text-slate-500 font-semibold leading-tight">{user?.role || "FACULTY"}</p>
            </div>
          </div>

          {/* Logout Hover Menu */}
          <div className="hidden group-hover:block absolute right-0 top-full pt-2 z-50 w-48">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs font-semibold text-slate-400">Signed in as</p>
                <p className="text-xs font-bold text-slate-800 truncate">{user?.email || "faculty@sbjit.edu.in"}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition"
              >
                <FaSignOutAlt className="text-sm" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
}