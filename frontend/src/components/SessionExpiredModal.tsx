"use client";

import React from "react";
import { useNavigate } from "../lib/navigation";
import { useAuth } from "../lib/auth";

export function SessionExpiredModal() {
  const { sessionExpired, dismissSessionExpired } = useAuth();
  const navigate = useNavigate();
  if (!sessionExpired) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-indigo-950/70 backdrop-blur-sm flex items-center justify-center p-6"
      data-testid="session-expired-modal"
    >
      <div className="max-w-md w-full bg-white rounded-3xl p-8 card-lift">
        <h3 className="font-display font-black text-3xl text-indigo-950">Session expired</h3>
        <p className="text-indigo-950/70 font-semibold mt-3">
          For your security you&apos;ve been signed out of the admin dashboard. Live games are unaffected.
        </p>
        <div className="mt-8 flex gap-3 justify-end">
          <button
            onClick={dismissSessionExpired}
            className="rounded-full border-2 border-indigo-200 hover:bg-indigo-50 font-bold px-5 h-12"
            data-testid="session-expired-dismiss"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              dismissSessionExpired();
              navigate("/admin/login");
            }}
            data-testid="session-expired-login"
            className="btn-arcade rounded-full bg-indigo-950 text-white hover:bg-indigo-900 font-black px-6 h-12"
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  );
}
