const STORAGE_KEY = "fitmvp_v2_state";

const state = {
  profile: null,
  plan: [],
  history: [],
  measurements: [],
  points: 0,
  activeWorkout: null
};

const $ = (id) => document.getElementById(id);

const dayNames = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье"
];

const workoutNames = {
  push: "Грудь + плечи + трицепс",
  pull: "Спина + бицепс",
  legs: "Ноги + кор",
  functional: "Функционал + мешок",
  recovery: "Кардио + мобилити",
  rest: "Отдых"
};

const exerciseBank = {
  warmup: [
    {
      type: "Разминка",
      name: "Дорожка лёгкая",
      details: "6–8 минут, пульс спокойно повышается",
      note: "Не стартуй резко. Цель — разогреть тело."
    },
    {
      type: "Разминка",
      name: "Суставная разминка",
      details: "Шея, плечи, локти, кисти, таз, колени, голеностоп — 5 минут",
      note: "Делай плавно, без боли."
    },
    {
      type: "Разминка",
      name: "Резинка + активация",
      details: "Тяги резинки, разведения, 2×15",
      note: "Особенно важно перед жимом и подтягиваниями."
    }
  ],
  stretch: [
    {
      type: "Растяжка",
      name: "Грудь и плечи",
      details: "2–3 минуты",
      note: "После жима и мешка не зажимай плечи."
    },
    {
      type: "Растяжка",
      name: "Бёдра и задняя поверхность",
      details: "4–5 минут",
      note: "Дыши спокойно. Не рви амплитуду."
    },
    {
      type: "Растяжка",
      name: "Спина + мобилити",
      details: "Кошка-корова, наклоны, раскрытие грудного отдела",
      note: "Цель — восстановление, а не боль."
    }
  ]
};

let workoutInterval = null;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    Object.assign(state, parsed);
  } catch (error) {
    console.warn("Не удалось загрузить сохранение:", error);
    localStorage.removeItem(STORAGE_KEY);
  }
}

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.remove("hidden");

  setTimeout(() => {
    el.classList.add("hidden");
  }, 2600);
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getProfileFromForm() {
  return {
    age: Number($("age").value),
    height: Number($("height").value),
    weight: Number($("weight").value),
    targetWeight: Number($("targetWeight").value),
    daysPerWeek: Number($("daysPerWeek").value),
    goal: $("goal").value,
    experience: $("experience").value,
    bench: Number($("bench").value || 0),
    squat: Number($("squat").value || 0),
    pullups: Number($("pullups").value || 0),
    health: $("health").value.trim()
  };
}

function fillFormFromProfile(profile) {
  if (!profile) return;

  $("age").value = profile.age || "";
  $("height").value = profile.height || "";
  $("weight").value = profile.weight || "";
  $("targetWeight").value = profile.targetWeight || "";
  $("daysPerWeek").value = profile.daysPerWeek || 4;
  $("goal").value = profile.goal || "fatloss";
  $("experience").value = profile.experience || "beginner";
  $("bench").value = profile.bench || "";
  $("squat").value = profile.squat || "";
  $("pullups").value = profile.pullups || "";
  $("health").value = profile.health || "";
}

function estimateLevel(profile) {
  let score = 0;

  if (profile.experience === "intermediate") score += 2;
  if (profile.experience === "advanced") score += 4;
  if (profile.bench >= profile.weight * 0.75) score += 2;
  if (profile.squat >= profile.weight) score += 2;
  if (profile.pullups >= 5) score += 1;
  if (profile.pullups >= 10) score += 2;

  if (score >= 7) return "advanced";
  if (score >= 3) return "intermediate";
  return "beginner";
}

function healthRisk(profile) {
  const text = String(profile.health || "").toLowerCase();
  const riskyWords = [
    "серд",
    "давлен",
    "гипер",
    "колен",
    "спин",
    "грыж",
    "травм",
    "операц",
    "боль",
    "сустав"
  ];

  return riskyWords.some((word) => text.includes(word));
}

function workingWeight(maxOrKnown, fallback, intensity) {
  const base = Number(maxOrKnown) > 0 ? Number(maxOrKnown) : Number(fallback);
  return Math.max(2.5, Math.round((base * intensity) / 2.5) * 2.5);
}

