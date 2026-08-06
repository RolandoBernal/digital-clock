(() => {
  const STORAGE_KEY = 'violet_sprints_workouts_v1';
  const PRE_STEP_COUNTDOWN = 3;
  const INSTALL_PROMPT_DISMISSED_KEY = 'violet_sprints_install_prompt_dismissed_v1';
  const SOCCER_WORKOUT_ADDED_KEY = 'violet_sprints_soccer_workout_added_v1';
  const COMPLETION_MESSAGES = [
    'Great work!',
    'Good job!',
    'Strong finish!',
    'You did it!',
    'Another workout completed.',
    'One workout closer to your goal.',
    'Work hard today. Enjoy the results tomorrow.',
    "You're adding more days to your journey on this planet.",
    'Small steps. Big results.',
    'Discipline beats motivation.',
    'Keep showing up.',
    'Your future self thanks you.',
  ];
  let lastCompletionMessage = '';

  let workouts = [];
  let activeTimer = null;
  let audioCtx = null;
  let audioUnlocked = false;
  let wakeLock = null;
  let workoutWakeLockWanted = false;
  let wakeLockNoticeShown = false;
  const activeAudioNodes = new Set();

  function renderEcosystemNav() {
    return `
      <nav class="ecosystem_nav" aria-label="Lando's World app navigation" data-ecosystem-nav>
        <a class="ecosystem_nav_back" href="#/" aria-label="Return to Lando's World home">
          <span class="ecosystem_nav_arrow" aria-hidden="true">←</span>
          <span>Lando's World</span>
        </a>
      </nav>`;
  }

  function createId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function createStep(label = 'Walk', duration = 60, metadata = {}) {
    return { id: createId(), label, duration, ...metadata };
  }

  function createWorkout(name = 'New Workout', steps = []) {
    return { id: createId(), name, steps };
  }

  function createWorkoutBlock(title, type, steps = [], options = {}) {
    return {
      id: options.id || createId(),
      title,
      type,
      steps,
      preBlockCountdown: options.preBlockCountdown || 0,
      metadata: options.metadata || {},
    };
  }

  function createBlockedWorkout(name, blocks = [], metadata = {}) {
    return { id: createId(), name, blocks, ...metadata };
  }

  function treadmillSprintsSteps() {
    const steps = [
      createStep('Warmup Walk', 120, { targetSpeed: 3.2, speedUnit: 'MPH' }),
      createStep('Warmup Fast Walk', 180, { targetSpeed: 4.0, speedUnit: 'MPH' }),
      createStep('Warmup Easy Jog', 180, { targetSpeed: 5.0, speedUnit: 'MPH' }),
      createStep('Warmup Fast Run', 120, { targetSpeed: 5.5, speedUnit: 'MPH' }),
    ];
    for (let round = 1; round <= 8; round += 1) {
      const metadata = { round, totalRounds: 8, blockId: 'fast-run-block' };
      steps.push(createStep('Fast Walk', 50, { ...metadata, targetSpeed: 4.0, speedUnit: 'MPH' }));
      steps.push(createStep('Fast Run', 24, { ...metadata, targetSpeed: 5.5, speedUnit: 'MPH' }));
    }
    steps.push(createStep('Long Rest', 120, { targetSpeed: 3.0, speedUnit: 'MPH' }));
    for (let round = 1; round <= 6; round += 1) {
      const metadata = { round, totalRounds: 6, blockId: 'sprint-block' };
      steps.push(createStep('Fast Jog', 50, { ...metadata, targetSpeed: 5.5, speedUnit: 'MPH' }));
      steps.push(createStep('Sprint', 14, { ...metadata, targetSpeed: 8.5, speedUnit: 'MPH' }));
    }
    steps.push(createStep('Cooldown', 300, { targetSpeed: 3.0, speedUnit: 'MPH' }));
    return steps;
  }

  function treadmillSprintsBlocks() {
    const warmupSteps = [
      createStep('Warmup Walk', 120, { targetSpeed: 3.2, speedUnit: 'MPH' }),
      createStep('Warmup Fast Walk', 180, { targetSpeed: 4.0, speedUnit: 'MPH' }),
      createStep('Warmup Easy Jog', 180, { targetSpeed: 5.0, speedUnit: 'MPH' }),
      createStep('Warmup Fast Run', 120, { targetSpeed: 5.5, speedUnit: 'MPH' }),
    ];
    const fastRunSteps = [];
    for (let round = 1; round <= 8; round += 1) {
      const metadata = { round, totalRounds: 8, blockId: 'fast-run-block' };
      fastRunSteps.push(createStep('Fast Walk', 50, { ...metadata, targetSpeed: 4.0, speedUnit: 'MPH' }));
      fastRunSteps.push(createStep('Fast Run', 24, { ...metadata, targetSpeed: 5.5, speedUnit: 'MPH' }));
    }
    const sprintSteps = [];
    for (let round = 1; round <= 6; round += 1) {
      const metadata = { round, totalRounds: 6, blockId: 'sprint-block' };
      sprintSteps.push(createStep('Fast Jog', 50, { ...metadata, targetSpeed: 5.5, speedUnit: 'MPH' }));
      sprintSteps.push(createStep('Sprint', 14, { ...metadata, targetSpeed: 8.5, speedUnit: 'MPH' }));
    }
    return [
      createWorkoutBlock('Warmup', 'warmup', warmupSteps, { id: 'treadmill-warmup', preBlockCountdown: PRE_STEP_COUNTDOWN }),
      createWorkoutBlock('Fast Walk / Fast Run', 'work', fastRunSteps, { id: 'treadmill-fast-run', preBlockCountdown: PRE_STEP_COUNTDOWN }),
      createWorkoutBlock('Halftime Break', 'recovery', [
        createStep('Halftime Break', 120, { targetSpeed: 3.0, speedUnit: 'MPH' }),
      ], { id: 'treadmill-halftime' }),
      createWorkoutBlock('Fast Jog / Sprint', 'work', sprintSteps, { id: 'treadmill-sprint', preBlockCountdown: PRE_STEP_COUNTDOWN }),
      createWorkoutBlock('Cooldown', 'cooldown', [
        createStep('Cooldown', 300, { targetSpeed: 3.0, speedUnit: 'MPH' }),
      ], { id: 'treadmill-cooldown' }),
    ];
  }

  function thursdaySoccerConditioningSteps() {
    return treadmillSprintsSteps();
  }

  const SOCCER_DIFFICULTIES = {
    easy: {
      label: 'Easy Match',
      segmentSeconds: 8 * 60,
      walk: [24, 38],
      jog: [15, 26],
      sprint: [8, 10],
      transitions: {
        walk: { walk: 0.25, jog: 0.65, sprint: 0.10 },
        jog: { walk: 0.45, jog: 0.43, sprint: 0.12 },
        sprint: { walk: 0.78, jog: 0.22, sprint: 0 },
      },
    },
    competitive: {
      label: 'Competitive Match',
      segmentSeconds: 9 * 60,
      walk: [20, 35],
      jog: [15, 30],
      sprint: [8, 12],
      transitions: {
        walk: { walk: 0.18, jog: 0.67, sprint: 0.15 },
        jog: { walk: 0.38, jog: 0.44, sprint: 0.18 },
        sprint: { walk: 0.72, jog: 0.26, sprint: 0.02 },
      },
    },
    championship: {
      label: 'Championship Match',
      segmentSeconds: 10 * 60,
      walk: [18, 30],
      jog: [16, 30],
      sprint: [9, 12],
      transitions: {
        walk: { walk: 0.12, jog: 0.66, sprint: 0.22 },
        jog: { walk: 0.32, jog: 0.43, sprint: 0.25 },
        sprint: { walk: 0.65, jog: 0.30, sprint: 0.05 },
      },
    },
  };

  const SOCCER_MOVEMENTS = {
    walk: { label: 'Walk', targetSpeed: 3.5, speedUnit: 'MPH', theme: 'walk' },
    jog: { label: 'Jog', targetSpeed: 5.5, speedUnit: 'MPH', theme: 'jog' },
    sprint: { label: 'Sprint', targetSpeed: 8.0, speedUnit: 'MPH', theme: 'sprint' },
  };

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function chooseWeighted(weights) {
    const roll = Math.random();
    let total = 0;
    const entries = Object.entries(weights);
    for (const [key, weight] of entries) {
      total += weight;
      if (roll <= total) return key;
    }
    return entries[entries.length - 1]?.[0] || 'walk';
  }

  function fatigueProfile(preset) {
    return {
      ...preset,
      walk: [preset.walk[0] + 3, preset.walk[1] + 5],
      jog: [preset.jog[0], preset.jog[1] + 3],
      sprint: preset.sprint,
      transitions: {
        walk: { walk: preset.transitions.walk.walk + 0.04, jog: preset.transitions.walk.jog + 0.02, sprint: Math.max(0, preset.transitions.walk.sprint - 0.06) },
        jog: { walk: preset.transitions.jog.walk + 0.05, jog: preset.transitions.jog.jog + 0.02, sprint: Math.max(0, preset.transitions.jog.sprint - 0.07) },
        sprint: { walk: Math.min(0.82, preset.transitions.sprint.walk + 0.06), jog: preset.transitions.sprint.jog, sprint: Math.max(0, preset.transitions.sprint.sprint - 0.03) },
      },
    };
  }

  function generateMovementSteps(profile, targetSeconds, blockId) {
    const steps = [];
    let elapsed = 0;
    let movement = 'walk';
    while (elapsed < targetSeconds) {
      const movementProfile = SOCCER_MOVEMENTS[movement];
      const range = profile[movement];
      const duration = Math.min(randomInt(range[0], range[1]), targetSeconds - elapsed);
      steps.push(createStep(movementProfile.label, duration, {
        targetSpeed: movementProfile.targetSpeed,
        speedUnit: movementProfile.speedUnit,
        blockId,
        movement,
      }));
      elapsed += duration;
      movement = chooseWeighted(profile.transitions[movement]);
    }
    return steps;
  }

  function generateSoccerMatchWorkout(difficultyKey = 'competitive') {
    const preset = SOCCER_DIFFICULTIES[difficultyKey] || SOCCER_DIFFICULTIES.competitive;
    const firstHalfSteps = generateMovementSteps(preset, preset.segmentSeconds, 'soccer-first-half');
    const secondHalfSteps = generateMovementSteps(fatigueProfile(preset), preset.segmentSeconds, 'soccer-second-half');
    return createBlockedWorkout('Soccer Match Simulation', [
      createWorkoutBlock('Warmup', 'warmup', [
        createStep('Warmup Walk', 180, { targetSpeed: 3.5, speedUnit: 'MPH' }),
        createStep('Warmup Jog', 180, { targetSpeed: 5.5, speedUnit: 'MPH' }),
        createStep('Warmup Build Up', 120, { targetSpeed: 5.5, speedUnit: 'MPH' }),
      ], { id: 'soccer-warmup', preBlockCountdown: PRE_STEP_COUNTDOWN }),
      createWorkoutBlock('First Half', 'work', firstHalfSteps, { id: 'soccer-first-half', preBlockCountdown: PRE_STEP_COUNTDOWN }),
      createWorkoutBlock('Halftime Break', 'recovery', [
        createStep('Halftime Break', 180, { targetSpeed: 3.5, speedUnit: 'MPH' }),
      ], { id: 'soccer-halftime' }),
      createWorkoutBlock('Second Half', 'work', secondHalfSteps, { id: 'soccer-second-half', preBlockCountdown: PRE_STEP_COUNTDOWN }),
      createWorkoutBlock('Cooldown', 'cooldown', [
        createStep('Cooldown Walk', 300, { targetSpeed: 3.5, speedUnit: 'MPH' }),
      ], { id: 'soccer-cooldown' }),
    ], {
      generator: 'soccer-match',
      difficulty: difficultyKey,
      playerProfile: 'general',
    });
  }

  function isNumberedThursdaySprints(workout) {
    const expected = [
      createStep('Warm-up Easy Jog', 420),
      ...Array.from({ length: 8 }).flatMap((_, index) => [
        createStep('Fast Run', 20, { round: index + 1, totalRounds: 8 }),
        createStep('Walk', 100, { round: index + 1, totalRounds: 8 }),
      ]),
      createStep('Long Rest', 180),
      ...Array.from({ length: 6 }).flatMap((_, index) => [
        createStep('Sprint', 10, { round: index + 1, totalRounds: 6 }),
        createStep('Walk', 50, { round: index + 1, totalRounds: 6 }),
      ]),
      createStep('Cooldown', 300),
    ];
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
      name: 'Treadmill Sprints',
      blocks: treadmillSprintsBlocks(),
      steps: undefined,
    };
  }

  function isCurrentFlatTreadmillSprints(workout) {
    return workout?.name === 'Treadmill Sprints'
      && Array.isArray(workout.steps)
      && workout.steps.length === 31
      && workout.steps[0]?.label === 'Warmup Walk'
      && workout.steps[0]?.duration === 120
      && workout.steps[17]?.label === 'Long Rest'
      && workout.steps[17]?.duration === 120
      && workout.steps[30]?.label === 'Cooldown'
      && workout.steps[30]?.duration === 300;
  }

  function isPreviousDefaultThursdaySprints(workout) {
    return workout?.name === 'Thursday Sprints'
      && Array.isArray(workout.steps)
      && workout.steps.length === 31
      && workout.steps[0]?.label === 'Warm-up Easy Jog'
      && workout.steps[0]?.duration === 420
      && workout.steps[17]?.label === 'Long Rest'
      && workout.steps[17]?.duration === 180
      && workout.steps[30]?.label === 'Cooldown'
      && workout.steps[30]?.duration === 300
      && workout.steps.slice(1, 17).every((step, index) => (
        step.label === (index % 2 === 0 ? 'Fast Run' : 'Walk')
        && step.duration === (index % 2 === 0 ? 20 : 100)
      ))
      && workout.steps.slice(18, 30).every((step, index) => (
        step.label === (index % 2 === 0 ? 'Sprint' : 'Walk')
        && step.duration === (index % 2 === 0 ? 10 : 50)
      ));
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
      createBlockedWorkout('Treadmill Sprints', treadmillSprintsBlocks()),
      createBlockedWorkout('Soccer Match Simulation', [], { generator: 'soccer-match' }),
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

  function formatTargetSpeed(step) {
    return Number.isFinite(step?.targetSpeed)
      ? `${step.targetSpeed.toFixed(1)} ${step.speedUnit || 'MPH'}`
      : '';
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

  function stepsForWorkout(workout) {
    if (Array.isArray(workout?.steps)) return workout.steps;
    if (!Array.isArray(workout?.blocks)) return [];
    return workout.blocks.flatMap((block) => Array.isArray(block.steps) ? block.steps : []);
  }

  function workoutStepCount(workout) {
    if (workout?.generator === 'soccer-match' && !stepsForWorkout(workout).length) return 'Generated match';
    return `${stepsForWorkout(workout).length} steps`;
  }

  function normalizeBlocks(workout) {
    if (Array.isArray(workout?.blocks) && workout.blocks.length) {
      return workout.blocks.map((block) => ({
        id: block.id || createId(),
        title: block.title || 'Workout Block',
        type: block.type || 'work',
        preBlockCountdown: block.preBlockCountdown || 0,
        metadata: block.metadata || {},
        steps: (Array.isArray(block.steps) ? block.steps : []).map((step) => ({ ...step, id: step.id || createId() })),
      }));
    }
    return [createWorkoutBlock('Workout', 'work', stepsForWorkout(workout).map((step) => ({ ...step, id: step.id || createId() })), {
      id: `${workout?.id || createId()}-steps`,
      preBlockCountdown: PRE_STEP_COUNTDOWN,
    })];
  }

  function normalizeWorkout(workout) {
    return {
      ...workout,
      blocks: normalizeBlocks(workout),
    };
  }

  function getStepTheme(label) {
    const key = String(label || '').toLowerCase();
    if (key.includes('sprint')) return 'sprint';
    if (key.includes('walk')) return 'walk';
    if (key.includes('rest')) return 'rest';
    if (key.includes('cooldown') || key.includes('cool down')) return 'cooldown';
    if (key.includes('jog')) return 'jog';
    if (key.includes('fast') || key.includes('run')) return 'sprint';
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
      if (isOldThursdaySprints(workout) || isNumberedThursdaySprints(workout) || isPreviousDefaultThursdaySprints(workout) || isCurrentFlatTreadmillSprints(workout)) return updateOldThursdaySprints(workout);
      if (isDefaultTabata(workout)) return updateDefaultTabata(workout);
      return workout;
    });
    try {
      if (workouts.some((workout) => workout.generator === 'soccer-match')) {
        localStorage.setItem(SOCCER_WORKOUT_ADDED_KEY, 'true');
      }
      if (!workouts.some((workout) => workout.generator === 'soccer-match') && localStorage.getItem(SOCCER_WORKOUT_ADDED_KEY) !== 'true') {
        workouts.push(createBlockedWorkout('Soccer Match Simulation', [], { generator: 'soccer-match' }));
        localStorage.setItem(SOCCER_WORKOUT_ADDED_KEY, 'true');
      }
    } catch {
      /* storage unavailable */
    }
    saveWorkouts();
  }

  function duplicateWorkout(workout) {
    if (workout.generator === 'soccer-match') {
      return {
        id: createId(),
        name: `${workout.name} Copy`,
        generator: workout.generator,
      };
    }
    const blocks = Array.isArray(workout.blocks)
      ? workout.blocks.map((block) => ({
        ...block,
        id: createId(),
        steps: (block.steps || []).map((step) => ({ ...step, id: createId() })),
      }))
      : null;
    return {
      id: createId(),
      name: `${workout.name} Copy`,
      ...(blocks ? { blocks } : { steps: stepsForWorkout(workout).map((step) => ({ ...step, id: createId() })) }),
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

  function isStandaloneApp() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isLikelyIosSafari() {
    const platform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    const isiOS = /iPad|iPhone|iPod/.test(platform) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isiOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  }

  function shouldShowInstallSuggestion() {
    try {
      return isLikelyIosSafari()
        && !isStandaloneApp()
        && localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) !== 'true';
    } catch {
      return false;
    }
  }

  function dismissInstallSuggestion() {
    try {
      localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true');
    } catch {
      /* storage unavailable */
    }
    document.querySelector('[data-install-suggestion]')?.remove();
  }

  function installSuggestionMarkup() {
    return shouldShowInstallSuggestion()
      ? `<div class="sprints-install-tip" data-install-suggestion>
          <div>
            <strong>Full-screen workout mode</strong>
            <span>Install this app on your Home Screen. Tap Share, then choose Add to Home Screen.</span>
          </div>
          <button type="button" class="sprints-install-tip__close" data-action="dismiss-install-tip" aria-label="Dismiss install suggestion">x</button>
        </div>`
      : '';
  }

  async function requestWorkoutWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return false;
    try {
      if (wakeLock) return true;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        if (workoutWakeLockWanted && document.visibilityState === 'visible') requestWorkoutWakeLock();
      });
      return true;
    } catch (error) {
      if (!wakeLockNoticeShown) {
        console.warn('Unable to acquire screen wake lock:', error);
        wakeLockNoticeShown = true;
      }
      return false;
    }
  }

  async function releaseWorkoutWakeLock() {
    workoutWakeLockWanted = false;
    if (!wakeLock) return;
    const lock = wakeLock;
    wakeLock = null;
    try {
      await lock.release();
    } catch {
      /* already released */
    }
  }

  function beginWorkoutWakeLock() {
    workoutWakeLockWanted = true;
    requestWorkoutWakeLock();
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
      const durationSeconds = Math.max(durationMs, 140) / 1000;
      const now = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.32, now + 0.015);
      gain.gain.setValueAtTime(0.32, Math.max(now + 0.02, now + durationSeconds - 0.045));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
      osc.connect(gain);
      gain.connect(ctx.destination);
      trackBeepNodes(osc, gain);
      osc.start(now);
      osc.stop(now + durationSeconds);
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
    if (window.LandosWorld) {
      window.LandosWorld.setActiveView(name === 'sprints' ? 'violet-sprints' : 'home');
      return;
    }
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
    releaseWorkoutWakeLock();
  }

  function showClock() {
    stopTimer();
    stopActiveBeeps();
    if (window.LandosWorld) {
      window.LandosWorld.navigateHome();
      return;
    }
    if (!window.LandosWorld) {
      setView('clock');
    }
  }

  function showWorkoutList() {
    stopTimer();
    setView('sprints');
    const root = replaceSprintsRoot();
    root.innerHTML = `
      <div class="sprints-app">
        ${renderEcosystemNav()}
        <header class="sprints-header">
          <h1 class="sprints-title">Violet Sprints</h1>
          <button type="button" class="sprints-btn sprints-btn--primary" data-action="create">+ New</button>
        </header>
        ${installSuggestionMarkup()}
        <ul class="sprints-list" role="list">
          ${workouts.length ? workouts.map((workout) => `
            <li class="sprints-list-item" data-id="${escapeHtml(workout.id)}">
              <div class="sprints-list-main">
                <span class="sprints-list-name">${escapeHtml(workout.name)}</span>
                <span class="sprints-list-meta">${escapeHtml(workoutStepCount(workout))}</span>
              </div>
              <div class="sprints-list-actions">
                <button type="button" class="sprints-btn" data-action="view" data-id="${escapeHtml(workout.id)}">View Steps</button>
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
      if (action === 'dismiss-install-tip') dismissInstallSuggestion();
      if (action === 'create') {
        const workout = createWorkout('New Workout', []);
        workouts.push(workout);
        saveWorkouts();
        showEditor(workout.id);
      }
      if (action === 'view') {
        const target = workouts.find((workout) => workout.id === id);
        if (target?.generator === 'soccer-match') showSoccerDifficulty(id, 'preview');
        else showEditor(id);
      }
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
    if (draft.generator === 'soccer-match') {
      showSoccerDifficulty(id, 'preview');
      return;
    }
    draft.steps = stepsForWorkout(draft).map((step) => ({ ...step }));
    delete draft.blocks;

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
          ${renderEcosystemNav()}
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
    const normalizedWorkout = normalizeWorkout(workout);
    const blocks = normalizedWorkout.blocks;
    const timerSteps = blocks.flatMap((block, blockIndex) => (
      block.steps.map((step, stepIndexInBlock) => ({
        ...step,
        blockIndex,
        stepIndexInBlock,
        blockTitle: block.title,
        blockType: block.type,
      }))
    ));
    let stepIndex = 0;
    let phase = 'idle';
    let secondsLeft = 0;
    let tickId = null;
    let paused = false;
    let warningPulseKey = 0;
    let warningPulseActive = false;

    function clearTick() {
      if (tickId !== null) {
        clearInterval(tickId);
        tickId = null;
      }
    }

    function currentStep() {
      return timerSteps[stepIndex] || null;
    }

    function nextStep() {
      return timerSteps[stepIndex + 1] || null;
    }

    function currentBlock() {
      const step = currentStep();
      return step ? blocks[step.blockIndex] : null;
    }

    function isFirstStepInBlock(index = stepIndex) {
      return (timerSteps[index]?.stepIndexInBlock || 0) === 0;
    }

    function blockPreCountdown(index = stepIndex) {
      const block = blocks[timerSteps[index]?.blockIndex];
      return block?.preBlockCountdown || 0;
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

    function isRecoveryBreakStep(step) {
      const label = String(step?.label || '').toLowerCase();
      return label.includes('halftime')
        || label.includes('long')
        || label.includes('break')
        || label.includes('recovery');
    }

    function shouldPlayRestWarning() {
      return isRestStep(currentStep()) && isWorkStep(nextStep());
    }

    function shouldBeginPreCountdown(previousStep) {
      if (isFirstStepInBlock() && blockPreCountdown() > 0) return true;
      return Boolean(previousStep) && isRecoveryBreakStep(previousStep) && isWorkStep(currentStep());
    }

    function shouldShowVisualWarning() {
      return phase === 'running' && secondsLeft > 0 && secondsLeft <= 5;
    }

    function triggerVisualWarningPulse() {
      if (!shouldShowVisualWarning()) return;
      warningPulseKey += 1;
      warningPulseActive = true;
    }

    function roundLabel(step) {
      return Number.isFinite(step?.round) && Number.isFinite(step?.totalRounds)
        ? `Round ${step.round} of ${step.totalRounds}`
        : '';
    }

    function remainingWorkoutSeconds() {
      let total = secondsLeft;
      if (phase === 'pre_countdown') total += currentStep()?.duration || 0;
      for (let i = stepIndex + 1; i < timerSteps.length; i += 1) {
        if (isFirstStepInBlock(i)) total += blockPreCountdown(i);
        total += timerSteps[i].duration || 0;
      }
      return total;
    }

    function emitUpdate() {
      const step = currentStep();
      callbacks.onUpdate({
        phase,
        paused,
        workoutName: normalizedWorkout.name,
        blockTitle: phase === 'pre_countdown'
          ? (stepIndex === 0 ? 'Workout Starting' : 'Next Workout Block')
          : currentBlock()?.title || '',
        stepIndex,
        totalSteps: timerSteps.length,
        stepLabel: step?.label || '',
        targetSpeed: phase === 'running' ? formatTargetSpeed(step) : '',
        roundLabel: phase === 'running' ? roundLabel(step) : '',
        stepTheme: getStepTheme(step?.label),
        secondsLeft,
        countdown: formatDuration(secondsLeft),
        nextLabel: nextStep()?.label || '',
        remaining: formatDuration(remainingWorkoutSeconds()),
        complete: phase === 'complete',
        warningActive: shouldShowVisualWarning(),
        warningPulseActive,
        warningPulseKey,
      });
      warningPulseActive = false;
    }

    function beginPreCountdown() {
      phase = 'pre_countdown';
      secondsLeft = blockPreCountdown();
      emitUpdate();
      playBeep(660);
    }

    function beginStep() {
      const step = currentStep();
      if (!step) {
        phase = 'complete';
        releaseWorkoutWakeLock();
        emitUpdate();
        return;
      }
      phase = 'running';
      secondsLeft = step.duration;
      playBeep(isWorkStep(step) ? 1760 : 1320, isWorkStep(step) ? 240 : 100);
      triggerVisualWarningPulse();
      if (isWorkStep(step) && secondsLeft <= 5) {
        playBeep(880);
      }
      if (shouldPlayRestWarning() && secondsLeft <= 5) {
        playBeep(660);
      }
      emitUpdate();
    }

    function advanceStep() {
      if (stepIndex >= timerSteps.length - 1) {
        phase = 'complete';
        clearTick();
        releaseWorkoutWakeLock();
        emitUpdate();
        return;
      }
      const previousStep = currentStep();
      stepIndex += 1;
      if (shouldBeginPreCountdown(previousStep)) beginPreCountdown();
      else beginStep();
    }

    function tick() {
      if (paused) return;
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        if (phase === 'pre_countdown') playBeep(660);
        if (phase === 'running') triggerVisualWarningPulse();
        if (phase === 'running' && isWorkStep(currentStep()) && secondsLeft <= 5) {
          playBeep(880);
        }
        if (phase === 'running' && shouldPlayRestWarning() && secondsLeft <= 5) {
          playBeep(660);
        }
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
        if (!timerSteps.length) return;
        stepIndex = 0;
        paused = false;
        if (blockPreCountdown() > 0) beginPreCountdown();
        else beginStep();
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
      isPaused() {
        return paused;
      },
      skip() {
        if (phase === 'complete') return;
        clearTick();
        if (phase === 'pre_countdown') beginStep();
        else advanceStep();
        if (phase !== 'complete') tickId = setInterval(tick, 1000);
      },
      back() {
        if (phase === 'complete') return;
        clearTick();
        if (stepIndex > 0) stepIndex -= 1;
        if (isFirstStepInBlock() && blockPreCountdown() > 0) beginPreCountdown();
        else beginStep();
        tickId = setInterval(tick, 1000);
      },
      finish() {
        clearTick();
        stopActiveBeeps();
        releaseWorkoutWakeLock();
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
        releaseWorkoutWakeLock();
        phase = 'idle';
      },
    };
  }

  function renderTimer(root, state) {
    if (state.complete) {
      root.innerHTML = `
        ${renderEcosystemNav()}
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
    const warningClass = `${state.warningActive ? ' sprints-countdown--warning' : ''}${state.warningPulseActive ? ' sprints-countdown--pulse' : ''}`;
    root.innerHTML = `
      ${renderEcosystemNav()}
      <div class="sprints-timer sprints-timer--${escapeHtml(state.stepTheme)}">
        <div class="sprints-timer-main">
          <div class="sprints-timer-workout">${escapeHtml(state.workoutName)}</div>
          ${state.blockTitle ? `<div class="sprints-timer-block">${escapeHtml(state.blockTitle)}</div>` : ''}
          <div class="sprints-timer-step">${escapeHtml(label)}</div>
          ${state.targetSpeed ? `<div class="sprints-timer-speed">${escapeHtml(state.targetSpeed)}</div>` : ''}
          ${state.roundLabel ? `<div class="sprints-timer-round">${escapeHtml(state.roundLabel)}</div>` : ''}
          <div class="sprints-countdown sprints-countdown--${countdownMode}${warningClass}" style="--pulse-key: ${Number(state.warningPulseKey) || 0}">${escapeHtml(countdown)}</div>
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

  function pickCompletionMessage() {
    const available = COMPLETION_MESSAGES.filter((message) => message !== lastCompletionMessage);
    const message = available[Math.floor(Math.random() * available.length)] || COMPLETION_MESSAGES[0];
    lastCompletionMessage = message;
    return message;
  }

  function renderCompletion(root, stage, message = '') {
    const controls = stage === 'controls'
      ? `<div class="sprints-complete-actions">
          <button type="button" class="sprints-btn sprints-btn--accent" data-action="restart">Restart</button>
          <button type="button" class="sprints-btn sprints-btn--primary" data-action="list">Workout List</button>
        </div>`
      : '';
    root.innerHTML = `
      ${renderEcosystemNav()}
      <div class="sprints-complete">
        <h1 class="sprints-complete-title">${escapeHtml(stage === 'message' ? message : 'Workout Complete')}</h1>
        ${controls}
      </div>`;
  }

  function workoutPreviewMarkup(workout) {
    const normalizedWorkout = normalizeWorkout(workout);
    return normalizedWorkout.blocks.map((block) => `
      <section class="sprints-preview-block">
        <h2 class="sprints-preview-title">${escapeHtml(block.title)}</h2>
        <ul class="sprints-preview-steps" role="list">
          ${block.steps.map((step) => `
            <li class="sprints-preview-step">
              <span>${escapeHtml(step.label)}</span>
              <span>${escapeHtml(formatDuration(step.duration))}${formatTargetSpeed(step) ? ` · ${escapeHtml(formatTargetSpeed(step))}` : ''}</span>
            </li>`).join('')}
        </ul>
      </section>`).join('');
  }

  function showGeneratedWorkoutPreview(id, difficultyKey) {
    const generatedWorkout = generateSoccerMatchWorkout(difficultyKey);
    const difficulty = SOCCER_DIFFICULTIES[difficultyKey] || SOCCER_DIFFICULTIES.competitive;
    stopTimer();
    setView('sprints');
    const root = replaceSprintsRoot();
    root.innerHTML = `
      <div class="sprints-app">
        ${renderEcosystemNav()}
        <header class="sprints-header">
          <button type="button" class="sprints-btn sprints-btn--ghost" data-action="difficulty">Difficulties</button>
          <h1 class="sprints-title">${escapeHtml(difficulty.label)}</h1>
          <button type="button" class="sprints-btn sprints-btn--accent sprints-btn--large" data-action="start-preview">Start</button>
        </header>
        <div class="sprints-preview">
          ${workoutPreviewMarkup(generatedWorkout)}
        </div>
      </div>`;
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'difficulty') showSoccerDifficulty(id);
      if (button.dataset.action === 'start-preview') showTimer(id, { generatedWorkout });
    });
  }

  function showSoccerDifficulty(id, mode = 'start') {
    stopTimer();
    setView('sprints');
    const root = replaceSprintsRoot();
    const isPreviewMode = mode === 'preview';
    root.innerHTML = `
      <div class="sprints-app">
        ${renderEcosystemNav()}
        <header class="sprints-header">
          <button type="button" class="sprints-btn sprints-btn--ghost" data-action="list">Workouts</button>
          <h1 class="sprints-title">${isPreviewMode ? 'View Soccer Steps' : 'Soccer Match Simulation'}</h1>
        </header>
        <div class="sprints-difficulty">
          ${Object.entries(SOCCER_DIFFICULTIES).map(([key, difficulty]) => `
            <div class="sprints-difficulty-card">
              <button type="button" class="sprints-difficulty-main" data-action="${isPreviewMode ? 'preview-soccer' : 'start-soccer'}" data-difficulty="${escapeHtml(key)}">
                <span>${escapeHtml(difficulty.label)}</span>
              </button>
            </div>`).join('')}
        </div>
      </div>`;
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'list') showWorkoutList();
      if (button.dataset.action === 'start-soccer') showTimer(id, { difficulty: button.dataset.difficulty || 'competitive' });
      if (button.dataset.action === 'preview-soccer') showGeneratedWorkoutPreview(id, button.dataset.difficulty || 'competitive');
    });
  }

  async function showTimer(id, options = {}) {
    const savedWorkout = workouts.find((item) => item.id === id);
    if (!savedWorkout) {
      showWorkoutList();
      return;
    }
    if (savedWorkout.generator === 'soccer-match' && !options.difficulty && !options.generatedWorkout) {
      showSoccerDifficulty(id);
      return;
    }
    await Promise.race([
      unlockAudio(),
      new Promise((resolve) => setTimeout(resolve, 350)),
    ]);
    const workout = options.generatedWorkout || (savedWorkout?.generator === 'soccer-match'
      ? generateSoccerMatchWorkout(options.difficulty || 'competitive')
      : savedWorkout);
    stopTimer();
    setView('sprints');
    const root = replaceSprintsRoot();
    if (!stepsForWorkout(workout).length) {
      root.innerHTML = `${renderEcosystemNav()}<div class="sprints-app"><button type="button" class="sprints-btn sprints-btn--ghost" data-action="list">Workouts</button><div class="sprints-empty">Add at least one workout step before starting.</div></div>`;
      root.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="list"]')) showWorkoutList();
      });
      return;
    }
    let completionStarted = false;
    let completionTimeouts = [];
    function clearCompletionSequence() {
      completionTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      completionTimeouts = [];
      completionStarted = false;
    }
    function runCompletionSequence() {
      if (completionStarted) return;
      completionStarted = true;
      renderCompletion(root, 'complete');
      const message = pickCompletionMessage();
      completionTimeouts.push(window.setTimeout(() => renderCompletion(root, 'message', message), 2000));
      completionTimeouts.push(window.setTimeout(() => renderCompletion(root, 'controls'), 5500));
    }
    activeTimer = createWorkoutTimer(workout, {
      onUpdate: (state) => {
        if (state.complete) runCompletionSequence();
        else {
          clearCompletionSequence();
          renderTimer(root, state);
        }
      },
    });
    let stepNavigationLocked = false;
    let finishConfirmationOpen = false;

    function lockStepNavigationBriefly() {
      stepNavigationLocked = true;
      window.setTimeout(() => {
        stepNavigationLocked = false;
      }, 250);
    }

    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || !activeTimer) return;
      const action = button.dataset.action;
      if (action === 'pause') activeTimer.pause();
      if (action === 'resume') {
        void unlockAudio();
        activeTimer.resume();
      }
      if (action === 'skip') {
        if (stepNavigationLocked) return;
        lockStepNavigationBriefly();
        void unlockAudio();
        activeTimer.skip();
      }
      if (action === 'back-step') {
        if (stepNavigationLocked) return;
        lockStepNavigationBriefly();
        void unlockAudio();
        activeTimer.back();
      }
      if (action === 'finish') {
        if (finishConfirmationOpen) return;
        finishConfirmationOpen = true;
        const timer = activeTimer;
        const wasPausedBeforeConfirmation = timer.isPaused();
        timer.pause();
        const confirmed = await showConfirmationDialog({
          title: 'Finish Workout?',
          message: 'Your current workout will end immediately.',
          confirmLabel: 'Finish Workout',
        });
        finishConfirmationOpen = false;
        if (confirmed) timer.finish();
        else if (!wasPausedBeforeConfirmation) timer.resume();
      }
      if (action === 'restart') {
        clearCompletionSequence();
        void unlockAudio();
        beginWorkoutWakeLock();
        activeTimer.restart();
      }
      if (action === 'list') {
        clearCompletionSequence();
        stopActiveBeeps();
        showWorkoutList();
      }
    });
    beginWorkoutWakeLock();
    activeTimer.start();
  }

  function init() {
    loadWorkouts();
    document.getElementById('open-sprints')?.addEventListener('click', () => {
      if (window.LandosWorld && window.location.hash !== '#/violet-sprints') {
        window.LandosWorld.navigateToRoute('violet-sprints');
      }
      showWorkoutList();
      unlockAudio().then((audioEnabled) => {
        if (!audioEnabled) showSoundEnableControl();
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && audioCtx) {
        ensureAudioIsRunning().then((running) => {
          if (!running) logAudioState('not running after visibility restore');
        });
      }
      if (document.visibilityState === 'visible' && workoutWakeLockWanted) {
        requestWorkoutWakeLock();
      }
    });
    if (window.location.hash === '#/violet-sprints') {
      showWorkoutList();
    } else if (!window.LandosWorld) {
      setView('clock');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
