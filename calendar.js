/* =========================================================
   calendar.js - Calendar System for Exercise Tracking
   ========================================================= */

const CALENDAR = {
  STORAGE_KEY: 'wellness-calendar',
  DEFAULT_SETS: 1
};

// {
//   'YYYY-MM-DD': {
//     meta: { timedSessions: number },
//     exercises: { [exerciseId]: { completed: boolean } }
//   }
// }
let calendarData = {};
let selectedDate = new Date();
let currentMonth = new Date();

function initCalendar() {
  loadCalendarData();
  renderCalendar();
  bindCalendarEvents();
}

function loadCalendarData() {
  try {
    const saved = localStorage.getItem(CALENDAR.STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    calendarData = normalizeCalendarData(parsed);
  } catch (e) {
    calendarData = {};
  }
}

function saveCalendarData() {
  try {
    localStorage.setItem(CALENDAR.STORAGE_KEY, JSON.stringify(calendarData));
  } catch (e) {}
}

function normalizeCalendarData(data) {
  if (!data || typeof data !== 'object') return {};
  const normalized = {};
  Object.entries(data).forEach(([dateKey, day]) => {
    normalized[dateKey] = normalizeDay(day);
  });
  return normalized;
}

function normalizeDay(day) {
  const normalized = { meta: { timedSessions: 0 }, exercises: {} };
  if (!day || typeof day !== 'object') return normalized;

  if (day.meta || day.exercises) {
    normalized.meta.timedSessions = Math.max(0, Math.floor((day.meta && (day.meta.timedSessions ?? day.meta.sessions)) || 0));
    const exMap = day.exercises && typeof day.exercises === 'object' ? day.exercises : {};
    Object.entries(exMap).forEach(([exerciseId, entry]) => {
      normalized.exercises[exerciseId] = normalizeExerciseEntry(entry);
    });
    return normalized;
  }

  // Legacy format: { exerciseId: { reps, sessions } } or number
  let maxSessions = 0;
  Object.entries(day).forEach(([exerciseId, entry]) => {
    if (typeof entry === 'number') {
      maxSessions = Math.max(maxSessions, Math.max(0, Math.floor(entry)));
      normalized.exercises[exerciseId] = { completed: false };
      return;
    }
    if (!entry || typeof entry !== 'object') {
      normalized.exercises[exerciseId] = { completed: false };
      return;
    }
    const reps = Math.max(0, Math.floor(entry.reps || 0));
    const sessions = Math.max(0, Math.floor(entry.sessions || 0));
    maxSessions = Math.max(maxSessions, sessions);
    normalized.exercises[exerciseId] = { completed: sessions > 0 || reps > 0 };
  });

  normalized.meta.timedSessions = maxSessions;
  return normalized;
}

function normalizeExerciseEntry(entry) {
  if (!entry || typeof entry !== 'object') return { completed: false };
  if (typeof entry.completed === 'boolean') return { completed: entry.completed };
  const reps = Math.max(0, Math.floor(entry.reps || 0));
  const sessions = Math.max(0, Math.floor(entry.sessions || 0));
  return { completed: sessions > 0 || reps > 0 };
}

function isTimerExercise(ex) {
  return ex && ex.useTimer !== false;
}

function getExerciseSessionsTarget(exerciseId) {
  const ex = exercises.find(e => e.id === exerciseId);
  if (!ex) return 1;
  if (!isTimerExercise(ex)) return 1;
  return Math.max(1, Math.floor(ex.sets || CALENDAR.DEFAULT_SETS));
}

function formatDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDaysInMonth(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month, 1).getDay();
}

function isToday(date) {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isFutureDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d > today;
}

function getDayData(dateKey) {
  if (!calendarData[dateKey]) {
    calendarData[dateKey] = { meta: { timedSessions: 0 }, exercises: {} };
  }
  calendarData[dateKey] = normalizeDay(calendarData[dateKey]);
  return calendarData[dateKey];
}

function getExerciseRecordForDate(dateKey, exerciseId) {
  const day = getDayData(dateKey);
  if (!day.exercises[exerciseId]) day.exercises[exerciseId] = { completed: false };
  day.exercises[exerciseId] = normalizeExerciseEntry(day.exercises[exerciseId]);
  return day.exercises[exerciseId];
}

function getExerciseSessionsForDate(dateKey, exerciseId) {
  const ex = exercises.find(e => e.id === exerciseId);
  if (!ex) return 0;
  if (isTimerExercise(ex)) {
    return getDayData(dateKey).meta.timedSessions;
  }
  return getExerciseRecordForDate(dateKey, exerciseId).completed ? 1 : 0;
}

function getDateSummary(date) {
  const key = formatDateKey(date);
  const day = getDayData(key);
  const totalExercises = exercises.length;
  let exercisesOnTarget = 0;
  let anyLogged = day.meta.timedSessions > 0;
  let totalExerciseSessions = 0;

  exercises.forEach(ex => {
    const targetSessions = getExerciseSessionsTarget(ex.id);
    const sessions = getExerciseSessionsForDate(key, ex.id);
    totalExerciseSessions += sessions;
    if (sessions > 0) anyLogged = true;
    if (sessions >= targetSessions) exercisesOnTarget++;
  });

  return {
    totalExercises,
    exercisesOnTarget,
    timedSessionsLogged: day.meta.timedSessions,
    totalExerciseSessions,
    anyLogged
  };
}

function getDateStatus(date) {
  if (isFutureDate(date)) return 'none';
  const summary = getDateSummary(date);
  if (summary.totalExercises === 0) return 'none';
  if (!summary.anyLogged) return 'red';
  if (summary.exercisesOnTarget >= summary.totalExercises) return 'green';
  return 'yellow';
}

