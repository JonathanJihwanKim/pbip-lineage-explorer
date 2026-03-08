# PBIP Lineage Explorer

**Trace dependencies from visuals to source columns in Power BI PBIP projects — instantly, in your browser.**

[![Try It Now](https://img.shields.io/badge/Try%20It%20Now-▶%20Live%20Demo-1a3a5c?style=for-the-badge&logo=powerbi)](https://jonathanjihwankim.github.io/pbip-lineage-explorer/)
[![Fund This Tool](https://img.shields.io/badge/Fund_This_Tool-❤_from_7_EUR/mo-ea4aaa?style=for-the-badge)](https://github.com/sponsors/JonathanJihwanKim)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕-orange?style=for-the-badge)](https://buymeacoffee.com/jihwankim)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

> **No PBIP file?** [Try the live demo with sample data](https://jonathanjihwankim.github.io/pbip-lineage-explorer/) — no setup required.

<!-- TODO: Capture a screenshot of the app with a lineage graph loaded, save as docs/screenshot.png, and uncomment below -->
<!-- ![PBIP Lineage Explorer Screenshot](docs/screenshot.png) -->

### Manual lineage tracing vs. PBIP Lineage Explorer

| | Manual | PBIP Lineage Explorer |
|---|---|---|
| 10 tables, 20 measures, 15 visuals | Hours of work | **< 10 seconds** |
| Visual → measure → column chain | Copy-paste across files | Built-in graph |
| Impact analysis (what breaks if I remove this?) | Not feasible | One click |
| Keeps up with model changes | Start over | Re-run instantly |
| Privacy | Varies | 100% client-side |

## What You Get

Point the tool at your PBIP project folder and get an interactive lineage graph instantly:

- **Cross-folder lineage** — follows references across TMDL model definitions and PBIR visual configurations
- **Impact analysis** — select any node to see upstream dependencies and downstream consumers
- **Interactive D3 graph** — force-directed and tree layouts with zoom, pan, search, and filtering
- **PBIR enrichment** — detects field parameters, calculation groups, and other advanced patterns
- **Orphan detection** — identifies unused columns, measures, and tables
- **Export** — save the graph as SVG or PNG

> Your files never leave your browser. All parsing happens client-side — nothing is uploaded anywhere.

## Quick Start

1. Open the tool: **[jonathanjihwankim.github.io/pbip-lineage-explorer](https://jonathanjihwankim.github.io/pbip-lineage-explorer/)**
2. Click **Open Folder** and select the root of your PBIP project
3. The lineage graph renders immediately — click any node to inspect details, view DAX, and trace dependencies

## How It Works

1. The app reads `.tmdl` and `.pbir` files directly from your local file system using the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
2. It parses tables, columns, measures, relationships, DAX expressions, and visual configurations
3. A lineage graph is built and rendered with D3.js
4. Click any node to trace upstream sources and downstream consumers

## Features

### Graph & Visualization
- **Force-directed and tree layouts** — switch between layouts to explore different views
- **Zoom, pan, and search** — find any node by name; filter by type or table
- **Node color coding** — visuals, measures, columns, tables each have distinct colors

### Impact Analysis
- **Upstream tracing** — see every source column and measure a visual depends on
- **Downstream tracing** — see every visual affected by a given column or measure
- **Orphan detection** — highlight nodes with no consumers

### Export
- **SVG** — scalable vector graphic, ideal for documentation
- **PNG** — raster image for reports and presentations

## Support Development

This tool is **free forever** — built and maintained solo by [Jihwan Kim](https://github.com/JonathanJihwanKim) (Microsoft MVP). If PBIP Lineage Explorer saves you even 30 minutes of lineage tracing, please consider sponsoring. Every contribution goes directly toward new features and maintenance.

**Funding goal: 0 / 200 EUR per month** `░░░░░░░░░░░░░░░░░░░░ 0%`

<a href="https://github.com/sponsors/JonathanJihwanKim"><img src="https://img.shields.io/badge/GitHub%20Sponsors-❤%20Monthly%20from%207%20EUR-ea4aaa?style=for-the-badge" alt="GitHub Sponsors" /></a> <a href="https://buymeacoffee.com/jihwankim"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕%20One--time%20support-orange?style=for-the-badge" alt="Buy Me a Coffee" /></a>

### Sponsor Tiers

| Tier | Amount | Recognition |
|------|--------|-------------|
| **Gold** | 50+ EUR/mo | Logo + link on README and app footer |
| **Silver** | 10+ EUR/mo | Name + link on README |
| **Coffee** | One-time | Name listed below |

### Hall of Sponsors

> **Be the first!** Your name, logo, or company will appear right here. [Become a sponsor](https://github.com/sponsors/JonathanJihwanKim) and join the wall.

## Browser Support

Requires the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API):
- ✅ Chrome 86+
- ✅ Edge 86+
- ✅ Opera 72+
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

## PBIP Folder Structure

The tool expects a standard PBIP project structure:

```
MyProject/
├── MyProject.SemanticModel/
│   └── definition/
│       ├── database.tmdl
│       ├── model.tmdl
│       ├── relationships.tmdl
│       ├── tables/
│       │   ├── Sales.tmdl
│       │   ├── Product.tmdl
│       │   └── ...
│       └── expressions.tmdl (optional)
├── MyProject.Report/ (optional, for visual lineage)
│   └── definition/
│       └── pages/
│           └── Page1/
│               ├── page.json
│               └── visuals/
│                   └── visual1/
│                       └── visual.json
```

## Also by Jihwan Kim

| Tool | Description |
|------|-------------|
| [PBIP Documenter](https://jonathanjihwankim.github.io/pbip-documenter/) | Generate full documentation from PBIP/TMDL semantic models |
| [PBIR Visual Manager](https://jonathanjihwankim.github.io/isHiddenInViewMode/) | Manage visual properties in Power BI PBIR reports |
| [PBIP Impact Analyzer](https://jonathanjihwankim.github.io/pbip-impact-analyzer/) | Analyze dependencies and safely refactor semantic models |
| **PBIP Lineage Explorer** | Trace visual-to-column lineage (you are here) |

## License

[MIT](LICENSE) — Jihwan Kim
