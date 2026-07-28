import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest, type AuthSession, type AuthUser } from "./api";

type AuthStatus = "loading" | "ready";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
};

const STORAGE_KEY = "ai-photo-studio-web-auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type StoredSession = Pick<AuthSession, "token" | "refreshToken" | "user">;

const readStoredSession = (): StoredSession | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

const writeStoredSession = (session: StoredSession | null) => {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

const toStoredSession = (session: AuthSession): StoredSession => ({
  token: session.token,
  refreshToken: session.refreshToken,
  user: session.user
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persist = (session: AuthSession | null) => {
    if (!session) {
      writeStoredSession(null);
      setUser(null);
      setToken(null);
      setRefreshToken(null);
      return;
    }

    writeStoredSession(toStoredSession(session));
    setUser(session.user);
    setToken(session.token);
    setRefreshToken(session.refreshToken);
  };

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const stored = readStoredSession();
      if (!stored) {
        if (!cancelled) setStatus("ready");
        return;
      }

      try {
        const currentUser = await apiRequest<AuthUser>("/api/auth/me", {}, stored.token);
        if (cancelled) return;
        persist({ ...stored, user: currentUser });
        setStatus("ready");
        return;
      } catch {
        if (!stored.refreshToken) {
          persist(null);
          if (!cancelled) setStatus("ready");
          return;
        }

        try {
          const refreshed = await apiRequest<Omit<AuthSession, "user">>("/api/auth/refresh", {
            method: "POST",
            body: JSON.stringify({ refreshToken: stored.refreshToken })
          });
          if (cancelled) return;
          const currentUser = await apiRequest<AuthUser>("/api/auth/me", {}, refreshed.token);
          persist({ ...refreshed, user: currentUser });
        } catch {
          persist(null);
        } finally {
          if (!cancelled) setStatus("ready");
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = (session: AuthSession) => {
    persist(session);
    setError(null);
  };

  const login = async (email: string, password: string) => {
    const session = await apiRequest<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setSession(session);
    return session.user;
  };

  const register = async (name: string, email: string, password: string) => {
    const session = await apiRequest<AuthSession>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    });
    setSession(session);
    return session.user;
  };

  const logout = () => {
    persist(null);
  };

  const refreshSession = async () => {
    const stored = readStoredSession();
    if (!stored?.refreshToken) return false;

    try {
      const refreshed = await apiRequest<Omit<AuthSession, "user">>("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: stored.refreshToken })
      });
      const currentUser = await apiRequest<AuthUser>("/api/auth/me", {}, refreshed.token);
      persist({ ...refreshed, user: currentUser });
      return true;
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh session");
      persist(null);
      return false;
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      refreshToken,
      error,
      login,
      register,
      logout,
      refreshSession
    }),
    [error, login, logout, refreshSession, register, refreshToken, status, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
