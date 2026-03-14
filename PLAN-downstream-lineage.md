# Plan: Add Downstream Lineage (Visuals/Pages) to PBIP Lineage Explorer

## Context

The app currently traces lineage **upstream only**: starting from a measure, it finds sub-measures, columns, tables, PQ expressions, and data sources. The documentation (`dax-measure-lineage-tracing.md`) describes a 6-layer model that starts from **Layer 1: Report Visuals** — "what does the user see?" — and traces all the way down to Layer 6: Source Connection.

The key gap: users cannot browse pages/visuals as entry points, and the downstream context (which visuals/pages use a measure) is underutilized. Field parameter resolution is also incomplete — visuals using field parameters only show the last-active measure, not all available ones.

---

## Phase 1: Visual/Page Browser Sidebar Tab

**Goal**: Add a "Visuals" tab next to "Measures" in the sidebar so users can browse pages and visuals as entry points.

### 1.1 Create `src/ui/visualBrowser.js`
- Export `initVisualBrowser({ onVisualSelect, onMeasureNavigate })`, `populateVisuals(graph)`, `selectVisual(visualId)`
- Build a two-level collapsible tree: **Pages** (`<details>`) → **Visuals** (list items)
- Each visual shows: type badge, title (or type if untitled), measure count
- Search input filters by page name, visual title, or visual type
- Pages sorted by ordinal; visuals sorted by title within each page

### 1.2 Modify `index.html`
- Replace the static sidebar header with a **tab switcher**: "Measures" | "Visuals"
- Add `tab-measures` and `tab-visuals` panel containers inside `sidebar-body`
- The visual tab contains search input + `#visual-list` container

### 1.3 Modify `src/main.js`
- Import and initialize `visualBrowser`
- Add `handleVisualSelect(visualId)` — calls `traceVisualLineage()` then renders results
- Call `populateVisuals(graph)` alongside `populateMeasures(graph)` after loading
- Wire up sidebar tab switching logic

### 1.4 Add CSS in `styles/main.css`
- `.sidebar-tabs` — flex row with underline active indicator
- `.tab-panel.hidden { display: none }`
- `.visual-list` — page groups, visual items with type badges

**Files**: `src/ui/visualBrowser.js` (new), `index.html`, `src/main.js`, `styles/main.css`

---

## Phase 2: Visual-First Lineage Tracing

**Goal**: When a user clicks a visual, trace all measures it uses and show combined lineage.

### 2.1 Add `traceVisualLineage()` in `src/graph/lineageTracer.js`
- Takes `visualNodeId` + `graph`
- Find all measures the visual references via upstream adjacency (filter `type === 'measure'`)
- **Resolve field parameters**: if any upstream edge goes to a field parameter table (check `node.enrichment?.type === 'field_parameter'`), follow `FIELD_PARAM_TO_FIELD` edges to get ALL available measures
- For each measure, call existing `traceMeasureLineage()`
- Return `{ visual: { id, title, type, page }, measures: [...perMeasureLineage], fieldParameterMeasures: [...] }`

### 2.2 Add `renderVisualLineage()` in `src/ui/lineageView.js`
- Header: visual title, type, page name
- If visual uses field parameters, show a section listing all available measures with "FP" badge
- Per-measure accordion/sections showing each measure's 4-section lineage
- If only one measure, use existing `renderLineage()` layout

### 2.3 Enhance `traceVisuals()` in `src/graph/lineageTracer.js`
- Add `bindingType: 'direct' | 'fieldParameter'` to each visual entry
- Add `fieldParameterTable` name when applicable
- Add `availableMeasures` array for field parameter bindings (resolved from TMDL)

**Files**: `src/graph/lineageTracer.js`, `src/ui/lineageView.js`

---

## Phase 3: Column Rename Chain Surfacing

**Goal**: Show the 3-name chain (Source → PQ → PBI) clearly when names differ between layers.

### 3.1 Enhance `buildSourceTable()` in `src/graph/lineageTracer.js`
- Add `renameChain` field to each row: `{ sourceName, pqName, pbiName, hasRename }`
- Already have `sourceColumn`, `originalSourceColumn`, `wasRenamed` on column nodes — just surface them more explicitly

