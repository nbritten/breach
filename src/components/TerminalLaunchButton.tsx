import { ActionButton } from "./ActionButton";
import { openTerminal } from "../lib/settings";

interface Props {
  path: string;
  external?: boolean;
  iconOnly?: boolean;
  onOpen?: (path: string) => Promise<unknown>;
}

export function TerminalLaunchButton({ path, external = false, iconOnly = false, onOpen }: Props) {
  return (
    <ActionButton
      action={() => external ? openTerminal(path) : onOpen!(path)}
      disabled={!path || (!external && !onOpen)}
      label={external ? "Open in external terminal" : "Open in Breach Terminal"}
      displayLabel={external ? "Open externally" : "Terminal"}
      pendingLabel="Opening terminal…"
      successLabel="Terminal opened"
      icon={external ? "external" : "terminal"}
      description={external ? `Open your configured terminal app in ${path}` : `Open ${path} in Breach Terminal`}
      iconOnly={iconOnly}
    />
  );
}
