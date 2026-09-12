import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { isAdminOrAbove } from "../utils/roles";
import PlaceholderPage from "./PlaceholderPage";

export default function AdminOnlyRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isAdminOrAbove(user?.role)) {
    return <PlaceholderPage title="Admins only" />;
  }
  return <>{children}</>;
}
