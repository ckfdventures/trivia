import React from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  SquaresFour,
  ChartBar,
  Compass,
  Storefront,
  Gear,
  SignOut,
  UploadSimple,
} from "@phosphor-icons/react";
import { Logo } from "./Logo";
import { useAuth } from "../lib/auth";
import { SessionExpiredModal } from "./SessionExpiredModal";

const items = [
  { to: "/dashboard/games", label: "My Games", icon: SquaresFour, testId: "nav-games" },
  { to: "/dashboard/reports", label: "Reports", icon: ChartBar, testId: "nav-reports" },
  { to: "/dashboard/upload", label: "Question Bank", icon: UploadSimple, testId: "nav-upload" },
  { to: "/dashboard/discover", label: "Discover", icon: Compass, testId: "nav-discover" },
  { to: "/dashboard/marketplace", label: "Marketplace", icon: Storefront, testId: "nav-marketplace" },
  { to: "/dashboard/settings", label: "Settings", icon: Gear, testId: "nav-settings" },
];

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#F7F5FE] text-indigo-950">
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 bg-indigo-950 text-white sticky top-0 h-screen flex flex-col">
          <div className="p-6">
            <Logo inverse />
          </div>
          <nav className="mt-2 px-3 flex-1">
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    data-testid={it.testId}
                    className={({ isActive }) =>
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-sm " +
                      (isActive ? "bg-white/10 text-orange-300 border-l-4 border-orange-300 pl-2" : "text-white/80 hover:bg-white/5")
                    }
                  >
                    <it.icon size={18} weight="bold" />
                    <span>{it.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="p-3 border-t border-white/10">
            <div className="px-3 py-3 text-xs text-white/60 font-semibold truncate">
              {user?.email}
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
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
