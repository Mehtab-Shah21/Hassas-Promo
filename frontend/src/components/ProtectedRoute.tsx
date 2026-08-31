import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LockScreen from "../features/auth/LockScreen";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, locked } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-bg text-muted">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (locked) {
    return <LockScreen />;
  }
  return <>{children}</>;
}
