# GitHub workspace

Breach’s GitHub workspace brings pull-request work into the app. It uses the
active `gh` account on github.com. Sign in with `gh auth login --hostname github.com`
if the workspace reports an authentication error.

## Included

- Review-requested, authored, and involved PR inboxes, plus GitHub search filters
  and direct PR links. Results are paginated in groups of 50; GitHub search caps
  access at 1,000 results.
- Markdown descriptions, comments, reviews, and inline discussions, including
  replies. Conversation endpoints follow pagination.
- File navigation and unified diffs with original/updated line comments.
  Missing or partial patches are identified; very large patches load on demand.
- Comment, approve, and request-changes reviews; check and review status.
- Merge, squash, and rebase when enabled by the repository. A confirmation shows
  the target branches. GitHub enforces permissions and branch requirements.
- Repository-card PR shortcuts open in Breach. Theme colors carry through the
  new workspace. Demo mode provides sample PRs and never submits real actions.

Review and inline-comment requests include the inspected commit SHA and reject
new commits before submitting. Merge requests include GitHub’s expected-head
SHA. Diff loading checks that the head and base did not change during the read.
Requests time out rather than leaving controls busy indefinitely. An uncertain
submission is not automatically retried: refresh to check the result first.
Unsubmitted comment text is retained in memory per PR and comment location when
switching workspaces; quitting Breach clears those drafts.

## Next stages

This is the first PR-focused stage of the broader GitHub workspace, not full
GitHub parity. Follow-up work includes PR creation and metadata editing,
close/reopen and draft controls, editing/deleting comments, resolving review
threads, merge queues, issue workflows, Actions logs and controls, notifications,
repository administration, and GitHub Enterprise Server accounts. GitHub links
remain available for operations not yet represented in Breach.
