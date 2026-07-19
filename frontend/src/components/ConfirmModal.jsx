import React from "react";

export function ConfirmModal({ open, title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, tone = "danger", testId = "confirm-modal" }) {
  if (!open) return null;
  const confirmClass =
    tone === "danger"
      ? "bg-red-500 hover:bg-red-600 text-white"
      : "bg-orange-300 hover:bg-orange-400 text-indigo-950";
  return (
    <div
      className="fixed inset-0 z-50 bg-indigo-950/70 backdrop-blur-sm flex items-center justify-center p-6"
      data-testid={testId}
    >
      <div className="max-w-md w-full bg-white rounded-3xl p-8 card-lift">
        <h3 className="font-display font-black text-3xl text-indigo-950">{title}</h3>
        {body && <p className="text-indigo-950/70 font-semibold mt-3">{body}</p>}
        <div className="mt-8 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            data-testid={`${testId}-cancel`}
            className="rounded-full border-2 border-indigo-200 hover:bg-indigo-50 font-bold px-5 h-12 text-indigo-950"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            data-testid={`${testId}-confirm`}
            className={`btn-arcade rounded-full font-black px-6 h-12 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
