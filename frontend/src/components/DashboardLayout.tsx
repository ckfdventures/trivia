"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavigate } from "../lib/navigation";
import { Tag, SignOut, UploadSimple } from "@phosphor-icons/react";
import { Logo } from "./Logo";
import { useAuth } from "../lib/auth";

const items = [
  { to: "/admin/themes", label: "Themes", icon: Tag, testId: "nav-themes" },
  { to: "/admin/upload", label: "Upload questions", icon: UploadSimple, testId: "nav-upload" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = usePathname();

  const onLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#F7F5FE] text-indigo-950">
      {/* Phones and small tablets: a compact top bar replaces the sidebar. */}
      <header className="md:hidden sticky top-0 z-40 bg-indigo-950 text-white px-4 pt-4 pb-3" data-testid="admin-mobile-nav">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Logo inverse />
            <span className="text-xs font-black uppercase tracking-widest text-orange-300">Admin</span>
          </div>
          <button
            onClick={onLogout}
            aria-label="Logout"
            data-testid="nav-logout-mobile"
            className="h-10 w-10 shrink-0 rounded-full grid place-items-center text-white/80 hover:bg-white/10"
          >
            <SignOut size={18} weight="bold" />
          </button>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto">
          {items.map((it) => (
            <Link
              key={it.to}
              href={it.to}
              data-testid={`${it.testId}-mobile`}
              aria-current={pathname === it.to ? "page" : undefined}
              className={
                "shrink-0 inline-flex items-center gap-2 rounded-full px-4 h-10 font-bold text-sm " +
                (pathname === it.to ? "bg-white/10 text-orange-300" : "text-white/80 hover:bg-white/5")
              }
            >
              <it.icon size={16} weight="bold" />
              <span>{it.label}</span>
            </Link>
          ))}
        </nav>
      </header>
      <div className="md:flex md:min-h-screen">
        <aside className="hidden md:flex w-64 shrink-0 bg-indigo-950 text-white sticky top-0 h-screen flex-col">
          <div className="p-6">
            <Logo inverse />
            <div className="mt-2 text-xs font-black uppercase tracking-widest text-orange-300">Admin</div>
          </div>
          <nav className="mt-2 px-3 flex-1">
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={it.to}>
                  <Link
                    href={it.to}
                    data-testid={it.testId}
                    aria-current={pathname === it.to ? "page" : undefined}
                    className={
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-sm " +
                      (pathname === it.to ? "bg-white/10 text-orange-300 border-l-4 border-orange-300 pl-2" : "text-white/80 hover:bg-white/5")
                    }
                  >
                    <it.icon size={18} weight="bold" />
                    <span>{it.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="p-3 border-t border-white/10">
            <div className="px-3 py-3 text-xs text-white/60 font-semibold truncate">
              {user ? user.email : null}
            </div>
            <button
              onClick={onLogout}
              data-testid="nav-logout"
              className="w-full inline-flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-sm text-white/80 hover:bg-white/5"
            >
              <SignOut size={18} weight="bold" /> Logout
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0">
          <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
