import type { ReactNode } from "react";
import logo from "../assets/logo.png";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
}

const SIZES: Record<NonNullable<Props["size"]>, { img: number; gap: string }> = {
  sm: { img: 72, gap: "gap-3" },
  md: { img: 128, gap: "gap-5" },
  lg: { img: 192, gap: "gap-6" },
};

export function EmptyState({ title, subtitle, size = "md", children }: Props) {
  const s = SIZES[size];
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${s.gap} py-12`}
    >
      <img
        src={logo}
        alt=""
        width={s.img}
        height={s.img}
        className="whale-float opacity-90"
        style={{ imageRendering: "pixelated" }}
        draggable={false}
      />
      <div className="space-y-1 max-w-md">
        <div className="text-neutral-200 text-sm font-medium">{title}</div>
        {subtitle && (
          <div className="text-neutral-500 text-xs">{subtitle}</div>
        )}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
