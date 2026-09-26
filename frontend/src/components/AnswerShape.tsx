import React from "react";

/**
 * Colorblind-safe answer shape icon. Renders one of:
 *  - triangle (red)
 *  - diamond (blue)
 *  - circle  (yellow)
 *  - square  (green)
 */
export const ANSWER_META = [
  { key: "triangle", label: "Red Triangle", bg: "bg-red-500", ring: "ring-red-300", hex: "#EF4444" },
  { key: "diamond", label: "Blue Diamond", bg: "bg-blue-500", ring: "ring-blue-300", hex: "#3B82F6" },
  { key: "circle", label: "Yellow Circle", bg: "bg-yellow-500", ring: "ring-yellow-300", hex: "#EAB308" },
  { key: "square", label: "Green Square", bg: "bg-green-500", ring: "ring-green-300", hex: "#22C55E" },
];

interface AnswerShapeProps {
  index?: number;
  size?: number;
  className?: string;
}

export function AnswerShape({ index = 0, size = 28, className = "" }: AnswerShapeProps) {
  const meta = ANSWER_META[index] ?? ANSWER_META[0]!;
  const stroke = "white";
  const props: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 3,
    strokeLinejoin: "round",
    strokeLinecap: "round",
    className,
    "aria-label": meta.label,
  };

  if (meta.key === "triangle") {
    return (
      <svg {...props}>
        <polygon points="12,3 22,21 2,21" />
      </svg>
    );
  }
  if (meta.key === "diamond") {
    return (
      <svg {...props}>
        <polygon points="12,2 22,12 12,22 2,12" />
      </svg>
    );
  }
  if (meta.key === "circle") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
