/* =========================================================
   renderer.js — Wellness Exercise Timer
   ========================================================= */
const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// ──────────────────────────────────────────────────────────
// DEFAULT EXERCISES (orange-highlighted from physio sheet)
// ──────────────────────────────────────────────────────────
const DEFAULT_EXERCISES = [
  {
    id: 'ex-1',
    name: 'Gaze Stabilization (x1)',
    description: `Use a post-it with a size 14 font X stuck onto the wall or held at eye level. Stand at arm's length away from the X. Look straight ahead and focus on the X.

A. "No" Exercise — Turn your head briskly from side to side, keeping your eyes focused on the target.
• Set a timer for 45–60 seconds
• Rest for 10 seconds or until symptoms have settled
• Repeat

B. "Yes" Exercise — Do this with the nodding movement too.

It is crucial that the letter stays in focus. Your head should move briskly in an arc about 30 degrees off from the centre for both the YES and NO exercise.
If you get too dizzy, slow down.`,
    duration: 60,
    image: null
  },
  {
    id: 'ex-2',
    name: 'X2 Beginners',
    description: `Head and eye movements between 2 targets (leading with eyes).

Either place 2 cards A and B, 30 cm apart on the wall ahead of you at arms length away, or hold them out ahead of you.

• Turn head and gaze to look and focus at A
• Now keep head turned to A, but move eyes to look and focus at B
• Now turn head towards B
• Then keeping head turned to B, move eyes to A
• Then turn head to A
• Repeat for 45–60 seconds

Do this with up and down head movements too — this will be more difficult, for example if you stand facing a mirror or at a window.`,
    duration: 60,
    image: null
  },
  {
    id: 'ex-3',
    name: 'X2 Moving Checkerboard',
    description: `Hold the X or checkerboard at arm's length away.

Move the checkerboard in a small arc from left to right.

Your eyes follow the card, whilst your head turns toward the opposite direction.

Repeat for 45–60 seconds.
Repeat.`,
    duration: 60,
    image: null
  },
  {
    id: 'ex-4',
    name: 'Following a Moving Target',
    description: `In Standing or sitting on a swivel chair, holding a post-it note with X / or a playing card.

A. Move your arm holding the card from left to right in a 120–180 degree arc. Let your head and eyes follow the card as it moves from left to right.
• Complete 30 reps

B. Move arm up/down in a 120–180 degree arc. Let your head and eyes follow the card as it moves up/down.
• Complete 30 reps`,
    duration: 90,
    image: null
  },
  {
    id: 'ex-5',
    name: 'x1 On The Move — Yes & No Walk',
    description: `Hold your thumb out in front of you. Look at your thumb whilst performing the "Yes" exercise and walking 3–5m. Repeat 5 lengths.

Place an X on the wall 3–5m ahead of you. Walk toward the X, while performing the x1 viewing exercises (the NO exercise from Exercise 1 above).

Once you reach the target, turn around and walk back to the starting position.
Repeat 5x. Rest.`,
    duration: 120,
    image: null
  },
  {
    id: 'ex-6',
    name: 'Walking with Head Turns — Window Shopping',
    description: `Walk the length of your corridor, or for about 5–10m at a time whilst shopping, turning your head from left to right as if window shopping.

Aim to increase the speed of your head turn.

Try to continue for 2–3 minutes then rest.`,
    duration: 150,
    image: null
  },
  {
    id: 'ex-7',
    name: 'Daily Walk Outdoors',
    description: `Take a walk outdoors for 10 minutes each day.

While you walk, make sure to turn your head to look at objects on each side of you.`,
    duration: 600,
    image: null
  }
];

// ──────────────────────────────────────────────────────────
// TIMER PHASES
// ──────────────────────────────────────────────────────────
const PHASE = {
  IDLE:    'idle',
  LEADIN:  'leadin',
  RUNNING: 'running',
  DONE:    'done',
  CHECKOFF:'checkoff',
  STOPPED: 'stopped'
};

// ──────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────
let exercises     = [];
let currentIndex  = -1;
let timerInterval = null;
let timeRemaining = 0;
let totalTime     = 0;
let leadInTime    = 5;
let phase         = PHASE.IDLE;
let menuFontSize  = 14;
let sidebarWidth  = 280;
let editTarget    = null;
let addImageData  = null;
let editImageData = null;
let routineReps   = {};

// Audio
const startSound = new Audio();
const stopSound  = new Audio();
startSound.src = resolveAssetPath('sounds/StartExercise.mp3');
stopSound.src  = resolveAssetPath('sounds/StopExercise.mp3');

