import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Principal } from "../types";

export function ProtectedRoute({ roles }: { roles?: Principal[] }) {
  const { user, token } = useAuth();
  const location = useLocation();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    // Send them to the home their role can actually see.
    return <Navigate to={user.role === "AGENT" ? "/portal" : "/"} replace />;
  }
  // A default/reset password locks the account into the change-password flow until cleared —
  // enforced here so it applies no matter which route the user tries to reach.
  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}
