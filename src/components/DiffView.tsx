import { useEffect, useMemo, useState } from "react";
import { DiffFile, DiffModeEnum, DiffView as GitDiffView } from "@git-diff-view/react";
import { getDiffViewHighlighter } from "@git-diff-view/shiki";
import type { BundledLanguage, DiffHighlighter } from "@git-diff-view/shiki";
import {
  diffRenderMode,
  parseUnifiedDiff,
  type DiffRenderMode,
  type ParsedFile,
} from "../lib/parseDiff";

interface Props {
  diff: string;
  empty?: string;
}

const HIGHLIGHT_LANGS: BundledLanguage[] = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "css",
  "html",
  "markdown",
  "rust",
  "python",
  "go",
  "bash",
  "yaml",
  "toml",
  "sql",
  "ruby",
  "java",
  "kotlin",
  "swift",
];

let highlighterPromise: Promise<DiffHighlighter> | null = null;
const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = getDiffViewHighlighter(HIGHLIGHT_LANGS);
  }
  return highlighterPromise;
};

const STATUS_BADGE: Record<ParsedFile["status"], { label: string; cls: string }> = {
  added: { label: "added", cls: "bg-emerald-500/15 text-emerald-300" },
  deleted: { label: "deleted", cls: "bg-rose-500/15 text-rose-300" },
  renamed: { label: "renamed", cls: "bg-sky-500/15 text-sky-300" },
  modified: { label: "modified", cls: "bg-neutral-700/60 text-neutral-300" },
};

/**
 * How many files mount in the first render pass. DiffFile construction runs
 * inside each FileCard, so files past this count cost nothing until the user
 * clicks "Show more" — that single cap bounds both React commit size and the
 * synchronous diff-model work for wide diffs (e.g. a big rename or vendored
 * directory). 20 comfortably covers typical working-tree diffs.
 */
const INITIAL_VISIBLE_FILES = 20;

/**
 * One file of the diff. Owning the DiffFile instance here (rather than in a
 * parent-level useMemo over every parsed file) means unmounted files — those
 * past the "Show more" cutoff — and deferred large files do zero work until
 * they actually appear.
 */
function FileCard({ meta }: { meta: ParsedFile }) {
  const mode: DiffRenderMode = diffRenderMode(meta);
  // Deferred files stay as a cheap placeholder until the user opts in.
  const [loaded, setLoaded] = useState(mode !== "deferred");
  const [open, setOpen] = useState(true);

  // Cards are keyed by file path, so the same component instance can receive
  // a different parsed file when the user switches diffs (working tree vs. a
  // commit). Re-derive `loaded` then, so a path that was small in one diff
  // doesn't eagerly render a huge version of itself in the next.
  const [prevMeta, setPrevMeta] = useState(meta);
  if (meta !== prevMeta) {
    setPrevMeta(meta);
    setLoaded(mode !== "deferred");
  }

  const diffFile = useMemo(() => {
    if (!loaded || meta.isBinary) return null;
    const df = DiffFile.createInstance({
      oldFile: { fileName: meta.oldPath },
      newFile: { fileName: meta.newPath },
      hunks: [meta.body],
    });
    df.init();
    df.initTheme("dark");
    df.buildSplitDiffLines();
    return df;
  }, [loaded, meta]);

  // Shiki loads asynchronously and initSyntax is the priciest per-file step,
  // so only "full"-mode (small) files get it. The inner <GitDiffView>
  // subscribes to DiffFile itself, so notifyAll() is all it takes to repaint.
  useEffect(() => {
    if (!diffFile || mode !== "full") return;
    let cancelled = false;
    getHighlighter().then((hl) => {
      if (cancelled) return;
      diffFile.initSyntax({ registerHighlighter: hl });
      diffFile.notifyAll();
    });
    return () => {
      cancelled = true;
    };
  }, [diffFile, mode]);

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
        <div className="diff-view-wrapper">
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
          ) : diffFile ? (
            <GitDiffView
              diffFile={diffFile}
              diffViewMode={DiffModeEnum.Split}
              diffViewTheme="dark"
              diffViewHighlight={mode === "full"}
              diffViewFontSize={13}
              diffViewWrap={false}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function DiffView({ diff, empty = "No changes." }: Props) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_FILES);
  // Reset the "Show more" window whenever a different diff comes in (e.g.
  // switching between commits), so an expanded view of one huge diff doesn't
  // force the next diff to mount everything at once.
  const [prevDiff, setPrevDiff] = useState(diff);
  if (diff !== prevDiff) {
    setPrevDiff(diff);
    setVisibleCount(INITIAL_VISIBLE_FILES);
  }

  if (files.length === 0) {
    return <div className="text-neutral-500 italic p-4 text-sm">{empty}</div>;
  }

  const visible = files.slice(0, visibleCount);
  const hidden = files.length - visible.length;

  return (
    <div className="flex flex-col gap-3 p-3">
      {visible.map((meta) => (
        <FileCard key={`${meta.oldPath}->${meta.newPath}`} meta={meta} />
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
