import type {
  Conversation,
  Inbox,
  PullDetail,
  PullFile,
  SearchResults,
} from "./github";
const titles = [
  "Make workspace navigation feel effortless",
  "Keep terminal sessions ready between launches",
  "Add a calmer, more focused review experience",
];
export const demoGitHub = {
  search(_queue: Inbox, query: string, page: number): SearchResults {
    const items = titles
      .map((title, i) => ({
        number: 128 + i,
        title,
        html_url: `https://github.com/example/breach/pull/${128 + i}`,
        repository_url: "https://api.github.com/repos/example/breach",
        user: { login: i === 1 ? "you" : "alex" },
        updated_at: "2026-09-06T12:00:00Z",
        state: "open",
        draft: i === 2,
        labels: [{ name: "enhancement" }],
      }))
      .filter((pr) => pr.title.toLowerCase().includes(query.toLowerCase()));
    return {
      items: page === 1 ? items : [],
      total_count: items.length,
      incomplete_results: false,
      login: "you",
    };
  },
  detail(repo: string, number: number): PullDetail {
    return {
      pr: {
        number,
        title: titles[number - 128] || titles[0],
        body: "## A smoother workspace\n\nKeep navigation predictable and make it easier to pick up where you left off.\n\n- Preserve the active workspace\n- Keep keyboard navigation consistent\n- Respect reduced-motion preferences",
        html_url: `https://github.com/${repo}/pull/${number}`,
        user: { login: "alex" },
        state: "open",
        draft: false,
        merged: false,
        head: { sha: "a".repeat(40), label: "alex:workspace-navigation" },
        base: { label: "example:main" },
        additions: 2,
        deletions: 1,
        changed_files: 1,
        mergeable: true,
        mergeable_state: "clean",
      },
      viewer: "you",
      repository: {
        permissions: { push: true },
        allow_squash_merge: true,
        allow_merge_commit: true,
        allow_rebase_merge: true,
      },
      checks: {
        reviewDecision: "APPROVED",
        statusCheckRollup: [
          { name: "Tests", status: "COMPLETED", conclusion: "SUCCESS" },
          { name: "Build", status: "COMPLETED", conclusion: "SUCCESS" },
        ],
      },
    };
  },
  conversation(): Conversation {
    return {
      comments: [
        {
          id: 1,
          user: { login: "sam" },
          body: "The keyboard flow feels much better. Thanks for covering the back-navigation case!",
          created_at: "2026-09-06T12:00:00Z",
        },
      ],
      reviews: [],
      inline: [],
    };
  },
  files(): PullFile[] {
    return [
      {
        filename: "src/workspace.ts",
        status: "modified",
        additions: 2,
        deletions: 1,
        patch:
          "@@ -1,2 +1,3 @@\n export const workspace = {\n-  restore: false,\n+  restore: true,\n+  keepFocus: true,",
      },
    ];
  },
};
