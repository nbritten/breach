import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Tooltip } from "./Tooltip";
import { useActionFeedback } from "../lib/useActionFeedback";
import { useToast } from "../lib/toast";

interface Props {
  action: () => Promise<unknown>;
  label: string;
  pendingLabel: string;
  successLabel: string;
  icon: IconName;
  description?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}

export function ActionButton({ action, label, pendingLabel, successLabel, icon, description, iconOnly = false, disabled = false, busy = false, className = "" }: Props) {
  const { showError } = useToast();
  const { state, run } = useActionFeedback(action, showError);
  const pending = busy || state === "pending";
  const feedback = pending ? pendingLabel : state === "success" ? successLabel : state === "error" ? `${label} failed. Try again.` : "";
  const hint = feedback || description || label;
  return (
    <Tooltip content={hint} width="w-56">
      <Button
        variant={iconOnly ? "ghost" : "secondary"}
        iconOnly={iconOnly}
        className={`action-control ${className}`}
        data-state={pending ? "pending" : state}
        aria-label={label}
        aria-busy={pending}
        disabled={disabled || pending}
        onClick={() => void run()}
      >
        <Icon name={pending ? "refresh" : state === "success" ? "check" : state === "error" ? "info" : icon} className={pending ? "animate-spin" : ""} />
        {!iconOnly && <span>{label}</span>}
      </Button>
      <span className="sr-only" role="status">{feedback}</span>
    </Tooltip>
  );
}
