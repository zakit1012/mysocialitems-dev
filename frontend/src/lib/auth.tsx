"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { api, ApiError } from "./api";
import { noteSignedIn, noteSignedOut, readSignedIn, subscribeSignedIn } from "./signed-in";
import type { User } from "./types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  /**
   * Signed in, but the server could not be reached to say so (a restart, no
   * internet). Pages wait and retry instead of sending anyone to log in.
   */
  unreachable: boolean;
  /** Tries the sign-in again now (it also retries by itself). */
  retry: () => void;
  login: (email: string, password: string) => Promise<User>;
  requestLoginCode: (email: string) => Promise<void>;
  loginWithCode: (email: string, code: string) => Promise<User>;
  requestSignup: (payload: {
    name: string;
    email: string;
    password: string;
    role?: "USER";
  }) => Promise<void>;
  verifySignup: (email: string, code: string) => Promise<User>;
  /** A fresh sign-in from the server (after a password change). */
  setSession: (user: User, token: string) => void;
  /** The same sign-in, with new profile details. */
  updateUser: (user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);

  /**
   * Swaps the stored token for a fresh one: every visit restarts the 7 days,
   * so only someone away for a week has to sign in again. Nothing stored:
   * signed out, settled in the same callback as the rest.
   */
  const check = useCallback(() => {
    const stored = localStorage.getItem("sd_token");
    const settle = stored
      ? api<{ user: User; token: string }>("/auth/refresh", { method: "POST", token: stored })
          .then((r) => {
            localStorage.setItem("sd_token", r.token);
            setToken(r.token);
            setUser(r.user);
            setUnreachable(false);
            noteSignedIn(r.user.name);
          })
          .catch((err) => {
            // Only a rejected token signs out. A server that is down for a
            // minute must not log everyone out: keep it, and try again.
            if (err instanceof ApiError && err.status === 401) {
              localStorage.removeItem("sd_token");
              setUnreachable(false);
              noteSignedOut();
            } else {
              setToken(stored);
              setUnreachable(true);
            }
          })
      : Promise.resolve().then(() => {
          setUnreachable(false);
          noteSignedOut();
        });
    return settle.finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // Unreachable: try again every ten seconds, and as soon as the internet is back.
  useEffect(() => {
    if (!unreachable) return;
    const again = () => void check();
    const timer = window.setInterval(again, 10_000);
    window.addEventListener("online", again);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", again);
    };
  }, [unreachable, check]);

  const retry = useCallback(() => void check(), [check]);

  const persist = useCallback((nextUser: User, nextToken: string) => {
    localStorage.setItem("sd_token", nextToken);
    setUser(nextUser);
    setToken(nextToken);
    setUnreachable(false);
    noteSignedIn(nextUser.name);
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
      role?: "USER";
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

  const updateUser = useCallback((next: User) => {
    setUser((current) => (current ? { ...current, ...next } : next));
    if (next.name) noteSignedIn(next.name);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("sd_token");
    setUser(null);
    setToken(null);
    setUnreachable(false);
    noteSignedOut();
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      unreachable,
      retry,
      login,
      requestLoginCode,
      loginWithCode,
      requestSignup,
      verifySignup,
      setSession: persist,
      updateUser,
      logout,
    }),
    [
      user,
      token,
      loading,
      unreachable,
      retry,
      login,
      requestLoginCode,
      loginWithCode,
      requestSignup,
      verifySignup,
      persist,
      updateUser,
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

/**
 * Whether someone is signed in, and their first name - on any host,
 * including the marketing site, which cannot see the sign-in itself (see
 * signed-in.ts). `known` is false until that can be told (on the server,
 * and while the sign-in is checked), so nobody signed in sees "Log in" first.
 */
export function useSignedIn(): { known: boolean; name: string | null } {
  const { user, loading } = useAuth();
  const noted = useSyncExternalStore<string | null | undefined>(subscribeSignedIn, readSignedIn, () => undefined);
  if (user) return { known: true, name: user.name.trim().split(/\s+/)[0] || user.name };
  if (noted === undefined) return { known: false, name: null };
  if (noted) return { known: true, name: noted };
  return { known: !loading, name: null };
}
