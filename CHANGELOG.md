# Changelog

All notable changes to PBIP Lineage Explorer will be documented in this file.

## [Unreleased]

### Added
- **"Try Sample Project" button** — One-click demo with bundled sample PBIP project for first-time visitors
- **Impact Analysis panel** — Slide-over panel showing upstream/downstream dependencies for any measure, with export to Markdown
- **Model Health Dashboard** — Overview of model stats, orphan measures, data sources, and relationships
- **Import/DirectQuery mode badges** — Source lineage table and D3 tree now show storage mode (Import/DQ/Dual)
- **Circular reference warnings** — Red badge on circular measures, warning banner in lineage view, dashed border on tree nodes
- **SVG/PNG tree export** — Export D3 lineage tree as SVG or PNG with attribution watermark
- **Keyboard shortcut help** — `?` key opens popover listing all shortcuts; search placeholder shows `/` hint
- **Progressive disclosure** — DAX chain and source lineage sections collapse by default with summary counts
- **USERELATIONSHIP display** — Shows relationship pairs and cross-filter direction in DAX chain
- **Collapse/expand tree nodes** — Click nodes with children to toggle subtrees in D3 visualization
- **Session value counter** — Footer showing measures traced and columns mapped during session
- **Improved sponsor toast** — Fires on first lineage trace with personalized copy showing trace depth
- **Shareable lineage URLs** — Deep links via URL hash (`#measure=...`, `#visual=...`) so selections persist across page reloads
- **Drag-and-drop file loading** — Drop a PBIP project folder onto the welcome screen to load it (File System Access API + webkit fallback)
- **ARIA accessibility** — `role`, `aria-label`, `aria-selected`, `aria-live` attributes on toolbar, sidebar tabs, search inputs, panels, and overlays; `:focus-visible` rings on all interactive elements
- **JSON-LD structured data** — Schema.org SoftwareApplication metadata for search engine discovery
- **Inline SVG favicon** — Lineage graph icon in browser tab
- **Open Graph meta tags** — Social preview image for link sharing

## [1.0.0] — 2026-03-15

### Added
- **DAX measure lineage tracing** — 4-section output: visuals, DAX chain, source lineage, summary trees
- **Visual lineage tracing** — Select a visual to see all measures it references (direct and via field parameters)
- **D3.js interactive tree** — Left-to-right tree with zoom, pan, and color-coded nodes by type
- **Field parameter support** — Detects FP tables, resolves display names, shows FP binding badges
- **Calculation group detection** — Identifies calculation groups and calculation items
- **Source column mapping** — Full-page source map view with table-to-source tracing
- **Page layout visualization** — Canvas-based page layout showing visual positions and types
- **TMDL parser** — Parses tables, columns, measures, relationships, expressions from `.tmdl` files
- **DAX expression parser** — Extracts measure, column, and table references from DAX expressions
- **PBIR parser** — Parses visual configurations, field mappings, and page layouts from PBIR JSON
- **Rename chain tracking** — Detects column renames across Power Query → model → source layers
- **USERELATIONSHIP detection** — Identifies activated relationships in DAX via `USERELATIONSHIP()` calls
- **Search** — `/` shortcut to filter measures and visuals in the sidebar
- **Keyboard navigation** — `Alt+Left` for back, `Escape` to close overlays
- **Report picker** — Select from multiple reports when a project contains several
- **Dark theme** — Single dark theme with CSS custom properties
- **VS Code extension** — Tree views for measures, visuals, and source mapping with webview lineage panel
- **100% client-side** — All processing in browser, files never leave the machine
- **GitHub Pages deployment** — Automated deploy via GitHub Actions
