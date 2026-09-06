import { Button } from "./Button";
import { useEffect, useId, useRef, type ReactNode } from "react";
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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-5"
      onClick={closable ? onClose : undefined}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const panel = event.currentTarget;
          const controls = [...panel.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          )].filter((element) => element.getClientRects().length > 0);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first) {
            event.preventDefault();
            panel.focus();
          } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel outline-none max-w-full max-h-[85vh] flex flex-col"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-5 border-b border-neutral-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-semibold tracking-tight">{title}</h2>
            {subtitle && <div className="mt-0.5">{subtitle}</div>}
          </div>
          {closable && (
            <Button
              onClick={onClose}
              variant="ghost"
              iconOnly
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </Button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-6 py-5 min-h-[160px]">
          {children}
        </div>

        {footer && (
          <footer className="px-6 py-5 border-t border-neutral-800">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
