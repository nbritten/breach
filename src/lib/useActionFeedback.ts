import { useCallback, useEffect, useRef, useState } from "react";

export type ActionState = "idle" | "pending" | "success" | "error";

/** One operation per control, with brief feedback and no timers after unmount. */
export function useActionFeedback(action: () => Promise<unknown>, onError: (error: unknown) => void) {
  const [state, setState] = useState<ActionState>("idle");
  const locked = useRef(false);
  const mounted = useRef(true);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(reset.current);
    };
  }, []);

  const run = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    clearTimeout(reset.current);
    setState("pending");
    let next: ActionState = "success";
    try {
      // Callers that already present an error may return false without another toast.
      if (await action() === false) next = "error";
    } catch (error) {
      next = "error";
      if (mounted.current) onError(error);
    } finally {
      locked.current = false;
      if (mounted.current) {
        setState(next);
        reset.current = setTimeout(() => setState("idle"), next === "error" ? 4000 : 1600);
      }
    }
  }, [action, onError]);

  return { state, run };
}
