import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, DownloadSimple, Trophy } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api, API, getAuthToken } from "../../lib/api";

export default function ReportDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/sessions/${sessionId}`);
        setSession(data);
      } catch (e) {
        setErr(e?.response?.data?.detail || "Could not load session");
      }
    })();
  }, [sessionId]);

  const download = async () => {
    if (!session) return;
    const token = getAuthToken();
    const res = await fetch(`${API}/sessions/${sessionId}/report`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `session-${session.pin}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (err) return <div className="text-red-600 font-bold">{err}</div>;
  if (!session) return <div className="text-indigo-950/70 font-semibold">Loading…</div>;

  const chartData = (session.question_stats || []).map((s) => ({
    name: `Q${s.index + 1}`,
    difficulty: Math.round((1 - (s.correct_rate || 0)) * 100),
    text: s.text,
  }));

  return (
    <div>
      <button
        onClick={() => navigate("/dashboard/reports")}
        className="rounded-full border-2 border-indigo-200 hover:bg-indigo-50 text-indigo-950 font-bold px-4 h-10 inline-flex items-center gap-2"
      >
        <ArrowLeft size={16} weight="bold" /> Back to reports
      </button>

      <div className="flex flex-wrap items-end justify-between mt-6 gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest font-black text-indigo-500">
            Session summary · PIN {session.pin}
          </div>
          <h1 className="font-display text-4xl font-black text-indigo-950 mt-1">
            {session.quiz_title}
          </h1>
          <div className="text-indigo-950/60 text-sm font-semibold mt-1">
            Ended {new Date(session.ended_at).toLocaleString()}
          </div>
        </div>
        <button
          onClick={download}
          data-testid="report-download-btn"
          className="btn-arcade rounded-full bg-indigo-950 text-white hover:bg-indigo-900 font-black px-6 h-12 inline-flex items-center gap-2"
        >
          <DownloadSimple size={18} weight="bold" /> Download report
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="report-stats">
        <Stat label="Players" value={session.total_players} />
        <Stat label="Questions" value={session.question_count} />
        <Stat label="Avg response" value={`${(session.avg_response_time || 0).toFixed(1)}s`} />
        <Stat label="Reconnects" value={session.reconnects || 0} />
      </div>

      <div className="mt-8 bg-white rounded-3xl p-6 card-lift" data-testid="report-hardest-chart">
        <div className="text-xs font-black uppercase tracking-widest text-indigo-500">
          Hardest questions
        </div>
        <div className="text-indigo-950/70 text-sm font-semibold mb-4">
          % of players who got each question wrong.
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDE9FE" />
              <XAxis dataKey="name" stroke="#4C1D95" fontWeight={800} />
              <YAxis stroke="#4C1D95" fontWeight={800} domain={[0, 100]} />
              <Tooltip
                cursor={{ fill: "#FDE68A", opacity: 0.3 }}
                contentStyle={{ borderRadius: 12, borderColor: "#DDD6FE" }}
                formatter={(v) => [`${v}% wrong`, "Difficulty"]}
                labelFormatter={(l, p) => (p?.[0]?.payload?.text ? p[0].payload.text : l)}
              />
              <Bar dataKey="difficulty" fill="#4C1D95" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-8 bg-white rounded-3xl p-6 card-lift" data-testid="report-leaderboard">
        <div className="text-xs font-black uppercase tracking-widest text-orange-500 flex items-center gap-2">
          <Trophy size={14} weight="fill" /> Final leaderboard
        </div>
        <ul className="mt-4 space-y-1">
          {(session.leaderboard || []).map((row) => (
            <li key={row.player_id} className="flex items-center gap-4 py-2 border-b border-indigo-50 last:border-0">
              <div className="font-display font-black text-lg w-8 text-indigo-950">{row.rank}</div>
              <div className="flex-1 font-bold text-indigo-950 truncate">{row.nickname}</div>
              <div className="font-display font-black text-lg text-indigo-950">{row.points}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-2xl p-4 card-lift">
      <div className="text-xs font-black uppercase tracking-widest text-indigo-500">{label}</div>
      <div className="font-display font-black text-2xl text-indigo-950 mt-1">{value}</div>
    </div>
  );
}
