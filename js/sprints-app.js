(() => {
  const STORAGE_KEY = 'violet_sprints_workouts_v1';
  const PRE_STEP_COUNTDOWN = 3;

  let workouts = [];
  let activeTimer = null;
  let audioCtx = null;
  let audioUnlocked = false;
  const activeAudioNodes = new Set();

  function createId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function createStep(label = 'Walk', duration = 60, metadata = {}) {
    return { id: createId(), label, duration, ...metadata };
  }

  function createWorkout(name = 'New Workout', steps = []) {
    return { id: createId(), name, steps };
  }

  function thursdaySoccerConditioningSteps() {
    const steps = [createStep('Warm-up Easy Jog', 420)];
    for (let round = 1; round <= 8; round += 1) {
      const metadata = { round, totalRounds: 8, blockId: 'fast-run-block' };
      steps.push(createStep('Fast Run', 20, metadata));
      steps.push(createStep('Walk', 100, metadata));
    }
    steps.push(createStep('Long Rest', 180));
    for (let round = 1; round <= 6; round += 1) {
      const metadata = { round, totalRounds: 6, blockId: 'sprint-block' };
      steps.push(createStep('Sprint', 10, metadata));
      steps.push(createStep('Walk', 50, metadata));
    }
    steps.push(createStep('Cooldown', 300));
    return steps;
  }

  function isNumberedThursdaySprints(workout) {
    const expected = thursdaySoccerConditioningSteps();
    return workout?.name === 'Thursday Sprints'
      && Array.isArray(workout.steps)
      && workout.steps.length === expected.length
      && workout.steps[0]?.label === 'Warm-up Easy Jog'
      && workout.steps[0]?.duration === 420
      && workout.steps[17]?.label === 'Rest'
      && workout.steps[17]?.duration === 180
      && workout.steps[30]?.label === 'Easy Walk Finish'
      && workout.steps[30]?.duration === 300
      && workout.steps.every((step, index) => step.duration === expected[index].duration);
  }

  function isOldThursdaySprints(workout) {
    const oldSteps = [
      ['Walk', 120],
      ['Sprint', 30],
      ['Walk', 90],
      ['Sprint', 30],
      ['Walk', 90],
      ['Sprint', 30],
      ['Cooldown', 300],
    ];
    return workout?.name === 'Thursday Sprints'
      && Array.isArray(workout.steps)
      && workout.steps.length === oldSteps.length
      && workout.steps.every((step, index) => (
        step.label === oldSteps[index][0] && step.duration === oldSteps[index][1]
      ));
  }

  function updateOldThursdaySprints(workout) {
    return {
      ...workout,
      steps: thursdaySoccerConditioningSteps(),
    };
  }

  function isDefaultTabata(workout) {
    const labels = ['Sprint', 'Rest', 'Sprint', 'Rest', 'Sprint', 'Rest', 'Sprint', 'Rest', 'Cooldown'];
    const durations = [20, 10, 20, 10, 20, 10, 20, 10, 120];
    return workout?.name === 'Tabata'
      && Array.isArray(workout.steps)
      && workout.steps.length === labels.length
      && workout.steps.every((step, index) => (
        step.label === labels[index] && step.duration === durations[index]
      ));
  }

  function updateDefaultTabata(workout) {
    return {
      ...workout,
      steps: workout.steps.map((step) => ({
        ...step,
        label: step.label === 'Sprint' ? 'Exercise' : step.label,
      })),
    };
  }

  function defaultWorkouts() {
    return [
      createWorkout('Thursday Sprints', thursdaySoccerConditioningSteps()),
      createWorkout('Tabata', [
        createStep('Exercise', 20),
        createStep('Rest', 10),
        createStep('Exercise', 20),
        createStep('Rest', 10),
        createStep('Exercise', 20),
        createStep('Rest', 10),
        createStep('Exercise', 20),
        createStep('Rest', 10),
        createStep('Cooldown', 120),
      ]),
    ];
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatCountdownDisplay(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds || 0));
    if (s <= 60) {
      return String(s);
    }
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function showConfirmationDialog({
    title,
    message,
    confirmLabel,
    cancelLabel = 'Cancel',
    confirmClass = 'sprints-btn--danger',
  }) {
    return new Promise((resolve) => {
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const restoreAction = previousFocus?.getAttribute('data-action');
      const titleId = `sprints-confirm-title-${createId()}`;
      const messageId = `sprints-confirm-message-${createId()}`;
      const dialog = document.createElement('div');
      dialog.className = 'sprints-confirm';
      dialog.innerHTML = `
        <div class="sprints-confirm__backdrop" data-confirm-action="cancel"></div>
        <section class="sprints-confirm__dialog" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${messageId}">
          <h2 class="sprints-confirm__title" id="${titleId}">${escapeHtml(title)}</h2>
          <p class="sprints-confirm__message" id="${messageId}">${escapeHtml(message)}</p>
          <div class="sprints-confirm__actions">
            <button type="button" class="sprints-btn" data-confirm-action="cancel">${escapeHtml(cancelLabel)}</button>
            <button type="button" class="sprints-btn ${escapeHtml(confirmClass)}" data-confirm-action="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </section>`;

      let settled = false;

      function close(confirmed) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', handleKeydown);
        dialog.remove();
        const focusTarget = previousFocus?.isConnected
          ? previousFocus
          : document.querySelector(`[data-action="${restoreAction}"]`);
        if (focusTarget instanceof HTMLElement) focusTarget.focus();
        resolve(confirmed);
      }

      function handleKeydown(event) {
        if (event.key === 'Escape') close(false);
      }

      dialog.addEventListener('click', (event) => {
        const action = event.target.closest('[data-confirm-action]')?.dataset.confirmAction;
        if (action === 'cancel') close(false);
        if (action === 'confirm') close(true);
      });

      document.body.appendChild(dialog);
      document.addEventListener('keydown', handleKeydown);
      dialog.querySelector('[data-confirm-action="cancel"]')?.focus();
    });
  }

  function parseDuration(input) {
    const raw = String(input || '').trim();
    if (!raw) return 0;
    if (raw.includes(':')) {
      const parts = raw.split(':');
      return Math.max(0, (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0));
    }
    return Math.max(0, parseInt(raw, 10) || 0);
  }

  function totalWorkoutDuration(steps) {
    return steps.reduce((sum, step) => sum + (step.duration || 0), 0);
  }

  function getStepTheme(label) {
    const key = String(label || '').toLowerCase();
    if (key.includes('sprint')) return 'sprint';
    if (key.includes('fast') || key.includes('run')) return 'sprint';
    if (key.includes('walk')) return 'walk';
    if (key.includes('rest')) return 'rest';
    if (key.includes('cooldown') || key.includes('cool down')) return 'cooldown';
    if (key.includes('jog')) return 'jog';
    return 'default';
  }

  function readWorkouts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveWorkouts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
    } catch {
      /* storage unavailable */
    }
  }

  function loadWorkouts() {
    workouts = readWorkouts() || defaultWorkouts();
    workouts = workouts.map((workout) => {
      if (isOldThursdaySprints(workout) || isNumberedThursdaySprints(workout)) return updateOldThursdaySprints(workout);
      if (isDefaultTabata(workout)) return updateDefaultTabata(workout);
      return workout;
    });
    saveWorkouts();
  }

  function duplicateWorkout(workout) {
    return {
      id: createId(),
      name: `${workout.name} Copy`,
      steps: workout.steps.map((step) => ({ ...step, id: createId() })),
    };
  }

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      audioCtx = new AudioContextClass();
    }
    return audioCtx;
  }

  function logAudioState(message) {
    console.log(`Violet Sprints audio: ${message}`, audioCtx?.state || 'unavailable');
  }

  function shouldResumeAudio(ctx) {
    return ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted');
  }

  function showSoundEnableControl() {
    const root = sprintsRoot();
    if (!root || root.hidden || root.querySelector('[data-action="enable-sound"]')) {
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sprints-sound-enable';
    button.dataset.action = 'enable-sound';
    button.textContent = 'Tap to Enable Sound';
    button.addEventListener('click', async () => {
      const enabled = await unlockAudio();
      if (enabled) {
        button.remove();
      }
    });
    root.appendChild(button);
    logAudioState('showing enable control');
  }

  function hideSoundEnableControl() {
    document.querySelectorAll('[data-action="enable-sound"]').forEach((button) => button.remove());
  }

  async function ensureAudioIsRunning() {
    const ctx = getAudioContext();
    if (!ctx) {
      showSoundEnableControl();
      return false;
    }
    if (shouldResumeAudio(ctx)) {
      try {
        await ctx.resume();
      } catch (error) {
        console.warn('Unable to resume audio context:', error);
      }
    }
    const isRunning = ctx.state === 'running';
    if (isRunning) {
      hideSoundEnableControl();
    } else {
      showSoundEnableControl();
    }
    return isRunning;
  }

  async function unlockAudio() {
    const ctx = getAudioContext();
    if (!ctx) {
      showSoundEnableControl();
      return false;
    }
    if (!(await ensureAudioIsRunning())) {
      logAudioState('unlock failed before primer');
      return false;
    }
    if (!audioUnlocked) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.00001, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.01);
        audioUnlocked = true;
      } catch (error) {
        console.warn('Unable to unlock audio context:', error);
        showSoundEnableControl();
        return false;
      }
    }
    hideSoundEnableControl();
    logAudioState('unlocked');
    return ctx.state === 'running';
  }

  function trackBeepNodes(osc, gain) {
    const entry = { osc, gain };
    activeAudioNodes.add(entry);
    osc.addEventListener('ended', () => {
      activeAudioNodes.delete(entry);
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* node already disconnected */
      }
    });
  }

  function stopActiveBeeps() {
    activeAudioNodes.forEach(({ osc, gain }) => {
      try {
        osc.stop();
      } catch {
        /* oscillator already stopped */
      }
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* node already disconnected */
      }
    });
    activeAudioNodes.clear();
  }

  function playBeep(frequency = 880, durationMs = 120) {
    try {
      const ctx = getAudioContext();
      if (!ctx) {
        showSoundEnableControl();
        return;
      }
      if (ctx.state !== 'running') {
        if (shouldResumeAudio(ctx)) {
          ctx.resume().then(() => {
            if (ctx.state !== 'running') showSoundEnableControl();
          }).catch(() => showSoundEnableControl());
        } else {
          showSoundEnableControl();
        }
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      trackBeepNodes(osc, gain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      showSoundEnableControl();
    }
  }

  function clockView() {
    return document.getElementById('clock-view');
  }

  function sprintsRoot() {
    return document.getElementById('sprints-view');
  }

  function setView(name) {
    const clock = clockView();
    const sprints = sprintsRoot();
    if (clock) clock.hidden = name !== 'clock';
    if (sprints) sprints.hidden = name === 'clock';
  }

  function replaceSprintsRoot() {
    const current = sprintsRoot();
    const next = current.cloneNode(false);
    current.replaceWith(next);
    return next;
  }

  function stopTimer() {
    if (activeTimer) {
      activeTimer.destroy();
      activeTimer = null;
    }
  }

  function showClock() {
    stopTimer();
    stopActiveBeeps();
    setView('clock');
  }

  function showWorkoutList() {
    stopTimer();
    setView('sprints');
    const root = replaceSprintsRoot();
    root.innerHTML = `
      <div class="sprints-app">
        <header class="sprints-header">
          <button type="button" class="sprints-btn sprints-btn--ghost" data-action="back-clock">Digital Clock</button>
          <h1 class="sprints-title">Violet Sprints</h1>
          <button type="button" class="sprints-btn sprints-btn--primary" data-action="create">+ New</button>
        </header>
        <ul class="sprints-list" role="list">
          ${workouts.length ? workouts.map((workout) => `
            <li class="sprints-list-item" data-id="${escapeHtml(workout.id)}">
              <button type="button" class="sprints-list-main" data-action="open" data-id="${escapeHtml(workout.id)}">
                <span class="sprints-list-name">${escapeHtml(workout.name)}</span>
                <span class="sprints-list-meta">${workout.steps.length} steps</span>
              </button>
              <div class="sprints-list-actions">
                <button type="button" class="sprints-btn sprints-btn--accent" data-action="start" data-id="${escapeHtml(workout.id)}">Start</button>
                <button type="button" class="sprints-btn" data-action="duplicate" data-id="${escapeHtml(workout.id)}">Duplicate</button>
                <button type="button" class="sprints-btn sprints-btn--danger" data-action="delete" data-id="${escapeHtml(workout.id)}">Delete</button>
              </div>
            </li>`).join('') : '<li class="sprints-empty">No workouts yet. Tap + New to create one.</li>'}
        </ul>
      </div>`;

    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const id = button.dataset.id;
      const action = button.dataset.action;
      if (action === 'back-clock') showClock();
      if (action === 'create') {
        const workout = createWorkout('New Workout', []);
        workouts.push(workout);
        saveWorkouts();
        showEditor(workout.id);
      }
      if (action === 'open') showEditor(id);
      if (action === 'start') showTimer(id);
      if (action === 'duplicate') {
        const source = workouts.find((workout) => workout.id === id);
        if (source) {
          workouts.push(duplicateWorkout(source));
          saveWorkouts();
          showWorkoutList();
        }
      }
      if (action === 'delete') {
        const target = workouts.find((workout) => workout.id === id);
        if (target && await showConfirmationDialog({
          title: 'Delete Workout?',
          message: 'This action cannot be undone.',
          confirmLabel: 'Delete',
        })) {
          workouts = workouts.filter((workout) => workout.id !== id);
          saveWorkouts();
          showWorkoutList();
        }
      }
    });
  }

  function showEditor(id) {
    stopTimer();
    setView('sprints');
    const root = replaceSprintsRoot();
    let draft = JSON.parse(JSON.stringify(workouts.find((workout) => workout.id === id) || createWorkout()));

    function readForm() {
      draft.name = root.querySelector('#sprints-workout-name')?.value.trim() || 'Untitled Workout';
      root.querySelectorAll('.sprints-step').forEach((row) => {
        const step = draft.steps.find((item) => item.id === row.dataset.stepId);
        if (!step) return;
        step.label = row.querySelector('[data-field="label"]')?.value.trim() || 'Step';
        step.duration = parseDuration(row.querySelector('[data-field="duration"]')?.value);
      });
    }

    function persist() {
      readForm();
      const index = workouts.findIndex((workout) => workout.id === draft.id);
      if (index >= 0) workouts[index] = draft;
      else workouts.push(draft);
      saveWorkouts();
    }

    function render() {
      root.innerHTML = `
        <div class="sprints-app">
          <header class="sprints-header">
            <button type="button" class="sprints-btn sprints-btn--ghost" data-action="back">Workouts</button>
            <button type="button" class="sprints-btn sprints-btn--accent sprints-btn--large" data-action="start">Start</button>
          </header>
          <div class="sprints-editor">
            <label class="sprints-field">
              <span class="sprints-label">Workout name</span>
              <input type="text" class="sprints-input sprints-input--large" id="sprints-workout-name" value="${escapeHtml(draft.name)}">
            </label>
            <h2 class="sprints-subtitle">Workout Steps</h2>
            <ul class="sprints-steps" role="list">
              ${draft.steps.length ? draft.steps.map((step, index) => `
                <li class="sprints-step" data-step-id="${escapeHtml(step.id)}">
                  <div class="sprints-step-fields">
                    <input type="text" class="sprints-input" data-field="label" value="${escapeHtml(step.label)}" aria-label="Step name">
                    <input type="text" class="sprints-input sprints-input--duration" data-field="duration" value="${formatDuration(step.duration)}" aria-label="Duration mm:ss" inputmode="numeric">
                  </div>
                  <div class="sprints-step-actions">
                    <button type="button" class="sprints-btn" data-action="up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>Up</button>
                    <button type="button" class="sprints-btn" data-action="down" data-index="${index}" ${index === draft.steps.length - 1 ? 'disabled' : ''}>Down</button>
                    <button type="button" class="sprints-btn sprints-btn--danger" data-action="remove" data-index="${index}">Delete</button>
                  </div>
                </li>`).join('') : '<li class="sprints-empty">No steps yet. Add one below.</li>'}
            </ul>
            <button type="button" class="sprints-btn sprints-btn--primary sprints-btn--block" data-action="add-step">+ Add Step</button>
            <button type="button" class="sprints-btn sprints-btn--block" data-action="save">Save Workout</button>
          </div>
        </div>`;
    }

    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      readForm();
      const index = Number(button.dataset.index);
      const action = button.dataset.action;
      if (action === 'back') {
        persist();
        showWorkoutList();
      }
      if (action === 'start') {
        persist();
        showTimer(draft.id);
      }
      if (action === 'save') {
        persist();
        showWorkoutList();
      }
      if (action === 'add-step') {
        draft.steps.push(createStep('Walk', 60));
        render();
      }
      if (action === 'remove') {
        draft.steps.splice(index, 1);
        render();
      }
      if (action === 'up' && index > 0) {
        [draft.steps[index - 1], draft.steps[index]] = [draft.steps[index], draft.steps[index - 1]];
        render();
      }
      if (action === 'down' && index < draft.steps.length - 1) {
        [draft.steps[index + 1], draft.steps[index]] = [draft.steps[index], draft.steps[index + 1]];
        render();
      }
    });

    render();
  }

  function createWorkoutTimer(workout, callbacks) {
    let stepIndex = 0;
    let phase = 'idle';
    let secondsLeft = 0;
    let tickId = null;
    let paused = false;

    function clearTick() {
      if (tickId !== null) {
        clearInterval(tickId);
        tickId = null;
      }
    }

    function currentStep() {
      return workout.steps[stepIndex] || null;
    }

    function nextStep() {
      return workout.steps[stepIndex + 1] || null;
    }

    function isWarmupOrCooldownStep(step) {
      const label = String(step?.label || '').toLowerCase();
      return label.includes('warm') || label.includes('cooldown') || label.includes('cool down');
    }

    function isRestStep(step) {
      const theme = getStepTheme(step?.label);
      return !isWarmupOrCooldownStep(step)
        && (theme === 'rest' || theme === 'walk' || theme === 'jog' || theme === 'cooldown');
    }

    function isWorkStep(step) {
      return Boolean(step) && !isWarmupOrCooldownStep(step) && !isRestStep(step);
    }

    function shouldPlayRestWarning() {
      return isRestStep(currentStep()) && isWorkStep(nextStep());
    }

    function roundLabel(step) {
      return Number.isFinite(step?.round) && Number.isFinite(step?.totalRounds)
        ? `Round ${step.round} of ${step.totalRounds}`
        : '';
    }

    function remainingWorkoutSeconds() {
      let total = secondsLeft;
      if (phase === 'pre_countdown') total += currentStep()?.duration || 0;
      for (let i = stepIndex + 1; i < workout.steps.length; i += 1) total += workout.steps[i].duration || 0;
      return total;
    }

    function emitUpdate() {
      const step = currentStep();
      callbacks.onUpdate({
        phase,
        paused,
        workoutName: workout.name,
        stepIndex,
        totalSteps: workout.steps.length,
        stepLabel: step?.label || '',
        roundLabel: phase === 'running' ? roundLabel(step) : '',
        stepTheme: getStepTheme(step?.label),
        secondsLeft,
        countdown: formatDuration(secondsLeft),
        nextLabel: nextStep()?.label || '',
        remaining: formatDuration(remainingWorkoutSeconds()),
        complete: phase === 'complete',
      });
    }

    function beginPreCountdown() {
      phase = 'pre_countdown';
      secondsLeft = PRE_STEP_COUNTDOWN;
      emitUpdate();
      playBeep(660);
    }

    function beginStep() {
      const step = currentStep();
      if (!step) {
        phase = 'complete';
        emitUpdate();
        return;
      }
      phase = 'running';
      secondsLeft = step.duration;
      playBeep(isWorkStep(step) ? 1760 : 1320, isWorkStep(step) ? 240 : 100);
      if (isWorkStep(step) && secondsLeft <= 5) {
        playBeep(880);
      }
      if (shouldPlayRestWarning() && secondsLeft <= 3) {
        playBeep(660);
      }
      emitUpdate();
    }

    function advanceStep() {
      if (stepIndex >= workout.steps.length - 1) {
        phase = 'complete';
        clearTick();
        emitUpdate();
        return;
      }
      stepIndex += 1;
      beginStep();
    }

    function tick() {
      if (paused) return;
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        if (phase === 'pre_countdown') playBeep(660);
        if (phase === 'running' && isWorkStep(currentStep()) && secondsLeft <= 5) playBeep(880);
        if (phase === 'running' && shouldPlayRestWarning() && secondsLeft <= 3) playBeep(660);
        emitUpdate();
        return;
      }
      if (phase === 'pre_countdown') beginStep();
      else if (phase === 'running') {
        advanceStep();
      }
    }

    return {
      start() {
        if (!workout.steps.length) return;
        stepIndex = 0;
        paused = false;
        beginPreCountdown();
        clearTick();
        tickId = setInterval(tick, 1000);
      },
      pause() {
        paused = true;
        emitUpdate();
      },
      resume() {
        paused = false;
        emitUpdate();
      },
      skip() {
        if (phase === 'complete') return;
        clearTick();
        advanceStep();
        if (phase !== 'complete') tickId = setInterval(tick, 1000);
      },
      back() {
        if (phase === 'complete') return;
        clearTick();
        if (stepIndex > 0) stepIndex -= 1;
        beginStep();
        tickId = setInterval(tick, 1000);
      },
      finish() {
        clearTick();
        stopActiveBeeps();
        phase = 'complete';
        emitUpdate();
      },
      restart() {
        clearTick();
        this.start();
      },
      destroy() {
        clearTick();
        stopActiveBeeps();
        phase = 'idle';
      },
    };
  }

  function renderTimer(root, state) {
    if (state.complete) {
      root.innerHTML = `
        <div class="sprints-complete">
          <h1 class="sprints-complete-title">Workout Complete</h1>
          <div class="sprints-complete-actions">
            <button type="button" class="sprints-btn sprints-btn--accent" data-action="restart">Restart</button>
            <button type="button" class="sprints-btn sprints-btn--primary" data-action="list">Workout List</button>
          </div>
        </div>`;
      return;
    }

    const label = state.phase === 'pre_countdown' ? 'Get Ready' : state.stepLabel;
    const countdownSeconds = state.phase === 'pre_countdown' ? Number(state.countdown.slice(-2)) : state.secondsLeft;
    const countdown = formatCountdownDisplay(countdownSeconds);
    const countdownMode = countdownSeconds <= 60 ? 'seconds' : 'time';
    root.innerHTML = `
      <div class="sprints-timer sprints-timer--${escapeHtml(state.stepTheme)}">
        <div class="sprints-timer-main">
          <div class="sprints-timer-workout">${escapeHtml(state.workoutName)}</div>
          <div class="sprints-timer-step">${escapeHtml(label)}</div>
          ${state.roundLabel ? `<div class="sprints-timer-round">${escapeHtml(state.roundLabel)}</div>` : ''}
          <div class="sprints-countdown sprints-countdown--${countdownMode}">${escapeHtml(countdown)}</div>
          <div class="sprints-timer-meta">Step ${state.stepIndex + 1} of ${state.totalSteps}</div>
        </div>
        <div class="sprints-timer-grid">
          <div class="sprints-timer-panel"><span class="sprints-timer-small">Next</span><span class="sprints-timer-value">${escapeHtml(state.nextLabel || 'Finish')}</span></div>
          <div class="sprints-timer-panel"><span class="sprints-timer-small">Remaining</span><span class="sprints-timer-value">${escapeHtml(state.remaining)}</span></div>
        </div>
        <div class="sprints-timer-actions">
          <button type="button" class="sprints-btn sprints-btn--accent" data-action="${state.paused ? 'resume' : 'pause'}">${state.paused ? 'Resume' : 'Pause'}</button>
          <button type="button" class="sprints-btn" data-action="skip">Skip Step</button>
          <button type="button" class="sprints-btn" data-action="back-step">Back</button>
          <button type="button" class="sprints-btn sprints-btn--danger" data-action="finish">Finish Workout</button>
          <button type="button" class="sprints-btn sprints-btn--ghost" data-action="list">Workouts</button>
        </div>
      </div>`;
  }

  async function showTimer(id) {
    await unlockAudio();
    const workout = workouts.find((item) => item.id === id);
    if (!workout) {
      showWorkoutList();
      return;
    }
    stopTimer();
    setView('sprints');
    const root = replaceSprintsRoot();
    if (!workout.steps.length) {
      root.innerHTML = '<div class="sprints-app"><button type="button" class="sprints-btn sprints-btn--ghost" data-action="list">Workouts</button><div class="sprints-empty">Add at least one workout step before starting.</div></div>';
      root.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="list"]')) showWorkoutList();
      });
      return;
    }
    activeTimer = createWorkoutTimer(workout, { onUpdate: (state) => renderTimer(root, state) });
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || !activeTimer) return;
      const action = button.dataset.action;
      if (action === 'pause') activeTimer.pause();
      if (action === 'resume') {
        await unlockAudio();
        activeTimer.resume();
      }
      if (action === 'skip') {
        await unlockAudio();
        activeTimer.skip();
      }
      if (action === 'back-step') {
        await unlockAudio();
        activeTimer.back();
      }
      if (action === 'finish' && await showConfirmationDialog({
        title: 'Finish Workout?',
        message: 'Your current workout will end immediately.',
        confirmLabel: 'Finish Workout',
      })) activeTimer.finish();
      if (action === 'restart') {
        await unlockAudio();
        activeTimer.restart();
      }
      if (action === 'list') {
        stopActiveBeeps();
        showWorkoutList();
      }
    });
    activeTimer.start();
  }

  function init() {
    loadWorkouts();
    document.getElementById('open-sprints')?.addEventListener('click', async () => {
      const audioEnabled = await unlockAudio();
      showWorkoutList();
      if (!audioEnabled) {
        showSoundEnableControl();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && audioCtx) {
        ensureAudioIsRunning().then((running) => {
          if (!running) logAudioState('not running after visibility restore');
        });
      }
    });
    setView('clock');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
