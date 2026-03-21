# PBIP Lineage Explorer — Enhanced Improvement Proposal

> **Date**: 2026-03-21
> **Base proposal by**: CFF Insights team
> **Enhanced by**: Jihwan Kim (owner review + additional analysis)
> **Tested against**: `prod_report_picking_dashboard_v1` (61 tables, 274 measures, 542 visuals, all BigQuery-sourced)
> **App version**: v1.0.0 (commit 99f9b2a)

---

## Executive Summary

This enhanced proposal consolidates the original 16-item improvement plan with 8 new feature proposals and a 5-pillar sponsor monetization strategy. Two items from the original were removed (already shipped), three were upgraded from P3 to P1 based on effort-to-impact analysis, and the sponsor strategy introduces a "Chat with a Power BI MVP" tier designed to reach 200 EUR/month without premium tiers or paywalls.

---

## Revised Priority Matrix

### Items Removed (Already Implemented)
- ~~#9 Storage mode display~~ — Import/DirectQuery badges already shipped
- ~~#6 Data engineer export mode~~ — Source Map view already provides reverse-view CSV

### Priority Summary

| Priority | Items | Rationale |
|----------|-------|-----------|
| **P1** | #1 (BQ params), #8 (Hidden indicators), #14 (Data type badges), #16 (Bulk export) | High value, low-to-medium effort |
| **P2** | #2 (BQ display), #4 (M-based FP), #7 (Aggregation awareness) | Medium value, depends on P1 |
| **P3** | #3, #5, #10, #11, #12, #13, #15 | Lower priority or high effort |
| **NEW** | Command palette, Shareable snapshots, Keyboard nav, Virtual scroll, Model diff, Calc group lineage, Diagnostics, Responsive layout | UX and growth features |

---

## Original Proposal Items (Re-evaluated)

### P1 — Ship First

#### #1: BigQuery Parameter Resolution (Scope Refined)
**Original assessment**: Parameters parsed but never substituted.
**Revised scope**: `graphBuilder.js` already has `resolveParameters()` (lines 236-248). The gap is narrower — edge cases where concatenated BQ strings use `& _BillingProject &` patterns in `Value.NativeQuery` SQL strings.
**Effort**: Medium (2-3 hours, not full rewrite)

#### #8: Hidden Column/Measure Indicators (Upgraded from P3)
**Why upgraded**: `isHidden` is already encountered during parsing but skipped. Surfacing it as a badge is trivial effort with high governance value — data engineers need to know which columns are hidden from end users.
**Effort**: Low (1-2 hours)

#### #14: Column Data Type Badges (Upgraded from P3)
**Why upgraded**: Data types are already parsed and stored in graph metadata. Only the UI display is missing. Universal value for both PBI developers and data engineers.
**Effort**: Low (1-2 hours)

#### #16: Bulk Lineage Export (Upgraded from P3)
**Why upgraded**: Most-requested enterprise feature for documentation workflows. The infrastructure exists — loop `traceMeasureLineage()` over all measure nodes and output as JSON/CSV.
**Effort**: Medium (3-4 hours)

### P2 — Next Wave