### 3.2 Enhance `renderSourceTableSection()` in `src/ui/lineageView.js`
- When `renamed === true`, show the full chain inline: `source_col → pq_col → pbi_col` with arrow separators
- Add highlighted row styling (`.renamed-row`) for renamed columns
- Clarify column headers: "PBI Column", "Source Column (PQ)", "Original Source Column"

### 3.3 Enhance column nodes in `src/ui/lineageTree.js`
- When column `wasRenamed`, add visual indicator on the D3 node (border or icon)
- Show rename chain in tooltip

**Files**: `src/graph/lineageTracer.js`, `src/ui/lineageView.js`, `src/ui/lineageTree.js`, `styles/main.css`

---

## Phase 4: Richer Output Format

**Goal**: Align the 4-section output more closely with the documentation specification.

### 4.1 Enhance Visuals section (`renderVisualsSection`)
- Add "Object ID" column (visual folder ID)
- Highlight when Metric Display Name differs from Metric DAX Name
- Make visual rows clickable → navigate to visual browser (Phase 1)

### 4.2 Enhance Measure Chain section (`renderMeasureChainSection`)
- Show full DAX expression in a collapsible `<details>` block (currently truncated at 200 chars)
- Show column references inline with their rename status
- Add "Copy DAX" button per measure

### 4.3 Enhance Summary section (`renderSummarySection`)
- Replace `<pre>` with structured HTML tree using CSS indent guides (vertical lines)
- Color-code nodes by layer (visual=blue, measure=orange, column=green, source=purple per constants.js)
- Make measure names clickable (navigate to that measure's trace)
- Include page name in the visual line
- Add layer labels (L1–L6) matching the documentation model

### 4.4 Enhance D3 tree (`src/ui/lineageTree.js`)
- Add downstream visual/page nodes above the measure root (currently tree only shows upstream)
- Layout: visual nodes on the left → measure at center → upstream dependencies on the right
- This creates a true bidirectional lineage view

**Files**: `src/ui/lineageView.js`, `src/ui/lineageTree.js`, `styles/main.css`

---

## Implementation Order

```
Phase 1 (Visual Browser)  ─┐
                            ├── can be done in parallel
Phase 3 (Rename Chains)   ─┘

Phase 2 (Visual-First Tracing) ── depends on Phase 1

Phase 4 (Richer Output)        ── depends on Phases 1-2 for full context
```

Recommended sequence: **Phase 1 → Phase 2 → Phase 3 → Phase 4**

---

## Verification

After each phase:
1. Open the app in Chrome/Edge (`npm run dev`)
2. Load a PBIP project folder containing both `.Report` and `.SemanticModel`
3. **Phase 1**: Verify the "Visuals" tab shows pages with nested visuals, search works, clicking a visual triggers tracing
4. **Phase 2**: Verify clicking a visual shows all its measures' lineage, field parameter measures are resolved
5. **Phase 3**: Verify renamed columns show the full chain in the source table and D3 tree
6. **Phase 4**: Verify enhanced output sections, bidirectional D3 tree, clickable navigation

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `src/ui/visualBrowser.js` | **NEW** — visual/page browser sidebar |
| `src/graph/lineageTracer.js` | Add `traceVisualLineage()`, enhance `traceVisuals()` for FP, enhance `buildSourceTable()` for rename chains |
| `src/ui/lineageView.js` | Add `renderVisualLineage()`, enhance all 4 section renderers |
| `src/ui/lineageTree.js` | Add downstream nodes to D3 tree, rename indicators on column nodes |
| `src/main.js` | Integrate visual browser, add `handleVisualSelect()`, tab switching |
| `index.html` | Sidebar tab structure, visual browser container |
| `styles/main.css` | Tab styling, visual list, rename highlights, summary tree guides |

## Existing Code to Reuse

- `analyzeImpact()` from `src/graph/impactAnalysis.js` — already does BFS upstream/downstream traversal
- `traceMeasureLineage()` from `src/graph/lineageTracer.js` — reuse per-measure tracing inside visual tracing
- `enrichment.js` field parameter detection — already creates `FIELD_PARAM_TO_FIELD` edges in graph
- `measurePicker.js` patterns — use same sidebar structure, search, grouping, selection for visual browser
- `NODE_COLORS` from `src/utils/constants.js` — use for layer color-coding in summary trees