function resolveAssetPath(rel) {
  try { return 'file://' + path.join(__dirname, rel); }
  catch (e) { return rel; }
}

// ──────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  bindEvents();
  renderExerciseList();
  showIdle();
  // Initialize calendar
  if (window.Calendar) window.Calendar.init();
});

// ──────────────────────────────────────────────────────────
// PERSISTENCE
// ──────────────────────────────────────────────────────────
function loadData() {
  try {
    const saved = localStorage.getItem('wellness-exercises');
    exercises = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_EXERCISES));
    exercises = exercises.map(normalizeExercise);
    if (!saved) saveData();
    syncRoutineProgress();

    const savedLeadIn = localStorage.getItem('wellness-leadin');
    if (savedLeadIn !== null) {
      leadInTime = parseInt(savedLeadIn);
      document.getElementById('leadInInput').value = leadInTime;
    }

    const savedMenuFontSize = localStorage.getItem('wellness-menu-font-size');
    if (savedMenuFontSize !== null) {
      applyMenuFontSize(parseInt(savedMenuFontSize, 10));
    } else {
      applyMenuFontSize(menuFontSize);
    }

    const savedSidebarWidth = localStorage.getItem('wellness-sidebar-width');
    if (savedSidebarWidth !== null) {
      applySidebarWidth(parseInt(savedSidebarWidth, 10));
    } else {
      applySidebarWidth(sidebarWidth);
    }
  } catch (e) {
    exercises = JSON.parse(JSON.stringify(DEFAULT_EXERCISES)).map(normalizeExercise);
    syncRoutineProgress();
    applyMenuFontSize(menuFontSize);
    applySidebarWidth(sidebarWidth);
  }
}

function saveData() {
  try { localStorage.setItem('wellness-exercises', JSON.stringify(exercises)); } catch (e) {}
}

function normalizeExercise(ex) {
  return {
    ...ex,
    useTimer: ex.useTimer !== false
  };
}

function isTimerExercise(ex) {
  return ex && ex.useTimer !== false;
}

function applyMenuFontSize(size) {
  const parsed = Number.isFinite(size) ? size : parseInt(size, 10);
  const clamped = Math.min(19, Math.max(12, parsed || 14));
  menuFontSize = clamped;
  document.documentElement.style.setProperty('--exercise-menu-font-size', `${clamped}px`);
  const slider = document.getElementById('menuFontSizeSlider');
  const valueLabel = document.getElementById('menuFontSizeValue');
  if (slider) slider.value = String(clamped);
  if (valueLabel) valueLabel.textContent = `${clamped}px`;
}

