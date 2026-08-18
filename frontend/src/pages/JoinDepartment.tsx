import { useState, useEffect } from "react";
import { joinApi, JoinRequestResponse } from "../api/join";
import { useAuth } from "../contexts/AuthContext";
import { Building2, Send, Clock, CheckCircle, XCircle } from "lucide-react";

export default function JoinDepartment() {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<JoinRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = async () => {
    try {
      const res = await joinApi.getStatus();
      setStatus(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("Please enter a valid code.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await joinApi.submitRequest({ code: code.trim() });
      setStatus(res);
      setCode("");
    } catch (err: any) {
      setError(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }

  // The ProtectedRoute handles access control. If they are here, they need to submit a join request or wait for approval.
  return (
    <div className="p-8 max-w-2xl mx-auto mt-10">
      <div className="bg-white rounded-3xl shadow-lg p-8">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
            <Building2 size={32} />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">Join Department</h1>
        <p className="text-center text-gray-500 mb-8">
          Enter the unique invitation code provided by your Head of Department.
        </p>

        {status && (
          <div className={`p-6 rounded-2xl mb-8 border ${
            status.status === 'Pending' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
            status.status === 'Approved' ? 'bg-green-50 border-green-200 text-green-800' :
            'bg-red-50 border-red-200 text-red-800'
          }`}>
            <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
              {status.status === 'Pending' && <Clock className="w-5 h-5" />}
              {status.status === 'Approved' && <CheckCircle className="w-5 h-5" />}
              {status.status === 'Rejected' && <XCircle className="w-5 h-5" />}
              Request {status.status}
            </h3>
            <p className="text-sm">
              You requested to join department <b>{status.department_code}</b> on {new Date(status.requested_at).toLocaleDateString()}.
            </p>
            {status.status === 'Rejected' && (
              <p className="mt-4 text-xs font-semibold">You can submit a new request if needed.</p>
            )}
          </div>
        )}

        {(!status || status.status === 'Rejected') && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Invitation Code
              </label>
              <input
                type="text"
                placeholder="e.g. AIML2026"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full border-2 border-gray-200 rounded-xl p-4 uppercase tracking-widest text-lg font-bold text-center outline-none focus:border-blue-500 transition-colors"
                maxLength={10}
              />
            </div>
            
            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
              <Send size={18} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
