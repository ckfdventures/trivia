"use client";

import { SessionExpiredModal } from "@/components/SessionExpiredModal";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SessionExpiredModal />
      {children}
    </AuthProvider>
  );
}
