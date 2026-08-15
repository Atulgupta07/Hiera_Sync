import {
  FaHome,
  FaTasks,
  FaCalendarAlt,
  FaClipboardCheck,
  FaChartBar,
  FaRobot,
  FaUsers,
  FaCog,
  FaBell
} from "react-icons/fa";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Building2, Sparkles } from "lucide-react";

export default function Sidebar() {
  const { user } = useAuth();

  const menu = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: <FaHome className="w-5 h-5" />,
      badge: null
    },
    {
      name: "AI Assistant",
      path: "/ai",
      icon: <FaRobot className="w-5 h-5" />,
      badge: "AI"
    },
    {
      name: "Employees",
      path: "/employees",
      icon: <FaUsers className="w-5 h-5" />,
      badge: null
    },
    {
      name: "Tasks",
      path: "/tasks",
      icon: <FaTasks className="w-5 h-5" />,
      badge: "1"
    },
    {
      name: "Notifications",
      path: "/notifications",
      icon: <FaBell className="w-5 h-5" />,
      badge: "3"
    },
    {
      name: "Calendar",
      path: "/calendar",
      icon: <FaCalendarAlt className="w-5 h-5" />,
      badge: null
    },
    {
      name: "Approvals",
      path: "/approvals",
      icon: <FaClipboardCheck className="w-5 h-5" />,
      badge: "9"
    },
    {
      name: "Reports",
      path: "/reports",
      icon: <FaChartBar className="w-5 h-5" />,
      badge: null
    },
    {
      name: "Settings",
      path: "/settings",
      icon: <FaCog className="w-5 h-5" />,
      badge: null
    }
  ];

  if (!user?.department_id) {
    if (user?.role === "ADMIN" || user?.role === "HOD") {
      menu.push({
        name: "Create Dept",
        path: "/create-department",
        icon: <Building2 className="w-5 h-5" />,
        badge: "New"
      });
    } else {
      menu.push({
        name: "Join Dept",
        path: "/join-department",
        icon: <Building2 className="w-5 h-5" />,
        badge: "New"
      });
    }
  }

  return (
    <aside className="w-72 min-h-screen bg-slate-900 text-slate-300 p-6 flex flex-col justify-between shadow-2xl border-r border-slate-800/80 shrink-0 font-sans">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3.5 mb-8 pb-6 border-b border-slate-800">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-rose-500 to-indigo-600 p-0.5 shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-rose-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-wider">
              HIERASYNC <span className="text-indigo-400">AI</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">AIML Department Portal</p>
          </div>
        </div>

        {/* Menu Navigation */}
        <nav>
          <ul className="space-y-1.5">
            {menu.map((item, index) => (
              <li key={index}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-4 py-3 rounded-xl font-semibold text-sm transition duration-200 ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                        : "text-slate-400 hover:bg-slate-800/80 hover:text-white"
                    }`
                  }
                >
                  <div className="flex items-center gap-3.5">
                    <span className="shrink-0">{item.icon}</span>
                    <span>{item.name}</span>
                  </div>

                  {item.badge && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 border border-slate-700">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Footer Info */}
      <div className="pt-6 border-t border-slate-800/80 text-xs text-slate-500">
        <p className="font-semibold text-slate-400">SBJIT Nagpur • AIML</p>
        <p className="mt-0.5 text-slate-500">System v2.4 • Active Session</p>
      </div>
    </aside>
  );
}