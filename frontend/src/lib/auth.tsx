"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, formatApiError, getAuthToken, setAuthToken, setSessionExpiredHandler } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  /** null = unknown/loading, false = logged out, object = logged in */
  user: User | false | null;
  loading: boolean;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  sessionExpired: boolean;
  dismissSessionExpired(): void;
  formatApiError: typeof formatApiError;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | false | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const doLogout = useCallback(() => {
    setAuthToken(null);
    setUser(false);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (getAuthToken()) {
        setSessionExpired(true);
        setAuthToken(null);
        setUser(false);
      }
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const token = getAuthToken();
      if (!token) {
        setUser(false);
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get<User>("/auth/me");
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) setUser(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
    setAuthToken(data.token);
    setUser(data.user);
    setSessionExpired(false);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    doLogout();
  };

  const dismissSessionExpired = () => setSessionExpired(false);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, sessionExpired, dismissSessionExpired, formatApiError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
