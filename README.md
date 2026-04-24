# PBIP Lineage Explorer

**The only free tool that answers "where does this data come from?" in seconds — tracing Power BI visuals all the way back to the original source column, before any Power Query renames.**

- 🔍 **Trace any Power BI visual → measure → column → source** in one click
- 🔒 **100% in your browser** — files never uploaded, no account, no server
- ⚡ **Works on TMDL/PBIR** — the format Power BI Desktop now saves by default

[![Try Live Demo](https://img.shields.io/badge/Try%20Live%20Demo-▶%20Open%20in%20Browser-28a745?style=for-the-badge&logo=powerbi)](https://jonathanjihwankim.github.io/pbip-lineage-explorer/)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤%20Support%20This%20Tool-ea4aaa?style=for-the-badge&logo=github-sponsors)](https://github.com/sponsors/JonathanJihwanKim)
[![GitHub Stars](https://img.shields.io/github/stars/JonathanJihwanKim/pbip-lineage-explorer?style=for-the-badge&logo=github&color=f0a500)](https://github.com/JonathanJihwanKim/pbip-lineage-explorer/stargazers)

Built by a **Microsoft MVP** · Free forever · 100% client-side · Your files never leave your browser · [MIT License](LICENSE)

![PBIP Lineage Explorer Screenshot](docs/screenshot.png)
*Click a visual → see the full chain from visual to BigQuery source column, including Power Query renames.*

> **No PBIP file?** [Try it now with built-in sample data](https://jonathanjihwankim.github.io/pbip-lineage-explorer/) — no setup required.

> Using this at work? [A small sponsorship](#support-this-project) keeps it maintained and free.

---

## Quick Start

1. Open **[jonathanjihwankim.github.io/pbip-lineage-explorer](https://jonathanjihwankim.github.io/pbip-lineage-explorer/)**
2. Click **Open Project Folder** and select your PBIP project root (the folder containing `.SemanticModel` and `.Report` subfolders)
3. Click any **visual** in the left panel → see every measure, column, and source it uses
4. Click any **measure** → trace its full DAX dependency chain to source

> Requires **Chrome 86+** or **Edge 86+** ([File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)). Firefox and Safari are not supported.

### Data Engineer Quick Start

1. Open your PBIP project folder
2. Click **Visuals** tab in the left panel → click any chart or table visual
3. The **Source Columns — All Measures** section loads immediately, showing every source table/column
4. Click **Grouped by Source** to group by source database/table — see which BigQuery datasets, SQL schemas, or files feed this visual
5. For the full model mapping: click **Source Map** in the toolbar → search, sort, and export as CSV

### Power BI Developer Quick Start

1. Open your PBIP project folder
2. Click **Measures** tab → click any measure
3. See the interactive tree (Visual → Measure → Table → Column → Source)
4. Click **↗ Impact** next to any measure → see every downstream visual and upstream dependency
5. Click **Source-First View** toggle to see source columns before DAX (great for reviewing with data engineers)

> *Saved you an hour? A [coffee-sized sponsorship](https://github.com/sponsors/JonathanJihwanKim) keeps this free for everyone.*

---

## The Problem

### For data engineers working with Power BI developers

- A Power BI developer gives you a dashboard. You need to know: **"What BigQuery/SQL tables and columns feed this visual?"** You trace through 30 TMDL files by hand.
- You see a column called `customer_id` in the Power BI model. The source column is actually `cust_fk`. **No tool shows you this rename chain** without opening every Power Query step manually.
- A data engineer asks: **"Which source tables are used in this dashboard?"** The Power BI developer has to dig through the semantic model and piece it together from memory.
- You need to validate that a source column rename won't silently break a report. **There's no way to check without deploying and hoping.**
- Someone modifies a shared DAX measure — **you don't know which visuals are impacted downstream.**

**Each of these takes hours. This tool does it in seconds.**

| | Manual | PBIP Lineage Explorer |
|---|---|---|
| "What source tables feed this visual?" | Trace through 30 TMDL files | **One click → Source Columns section** |
| Source column before Power Query renames | Open each PQ step manually | **Full rename chain: source → PQ → PBI** |
| Visual → measure → source column chain | Copy-paste across dozens of files | **Interactive tree: Visual → Table → Column → Source** |
| Impact analysis ("what breaks?") | Not feasible at scale | **One click — upstream + downstream** |
| What changed in the last 5 commits? | Diff raw JSON by hand | **Automatic change report with 30+ change types** |
| Downstream impact of a measure edit | Hope and pray | **Traced through refs, field params & calc groups** |

---

## Who Is This For?

### Data Engineers & Power BI Developers working together

This tool directly bridges the gap between the two teams:

**Data engineers get:**
- A "Source Columns" section right at the top of every visual — showing every source table and column that feeds it, with full rename chains (source name → Power Query name → Power BI name)
- A flat **Source Map** table (toolbar button) listing every PBI column mapped to its original source column, database, and schema — exportable as CSV
- **Group by Source** view to see all columns from a given BigQuery dataset, SQL schema, or file source in one block
- "Source-First View" toggle to see source column mapping before the DAX chain

**Power BI developers get:**
- DAX dependency tree — interactive D3 graph showing every referenced measure and column with syntax-highlighted DAX
- Calculation group lineage — see all calculation items (YTD, QTD, MTD) with their DAX expressions
- Field parameter resolution — see ALL measures a field parameter contains, not just the active one
- Impact analysis — select any measure to instantly see what breaks if you change it
- Orphan detection — find measures that no visual references
- Commit-by-commit change detection with downstream impact tracing

**Team Leads & Governance:**
- Track changes across commits (measures, columns, relationships, source expressions)
- Export lineage as CSV/Markdown for documentation
- Run impact analysis before approving PRs
- Model Health Dashboard — tables, columns, measures, relationships, data sources at a glance

---

## What You Get

### For Everyone

- **Visual-to-source lineage in one click** — full chain from report visual to original source column, through any number of DAX measures and sub-measures
- **Interactive D3 tree** — Visual → Measure → Table → Column → Power Query → Source, with zoom/pan and click-to-expand nodes
- **Export** — SVG, PNG, CSV, Markdown — or copy lineage to clipboard

### For Data Engineers

- **Source Columns section** — appears at the top of every visual's lineage, listing every source table and column that feeds it
- **Full rename chain tracking** — when a source column is renamed in Power Query, you see `source_name → pq_name → pbi_name` at every level
- **Group by Source** toggle — view aggregated source columns grouped by source database/table instead of a flat list
- **Source-First View** — swap section order so source mapping appears before the DAX chain
- **Source Map view** — flat, searchable, sortable table mapping every PBI column to its source. Filterable by source type. Exportable as CSV
- **Source node display** — in the tree, source nodes show the source type (BigQuery, SQL, etc.), server, database, schema, and table name
- **Column rename indicators** — column nodes show `← src: original_name` in amber when a rename happened

### For Power BI Developers

- **DAX dependency tree** — recursive tree of measure dependencies with syntax-highlighted DAX, Copy buttons, and USERELATIONSHIP display
- **Calculation group lineage** — see all calculation items (YTD, QTD, MTD) with their full DAX expressions
- **Field parameter resolution** — see ALL measures a field parameter contains, not just the active one
- **Impact analysis** — click ↗ Impact on any measure to see upstream and downstream dependencies grouped by type
- **Orphan detection** — find measures that no visual references
- **Page layout minimap** — see every visual positioned as in Power BI, click to trace lineage
- **Model Health Dashboard** — tables, columns, measures, relationships, data sources at a glance

### Change Intelligence

- **Commit-by-commit change detection** — see exactly what changed, when, and who is impacted
- **30+ change types across 8 scopes** — pages, visuals, filters, measures, bookmarks, columns, relationships, and source expressions
- **Downstream impact tracing** — when a measure changes, see every visual affected through direct refs, field parameters, and calculation groups
- **Human-readable descriptions** — no raw JSON diffs, just plain-language summaries
- **Works in browser and VS Code** — same detection engine, both platforms

> Your files never leave your browser. All parsing happens client-side — nothing is uploaded anywhere.

> *Every feature above is free. If your team relies on this tool, [sponsor its development](https://github.com/sponsors/JonathanJihwanKim) — even one-time support helps.*

---

## Why This Tool?

Enterprise platforms like Microsoft Purview, Alation, and Blindata are excellent for organization-wide data governance. Tools like Measure Killer and Power BI Sentinel solve specific problems well within their scope.

This tool fills a different gap: **instant, client-side, column-level lineage for PBIP projects** — no server, no license, no setup. It's designed for the developer or data engineer who needs an answer *right now*.

| What makes this tool different | |
|---|---|
| **Column-level lineage with renames** | Trace from visual all the way to the original source column — including Power Query rename chains |
| **Visual → Table → Column → Source** | The tree now shows Table and Power Query nodes, completing the full chain |
| **Source grouping by database/table** | View all source columns grouped by their origin — ideal for data engineers reviewing dashboards |
| **Field parameter resolution** | See ALL measures a field parameter contains, not just the active one |
| **Calculation group lineage** | See every calculation item with its DAX expression |
| **100% client-side** | Your files never leave your browser — no upload, no server, no account |
| **PBIP native** | Built for TMDL/PBIR from the ground up — the file formats [Power BI Desktop now uses by default](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview?wt.mc_id=DP-MVP-5004989) |
| **Free and open-source** | MIT licensed, no premium tiers, no paywalls |

---

## FAQ

**Is my data really safe?**
Yes. Nothing leaves your browser. All parsing happens locally in JavaScript. The full source code is MIT-licensed and auditable on GitHub.

**Do I need to install anything?**
No. It runs directly in Chrome 86+ or Edge 86+ — just open the URL. A VS Code extension is also available if you prefer to work inside your editor.

**What if my PBIP uses calculation groups, field parameters, or custom connectors?**
All supported. Calculation group lineage, field parameter resolution, and source column tracing are built into the core engine.

**Can I use this at work on proprietary reports?**
Yes. MIT license — use it freely. No telemetry, no network requests, no account. Your files never leave the browser.

---

## Support This Project

I build and maintain this tool solo. It's **free forever** — no premium tiers, no paywalls, no ads.

Goal: make this a funded side-project so development continues at full steam.

If this saved you an afternoon of manual lineage tracing, a one-time coffee or monthly sponsorship funds the next feature.

**Why sponsor?**
- Funds 100% of development (solo-maintained, no company backing)
- Keeps every feature free, forever — no paywalls, ever
- Directly shapes the roadmap — sponsors get priority on feature requests
- Your name or company logo visible to a growing Power BI community

> 🎯 The **Expert tier** — 30 minutes monthly with a Microsoft MVP — is the flagship. No other open-source Power BI tool offers direct MVP access at this price.

<a href="https://github.com/sponsors/JonathanJihwanKim"><img src="https://img.shields.io/badge/GitHub%20Sponsors-❤%20Monthly%20from%207%20EUR-ea4aaa?style=for-the-badge" alt="GitHub Sponsors" /></a> <a href="https://buymeacoffee.com/jihwankim"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕%20One--time%20support-orange?style=for-the-badge" alt="Buy Me a Coffee" /></a>

| Tier | Amount | What You Get |
|------|--------|--------------|
| **Expert** | **25 EUR/mo** | **30-min monthly "Ask a Power BI MVP" video call** + name in app + early access |
| **Gold** | 50+ EUR/mo | Company logo + link on README and app footer + all Expert benefits |
| **Professional** | 15 EUR/mo | Name on README + in-app Sponsors wall + early access to features |
| **Community** | 7 EUR/mo | Name on README + sponsor badge |
| **Coffee** | One-time | A personal thank-you + name listed below |

See [SPONSORS.md](SPONSORS.md) for full tier details, corporate invoicing, and FAQ.

### Community & Reach

[![GitHub Stars](https://img.shields.io/github/stars/JonathanJihwanKim/pbip-lineage-explorer?style=flat&logo=github)](https://github.com/JonathanJihwanKim/pbip-lineage-explorer/stargazers)

<a id="sponsors"></a>

*Testimonials land here as users share their experience — [tag me on LinkedIn](https://www.linkedin.com/in/jihwankim1975/) if this tool helped you.*

---

## VS Code Extension

Also available as a VS Code extension for developers who work directly in PBIP/TMDL files.

- Search **"PBIP Lineage Explorer"** in the VS Code Extensions marketplace
- Auto-activates when your workspace contains `.tmdl` files
- **Sidebar panels**: Measure Explorer, Orphan Measures, Model Stats, **Change History**
- **CodeLens**: inline "Trace Lineage" links above measure definitions
- **Change History panel**: auto-scans recent commits, shows changes grouped by commit → scope → detail with impact badges

---

## Also by Jihwan Kim

| Tool | Description |
|------|-------------|
| [PBIP Documenter](https://jonathanjihwankim.github.io/pbip-documenter/) | Generate full documentation from PBIP/TMDL semantic models |
| [PBIR Visual Manager](https://jonathanjihwankim.github.io/isHiddenInViewMode/) | Manage visual properties in Power BI PBIR reports |
| [PBIP Impact Analyzer](https://jonathanjihwankim.github.io/pbip-impact-analyzer/) | Analyze dependencies and safely refactor semantic models |

---

## More

- [Detailed reference guide](docs/reference.md) — UI overview, keyboard shortcuts, use cases, folder structure
- [Contributing](CONTRIBUTING.md) — development setup and PR guidelines
- [License](LICENSE) — MIT

---

If PBIP Lineage Explorer saved your team time, [sponsor the project](https://github.com/sponsors/JonathanJihwanKim) — every contribution keeps it free and actively maintained for the whole community.

<a href="https://github.com/sponsors/JonathanJihwanKim"><img src="https://img.shields.io/badge/Sponsor-❤-ea4aaa?style=flat-square" alt="Sponsor" /></a> <a href="https://buymeacoffee.com/jihwankim"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕-orange?style=flat-square" alt="Buy Me a Coffee" /></a>

---

**Built for:** Power BI · Microsoft Fabric · PBIP · PBIR · TMDL · Data Lineage · DAX · Semantic Models · Impact Analysis · Data Governance · Data Engineering
