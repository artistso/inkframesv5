// InkFrame Brush Engine V2 — tablet coverage, width, and contact selectors
'use strict';

(function(root){
  const COVERAGE_ID = 'inkframe-v2-coverage-mode';
  const RADIUS_ID = 'inkframe-v2-radius-mode';
  const CONTACT_ID = 'inkframe-v2-contact-mode';

  function normalizeCoverage(value) {
    return value === 'dabs' ? 'dabs' : 'ribbon';
  }

  function normalizeRadius(value) {
    return value === 'raw' ? 'raw' : 'guarded';
  }

  function normalizeContact(value) {
    return value === 'raw' ? 'raw' : 'strict';
  }

  function adapter() {
    return root.InkFrameBrushV2Adapter || null;
  }

  function sync(selects) {
    const api = adapter();
    if (!selects || !api || typeof api.currentTuning !== 'function') return false;
    const tuning = api.currentTuning() || {};
    if (selects.coverage) selects.coverage.value = normalizeCoverage(tuning.coverageMode);
    if (selects.radius) selects.radius.value = normalizeRadius(tuning.radiusMode);
    if (selects.contact) selects.contact.value = normalizeContact(tuning.contactMode);
    const disabled = typeof api.isActive === 'function' && api.isActive();
    if (selects.coverage) selects.coverage.disabled = disabled;
    if (selects.radius) selects.radius.disabled = disabled;
    if (selects.contact) selects.contact.disabled = disabled;
    return true;
  }

  function addSelect(panel, id, label, options, noteText, onChange) {
    const row = root.document.createElement('label');
    row.className = 'inkframe-v2-tune-row';
    row.id = id + '-row';

    const name = root.document.createElement('span');
    name.textContent = label;

    const select = root.document.createElement('select');
    select.id = id;
    for (const [value, text] of options) {
      const option = root.document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    }

    const note = root.document.createElement('output');
    note.textContent = noteText;
    select.addEventListener('change', onChange);
    row.append(name, select, note);
    panel.appendChild(row);
    return select;
  }

  function install() {
    if (!root.document) return false;
    if (root.document.getElementById(COVERAGE_ID)
      && root.document.getElementById(RADIUS_ID)
      && root.document.getElementById(CONTACT_ID)) return true;
    const api = adapter();
    const tuningPanel = root.document.getElementById('inkframe-v2-tuning');
    if (!api || !tuningPanel) return false;

    const selects = {
      coverage: root.document.getElementById(COVERAGE_ID),
      radius: root.document.getElementById(RADIUS_ID),
      contact: root.document.getElementById(CONTACT_ID),
    };

    if (!selects.coverage) {
      selects.coverage = addSelect(
        tuningPanel,
        COVERAGE_ID,
        'Coverage',
        [['ribbon', 'Ribbon'], ['dabs', 'Dabs']],
        'edge',
        () => {
          if (typeof api.setTuning === 'function') api.setTuning({ coverageMode: normalizeCoverage(selects.coverage.value) });
          sync(selects);
        }
      );
    }

    if (!selects.radius) {
      selects.radius = addSelect(
        tuningPanel,
        RADIUS_ID,
        'Width guard',
        [['guarded', 'Guarded'], ['raw', 'Raw']],
        'radius',
        () => {
          if (typeof api.setTuning === 'function') api.setTuning({ radiusMode: normalizeRadius(selects.radius.value) });
          sync(selects);
        }
      );
    }

    if (!selects.contact) {
      selects.contact = addSelect(
        tuningPanel,
        CONTACT_ID,
        'Contact',
        [['strict', 'Strict'], ['raw', 'Raw']],
        'ends',
        () => {
          if (typeof api.setTuning === 'function') api.setTuning({ contactMode: normalizeContact(selects.contact.value) });
          sync(selects);
        }
      );
    }

    const tuneButton = root.document.querySelector('#inkframe-v2-ab button:nth-child(2)');
    if (tuneButton) tuneButton.addEventListener('click', () => root.setTimeout(() => sync(selects), 0));
    const preset = tuningPanel.querySelector('select:not(#' + COVERAGE_ID + '):not(#' + RADIUS_ID + '):not(#' + CONTACT_ID + ')');
    if (preset) preset.addEventListener('change', () => root.setTimeout(() => sync(selects), 0));

    sync(selects);
    return true;
  }

  const api = {
    COVERAGE_ID,
    RADIUS_ID,
    CONTACT_ID,
    normalizeCoverage,
    normalizeRadius,
    normalizeContact,
    sync,
    install,
  };
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
