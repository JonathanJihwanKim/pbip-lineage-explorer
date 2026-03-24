# PBIP Lineage Explorer

**The only free tool that traces Power BI lineage from Visual → Measure → Source Column — including Power Query renames, field parameters, and calculation groups.** Open your PBIP folder and get instant lineage tracing + commit-by-commit change intelligence.

[![Try Live Demo](https://img.shields.io/badge/Try%20Live%20Demo-▶%20Open%20in%20Browser-28a745?style=for-the-badge&logo=powerbi)](https://jonathanjihwankim.github.io/pbip-lineage-explorer/)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤%20Support%20This%20Tool-ea4aaa?style=for-the-badge&logo=github-sponsors)](https://github.com/sponsors/JonathanJihwanKim)

![GitHub stars](https://img.shields.io/github/stars/JonathanJihwanKim/pbip-lineage-explorer?style=flat) Built by a **Microsoft MVP** · Free forever · 100% client-side · Your files never leave your browser · [MIT License](LICENSE)

![PBIP Lineage Explorer Screenshot](docs/screenshot.png)

> **No PBIP file?** [Try it now with built-in sample data](https://jonathanjihwankim.github.io/pbip-lineage-explorer/) — no setup required.

---

## The Problem

- You rename a column and 3 reports break. **You have no idea which ones.**
- You need to trace a KPI back to its source columns. You click through **Power BI Desktop for an hour.**
- A colleague commits changes to the `.Report` folder — **you have no idea what visuals, filters, or measures changed.**
- Someone modifies a shared measure — **you don't know which visuals are impacted downstream.**
- A data engineer asks: "What are the real source tables and columns before Power Query renames?" You open **47 TMDL files** and start copy-pasting.

**Each of these takes hours. This tool does it in seconds.**

| | Manual | PBIP Lineage Explorer |
|---|---|---|
| Visual → measure → source column chain | Copy-paste across dozens of files | **One-click interactive graph** |
| Impact analysis ("what breaks?") | Not feasible at scale | **One click** |
| What changed in the last 5 commits? | Diff raw JSON by hand | **Automatic change report with 30+ change types** |
| Downstream impact of a measure edit | Hope and pray | **Traced through refs, field params & calc groups** |
| Source column mapping before PQ rename | Spreadsheet archaeology | **Automatic with full rename chain** |
| Calculation group items & expressions | Open each TMDL file manually | **All items shown with DAX** |

---

## Why This Tool?

Enterprise platforms like Microsoft Purview, Alation, and Blindata are excellent for organization-wide data governance. Tools like Measure Killer and Power BI Sentinel solve specific problems well within their scope.

This tool fills a different gap: **instant, client-side, column-level lineage for PBIP projects** — no server, no license, no setup. It's designed for the developer or data engineer who needs an answer *right now*.

| What makes this tool different | |
|---|---|
| **Column-level lineage** | Trace from visual all the way down to the original source column — before Power Query renames |
| **Field parameter resolution** | See ALL measures a field parameter contains, not just the active one |
| **Calculation group lineage** | See every calculation item with its DAX expression |
| **100% client-side** | Your files never leave your browser — no upload, no server, no account |
| **PBIP native** | Built for TMDL/PBIR from the ground up — the file formats [Power BI Desktop now uses by default](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview?wt.mc_id=DP-MVP-5004989) |
| **Free and open-source** | MIT licensed, no premium tiers, no paywalls |

---

## Who Is This For?

**Power BI Developers** — Trace DAX dependencies across measures, find orphan measures, understand downstream impact before making changes, see field parameter and calculation group configurations at a glance.

**Data Engineers** — Find the real source tables and columns *before* Power Query renames. Get an aggregated source mapping across all measures on a visual. Switch to Source View to see sources first, DAX second.

**Team Leads & Governance** — Track changes across commits (measures, columns, relationships, source expressions). Export lineage as CSV/Markdown for documentation. Run impact analysis before approving PRs.

---

## What You Get

### Lineage Tracking

- **Visual-to-source lineage in one click** — trace any measure or visual through its full dependency chain down to the original source column
- **DAX dependency tree** — interactive D3 graph showing every referenced measure and column with syntax-highlighted DAX
- **Calculation group lineage** — see all calculation items (YTD, QTD, MTD, etc.) with their DAX expressions, not just the default selection
- **Field parameter resolution** — see ALL measures a field parameter contains, not just the active one
- **Source column mapping** — flat table showing PBI Column → Source Column with full Power Query rename chain tracking
- **Aggregated source columns** — one table showing every source column across all measures on a visual
- **DAX View / Source View toggle** — data engineers see sources first, PBI developers see DAX first
- **Impact analysis** — select any node to instantly see what breaks if you change it
- **Page layout minimap** — see every visual on a report page positioned as in Power BI, click to trace lineage
- **Orphan detection** — find measures that no visual references
- **Model Health Dashboard** — tables, columns, measures, relationships, data sources at a glance
- **Export** — SVG, PNG, CSV, Markdown, or copy lineage to clipboard (all exports include attribution for organic sharing)

### Change Intelligence

- **Commit-by-commit change detection** — see exactly what changed, when, and who is impacted
- **30+ change types across 8 scopes** — pages, visuals, filters, measures, bookmarks, columns, relationships, and source expressions
- **Column schema changes** — detect column add/remove/type changes between commits
- **Relationship changes** — detect relationship add/remove/property changes
- **Source expression changes** — detect M query and data source modifications
- **Calculation item changes** — detect calc group item add/remove/modify with downstream impact
- **Downstream impact tracing** — when a measure changes, see every visual affected through direct refs, field parameters, and calculation groups
- **Human-readable descriptions** — no raw JSON diffs, just plain-language summaries
- **Works in browser and VS Code** — same detection engine, both platforms

> Your files never leave your browser. All parsing happens client-side — nothing is uploaded anywhere.

---

## Quick Start

1. Open **[jonathanjihwankim.github.io/pbip-lineage-explorer](https://jonathanjihwankim.github.io/pbip-lineage-explorer/)**
2. Click **Open Project Folder** and select your PBIP project root (the folder with `.SemanticModel` and `.Report` subfolders)
3. Click any measure or visual in the sidebar to trace its lineage
4. Use **Export** buttons to save the lineage graph as SVG/PNG or source mappings as CSV

> Requires **Chrome 86+** or **Edge 86+** ([File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)). Firefox and Safari are not supported.

---

## Support This Project

I build and maintain this tool solo. It's **free forever** — no premium tiers, no paywalls, no ads. Sponsorship funds my development tools and keeps this free for everyone.

If this tool saved you even one hour of manual DAX tracing, that's worth more than the price of a coffee.

**Funding goal: 0 / 200 EUR per month** `░░░░░░░░░░░░░░░░░░░░ 0%`

<a href="https://github.com/sponsors/JonathanJihwanKim"><img src="https://img.shields.io/badge/GitHub%20Sponsors-❤%20Monthly%20from%207%20EUR-ea4aaa?style=for-the-badge" alt="GitHub Sponsors" /></a> <a href="https://buymeacoffee.com/jihwankim"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕%20One--time%20support-orange?style=for-the-badge" alt="Buy Me a Coffee" /></a>

| Tier | Amount | What You Get |
|------|--------|--------------|
| **Expert** | **25 EUR/mo** | **30-min monthly "Ask a Power BI MVP" video call** + name in app + early access |
| **Gold** | 50+ EUR/mo | Company logo + link on README and app footer + all Expert benefits |
| **Professional** | 15 EUR/mo | Name on README + in-app Sponsors wall + early access to features |
| **Community** | 7 EUR/mo | Name on README + sponsor badge |
| **Coffee** | One-time | A personal thank-you + name listed below |

> The **Expert tier** is unique in open source — a monthly 30-minute video call where you can ask a Microsoft MVP anything about Power BI, DAX, TMDL, PBIP, or data modeling. No other tool offers this.

### Hall of Sponsors

> **Be the first!** Your name, logo, or company will appear right here. [Become a sponsor](https://github.com/sponsors/JonathanJihwanKim) and join the wall.

---

## VS Code Extension

Also available as a VS Code extension for developers who work directly in PBIP/TMDL files.

- Search **"PBIP Lineage Explorer"** in the VS Code Extensions marketplace
- Auto-activates when your workspace contains `.tmdl` files
- **Sidebar panels**: Measure Explorer, Orphan Measures, Model Stats, **Change History**
- **CodeLens**: inline "Trace Lineage" links above measure definitions
- **Change History panel**: auto-scans recent commits, shows changes grouped by commit → scope → detail with impact badges — covers measures, columns, relationships, source expressions, and more

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

If PBIP Lineage Explorer helps your team, please [sponsor the project](https://github.com/sponsors/JonathanJihwanKim) to keep it free and actively maintained.

<a href="https://github.com/sponsors/JonathanJihwanKim"><img src="https://img.shields.io/badge/Sponsor-❤-ea4aaa?style=flat-square" alt="Sponsor" /></a> <a href="https://buymeacoffee.com/jihwankim"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕-orange?style=flat-square" alt="Buy Me a Coffee" /></a>
