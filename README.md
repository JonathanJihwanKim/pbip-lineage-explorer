# PBIP Lineage Explorer

**Trace DAX measure lineage from visuals to source columns in Power BI PBIP projects — instantly, in your browser.**

[![Try It Now](https://img.shields.io/badge/Try%20It%20Now-▶%20Live%20Demo-1a3a5c?style=for-the-badge&logo=powerbi)](https://jonathanjihwankim.github.io/pbip-lineage-explorer/)
[![Fund This Tool](https://img.shields.io/badge/Fund_This_Tool-❤_from_7_EUR/mo-ea4aaa?style=for-the-badge)](https://github.com/sponsors/JonathanJihwanKim)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕-orange?style=for-the-badge)](https://buymeacoffee.com/jihwankim)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

> **No PBIP file?** [Try the live demo with sample data](https://jonathanjihwankim.github.io/pbip-lineage-explorer/) — no setup required.

![PBIP Lineage Explorer Screenshot](docs/screenshot.png)

---

## Why This Tool?

If you've ever spent hours clicking through Power BI files trying to figure out which source columns feed into a KPI, or which visuals break when you rename a measure — this tool exists because of that pain.

PBIP Lineage Explorer reads your Power BI Project (PBIP) files directly in the browser and builds an interactive lineage graph in seconds. No uploads, no server, no installs.

### Manual lineage tracing vs. PBIP Lineage Explorer

| | Manual | PBIP Lineage Explorer |
|---|---|---|
| 10 tables, 20 measures, 15 visuals | Hours of work | **< 10 seconds** |
| Visual → measure → column chain | Copy-paste across files | Built-in graph |
| Impact analysis (what breaks if I remove this?) | Not feasible | One click |
| Source column mapping (before rename) | Spreadsheet archaeology | Automatic |
| Keeps up with model changes | Start over | Re-run instantly |
| Privacy | Varies | 100% client-side |

---

## Features

### For Power BI Developers

- **Cross-folder lineage** — follows references across TMDL model definitions and PBIR visual configurations
- **DAX measure chain** — see the full dependency tree with syntax-highlighted DAX expressions
- **Impact analysis** — select any node to see upstream dependencies and downstream consumers
- **Field parameter & calculation group detection** — identifies advanced patterns automatically
- **Orphan detection** — find unused measures that no visual references
- **Interactive D3 graph** — tree layout with zoom, pan, search, and filtering
- **Copy DAX** — one-click copy of any measure's DAX expression

### For Data Engineers

- **Source Column Mapping** — dedicated view showing all columns mapped from PBI names back to original source columns
- **Column rename tracking** — see the full rename chain: Original Source → PQ Column → PBI Column
- **CSV export** — download the source mapping table for documentation or tickets
- **Copy lineage as text** — paste lineage summaries into Confluence, Jira, or Slack
- **Data source identification** — SQL Server, BigQuery, Fabric Lakehouse, Web APIs, Excel, CSV

### Export

- **SVG** — scalable vector graphic, ideal for documentation
- **PNG** — raster image for reports and presentations
- **CSV** — source column mapping table
- **Text** — copy lineage summaries to clipboard

> Your files never leave your browser. All parsing happens client-side — nothing is uploaded anywhere.

---

## Quick Start

1. Open the tool: **[jonathanjihwankim.github.io/pbip-lineage-explorer](https://jonathanjihwankim.github.io/pbip-lineage-explorer/)**
2. Click **Open Project Folder** and select the root of your PBIP project
3. The lineage graph renders immediately — click any measure or visual to trace dependencies

<!-- TODO: Add numbered screenshot of each step -->

---

## Use Cases

### Questions Power BI Developers Ask

- **"Which visuals break if I rename this column?"** — Select the column and see all downstream visuals instantly
- **"What measures are unused in my model?"** — Enable the orphan filter to find measures with no visual consumers
- **"How is this KPI calculated?"** — Click the measure to see its full DAX dependency chain
- **"Does this visual use a field parameter?"** — FP and CG badges are detected and shown automatically

### Questions Data Engineers Ask Power BI Developers

- **"What source columns does this measure use?"** — Open Source Map to see the full PBI Column → Source Column mapping
- **"What's the original column name before Power BI renamed it?"** — Rename chains show the full path: `SalesAmount → Amount → Amount`
- **"Which tables from our data warehouse are used in this report?"** — Source lineage traces all the way to BigQuery, SQL Server, or Fabric
- **"Can I get this mapping as a CSV?"** — Click Export CSV in the Source Map view
- **"How is this DAX measure actually calculated?"** — The DAX chain shows the formula with syntax highlighting and column references

---

## How It Works

1. The app reads `.tmdl` and `.pbir` files directly from your local file system using the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
2. It parses tables, columns, measures, relationships, DAX expressions, and visual configurations
3. A lineage graph is built with nodes (tables, columns, measures, visuals, sources) and edges (dependencies)
4. Click any node to trace upstream sources and downstream consumers
5. The Source Map view provides a flat, searchable table of all column mappings

---

## Browser Support

Requires the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API):
- ✅ Chrome 86+
- ✅ Edge 86+
- ✅ Opera 72+
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

---

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

---

## Support Development

This tool is **free forever** — built and maintained solo by [Jihwan Kim](https://github.com/JonathanJihwanKim) (Microsoft MVP). If PBIP Lineage Explorer saves you even 30 minutes of lineage tracing, please consider sponsoring.

Every contribution goes directly toward new features, maintenance, and keeping this tool free for the entire Power BI community.

**Funding goal: 0 / 200 EUR per month** `░░░░░░░░░░░░░░░░░░░░ 0%`

### Why Sponsor?

- **Solo developer** — your support is the only funding this project has
- **Free forever** — no premium tiers, no paywalls, no ads
- **Active development** — new features ship regularly based on community feedback
- **Open source** — your sponsorship keeps open-source Power BI tooling alive

<a href="https://github.com/sponsors/JonathanJihwanKim"><img src="https://img.shields.io/badge/GitHub%20Sponsors-❤%20Monthly%20from%207%20EUR-ea4aaa?style=for-the-badge" alt="GitHub Sponsors" /></a> <a href="https://buymeacoffee.com/jihwankim"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕%20One--time%20support-orange?style=for-the-badge" alt="Buy Me a Coffee" /></a>

### Sponsor Tiers

| Tier | Amount | Recognition |
|------|--------|-------------|
| **Gold** | 50+ EUR/mo | Logo + link on README and app footer |
| **Silver** | 10+ EUR/mo | Name + link on README |
| **Coffee** | One-time | Name listed below |

### Hall of Sponsors

> **Be the first!** Your name, logo, or company will appear right here. [Become a sponsor](https://github.com/sponsors/JonathanJihwanKim) and join the wall.

---

## Also by Jihwan Kim

| Tool | Description |
|------|-------------|
| [PBIP Documenter](https://jonathanjihwankim.github.io/pbip-documenter/) | Generate full documentation from PBIP/TMDL semantic models |
| [PBIR Visual Manager](https://jonathanjihwankim.github.io/isHiddenInViewMode/) | Manage visual properties in Power BI PBIR reports |
| [PBIP Impact Analyzer](https://jonathanjihwankim.github.io/pbip-impact-analyzer/) | Analyze dependencies and safely refactor semantic models |
| **PBIP Lineage Explorer** | Trace visual-to-column lineage (you are here) |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE) — Jihwan Kim
