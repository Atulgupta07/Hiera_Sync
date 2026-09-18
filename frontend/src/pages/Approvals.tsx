import { useState, useEffect, useMemo } from "react";
import { approvalsApi } from "../api";
import { ApprovalResponse } from "../types";
import { useAuth } from "../contexts/AuthContext";
import {
  CheckCircle2,
  Clock,
  XCircle,
  ClipboardList,
  Search,
  RotateCw,
  Eye,
  Check,
  X,
  User,
  Calendar,
  AlertCircle,
  Building2,
  Tag
} from "lucide-react";

export default function Approvals() {
  const { user } = useAuth();
  const isHodOrAdmin = user?.role === "ADMIN" || user?.role === "HOD";

  const [approvals, setApprovals] = useState<ApprovalResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Pending" | "Approved" | "Rejected">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  // Selected approval for View Details modal
  const [selectedApproval, setSelectedApproval] = useState<ApprovalResponse | null>(null);

  // Rejection modal state
  const [rejectingItem, setRejectingItem] = useState<ApprovalResponse | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await approvalsApi.getAll();
      setApprovals(data || []);
    } catch (err: any) {
      console.error("Failed to load approvals:", err);
      setError(err.message || "Failed to load approval requests");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const data = await approvalsApi.getAll();
      setApprovals(data || []);
      showToast("Approval list refreshed");
    } catch (err: any) {
      setError(err.message || "Failed to refresh approvals");
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // Approve action (Admin only)
  const handleApprove = async (id: string, title: string) => {
    try {
      setActionLoading(true);
      await approvalsApi.approve(id);
      showToast(`Approved request: "${title}"`);
      if (selectedApproval?.id === id) {
        setSelectedApproval((prev) => (prev ? { ...prev, status: "Approved" } : null));
      }
      await fetchApprovals();
    } catch (err: any) {
      alert("Failed to approve request: " + (err.message || "Unknown error"));
    } finally {
      setActionLoading(false);
    }
  };

  // Reject action (Admin only)
  const handleRejectConfirm = async () => {
    if (!rejectingItem) return;
    try {
      setActionLoading(true);
      await approvalsApi.reject(rejectingItem.id, rejectionReason || undefined);
      showToast(`Rejected request: "${rejectingItem.title}"`);
      if (selectedApproval?.id === rejectingItem.id) {
        setSelectedApproval((prev) =>
          prev ? { ...prev, status: "Rejected", comments: rejectionReason || prev.comments } : null
        );
      }
      setRejectingItem(null);
      setRejectionReason("");
      await fetchApprovals();
    } catch (err: any) {
      alert("Failed to reject request: " + (err.message || "Unknown error"));
    } finally {
      setActionLoading(false);
    }
  };

  // Faculty Data Isolation:
  // For Faculty users, isolate records strictly belonging to them
  const visibleApprovals = useMemo(() => {
    if (isHodOrAdmin) return approvals;
    if (!user) return approvals;

    const userName = (user.name || "").trim().toLowerCase();
    const userEmail = (user.email || "").trim().toLowerCase();
    const userId = String(user.id || "").trim();

    return approvals.filter((item) => {
      const req = (item.requested || "").toLowerCase();
      const ass = (item.assigned || "").toLowerCase();
      const itemUserId = String((item as any).user_id || "").trim();
      const itemReqId = String((item as any).requested_id || "").trim();

      return (
        (itemUserId && itemUserId === userId) ||
        (itemReqId && itemReqId === userId) ||
        (userName && req.includes(userName)) ||
        (userEmail && req.includes(userEmail)) ||
        (userName && ass.includes(userName))
      );
    });
  }, [approvals, isHodOrAdmin, user]);

  // Computed summary counts (scoped to current role's visible records)
  const totalCount = visibleApprovals.length;
  const pendingCount = visibleApprovals.filter(
    (a) => (a.status || "").toLowerCase() === "pending" || (a.status || "").toLowerCase() === "awaiting approval"
  ).length;
  const approvedCount = visibleApprovals.filter(
    (a) => (a.status || "").toLowerCase() === "approved" || (a.status || "").toLowerCase() === "completed"
  ).length;
  const rejectedCount = visibleApprovals.filter(
    (a) => (a.status || "").toLowerCase() === "rejected" || (a.status || "").toLowerCase() === "revision required"
  ).length;

  // Filtered approval list
  const filteredApprovals = useMemo(() => {
    return visibleApprovals.filter((item) => {
      // Status filter
      if (statusFilter !== "ALL") {
        const itemStatus = (item.status || "").toLowerCase();
        if (statusFilter === "Pending" && !itemStatus.includes("pending") && !itemStatus.includes("awaiting")) {
          return false;
        }
        if (statusFilter === "Approved" && !itemStatus.includes("approved") && !itemStatus.includes("completed")) {
          return false;
        }
        if (statusFilter === "Rejected" && !itemStatus.includes("rejected") && !itemStatus.includes("revision")) {
          return false;
        }
      }

      // Priority filter
      if (priorityFilter !== "ALL") {
        if ((item.priority || "Medium").toLowerCase() !== priorityFilter.toLowerCase()) {
          return false;
        }
      }

      // Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTitle = (item.title || "").toLowerCase().includes(q);
        const matchRequester = (item.requested || "").toLowerCase().includes(q);
        const matchAssigned = (item.assigned || "").toLowerCase().includes(q);
        const matchType = (item.type || "").toLowerCase().includes(q);
        if (!matchTitle && !matchRequester && !matchAssigned && !matchType) {
          return false;
        }
      }

      return true;
    });
  }, [visibleApprovals, statusFilter, priorityFilter, searchTerm]);

  // Helper for priority badge styling
  const getPriorityBadge = (priority?: string) => {
    const p = (priority || "Medium").toLowerCase();
    if (p === "high") {
      return "bg-rose-100 text-rose-700 border-rose-200";
    }
    if (p === "low") {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }
    return "bg-amber-100 text-amber-700 border-amber-200";
  };

  // Helper for status badge styling
  const getStatusBadge = (status?: string) => {
    const s = (status || "Pending").toLowerCase();
    if (s.includes("approved") || s.includes("completed")) {
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }
    if (s.includes("rejected") || s.includes("revision")) {
      return "bg-rose-100 text-rose-800 border-rose-200";
    }
    return "bg-amber-100 text-amber-800 border-amber-200";
  };

  // Helper for formatted date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Recent";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  return (
    <div className="p-8 font-sans bg-slate-50 min-h-screen text-slate-800">
      
      {/* =====================================================
          1. HEADER
      ===================================================== */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
              {isHodOrAdmin ? "Approval Management" : "My Approvals"}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                isHodOrAdmin
                  ? "bg-purple-100 text-purple-700 border-purple-200"
                  : "bg-blue-100 text-blue-700 border-blue-200"
              }`}
            >
              {isHodOrAdmin ? "Department Admin" : "Faculty"}
            </span>
          </div>
          <p className="text-slate-500 mt-1 text-sm">
            {isHodOrAdmin
              ? "Review and manage pending requests and submissions"
              : "Track the status of your submitted requests and approvals."}
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-sm font-medium text-slate-700 shadow-xs transition cursor-pointer"
          title="Refresh approvals"
        >
          <RotateCw size={15} className={isRefreshing ? "animate-spin text-indigo-600" : "text-slate-500"} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl mb-6 flex items-center justify-between text-sm">
          <span>{error}</span>
          <button onClick={fetchApprovals} className="underline font-semibold hover:text-rose-900 cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* =====================================================
          2. SUMMARY KPI CARDS
      ===================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
        {/* Pending Approvals */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80 transition hover:shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isHodOrAdmin ? "Pending Approvals" : "My Pending"}
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-600 tracking-tight">{pendingCount}</div>
          <p className="text-xs text-slate-400 mt-1">
            {isHodOrAdmin ? "Requires immediate HOD review" : "Awaiting department review"}
          </p>
        </div>

        {/* Approved */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80 transition hover:shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isHodOrAdmin ? "Approved" : "My Approved"}
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600 tracking-tight">{approvedCount}</div>
          <p className="text-xs text-slate-400 mt-1">
            {isHodOrAdmin ? "Successfully signed off" : "Approved by Department Admin"}
          </p>
        </div>

        {/* Rejected */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80 transition hover:shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isHodOrAdmin ? "Rejected" : "My Rejected"}
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <XCircle size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-rose-600 tracking-tight">{rejectedCount}</div>
          <p className="text-xs text-slate-400 mt-1">
            {isHodOrAdmin ? "Returned for revision" : "Returned for revision"}
          </p>
        </div>

        {/* Total Requests */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80 transition hover:shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {isHodOrAdmin ? "Total Requests" : "My Total Submissions"}
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <ClipboardList size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-indigo-600 tracking-tight">{totalCount}</div>
          <p className="text-xs text-slate-400 mt-1">
            {isHodOrAdmin ? "All department requests" : "All your submitted requests"}
          </p>
        </div>
      </div>

      {/* =====================================================
          3. CONTROLS: SEARCH & FILTERS
      ===================================================== */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-white text-slate-800 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setStatusFilter("Pending")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              statusFilter === "Pending"
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-500 hover:text-amber-700"
            }`}
          >
            <Clock size={12} />
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter("Approved")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              statusFilter === "Approved"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-500 hover:text-emerald-700"
            }`}
          >
            <CheckCircle2 size={12} />
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setStatusFilter("Rejected")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              statusFilter === "Rejected"
                ? "bg-rose-600 text-white shadow-xs"
                : "text-slate-500 hover:text-rose-700"
            }`}
          >
            <XCircle size={12} />
            Rejected ({rejectedCount})
          </button>
        </div>

        {/* Search Input & Priority Filter */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={isHodOrAdmin ? "Search title, requester, type..." : "Search title, type..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-slate-700 focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* =====================================================
          4. APPROVAL REQUEST LIST / TABLE
      ===================================================== */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RotateCw size={24} className="animate-spin mx-auto mb-3 text-indigo-600" />
            Loading approval requests...
          </div>
        ) : filteredApprovals.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {isHodOrAdmin ? "No approval requests found" : "No submissions found"}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchTerm || statusFilter !== "ALL" || priorityFilter !== "ALL"
                ? "No approvals match your current filter and search criteria."
                : isHodOrAdmin
                ? "All caught up! There are no pending approval requests in the department."
                : "You haven't submitted any approval requests yet. Submitted tasks and requests will appear here."}
            </p>
            {(searchTerm || statusFilter !== "ALL" || priorityFilter !== "ALL") && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("ALL");
                  setPriorityFilter("ALL");
                }}
                className="mt-4 px-4 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Request / Title</th>
                  <th className="px-5 py-3.5">{isHodOrAdmin ? "Submitted By" : "Assigned Reviewer"}</th>
                  <th className="px-5 py-3.5">Request Type</th>
                  <th className="px-5 py-3.5">Date Submitted</th>
                  <th className="px-5 py-3.5">Priority</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">{isHodOrAdmin ? "Available Actions" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {filteredApprovals.map((item) => {
                  const isPending =
                    (item.status || "").toLowerCase() === "pending" ||
                    (item.status || "").toLowerCase() === "awaiting approval";
                  const priorityClass = getPriorityBadge(item.priority);
                  const statusClass = getStatusBadge(item.status);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedApproval(item)}
                      className="hover:bg-slate-50/60 transition cursor-pointer group"
                    >
                      {/* Request / Title */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition leading-snug">
                          {item.title}
                        </div>
                        {item.comments && (
                          <p className="text-[11px] text-slate-400 font-normal line-clamp-1 mt-0.5">
                            {item.comments}
                          </p>
                        )}
                      </td>

                      {/* Submitted By (Admin) or Assigned Reviewer (Faculty) */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-slate-700">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0">
                            {isHodOrAdmin ? (item.requested || "U")[0] : (item.assigned || "D")[0]}
                          </div>
                          <span className="font-medium truncate max-w-[140px]">
                            {isHodOrAdmin ? item.requested : (item.assigned || "Department Admin")}
                          </span>
                        </div>
                      </td>

                      {/* Request Type */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                          <Tag size={10} className="text-slate-400" />
                          {item.type || "Academic Approval"}
                        </span>
                      </td>

                      {/* Date Submitted */}
                      <td className="px-5 py-4 text-slate-500 whitespace-nowrap">
                        {formatDate(item.created_at)}
                      </td>

                      {/* Priority */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${priorityClass}`}
                        >
                          {item.priority || "Medium"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusClass}`}
                        >
                          {isPending && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          )}
                          {item.status || "Pending"}
                        </span>
                      </td>

                      {/* Available Actions */}
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View button */}
                          <button
                            onClick={() => setSelectedApproval(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                            title="View details"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Action buttons for pending items - ADMIN ONLY */}
                          {isHodOrAdmin && isPending && (
                            <>
                              <button
                                onClick={() => handleApprove(item.id, item.title)}
                                disabled={actionLoading}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                                title="Approve this request"
                              >
                                <Check size={13} />
                                <span>Approve</span>
                              </button>

                              <button
                                onClick={() => {
                                  setRejectingItem(item);
                                  setRejectionReason("");
                                }}
                                disabled={actionLoading}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                                title="Reject this request"
                              >
                                <X size={13} />
                                <span>Reject</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =====================================================
          5. VIEW DETAILS MODAL
      ===================================================== */}
      {selectedApproval && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setSelectedApproval(null)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
              <div>
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                  Approval Request Details
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">{selectedApproval.title}</h3>
              </div>
              <button
                onClick={() => setSelectedApproval(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs text-slate-600">
              {/* Status & Badges */}
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full font-bold border ${getStatusBadge(selectedApproval.status)}`}>
                  {selectedApproval.status || "Pending"}
                </span>
                <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${getPriorityBadge(selectedApproval.priority)}`}>
                  {selectedApproval.priority || "Medium"} Priority
                </span>
                <span className="px-2.5 py-1 rounded-md font-semibold bg-slate-100 text-slate-700">
                  {selectedApproval.type || "Academic Approval"}
                </span>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                    Submitted By
                  </span>
                  <div className="font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
                    <User size={13} className="text-slate-400" />
                    <span>{selectedApproval.requested}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                    Assigned Reviewer
                  </span>
                  <div className="font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
                    <Building2 size={13} className="text-slate-400" />
                    <span>{selectedApproval.assigned || "Department Admin"}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                    Date Submitted
                  </span>
                  <div className="font-medium text-slate-700 mt-1 flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span>{formatDate(selectedApproval.created_at)}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                    Reviewed Date
                  </span>
                  <div className="font-medium text-slate-700 mt-1 flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" />
                    <span>{selectedApproval.reviewed_at ? formatDate(selectedApproval.reviewed_at) : "Pending Review"}</span>
                  </div>
                </div>
              </div>

              {/* Comments / Description */}
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1.5">
                  Request Notes & Details
                </span>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-slate-700 leading-relaxed font-normal">
                  {selectedApproval.comments || "No additional description provided with this request."}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => setSelectedApproval(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Close
              </button>

              {/* Approve / Reject buttons if pending - ADMIN ONLY */}
              {isHodOrAdmin &&
                ((selectedApproval.status || "").toLowerCase() === "pending" ||
                  (selectedApproval.status || "").toLowerCase() === "awaiting approval") && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setRejectingItem(selectedApproval);
                      setRejectionReason("");
                    }}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer"
                  >
                    <X size={14} />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleApprove(selectedApproval.id, selectedApproval.title)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <Check size={14} />
                    <span>Approve Request</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          6. REJECTION REASON MODAL
      ===================================================== */}
      {rejectingItem && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-60 animate-fade-in"
          onClick={() => setRejectingItem(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Reject Approval Request</h3>
                <p className="text-xs text-slate-500 line-clamp-1">{rejectingItem.title}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Please specify the reason for rejection or instructions for required revisions:
            </p>

            <textarea
              rows={3}
              placeholder="e.g. Budget justification incomplete, please update and resubmit."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full text-xs p-3 border border-slate-200 rounded-xl outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 mb-4 bg-slate-50 focus:bg-white transition"
            />

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setRejectingItem(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                {actionLoading ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          7. TOAST NOTIFICATION BANNER
      ===================================================== */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2 z-70 animate-bounce-short">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