function applySidebarWidth(width) {
  const parsed = Number.isFinite(width) ? width : parseInt(width, 10);
  const maxAllowed = Math.max(220, Math.min(520, window.innerWidth - 440));
  const clamped = Math.min(maxAllowed, Math.max(220, parsed || 280));
  sidebarWidth = clamped;
  document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`);
}

function bindSidebarResizer() {
  const resizer = document.getElementById('sidebarResizer');
  if (!resizer) return;

  let isResizing = false;

  const onMouseMove = (e) => {
    if (!isResizing) return;
    const min = 220;
    const max = Math.max(min, Math.min(520, window.innerWidth - 440));
    const nextWidth = Math.max(min, Math.min(max, e.clientX));
    applySidebarWidth(nextWidth);
  };

  const stopResize = () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.classList.remove('is-resizing-sidebar');
    localStorage.setItem('wellness-sidebar-width', String(sidebarWidth));
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', stopResize);
  };

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    document.body.classList.add('is-resizing-sidebar');
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopResize);
  });
}

// ──────────────────────────────────────────────────────────
// SCREEN SWITCHING
// ──────────────────────────────────────────────────────────
function showIdle() {
  document.getElementById('idleState').classList.remove('hidden');
  document.getElementById('activeState').classList.add('hidden');
  document.getElementById('calendarState').classList.add('hidden');
  currentIndex = -1;
  phase = PHASE.IDLE;
  clearTimerInterval();
  resetRoutineProgress();
  updateRepStatus();
  renderExerciseList();
}

function showCalendar() {
  document.getElementById('idleState').classList.add('hidden');
  document.getElementById('activeState').classList.add('hidden');
  document.getElementById('calendarState').classList.remove('hidden');
  if (window.Calendar) {
    window.Calendar.render();
    window.Calendar.renderExerciseRows();
  }
}

function showActive(index) {
  document.getElementById('idleState').classList.add('hidden');
  document.getElementById('activeState').classList.remove('hidden');
  document.getElementById('calendarState').classList.add('hidden');
  loadExercise(index);
}

// ──────────────────────────────────────────────────────────
// LOAD EXERCISE INTO CARD
// ──────────────────────────────────────────────────────────
function loadExercise(index) {
  if (index < 0 || index >= exercises.length) return;
  clearTimerInterval();
  currentIndex = index;
  const ex = exercises[index];

  document.getElementById('cardNumber').textContent      = String(index + 1).padStart(2, '0');
  document.getElementById('cardTitle').textContent       = ex.name;
  document.getElementById('cardProgress').textContent    = `${index + 1} of ${exercises.length}`;
  document.getElementById('cardDescription').textContent = ex.description;

  const imgWrap = document.getElementById('cardImageWrap');
  const img     = document.getElementById('cardImage');
  if (ex.image) { img.src = ex.image; imgWrap.style.display = 'block'; }
  else           { imgWrap.style.display = 'none'; }

  applyExerciseModeUI(ex);
  document.getElementById('durationInput').value = ex.duration;
  if (isTimerExercise(ex)) {
    setPhase(PHASE.STOPPED);
    resetTimerDisplay(ex.duration);
  } else {
    setPhase(PHASE.CHECKOFF);
    updateCheckoffStatus();
  }
  updateRepStatus();
  renderExerciseList();
}

function applyExerciseModeUI(ex) {
  const timerWrap = document.getElementById('timerWrap');
  const timerSection = document.querySelector('.timer-section');
  const durationRows = document.querySelector('.duration-rows');
  const checkoffPanel = document.getElementById('checkoffPanel');
  if (!timerWrap || !timerSection || !durationRows || !checkoffPanel) return;

  if (isTimerExercise(ex)) {
    timerWrap.classList.remove('hidden');
    timerWrap.classList.remove('is-complete');
    timerWrap.removeAttribute('role');
    timerWrap.removeAttribute('tabindex');
    timerWrap.removeAttribute('aria-pressed');
    durationRows.classList.remove('hidden');
    checkoffPanel.classList.add('hidden');
    timerSection.classList.remove('checkoff-mode');
  } else {
    timerWrap.classList.remove('hidden');
    durationRows.classList.add('hidden');
    checkoffPanel.classList.add('hidden');
    timerWrap.setAttribute('role', 'button');
    timerWrap.setAttribute('tabindex', '0');
    timerSection.classList.add('checkoff-mode');
    updateCheckoffStatus();
  }
}

function updateCheckoffStatus() {
  const checkoffStatus = document.getElementById('checkoffStatus');
  const timerWrap = document.getElementById('timerWrap');
  const timerDisplay = document.getElementById('timerDisplay');
  const timerStatus = document.getElementById('timerStatus');
  if (!checkoffStatus || currentIndex < 0 || currentIndex >= exercises.length) return;
  const ex = exercises[currentIndex];
  if (isTimerExercise(ex)) return;

  let done = false;
  if (window.Calendar && typeof window.Calendar.getTodayExerciseCompletion === 'function') {
    done = !!window.Calendar.getTodayExerciseCompletion(ex.id);
  }

  checkoffStatus.textContent = done ? 'Completed for today' : 'Not marked complete for today';
  if (timerDisplay) timerDisplay.textContent = done ? 'Task Complete' : 'Task Incomplete';
  if (timerStatus) timerStatus.textContent = done ? 'click to mark incomplete' : 'click to mark complete';
  if (timerWrap) {
    timerWrap.classList.toggle('is-complete', done);
    timerWrap.setAttribute('aria-pressed', done ? 'true' : 'false');
    timerWrap.setAttribute('aria-label', done ? 'Task complete. Activate to mark incomplete.' : 'Task incomplete. Activate to mark complete.');
  }
  updateTimerCircle(1, 1);
  if (phase === PHASE.CHECKOFF) {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) startBtn.textContent = done ? 'Unmark Completion' : 'Mark Done Today';
  }
}

// ──────────────────────────────────────────────────────────
// WINDOW RESIZE HANDLER
// ──────────────────────────────────────────────────────────
function onWindowResize() {
  applySidebarWidth(sidebarWidth);
}

function syncRoutineProgress() {
  const next = {};
  exercises.forEach(ex => {
    next[ex.id] = Math.max(0, Math.floor(routineReps[ex.id] || 0));
  });
  routineReps = next;
}

function resetRoutineProgress() {
  routineReps = {};
  exercises.forEach(ex => {
    routineReps[ex.id] = 0;
  });
}

function getExerciseTargetReps(index = currentIndex) {
  const ex = exercises[index];
  if (!isTimerExercise(ex)) return 0;
  return ex && typeof ex.reps === 'number' ? Math.max(1, Math.floor(ex.reps)) : 1;
}

function getCurrentExerciseRepCount() {
  if (currentIndex < 0 || currentIndex >= exercises.length) return 0;
  const ex = exercises[currentIndex];
  return Math.max(0, Math.floor(routineReps[ex.id] || 0));
}

function isCurrentExerciseTargetMet() {
  if (currentIndex < 0 || currentIndex >= exercises.length) return false;
  const ex = exercises[currentIndex];
  if (!isTimerExercise(ex)) return true;
  return getCurrentExerciseRepCount() >= getExerciseTargetReps(currentIndex);
}

function isRoutineTargetMet() {
  return exercises.every((ex, index) => {
    if (!isTimerExercise(ex)) return true;
    const target = getExerciseTargetReps(index);
    const logged = Math.max(0, Math.floor(routineReps[ex.id] || 0));
    return logged >= target;
  });
}

function hasTimedExercises() {
  return exercises.some(isTimerExercise);
}

function completeCurrentExerciseRep() {
  if (currentIndex < 0 || currentIndex >= exercises.length) return;
  const ex = exercises[currentIndex];
  if (!isTimerExercise(ex)) return;
  routineReps[ex.id] = getCurrentExerciseRepCount() + 1;
}

function updateRepStatus() {
  const repStatus = document.getElementById('repStatus');
  if (!repStatus || currentIndex < 0 || currentIndex >= exercises.length) {
    if (repStatus) repStatus.classList.add('hidden');
    return;
  }

  const target = getExerciseTargetReps(currentIndex);
  if (target <= 1) {
    repStatus.classList.add('hidden');
    return;
  }

  const current = getCurrentExerciseRepCount();
  repStatus.textContent = `Rep ${current} / ${target}`;
  repStatus.classList.remove('hidden');
}

function markCurrentExerciseDoneToday() {
  if (currentIndex < 0 || currentIndex >= exercises.length) return;
  const ex = exercises[currentIndex];
  if (isTimerExercise(ex)) return;
  if (window.Calendar && typeof window.Calendar.getTodayExerciseCompletion === 'function') {
    const isDone = !!window.Calendar.getTodayExerciseCompletion(ex.id);
    window.Calendar.setExerciseCompleted(ex.id, !isDone);
    window.Calendar.render();
    window.Calendar.renderExerciseRows();
  }
  updateCheckoffStatus();
  setPhase(PHASE.CHECKOFF);
}

function toggleCheckoffViaRing() {
  if (phase !== PHASE.CHECKOFF || currentIndex < 0 || currentIndex >= exercises.length) return;
  const ex = exercises[currentIndex];
  if (isTimerExercise(ex)) return;
  markCurrentExerciseDoneToday();
}

// ──────────────────────────────────────────────────────────
// PHASE — controls button visibility & timer ring colour
// ──────────────────────────────────────────────────────────
function setPhase(newPhase) {
  phase = newPhase;
  const wrap      = document.getElementById('timerWrap');
  const startBtn  = document.getElementById('startBtn');
  const stopBtn   = document.getElementById('stopBtn');
  const nextBtn   = document.getElementById('nextBtn');
  const durInput  = document.getElementById('durationInput');
  const liInput   = document.getElementById('leadInInput');
  const status    = document.getElementById('timerStatus');

  wrap.classList.remove('timer-leadin', 'timer-running', 'timer-paused', 'timer-done', 'timer-checkoff');

  switch (phase) {
    case PHASE.STOPPED:
      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      nextBtn.classList.add('hidden');
      durInput.disabled = false;
      liInput.disabled  = false;
      status.textContent = 'ready';
      break;

    case PHASE.LEADIN:
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      nextBtn.classList.add('hidden');
      durInput.disabled = true;
      liInput.disabled  = true;
      wrap.classList.add('timer-leadin');
      status.textContent = 'get ready';
      break;

    case PHASE.RUNNING:
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      nextBtn.classList.add('hidden');
      durInput.disabled = true;
      liInput.disabled  = true;
      wrap.classList.add('timer-running');
      status.textContent = 'running';
      break;

    case PHASE.DONE:
      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      nextBtn.classList.toggle('hidden', !isCurrentExerciseTargetMet());
      durInput.disabled = false;
      liInput.disabled  = false;
      wrap.classList.add('timer-done');
      status.textContent = 'done';
      break;

    case PHASE.CHECKOFF:
      startBtn.classList.add('hidden');
      stopBtn.classList.add('hidden');
      nextBtn.classList.remove('hidden');
      durInput.disabled = true;
      liInput.disabled  = true;
      wrap.classList.add('timer-checkoff');
      status.textContent = 'click to toggle';
      break;

    default:
      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      nextBtn.classList.add('hidden');
      durInput.disabled = false;
      liInput.disabled  = false;
  }

  if (phase === PHASE.CHECKOFF) {
    updateCheckoffStatus();
  } else {
    startBtn.textContent = 'Start';
  }
}

function resetTimerDisplay(seconds) {
  timeRemaining = seconds;
  totalTime     = seconds;
  document.getElementById('timerDisplay').textContent = formatTime(seconds);
  updateTimerCircle(seconds, seconds);
}

// ──────────────────────────────────────────────────────────
// TIMER ENGINE
// ──────────────────────────────────────────────────────────
function startSequence() {
  if (phase === PHASE.LEADIN || phase === PHASE.RUNNING) return;
  const ex = exercises[currentIndex];
  if (ex && !isTimerExercise(ex)) {
    markCurrentExerciseDoneToday();
    return;
  }
  clearTimerInterval();

  const li = leadInTime;
  if (li > 0) {
    // ── Lead-in countdown ──
    let countdown = li;
    setPhase(PHASE.LEADIN);
    totalTime     = li;
    timeRemaining = countdown;
    document.getElementById('timerDisplay').textContent = countdown;
    updateTimerCircle(countdown, li);

    timerInterval = setInterval(() => {
      countdown--;
      timeRemaining = countdown;
      document.getElementById('timerDisplay').textContent = countdown > 0 ? countdown : '0';
      updateTimerCircle(countdown, li);

      if (countdown <= 0) {
        clearTimerInterval();
        beginExerciseTimer();
      }
    }, 1000);
  } else {
    // No lead-in — jump straight to exercise
    beginExerciseTimer();
  }
}

function beginExerciseTimer() {
  const ex = exercises[currentIndex];
  if (!ex || !isTimerExercise(ex)) return;

  playSound(startSound);
  setPhase(PHASE.RUNNING);

  timeRemaining = ex.duration;
  totalTime     = ex.duration;
  document.getElementById('timerDisplay').textContent = formatTime(timeRemaining);
  updateTimerCircle(timeRemaining, totalTime);

  timerInterval = setInterval(() => {
    timeRemaining--;
    document.getElementById('timerDisplay').textContent = formatTime(timeRemaining);
    updateTimerCircle(timeRemaining, totalTime);

    if (timeRemaining <= 0) {
      clearTimerInterval();
      playSound(stopSound);
      completeCurrentExerciseRep();
      setPhase(PHASE.DONE);
      document.getElementById('timerDisplay').textContent = '0:00';
      updateTimerCircle(0, totalTime);
      updateRepStatus();
    }
  }, 1000);
}

function stopSequence() {
  clearTimerInterval();
  if (phase === PHASE.RUNNING || phase === PHASE.LEADIN) playSound(stopSound);
  const ex = exercises[currentIndex];
  if (ex && !isTimerExercise(ex)) {
    setPhase(PHASE.CHECKOFF);
    updateCheckoffStatus();
  } else {
    setPhase(PHASE.STOPPED);
    resetTimerDisplay(ex ? ex.duration : 60);
  }
}

function clearTimerInterval() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function advanceExercise() {
  clearTimerInterval();
  if (!isCurrentExerciseTargetMet()) return;
  if (currentIndex < exercises.length - 1) {
    showActive(currentIndex + 1);
  } else {
    if (!isRoutineTargetMet()) return;
    if (window.Calendar && hasTimedExercises()) {
      window.Calendar.logRoutineSession(1);
      window.Calendar.render();
      window.Calendar.renderExerciseRows();
    }
    document.getElementById('completeModal').classList.remove('hidden');
  }
}

// ──────────────────────────────────────────────────────────
// AUDIO
// ──────────────────────────────────────────────────────────
function playSound(audio) {
  audio.volume = 1;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ──────────────────────────────────────────────────────────
// FORMATTING
// ──────────────────────────────────────────────────────────
function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateTimerCircle(remaining, total) {
  const circumference = 565.49;
  const ratio  = total > 0 ? remaining / total : 1;
  const offset = circumference * (1 - ratio);
  document.getElementById('timerProgress').style.strokeDashoffset = offset;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ──────────────────────────────────────────────────────────
// EXERCISE LIST RENDER
// ──────────────────────────────────────────────────────────
function renderExerciseList() {
  const list = document.getElementById('exerciseList');
  list.innerHTML = '';

  exercises.forEach((ex, i) => {
    const li = document.createElement('li');
    li.className = 'exercise-item' + (i === currentIndex ? ' active' : '');
    li.draggable = true;
    li.dataset.index = i;

    li.innerHTML = `
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <div class="item-info">
        <div class="item-number">Exercise ${i + 1}</div>
        <div class="item-name">${escapeHtml(ex.name)}</div>
      </div>
      <span class="item-duration">${isTimerExercise(ex) ? formatTime(ex.duration) : 'No timer'}</span>
      <button class="item-edit-btn" data-index="${i}" title="Edit">✎</button>
      <button class="item-delete-btn" data-index="${i}" title="Delete">🗑</button>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('item-edit-btn')) return;
      if (e.target.classList.contains('drag-handle')) return;
      clearTimerInterval();
      showActive(i);
    });

    li.querySelector('.item-edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(i);
    });

    li.querySelector('.item-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteExercise(i);
    });

    li.addEventListener('dragstart', onDragStart);
    li.addEventListener('dragover',  onDragOver);
    li.addEventListener('dragleave', onDragLeave);
    li.addEventListener('drop',      onDrop);
    li.addEventListener('dragend',   onDragEnd);

    list.appendChild(li);
  });
}