function repsByGoal(goal, week) {
  if (goal === "strength") return week <= 2 ? "5–6" : "4–6";
  if (goal === "muscle") return "8–12";
  if (goal === "endurance") return "12–15";
  return "10–14";
}

function cardioByGoal(goal, week) {
  if (goal === "fatloss") return `${25 + week * 3} мин`;
  if (goal === "endurance") return `${30 + week * 4} мин`;
  return `${15 + week * 2} мин`;
}

function makeExercise(type, name, weight, sets, reps, note) {
  return {
    type,
    name,
    details: `${sets} подхода × ${reps} повторений${weight ? ` · вес ${weight} кг` : ""}`,
    sets,
    reps,
    weight,
    note
  };
}

function buildWorkout(profile, week, template) {
  const level = estimateLevel(profile);
  const risk = healthRisk(profile);

  const intensityBase =
    level === "advanced" ? 0.72 :
    level === "intermediate" ? 0.62 :
    0.5;

  const weekAdd = (week - 1) * 0.035;
  const intensity = risk ? Math.min(0.5, intensityBase) : intensityBase + weekAdd;
  const reps = repsByGoal(profile.goal, week);

  const benchFallback = profile.weight * 0.55;
  const squatFallback = profile.weight * 0.65;
  const dumbbell =
    level === "beginner" ? 8 + week :
    level === "intermediate" ? 12 + week :
    16 + week;

  const warm = exerciseBank.warmup.map((item) => ({ ...item }));
  const stretch = exerciseBank.stretch.map((item) => ({ ...item }));

  let main = [];
  let finisher = [];

  if (template === "push") {
    main = [
      makeExercise(
        "Сила",
        "Жим лёжа",
        workingWeight(profile.bench, benchFallback, intensity),
        4,
        reps,
        "Перед рабочим весом сделай 2 лёгких разминочных подхода."
      ),
      makeExercise(
        "Сила",
        "Жим гантелей на скамье",
        dumbbell,
        3,
        "8–12",
        "Контролируй опускание 2 секунды."
      ),
      makeExercise(
        "Плечи",
        "Жим стоя с грифом",
        workingWeight(profile.bench, 30, intensity * 0.55),
        3,
        "8–10",
        "Не прогибай поясницу."
      ),
      makeExercise(
        "Плечи",
        "Махи гантелями в стороны",
        Math.max(3, Math.round(dumbbell * 0.45)),
        3,
        "12–15",
        "Локти слегка согнуты."
      ),
      makeExercise(
        "Трицепс",
        "Французский жим",
        workingWeight(profile.bench, 22, intensity * 0.45),
        3,
        "10–12",
        "Локти не разводить."
      )
    ];

    finisher = [
      {
        type: "Груша",
        name: "Боксёрский мешок",
        details: `${4 + week} раундов × 2 минуты`,
        note: "Работай технично. Не бей на максимум, если плечи устали."
      }
    ];
  }

  if (template === "pull") {
    main = [
      makeExercise(
        "Спина",
        "Подтягивания",
        null,
        4,
        profile.pullups >= 5 ? "макс -1" : "с резинкой 6–8",
        "Остановись за 1 повтор до отказа."
      ),
      makeExercise(
        "Спина",
        "Тяга штанги к поясу",
        workingWeight(profile.bench || profile.squat, profile.weight * 0.45, intensity),
        4,
        "8–12",
        "Спина ровная, тяни локтями."
      ),
      makeExercise(
        "Спина",
        "Тяга гантели одной рукой",
        dumbbell + 2,
        3,
        "10–12",
        "Пауза в верхней точке."
      ),
      makeExercise(
        "Трапеции",
        "Шраги с гантелями",
        dumbbell + 4,
        3,
        "12–15",
        "Без рывков."
      ),
      makeExercise(
        "Бицепс",
        "Подъём грифа на бицепс",
        workingWeight(profile.bench, 20, intensity * 0.45),
        3,
        "10–12",
        "Не раскачивай корпус."
      ),
      makeExercise(
        "Бицепс",
        "Молотки",
        dumbbell,
        3,
        "10–12",
        "Медленно опускай."
      )
    ];
  }

  if (template === "legs") {
    main = [
      makeExercise(
        "Ноги",
        "Присед со штангой",
        workingWeight(profile.squat, squatFallback, intensity),
        4,
        reps,
        risk ? "Если колени/спина беспокоят — снизь вес и амплитуду." : "Колени по линии носков."
      ),
      makeExercise(
        "Ноги",
        "Румынская тяга",
        workingWeight(profile.squat, profile.weight * 0.55, intensity),
        4,
        "8–12",
        "Таз назад, спина нейтрально."
      ),
      makeExercise(
        "Ноги",
        "Выпады с гантелями",
        dumbbell,
        3,
        "10 на ногу",
        "Держи корпус ровно."
      ),
      makeExercise(
        "Ноги",
        "Болгарские приседы",
        Math.max(4, dumbbell - 2),
        3,
        "8–10 на ногу",
        "Если тяжело — без веса."
      ),
      makeExercise(
        "Икры",
        "Подъёмы на икры",
        dumbbell + 4,
        4,
        "15–20",
        "Пауза сверху."
      ),
      makeExercise(
        "Кор",
        "Планка",
        null,
        3,
        "30–60 сек",
        "Не провисай в пояснице."
      )
    ];
  }

  if (template === "functional") {
    main = [
      {
        type: "Круг",
        name: "Круговая тренировка",
        details: `${3 + Math.floor(week / 2)} круга: отжимания 12, тяга резинки 15, присед 15, пресс 20`,
        note: "Отдых между кругами 90 секунд."
      },
      makeExercise(
        "Турник",
        "Подтягивания / вис",
        null,
        3,
        profile.pullups >= 3 ? "макс -1" : "вис 20–30 сек",
        "Качаем спину и хват."
      ),
      makeExercise(
        "Гантели",
        "Жим гантелей стоя",
        dumbbell,
        3,
        "10–12",
        "Без рывков."
      ),
      {
        type: "Груша",
        name: "Мешок интервальный",
        details: `${5 + week} раундов: 40 сек работа / 20 сек отдых`,
        note: "Техника выше силы удара."
      },
      {
        type: "Кардио",
        name: "Дорожка",
        details: cardioByGoal(profile.goal, week),
        note: "Темп разговорный или интервалы 1/1, если цель выносливость."
      }
    ];
  }

  if (template === "recovery") {
    main = [
      {
        type: "Кардио",
        name: "Дорожка восстановительная",
        details: cardioByGoal(profile.goal, week),
        note: "Пульс умеренный. После тренировки должно стать легче, не хуже."
      },
      {
        type: "Мобилити",
        name: "Мобилити таза и грудного отдела",
        details: "12–15 минут",
        note: "Медленно, с дыханием."
      },
      {
        type: "Резинка",
        name: "Плечи и лопатки с резинкой",
        details: "3×15",
        note: "Профилактика плеч после жима и мешка."
      },
      {
        type: "Груша",
        name: "Лёгкий мешок",
        details: "3 раунда × 2 минуты",
        note: "Только техника, без рубки."
      }
    ];
  }

  return [...warm, ...main, ...finisher, ...stretch];
}

