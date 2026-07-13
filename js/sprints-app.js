(() => {
  const STORAGE_KEY = 'violet_sprints_workouts_v1';
  const PRE_STEP_COUNTDOWN = 3;

  let workouts = [];
  let activeTimer = null;
  let audioCtx = null;

  function createId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function createStep(label = 'Walk', duration = 60) {
    return { id: createId(), label, duration };
  }

  function createWorkout(name = 'New Workout', steps = []) {
    return { id: createId(), name, steps };
  }

  function thursdaySoccerConditioningSteps() {
    const steps = [createStep('Warm-up Easy Jog', 420)];
    for (let round = 1; round <= 8; round += 1) {
      steps.push(createStep(`Fast ${round}`, 20));
      steps.push(createStep(`Easy Walk ${round}`, 100));
    }
    steps.push(createStep('Rest', 180));
    for (let round = 1; round <= 6; round += 1) {
      steps.push(createStep(`Sprint ${round}`, 10));
      steps.push(createStep(`Easy Jog ${round}`, 50));
    }
    steps.push(createStep('Easy Walk Finish', 300));
    return steps;
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

  function defaultWorkouts() {
    return [
      createWorkout('Thursday Sprints', thursdaySoccerConditioningSteps()),
      createWorkout('Tabata', [
        createStep('Sprint', 20),
        createStep('Rest', 10),
        createStep('Sprint', 20),
        createStep('Rest', 10),
        createStep('Sprint', 20),
        createStep('Rest', 10),
        createStep('Sprint', 20),
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
    workouts = workouts.map((workout) => (
      isOldThursdaySprints(workout) ? updateOldThursdaySprints(workout) : workout
    ));
    saveWorkouts();
  }

  function duplicateWorkout(workout) {
    return {
      id: createId(),
      name: `${workout.name} Copy`,
      steps: workout.steps.map((step) => ({ id: createId(), label: step.label, duration: step.duration })),
    };
  }

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playBeep(frequency = 880, durationMs = 120) {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      /* audio unavailable */
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

    root.addEventListener('click', (event) => {
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
        if (target && confirm(`Delete "${target.name}"?`)) {
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
        stepTheme: getStepTheme(step?.label),
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
        phase = 'complete';
        emitUpdate();
      },
      restart() {
        clearTick();
        this.start();
      },
      destroy() {
        clearTick();
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
    const countdown = state.phase === 'pre_countdown' ? String(Number(state.countdown.slice(-2))) : state.countdown;
    root.innerHTML = `
      <div class="sprints-timer sprints-timer--${escapeHtml(state.stepTheme)}">
        <div class="sprints-timer-main">
          <div class="sprints-timer-workout">${escapeHtml(state.workoutName)}</div>
          <div class="sprints-timer-step">${escapeHtml(label)}</div>
          <div class="sprints-countdown">${escapeHtml(countdown)}</div>
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

  function showTimer(id) {
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
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || !activeTimer) return;
      const action = button.dataset.action;
      if (action === 'pause') activeTimer.pause();
      if (action === 'resume') activeTimer.resume();
      if (action === 'skip') activeTimer.skip();
      if (action === 'back-step') activeTimer.back();
      if (action === 'finish') activeTimer.finish();
      if (action === 'restart') activeTimer.restart();
      if (action === 'list') showWorkoutList();
    });
    activeTimer.start();
  }

  function init() {
    loadWorkouts();
    document.getElementById('open-sprints')?.addEventListener('click', showWorkoutList);
    setView('clock');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