// ──────────────────────────────────────────────────────────
// DRAG & DROP
// ──────────────────────────────────────────────────────────
let dragSrcIndex = null;

function onDragStart(e) {
  dragSrcIndex = parseInt(this.dataset.index);
  this.style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}
function onDragLeave() { this.classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  const dropIndex = parseInt(this.dataset.index);
  if (dragSrcIndex !== null && dragSrcIndex !== dropIndex) {
    const moved = exercises.splice(dragSrcIndex, 1)[0];
    exercises.splice(dropIndex, 0, moved);
    if (currentIndex === dragSrcIndex)                     currentIndex = dropIndex;
    else if (dragSrcIndex < currentIndex && dropIndex >= currentIndex) currentIndex--;
    else if (dragSrcIndex > currentIndex && dropIndex <= currentIndex) currentIndex++;
    saveData();
    renderExerciseList();
  }
  this.classList.remove('drag-over');
}
function onDragEnd() {
  this.style.opacity = '';
  document.querySelectorAll('.exercise-item').forEach(el => el.classList.remove('drag-over'));
}

// ──────────────────────────────────────────────────────────
// DURATION INPUTS
// ──────────────────────────────────────────────────────────
function onDurationChange() {
  const val = parseInt(document.getElementById('durationInput').value);
  if (!isNaN(val) && val >= 5 && currentIndex >= 0 && isTimerExercise(exercises[currentIndex])) {
    exercises[currentIndex].duration = val;
    saveData();
    if (phase === PHASE.STOPPED || phase === PHASE.DONE) resetTimerDisplay(val);
    renderExerciseList();
  }
}

