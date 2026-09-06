import { useEffect, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToast } from "../../lib/toast";
import { errorText } from "../../lib/errors";
import { Button } from "../Button";

export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const { showError } = useToast();
  if (!/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        openUrl(href).catch(showError);
      }}
      className="gh-link"
    >
      {children}
    </a>
  );
}
export function GitHubMarkdown({ body, url }: { body: string; url: string }) {
  const resolve = (href: string) => {
    try {
      return new URL(href, url).href;
    } catch {
      return "";
    }
  };
  return (
    <div className="gh-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <ExternalLink href={resolve(href || "")}>{children}</ExternalLink>
          ),
          img: ({ src, alt }) => (
            <ExternalLink href={resolve(typeof src === "string" ? src : "")}>
              {alt || "View image"} ↗
            </ExternalLink>
          ),
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
export function useGitHubResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    load()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, revision]);
  return {
    data,
    error,
    loading,
    refresh: () => setRevision((value) => value + 1),
  };
}
export function GitHubError({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div className="gh-empty" role="alert">
      <h2>Couldn’t load GitHub</h2>
      <p className="whitespace-pre-wrap break-words">{error}</p>
      <p>
        Breach uses your GitHub CLI account. If you need to sign in, run{" "}
        <code>gh auth login --hostname github.com</code> in Terminal, then
        retry.
      </p>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
export function GitHubLoading() {
  return (
    <div className="gh-empty" role="status">
      Loading from GitHub…
    </div>
  );
}
export function PullIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="M6 7v10m7-13 3 3-3 3m3-3h1a1 1 0 0 1 1 1v9" />
    </svg>
  );
}
export function dateLabel(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