function generatePlan(profile) {
  const days = profile.daysPerWeek;

  const templates =
    days <= 3
      ? ["push", "recovery", "pull", "rest", "legs", "rest", "rest"]
      : days === 4
        ? ["push", "pull", "recovery", "legs", "functional", "rest", "rest"]
        : days === 5
          ? ["push", "pull", "recovery", "legs", "functional", "recovery", "rest"]
          : ["push", "pull", "recovery", "legs", "functional", "recovery", "rest"];

  const plan = [];

  for (let week = 1; week <= 4; week++) {
    const weekDays = templates.map((template, dayIndex) => {
      const baseDay = {
        id: `w${week}-d${dayIndex + 1}`,
        week,
        dayIndex,
        dayName: dayNames[dayIndex],
        template,
        title: workoutNames[template],
        completed: false
      };

      if (template === "rest") {
        return {
          ...baseDay,
          summary: "Сон, прогулка, вода, лёгкая растяжка 5–10 минут.",
          exercises: []
        };
      }

      const exercises = buildWorkout(profile, week, template);

      return {
        ...baseDay,
        summary: `${exercises.length} шагов: разминка, силовая/кардио, растяжка.`,
        exercises
      };
    });

    plan.push({
      week,
      days: weekDays
    });
  }

  return plan;
}

