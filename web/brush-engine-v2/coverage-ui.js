// InkFrame Brush Engine V2 — tablet coverage-mode selector
'use strict';

(function(root){
  const SELECT_ID = 'inkframe-v2-coverage-mode';

  function normalizeMode(value) {
    return value === 'dabs' ? 'dabs' : 'ribbon';
  }

  function adapter() {
    return root.InkFrameBrushV2Adapter || null;
  }

  function sync(select) {
    const api = adapter();
    if (!select || !api || typeof api.currentTuning !== 'function') return false;
    const tuning = api.currentTuning() || {};
    select.value = normalizeMode(tuning.coverageMode);
    select.disabled = typeof api.isActive === 'function' && api.isActive();
    return true;
  }

  function install() {
    if (!root.document) return false;
    if (root.document.getElementById(SELECT_ID)) return true;
    const api = adapter();
    const tuningPanel = root.document.getElementById('inkframe-v2-tuning');
    if (!api || !tuningPanel) return false;

    const row = root.document.createElement('label');
    row.className = 'inkframe-v2-tune-row';
    row.id = 'inkframe-v2-coverage-row';

    const name = root.document.createElement('span');
    name.textContent = 'Coverage';

    const select = root.document.createElement('select');
    select.id = SELECT_ID;
    for (const [value, label] of [['ribbon', 'Ribbon'], ['dabs', 'Dabs']]) {
      const option = root.document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }

    const note = root.document.createElement('output');
    note.textContent = 'edge';
    select.addEventListener('change', () => {
      if (typeof api.setTuning === 'function') api.setTuning({ coverageMode: normalizeMode(select.value) });
      sync(select);
    });

    row.append(name, select, note);
    tuningPanel.appendChild(row);

    const tuneButton = root.document.querySelector('#inkframe-v2-ab button:nth-child(2)');
    if (tuneButton) tuneButton.addEventListener('click', () => root.setTimeout(() => sync(select), 0));
    const preset = tuningPanel.querySelector('select:not(#' + SELECT_ID + ')');
    if (preset) preset.addEventListener('change', () => root.setTimeout(() => sync(select), 0));

    sync(select);
    return true;
  }

  const api = { SELECT_ID, normalizeMode, sync, install };
  root.InkFrameBrushV2CoverageUI = api;
  if (root.document) {
    const start = () => {
      if (!install()) root.setTimeout(install, 0);
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
