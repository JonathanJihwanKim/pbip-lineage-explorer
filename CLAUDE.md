# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

PBIP Lineage Explorer — a browser-based tool that traces DAX measure lineage in Power BI PBIP projects. Also ships as a VS Code extension. 100% client-side, no server, files never leave the browser.

## Commands

```bash
npm install                         # Install all workspace dependencies
npm run dev                         # Vite dev server at http://localhost:5173
npm run build                       # Production build to dist/
npm run test                        # Run core tests (vitest, one-shot)
npm run test:watch                  # Run core tests in watch mode
npm run test -- daxParser           # Run a single test file by name pattern
npm run test -- packages/core/tests/diff  # Run an entire subfolder
```

VS Code extension (run from `packages/vscode/`):
```bash
npm run build        # esbuild bundle → out/extension.js
npm run watch        # esbuild watch mode
npm run package      # Create .vsix via vsce
```

Tests live in `packages/core/tests/` and cover the core analysis engine only. Test with sample data in `public/sample-pbip/`.

## Architecture

**Monorepo** with npm workspaces (`packages/*`):

- **`packages/core/`** — Platform-independent analysis engine. Two pillars: **lineage** (`parser/`, `graph/`) and **change detection** (`diff/`). Shared logic used by both web and VS Code.
- **`src/`** (root) — Web app. Vanilla JS + D3.js, no framework. `main.js` orchestrates parsing via core, manages app state, and wires up UI components in `src/ui/`. Reads files via browser File System Access API (`src/parser/pbipReader.js`); reads git history via `isomorphic-git` (`src/parser/gitFs.js`, `gitScanner.js`).
- **`packages/vscode/`** — VS Code extension. Reads files via workspace API (`vscodeReader.js`), uses core for analysis, renders lineage in a webview panel and tree views (`providers/`, `webview/`, `git/`).
- **`packages/web/`** — Currently empty placeholder. The web app still lives at the repo root (`src/`, `index.html`); do **not** add code here without checking whether a migration is intended.

**Import alias**: `@pbip-lineage/core` resolves to `packages/core/src/` (configured in both `vite.config.js` and `vitest.config.js`).

### Core public API (`packages/core/src/index.js`)

Two top-level entry points:
- **`analyze({ modelStructure, reportStructure })`** — runs the full pipeline on pre-parsed structures (output of `identifyProjectStructure()`).
- **`analyzeFromFiles({ modelFiles, reportFiles })`** — convenience wrapper that takes `Map<path, content>` and calls `identifyProjectStructure()` + `analyze()` internally.

Both return `{ graph, stats, enrichments, model, report }`. Lower-level parsers, graph utilities, and constants are also re-exported for callers that need finer control.

### Lineage pipeline (parser/ + graph/)

1. Parse TMDL → tables, columns, measures (`tmdlParser.js`)
2. Parse DAX expressions → dependency refs: measures, columns, tables, USERELATIONSHIP (`daxParser.js`)
3. Parse PBIR → visual configurations and field mappings (`pbirParser.js`)
4. Detect enrichments — field parameters, calculation groups (`enrichment.js`)
5. Build graph (nodes + edges), apply enrichments, compute stats (`graph/`)

### Change-detection pipeline (diff/)

Independent of the lineage pipeline. Given two PBIP file snapshots (typically a git commit pair), `detectChanges()` returns scope-tagged change records via per-scope diffs (`measureDiff`, `visualDiff`, `filterDiff`, `pageDiff`, `bookmarkDiff`, `relationshipDiff`, `sourceDiff`). `resolveImpact()` then traces each change through the lineage graph to find affected visuals — including indirect impact via field parameters and calculation groups. Change types and scopes are enumerated in `diff/changeTypes.js`.

### Web app data flow

`handleOpenFolder()` → File System Access API → core `analyzeFromFiles()` → populate sidebar (measures/visuals) → user selects item → `traceMeasureLineage()` or `traceVisualLineage()` → render D3 tree + lineage detail view. Change History uses `gitScanner.js` to walk commits and feeds pairs into `detectChanges()`.

## Key Constraints

- **Vanilla JS only** — no React/Vue/Angular. ES modules throughout.
- **Client-side only** — no server-side code, no network requests for data.
- **Dark theme** — single CSS file (`styles/main.css`) with CSS custom properties.
- **Browser requirement** — Chrome/Edge (File System Access API).
- **ESM** — `"type": "module"` in all package.json files.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys `dist/` to GitHub Pages on push to `main`.
