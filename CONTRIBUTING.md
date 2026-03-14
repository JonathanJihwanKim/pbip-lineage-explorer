# Contributing to PBIP Lineage Explorer

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/JonathanJihwanKim/pbip-lineage-explorer.git
cd pbip-lineage-explorer

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open `http://localhost:5173` in Chrome or Edge (File System Access API required).

## Project Structure

```
src/
├── main.js              # App entry point and orchestration
├── parser/
│   ├── pbipReader.js    # File System Access API integration
│   ├── tmdlParser.js    # TMDL file parsing (tables, measures, columns)
│   ├── pbirParser.js    # PBIR visual configuration parsing
│   ├── daxParser.js     # DAX expression dependency extraction
│   └── enrichment.js    # Field parameter / calculation group detection
├── graph/
│   ├── graphBuilder.js  # Node/edge graph construction
│   ├── lineageTracer.js # Lineage tracing algorithms
│   └── impactAnalysis.js # Upstream/downstream impact analysis
├── ui/
│   ├── toolbar.js       # Toolbar with Open Project button
│   ├── measurePicker.js # Left sidebar measure list
│   ├── visualBrowser.js # Left sidebar visuals list
│   ├── lineageView.js   # Main lineage rendering + DAX highlighting
│   ├── lineageTree.js   # D3 tree visualization
│   └── sourceMapping.js # Source Column Mapping view
└── utils/
    └── constants.js     # Node/edge types and colors
```

## Guidelines

- **No frameworks** — the app uses vanilla JS + ES modules + D3.js only
- **Client-side only** — no server-side code, no data uploads
- **Privacy first** — files are read locally via File System Access API
- **Dark theme** — all UI changes should work with the existing dark theme

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes
3. Test with the sample PBIP in `public/sample-pbip/`
4. Run `npm run build` to verify the build succeeds
5. Submit a PR with a clear description of what changed and why

## Reporting Issues

Please include:
- Browser and version
- Description of your PBIP project structure (number of tables, measures, visuals)
- Steps to reproduce
- Screenshots if applicable
