import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  content: string;
  children: ReactNode;
  align?: "left" | "right" | "center";
  side?: "top" | "bottom";
  width?: string;
}

/** Portal keeps hints visible above cards, scrolling panels, and window chrome. */
export function Tooltip({ content, children, align = "right", side = "bottom", width = "w-72" }: Props) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hide = () => { clearTimeout(timer.current); setOpen(false); setPosition(null); };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (!anchor.current || !hint.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const box = hint.current.getBoundingClientRect();
      const x = align === "left" ? rect.left : align === "center" ? rect.left + (rect.width - box.width) / 2 : rect.right - box.width;
      let y = side === "bottom" ? rect.bottom + 8 : rect.top - box.height - 8;
      if (y + box.height > window.innerHeight - 8) y = rect.top - box.height - 8;
      if (y < 8) y = rect.bottom + 8;
      setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)), top: Math.max(8, y) });
    };
    place();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, side, content]);

  return (
    <div ref={anchor} className="control-hint inline-flex" onMouseEnter={() => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 350); }} onMouseLeave={hide} onFocus={() => setOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}>
      {Children.map(children, (child) =>
        isValidElement<{ "aria-describedby"?: string }>(child) && child.type !== "span"
          ? cloneElement(child, { "aria-describedby": open ? [child.props["aria-describedby"], id].filter(Boolean).join(" ") : child.props["aria-describedby"] })
          : child,
      )}
      {open && createPortal(
        <div ref={hint} id={id} role="tooltip" className={`control-tooltip ${width}`} style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}>{content}</div>,
        document.body,
      )}
    </div>
  );
}