function onLeadInChange() {
  const val = parseInt(document.getElementById('leadInInput').value);
  if (!isNaN(val) && val >= 0) {
    leadInTime = val;
    localStorage.setItem('wellness-leadin', val);
  }
}

function updateModalTimerFields(prefix) {
  const useTimer = document.getElementById(`${prefix}UseTimer`);
  const duration = document.getElementById(`${prefix}Duration`);
  const reps = document.getElementById(`${prefix}Reps`);
  const sets = document.getElementById(`${prefix}Sets`);
  if (!useTimer || !duration || !reps || !sets) return;
  const enabled = useTimer.checked;
  duration.disabled = !enabled;
  reps.disabled = !enabled;
  sets.disabled = !enabled;
}

// ──────────────────────────────────────────────────────────
// EDIT MODAL
// ──────────────────────────────────────────────────────────
function openEditModal(index) {
  editTarget    = index;
  editImageData = null;
  const ex = exercises[index];
  document.getElementById('editName').value        = ex.name;
  document.getElementById('editDescription').value = ex.description;
  document.getElementById('editDuration').value    = ex.duration;
  document.getElementById('editUseTimer').checked  = isTimerExercise(ex);
  document.getElementById('editReps').value        = ex.reps || 1;
  document.getElementById('editSets').value        = ex.sets || 1;

  const preview = document.getElementById('editImagePreview');
  const hint    = document.getElementById('editImageHint');
  if (ex.image) { preview.src = ex.image; preview.classList.remove('hidden'); hint.textContent = 'Current image shown above'; }
  else          { preview.classList.add('hidden'); hint.textContent = 'Click to upload an image'; }

  updateModalTimerFields('edit');
  document.getElementById('editModal').classList.remove('hidden');
}