function renderCalendar() {
  const monthYear = document.getElementById('calendarMonthYear');
  const daysGrid = document.getElementById('calendarDays');
  const stats = document.getElementById('calendarStats');

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  monthYear.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);

  daysGrid.innerHTML = '';
  stats.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    daysGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = formatDateKey(date);
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';

    const dayStatus = getDateStatus(date);
    if (dayStatus === 'green') dayEl.classList.add('status-green');
    if (dayStatus === 'yellow') dayEl.classList.add('status-yellow');
    if (dayStatus === 'red') dayEl.classList.add('status-red');

    if (isToday(date)) dayEl.classList.add('today');
    if (key === formatDateKey(selectedDate)) dayEl.classList.add('selected');

    const badge = document.createElement('div');
    badge.className = 'calendar-badge';
    badge.textContent = day;

    const progress = document.createElement('div');
    progress.className = 'calendar-progress';
    progress.innerHTML = renderProgressForDate(date);

    dayEl.appendChild(badge);
    dayEl.appendChild(progress);
    dayEl.addEventListener('click', () => selectDate(date));
    daysGrid.appendChild(dayEl);
  }

  const summary = getDateSummary(selectedDate);
  stats.innerHTML = `
    <div class="stat-row">
      <span class="stat-label">Date</span>
      <span class="stat-value">${selectedDate.toLocaleDateString()}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Exercises On Target</span>
      <span class="stat-value">${summary.exercisesOnTarget} / ${summary.totalExercises}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Timed Sessions</span>
      <span class="stat-value">${summary.timedSessionsLogged}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Exercise Sessions</span>
      <span class="stat-value">${summary.totalExerciseSessions}</span>
    </div>
  `;
}

function renderProgressForDate(date) {
  const summary = getDateSummary(date);
  const percent = summary.totalExercises > 0 ? Math.round((summary.exercisesOnTarget / summary.totalExercises) * 100) : 0;

  return `
    <div class="progress-bar">
      <div class="progress-fill" style="width:${percent}%"></div>
    </div>
    <div class="progress-label">${summary.exercisesOnTarget}/${summary.totalExercises}</div>
  `;
}

function selectDate(date) {
  selectedDate = new Date(date);
  renderCalendar();
  renderExerciseRows();
}

function navigateMonth(delta) {
  currentMonth.setMonth(currentMonth.getMonth() + delta);
  renderCalendar();
}

function renderExerciseRows() {
  const rows = document.getElementById('exerciseRows');
  rows.innerHTML = '';

  const key = formatDateKey(selectedDate);

  exercises.forEach(ex => {
    const row = document.createElement('div');
    row.className = 'exercise-row';

    const targetSessions = getExerciseSessionsTarget(ex.id);
    const sessions = getExerciseSessionsForDate(key, ex.id);
    const completed = !isTimerExercise(ex) && sessions >= 1;
    const isDone = sessions >= targetSessions;

    row.innerHTML = `
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="exercise-meta">
          ${isTimerExercise(ex) ? `Timer exercise · target ${targetSessions} session${targetSessions > 1 ? 's' : ''}/day` : 'No timer · complete once per day'}
        </div>
      </div>
      <div class="exercise-controls">
        ${isTimerExercise(ex) ? '' : `<button class="complete-toggle ${completed ? 'is-done' : ''}" data-id="${ex.id}" aria-pressed="${completed ? 'true' : 'false'}">${completed ? 'Unmark Completion' : 'Mark Done Today'}</button>`}
        <div class="counter-group">
          <span class="counter-label">Sessions</span>
          <span class="rep-count">${sessions} / ${targetSessions}</span>
        </div>
      </div>
    `;

    if (isDone) row.classList.add('done');
    rows.appendChild(row);
  });

  bindExerciseRowEvents();
}

function bindExerciseRowEvents() {
  document.querySelectorAll('.complete-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const current = e.currentTarget.getAttribute('aria-pressed') === 'true';
      setExerciseCompleted(id, !current, selectedDate);
      renderCalendar();
      renderExerciseRows();
    });
  });
}

function setExerciseCompleted(exerciseId, completed, date = new Date()) {
  const key = formatDateKey(date);
  const record = getExerciseRecordForDate(key, exerciseId);
  record.completed = !!completed;
  saveCalendarData();
}

function logRoutineSession(amount = 1, date = new Date()) {
  const key = formatDateKey(date);
  const day = getDayData(key);
  day.meta.timedSessions = Math.max(0, day.meta.timedSessions + Math.max(0, Math.floor(amount)));
  saveCalendarData();
}

function getTodaySessions() {
  const key = formatDateKey(new Date());
  return getDayData(key).meta.timedSessions;
}

function getTodayExerciseCompletion(exerciseId) {
  const key = formatDateKey(new Date());
  return !!getExerciseRecordForDate(key, exerciseId).completed;
}

function bindCalendarEvents() {
  document.getElementById('prevMonth').addEventListener('click', () => navigateMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => navigateMonth(1));
  document.getElementById('todayBtn').addEventListener('click', () => {
    selectedDate = new Date();
    currentMonth = new Date();
    renderCalendar();
    renderExerciseRows();
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.Calendar = {
  init: initCalendar,
  render: renderCalendar,
  selectDate,
  navigateMonth,
  renderExerciseRows,
  setExerciseCompleted,
  logRoutineSession,
  getTodaySessions,
  getTodayExerciseCompletion
};
