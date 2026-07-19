import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Play, Trash, GameController } from "@phosphor-icons/react";
import { api, createRoom } from "../../lib/api";

export default function MyGames() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/quizzes/mine");
      setQuizzes(data);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Could not load your games");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const launch = async (quizId) => {
    const room = await createRoom(quizId);
    const hostSession = {
      pin: room.pin,
      host_token: room.host_token,
      host_id: room.host_id,
      quiz_title: room.room.quiz_title,
    };
    localStorage.setItem(`ts_host_${room.pin}`, JSON.stringify(hostSession));
    navigate(`/host/lobby/${room.pin}`);
  };

  const del = async (id) => {
    if (!confirm("Delete this quiz?")) return;
    await api.delete(`/quizzes/${id}`);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest font-black text-indigo-500">
            Dashboard
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-1">
            My Games
          </h1>
        </div>
        <button
          onClick={() => navigate("/host/create")}
          data-testid="mygames-new-quiz"
          className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-lg px-6 h-12 inline-flex items-center gap-2"
        >
          <Plus size={20} weight="bold" /> New quiz
        </button>
      </div>

      {loading && <div className="mt-8 text-indigo-950/70 font-semibold">Loading…</div>}
      {err && <div className="mt-8 text-red-600 font-bold">{err}</div>}

      {!loading && quizzes.length === 0 && (
        <div
          className="mt-8 rounded-3xl border-2 border-dashed border-indigo-200 p-12 text-center bg-white"
          data-testid="mygames-empty"
        >
          <div className="mx-auto h-16 w-16 rounded-2xl bg-orange-100 grid place-items-center">
            <GameController size={28} weight="fill" className="text-orange-500" />
          </div>
          <h3 className="font-display font-black text-2xl text-indigo-950 mt-4">No quizzes yet</h3>
          <p className="text-indigo-950/60 font-semibold mt-2">
            Create your first quiz to start hosting live rooms.
          </p>
          <button
            onClick={() => navigate("/host/create")}
            className="btn-arcade mt-6 rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-6 h-12 inline-flex items-center gap-2"
          >
            <Plus size={18} weight="bold" /> Build a quiz
          </button>
        </div>
      )}

      {!loading && quizzes.length > 0 && (
        <ul className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="mygames-list">
          {quizzes.map((q) => (
            <li
              key={q.id}
              className="bg-white rounded-3xl p-5 card-lift flex flex-col"
              data-testid={`mygames-card-${q.id}`}
            >
              <div className="text-xs font-black uppercase tracking-widest text-orange-500">
                {q.questions?.length || 0} questions
              </div>
              <h3 className="font-display font-black text-2xl text-indigo-950 mt-1 truncate">
                {q.title}
              </h3>
              <div className="text-indigo-950/60 text-xs font-semibold mt-1">
                Created {new Date(q.created_at).toLocaleDateString()}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => launch(q.id)}
                  data-testid={`mygames-launch-${q.id}`}
                  className="flex-1 rounded-full bg-indigo-950 hover:bg-indigo-900 text-white font-bold px-4 h-11 inline-flex items-center justify-center gap-2"
                >
                  <Play size={16} weight="fill" /> Host game
                </button>
                <button
                  onClick={() => del(q.id)}
                  data-testid={`mygames-delete-${q.id}`}
                  className="rounded-full bg-red-50 hover:bg-red-100 text-red-600 font-bold h-11 w-11 grid place-items-center"
                  aria-label="Delete quiz"
                >
                  <Trash size={16} weight="bold" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
