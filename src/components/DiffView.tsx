import { memo, useMemo, useState } from "react";
import {
  parseSplitDiff,
  parseUnifiedDiff,
  shouldDeferDiff,
  type DiffSide,
  type ParsedFile,
} from "../lib/parseDiff";

interface Props {
  diff: string;
  empty?: string;
}

const STATUS_BADGE: Record<ParsedFile["status"], { label: string; cls: string }> = {
  added: { label: "added", cls: "bg-emerald-500/15 text-emerald-300" },
  deleted: { label: "deleted", cls: "bg-rose-500/15 text-rose-300" },
  renamed: { label: "renamed", cls: "bg-sky-500/15 text-sky-300" },
  modified: { label: "modified", cls: "bg-neutral-700/60 text-neutral-300" },
};

/**
 * How many files mount in the first render pass. Files past this count cost
 * nothing until the user clicks "Show more", bounding React commit size for
 * wide diffs such as a generated directory rename.
 */
const INITIAL_VISIBLE_FILES = 20;

/**
 * One file of the diff. Split rows are owned by the conditional RenderedDiff,
 * so collapsed, deferred, and not-yet-visible files do no line-model work.
 */
const SIDE_CLASS: Record<DiffSide["kind"], string> = {
  context: "bg-neutral-950 text-neutral-300",
  addition: "bg-emerald-950/45 text-emerald-100",
  deletion: "bg-rose-950/45 text-rose-100",
  empty: "bg-neutral-950/70",
};
const SIDE_PREFIX: Record<DiffSide["kind"], string> = {
  context: " ",
  addition: "+",
  deletion: "-",
  empty: " ",
};

function DiffSideCell({ side }: { side: DiffSide }) {
  return (
    <div className={`grid grid-cols-[3.5rem_minmax(0,1fr)] min-w-0 ${SIDE_CLASS[side.kind]}`}>
      <span className="px-2 py-px text-right text-neutral-600 select-none border-r border-neutral-800/70">
        {side.lineNumber}
      </span>
      <pre className="px-2 py-px whitespace-pre overflow-visible min-h-[1.25rem]">
        {SIDE_PREFIX[side.kind]}
        {side.text}
      </pre>
    </div>
  );
}

const RenderedDiff = memo(function RenderedDiff({ body }: { body: string }) {
  const rows = useMemo(() => parseSplitDiff(body), [body]);
  return (
    <div className="overflow-x-auto text-[13px] leading-5 font-mono">
      <div className="min-w-[64rem]">
        {rows.map((row, index) =>
          row.kind === "hunk" ? (
            <div
              key={index}
              className="px-3 py-1 bg-sky-950/40 text-sky-300 border-y border-sky-900/30"
            >
              {row.text}
            </div>
          ) : (
            <div key={index} className="grid grid-cols-2">
              <DiffSideCell side={row.old} />
              <DiffSideCell side={row.new} />
            </div>
          ),
        )}
      </div>
    </div>
  );
});

function FileCard({ meta }: { meta: ParsedFile }) {
  const deferred = shouldDeferDiff(meta);
  // Deferred files stay as a cheap placeholder until the user opts in. A
  // card never survives across diffs — the parent keys it by diff generation
  // so switching diffs remounts it, keeping the initializer in sync with meta.
  const [loaded, setLoaded] = useState(!deferred);
  const [open, setOpen] = useState(true);

  const badge = STATUS_BADGE[meta.status];
  const changed = meta.additions + meta.deletions;

  return (
    <div className="border border-neutral-800 rounded overflow-hidden bg-neutral-950">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Collapse file" : "Expand file"}
        aria-expanded={open}
        className="w-full px-3 py-2 flex items-center gap-3 bg-neutral-900 hover:bg-neutral-800/70 border-b border-neutral-800 text-left"
      >
        <span className="text-neutral-500 text-xs font-mono w-3">
          {open ? "▾" : "▸"}
        </span>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="font-mono text-sm truncate flex-1">
          {meta.status === "renamed" && meta.oldPath !== meta.newPath ? (
            <>
              <span className="text-neutral-500">{meta.oldPath}</span>
              <span className="text-neutral-600 mx-1">→</span>
              <span>{meta.newPath}</span>
            </>
          ) : (
            meta.displayName
          )}
        </span>
        {!meta.isBinary && (
          <span className="text-xs font-mono shrink-0">
            <span className="text-emerald-400">+{meta.additions}</span>
            <span className="text-neutral-600"> / </span>
            <span className="text-rose-400">-{meta.deletions}</span>
          </span>
        )}
      </button>
      {open && (
        <div>
          {meta.isBinary ? (
            <div className="px-4 py-6 text-sm text-neutral-500 italic">
              Binary file not shown.
            </div>
          ) : !loaded ? (
            <div className="px-4 py-6 flex items-center gap-4">
              <span className="text-sm text-neutral-500 italic">
                Large diff ({changed.toLocaleString()} changed lines) — not rendered automatically.
              </span>
              <button
                type="button"
                onClick={() => setLoaded(true)}
                className="text-xs px-2.5 py-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 shrink-0"
              >
                Load diff
              </button>
            </div>
          ) : (
            <RenderedDiff body={meta.body} />
          )}
        </div>
      )}
    </div>
  );
}

export function DiffView({ diff, empty = "No changes." }: Props) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_FILES);
  // When a different diff comes in (e.g. switching between commits), reset
  // the "Show more" window — so an expanded view of one huge diff doesn't
  // force the next diff to mount everything at once — and bump `generation`,
  // which is part of every card's key. The new key remounts each card, and a
  // remount is the only reset that's safe here: re-deriving state inside a
  // surviving card could briefly pair stale `loaded` state with a new file.
  // This render-phase setState is fine, by contrast: React retries the
  // *parent* before rendering children, so no card ever sees a stale key.
  const [generation, setGeneration] = useState(0);
  const [prevDiff, setPrevDiff] = useState(diff);
  if (diff !== prevDiff) {
    setPrevDiff(diff);
    setVisibleCount(INITIAL_VISIBLE_FILES);
    setGeneration((g) => g + 1);
  }

  if (files.length === 0) {
    return <div className="text-neutral-500 italic p-4 text-sm">{empty}</div>;
  }

  const visible = files.slice(0, visibleCount);
  const hidden = files.length - visible.length;

  return (
    <div className="flex flex-col gap-3 p-3">
      {visible.map((meta) => (
        <FileCard
          key={`${generation}:${meta.oldPath}->${meta.newPath}`}
          meta={meta}
        />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + INITIAL_VISIBLE_FILES)}
          className="w-full py-2 text-sm rounded border border-neutral-800 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
        >
          Show {Math.min(hidden, INITIAL_VISIBLE_FILES)} more{" "}
          {Math.min(hidden, INITIAL_VISIBLE_FILES) === 1 ? "file" : "files"}
          {hidden > INITIAL_VISIBLE_FILES ? ` (${hidden} remaining)` : ""}
        </button>
      )}
    </div>
  );
}
