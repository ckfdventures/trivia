import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadSimple, FileText, Check, Warning, ArrowRight } from "@phosphor-icons/react";
import { api } from "../../lib/api";

export default function QuestionBank() {
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // {valid_rows, errors, total_rows, valid_count, error_count}
  const [title, setTitle] = useState("");
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState("");

  const onFile = async (file) => {
    setResult(null);
    setImportErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/question-bank/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setImportErr(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const onImport = async () => {
    if (!result?.valid_rows?.length) return;
    if (!title.trim()) {
      setImportErr("Give the quiz a title");
      return;
    }
    setImporting(true);
    setImportErr("");
    try {
      const { data } = await api.post("/question-bank/import", {
        title: title.trim(),
        questions: result.valid_rows,
      });
      navigate(`/dashboard/games`);
      // eslint-disable-next-line no-unused-expressions
      data;
    } catch (e) {
      setImportErr(e?.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="text-xs uppercase tracking-widest font-black text-indigo-500">Dashboard</div>
      <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-1">
        Question Bank
      </h1>
      <p className="text-indigo-950/60 font-semibold mt-2 max-w-2xl">
        Drop a CSV or JSON to import a batch of questions. Each row needs{" "}
        <code className="bg-indigo-100 rounded px-1">text</code>,{" "}
        <code className="bg-indigo-100 rounded px-1">option1</code>–
        <code className="bg-indigo-100 rounded px-1">option4</code>, and{" "}
        <code className="bg-indigo-100 rounded px-1">correct_option</code> (1–4). Optional{" "}
        <code className="bg-indigo-100 rounded px-1">time_limit</code> (5–120s).
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        data-testid="upload-dropzone"
        className={
          "mt-8 rounded-3xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors " +
          (dragging ? "border-orange-400 bg-orange-50" : "border-indigo-200 bg-white hover:bg-indigo-50")
        }
      >
        <div className="mx-auto h-16 w-16 rounded-2xl bg-indigo-100 grid place-items-center">
          <UploadSimple size={30} weight="bold" className="text-indigo-700" />
        </div>
        <h3 className="font-display font-black text-2xl text-indigo-950 mt-4">
          Drag & drop a CSV or JSON
        </h3>
        <p className="text-indigo-950/60 font-semibold mt-1">
          or click to choose a file from your computer.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          data-testid="upload-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {uploading && (
        <div className="mt-4 text-indigo-950/70 font-bold">Validating…</div>
      )}

      {result && (
        <div className="mt-8 grid lg:grid-cols-3 gap-6" data-testid="upload-result">
          <div className="lg:col-span-1 space-y-3">
            <SummaryCard label="Rows processed" value={result.total_rows} accent="indigo" />
            <SummaryCard label="Valid" value={result.valid_count} accent="green" />
            <SummaryCard label="Errors" value={result.error_count} accent="red" />
          </div>

          <div className="lg:col-span-2 space-y-6">
            {result.errors?.length > 0 && (
              <div className="bg-white rounded-3xl p-6 card-lift" data-testid="upload-errors">
                <div className="flex items-center gap-2 text-red-600 font-black uppercase tracking-widest text-xs">
                  <Warning size={14} weight="fill" /> Failed rows
                </div>
                <ul className="mt-3 space-y-1 max-h-64 overflow-y-auto pr-2">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-sm font-semibold text-red-700">
                      • {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.valid_rows?.length > 0 && (
              <div className="bg-white rounded-3xl p-6 card-lift" data-testid="upload-valid-block">
                <div className="flex items-center gap-2 text-green-600 font-black uppercase tracking-widest text-xs">
                  <Check size={14} weight="bold" /> Valid rows
                </div>
                <ul className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-2">
                  {result.valid_rows.slice(0, 20).map((q, i) => (
                    <li key={i} className="text-sm font-semibold text-indigo-950">
                      <span className="text-indigo-500 mr-2">Q{i + 1}.</span>
                      {q.text}
                    </li>
                  ))}
                  {result.valid_rows.length > 20 && (
                    <li className="text-xs text-indigo-950/60 font-bold">
                      +{result.valid_rows.length - 20} more…
                    </li>
                  )}
                </ul>

                <div className="mt-6 grid sm:grid-cols-[1fr_auto] gap-3">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Quiz title"
                    data-testid="upload-title"
                    className="rounded-2xl border-2 border-indigo-100 bg-white text-indigo-950 text-lg font-bold px-4 h-14 focus:outline-none focus:border-orange-300"
                  />
                  <button
                    onClick={onImport}
                    disabled={importing || !result.valid_rows?.length}
                    data-testid="upload-import-btn"
                    className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-6 h-14 inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {importing ? "Importing…" : `Import ${result.valid_count} rows`} <ArrowRight size={18} weight="bold" />
                  </button>
                </div>
                {importErr && (
                  <div className="mt-3 text-red-600 font-bold text-sm" data-testid="upload-import-err">
                    {importErr}
                  </div>
                )}
              </div>
            )}

            {!result.valid_rows?.length && result.errors?.length > 0 && (
              <div className="bg-white rounded-3xl p-6 card-lift text-indigo-950/70 font-semibold flex items-center gap-3">
                <FileText size={20} weight="bold" /> No valid rows found — fix the errors above and re-upload.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  const colors = {
    indigo: "bg-white text-indigo-950",
    green: "bg-green-50 text-green-800",
    red: "bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-2xl p-5 card-lift ${colors[accent] || colors.indigo}`}>
      <div className="text-xs font-black uppercase tracking-widest opacity-70">{label}</div>
      <div className="font-display font-black text-3xl mt-1">{value}</div>
    </div>
  );
}
