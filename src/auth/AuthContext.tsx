import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../api/client";
import type { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  staffLogin: (email: string, password: string) => Promise<void>;
  agentLogin: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches the current profile (role/modules/mustChangePassword) and updates local state. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(readStoredUser());

  const persist = (nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  };

  const refreshUser = async () => {
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) return;
    const { data } = await api.get<AuthUser>("/auth/me");
    setUser(data);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
  };

  // On load with an existing token, refresh the profile so live permission/role changes
  // (made by an admin) take effect without the user re-logging in.
  useEffect(() => {
    if (!token) return;
    refreshUser().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const staffLogin = async (email: string, password: string) => {
    const { data } = await api.post("/auth/staff/login", { email, password });
    persist(data.token, data.user);
  };

  const agentLogin = async (email: string, password: string) => {
    const { data } = await api.post("/auth/agent/login", { email, password });
    persist(data.token, data.user);
  };

  const clearLocal = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  const logout = async () => {
    try {
      // Revokes the session server-side so the token can't be reused before it expires.
      await api.post("/auth/logout");
    } catch {
      // Even if the revoke call fails (e.g. offline), still clear the local session.
    } finally {
      clearLocal();
    }
  };

  const value = useMemo(
    () => ({ user, token, staffLogin, agentLogin, logout, refreshUser }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
