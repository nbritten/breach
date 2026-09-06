import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { demoRepoSummaries } from "../lib/demoFixtures";
import { RepoCard } from "./RepoCard";

describe("repository card navigation", () => {
  it("keeps quick actions outside the repository link", () => {
    const repo = demoRepoSummaries()[0];
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RepoCard
          repo={repo}
          onRefresh={vi.fn()}
          onTogglePin={vi.fn()}
          onOpenTerminal={vi.fn()}
          docsUrl="https://example.com/docs"
        />
      </MemoryRouter>,
    );
    const links = [...html.matchAll(/<a\b[^>]*>.*?<\/a>/g)].map(([link]) => link);
    expect(links).toHaveLength(1);
    expect(links[0]).toContain(`/repo/${encodeURIComponent(repo.path)}`);
    expect(links[0]).not.toContain("<button");
    for (const label of [`Pin ${repo.name}`, "Open service docs", "Open in Breach Terminal", "Open in external terminal", "Refresh this repo"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
