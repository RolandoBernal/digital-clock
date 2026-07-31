(() => {
  const STORAGE_KEY = 'levi_diabetes_records_v1';
  const PRIMARY_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Bedtime', '2 AM'];
  const EXTRA_TYPES = [...PRIMARY_TYPES, 'Correction', 'Snack', 'Exercise', 'Other'];

  let records = loadRecords();
  let currentEditor = null;

  function createId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function getRoot() {
    return document.getElementById('levi-diabetes-root');
  }

  function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getLocalTimeKey(date = new Date()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function formatDate(date = new Date()) {
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(navigator.language || undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function sanitizeNotes(value) {
    return String(value || '').replace(/\r/g, '').trim().slice(0, 500);
  }

  function normalizeNumber(value) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const timestamp = Number(record.timestamp);
    const type = EXTRA_TYPES.includes(record.type) ? record.type : 'Other';
    const date = typeof record.date === 'string' ? record.date : getLocalDateKey(new Date(timestamp || Date.now()));
    const time = typeof record.time === 'string' ? record.time : getLocalTimeKey(new Date(timestamp || Date.now()));
    return {
      id: typeof record.id === 'string' ? record.id : createId(),
      date,
      time,
      type,
      bloodSugar: normalizeNumber(record.bloodSugar),
      insulinUnits: normalizeNumber(record.insulinUnits),
      notes: sanitizeNotes(record.notes),
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    };
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeRecord).filter(Boolean) : [];
    } catch (error) {
      console.warn('Lee-Lee’s Tracker storage could not be read.', error);
      return [];
    }
  }

  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      console.warn('Lee-Lee’s Tracker storage could not be saved.', error);
    }
  }

  function todaysRecords() {
    const today = getLocalDateKey();
    return records
      .filter((record) => record.date === today)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  function latestRecordForType(type) {
    return todaysRecords().find((record) => record.type === type) || null;
  }

  function formatBloodSugar(value) {
    return value == null ? '' : `${value} mg/dL`;
  }

  function formatInsulin(value) {
    if (value == null) return '';
    return `${value} ${value === 1 ? 'unit' : 'units'}`;
  }

  function renderValuePills(record) {
    if (!record) return '';
    const values = [
      formatBloodSugar(record.bloodSugar),
      formatInsulin(record.insulinUnits),
    ].filter(Boolean);
    return values.length
      ? `<div class="levi_diabetes_card_values">${values.map((value) => `<span class="levi_diabetes_pill">${escapeHtml(value)}</span>`).join('')}</div>`
      : '';
  }

  function renderHome() {
    currentEditor = null;
    const root = getRoot();
    if (!root) return;
    const timeline = todaysRecords();
    root.innerHTML = `
      <section class="levi_diabetes_top">
        <p class="levi_diabetes_date">${escapeHtml(formatDate())}</p>
        <h1 class="levi_diabetes_title" id="levi-diabetes-title">Lee-Lee’s Tracker</h1>
      </section>
      <section class="levi_diabetes_cards" aria-label="Primary events">
        ${PRIMARY_TYPES.map(renderPrimaryCard).join('')}
      </section>
      <button type="button" class="levi_diabetes_button levi_diabetes_button--primary levi_diabetes_extra" data-action="extra">+ Extra Check</button>
      <section aria-labelledby="levi-diabetes-timeline-title">
        <h2 class="levi_diabetes_section_title" id="levi-diabetes-timeline-title">Today</h2>
        ${timeline.length ? `<div class="levi_diabetes_timeline">${timeline.map(renderTimelineItem).join('')}</div>` : '<p class="levi_diabetes_empty">No readings recorded today.</p>'}
      </section>
    `;
  }

  function renderPrimaryCard(type) {
    const record = latestRecordForType(type);
    const isComplete = Boolean(record);
    return `
      <button type="button" class="levi_diabetes_card ${isComplete ? 'is-complete' : ''}" data-action="edit-primary" data-type="${escapeHtml(type)}">
        <span>
          <span class="levi_diabetes_card_title">${escapeHtml(type)}</span>
          <span class="levi_diabetes_card_status">${isComplete ? '✓ Completed' : '○ Not recorded'}</span>
          ${renderValuePills(record)}
        </span>
        <span class="levi_diabetes_card_icon" aria-hidden="true">${isComplete ? '✓' : '+'}</span>
      </button>
    `;
  }

  function renderTimelineItem(record) {
    const notes = record.notes
      ? `<div class="levi_diabetes_timeline_notes">${escapeHtml(record.notes)}</div>`
      : '';
    return `
      <article class="levi_diabetes_timeline_item">
        <div>
          <div class="levi_diabetes_timeline_type">${escapeHtml(record.type)}</div>
          <div class="levi_diabetes_timeline_values">${escapeHtml(formatBloodSugar(record.bloodSugar) || 'No blood sugar')} · ${escapeHtml(formatInsulin(record.insulinUnits) || 'No insulin')}</div>
          ${notes}
        </div>
        <time class="levi_diabetes_timeline_time" datetime="${escapeHtml(new Date(record.timestamp).toISOString())}">${escapeHtml(formatTime(record.timestamp))}</time>
      </article>
    `;
  }

  function renderEditor(options) {
    const root = getRoot();
    if (!root) return;
    const record = options.record || {};
    const isExtra = options.mode === 'extra';
    currentEditor = {
      mode: options.mode,
      id: record.id || null,
      type: record.type || options.type || 'Correction',
    };
    root.innerHTML = `
      <form class="levi_diabetes_editor" data-levi-editor>
        <h1 class="levi_diabetes_editor_title" id="levi-diabetes-title">${escapeHtml(isExtra ? 'Extra Check' : currentEditor.type)}</h1>
        ${isExtra ? renderTypeSelect(currentEditor.type) : ''}
        <label class="levi_diabetes_field">
          Blood Sugar
          <input class="levi_diabetes_input" name="bloodSugar" type="number" inputmode="numeric" min="0" step="1" autocomplete="off" value="${escapeHtml(record.bloodSugar ?? '')}">
        </label>
        <label class="levi_diabetes_field">
          Insulin
          <input class="levi_diabetes_input" name="insulinUnits" type="number" inputmode="decimal" min="0" step="0.5" autocomplete="off" value="${escapeHtml(record.insulinUnits ?? '')}">
        </label>
        <label class="levi_diabetes_field">
          Notes
          <textarea class="levi_diabetes_textarea" name="notes" rows="4">${escapeHtml(record.notes || '')}</textarea>
        </label>
        <div class="levi_diabetes_actions">
          <button type="button" class="levi_diabetes_button levi_diabetes_button--ghost" data-action="cancel">Cancel</button>
          <button type="submit" class="levi_diabetes_button levi_diabetes_button--primary">Save</button>
        </div>
      </form>
    `;
    root.querySelector('[name="bloodSugar"]')?.focus();
  }

  function renderTypeSelect(selectedType) {
    return `
      <label class="levi_diabetes_field">
        Type
        <select class="levi_diabetes_select" name="type">
          ${EXTRA_TYPES.map((type) => `<option value="${escapeHtml(type)}" ${type === selectedType ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
        </select>
      </label>
    `;
  }

  function openPrimaryEditor(type) {
    renderEditor({
      mode: 'primary',
      type,
      record: latestRecordForType(type) || { type },
    });
  }

  function openExtraEditor() {
    renderEditor({
      mode: 'extra',
      record: { type: 'Correction' },
    });
  }

  function upsertRecord(record) {
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }
    saveRecords();
  }

  function handleSave(form) {
    const now = new Date();
    const existing = currentEditor?.id
      ? records.find((record) => record.id === currentEditor.id)
      : null;
    const typeInput = form.elements.type;
    const type = typeInput && EXTRA_TYPES.includes(typeInput.value)
      ? typeInput.value
      : currentEditor?.type || 'Other';
    const timestamp = existing?.timestamp || now.getTime();
    upsertRecord({
      id: existing?.id || createId(),
      date: existing?.date || getLocalDateKey(now),
      time: existing?.time || getLocalTimeKey(now),
      type,
      bloodSugar: normalizeNumber(form.elements.bloodSugar.value),
      insulinUnits: normalizeNumber(form.elements.insulinUnits.value),
      notes: sanitizeNotes(form.elements.notes.value),
      timestamp,
    });
    renderHome();
  }

  function init() {
    const root = getRoot();
    if (!root) return;
    root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'edit-primary') {
        openPrimaryEditor(target.dataset.type);
      }
      if (action === 'extra') {
        openExtraEditor();
      }
      if (action === 'cancel') {
        renderHome();
      }
    });
    root.addEventListener('submit', (event) => {
      if (!event.target.matches('[data-levi-editor]')) return;
      event.preventDefault();
      handleSave(event.target);
    });
    renderHome();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
