import { useCallback, useMemo, useState } from "react";
import { github, type PullDetail, type PullFile } from "../../lib/github";
import { patchLines } from "../../lib/githubDiff";
import { Button } from "../Button";
import {
  ExternalLink,
  GitHubError,
  GitHubLoading,
  useGitHubResource,
} from "./shared";
import type { Composer } from "./ActionDialog";

export function Files({
  repo,
  detail,
  compose,
  readonly,
}: {
  repo: string;
  detail: PullDetail;
  compose: (composer: Composer) => void;
  readonly: boolean;
}) {
  const load = useCallback(
    () => github.files(repo, detail.pr.number, detail.pr.head.sha),
    [repo, detail.pr.number, detail.pr.head.sha],
  );
  const { data, loading, error, refresh } = useGitHubResource(load);
  const [selected, setSelected] = useState(0);
  if (loading) return <GitHubLoading />;
  if (error) return <GitHubError error={error} retry={refresh} />;
  if (!data?.length)
    return <div className="gh-empty">No changed files returned by GitHub.</div>;
  const file = data[selected] || data[0];
  return (
    <div>
      {data.length < detail.pr.changed_files && (
        <p className="text-amber-300 text-xs mb-4">
          Showing {data.length} of {detail.pr.changed_files} files. GitHub
          limits large diffs.{" "}
          <ExternalLink href={`${detail.pr.html_url}/files`}>
            Open the full pull request ↗
          </ExternalLink>
        </p>
      )}
      <div className="gh-files">
        <nav aria-label="Changed files" className="gh-file-list">
          {data.map((entry, index) => (
            <button
              key={entry.filename}
              aria-current={entry === file ? "true" : undefined}
              onClick={() => setSelected(index)}
            >
              <span className="break-all">{entry.filename}</span>
              <span className="whitespace-nowrap text-xs">
                <span className="text-emerald-300">+{entry.additions}</span>{" "}
                <span className="text-rose-300">−{entry.deletions}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          <FilePatch
            key={file.filename}
            file={file}
            compose={compose}
            readonly={readonly}
          />
        </div>
      </div>
    </div>
  );
}
function FilePatch({
  file,
  compose,
  readonly,
}: {
  file: PullFile;
  compose: (composer: Composer) => void;
  readonly: boolean;
}) {
  const [expanded, setExpanded] = useState((file.patch?.length || 0) < 100000);
  const lines = useMemo(
    () => (expanded ? patchLines(file.patch || "") : []),
    [file.patch, expanded],
  );
  return (
    <section className="gh-patch">
      <header>
        <strong className="break-all">{file.filename}</strong>
        <span>{file.status}</span>
        {file.previous_filename && (
          <p className="text-xs text-neutral-400 mt-1">
            Renamed from {file.previous_filename}
          </p>
        )}
      </header>
      {expanded &&
        file.patch &&
        (lines.filter((line) => line.kind === "addition").length <
          file.additions ||
          lines.filter((line) => line.kind === "deletion").length <
            file.deletions) && (
          <p className="text-xs text-amber-300 p-3">
            GitHub returned a partial patch. Some changes are not shown here.
          </p>
        )}
      {!file.patch ? (
        <div className="gh-empty">
          GitHub did not include a text diff for this file. It may be binary,
          empty, or too large to display.
        </div>
      ) : !expanded ? (
        <div className="gh-empty">
          <p>This is a large diff.</p>
          <Button onClick={() => setExpanded(true)}>
            Load this file’s diff
          </Button>
        </div>
      ) : (
        <div
          className="overflow-x-auto"
          tabIndex={0}
          aria-label={`Diff for ${file.filename}`}
        >
          <div className="gh-patch-lines">
            {lines.map((line, index) => (
              <div key={index} className={`gh-patch-line gh-line-${line.kind}`}>
                <span className="gh-line-number">{line.old}</span>
                <span className="gh-line-number">{line.next}</span>
                <span className="gh-line-action">
                  {(line.old !== null || line.next !== null) && (
                    <button
                      disabled={readonly}
                      aria-label={`Comment on ${line.kind === "deletion" ? "original" : "updated"} line ${line.next ?? line.old}`}
                      onClick={() =>
                        compose({
                          kind: "inline",
                          path: file.filename,
                          line: (line.next ?? line.old)!,
                          side: line.kind === "deletion" ? "LEFT" : "RIGHT",
                        })
                      }
                    >
                      +
                    </button>
                  )}
                </span>
                <pre>{line.text}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