function findDay(dayId) {
  for (const week of state.plan) {
    const day = week.days.find((item) => item.id === dayId);
    if (day) return day;
  }

  return null;
}

function renderPlan() {
  const container = $("planContainer");
  if (!container) return;

  if (!state.plan.length) {
    container.className = "plan-grid empty";
    container.innerHTML = `<div class="empty-state">Заполни анкету слева и нажми “Сгенерировать план”.</div>`;
    return;
  }

  container.className = "plan-grid";

  container.innerHTML = state.plan.map((week) => `
    <div class="week-block">
      <div class="week-head">
        <b>Неделя ${week.week}</b>
        <span>${week.days.filter((day) => day.exercises.length).length} тренировочных дней</span>
      </div>

      ${week.days.map((day) => `
        <div class="day-card">
          <div class="day-meta">
            <b>${day.dayName}</b><br>
            ${day.completed ? "Выполнено" : day.exercises.length ? "Запланировано" : "Восстановление"}
          </div>

          <div>
            <div class="day-title">${day.title}</div>
            <div class="day-summary">${day.summary}</div>
            <div class="badges">
              ${
                day.exercises.length
                  ? `<span class="badge">${day.exercises.length} шагов</span>`
                  : `<span class="badge rest">Отдых</span>`
              }
              ${day.completed ? `<span class="badge done">Готово</span>` : ""}
              ${day.template === "functional" ? `<span class="badge">Груша</span>` : ""}
              ${day.template === "recovery" ? `<span class="badge">Растяжка</span>` : ""}
            </div>
          </div>

          <div>
            ${
              day.exercises.length
                ? `<button class="primary-btn" data-start="${day.id}">${day.completed ? "Повторить" : "Начать"}</button>`
                : `<button class="ghost-btn" data-rest="${day.id}">Отметить отдых</button>`
            }
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");

  container.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => startWorkout(button.dataset.start));
  });

  container.querySelectorAll("[data-rest]").forEach((button) => {
    button.addEventListener("click", () => markRest(button.dataset.rest));
  });
}

function markRest(dayId) {
  const day = findDay(dayId);
  if (!day) return;

  if (day.completed) {
    toast("Этот день восстановления уже отмечен.");
    return;
  }

  day.completed = true;
  state.points += 15;

  save();
  renderAll();
  toast("День восстановления отмечен. +15 XP");
}

function startWorkout(dayId) {
  const day = findDay(dayId);
  if (!day || !day.exercises.length) return;

  state.activeWorkout = {
    dayId,
    startedAt: Date.now(),
    currentIndex: 0,
    exerciseStartedAt: Date.now(),
    results: day.exercises.map((exercise) => ({
      name: exercise.name,
      type: exercise.type,
      status: "pending",
      durationMs: 0
    }))
  };

  $("workoutModal").classList.remove("hidden");

  renderWorkout();

  clearInterval(workoutInterval);
  workoutInterval = setInterval(renderWorkoutTimers, 500);
}

function closeWorkout() {
  clearInterval(workoutInterval);
  workoutInterval = null;

  $("workoutModal").classList.add("hidden");
}

