import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { searchApi } from "../api";
import { FaSearch, FaBell, FaUserCircle, FaSignOutAlt } from "react-icons/fa";
import { GraduationCap } from "lucide-react";

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  
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
    <header className="h-20 bg-white border-b border-[#E5E5E5] shadow-xs flex items-center justify-between px-6 lg:px-8 z-30 font-sans">
      
      {/* Search Input Box */}
      <div className="relative">
        <div className="flex items-center bg-[#F7F7F5] border border-[#E5E5E5] focus-within:border-[#6D28D9] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#6D28D9]/10 rounded-xl px-4 py-2.5 w-72 sm:w-96 transition-all duration-200">
          <FaSearch className="text-[#A1A1AA] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, faculty, notifications..."
            className="outline-none ml-3 w-full bg-transparent text-sm text-[#171717] placeholder-[#A1A1AA] font-medium"
          />
        </div>

        {/* Search Suggestions Dropdown */}
        {search && (
          <div className="absolute top-14 left-0 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-[#E5E5E5] z-50 max-h-96 overflow-y-auto divide-y divide-[#F4F4F5]">
            {isSearching ? (
              <div className="p-4 text-[#71717A] text-center text-sm font-medium">Searching department records...</div>
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
                  className="px-5 py-3 hover:bg-[#F5F3FF] cursor-pointer text-[#171717] flex flex-col transition"
                >
                  <span className="font-semibold text-sm text-[#171717]">{item.title}</span>
                  <span className="text-xs text-[#6D28D9] font-medium capitalize mt-0.5">{item.type}</span>
                </div>
              ))
            ) : (
              <div className="p-4 text-[#71717A] text-center text-sm font-medium">No results found</div>
            )}
          </div>
        )}
      </div>

      {/* Right Header Navigation */}
      <div className="flex items-center gap-5 sm:gap-7">
        
        {/* Department Badge */}
        <div className="hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#F5F3FF] border border-[#EDE9FE]">
          <GraduationCap className="w-4 h-4 text-[#6D28D9]" />
          <div className="text-left">
            <h3 className="font-bold text-xs text-[#2E1065] leading-tight">AIML Department - SBJIT</h3>
            <p className="text-[11px] text-[#6D28D9] font-medium leading-tight">Nagpur Campus</p>
          </div>
        </div>

        {/* Notification Bell Button */}
        <button
          onClick={() => navigate("/notifications")}
          className="relative p-2.5 rounded-xl bg-[#F7F7F5] hover:bg-[#F5F3FF] hover:text-[#6D28D9] text-[#525252] border border-[#E5E5E5] transition shadow-xs"
          title="Notifications"
        >
          <FaBell className="text-base" />
          {/* Active dynamic pulse badge indicator */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1">
              <span className="animate-ping absolute inset-0 rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 min-w-[16px] px-1 bg-[#E11D48] text-white text-[10px] font-bold items-center justify-center">
                {unreadCount}
              </span>
            </span>
          )}
        </button>

        {/* User Profile Dropdown Menu */}
        <div className="relative group">
          <div className="flex items-center gap-3 bg-[#F7F7F5] hover:bg-[#EFEFEF] border border-[#E5E5E5] px-3.5 py-1.5 rounded-xl cursor-pointer transition">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#6D28D9] to-[#9333EA] text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {user?.name ? user.name.substring(0, 2).toUpperCase() : <FaUserCircle className="text-xl" />}
            </div>
            
            <div className="hidden sm:block text-left">
              <h3 className="font-bold text-sm text-[#171717] leading-tight">{user?.name || "Admin User"}</h3>
              <p className="text-xs text-[#737373] font-medium leading-tight">{user?.role || "ADMIN"}</p>
            </div>
          </div>

          {/* Logout Hover Menu */}
          <div className="hidden group-hover:block absolute right-0 top-full pt-2 z-50 w-48">
            <div className="bg-white rounded-2xl shadow-xl border border-[#E5E5E5] p-2">
              <div className="px-3 py-2 border-b border-[#F4F4F5] mb-1">
                <p className="text-xs font-medium text-[#737373]">Signed in as</p>
                <p className="text-xs font-bold text-[#171717] truncate">{user?.email || "admin@campuspulse.com"}</p>
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