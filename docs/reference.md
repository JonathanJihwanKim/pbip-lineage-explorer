# PBIP Lineage Explorer — Reference Guide

Detailed documentation for [PBIP Lineage Explorer](https://github.com/JonathanJihwanKim/pbip-lineage-explorer). For a quick overview, see the [README](../README.md).

---

## UI Overview

| Area | What it does |
|------|-------------|
| **Left sidebar — Measures tab** | Browse all measures grouped by table. Search by name, toggle "Orphans only" to find unused measures. Click a measure to trace its lineage. |
| **Left sidebar — Visuals tab** | Browse visuals grouped by page. Click a visual to trace its measures. Click the grid icon next to a page name to open the **View Page Layout** minimap. |
| **Main area** | Displays the lineage graph (D3 tree), page layout view, or source column map — depending on your selection. |
| **Toolbar** | Open Project, export buttons (SVG, PNG, CSV), and the Source Map toggle. |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus the measure search box |
| `Esc` | Close the source map view |

---

## View Page Layout

Ever wondered what's actually on a report page without opening Power BI Desktop? The **View Page Layout** feature renders a minimap of your report page — every visual shown as a rectangle at its exact position, size, and stacking order.

**How to open it:** In the left sidebar, switch to the **Visuals** tab and click the golden grid icon next to any page name.

**What you see:**
- Each visual is a rectangle labeled with its **type** (Bar, Table, KPI...), **title**, **measure count** (m), and **field count** (f)
- Visuals are color-coded by category — charts (blue), tables (purple), cards (green), filters (orange)
- Grouped and nested visuals are resolved to their absolute positions automatically
- Hidden visuals are filtered out; visuals without position data are listed separately below the map

**What you can do:**
- **Click** any visual to instantly trace its full lineage (measures, columns, sources)
- **Hover** to see a tooltip listing all measures, field parameters, and columns the visual references

This gives you a bird's-eye view of a report page and a fast way to jump into lineage tracing for any visual.

---

## How It Works

1. The app reads `.tmdl` and `.pbir` files directly from your local file system using the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
2. It parses tables, columns, measures, relationships, DAX expressions, and visual configurations
3. A lineage graph is built with nodes (tables, columns, measures, visuals, sources) and edges (dependencies)
4. Click any node to trace upstream sources and downstream consumers
5. The Source Map view provides a flat, searchable table of all column mappings

---

## Use Cases

### Questions Power BI Developers Ask

- **"Which visuals break if I rename this column?"** — Select the column and see all downstream visuals instantly
- **"What measures are unused in my model?"** — Enable the orphan filter to find measures with no visual consumers
- **"How is this KPI calculated?"** — Click the measure to see its full DAX dependency chain
- **"Does this visual use a field parameter?"** — FP and CG badges are detected and shown automatically
- **"What does this report page look like and what's on it?"** — Click the grid icon next to any page to see a visual map of the entire page layout

### Questions Data Engineers Ask Power BI Developers

- **"What source columns does this measure use?"** — Open Source Map to see the full PBI Column → Source Column mapping
- **"What's the original column name before Power BI renamed it?"** — Rename chains show the full path: `SalesAmount → Amount → Amount`
- **"Which tables from our data warehouse are used in this report?"** — Source lineage traces all the way to BigQuery, SQL Server, or Fabric
- **"Can I get this mapping as a CSV?"** — Click Export CSV in the Source Map view
- **"How is this DAX measure actually calculated?"** — The DAX chain shows the formula with syntax highlighting and column references

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

## Browser Support

Requires the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API):

| Browser | Supported |
|---------|-----------|
| Chrome 86+ | Yes |
| Edge 86+ | Yes |
| Opera 72+ | Yes |
| Firefox | No |
| Safari | No |