function saveEditModal() {
  if (editTarget === null) return;
  const ex        = exercises[editTarget];
  ex.name         = document.getElementById('editName').value.trim() || ex.name;
  ex.description  = document.getElementById('editDescription').value;
  ex.duration     = parseInt(document.getElementById('editDuration').value) || ex.duration;
  ex.useTimer     = document.getElementById('editUseTimer').checked;
  ex.reps         = ex.useTimer ? Math.max(1, parseInt(document.getElementById('editReps').value, 10) || 1) : 1;
  ex.sets         = ex.useTimer ? Math.max(1, parseInt(document.getElementById('editSets').value, 10) || 1) : 1;
  if (editImageData) ex.image = editImageData;

  saveData();
  renderExerciseList();
  if (currentIndex === editTarget) {
    loadExercise(currentIndex);
  }
  if (window.Calendar) {
    window.Calendar.render();
    window.Calendar.renderExerciseRows();
  }
  document.getElementById('editModal').classList.add('hidden');
  editTarget    = null;
  editImageData = null;
}

// ──────────────────────────────────────────────────────────
// DELETE EXERCISE
// ──────────────────────────────────────────────────────────
function deleteExercise(index) {
  if (index < 0 || index >= exercises.length) return;
  
  const ex = exercises[index];
  const confirmed = confirm(`Delete "${ex.name}"?\n\nThis action cannot be undone.`);
  
  if (!confirmed) return;
  
  // Remove exercise
  exercises.splice(index, 1);
  syncRoutineProgress();
  
  // Adjust current index if needed
  if (currentIndex === index) {
    // If we deleted the current exercise, show the next one or go to idle
    if (index < exercises.length) {
      showActive(index);
    } else if (exercises.length > 0) {
      showActive(exercises.length - 1);
    } else {
      showIdle();
    }
  } else if (currentIndex > index) {
    // If we deleted an exercise before the current one, decrement current index
    currentIndex--;
    renderExerciseList();
  }
  
  saveData();
  renderExerciseList();
  if (window.Calendar) {
    window.Calendar.render();
    window.Calendar.renderExerciseRows();
  }
}

