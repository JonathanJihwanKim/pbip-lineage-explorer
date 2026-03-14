/**
 * Toolbar - Open Report button + stats display.
 */

export function initToolbar(callbacks = {}) {
  bindButton('btn-open-folder', callbacks.onOpenFolder);
  bindButton('btn-get-started', callbacks.onOpenFolder);
}

function bindButton(id, handler) {
  const btn = document.getElementById(id);
  if (btn && handler) btn.addEventListener('click', handler);
}

export function updateStats(stats) {
  const el = document.getElementById('stats');
  if (!el || !stats) return;

  const parts = [];
  if (stats.projectName) parts.push(stats.projectName);
  const t = stats.byType || {};
  if (t.table) parts.push(`${t.table} tables`);
  if (t.measure) parts.push(`${t.measure} measures`);
  if (t.visual) parts.push(`${t.visual} visuals`);

  el.textContent = parts.length > 0 ? parts.join(' | ') : `${stats.nodeCount || 0} nodes`;
}

export function showLoading(message) {
  const el = document.getElementById('stats');
  if (el) {
    el.dataset.prevText = el.textContent;
    el.textContent = message || 'Loading...';
    el.style.opacity = '0.7';
  }
}

export function hideLoading() {
  const el = document.getElementById('stats');
  if (el) {
    if (el.dataset.prevText) { el.textContent = el.dataset.prevText; delete el.dataset.prevText; }
    el.style.opacity = '1';
  }
}
