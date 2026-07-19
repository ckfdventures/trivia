import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChartBar, DownloadSimple } from "@phosphor-icons/react";
import { api, API, getAuthToken } from "../../lib/api";

export default function Reports() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/sessions/mine");
        setSessions(data);
      } catch (e) {
        setErr(e?.response?.data?.detail || "Could not load sessions");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const downloadReport = async (id, pin) => {
    const token = getAuthToken();
    const url = `${API}/sessions/${id}/report`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `session-${pin}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="text-xs uppercase tracking-widest font-black text-indigo-500">Dashboard</div>
      <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-1">Reports</h1>

      {loading && <div className="mt-8 text-indigo-950/70 font-semibold">Loading…</div>}
      {err && <div className="mt-8 text-red-600 font-bold">{err}</div>}

      {!loading && sessions.length === 0 && (
        <div
          className="mt-8 rounded-3xl border-2 border-dashed border-indigo-200 p-12 text-center bg-white"
          data-testid="reports-empty"
        >
          <div className="mx-auto h-16 w-16 rounded-2xl bg-orange-100 grid place-items-center">
            <ChartBar size={28} weight="fill" className="text-orange-500" />
          </div>
          <h3 className="font-display font-black text-2xl text-indigo-950 mt-4">No sessions yet</h3>
          <p className="text-indigo-950/60 font-semibold mt-2">
            Host a live game to start collecting analytics.
          </p>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <ul className="mt-8 space-y-3" data-testid="reports-list">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="bg-white rounded-2xl p-5 flex flex-wrap items-center gap-4 card-lift"
              data-testid={`reports-row-${s.id}`}
            >
              <button
                onClick={() => navigate(`/dashboard/reports/${s.id}`)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="font-display font-black text-xl text-indigo-950 truncate">
                  {s.quiz_title}
                </div>
                <div className="text-xs font-semibold text-indigo-950/60 mt-1">
                  PIN {s.pin} · {new Date(s.ended_at).toLocaleString()}
                </div>
              </button>
              <div className="grid grid-cols-3 gap-6 text-center">
                <Stat label="Players" value={s.total_players} />
                <Stat label="Questions" value={s.question_count} />
                <Stat label="Avg time" value={`${(s.avg_response_time || 0).toFixed(1)}s`} />
              </div>
              <button
                onClick={() => downloadReport(s.id, s.pin)}
                data-testid={`reports-download-${s.id}`}
                className="rounded-full bg-indigo-950 hover:bg-indigo-900 text-white font-bold h-11 px-5 inline-flex items-center gap-2"
              >
                <DownloadSimple size={16} weight="bold" /> CSV
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-xs font-black uppercase tracking-widest text-indigo-500">{label}</div>
      <div className="font-display font-black text-xl text-indigo-950">{value}</div>
    </div>
  );
}
