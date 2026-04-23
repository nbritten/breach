import type { ReactNode } from "react";
import { useEscapeKey } from "../lib/hooks";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  /** When false, backdrop click / Esc / × are disabled. Use while an operation is running. */
  closable?: boolean;
  /** CSS width value (e.g. "640px", "720px"). */
  width?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({
  title,
  subtitle,
  onClose,
  closable = true,
  width = "640px",
  footer,
  children,
}: Props) {
  useEscapeKey(onClose, closable);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={closable ? onClose : undefined}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-lg max-h-[80vh] flex flex-col shadow-2xl"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-neutral-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">{title}</h2>
            {subtitle && <div className="mt-0.5">{subtitle}</div>}
          </div>
          {closable && (
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-100 text-lg leading-none shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-5 py-3 min-h-[160px]">
          {children}
        </div>

        {footer && (
          <footer className="px-5 py-3 border-t border-neutral-800">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
