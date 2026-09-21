"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "./api";
import type { User } from "./types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  requestLoginCode: (email: string) => Promise<void>;
  loginWithCode: (email: string, code: string) => Promise<User>;
  requestSignup: (payload: {
    name: string;
    email: string;
    password: string;
    role?: "USER" | "MERCHANT";
  }) => Promise<void>;
  verifySignup: (email: string, code: string) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("sd_token");
    if (!stored) {
      setLoading(false);
      return;
    }
    setToken(stored);
    api<User>("/auth/me", { token: stored })
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("sd_token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((nextUser: User, nextToken: string) => {
    localStorage.setItem("sd_token", nextToken);
    setUser(nextUser);
    setToken(nextToken);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<{ user: User; token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      persist(result.user, result.token);
      return result.user;
    },
    [persist],
  );

  const requestLoginCode = useCallback(async (email: string) => {
    await api("/auth/login-code", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }, []);

  const loginWithCode = useCallback(
    async (email: string, code: string) => {
      const result = await api<{ user: User; token: string }>(
        "/auth/login-code/verify",
        {
          method: "POST",
          body: JSON.stringify({ email, code }),
        },
      );
      persist(result.user, result.token);
      return result.user;
    },
    [persist],
  );

  const requestSignup = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      role?: "USER" | "MERCHANT";
    }) => {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    [],
  );

  const verifySignup = useCallback(
    async (email: string, code: string) => {
      const result = await api<{ user: User; token: string }>(
        "/auth/register/verify",
        {
          method: "POST",
          body: JSON.stringify({ email, code }),
        },
      );
      persist(result.user, result.token);
      return result.user;
    },
    [persist],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("sd_token");
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      requestLoginCode,
      loginWithCode,
      requestSignup,
      verifySignup,
      logout,
    }),
    [
      user,
      token,
      loading,
      login,
      requestLoginCode,
      loginWithCode,
      requestSignup,
      verifySignup,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