// ──────────────────────────────────────────────────────────
// ADD MODAL
// ──────────────────────────────────────────────────────────
function openAddModal() {
  addImageData = null;
  document.getElementById('addName').value        = '';
  document.getElementById('addDescription').value = '';
  document.getElementById('addDuration').value    = '60';
  document.getElementById('addUseTimer').checked  = true;
  document.getElementById('addReps').value        = '1';
  document.getElementById('addSets').value        = '1';
  document.getElementById('addImagePreview').classList.add('hidden');
  document.getElementById('addImageHint').textContent = 'Click to upload a JPEG or PNG';
  updateModalTimerFields('add');
  document.getElementById('addModal').classList.remove('hidden');
}

function saveAddModal() {
  const name = document.getElementById('addName').value.trim();
  if (!name) { alert('Please enter an exercise name.'); return; }
  exercises.push({
    id:          'ex-' + Date.now(),
    name,
    description: document.getElementById('addDescription').value,
    duration:    parseInt(document.getElementById('addDuration').value) || 60,
    useTimer:    document.getElementById('addUseTimer').checked,
    reps:        document.getElementById('addUseTimer').checked ? Math.max(1, parseInt(document.getElementById('addReps').value, 10) || 1) : 1,
    sets:        document.getElementById('addUseTimer').checked ? Math.max(1, parseInt(document.getElementById('addSets').value, 10) || 1) : 1,
    image:       addImageData || null
  });
  syncRoutineProgress();
  saveData();
  renderExerciseList();
  if (window.Calendar) {
    window.Calendar.render();
    window.Calendar.renderExerciseRows();
  }
  document.getElementById('addModal').classList.add('hidden');
  addImageData = null;
}

