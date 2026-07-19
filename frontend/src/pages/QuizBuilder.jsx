import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash, ArrowLeft, Rocket, Check, Warning } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { AnswerShape, ANSWER_META } from "../components/AnswerShape";
import { createQuiz, createRoom } from "../lib/api";

const blankQuestion = () => ({
  text: "",
  options: ["", "", "", ""],
  correct_index: 0,
  time_limit: 20,
});

export default function QuizBuilder() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([blankQuestion()]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const active = questions[activeIdx];

  const isQuestionComplete = (q) =>
    q.text.trim() && q.options.every((o) => o.trim()) && q.correct_index >= 0;

  const canCreate = useMemo(() => {
    return title.trim().length > 0 && questions.length > 0 && questions.every(isQuestionComplete);
  }, [title, questions]);

  const updateActive = (patch) => {
    setQuestions((prev) => {
      const next = [...prev];
      next[activeIdx] = { ...next[activeIdx], ...patch };
      return next;
    });
  };

  const updateOption = (idx, value) => {
    setQuestions((prev) => {
      const next = [...prev];
      const opts = [...next[activeIdx].options];
      opts[idx] = value;
      next[activeIdx] = { ...next[activeIdx], options: opts };
      return next;
    });
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, blankQuestion()]);
    setActiveIdx(questions.length);
  };

  const deleteQuestion = (idx) => {
    if (questions.length === 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((cur) => (cur >= idx ? Math.max(0, cur - 1) : cur));
  };

  const onCreateGame = async () => {
    setError("");
    if (!canCreate) {
      setError("Fill in all questions & options before creating a game");
      return;
    }
    setSubmitting(true);
    try {
      const quiz = await createQuiz({ title: title.trim(), questions });
      const room = await createRoom(quiz.id);
      // Persist host session
      const hostSession = {
        pin: room.pin,
        host_token: room.host_token,
        host_id: room.host_id,
        quiz_title: quiz.title,
      };
      localStorage.setItem(`ts_host_${room.pin}`, JSON.stringify(hostSession));
      navigate(`/host/lobby/${room.pin}`);
    } catch (e) {
      setError(e?.response?.data?.detail || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7FF]">
      <header className="max-w-7xl mx-auto px-6 md:px-10 py-6 flex items-center justify-between">
        <Logo />
        <button
          onClick={() => navigate("/")}
          data-testid="builder-back-btn"
          className="rounded-full border-2 border-indigo-950/10 hover:border-indigo-950/40 text-indigo-950 font-bold px-5 h-11 inline-flex items-center gap-2"
        >
          <ArrowLeft size={18} weight="bold" /> Back
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-10 pb-24">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest font-black text-indigo-500">
            Step 1 of 2
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-2">
            Build your quiz
          </h1>
        </div>

        {/* Title */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 card-lift">
          <label className="text-xs uppercase tracking-widest font-black text-indigo-500">
            Quiz title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Friday Night Trivia"
            data-testid="quiz-title-input"
            className="mt-2 w-full text-2xl sm:text-3xl font-display font-black text-indigo-950 bg-transparent focus:outline-none placeholder:text-indigo-200"
          />
        </div>

        <div className="mt-6 grid lg:grid-cols-12 gap-6">
          {/* Left rail: question list */}
          <aside className="lg:col-span-4">
            <div className="bg-white rounded-3xl p-4 card-lift">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="text-xs uppercase tracking-widest font-black text-indigo-500">
                  Questions
                </div>
                <div className="text-xs font-bold text-indigo-950/60">
                  {questions.length} total
                </div>
              </div>
              <ul className="space-y-2 mt-1" data-testid="question-list">
                {questions.map((q, i) => {
                  const complete = isQuestionComplete(q);
                  const isActive = i === activeIdx;
                  return (
                    <li key={i}>
                      <button
                        onClick={() => setActiveIdx(i)}
                        data-testid={`question-item-${i}`}
                        className={
                          "w-full text-left rounded-2xl px-4 py-3 flex items-start gap-3 border-2 " +
                          (isActive
                            ? "bg-indigo-950 text-white border-indigo-950"
                            : "bg-indigo-50/60 border-transparent hover:border-indigo-200")
                        }
                      >
                        <div
                          className={
                            "h-8 w-8 rounded-lg grid place-items-center font-black shrink-0 " +
                            (isActive ? "bg-orange-300 text-indigo-950" : "bg-white text-indigo-950")
                          }
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={"text-sm font-bold truncate " + (isActive ? "text-white" : "text-indigo-950")}>
                            {q.text.trim() || "Untitled question"}
                          </div>
                          <div className={"text-xs font-semibold mt-0.5 flex items-center gap-1 " + (isActive ? "text-purple-200" : "text-indigo-950/60")}>
                            {complete ? (
                              <>
                                <Check size={12} weight="bold" /> Ready
                              </>
                            ) : (
                              <>
                                <Warning size={12} weight="bold" /> Incomplete
                              </>
                            )}
                          </div>
                        </div>
                        {questions.length > 1 && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteQuestion(i);
                            }}
                            data-testid={`question-delete-${i}`}
                            className={
                              "opacity-70 hover:opacity-100 " +
                              (isActive ? "text-purple-200" : "text-indigo-950/60")
                            }
                          >
                            <Trash size={16} weight="bold" />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                onClick={addQuestion}
                data-testid="add-question-btn"
                className="mt-3 w-full rounded-2xl border-2 border-dashed border-indigo-300 text-indigo-950 hover:bg-indigo-50 font-bold h-12 inline-flex items-center justify-center gap-2"
              >
                <Plus size={18} weight="bold" /> Add question
              </button>
            </div>
          </aside>

          {/* Right: editor */}
          <section className="lg:col-span-8">
            <div className="bg-white rounded-3xl p-6 sm:p-10 card-lift">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-widest font-black text-indigo-500">
                  Question {activeIdx + 1}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-indigo-950/70">Time limit</label>
                  <select
                    value={active.time_limit}
                    onChange={(e) => updateActive({ time_limit: parseInt(e.target.value, 10) })}
                    data-testid="question-time-limit"
                    className="rounded-full border-2 border-indigo-200 bg-white px-3 py-1 text-sm font-bold text-indigo-950"
                  >
                    {[10, 15, 20, 30, 45, 60].map((s) => (
                      <option key={s} value={s}>
                        {s}s
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                value={active.text}
                onChange={(e) => updateActive({ text: e.target.value })}
                placeholder="What is the capital of France?"
                data-testid="question-text-input"
                rows={3}
                className="mt-3 w-full text-2xl sm:text-3xl font-display font-black text-indigo-950 bg-transparent focus:outline-none placeholder:text-indigo-200 resize-none"
              />

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {active.options.map((opt, i) => {
                  const meta = ANSWER_META[i];
                  const isCorrect = active.correct_index === i;
                  return (
                    <div
                      key={i}
                      className={
                        "rounded-2xl p-4 flex items-center gap-3 border-2 transition-colors " +
                        (isCorrect
                          ? "border-green-500 bg-green-50"
                          : "border-indigo-100 bg-indigo-50/40 hover:border-indigo-200")
                      }
                    >
                      <div className={`h-12 w-12 rounded-xl grid place-items-center ${meta.bg}`}>
                        <AnswerShape index={i} size={24} />
                      </div>
                      <input
                        value={opt}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Answer ${i + 1}`}
                        data-testid={`option-input-${i}`}
                        className="flex-1 min-w-0 bg-transparent focus:outline-none text-indigo-950 font-bold text-lg placeholder:text-indigo-950/30"
                      />
                      <button
                        onClick={() => updateActive({ correct_index: i })}
                        data-testid={`option-correct-${i}`}
                        className={
                          "shrink-0 h-10 w-10 rounded-full grid place-items-center border-2 " +
                          (isCorrect
                            ? "bg-green-500 text-white border-green-500"
                            : "bg-white text-indigo-950/40 border-indigo-200 hover:border-green-500 hover:text-green-500")
                        }
                        title="Mark as correct answer"
                      >
                        <Check size={18} weight="bold" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 text-xs font-semibold text-indigo-950/60">
                Click the check ✓ on the right of an option to mark it as the correct answer.
              </div>
            </div>

            {/* Sticky action bar */}
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div className="text-sm font-bold text-indigo-950/70">
                {canCreate ? (
                  <span className="inline-flex items-center gap-2 text-green-700">
                    <Check size={16} weight="bold" /> Ready to launch
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-orange-700">
                    <Warning size={16} weight="bold" /> Complete every question to continue
                  </span>
                )}
              </div>
              <button
                onClick={onCreateGame}
                disabled={!canCreate || submitting}
                data-testid="create-game-btn"
                className={
                  "btn-arcade rounded-full font-black text-lg px-8 h-14 inline-flex items-center gap-3 " +
                  (canCreate
                    ? "bg-orange-300 hover:bg-orange-400 text-indigo-950 cursor-pointer"
                    : "bg-indigo-100 text-indigo-950/40 cursor-not-allowed")
                }
              >
                <Rocket size={20} weight="fill" /> {submitting ? "Creating…" : "Create game"}
              </button>
            </div>
            {error && (
              <div
                className="mt-3 text-sm font-bold text-red-600"
                data-testid="builder-error"
              >
                {error}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
