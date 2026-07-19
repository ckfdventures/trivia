import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthToken, getAuthToken, setSessionExpiredHandler, formatApiError } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = unknown/loading, false = logged-out, obj = logged in
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
        const { data } = await api.get("/auth/me");
        if (!cancelled) setUser(data);
      } catch (e) {
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

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setAuthToken(data.token);
    setUser(data.user);
    setSessionExpired(false);
    return data.user;
  };

  const register = async ({ email, password, name }) => {
    const { data } = await api.post("/auth/register", { email, password, name });
    setAuthToken(data.token);
    setUser(data.user);
    setSessionExpired(false);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      /* ignore */
    }
    doLogout();
  };

  const dismissSessionExpired = () => setSessionExpired(false);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, sessionExpired, dismissSessionExpired, formatApiError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
