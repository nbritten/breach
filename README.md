<p align="center">
  <img src="src/assets/logo.png" alt="Breach logo — a pixel-art humpback whale" width="140" />
</p>

<h1 align="center">Breach</h1>

<p align="center">
  A macOS dashboard for every local git repo — scan branches, dirty state, PRs, and CI without tab-hopping.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <img alt="Platform: macOS" src="https://img.shields.io/badge/platform-macOS-black" />
</p>

---

## What it does

- **Multi-repo scan.** Point Breach at a directory; it reads every git repo inside and shows branch, dirty state, ahead/behind counts, and last commit at a glance.
- **PR badges.** Pulls your open PRs via `gh search prs` and badges them per repo.
- **CI dots.** Quick green/yellow/red status for the latest `gh run list` per branch.
- **Bulk actions.** Sync pinned repos, clone missing ones, prune merged branches — each one behind a confirmation modal.

## When Breach is (and isn't) the right tool

**Good fit if you:**

- Juggle 10+ local repos and want ambient state across all of them
- Already use the `gh` CLI and want your dashboard to lean on it
- Are on macOS and don't mind macOS-only

**Not for you if you:**

- Only work in one or two repos (`git status` plus your terminal is fine)
- Want a web UI or a hosted service — Breach is a local desktop app, by design
- Need Linux or Windows support (not planned)

## Install

Download the latest DMG from [Releases](https://github.com/nbritten/breach/releases).

Or build from source:

```sh
git clone https://github.com/nbritten/breach.git
cd breach
npm install
npm run tauri build
# → src-tauri/target/release/bundle/
```

For live-reload development:

```sh
npm run tauri dev
```

## Requirements

- macOS (Intel or Apple Silicon)
- [`gh` CLI](https://cli.github.com/), authenticated (`gh auth login`)
- `git`

## Stack

Tauri 2 · React 19 · Rust · Tailwind v4 · Vite 7. The backend is a small Rust crate exposed to the UI via Tauri `invoke()`; everything visual is React.

## Tests

```sh
cargo test   # Rust unit tests (parsing, git helpers)
npm test     # TypeScript tests (lib, hooks, helpers)
```

## AI pairing

Breach was built in close pairing with [Claude Code](https://claude.com/claude-code), Anthropic's Claude CLI. Architecture and design decisions are mine; a lot of the typing — especially in the Rust backend — was Claude's. Disclosing up front so you don't have to wonder.

## License

MIT — see [LICENSE](LICENSE).
