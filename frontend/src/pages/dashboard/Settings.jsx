import React, { useEffect, useState } from "react";
import { Gear } from "@phosphor-icons/react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function Settings() {
  const { user } = useAuth();
  const [retention, setRetention] = useState(30);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/settings");
        setRetention(data.retention_days || 30);
      } catch (e) {
        /* ignore */
      }
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings", { retention_days: retention });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="text-xs uppercase tracking-widest font-black text-indigo-500">Dashboard</div>
      <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-1">Settings</h1>

      <div className="mt-8 bg-white rounded-3xl p-6 card-lift">
        <div className="flex items-center gap-3 text-orange-500 uppercase tracking-widest text-xs font-black">
          <Gear size={14} weight="fill" /> Account
        </div>
        <div className="mt-3 text-indigo-950 font-bold">{user?.email}</div>
        <div className="text-indigo-950/60 text-sm font-semibold">Role: {user?.role || "host"}</div>
      </div>

      <div className="mt-6 bg-white rounded-3xl p-6 card-lift">
        <div className="text-orange-500 uppercase tracking-widest text-xs font-black">
          Data retention
        </div>
        <h3 className="font-display font-black text-2xl text-indigo-950 mt-2">
          Purge session reports after
        </h3>
        <p className="text-indigo-950/60 font-semibold mt-2">
          Older session summaries get automatically deleted. Choose 1–365 days.
        </p>

        <div className="mt-5 flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={365}
            value={retention}
            onChange={(e) => setRetention(parseInt(e.target.value, 10))}
            data-testid="settings-retention-slider"
            className="flex-1 accent-orange-400"
          />
          <div className="w-24 text-right">
            <span className="font-display font-black text-2xl text-indigo-950" data-testid="settings-retention-value">
              {retention}
            </span>
            <span className="text-indigo-950/60 font-bold text-sm ml-1">days</span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            data-testid="settings-save-btn"
            className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-6 h-12"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {saved && (
            <span className="text-green-700 font-bold text-sm" data-testid="settings-saved">
              Saved ✓
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
