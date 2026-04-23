import { useEffect, useMemo, useState } from "react";
import { DiffFile, DiffModeEnum, DiffView as GitDiffView } from "@git-diff-view/react";
import { getDiffViewHighlighter } from "@git-diff-view/shiki";
import type { BundledLanguage, DiffHighlighter } from "@git-diff-view/shiki";
import { parseUnifiedDiff, type ParsedFile } from "../lib/parseDiff";

interface Props {
  diff: string;
  empty?: string;
}

interface FileEntry {
  meta: ParsedFile;
  diffFile: DiffFile | null;
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

export function DiffView({ diff, empty = "No changes." }: Props) {
  const entries = useMemo<FileEntry[]>(() => {
    const parsed = parseUnifiedDiff(diff);
    return parsed.map((meta) => {
      if (meta.isBinary) return { meta, diffFile: null };
      const df = DiffFile.createInstance({
        oldFile: { fileName: meta.oldPath },
        newFile: { fileName: meta.newPath },
        hunks: [meta.body],
      });
      df.init();
      df.initTheme("dark");
      df.buildSplitDiffLines();
      return { meta, diffFile: df };
    });
  }, [diff]);

  // Shiki loads asynchronously. `syntaxTick` nudges React to re-render the
  // per-file summary row (line counts) after initSyntax mutates each DiffFile.
  // The inner <GitDiffView> subscribes to DiffFile itself and doesn't need this.
  const [, setSyntaxTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((hl) => {
      if (cancelled) return;
      entries.forEach(({ diffFile }) => {
        if (!diffFile) return;
        diffFile.initSyntax({ registerHighlighter: hl });
        diffFile.notifyAll();
      });
      setSyntaxTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (entries.length === 0) {
    return <div className="text-neutral-500 italic p-4 text-sm">{empty}</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {entries.map(({ meta, diffFile }) => {
        const key = `${meta.oldPath}->${meta.newPath}`;
        const isOpen = !collapsed[key];
        const badge = STATUS_BADGE[meta.status];
        return (
          <div
            key={key}
            className="border border-neutral-800 rounded overflow-hidden bg-neutral-950"
          >
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
              aria-label={isOpen ? "Collapse file" : "Expand file"}
              aria-expanded={isOpen}
              className="w-full px-3 py-2 flex items-center gap-3 bg-neutral-900 hover:bg-neutral-800/70 border-b border-neutral-800 text-left"
            >
              <span className="text-neutral-500 text-xs font-mono w-3">
                {isOpen ? "▾" : "▸"}
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
              {diffFile && (
                <span className="text-xs font-mono shrink-0">
                  <span className="text-emerald-400">+{diffFile.additionLength}</span>
                  <span className="text-neutral-600"> / </span>
                  <span className="text-rose-400">-{diffFile.deletionLength}</span>
                </span>
              )}
            </button>
            {isOpen && (
              <div className="diff-view-wrapper">
                {meta.isBinary || !diffFile ? (
                  <div className="px-4 py-6 text-sm text-neutral-500 italic">
                    Binary file not shown.
                  </div>
                ) : (
                  <GitDiffView
                    diffFile={diffFile}
                    diffViewMode={DiffModeEnum.Split}
                    diffViewTheme="dark"
                    diffViewHighlight
                    diffViewFontSize={13}
                    diffViewWrap={false}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
