import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { errorText } from "./errors";

type ToastKind = "error" | "info";

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

interface ToastCtx {
  show: (text: string, kind?: ToastKind) => void;
  showError: (e: unknown) => void;
}

const Ctx = createContext<ToastCtx>({
  show: () => {},
  showError: () => {},
});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (text: string, kind: ToastKind = "error") => {
      const id = nextId++;
      setToasts((ts) => [...ts, { id, text, kind }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const showError = useCallback(
    (e: unknown) => {
      const text = errorText(e);
      console.warn(text, e);
      show(text, "error");
    },
    [show],
  );

  return (
    <Ctx.Provider value={{ show, showError }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const color =
    toast.kind === "error"
      ? "border-rose-700/60 bg-rose-950/80 text-rose-100"
      : "border-neutral-700 bg-neutral-900 text-neutral-100";
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={`shadow-xl border rounded-md px-3 py-2 flex items-start gap-3 text-sm ${color}`}
    >
      <span className="flex-1 break-words">{toast.text}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-neutral-400 hover:text-neutral-100 text-xs leading-none"
      >
        ✕
      </button>
    </div>
  );
}

export const useToast = () => useContext(Ctx);
