import { useState, useRef, useEffect } from "react";
import { FaRobot, FaTimes, FaUserLock } from "react-icons/fa";
import { aiApi } from "../api";
import { AIChatResponse } from "../types";
import { useAuth } from "../contexts/AuthContext";

export default function Chatbot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const initialGreeting = user
    ? `Hi ${user.name}! I am HiéraSync AI. How can I assist you with AIML department tasks or approvals today?`
    : "Welcome to HiéraSync AI (SBJIT Nagpur). Please sign in for live department data, or ask me general questions about the platform!";

  const [messages, setMessages] = useState<AIChatResponse[]>([
    {
      user: "Hello",
      ai: initialGreeting
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (open) {
      scrollToBottom();
    }
  }, [messages, open]);

  // Local FAQ engine for unauthenticated guest visitors
  const handleGuestFAQ = (query: string): string => {
    const q = query.toLowerCase();
    if (q.includes("register") || q.includes("signup") || q.includes("join") || q.includes("account")) {
      return "To register on HiéraSync AI: Click 'Sign In' -> 'Register'. Use your official SBJIT Nagpur email (@sbjit.edu.in). After registering, join your department or create a new department if you are HOD/Admin.";
    }
    if (q.includes("role") || q.includes("hod") || q.includes("faculty") || q.includes("admin")) {
      return "HiéraSync AI supports 3 primary institutional roles: Admin (system configuration), HOD (department management & multi-tier approval sign-offs), and Faculty (task tracking & event management).";
    }
    if (q.includes("login") || q.includes("signin")) {
      return "Click the 'Sign In' button on the top right. Enter your registered email and password to access your AIML department workspace.";
    }
    if (q.includes("feature") || q.includes("what is") || q.includes("hierasync") || q.includes("about")) {
      return "HiéraSync AI is the smart academic workflow platform for SBJIT Nagpur's CSE (AI & ML) Department. Features include Task Kanban boards, Digital Approvals pipeline, Department Calendar, and AI insights.";
    }
    return "I am HiéraSync AI. You are currently in Guest mode. Please sign in to access live department tasks, pending approvals, and calendar insights!";
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Optimistic UI update
    setMessages(prev => [...prev, { user: userMessage, ai: "..." }]);
    setLoading(true);

    // Unauthenticated Guest Flow
    if (!user) {
      setTimeout(() => {
        const guestResponse = handleGuestFAQ(userMessage);
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1] = { user: userMessage, ai: guestResponse };
          return newMsgs;
        });
        setLoading(false);
      }, 400);
      return;
    }

    // Authenticated Flow with 401 & Error handling
    try {
      const response = await aiApi.chat({ message: userMessage });
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = response;
        return newMsgs;
      });
    } catch (error: any) {
      const isUnauthorized = error?.status === 401;
      const errorText = isUnauthorized 
        ? "Your session has expired. Please re-login to access live AI assistant features."
        : "Sorry, I encountered an issue reaching the AI backend. Please check your connection or try again.";

      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { 
          user: userMessage, 
          ai: `⚠️ ${errorText}` 
        };
        return newMsgs;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 bg-[#6D28D9] hover:bg-[#5B21B6] text-white p-4 rounded-full shadow-2xl z-50 transition transform hover:scale-105 active:scale-95"
        title="HiéraSync AI Assistant"
      >
        {open ? <FaTimes size={22} /> : <FaRobot size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 w-96 bg-white rounded-2xl shadow-2xl overflow-hidden z-50 border border-gray-200 flex flex-col h-[520px] font-sans">
          {/* HEADER */}
          <div className="bg-gradient-to-r from-[#6D28D9] to-[#9333EA] text-white p-4 shrink-0 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FaRobot /> HiéraSync AI
              </h2>
              <p className="text-xs text-purple-100 mt-0.5">
                SBJIT Nagpur • AIML Department
              </p>
            </div>
            {!user && (
              <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <FaUserLock className="text-[10px]" /> Guest Mode
              </span>
            )}
          </div>

          {/* CHAT MESSAGES */}
          <div className="p-4 space-y-4 flex-1 overflow-y-auto bg-slate-50 text-xs">
            {messages.map((msg, index) => (
              <div key={index} className="flex flex-col gap-2">
                {msg.user && (
                  <div className="self-end bg-[#6D28D9] text-white rounded-2xl rounded-tr-none px-3.5 py-2 max-w-[85%] shadow-xs leading-relaxed font-medium">
                    {msg.user}
                  </div>
                )}
                <div className="self-start bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-none px-3.5 py-2 max-w-[85%] shadow-xs flex gap-2 leading-relaxed">
                  <span className="shrink-0 mt-0.5">🤖</span>
                  <span className={msg.ai === "..." ? "animate-pulse font-semibold text-purple-600" : ""}>
                    {msg.ai}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT FOOTER */}
          <div className="border-t p-3 bg-white shrink-0">
            <input
              placeholder={user ? "Ask HiéraSync AI..." : "Ask guest question (e.g. how to register)..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              className="w-full border border-gray-200 rounded-xl p-2.5 outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/20 text-xs transition placeholder-gray-400"
              disabled={loading}
            />
          </div>
        </div>
      )}
    </>
  );
}