import { openUrl } from "@tauri-apps/plugin-opener";
import type { CiStatus } from "../types";
import { ciPresentation } from "../lib/ciPresentation";
import { useActionFeedback } from "../lib/useActionFeedback";
import { useToast } from "../lib/toast";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

export function CiStatusIndicator({ ci }: { ci: CiStatus }) {
  const { showError } = useToast();
  const { state, run } = useActionFeedback(async () => { if (ci.url) await openUrl(ci.url); }, showError);
  const presentation = ciPresentation(ci);
  const pending = state === "pending";
  const details = `${ci.workflow ? `${ci.workflow}: ` : ""}${presentation.label}`;
  const hint = pending ? "Opening check details…" : state === "error" ? "Could not open check details. Try again." : `${details}${ci.url ? ". Open details on GitHub." : ". No details link is available."}`;
  const content = <><Icon name={pending ? "refresh" : presentation.icon} className={pending || presentation.tone === "running" ? "animate-spin" : ""} width="13" height="13" /><span>{presentation.label}</span>{ci.url && <Icon name="external" className="ci-external" width="11" height="11" />}</>;
  return (
    <Tooltip content={hint} width="w-64" align="left">
      {ci.url ? (
        <button type="button" className={`ci-status ci-${presentation.tone}`} aria-label={`${presentation.label}. Open check details`} aria-busy={pending} disabled={pending} onClick={() => void run()}>{content}</button>
      ) : (
        <span className={`ci-status ci-${presentation.tone}`} aria-label={details}>{content}</span>
      )}
      <span className="sr-only" role="status">{pending ? "Opening check details…" : state === "error" ? "Check details could not be opened" : ""}</span>
    </Tooltip>
  );
}