// ──────────────────────────────────────────────────────────
// IMAGE PICKER
// ──────────────────────────────────────────────────────────
async function pickImage(previewId, hintId, callback) {
  try {
    const result = await ipcRenderer.invoke('open-file-dialog', {
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const data     = fs.readFileSync(filePath);
      const ext      = path.extname(filePath).slice(1).toLowerCase();
      const mime     = ext === 'png' ? 'image/png' : 'image/jpeg';
      const base64   = `data:${mime};base64,` + data.toString('base64');
      const preview  = document.getElementById(previewId);
      preview.src    = base64;
      preview.classList.remove('hidden');
      document.getElementById(hintId).textContent = path.basename(filePath);
      callback(base64);
    }
  } catch (e) { console.error('Image pick error:', e); }
}

// ──────────────────────────────────────────────────────────
// EVENT BINDINGS
// ──────────────────────────────────────────────────────────
function bindEvents() {
  bindSidebarResizer();

  const menuFontSizeSlider = document.getElementById('menuFontSizeSlider');
  if (menuFontSizeSlider) {
    menuFontSizeSlider.addEventListener('input', (e) => {
      const size = parseInt(e.target.value, 10);
      applyMenuFontSize(size);
      localStorage.setItem('wellness-menu-font-size', String(size));
    });
  }

  // Begin Session — loads first exercise, does NOT auto-start timer
  document.getElementById('beginSessionBtn').addEventListener('click', () => {
    resetRoutineProgress();
    showActive(0);
  });

  // Timer controls
  document.getElementById('startBtn').addEventListener('click', startSequence);
  document.getElementById('stopBtn').addEventListener('click',  stopSequence);
  document.getElementById('nextBtn').addEventListener('click',  advanceExercise);
  const timerWrap = document.getElementById('timerWrap');
  if (timerWrap) {
    timerWrap.addEventListener('click', toggleCheckoffViaRing);
    timerWrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCheckoffViaRing();
      }
    });
  }

  // Duration inputs
  document.getElementById('durationInput').addEventListener('change', onDurationChange);
  document.getElementById('durationInput').addEventListener('keyup', (e) => { if (e.key === 'Enter') onDurationChange(); });
  document.getElementById('leadInInput').addEventListener('change',   onLeadInChange);
  document.getElementById('leadInInput').addEventListener('keyup',    (e) => { if (e.key === 'Enter') onLeadInChange(); });

  // Card edit button
  document.getElementById('cardEditBtn').addEventListener('click', () => {
    if (currentIndex >= 0) openEditModal(currentIndex);
  });

  // Add exercise
  document.getElementById('addExerciseBtn').addEventListener('click', openAddModal);

  // Calendar toggle
  document.getElementById('calendarToggleBtn').addEventListener('click', () => {
    const calendarState = document.getElementById('calendarState');
    const isOpen = calendarState && !calendarState.classList.contains('hidden');
    if (isOpen) showIdle();
    else showCalendar();
  });
  const backToExercisesBtn = document.getElementById('backToExercisesBtn');
  if (backToExercisesBtn) {
    backToExercisesBtn.addEventListener('click', () => {
      showIdle();
    });
  }
  const closeCalendarBtn = document.getElementById('closeCalendarBtn');
  if (closeCalendarBtn) {
    closeCalendarBtn.addEventListener('click', () => {
      showIdle();
    });
  }

  // Edit modal
  document.getElementById('editModalClose').addEventListener('click', () => document.getElementById('editModal').classList.add('hidden'));
  document.getElementById('editCancelBtn').addEventListener('click',  () => document.getElementById('editModal').classList.add('hidden'));
  document.getElementById('editDeleteBtn').addEventListener('click',  () => {
    if (editTarget !== null) {
      deleteExercise(editTarget);
      document.getElementById('editModal').classList.add('hidden');
    }
  });
  document.getElementById('editSaveBtn').addEventListener('click',    saveEditModal);
  document.getElementById('editImageBtn').addEventListener('click',   () => pickImage('editImagePreview', 'editImageHint', (d) => { editImageData = d; }));
  document.getElementById('editUseTimer').addEventListener('change',  () => updateModalTimerFields('edit'));

  // Add modal
  document.getElementById('addModalClose').addEventListener('click', () => document.getElementById('addModal').classList.add('hidden'));
  document.getElementById('addCancelBtn').addEventListener('click',  () => document.getElementById('addModal').classList.add('hidden'));
  document.getElementById('addSaveBtn').addEventListener('click',    saveAddModal);
  document.getElementById('addImageBtn').addEventListener('click',   () => pickImage('addImagePreview', 'addImageHint', (d) => { addImageData = d; }));
  document.getElementById('addUseTimer').addEventListener('change',  () => updateModalTimerFields('add'));

  // Complete modal
  document.getElementById('completeDoneBtn').addEventListener('click', () => {
    document.getElementById('completeModal').classList.add('hidden');
    showIdle();
  });

  // Overlay backdrop to close modals
  ['editModal', 'addModal', 'completeModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
      if (e.target.id === id) document.getElementById(id).classList.add('hidden');
    });
  });

  // Window resize handler
  window.addEventListener('resize', onWindowResize);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (phase === PHASE.RUNNING || phase === PHASE.LEADIN) stopSequence();
      else if (currentIndex >= 0) startSequence();
    }
    // Arrow right only advances when exercise is done (conscious action)
    if (e.code === 'ArrowRight' && phase === PHASE.DONE) advanceExercise();
  });
}

