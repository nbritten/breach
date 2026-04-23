import type { ReactNode } from "react";

interface Props {
  content: string;
  children: ReactNode;
  align?: "left" | "right" | "center";
  side?: "top" | "bottom";
  width?: string;
}

export function Tooltip({
  content,
  children,
  align = "right",
  side = "bottom",
  width = "w-72",
}: Props) {
  const sideCls =
    side === "bottom" ? "top-full mt-2" : "bottom-full mb-2";
  const alignCls =
    align === "left"
      ? "left-0"
      : align === "center"
      ? "left-1/2 -translate-x-1/2"
      : "right-0";

  return (
    <div className="relative group">
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${sideCls} ${alignCls} ${width} px-3 py-2 rounded-md bg-neutral-950 border border-neutral-700 text-xs text-neutral-200 leading-snug shadow-xl opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 delay-300`}
      >
        {content}
      </div>
    </div>
  );
}
