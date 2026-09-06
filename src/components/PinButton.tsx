import { Button } from "./Button";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import { useActionFeedback } from "../lib/useActionFeedback";
import { useToast } from "../lib/toast";

export function PinButton({ pinned, name, onToggle }: { pinned: boolean; name: string; onToggle: () => void | Promise<void> }) {
  const { showError } = useToast();
  const { state, run } = useActionFeedback(async () => onToggle(), showError);
  const pending = state === "pending";
  const hint = pending ? "Saving pin…" : state === "error" ? "Could not save pin. Try again." : pinned ? `Unpin ${name} from the top of your workspace` : `Pin ${name} to the top of your workspace`;
  return (
    <Tooltip content={hint} width="w-56">
      <Button variant="ghost" iconOnly className="pin-control" aria-label={`Pin ${name}`} aria-pressed={pinned} aria-busy={pending} disabled={pending} onClick={() => void run()}>
        <Icon name={pending ? "refresh" : "pin"} className={pending ? "animate-spin" : ""} fill={pinned && !pending ? "currentColor" : "none"} />
      </Button>
      <span className="sr-only" role="status">{pending ? "Saving pin…" : state === "error" ? "Pin could not be saved" : ""}</span>
    </Tooltip>
  );
}