function renderWorkout() {
  const active = state.activeWorkout;
  if (!active) return;

  const day = findDay(active.dayId);
  if (!day) return;

  const current = day.exercises[active.currentIndex];

  $("workoutWeekLabel").textContent = `Неделя ${day.week} · ${day.dayName}`;
  $("workoutTitle").textContent = day.title;
  $("exerciseCounter").textContent = `${Math.min(active.currentIndex + 1, day.exercises.length)}/${day.exercises.length}`;

  if (current) {
    $("exerciseType").textContent = current.type;
    $("exerciseName").textContent = current.name;
    $("exerciseDetails").textContent = current.details;
    $("exerciseNote").textContent = current.note || "Работай технично и контролируй самочувствие.";
  } else {
    $("exerciseType").textContent = "Финиш";
    $("exerciseName").textContent = "Все упражнения обработаны";
    $("exerciseDetails").textContent = "Можно завершать тренировку.";
    $("exerciseNote").textContent = "Нажми “Завершить тренировку”, чтобы получить отчёт.";
  }

  $("liveExerciseList").innerHTML = day.exercises.map((exercise, index) => {
    const result = active.results[index];

    const statusText =
      result.status === "done"
        ? `✓ ${formatTime(result.durationMs)}`
        : result.status === "skipped"
          ? "Пропущено"
          : index === active.currentIndex
            ? "Сейчас"
            : "Ожидает";

    return `
      <div class="live-exercise-row ${index === active.currentIndex ? "active" : ""} ${result.status === "done" ? "done" : ""} ${result.status === "skipped" ? "skipped" : ""}">
        <div class="row-index">${index + 1}</div>
        <div>
          <b>${exercise.name}</b>
          <div class="row-sub">${exercise.type} · ${exercise.details}</div>
        </div>
        <div class="row-status">${statusText}</div>
      </div>
    `;
  }).join("");

  renderWorkoutTimers();
}

function renderWorkoutTimers() {
  const active = state.activeWorkout;
  if (!active) return;

  $("workoutTimer").textContent = formatTime(Date.now() - active.startedAt);
  $("exerciseTimer").textContent = formatTime(Date.now() - active.exerciseStartedAt);
}

function completeCurrentExercise(status) {
  const active = state.activeWorkout;
  if (!active) return;

  const day = findDay(active.dayId);
  if (!day) return;

  const index = active.currentIndex;

  if (index >= day.exercises.length) {
    toast("Все упражнения уже обработаны.");
    return;
  }

  active.results[index].status = status;
  active.results[index].durationMs = Date.now() - active.exerciseStartedAt;

  active.currentIndex += 1;
  active.exerciseStartedAt = Date.now();

  if (active.currentIndex >= day.exercises.length) {
    toast("Все упражнения пройдены. Заверши тренировку для отчёта.");
  }

  save();
  renderWorkout();
}

function finishWorkout() {
  const active = state.activeWorkout;
  if (!active) return;

  const day = findDay(active.dayId);
  if (!day) return;

  const totalMs = Date.now() - active.startedAt;
  const done = active.results.filter((result) => result.status === "done").length;
  const skipped = active.results.filter((result) => result.status === "skipped").length;
  const total = active.results.length || 1;
  const percent = Math.round((done / total) * 100);

  const doneResults = active.results.filter((result) => result.status === "done");
  const avgMs = doneResults.length
    ? Math.round(doneResults.reduce((sum, result) => sum + result.durationMs, 0) / doneResults.length)
    : 0;

  let earned = Math.round(done * 10 + percent * 0.5);

  if (percent >= 90) earned += 20;
  if (totalMs >= 25 * 60 * 1000) earned += 10;

  day.completed = true;
  state.points += earned;

  const record = {
    id: window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: new Date().toLocaleString("ru-RU"),
    dayId: day.id,
    title: day.title,
    week: day.week,
    dayName: day.dayName,
    totalMs,
    done,
    skipped,
    total,
    percent,
    avgMs,
    earned,
    results: active.results
  };

  state.history.unshift(record);
  state.activeWorkout = null;

  save();
  closeWorkout();
  renderAll();

  alert(
    `Тренировка завершена!\n\n` +
    `Время: ${formatTime(totalMs)}\n` +
    `Выполнено: ${done}/${total}\n` +
    `Пропущено: ${skipped}\n` +
    `Процент: ${percent}%\n` +
    `XP: +${earned}`
  );
}

