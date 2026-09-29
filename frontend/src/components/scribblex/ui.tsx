"use client";

import React from "react";

/**
 * ScribbleX's shared controls, built to design/warm_doodle_pop/DESIGN.md.
 *
 * The system's signature is tactile "sticker" elevation: a thick ink outline and a hard
 * offset shadow with no blur, which lifts 2px on hover and collapses under the control when
 * pressed. That mechanic lives in the `.press` utility so every control here moves the same way.
 */

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const focusRing =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-coral focus-visible:ring-offset-2 focus-visible:ring-offset-sx-cream";

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_FILL: Record<ButtonVariant, string> = {
  primary: "bg-sx-coral text-sx-ink border-[2.5px] border-sx-ink shadow-sticker",
  secondary: "bg-sx-butter text-sx-ink border-[2.5px] border-sx-ink shadow-sticker",
  ghost: "bg-white text-sx-ink border-[2.5px] border-sx-ink shadow-sticker",
  danger: "bg-sx-error-container text-sx-on-error-container border-[2.5px] border-sx-ink shadow-sticker",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(
        "press inline-flex items-center justify-center gap-2 rounded-full px-sx-lg h-14",
        "font-sx-display text-sx-label-lg",
        "hover:shadow-sticker-hover active:shadow-sticker-press",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-sticker disabled:translate-y-0",
        BUTTON_FILL[variant],
        focusRing,
        className,
      )}
    />
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "mint" | "lilac" | "bubblegum" | "butter" | "cyan";
}) {
  const tones = {
    neutral: "bg-white",
    mint: "bg-sx-mint",
    lilac: "bg-sx-lilac",
    bubblegum: "bg-sx-bubblegum",
    butter: "bg-sx-butter",
    cyan: "bg-sx-cyan",
  };
  return (
    <span
      {...props}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-sx-ink",
        "px-sx-sm py-1 font-sx-display text-sx-label-md text-sx-ink",
        tones[tone],
        className,
      )}
    />
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  className,
  tinted = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tinted?: boolean }) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-sx-md border-2 border-sx-ink p-sx-md shadow-[0_4px_0_rgba(43,38,45,0.12)]",
        tinted ? "bg-sx-paper" : "bg-white",
        className,
      )}
    />
  );
}

export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-sx-sm mb-sx-sm">
      <h2 className="font-sx-display text-sx-headline-sm text-sx-ink">{children}</h2>
      {action}
    </div>
  );
}

// ── Text field ───────────────────────────────────────────────────────────────

export function TextField({
  className,
  invalid = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(
        "w-full min-h-[52px] rounded-full bg-white border-2 px-sx-md",
        "font-sx-body text-sx-body-lg text-sx-ink placeholder:text-sx-ink/45",
        "focus:outline-none focus:border-[2.5px] focus:shadow-[0_3px_0_#FF7A59]",
        invalid ? "border-sx-error" : "border-sx-ink",
        className,
      )}
    />
  );
}

// ── Segmented control ────────────────────────────────────────────────────────

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  testId,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange(next: T): void;
  label: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className="flex gap-1 rounded-full bg-sx-surface-container p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              "flex-1 h-11 rounded-full font-sx-display text-sx-label-lg transition-colors",
              selected ? "bg-sx-primary text-white" : "text-sx-on-surface-variant hover:bg-white/70",
              "disabled:cursor-not-allowed disabled:opacity-55",
              focusRing,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  testId,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-8 w-14 shrink-0 rounded-full border-2 border-sx-ink transition-colors",
        checked ? "bg-sx-primary" : "bg-sx-surface-container",
        "disabled:cursor-not-allowed disabled:opacity-55",
        focusRing,
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 h-6 w-6 rounded-full bg-white border-2 border-sx-ink",
          "transition-[left] duration-150",
          checked ? "left-[26px]" : "left-0.5",
        )}
      />
    </button>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────────

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  suffix,
  disabled = false,
  testId,
}: {
  value: number;
  min: number;
  max: number;
  onChange(next: number): void;
  label: string;
  suffix?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  const btn =
    "h-10 w-10 rounded-full border-2 border-sx-ink bg-white font-sx-display text-sx-headline-sm leading-none " +
    "disabled:cursor-not-allowed disabled:opacity-40 " +
    focusRing;

  return (
    <div className="flex items-center gap-sx-sm rounded-full bg-sx-surface-container p-1.5" data-testid={testId}>
      <button
        type="button"
        className={btn}
        onClick={() => step(-1)}
        disabled={disabled || value <= min}
        aria-label={`Fewer ${label}`}
      >
        −
      </button>
      <span className="flex-1 text-center font-sx-display text-sx-label-lg text-sx-ink" aria-live="polite">
        {value}
        {suffix ? ` ${suffix}` : ""}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => step(1)}
        disabled={disabled || value >= max}
        aria-label={`More ${label}`}
      >
        +
      </button>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────

export function Toast({ message, onDismiss }: { message: string; onDismiss(): void }) {
  return (
    <div
      role="status"
      data-testid="sx-toast"
      className="fixed inset-x-sx-md bottom-sx-md z-50 mx-auto max-w-md rounded-full bg-sx-ink text-sx-cream
                 px-sx-md py-sx-sm font-sx-display text-sx-label-lg flex items-center justify-between gap-sx-sm"
    >
      <span className="min-w-0 truncate">{message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-sx-cream/70 hover:text-sx-cream">
        ✕
      </button>
    </div>
  );
}