#### #2: Full GCP Project.Dataset.Table Display
Depends on #1 completing first. Display-layer fix to compose `project.dataset.table` in source node labels.
**Effort**: Low (1 hour after #1)

#### #4: M-Based Field Parameter Detection
8 of 21 `prm*` tables missed because they use M sources instead of NAMEOF(). Add `ParameterMetadata` annotation check and naming convention heuristic.
**Effort**: Low-Medium (2 hours)

#### #7: Aggregation Pattern Awareness
Detect `IF([_IsOnDetailLevel], ...)` dual-path patterns and label branches. Genuinely useful but requires more sophisticated DAX pattern matching.
**Effort**: High (6 hours)

### P3 — Backlog

| # | Item | Notes |
|---|------|-------|
| 3 | reportExtensions.json | Rare (1 measure in test model); not lineage-critical |
| 5 | BigQuery schema catalog | Overlaps with existing Model Health Dashboard |
| 10 | Incremental refresh indicator | Low effort but niche audience |
| 11 | Bookmark-aware lineage | High effort, complex PBIP structure |
| 12 | Cross-report lineage | High effort, workspace-level parsing |
| 13 | Measure description display | Already partially implemented (tooltips exist) |
| 15 | Relationship visualization | Nice-to-have ERD view |

---

## New Improvements (Not in Original Proposal)

### NEW-1: Command Palette (Ctrl+K)
**Problem**: Search is scoped to the active sidebar tab. Users can't search across measures, visuals, pages, and tables simultaneously.
**Solution**: VS Code-style command palette with grouped results and keyboard navigation.
**Impact**: High | **Effort**: Medium

### NEW-2: Shareable Lineage Snapshots
**Problem**: Lineage results can't be shared with colleagues who don't have the PBIP files.
**Solution**: "Copy as Markdown" button producing structured dependency chains ready for Confluence/ADO. Enhanced PNG/SVG export with branded watermark footer.
**Impact**: High | **Effort**: Medium

### NEW-3: Keyboard-Driven Sidebar Navigation
**Problem**: Minimal keyboard shortcuts. Power users expect arrow key navigation.
**Solution**: Up/Down arrows in sidebar, Enter to trace, Tab to switch tabs. Zero-cost additions to existing `handleKeyDown`.
**Impact**: Medium | **Effort**: Low

### NEW-4: Virtual Scrolling for Large Models
**Problem**: Sidebar renders all items into DOM. For 500+ measures, initial render and filtering lag.
**Solution**: Only render visible viewport items (~25) and swap on scroll.
**Impact**: High | **Effort**: Medium

### NEW-5: Model Diff / Change Detection (Sponsorware Candidate)
**Problem**: Version-controlled PBIP projects need "what changed?" analysis.
**Solution**: Load two PBIP folders, diff the graphs, show added/removed/modified measures and broken lineage paths.
**Impact**: High | **Effort**: High

### NEW-6: Calculation Group Lineage (Sponsorware Candidate)
**Problem**: Calc groups are detected but not traced through lineage.
**Solution**: Enhance tracer to follow calculation group column references via SELECTEDVALUE patterns.
**Impact**: Medium | **Effort**: Medium

### NEW-7: Error Diagnostics Panel
**Problem**: Parse failures show generic errors. Users don't know which files failed or why.
**Solution**: Collect warnings during parse and display in Model Health Dashboard as collapsible "Diagnostics" section.
**Impact**: Medium | **Effort**: Low

### NEW-8: Responsive Sidebar
**Problem**: Fixed 280px sidebar wastes space on tablets/narrow screens.
**Solution**: Collapsible at 1024px, overlay at 768px.
**Impact**: Low | **Effort**: Low

---

## Sponsor Strategy — 200 EUR/month Target

### Philosophy

Everything stays free. No premium tiers. No paywalls. Sponsorship is framed as "sustaining the tool you rely on" with mentorship access as a thank-you.

### Conversion Math

| Scenario | Sponsors Needed |
|----------|----------------|
| All at 7 EUR/month | ~29 |
| All at 25 EUR/month (with MVP chat) | 8 |
| All at 50 EUR/month (Gold) | 4 |
| **Realistic mix** | 2-3 orgs at 50 + 3-5 at 25 + 5-10 at 7 |

Required user base: ~500-1000 monthly active users (OSS conversion rate: 0.5-2%)

### Strategy 1: "Ask a Power BI MVP" Tier

The killer perk. Power BI consulting costs 125-250 EUR/hour. A 30-minute monthly session at 25 EUR/month feels like mentorship, not a bill.

**GitHub Sponsors tiers:**

| Tier | EUR/month | Benefits |
|------|-----------|----------|
| Community | 7 | Name on README, sponsor badge |
| Professional | 15 | Name on README + in-app Sponsors wall, early access to new features |
| Expert | 25 | All above + **30-min monthly "Ask a Power BI MVP" video call** |
| Gold | 50 | All above + company logo on README and app, priority feature requests |

**Critical framing:**
- NOT "consulting" or "paid session"
- "Ask a Power BI MVP" — casual knowledge-sharing
- "Learned something new? Sponsors keep this tool free for everyone."
- No mention of hourly rates

**Inspiration from other MVPs:**
- **SQLBI** provides free tools (DAX Studio, Bravo) as proof-of-expertise driving consulting demand
- **DAX Studio** sustains on pure GitHub Sponsors donations
- **Caleb Porzio** (Alpine.js) hit $100k/year via educational content + sponsor perks
- **Power BI coaching** sites (Learn Power BI, The Power BI Coach) offer 1:1 sessions at $150-300/hour

The 25 EUR/month tier positions the MVP chat as a community perk, not a service — exactly the framing that Power BI community culture responds to.

### Strategy 2: Value-Moment Nudges

**Change toast trigger**: Fire on 3rd lineage trace (not 1st). By the 3rd trace, the user has confirmed the tool is genuinely useful.

**Time-savings framing:**
> "You've traced 3 dependency chains this session — that's roughly 45 minutes of manual DAX tracing saved. This tool is free forever. Sponsors keep it that way."

**Session milestones** (enhance value counter, no popups):
- 5 measures: "Power user! 5 measures traced — hours of work saved"
- 10 measures: "10 measures mapped this session"
- Each includes sponsor link as secondary element

### Strategy 3: Sponsorware (Time-Gated Previews)

Advanced features available to sponsors immediately, free for everyone after 30 days.

**Candidates**: Model Diff (NEW-5), Bulk Export (#16), Calc Group Lineage (NEW-6)

**Messaging**: *"Model Diff is available now for sponsors. It becomes free for everyone on [date]. Become a sponsor to try it today."*

This is NOT a paywall. Everything becomes free. The distinction matters for community trust.

### Strategy 4: Export Viral Loop

Brand all exports:
- **SVG/PNG**: Footer: *"Created with PBIP Lineage Explorer — free & open-source by Jihwan Kim (MVP)"*
- **Markdown copy**: *"Generated by PBIP Lineage Explorer"*
- **CSV**: Sponsor URL in footer row

When lineage traces appear in Confluence pages and ADO work items, colleagues discover the tool organically.

### Strategy 5: In-App Sponsors Wall

Replace "Be the first!" with social proof:
- Seed with Community Champions (code contributors, bug reporters)
- In-app Sponsors overlay accessible from toolbar
- Organization logos visible to all users (incentive for Gold tier)

---

## Implementation Roadmap

### Phase 0: Quick Wins (1-2 days each)
1. Hidden column/measure badges (#8)
2. Data type badges (#14)
3. Keyboard sidebar navigation (NEW-3)
4. Enhanced sponsor toast (Strategy 2)

### Phase 1: Core Features (1 week)
5. Bulk lineage export (#16)
6. Copy as Markdown + watermarks (NEW-2)
7. BigQuery parameter resolution (#1)
8. Error diagnostics panel (NEW-7)

### Phase 2: Sponsor Infrastructure (3-5 days)
9. GitHub Sponsors tier setup (7/15/25/50 EUR) + Calendly
10. In-app Sponsors page with "Ask a Power BI MVP" callout
11. Session milestone celebrations
12. Branded export watermarks

### Phase 3: UX Polish (1-2 weeks)
13. Command palette (NEW-1)
14. Virtual scrolling (NEW-4)
15. Responsive sidebar (NEW-8)
16. Full BQ project.dataset.table display (#2)

### Phase 4: Sponsorware Features (2-4 weeks)
17. Model Diff (NEW-5) — sponsors-first 30 days
18. Calculation group lineage (NEW-6) — sponsors-first 30 days
19. M-based field parameter detection (#4)
20. Aggregation pattern awareness (#7)

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Monthly recurring sponsors | 200 EUR/month | GitHub Sponsors dashboard |
| Expert tier subscribers | 2-3 at 25 EUR/month | GitHub Sponsors tiers |
| Toast click-through rate | >2% | Enhanced toast at 3rd trace should outperform 1st-trace trigger |
| Bulk export adoption | Used by 20%+ of sessions | Feature usage tracking |
| Parse success rate | 95%+ clean loads | Diagnostics panel data |
| Test coverage | 80%+ of packages/core | vitest coverage report |
