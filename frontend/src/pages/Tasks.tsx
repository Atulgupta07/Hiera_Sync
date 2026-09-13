import { useAuth } from "../contexts/AuthContext";
import HODDashboard from "../components/tasks/HODDashboard";
import TeacherDashboard from "../components/tasks/TeacherDashboard";

export default function Tasks() {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === 'ADMIN' || user.role === 'HOD') {
    return <HODDashboard />;
  }

  return <TeacherDashboard />;
}