function renderHistory() {
  const container = $("historyContainer");
  if (!container) return;

  if (!state.history.length) {
    container.innerHTML = `<div class="empty-state">Пока нет завершённых тренировок.</div>`;
    return;
  }

  container.innerHTML = state.history.slice(0, 12).map((item) => `
    <div class="history-item">
      <div class="history-item-top">
        <b>${item.title}</b>
        <span class="badge done">+${item.earned} XP</span>
      </div>
      <div class="history-stats">
        ${item.date} · Неделя ${item.week}, ${item.dayName}<br>
        Время: ${formatTime(item.totalMs)} · Выполнено: ${item.done}/${item.total} · Пропущено: ${item.skipped} · Среднее время: ${formatTime(item.avgMs)}
      </div>
    </div>
  `).join("");
}

function countCompletedRest() {
  return state.plan.reduce((sum, week) => {
    return sum + week.days.filter((day) => day.completed && !day.exercises.length).length;
  }, 0);
}

function calculateStreak() {
  if (!state.history.length) return 0;

  const uniqueDates = [
    ...new Set(
      state.history.map((item) => {
        return String(item.date).split(",")[0];
      })
    )
  ];

  return Math.min(uniqueDates.length, state.history.length);
}

function getLatestWeight() {
  if (state.measurements.length) {
    return Number(state.measurements[state.measurements.length - 1].weight);
  }

  return Number(state.profile?.weight || 0);
}

function nextCheckpoint() {
  const count = state.measurements.length;

  if (count === 0) return "Старт";
  if (count === 1) return "Неделя 1";
  if (count === 2) return "Неделя 2";
  if (count === 3) return "Неделя 3";

  return "Финал месяца";
}

