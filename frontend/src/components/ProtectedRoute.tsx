"use client";

import React, { useEffect } from "react";
import { useNavigate } from "../lib/navigation";
import { useAuth } from "../lib/auth";

/** Admin-only area: anyone else is sent to the admin sign-in page. */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = !!user && user.role === "admin";

  useEffect(() => {
    if (!loading && !allowed) navigate("/admin/login", { replace: true });
  }, [loading, allowed, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F7F5FE]">
        <div className="text-indigo-950 font-bold" data-testid="auth-loading">Checking your session…</div>
      </div>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}
