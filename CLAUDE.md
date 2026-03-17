# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

PBIP Lineage Explorer — a browser-based tool that traces DAX measure lineage in Power BI PBIP projects. Also ships as a VS Code extension. 100% client-side, no server, files never leave the browser.

## Commands

```bash
npm install          # Install all workspace dependencies
npm run dev          # Vite dev server at http://localhost:5173
npm run build        # Production build to dist/
npm run test         # Run core tests (vitest, one-shot)
npm run test:watch   # Run core tests in watch mode
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

- **`packages/core/`** — Platform-independent analysis engine. Accepts `Map<path, content>` and returns a lineage graph. Contains all parsers (TMDL, DAX, PBIR), graph builder, lineage tracer, and impact analysis. This is the shared logic used by both web and VS Code.
- **`src/`** (root) — Web app. Vanilla JS + D3.js, no framework. `main.js` orchestrates parsing via core, manages app state, and wires up UI components in `src/ui/`. Reads files via browser File System Access API (`src/parser/pbipReader.js`).
- **`packages/vscode/`** — VS Code extension. Reads files via workspace API (`vscodeReader.js`), uses core for analysis, renders lineage in a webview panel and tree views.

**Import alias**: `@pbip-lineage/core` resolves to `packages/core/src/` (configured in both `vite.config.js` and `vitest.config.js`).

### Core pipeline (packages/core)

1. Parse TMDL → tables, columns, measures
2. Parse DAX expressions → dependency refs (measures, columns, tables)
3. Parse PBIR → visual configurations and field mappings
4. Detect enrichments (field parameters, calculation groups)
5. Build graph (nodes + edges) and compute stats

### Web app data flow

`handleOpenFolder()` → File System Access API → core `analyze()` → populate sidebar (measures/visuals) → user selects item → `traceMeasureLineage()` or `traceVisualLineage()` → render D3 tree + lineage detail view.

## Key Constraints

- **Vanilla JS only** — no React/Vue/Angular. ES modules throughout.
- **Client-side only** — no server-side code, no network requests for data.
- **Dark theme** — single CSS file (`styles/main.css`) with CSS custom properties.
- **Browser requirement** — Chrome/Edge (File System Access API).
- **ESM** — `"type": "module"` in all package.json files.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys `dist/` to GitHub Pages on push to `main`.
