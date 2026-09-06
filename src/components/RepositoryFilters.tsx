import { useId } from "react";
import { REPO_FILTER_ORDER, repoFilterLabel, type RepoFilter } from "../lib/dashboard";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

export function RepositoryFilters({ counts, active, onToggle, onClear, visible, total, searching = false }: {
  counts: Record<RepoFilter, number>;
  active: ReadonlySet<RepoFilter>;
  onToggle: (filter: RepoFilter) => void;
  onClear: () => void;
  visible: number;
  total: number;
  searching?: boolean;
}) {
  const helpId = useId();
  return (
    <section className="repository-filters" aria-label="Repository filters">
      <div className="filter-controls" role="group" aria-label="Filter repositories" aria-describedby={helpId}>
        <span className="filter-label"><Icon name="filter" /> Filters</span>
        {REPO_FILTER_ORDER.map((filter) => {
          const selected = active.has(filter);
          const count = counts[filter];
          const label = repoFilterLabel(filter);
          return (
            <Tooltip key={filter} width="w-56" content={selected ? `Remove ${label.toLowerCase()} filter` : count === 0 ? `No matching repositories for ${label.toLowerCase()}` : `Show repositories with ${label.toLowerCase()}`}>
              <button type="button" className={`filter-chip ${selected ? "is-active" : ""}`} aria-pressed={selected} aria-label={`${label}, ${count} repositories`} disabled={!selected && count === 0} onClick={() => onToggle(filter)}>
                <span className="filter-check"><Icon name="check" width="12" height="12" /></span>
                {label}<span className="filter-count" aria-hidden="true">{count}</span>
              </button>
            </Tooltip>
          );
        })}
        <Button variant="ghost" className="filter-clear" onClick={onClear} disabled={active.size === 0}>Clear filters</Button>
      </div>
      <div className="filter-summary">
        <span role="status">{visible} of {total} {searching ? "search results" : "repositories"}</span>
        <span id={helpId}>{active.size > 1 ? "Matching any selected filter" : "Select filters to focus your workspace"}</span>
      </div>
    </section>
  );
}
