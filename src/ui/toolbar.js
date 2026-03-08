/**
 * Toolbar - Handles toolbar button interactions including
 * open folder, layout toggle, zoom controls, and export buttons.
 */

import { LAYOUT_TYPES } from '../utils/constants.js';

/**
 * Initialize toolbar event listeners.
 * @param {object} callbacks
 * @param {function} callbacks.onOpenFolder - Called when Open Folder is clicked.
 * @param {function} callbacks.onLayoutChange - Called with layout type string.
 * @param {function} callbacks.onZoomIn - Called for zoom in.
 * @param {function} callbacks.onZoomOut - Called for zoom out.
 * @param {function} callbacks.onZoomReset - Called for zoom reset.
 * @param {function} callbacks.onExportSvg - Called for SVG export.
 * @param {function} callbacks.onExportPng - Called for PNG export.
 */
export function initToolbar(callbacks = {}) {
  bindButton('btn-open-folder', callbacks.onOpenFolder);
  bindButton('btn-zoom-in', callbacks.onZoomIn);
  bindButton('btn-zoom-out', callbacks.onZoomOut);
  bindButton('btn-zoom-reset', callbacks.onZoomReset);
  bindButton('btn-export-svg', callbacks.onExportSvg);
  bindButton('btn-export-png', callbacks.onExportPng);

  // Layout buttons
  bindButton('btn-layout-force', () => {
    setActiveLayout(LAYOUT_TYPES.FORCE);
    if (callbacks.onLayoutChange) callbacks.onLayoutChange(LAYOUT_TYPES.FORCE);
  });

  bindButton('btn-layout-tree', () => {
    setActiveLayout(LAYOUT_TYPES.TREE);
    if (callbacks.onLayoutChange) callbacks.onLayoutChange(LAYOUT_TYPES.TREE);
  });

  // Welcome overlay "Open Folder" button
  bindButton('btn-get-started', callbacks.onOpenFolder);
}

function bindButton(id, handler) {
  const btn = document.getElementById(id);
  if (btn && handler) {
    btn.addEventListener('click', handler);
  }
}

/**
 * Update the stats display in the toolbar.
 * @param {{ nodeCount: number, edgeCount: number, byType: object, orphanCount: number }} stats
 */
export function updateStats(stats) {
  const el = document.getElementById('stats');
  if (!el || !stats) return;

  const parts = [];
  const byType = stats.byType || {};
  if (byType.table) parts.push(`${byType.table} tables`);
  if (byType.measure) parts.push(`${byType.measure} measures`);
  if (byType.visual) parts.push(`${byType.visual} visuals`);
  if (stats.orphanCount) parts.push(`${stats.orphanCount} orphaned`);

  el.textContent = parts.length > 0 ? parts.join(' | ') : `${stats.nodeCount || 0} nodes, ${stats.edgeCount || 0} edges`;
}

/**
 * Set the active layout button.
 * @param {string} layout - The active layout type ('force' or 'tree').
 */
export function setActiveLayout(layout) {
  const forceBtn = document.getElementById('btn-layout-force');
  const treeBtn = document.getElementById('btn-layout-tree');

  if (forceBtn) forceBtn.classList.toggle('active', layout === LAYOUT_TYPES.FORCE);
  if (treeBtn) treeBtn.classList.toggle('active', layout === LAYOUT_TYPES.TREE);
}

/**
 * Show loading indicator in toolbar.
 * @param {string} message
 */
export function showLoading(message) {
  const statsEl = document.getElementById('stats');
  if (statsEl) {
    statsEl.dataset.prevText = statsEl.textContent;
    statsEl.textContent = message || 'Loading...';
    statsEl.style.opacity = '0.7';
  }
}

/**
 * Hide loading indicator.
 */
export function hideLoading() {
  const statsEl = document.getElementById('stats');
  if (statsEl) {
    if (statsEl.dataset.prevText) {
      statsEl.textContent = statsEl.dataset.prevText;
      delete statsEl.dataset.prevText;
    }
    statsEl.style.opacity = '1';
  }
}
