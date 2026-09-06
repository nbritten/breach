import type { ReactNode } from "react";
import logo from "../assets/logo.png";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
}

const SIZES: Record<NonNullable<Props["size"]>, { img: number; gap: string }> = {
  sm: { img: 36, gap: "gap-3" },
  md: { img: 48, gap: "gap-5" },
  lg: { img: 56, gap: "gap-6" },
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
        className="opacity-60"
        style={{ imageRendering: "pixelated" }}
        draggable={false}
      />
      <div className="space-y-1 max-w-md">
        <div className="text-neutral-200 text-sm font-medium">{title}</div>
        {subtitle && (
          <div className="text-neutral-400 text-sm leading-6">{subtitle}</div>
        )}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
