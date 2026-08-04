(() => {
  const STORAGE_KEY = 'lando-world:road-bike-trip-checklist:v1';
  const STORAGE_VERSION = 1;

  const CHECKLIST_SECTIONS = [
    {
      id: 'bike-essentials',
      title: 'Bike & Essentials',
      items: [
        { id: 'bike-clean-tuned', text: 'Road, gravel, or TT bike — clean and tuned' },
        { id: 'water-bottles', text: 'Water bottles — x2 or hydration pack' },
        { id: 'bike-computer', text: 'Bike computer' },
        { id: 'bike-computer-charging-cable', text: 'Bike computer charging cable' },
        { id: 'heart-rate-monitor-strap', text: 'Heart rate monitor and strap' },
        { id: 'power-meter', text: 'Power meter, if not built into the bike' },
        { id: 'front-light', text: 'Front light' },
        { id: 'rear-light-radar', text: 'Rear light or radar' },
        { id: 'light-radar-charging-cables', text: 'Light and radar charging cables' },
        { id: 'helmet', text: 'Helmet' },
        { id: 'sunglasses', text: 'Sunglasses' },
        { id: 'cycling-shoes', text: 'Cycling shoes' },
        { id: 'pedals', text: 'Pedals, if removed for transportation' },
      ],
    },
    {
      id: 'cycling-apparel',
      title: 'Cycling Apparel',
      items: [
        { id: 'jerseys', text: 'Jerseys — one per ride day plus one extra' },
        { id: 'bib-shorts', text: 'Bib shorts — one per ride day' },
        { id: 'base-layers', text: 'Base layers' },
        { id: 'cycling-socks', text: 'Cycling socks' },
        { id: 'arm-warmers', text: 'Arm warmers' },
        { id: 'leg-knee-warmers', text: 'Leg or knee warmers' },
        { id: 'wind-vest-light-jacket', text: 'Wind vest or light jacket' },
        { id: 'compact-rain-jacket', text: 'Compact rain jacket' },
        { id: 'fingerless-gloves', text: 'Fingerless gloves' },
        { id: 'full-finger-gloves', text: 'Full-finger gloves, if needed' },
        { id: 'cycling-cap-headband-buff', text: 'Cycling cap, headband, or buff' },
        { id: 'post-ride-clothes', text: 'Post-ride clothes' },
        { id: 'sandals-recovery-shoes', text: 'Sandals or recovery shoes' },
      ],
    },
    {
      id: 'tools-repair-kit',
      title: 'Tools & Repair Kit',
      items: [
        { id: 'multitool', text: 'Multitool' },
        { id: 'spare-inner-tubes', text: 'Spare inner tubes — at least two' },
        { id: 'tire-levers', text: 'Tire levers' },
        { id: 'mini-pump', text: 'Mini electric pump or hand pump' },
        { id: 'co2-inflator-cartridges', text: 'CO₂ inflator and cartridges, if used' },
        { id: 'patch-kit', text: 'Patch kit' },
        { id: 'tubeless-plugs', text: 'Tubeless plugs, if applicable' },
        { id: 'spare-chain-quick-link', text: 'Spare chain quick link' },
        { id: 'chain-lube', text: 'Chain lube' },
        { id: 'small-rag', text: 'Small rag' },
        { id: 'valve-core-tool', text: 'Valve core tool' },
        { id: 'small-bike-lock', text: 'Small bike lock, if needed' },
      ],
    },
    {
      id: 'charging-tech',
      title: 'Charging & Tech',
      items: [
        { id: 'phone-charging-cable', text: 'Phone charging cable' },
        { id: 'electronic-shifting-charging-cable', text: 'Electronic shifting charging cable' },
        { id: 'power-bank', text: 'Power bank' },
        { id: 'wall-adapter-charging-brick', text: 'Wall adapter or charging brick' },
        { id: 'extension-cord-multi-port-charger', text: 'Extension cord or compact multi-port charger, if needed' },
      ],
    },
    {
      id: 'nutrition-hydration',
      title: 'Nutrition & Hydration',
      items: [
        { id: 'ride-fuel', text: 'Energy bars, chews, waffles, or gels' },
        { id: 'electrolytes', text: 'Electrolyte tablets or drink mix' },
        { id: 'recovery-drink-protein', text: 'Recovery drink or protein powder' },
        { id: 'off-bike-snacks', text: 'Off-bike snacks' },
        { id: 'pre-ride-breakfast', text: 'Pre-ride breakfast items, if needed' },
      ],
    },
    {
      id: 'personal-post-ride-care',
      title: 'Personal & Post-Ride Care',
      items: [
        { id: 'chamois-cream', text: 'Chamois cream' },
        { id: 'sunscreen', text: 'Sunscreen' },
        { id: 'lip-balm', text: 'Lip balm' },
        { id: 'wet-wipes', text: 'Wet wipes' },
        { id: 'small-towel', text: 'Small towel' },
        { id: 'toothbrush-toothpaste', text: 'Toothbrush and toothpaste' },
        { id: 'deodorant', text: 'Deodorant' },
        { id: 'other-toiletries', text: 'Other toiletries' },
        { id: 'laundry-bag', text: 'Laundry bag for dirty cycling clothes' },
        { id: 'foam-roller-massage-gun', text: 'Foam roller or massage gun, optional' },
      ],
    },
    {
      id: 'documents-miscellaneous',
      title: 'Documents & Miscellaneous',
      items: [
        { id: 'drivers-license-photo-id', text: "Driver's license or photo ID" },
        { id: 'insurance-card', text: 'Insurance card' },
        { id: 'registration-info', text: 'Ride or event registration information' },
        { id: 'emergency-contact-info', text: 'Emergency contact information' },
        { id: 'wallet', text: 'Wallet' },
        { id: 'travel-confirmation-info', text: 'Hotel, rental, or travel confirmation information, if needed' },
      ],
    },
  ];

  const allItemIds = new Set(CHECKLIST_SECTIONS.flatMap((section) => section.items.map((item) => item.id)));

  function getStorage() {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function readState() {
    const storage = getStorage();
    if (!storage) return createState([]);
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return createState([]);
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.checkedItemIds)) {
        return createState([]);
      }
      return createState(parsed.checkedItemIds);
    } catch {
      return createState([]);
    }
  }

  function createState(ids) {
    const checkedItemIds = [...new Set(ids.filter((id) => allItemIds.has(id)))];
    return {
      version: STORAGE_VERSION,
      checkedItemIds,
      updatedAt: nowIso(),
    };
  }

  function writeState(state) {
    const storage = getStorage();
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORAGE_VERSION,
        checkedItemIds: [...state.checkedItemIds],
        updatedAt: nowIso(),
      }));
      return true;
    } catch {
      return false;
    }
  }

  function saveCheckedItemIds(ids) {
    const state = createState(ids);
    writeState(state);
    notifyUpdated();
    return state;
  }

  function setItemChecked(itemId, checked) {
    if (!allItemIds.has(itemId)) return readState();
    const current = new Set(readState().checkedItemIds);
    if (checked) current.add(itemId);
    else current.delete(itemId);
    return saveCheckedItemIds([...current]);
  }

  function resetChecklistState() {
    return saveCheckedItemIds([]);
  }

  function getProgress(state = readState()) {
    const checkedIds = new Set(state.checkedItemIds);
    const checked = CHECKLIST_SECTIONS.reduce((count, section) => (
      count + section.items.filter((item) => checkedIds.has(item.id)).length
    ), 0);
    const total = allItemIds.size;
    return {
      checked,
      total,
      percent: total ? Math.round((checked / total) * 100) : 0,
    };
  }

  function getSectionProgress(section, state) {
    const checkedIds = new Set(state.checkedItemIds);
    const checked = section.items.filter((item) => checkedIds.has(item.id)).length;
    return {
      checked,
      total: section.items.length,
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderApp(root) {
    if (!root) return;
    const state = readState();
    const progress = getProgress(state);
    root.innerHTML = `
      <section class="road_bike_hero">
        <div>
          <h1 class="road_bike_title" id="road-bike-checklist-title">Road Bike Trip Checklist</h1>
          <p class="road_bike_subtitle">Pack once. Ride without forgetting anything.</p>
        </div>
        <div class="road_bike_progress" aria-live="polite">
          <div class="road_bike_progress_numbers">
            <span class="road_bike_progress_count" data-road-bike-progress-count>${progress.checked} of ${progress.total}</span>
            <span class="road_bike_progress_percent" data-road-bike-progress-percent>${progress.percent}% packed</span>
          </div>
          <div class="road_bike_progress_bar" aria-hidden="true" style="--road-bike-progress: ${progress.percent}%"><span></span></div>
        </div>
      </section>
      <div class="road_bike_sections">
        ${CHECKLIST_SECTIONS.map((section) => renderSection(section, state)).join('')}
      </div>
      <div class="road_bike_actions">
        <button type="button" class="road_bike_button road_bike_button--danger" data-road-bike-action="reset">Reset Checklist</button>
      </div>`;
  }

  function renderSection(section, state) {
    const sectionProgress = getSectionProgress(section, state);
    const checkedIds = new Set(state.checkedItemIds);
    return `
      <section class="road_bike_section" aria-labelledby="road-bike-section-${escapeHtml(section.id)}">
        <div class="road_bike_section_header">
          <h2 class="road_bike_section_title" id="road-bike-section-${escapeHtml(section.id)}">${escapeHtml(section.title)}</h2>
          <span class="road_bike_section_count" data-road-bike-section-count="${escapeHtml(section.id)}">${sectionProgress.checked} of ${sectionProgress.total}</span>
        </div>
        <div class="road_bike_items">
          ${section.items.map((item) => renderItem(item, checkedIds.has(item.id))).join('')}
        </div>
      </section>`;
  }

  function renderItem(item, checked) {
    const inputId = `road-bike-item-${item.id}`;
    return `
      <label class="road_bike_item" for="${escapeHtml(inputId)}">
        <input id="${escapeHtml(inputId)}" type="checkbox" data-road-bike-item="${escapeHtml(item.id)}" ${checked ? 'checked' : ''}>
        <span class="road_bike_item_text">${escapeHtml(item.text)}</span>
      </label>`;
  }

  function syncProgress(root) {
    const state = readState();
    const progress = getProgress(state);
    const count = root.querySelector('[data-road-bike-progress-count]');
    const percent = root.querySelector('[data-road-bike-progress-percent]');
    const bar = root.querySelector('.road_bike_progress_bar');
    if (count) count.textContent = `${progress.checked} of ${progress.total}`;
    if (percent) percent.textContent = `${progress.percent}% packed`;
    if (bar) bar.style.setProperty('--road-bike-progress', `${progress.percent}%`);

    CHECKLIST_SECTIONS.forEach((section) => {
      const sectionProgress = getSectionProgress(section, state);
      const sectionCount = root.querySelector(`[data-road-bike-section-count="${section.id}"]`);
      if (sectionCount) sectionCount.textContent = `${sectionProgress.checked} of ${sectionProgress.total}`;
    });
  }

  function notifyUpdated() {
    window.dispatchEvent(new CustomEvent('road-bike-checklist:updated', {
      detail: getProgress(),
    }));
  }

  function showConfirmationDialog({
    title,
    message,
    confirmLabel,
    cancelLabel = 'Cancel',
  }) {
    return new Promise((resolve) => {
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const titleId = 'road-bike-reset-title';
      const messageId = 'road-bike-reset-message';
      const dialog = document.createElement('div');
      dialog.className = 'road_bike_confirm';
      dialog.innerHTML = `
        <div class="road_bike_confirm__backdrop" data-road-bike-confirm-action="cancel"></div>
        <section class="road_bike_confirm__dialog" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${messageId}">
          <h2 class="road_bike_confirm__title" id="${titleId}">${escapeHtml(title)}</h2>
          <p class="road_bike_confirm__message" id="${messageId}">${escapeHtml(message)}</p>
          <div class="road_bike_confirm__actions">
            <button type="button" class="road_bike_button" data-road-bike-confirm-action="cancel">${escapeHtml(cancelLabel)}</button>
            <button type="button" class="road_bike_button road_bike_button--danger" data-road-bike-confirm-action="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </section>`;

      let settled = false;

      function close(confirmed) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', handleKeydown);
        dialog.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(confirmed);
      }

      function handleKeydown(event) {
        if (event.key === 'Escape') close(false);
      }

      dialog.addEventListener('click', (event) => {
        const action = event.target.closest('[data-road-bike-confirm-action]')?.dataset.roadBikeConfirmAction;
        if (action === 'cancel') close(false);
        if (action === 'confirm') close(true);
      });

      document.body.appendChild(dialog);
      document.addEventListener('keydown', handleKeydown);
      dialog.querySelector('[data-road-bike-confirm-action="cancel"]')?.focus();
    });
  }

  async function requestReset(root, confirmReset = showConfirmationDialog) {
    const confirmed = await confirmReset({
      title: 'Reset checklist?',
      message: 'This will uncheck every packed item so you can prepare for a new trip.',
      confirmLabel: 'Reset',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return false;
    resetChecklistState();
    renderApp(root);
    return true;
  }

  function bindRoot(root) {
    root.addEventListener('change', (event) => {
      const input = event.target.closest('[data-road-bike-item]');
      if (!input) return;
      setItemChecked(input.dataset.roadBikeItem, input.checked);
      syncProgress(root);
    });

    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-road-bike-action]')?.dataset.roadBikeAction;
      if (action === 'reset') requestReset(root);
    });
  }

  function init() {
    const root = document.getElementById('road-bike-checklist-root');
    if (!root) return;
    renderApp(root);
    bindRoot(root);
    notifyUpdated();
  }

  window.RoadBikeTripChecklist = {
    CHECKLIST_SECTIONS,
    STORAGE_KEY,
    getProgress,
    readState,
    saveCheckedItemIds,
    setItemChecked,
    resetChecklistState,
    renderApp,
    requestReset,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