function renderMotivation() {
  const profile = state.profile;

  const plannedCount =
    state.plan.reduce((sum, week) => {
      return sum + week.days.filter((day) => day.exercises.length).length;
    }, 0) || 1;

  const monthPercent = Math.min(100, Math.round((state.history.length / plannedCount) * 100));

  const levels = [
    { name: "Новичок", min: 0 },
    { name: "Воин", min: 200 },
    { name: "Атлет", min: 500 },
    { name: "Машина", min: 900 },
    { name: "Легенда", min: 1400 }
  ];

  const currentLevel = [...levels].reverse().find((level) => state.points >= level.min) || levels[0];
  const nextLevel = levels.find((level) => level.min > state.points);
  const xpPercent = nextLevel
    ? Math.round(((state.points - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100)
    : 100;

  $("levelName").textContent = currentLevel.name;
  $("pointsCount").textContent = `${state.points} XP`;
  $("xpBar").style.width = `${clamp(xpPercent, 0, 100)}%`;
  $("doneWorkouts").textContent = state.history.length;
  $("streakCount").textContent = calculateStreak();
  $("monthProgress").textContent = `${monthPercent}%`;

  if (!profile) {
    $("forecastWeight").textContent = "—";
    $("forecastText").textContent = "Заполни анкету, чтобы увидеть прогноз.";
    $("weeksToGoal").textContent = "—";
    $("nextCheckpoint").textContent = "Старт";
    $("startWeightLabel").textContent = "Старт —";
    $("targetWeightLabel").textContent = "Цель —";
    $("weightProgressFill").style.width = "0%";
    $("weightMarker").style.left = "0%";
    return;
  }

  const latestWeight = getLatestWeight();
  const startWeight = Number(state.measurements[0]?.weight || profile.weight);
  const targetWeight = Number(profile.targetWeight);

  const wantsLoss = targetWeight < latestWeight;
  const weeklyRate = wantsLoss ? 0.6 : 0.35;
  const diff = Math.abs(latestWeight - targetWeight);
  const thirtyDayChange = weeklyRate * 4.285;

  const forecast = wantsLoss
    ? Math.max(targetWeight, latestWeight - thirtyDayChange)
    : Math.min(targetWeight, latestWeight + thirtyDayChange);

  const weeksToGoal = diff > 0 ? Math.ceil(diff / weeklyRate) : 0;

  $("forecastWeight").textContent = `${forecast.toFixed(1)} кг`;
  $("forecastText").textContent = wantsLoss
    ? `При темпе около -${weeklyRate} кг/нед.`
    : `При темпе около +${weeklyRate} кг/нед.`;

  $("weeksToGoal").textContent = weeksToGoal ? `${weeksToGoal} нед.` : "цель";
  $("nextCheckpoint").textContent = nextCheckpoint();

  $("startWeightLabel").textContent = `Старт ${startWeight} кг`;
  $("targetWeightLabel").textContent = `Цель ${targetWeight} кг`;

  const totalPath = Math.abs(startWeight - targetWeight) || 1;
  const currentPath = Math.abs(startWeight - latestWeight);
  const weightProgress = clamp(Math.round((currentPath / totalPath) * 100), 0, 100);

  $("weightProgressFill").style.width = `${weightProgress}%`;
  $("weightMarker").style.left = `${weightProgress}%`;
}

function renderMeasurements() {
  const body = $("measurementsBody");
  if (!body) return;

  if (!state.measurements.length) {
    body.innerHTML = `<tr><td colspan="7">Нет замеров.</td></tr>`;
    return;
  }

  body.innerHTML = state.measurements.map((measurement) => `
    <tr>
      <td>${measurement.date || "—"}</td>
      <td>${measurement.weight || "—"}</td>
      <td>${measurement.waist || "—"}</td>
      <td>${measurement.chest || "—"}</td>
      <td>${measurement.arm || "—"}</td>
      <td>${measurement.thigh || "—"}</td>
      <td>${measurement.feeling || "—"}</td>
    </tr>
  `).join("");
}

function openMeasurementModal() {
  $("measurementModal").classList.remove("hidden");
  $("mWeight").value = getLatestWeight() || "";
}

function closeMeasurementModal() {
  $("measurementModal").classList.add("hidden");
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `fitmvp-progress-${todayISO()}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function renderAll() {
  renderPlan();
  renderHistory();
  renderMeasurements();
  renderMotivation();
}

function generateFromForm() {
  const form = $("profileForm");

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const profile = getProfileFromForm();

  if (profile.health && healthRisk(profile)) {
    toast("Есть ограничения по здоровью — план будет мягче.");
  }

  state.profile = profile;
  state.plan = generatePlan(profile);
  state.history = [];
  state.measurements = [
    {
      date: todayISO(),
      weight: profile.weight,
      waist: "",
      chest: "",
      arm: "",
      thigh: "",
      feeling: "Старт"
    }
  ];
  state.points = 0;
  state.activeWorkout = null;

  save();
  renderAll();
  toast("План на 4 недели создан.");
}

function bindEvents() {
  $("profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    generateFromForm();
  });

  $("generatePlanBtn").addEventListener("click", generateFromForm);

  $("completeExerciseBtn").addEventListener("click", () => {
    completeCurrentExercise("done");
  });

  $("skipExerciseBtn").addEventListener("click", () => {
    completeCurrentExercise("skipped");
  });

  $("finishWorkoutBtn").addEventListener("click", finishWorkout);

  $("closeWorkoutBtn").addEventListener("click", () => {
    const ok = confirm("Закрыть тренировку? Текущий live-прогресс не будет засчитан как завершённый.");
    if (!ok) return;

    state.activeWorkout = null;
    save();
    closeWorkout();
  });

  $("addMeasurementBtn").addEventListener("click", openMeasurementModal);
  $("closeMeasurementBtn").addEventListener("click", closeMeasurementModal);

  $("measurementForm").addEventListener("submit", (event) => {
    event.preventDefault();

    state.measurements.push({
      date: todayISO(),
      weight: Number($("mWeight").value),
      waist: $("mWaist").value,
      chest: $("mChest").value,
      arm: $("mArm").value,
      thigh: $("mThigh").value,
      feeling: $("mFeeling").value
    });

    save();
    closeMeasurementModal();
    renderAll();
    toast("Замер сохранён.");
  });

  $("exportBtn").addEventListener("click", exportJSON);

  $("printBtn").addEventListener("click", () => {
    window.print();
  });

  $("resetBtn").addEventListener("click", () => {
    const ok = confirm("Точно сбросить все данные FitMVP в этом браузере?");
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEY);

    state.profile = null;
    state.plan = [];
    state.history = [];
    state.measurements = [];
    state.points = 0;
    state.activeWorkout = null;

    $("profileForm").reset();

    renderAll();
    toast("Данные сброшены.");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  fillFormFromProfile(state.profile);
  bindEvents();
  renderAll();
});
