import { ActionButton } from "./ActionButton";

export function RefreshButton({ onRefresh, busy = false, iconOnly = true, label = "Refresh", description = "Refresh repository status" }: {
  onRefresh: () => Promise<unknown>;
  busy?: boolean;
  iconOnly?: boolean;
  label?: string;
  description?: string;
}) {
  return <ActionButton action={onRefresh} label={label} pendingLabel="Refreshing…" successLabel="Up to date" icon="refresh" busy={busy} iconOnly={iconOnly} description={description} />;
}
