/* app.js — фит-трекер MVP. Один SPA, хранение в localStorage. Формулы — из engine.js (не менять). */
(function () {
  'use strict';
  var E = window.Engine;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  var todayStr = function () { return new Date().toISOString().slice(0, 10); };
  function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function fmt(n, d) { return E.round(n, d == null ? 1 : d); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- storage + миграция (логи не терять) ---------- */
  var KEY = 'fittracker.v1';
  var S = load();
  function blank() { return { profile: null, sessions: [], checkins: [], weighins: [], equipment: {}, plans: [], templates: [] }; }
  function migrate(s) {
    s = s || blank();
    s.profile = s.profile || null;
    s.sessions = s.sessions || [];
    s.checkins = s.checkins || [];
    s.weighins = s.weighins || [];
    s.equipment = s.equipment || {};                          // память типа снаряда за упражнением
    s.plans = s.plans || [];                                  // планы на будущие/пустые дни (намерение, не факт)
    s.templates = s.templates || [];                          // шаблоны тренировок
    s.sessions.forEach(function (ss) {
      (ss.sets || []).forEach(function (x) { if (!x.equipment) x.equipment = 'barbell'; });   // старые логи = штанга
    });
    return s;
  }
  function load() { try { return migrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return blank(); } }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

  var SCEN_LABEL = { mass: 'Массонабор', lean: 'Сухой набор', recomp: 'Рекомпозиция', cut: 'Похудение' };
  var EXERCISES = ['Жим лёжа', 'Присед', 'Становая', 'Жим стоя', 'Подтягивания', 'Тяга штанги', 'Жим гантелей', 'Жим ногами', 'Сгибания на бицепс', 'Разгибания на трицепс', 'Выпады', 'Отжимания на брусьях'];

  /* ---------- снаряд: расчёт эффективного веса, 1ПМ, тоннажа ---------- */
  function setEquip(x) { return x.equipment || 'barbell'; }
  function equipLabel(eq) { return eq === 'dumbbell' ? 'гантели' : eq === 'bodyweight' ? 'свой вес' : 'штанга'; }
  function currentBodyweight() { if (S.weighins && S.weighins.length) return S.weighins[S.weighins.length - 1].weight; return S.profile ? S.profile.weight : 0; }
  function effWeight(x) {
    if (setEquip(x) === 'bodyweight') return (x.bodyAt || currentBodyweight() || 0) + (+x.weight || 0);
    return +x.weight;
  }
  function setE1rm(x) { return E.e1rm(effWeight(x), x.reps); }
  function setTonnage(x) {
    if (!(x.reps > 0)) return 0;
    var v = effWeight(x) * x.reps;
    return setEquip(x) === 'dumbbell' ? v * 2 : v;
  }
  function sessionTonnage(sess) { return (sess.sets || []).reduce(function (s, x) { return s + setTonnage(x); }, 0); }
  function bestE1rmOf(sets) { var b = null; sets.forEach(function (x) { var v = setE1rm(x); if (v != null && (b == null || v > b)) b = v; }); return b; }
  function weightPart(x) {
    var eq = setEquip(x);
    if (eq === 'dumbbell') return '2 × ' + x.weight + ' кг';
    if (eq === 'bodyweight') return 'свой вес' + (+x.weight > 0 ? (' + ' + x.weight + ' кг') : '');
    return x.weight + ' кг';
  }
  function guessEquip(n) { n = (n || '').toLowerCase(); if (/гантел/.test(n)) return 'dumbbell'; if (/подтяг|отжим|брус|планк|берпи|пресс/.test(n)) return 'bodyweight'; return 'barbell'; }

  /* ---------- router ---------- */
  function go(id) {
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + id); });
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.go === id); });
    window.scrollTo(0, 0);
    render(id);
  }
  function render(id) {
    if (id === 'today') renderToday();
    else if (id === 'logger') renderLogger();
    else if (id === 'forecast') renderForecast();
    else if (id === 'diagnosis') renderDiagnosis();
    else if (id === 'history') renderCalendar();
  }

  /* ---------- generic sheet ---------- */
  function openSheet(html) { $('#sheet').innerHTML = html; $('#sheet-bg').classList.add('show'); }
  function closeSheet() { $('#sheet-bg').classList.remove('show'); }

  /* ---------- reusable stepper (кнопки + прямой ввод) + rpe ---------- */
  function stepper(key, unit, val, step, mode) {
    return '<div class="field"><div class="stepper" data-step="' + key + '" data-inc="' + step + '">' +
      '<button type="button" data-dir="-1">−</button>' +
      '<div class="val"><input type="text" class="stepval mono" data-val inputmode="' + (mode || 'decimal') + '" value="' + val + '"><small>' + unit + '</small></div>' +
      '<button type="button" data-dir="1">+</button></div></div>';
  }
  function bindStepperEl(box, state, onchange) {
    $$('.stepper', box).forEach(function (s) {
      var key = s.dataset.step, inc = +s.dataset.inc, input = $('[data-val]', s);
      function commit(v) { if (isNaN(v)) v = 0; if (v < 0) v = 0; state[key] = E.round(v, 2); input.value = state[key]; if (onchange) onchange(); }
      $$('button', s).forEach(function (b) { b.onclick = function () { commit(+state[key] + (+b.dataset.dir) * inc); }; });
      input.addEventListener('input', function () { var v = parseFloat(input.value.replace(',', '.')); if (!isNaN(v)) { state[key] = E.round(v, 2); if (onchange) onchange(); } });
      input.addEventListener('blur', function () { commit(parseFloat(input.value.replace(',', '.'))); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    });
  }
  function rpePickerHtml(cur) {
    var lbl = { g: 'легко', y: 'средне', r: 'тяжело' };
    return '<div class="rpe">' + ['g', 'y', 'r'].map(function (k) {
      return '<button type="button" class="rpe dot" data-rpe="' + k + '" aria-pressed="' + (cur === k) + '"><span class="c"></span>' + lbl[k] + '</button>';
    }).join('') + '</div>';
  }
  function bindRpe(box, state) {
    $$('.rpe.dot', box).forEach(function (d) {
      d.onclick = function () {
        var was = d.getAttribute('aria-pressed') === 'true';
        $$('.rpe.dot', box).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        d.setAttribute('aria-pressed', was ? 'false' : 'true');
        state.rpe = was ? null : d.dataset.rpe;
      };
    });
  }

  /* ---------- onboarding ---------- */
  var draft = {};
  function startOnboarding() { draft = { activity: 'moderate', sex: 'm' }; obStep(1); }
  function obStep(n) {
    var wrap = $('#ob-body');
    if (n === 1) {
      wrap.innerHTML =
        '<p class="eyebrow">Шаг 1 из 2 · цель</p>' +
        '<h2 style="font-size:26px;margin-bottom:6px">Чего хочешь добиться?</h2>' +
        '<p class="muted" style="margin:0 0 18px">От цели зависит калораж и прогноз</p>' +
        chips('scenario', [['mass', 'Массонабор'], ['lean', 'Сухой набор'], ['recomp', 'Рекомпозиция'], ['cut', 'Похудение']], draft.scenario) +
        '<div class="field" style="margin-top:20px"><label>Пол</label>' +
        chips('sex', [['m', 'Мужской'], ['f', 'Женский']], draft.sex) + '</div>' +
        '<div class="grid2">' +
        numField('height', 'Рост, см', draft.height || 178) +
        numField('weight', 'Вес, кг', draft.weight || 80) +
        numField('age', 'Возраст', draft.age || 30) +
        selField('activity', 'Активность вне зала', [['sedentary', 'Сидячая'], ['light', 'Лёгкая'], ['moderate', 'Средняя'], ['high', 'Высокая']], draft.activity) +
        '</div>' +
        '<div class="field"><label>Стаж в зале</label>' +
        chips('experience', [['beginner', 'До 1 года'], ['intermediate', '1–3 года'], ['advanced', '3+ года']], draft.experience) + '</div>' +
        '<button class="btn" id="ob-next">Дальше →</button>';
      bindChips(wrap, draft);
      $('#ob-next').onclick = function () {
        collectNums(wrap, draft);
        if (!draft.scenario || !draft.experience) { toast('Выбери цель и стаж'); return; }
        obStep(2);
      };
    } else {
      wrap.innerHTML =
        '<p class="eyebrow">Шаг 2 из 2 · каркас</p>' +
        '<h2 style="font-size:26px;margin-bottom:6px">Замерь запястье и лодыжку</h2>' +
        '<p class="muted" style="margin:0 0 6px">Кость почти без мышц и жира — она показывает, какой у тебя каркас. Это задаёт ширину прогноза (а не приговор)</p>' +
        '<p class="note-inline">Мерь сантиметром в самом узком месте: запястье — под косточкой, лодыжку — над щиколоткой</p>' +
        '<div class="grid2" style="margin-top:16px">' +
        numField('wrist', 'Запястье, см', draft.wrist || 17) +
        numField('ankle', 'Лодыжка, см', draft.ankle || 22) +
        '</div>' +
        '<button class="btn" id="ob-done">Готово, показать прогноз</button>' +
        '<button class="btn ghost slim" id="ob-later" style="margin-top:10px">Указать позже</button>' +
        '<button class="btn ghost slim" id="ob-back" style="margin-top:10px">← Назад</button>';
      $('#ob-back').onclick = function () { collectNums(wrap, draft); obStep(1); };
      $('#ob-done').onclick = function () { collectNums(wrap, draft); finishOnboarding(true); };
      $('#ob-later').onclick = function () { finishOnboarding(false); };
    }
  }
  function finishOnboarding(withFrame) {
    S.profile = {
      scenario: draft.scenario, sex: draft.sex, experience: draft.experience, activity: draft.activity,
      height: +draft.height, weight: +draft.weight, age: +draft.age,
      wrist: withFrame ? +draft.wrist : null, ankle: withFrame ? +draft.ankle : null,
      createdAt: todayStr()
    };
    S.weighins = [{ date: todayStr(), weight: +draft.weight }];
    save(); boot(); go('forecast');
  }
  function chips(name, opts, cur) {
    return '<div class="chips" data-name="' + name + '">' + opts.map(function (o) {
      return '<button class="chip" data-val="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function numField(name, label, val) {
    return '<div class="field"><label>' + label + '</label><input class="txt mono" type="number" inputmode="decimal" data-num="' + name + '" value="' + val + '"></div>';
  }
  function selField(name, label, opts, cur) {
    return '<div class="field"><label>' + label + '</label><select class="txt" data-num="' + name + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
  }
  function bindChips(wrap, target) {
    $$('.chips', wrap).forEach(function (g) {
      $$('.chip', g).forEach(function (c) {
        c.onclick = function () {
          $$('.chip', g).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          c.setAttribute('aria-pressed', 'true');
          target[g.dataset.name] = c.dataset.val;
        };
      });
    });
  }
  function collectNums(wrap, target) { $$('[data-num]', wrap).forEach(function (i) { target[i.dataset.num] = i.value; }); }

  /* ---------- Today ---------- */
  function renderToday() {
    var box = $('#today-body');
    var lastCheck = S.checkins[S.checkins.length - 1];
    var todaySess = sessionOf(todayStr());
    var setsToday = todaySess ? todaySess.sets.length : 0;
    box.innerHTML = '';

    var ready = el('div', 'card');
    var readyHtml = '<p class="eyebrow">Готовность</p>';
    if (lastCheck) {
      readyHtml += '<div class="statrow">' +
        stat('Сон', lastCheck.sleep + ' ч') + stat('Стресс', lastCheck.stress + '/10') +
        stat('Калории', (lastCheck.calories || '—') + '') + '</div>' +
        '<p class="note-inline">Последний чек-ин: ' + prettyDate(lastCheck.date) + '</p>';
    } else {
      readyHtml += '<p class="muted" style="margin:0">Ещё нет данных. Вечером отметь сон, калории и стресс — это топливо для диагностики</p>';
    }
    ready.innerHTML = readyHtml;
    box.appendChild(ready);

    var act = el('div', 'card');
    var plannedToday = planRemaining(todayStr());
    act.innerHTML = '<p class="eyebrow">Сегодня</p>' +
      '<h2 style="font-size:22px;margin-bottom:4px">' + (setsToday ? 'Тренировка идёт' : 'Готов тренироваться?') + '</h2>' +
      '<p class="muted" style="margin:0 0 16px">' + (setsToday ? ('Записано подходов: ' + setsToday) : (plannedToday.length ? ('Запланировано: ' + plannedToday.map(function (it) { return it.exercise; }).join(', ')) : 'Логируй каждый подход в пару тапов')) + '</p>';
    var startBtn = el('button', 'btn', (setsToday ? 'Продолжить тренировку' : 'Начать тренировку'));
    startBtn.onclick = function () { logDate = null; go('logger'); };
    act.appendChild(startBtn);
    var ciBtn = el('button', 'btn ghost slim', 'Вечерний чек-ин: сон · калории · стресс');
    ciBtn.style.marginTop = '10px';
    ciBtn.onclick = openCheckin;
    act.appendChild(ciBtn);
    box.appendChild(act);

    var recent = S.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 4);
    if (recent.length) {
      var h = el('div', 'card');
      h.innerHTML = '<p class="eyebrow">Недавнее</p>';
      recent.forEach(function (s) {
        var r = el('div', 'setrow-static');
        r.innerHTML = '<div class="load">' + prettyDate(s.date) + '</div>' +
          '<div class="meta">' + s.sets.length + ' подходов · ' + Math.round(sessionTonnage(s)) + ' кг тоннаж</div>';
        h.appendChild(r);
      });
      var allBtn = el('button', 'btn ghost slim', 'Открыть календарь →');
      allBtn.style.marginTop = '12px';
      allBtn.onclick = function () { go('history'); };
      h.appendChild(allBtn);
      box.appendChild(h);
    } else {
      var demo = el('div', 'card');
      demo.innerHTML = '<p class="muted" style="margin:0 0 12px">Чтобы увидеть прогноз и диагностику в действии, можно заполнить пример 6 недель тренировок</p>';
      var db = el('button', 'btn ghost slim', 'Показать на примере');
      db.onclick = function () { seedDemo(); toast('Пример загружен'); go('today'); };
      demo.appendChild(db);
      box.appendChild(demo);
    }
  }
  function stat(k, v) { return '<div class="stat"><div class="k">' + k + '</div><div class="v mono">' + v + '</div></div>'; }

  function sessionOf(date) { return S.sessions.filter(function (x) { return x.date === date; })[0]; }
  function ensureSession(date) {
    date = date || activeDate();
    var s = sessionOf(date);
    if (!s) { s = { id: 'sess-' + date + '-' + Date.now(), date: date, sets: [] }; S.sessions.push(s); save(); }
    return s;
  }

  /* ---------- планы (намерение, НЕ факт) ---------- */
  function planFor(date) { return S.plans.filter(function (p) { return p.date === date; })[0]; }
  function planRemaining(date) {
    var p = planFor(date); if (!p) return [];
    var s = sessionOf(date), done = {};
    if (s) s.sets.forEach(function (x) { done[x.exercise] = 1; });
    return p.items.filter(function (it) { return !done[it.exercise]; });
  }

  /* ---------- Logger ---------- */
  var logState = { exercise: 'Жим лёжа', equipment: 'barbell', weight: 60, reps: 8, rpe: null, note: '', _pin: false };
  var logDate = null;                                        // null = сегодня; иначе — запись задним числом
  function activeDate() { return logDate || todayStr(); }
  function lastSetOf(name) {
    var sorted = S.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    for (var i = sorted.length - 1; i >= 0; i--) {
      var ss = sorted[i].sets.filter(function (x) { return x.exercise === name && x.reps > 0; });
      if (ss.length) return ss[ss.length - 1];
    }
    return null;
  }
  function prefillFor(name) {
    logState.equipment = S.equipment[name] || logState.equipment || guessEquip(name);
    if (logState._pin) { logState._pin = false; return; }   // значение пришло из плана — не перетирать
    var last = lastSetOf(name);
    if (last) { logState.weight = last.weight; logState.reps = last.reps; }
  }
  function recentExercises(n) {
    var out = [], seen = {};
    var sorted = S.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    for (var i = sorted.length - 1; i >= 0; i--) {
      var sets = sorted[i].sets;
      for (var j = sets.length - 1; j >= 0; j--) {
        var nm = sets[j].exercise;
        if (!seen[nm]) { seen[nm] = 1; out.push(nm); if (out.length >= n) return out; }
      }
    }
    return out;
  }
  function renderLogger() {
    var box = $('#logger-body');
    prefillFor(logState.exercise);
    var date = activeDate();
    var sess = sessionOf(date);
    var hasSets = sess && sess.sets.length;
    var unit = logState.equipment === 'dumbbell' ? 'вес гантели, кг' : logState.equipment === 'bodyweight' ? 'довесок, кг' : 'вес, кг';

    var banner = '';
    if (logDate && logDate !== todayStr()) banner += '<div class="backdate">Запись за ' + prettyDate(logDate) + '<button type="button" id="lg-exit">закрыть</button></div>';
    var remaining = planRemaining(date);
    if (remaining.length) banner += '<div class="plan-banner"><div class="lbl2" style="margin:0 0 8px">На ' + (date === todayStr() ? 'сегодня' : prettyDate(date)) + ' запланировано</div><div class="picklist" id="lg-plan">' +
      remaining.map(function (it, i) { return '<button type="button" class="pick" data-pi="' + i + '">' + escapeHtml(it.exercise) + '</button>'; }).join('') + '</div></div>';

    box.innerHTML = banner +
      '<div class="field"><label>Упражнение</label>' +
      '<button type="button" class="txt pickfield" id="lg-ex"><span>' + escapeHtml(logState.exercise) + '</span><span class="muted">' + equipLabel(logState.equipment) + ' ›</span></button></div>' +
      '<div class="grid2">' + stepper('weight', unit, logState.weight, 2.5, 'decimal') + stepper('reps', 'повторы', logState.reps, 1, 'numeric') + '</div>' +
      '<div id="e1rm-live" class="card" style="text-align:center;padding:14px;margin:4px 0 14px"></div>' +
      '<div class="field"><label>Как дался подход?</label>' + rpePickerHtml(logState.rpe) + '</div>' +
      '<div class="field"><input class="txt" id="lg-note" placeholder="Заметка (напр. подстраховали на последнем)" value="' + escapeHtml(logState.note || '') + '"></div>' +
      '<button class="btn" id="lg-add">✓ Записать подход</button>' +
      '<div id="lg-sets" style="margin-top:18px"></div>' +
      '<div class="hr"></div>' +
      (hasSets ? '<button class="btn ghost slim" id="lg-tpl-save">Сохранить как шаблон</button>' : '') +
      (S.templates.length ? '<button class="btn ghost slim" id="lg-tpl-use" style="margin-top:10px">Начать по шаблону</button>' : '') +
      '<button class="btn ghost slim" id="lg-finish" style="margin-top:10px">Завершить тренировку</button>';

    if ($('#lg-exit')) $('#lg-exit').onclick = function () { logDate = null; go('history'); };
    $$('#lg-plan .pick').forEach(function (b) { b.onclick = function () { var it = remaining[+b.dataset.pi]; logState.exercise = it.exercise; logState.equipment = it.equipment || S.equipment[it.exercise] || guessEquip(it.exercise); if (it.weight) logState.weight = it.weight; if (it.reps) logState.reps = it.reps; logState._pin = true; renderLogger(); }; });
    $('#lg-ex').onclick = function () { openExercisePicker(); };
    bindStepperEl(box, logState, updateE1rmLive);
    bindRpe(box, logState);
    $('#lg-note').oninput = function () { logState.note = this.value; };
    $('#lg-add').onclick = addSet;
    if ($('#lg-tpl-save')) $('#lg-tpl-save').onclick = function () { openSaveTemplate(sessionOf(date).sets); };
    if ($('#lg-tpl-use')) $('#lg-tpl-use').onclick = function () { chooseTemplate(function (t) { applyTemplateToDate(t, date); }); };
    $('#lg-finish').onclick = function () { var back = logDate ? 'history' : 'today'; logDate = null; toast('Тренировка сохранена'); go(back); };
    updateE1rmLive();
    renderSetList();
  }
  function updateE1rmLive() {
    var box = $('#e1rm-live'); if (!box) return;
    var synth = { equipment: logState.equipment, weight: logState.weight, reps: logState.reps };
    var v = setE1rm(synth);
    if (v == null) {
      box.innerHTML = '<span class="tag-try">Попытка</span><div class="muted" style="margin-top:4px">0 повторов — в прогресс не идёт, только заметка</div>';
    } else {
      var suffix = logState.equipment === 'dumbbell' ? ' <span class="muted" style="font-size:15px">/рука</span>' : '';
      var effNote = logState.equipment === 'bodyweight' ? ('<div class="note-inline">эффективный вес ≈ ' + E.round(effWeight(synth), 1) + ' кг (свой вес' + (+logState.weight > 0 ? ' + довесок' : '') + ')</div>') : '';
      box.innerHTML = '<div class="muted" style="font-size:13px">расчётный 1ПМ <button type="button" class="info-i" id="e1-info">i</button></div>' +
        '<div class="big" style="font-size:30px;color:var(--accent)">' + v + ' кг' + suffix + '</div>' + effNote;
      $('#e1-info').onclick = openInfo1rm;
    }
  }
  function addSet() {
    var date = activeDate();
    var sess = ensureSession(date);
    var rec = { exercise: logState.exercise, equipment: logState.equipment, weight: +logState.weight, reps: +logState.reps, rpe: logState.rpe, note: (logState.note || '').trim() };
    rec.ts = logDate ? (new Date(date).getTime() + sess.sets.length) : Date.now();
    if (logState.equipment === 'bodyweight') rec.bodyAt = currentBodyweight();
    sess.sets.push(rec); save();
    logSetOpen[rec.exercise] = true;                          // раскрыть упражнение, чтобы новый подход был виден
    logState.note = ''; logState.rpe = null;
    if (navigator.vibrate) navigator.vibrate(15);
    renderLogger();
  }
  var logSetOpen = {};
  function renderSetList() {
    var box = $('#lg-sets'); if (!box) return;
    var date = activeDate();
    var sess = sessionOf(date);
    var sets = sess ? sess.sets : [];
    if (!sets.length) { box.innerHTML = '<p class="muted" style="text-align:center">Пока нет подходов' + (logDate ? ' за этот день' : ' сегодня') + '</p>'; return; }
    if (logSetOpen[logState.exercise] == null) logSetOpen[logState.exercise] = true;   // текущее упражнение раскрыто
    box.innerHTML = '<p class="eyebrow">' + (logDate && logDate !== todayStr() ? prettyDate(date) : 'Записано сегодня') + '</p>' +
      '<div class="statrow" style="margin:0 0 10px">' + stat('Упражнений', groupSets(sess).length) + stat('Подходов', sets.length) + stat('Тоннаж', Math.round(sessionTonnage(sess)) + ' кг') + '</div>' +
      '<p class="note-inline" style="margin:0 0 10px">Тап по упражнению — раскрыть подходы, тап по подходу — изменить</p>' +
      groupedHtml(sess, logSetOpen);
    $$('#lg-sets .exhead').forEach(function (b) { b.onclick = function () { var k = b.dataset.ex; logSetOpen[k] = !logSetOpen[k]; renderSetList(); }; });
    $$('#lg-sets .setrow').forEach(function (b) { b.onclick = function () { openEditSet(b.dataset.sid, +b.dataset.idx, renderLogger); }; });
  }
  function setRowHtml(x, sid, idx) {
    var color = x.rpe ? '<span class="c ' + x.rpe + '"></span>' : '<span class="c" style="background:var(--line-2)"></span>';
    var meta = x.reps > 0 ? ('1ПМ ' + setE1rm(x) + ' кг' + (setEquip(x) === 'dumbbell' ? ' /рука' : '')) : '<span class="tag-try">попытка</span>';
    return '<button type="button" class="setrow" data-sid="' + sid + '" data-idx="' + idx + '">' + color +
      '<div><div class="load mono">' + escapeHtml(x.exercise) + ' · ' + weightPart(x) + ' × ' + x.reps + '</div>' +
      (x.note ? '<div class="muted" style="font-size:13px">' + escapeHtml(x.note) + '</div>' : '') +
      '</div><div class="meta">' + meta + '</div></button>';
  }
  // группировка подходов по упражнению (порядок первого появления, чередование склеивается)
  function groupSets(sess) {
    var groups = [], gidx = {};
    sess.sets.forEach(function (x, i) {
      var k = x.exercise;
      if (gidx[k] == null) { gidx[k] = groups.length; groups.push({ exercise: k, equipment: setEquip(x), items: [] }); }
      groups[gidx[k]].items.push({ set: x, i: i });
    });
    return groups;
  }
  function groupedHtml(sess, openMap) {
    return groupSets(sess).map(function (g) {
      var isOpen = !!openMap[g.exercise];
      var best = bestE1rmOf(g.items.map(function (o) { return o.set; }));
      var sub = g.items.length + ' подх.' + (g.equipment !== 'barbell' ? ' · ' + equipLabel(g.equipment) : '') + (best != null ? ' · 1ПМ ' + best + ' кг' : '');
      return '<div class="exgroup">' +
        '<button type="button" class="exhead" data-ex="' + escapeHtml(g.exercise) + '">' +
        '<div class="exhead-txt"><div class="exname">' + escapeHtml(g.exercise) + '</div><div class="exsub muted">' + sub + '</div></div>' +
        '<span class="exchevron">' + (isOpen ? '▾' : '▸') + '</span></button>' +
        (isOpen ? ('<div class="exsets">' + g.items.map(function (o) { return setRowHtml(o.set, sess.id, o.i); }).join('') + '</div>') : '') +
        '</div>';
    }).join('');
  }

  /* ---------- exercise picker + equipment ---------- */
  function openExercisePicker(onPick) {
    var recent = recentExercises(6);
    var rest = EXERCISES.filter(function (n) { return recent.indexOf(n) < 0; });
    var html = '<p class="eyebrow">Упражнение</p><h2 style="margin-bottom:12px">Что делаешь?</h2>';
    if (recent.length) html += '<div class="lbl2">Недавние</div><div class="picklist">' + recent.map(pickBtn).join('') + '</div>';
    html += '<div class="lbl2">Все упражнения</div><div class="picklist">' + rest.map(pickBtn).join('') + '</div>' +
      '<div class="hr"></div><div class="field"><input class="txt" id="pk-custom" placeholder="Название своего упражнения"></div>' +
      '<button class="btn ghost slim" id="pk-add">+ Добавить своё</button>' +
      '<button class="btn ghost slim" id="pk-cancel" style="margin-top:10px">Отмена</button>';
    openSheet(html);
    $$('#sheet .pick').forEach(function (b) { b.onclick = function () { pickExercise(b.dataset.name, onPick); }; });
    $('#pk-add').onclick = function () { var v = $('#pk-custom').value.trim(); if (v) pickExercise(v, onPick); else toast('Введи название'); };
    $('#pk-cancel').onclick = closeSheet;
  }
  function pickBtn(n) { return '<button type="button" class="pick" data-name="' + escapeHtml(n) + '">' + escapeHtml(n) + '</button>'; }
  function pickExercise(name, onPick) {
    var eq = S.equipment[name] || guessEquip(name);
    function hint(e) { return e === 'dumbbell' ? 'Вводи вес ОДНОЙ гантели — в журнале покажу «2 × вес», тоннаж посчитаю за обе' : e === 'bodyweight' ? 'Нагрузка = твой вес тела; довесок укажешь в поле веса' : 'Вес штанги как есть'; }
    var html = '<p class="eyebrow">' + escapeHtml(name) + '</p><h2 style="margin-bottom:4px">На чём делаешь?</h2>' +
      '<p class="muted" style="margin:0 0 14px">Запомню для этого упражнения</p>' +
      '<div class="chips" id="eq-pick">' +
      ['barbell', 'dumbbell', 'bodyweight'].map(function (v) { return '<button class="chip" data-val="' + v + '" aria-pressed="' + (eq === v) + '">' + { barbell: 'Штанга', dumbbell: 'Гантели', bodyweight: 'Свой вес' }[v] + '</button>'; }).join('') +
      '</div><p class="note-inline" id="eq-hint">' + hint(eq) + '</p>' +
      '<button class="btn" id="eq-done">Готово</button>' +
      '<button class="btn ghost slim" id="eq-back" style="margin-top:10px">← Назад к списку</button>' +
      '<button class="btn ghost slim" id="eq-cancel" style="margin-top:10px">Отмена</button>';
    openSheet(html);
    var sel = eq;
    $$('#eq-pick .chip').forEach(function (c) {
      c.onclick = function () {
        $$('#eq-pick .chip').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        c.setAttribute('aria-pressed', 'true'); sel = c.dataset.val; $('#eq-hint').textContent = hint(sel);
      };
    });
    $('#eq-back').onclick = function () { openExercisePicker(onPick); };
    $('#eq-cancel').onclick = closeSheet;
    $('#eq-done').onclick = function () {
      S.equipment[name] = sel; save();
      if (onPick) { onPick(name, sel); return; }             // вызывающий (напр. планирование) сам решает, что делать
      logState.exercise = name; logState.equipment = sel; closeSheet(); prefillFor(name); renderLogger();
    };
  }

  /* ---------- edit set sheet ---------- */
  function openEditSet(sid, idx, after) {
    var sess = S.sessions.filter(function (s) { return s.id === sid; })[0]; if (!sess) return;
    var set = sess.sets[idx]; if (!set) return;
    var es = { weight: set.weight, reps: set.reps, rpe: set.rpe || null, note: set.note || '' };
    var unit = setEquip(set) === 'dumbbell' ? 'вес гантели, кг' : setEquip(set) === 'bodyweight' ? 'довесок, кг' : 'вес, кг';
    var html = '<p class="eyebrow">' + escapeHtml(set.exercise) + ' · ' + equipLabel(setEquip(set)) + '</p><h2 style="margin-bottom:14px">Правка подхода</h2>' +
      '<div class="grid2">' + stepper('weight', unit, es.weight, 2.5, 'decimal') + stepper('reps', 'повторы', es.reps, 1, 'numeric') + '</div>' +
      '<div class="field"><label>Как дался подход?</label>' + rpePickerHtml(es.rpe) + '</div>' +
      '<div class="field"><input class="txt" id="ed-note" placeholder="Заметка" value="' + escapeHtml(es.note) + '"></div>' +
      '<button class="btn" id="ed-save">Сохранить</button>' +
      '<button class="btn ghost slim" id="ed-del" style="margin-top:10px;color:var(--bad)">Удалить подход</button>';
    openSheet(html);
    bindStepperEl($('#sheet'), es);
    bindRpe($('#sheet'), es);
    $('#ed-note').oninput = function () { es.note = this.value; };
    $('#ed-save').onclick = function () {
      set.weight = +es.weight; set.reps = +es.reps; set.rpe = es.rpe; set.note = (es.note || '').trim();
      save(); closeSheet(); toast('Подход обновлён'); if (after) after();
    };
    $('#ed-del').onclick = function () {
      sess.sets.splice(idx, 1);
      if (!sess.sets.length) S.sessions = S.sessions.filter(function (s) { return s.id !== sess.id; });
      save(); closeSheet(); toast('Подход удалён'); if (after) after();
    };
  }

  /* ---------- templates ---------- */
  function openSaveTemplate(sets) {
    var items = [], seen = {};
    (sets || []).forEach(function (x) { if (!seen[x.exercise]) { seen[x.exercise] = 1; items.push({ exercise: x.exercise, equipment: setEquip(x), weight: x.weight, reps: x.reps }); } });
    if (!items.length) { toast('Нет подходов для шаблона'); return; }
    var auto = items.slice(0, 2).map(function (it) { return it.exercise; }).join(' + ') + (items.length > 2 ? ' и ещё' : '');
    openSheet('<p class="eyebrow">Шаблон</p><h2 style="margin-bottom:10px">Сохранить как шаблон</h2>' +
      '<div class="field"><label>Название</label><input class="txt" id="tpl-name" value="' + escapeHtml(auto) + '"></div>' +
      '<p class="muted" style="margin:0 0 12px">Войдут: ' + items.map(function (it) { return escapeHtml(it.exercise); }).join(', ') + '</p>' +
      '<button class="btn" id="tpl-save">Сохранить</button><button class="btn ghost slim" id="tpl-cancel2" style="margin-top:10px">Отмена</button>');
    $('#tpl-save').onclick = function () { var nm = $('#tpl-name').value.trim() || auto; S.templates.push({ id: 'tpl-' + Date.now(), name: nm, items: items }); save(); closeSheet(); toast('Шаблон сохранён'); };
    $('#tpl-cancel2').onclick = closeSheet;
  }
  function chooseTemplate(cb) {
    if (!S.templates.length) { toast('Пока нет шаблонов'); return; }
    openSheet('<p class="eyebrow">Шаблоны</p><h2 style="margin-bottom:12px">Выбери шаблон</h2>' +
      S.templates.map(function (t, i) {
        return '<div class="plan-item"><button type="button" class="tpl-pick" data-i="' + i + '"><b>' + escapeHtml(t.name) + '</b><div class="muted" style="font-size:13px">' + t.items.map(function (it) { return escapeHtml(it.exercise); }).join(', ') + '</div></button><button type="button" class="rm tpl-del" data-i="' + i + '">✕</button></div>';
      }).join('') +
      '<button class="btn ghost slim" id="tpl-cancel" style="margin-top:12px">Отмена</button>');
    $$('#sheet .tpl-pick').forEach(function (b) { b.onclick = function () { cb(S.templates[+b.dataset.i]); }; });
    $$('#sheet .tpl-del').forEach(function (b) { b.onclick = function () { S.templates.splice(+b.dataset.i, 1); save(); chooseTemplate(cb); }; });
    $('#tpl-cancel').onclick = closeSheet;
  }
  function applyTemplateToDate(t, date) {
    var plan = { date: date, items: t.items.map(function (it) { return { exercise: it.exercise, equipment: it.equipment, weight: it.weight, reps: it.reps }; }) };
    S.plans = S.plans.filter(function (p) { return p.date !== date; });
    S.plans.push(plan); save(); closeSheet(); toast('План по шаблону готов');
    if (date === activeDate() && $('#screen-logger').classList.contains('active')) renderLogger(); else renderCalendar();
  }

  /* ---------- info sheet: 1ПМ ---------- */
  function openInfo1rm() {
    openSheet('<p class="eyebrow">Что это</p><h2 style="margin-bottom:10px">Расчётный 1ПМ</h2>' +
      '<p class="muted">Это вес, который ты поднял бы один раз. Приложение считает его по твоим обычным рабочим подходам, поэтому идти на реальный максимум и рисковать не нужно</p>' +
      '<button class="btn" id="info-ok" style="margin-top:16px">Понятно</button>');
    $('#info-ok').onclick = closeSheet;
  }

  /* ---------- check-in sheet ---------- */
  function openCheckin() {
    var existing = S.checkins.filter(function (c) { return c.date === todayStr(); })[0] || { sleep: 7.5, calories: '', stress: 5 };
    openSheet(
      '<p class="eyebrow">Вечерний чек-ин · ' + prettyDate(todayStr()) + '</p>' +
      '<h2>Как прошёл день?</h2>' +
      '<div class="field" style="margin-top:16px"><label>Сон прошлой ночью, часов</label>' +
      '<div class="slider"><input type="range" id="ci-sleep" min="3" max="11" step="0.5" value="' + existing.sleep + '"><span class="sv mono" id="ci-sleep-v">' + existing.sleep + '</span></div></div>' +
      '<div class="field"><label>Уровень стресса сегодня</label>' +
      '<div class="slider"><input type="range" id="ci-stress" min="1" max="10" step="1" value="' + existing.stress + '"><span class="sv mono" id="ci-stress-v">' + existing.stress + '</span></div></div>' +
      '<div class="field"><label>Калории за день <span class="opt">если считаешь</span></label>' +
      '<input class="txt mono" type="number" inputmode="numeric" id="ci-cal" placeholder="напр. 2800" value="' + (existing.calories || '') + '"></div>' +
      '<button class="btn" id="ci-save">Сохранить</button>' +
      '<button class="btn ghost slim" id="ci-cancel" style="margin-top:10px">Отмена</button>');
    $('#ci-sleep').oninput = function () { $('#ci-sleep-v').textContent = this.value; };
    $('#ci-stress').oninput = function () { $('#ci-stress-v').textContent = this.value; };
    $('#ci-cancel').onclick = closeSheet;
    $('#ci-save').onclick = function () {
      var rec = { date: todayStr(), sleep: +$('#ci-sleep').value, stress: +$('#ci-stress').value, calories: $('#ci-cal').value ? +$('#ci-cal').value : null };
      S.checkins = S.checkins.filter(function (c) { return c.date !== todayStr(); });
      S.checkins.push(rec); save(); closeSheet(); toast('Чек-ин записан'); go('today');
    };
  }

  /* ---------- Calendar (бывш. История) ---------- */
  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  function renderCalendar() {
    var box = $('#history-body');
    if (!renderCalendar._month) { var n = new Date(); renderCalendar._month = new Date(n.getFullYear(), n.getMonth(), 1); }
    var m = renderCalendar._month, y = m.getFullYear(), mo = m.getMonth();
    var startIdx = (new Date(y, mo, 1).getDay() + 6) % 7;
    var daysIn = new Date(y, mo + 1, 0).getDate();
    var counts = {}; S.sessions.forEach(function (s) { counts[s.date] = (counts[s.date] || 0) + 1; });

    var cells = '';
    for (var i = 0; i < startIdx; i++) cells += '<div class="cal-day empty"></div>';
    for (var d = 1; d <= daysIn; d++) {
      var ds = y + '-' + p2(mo + 1) + '-' + p2(d);
      var has = counts[ds], planned = !has && planRemaining(ds).length, sel = renderCalendar._sel === ds;
      cells += '<button type="button" class="cal-day' + (has ? ' has' : '') + (planned ? ' planned' : '') + (sel ? ' sel' : '') + '" data-date="' + ds + '">' + d + '</button>';
    }
    box.innerHTML =
      '<div class="card"><div class="cal-head"><button type="button" id="cal-prev">‹</button>' +
      '<b>' + MONTHS[mo] + ' ' + y + '</b><button type="button" id="cal-next">›</button></div>' +
      '<div class="calbox"><div class="cal-dow">' + ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div></div>' +
      '<div class="legend" style="margin-top:12px"><span><i style="background:var(--accent);border-radius:3px;width:14px;height:14px"></i>тренировка</span>' +
      '<span><i style="border:2px solid var(--accent);border-radius:3px;width:14px;height:14px;background:none"></i>план</span></div></div>' +
      '<div id="hist-detail"></div>';
    $('#cal-prev').onclick = function () { renderCalendar._month = new Date(y, mo - 1, 1); renderCalendar(); };
    $('#cal-next').onclick = function () { renderCalendar._month = new Date(y, mo + 1, 1); renderCalendar(); };
    $$('#history-body .cal-day[data-date]').forEach(function (b) { b.onclick = function () { onCalDay(b.dataset.date); }; });
    if (renderCalendar._sel && counts[renderCalendar._sel]) renderDayDetail(renderCalendar._sel);
    else $('#hist-detail').innerHTML = '<p class="empty">Тапни день: с тренировкой — посмотреть, будущий — запланировать, прошлый пустой — записать задним числом</p>';
  }
  function onCalDay(ds) {
    var t = todayStr();
    if (sessionOf(ds)) { renderCalendar._sel = ds; renderCalendar(); return; }   // есть тренировка → детали
    if (ds > t) { openPlanDay(ds); return; }                                     // будущее → планирование
    openDayEmpty(ds);                                                            // прошлое/сегодня пусто → запись задним числом
  }
  function startBackdated(ds) { logDate = (ds === todayStr() ? null : ds); renderCalendar._sel = null; go('logger'); }
  function openDayEmpty(ds) {
    openSheet('<p class="eyebrow">' + prettyDate(ds) + '</p><h2 style="margin-bottom:6px">Нет тренировки в этот день</h2>' +
      '<p class="muted" style="margin:0 0 16px">Можно записать её задним числом</p>' +
      '<button class="btn" id="de-log">Записать тренировку</button>' +
      (S.templates.length ? '<button class="btn ghost slim" id="de-tpl" style="margin-top:10px">Начать по шаблону</button>' : '') +
      '<button class="btn ghost slim" id="de-cancel" style="margin-top:10px">Отмена</button>');
    $('#de-log').onclick = function () { closeSheet(); startBackdated(ds); };
    if ($('#de-tpl')) $('#de-tpl').onclick = function () { chooseTemplate(function (t) { applyTemplateToDate(t, ds); startBackdated(ds); }); };
    $('#de-cancel').onclick = closeSheet;
  }
  function openPlanDay(ds) {
    var plan = planFor(ds); var editing = plan ? { date: ds, items: plan.items.slice() } : { date: ds, items: [] };
    function draw() {
      var itemsHtml = editing.items.length ? editing.items.map(function (it, i) {
        return '<div class="plan-item"><span>' + escapeHtml(it.exercise) + ' <span class="muted">· ' + equipLabel(it.equipment) + '</span></span><button type="button" class="rm" data-i="' + i + '">✕</button></div>';
      }).join('') : '<p class="muted">Пока пусто — добавь упражнения</p>';
      openSheet('<p class="eyebrow">План на ' + prettyDate(ds) + '</p><h2 style="margin-bottom:12px">Запланировать тренировку</h2>' +
        '<div id="pl-items">' + itemsHtml + '</div>' +
        '<button class="btn ghost slim" id="pl-add" style="margin-top:10px">+ Добавить упражнение</button>' +
        (S.templates.length ? '<button class="btn ghost slim" id="pl-tpl" style="margin-top:10px">Взять из шаблона</button>' : '') +
        '<button class="btn" id="pl-save" style="margin-top:14px">Сохранить план</button>' +
        (plan ? '<button class="btn ghost slim" id="pl-del" style="margin-top:10px;color:var(--bad)">Удалить план</button>' : '') +
        '<p class="note-inline">План — это намерение. В тоннаж, прогноз и диагностику он не идёт, только напомнит в этот день</p>');
      $$('#pl-items .rm').forEach(function (b) { b.onclick = function () { editing.items.splice(+b.dataset.i, 1); draw(); }; });
      $('#pl-add').onclick = function () { openExercisePicker(function (name, eq) { editing.items.push({ exercise: name, equipment: eq }); draw(); }); };
      if ($('#pl-tpl')) $('#pl-tpl').onclick = function () { chooseTemplate(function (t) { t.items.forEach(function (it) { editing.items.push({ exercise: it.exercise, equipment: it.equipment, weight: it.weight, reps: it.reps }); }); draw(); }); };
      $('#pl-save').onclick = function () {
        if (!editing.items.length) { toast('Добавь хотя бы одно упражнение'); return; }
        S.plans = S.plans.filter(function (p) { return p.date !== ds; }); S.plans.push(editing); save(); closeSheet(); toast('Запланировано'); renderCalendar();
      };
      if ($('#pl-del')) $('#pl-del').onclick = function () { S.plans = S.plans.filter(function (p) { return p.date !== ds; }); save(); closeSheet(); toast('План удалён'); renderCalendar(); };
    }
    draw();
  }
  function renderDayDetail(ds) {
    var sess = sessionOf(ds);
    var wrap = $('#hist-detail'); if (!sess) { wrap.innerHTML = ''; return; }
    if (renderDayDetail._openDate !== ds) { renderDayDetail._openDate = ds; renderDayDetail._open = {}; }
    var openMap = renderDayDetail._open;

    wrap.innerHTML = '<div class="card"><p class="eyebrow">' + prettyDate(ds) + '</p>' +
      '<div class="statrow" style="margin-bottom:12px">' + stat('Упражнений', groupSets(sess).length) + stat('Подходов', sess.sets.length) + stat('Тоннаж', Math.round(sessionTonnage(sess)) + ' кг') + '</div>' +
      '<p class="note-inline" style="margin:0 0 10px">Тап по упражнению — раскрыть подходы</p>' +
      groupedHtml(sess, openMap) +
      '<div class="hr"></div>' +
      '<button class="btn ghost slim" id="dd-add">+ Добавить упражнение или подход</button>' +
      '<button class="btn ghost slim" id="dd-tpl" style="margin-top:10px">Сохранить как шаблон</button></div>';

    $$('#hist-detail .exhead').forEach(function (b) { b.onclick = function () { var k = b.dataset.ex; openMap[k] = !openMap[k]; renderDayDetail(ds); }; });
    $$('#hist-detail .setrow').forEach(function (b) { b.onclick = function () { openEditSet(b.dataset.sid, +b.dataset.idx, function () { renderDayDetail(ds); }); }; });
    $('#dd-add').onclick = function () { startBackdated(ds); };
    $('#dd-tpl').onclick = function () { openSaveTemplate(sess.sets); };
  }

  /* ---------- Forecast ---------- */
  function renderForecast() {
    var p = S.profile, box = $('#forecast-body');
    var weeks = 12;
    var g = E.forecastGain(p, weeks);
    var cal = E.calorieTarget(p);
    box.innerHTML = '';

    var hero = el('div', 'card');
    hero.innerHTML =
      '<p class="eyebrow">' + SCEN_LABEL[p.scenario] + ' · прогноз на 12 недель</p>' +
      '<div class="corridor-num"><b class="mono">+' + g.low + '–' + g.high + '</b><span class="muted">кг мышц</span></div>' +
      '<p class="muted" style="margin:2px 0 0">Если держать калораж ' + cal.low + '–' + cal.high + ' ккал/день и тренироваться по плану. Это коридор, а не обещание — уточняется по твоим логам</p>';
    box.appendChild(hero);

    var chart = el('div', 'card');
    chart.innerHTML = '<p class="eyebrow">Траектория веса</p><canvas id="fc-canvas" width="960" height="560"></canvas>' +
      '<div class="legend">' +
      '<span><i style="background:var(--accent)"></i>прогноз (коридор)</span>' +
      '<span><i style="background:var(--ink-2)"></i>факт (твой вес)</span>' +
      '<span><i style="background:var(--bad)"></i>если бросишь</span></div>' +
      '<p class="note-inline">Линия «если бросишь» — оценка потери мышц без тренировок.' + (p.wrist ? (' Каркас (запястье/лодыжка) задаёт ширину коридора: у тебя ×' + g.frameFactor) : ' Каркас пока не указан — коридор по среднему') + '</p>';
    box.appendChild(chart);

    var calCard = el('div', 'card');
    calCard.innerHTML = '<p class="eyebrow">Калораж под цель</p>' +
      '<div class="statrow">' + stat('Поддержка', cal.tdee + '') + stat('Твоя цель', cal.low + '–' + cal.high) + '</div>' +
      '<p class="note-inline">Оценка по Mifflin-St Jeor. Взвешивайся раз в 2 недели — приложение подстроит коридор под факт</p>';
    box.appendChild(calCard);

    if (!p.wrist) {
      var fr = el('div', 'card');
      fr.innerHTML = '<p class="eyebrow">Каркас не указан</p><p class="muted" style="margin:0 0 12px">Коридор прогноза сейчас по среднему. Замерь запястье и лодыжку — и он подстроится под твой скелет</p>';
      var frb = el('button', 'btn ghost slim', 'Указать каркас');
      frb.onclick = openFrameSheet;
      fr.appendChild(frb);
      box.appendChild(fr);
    }

    drawForecast($('#fc-canvas'), p, weeks);
  }
  function openFrameSheet() {
    var p = S.profile;
    openSheet('<p class="eyebrow">Каркас</p><h2 style="margin-bottom:6px">Запястье и лодыжка</h2>' +
      '<p class="muted" style="margin:0 0 6px">Кость почти без мышц и жира — она задаёт ширину прогноза</p>' +
      '<p class="note-inline">Мерь сантиметром в самом узком месте</p>' +
      '<div class="grid2" style="margin-top:14px">' + numField('f_wrist', 'Запястье, см', p.wrist || 17) + numField('f_ankle', 'Лодыжка, см', p.ankle || 22) + '</div>' +
      '<button class="btn" id="fr-save">Сохранить</button>' +
      '<button class="btn ghost slim" id="fr-cancel" style="margin-top:10px">Отмена</button>');
    $('#fr-save').onclick = function () {
      p.wrist = +$('[data-num="f_wrist"]').value; p.ankle = +$('[data-num="f_ankle"]').value;
      save(); closeSheet(); toast('Каркас учтён'); renderForecast();
    };
    $('#fr-cancel').onclick = closeSheet;
  }
  function drawForecast(cv, p, weeks) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    var padL = 64, padR = 24, padT = 24, padB = 48;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    ctx.clearRect(0, 0, W, H);
    var start = p.weight;
    var g = E.forecastGain(p, weeks);
    var maxUp = start + g.high + 1, maxDown = start - E.detrainLoss(p.weight, weeks) - 1;
    var actual = S.weighins.map(function (w) { return { wk: daysBetween(p.createdAt, w.date) / 7, val: w.weight }; })
      .filter(function (a) { return a.wk >= 0 && a.wk <= weeks; });
    actual.forEach(function (a) { if (a.val > maxUp) maxUp = a.val + 1; if (a.val < maxDown) maxDown = a.val - 1; });
    var yMin = Math.floor(maxDown), yMax = Math.ceil(maxUp);
    function X(wk) { return padL + plotW * wk / weeks; }
    function Y(v) { return padT + plotH * (yMax - v) / (yMax - yMin); }

    ctx.font = '20px -apple-system, system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
    var stepY = Math.max(1, Math.round((yMax - yMin) / 5));
    for (var v = yMin; v <= yMax; v += stepY) {
      var y = Y(v); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v + '', padL - 10, y + 6);
    }
    ctx.textAlign = 'center';
    [0, 4, 8, 12].forEach(function (wk) { ctx.fillText('нед ' + wk, X(wk), H - 16); });

    ctx.beginPath();
    for (var wk = 0; wk <= weeks; wk++) { var hi = start + E.forecastGain(p, wk).high; (wk === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, X(wk), Y(hi)); }
    for (var wk2 = weeks; wk2 >= 0; wk2--) { var lo = start + E.forecastGain(p, wk2).low; ctx.lineTo(X(wk2), Y(lo)); }
    ctx.closePath(); ctx.fillStyle = 'rgba(205,255,61,.16)'; ctx.fill();
    ctx.strokeStyle = '#cdff3d'; ctx.lineWidth = 3; ctx.beginPath();
    for (var wk3 = 0; wk3 <= weeks; wk3++) { var fg = E.forecastGain(p, wk3); var mid = start + (fg.low + fg.high) / 2; (wk3 === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, X(wk3), Y(mid)); }
    ctx.stroke();

    ctx.strokeStyle = '#ff5c47'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 7]); ctx.beginPath();
    for (var wk4 = 0; wk4 <= weeks; wk4++) { var q = start - E.detrainLoss(p.weight, wk4); (wk4 === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, X(wk4), Y(q)); }
    ctx.stroke(); ctx.setLineDash([]);

    if (actual.length) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2.5; ctx.setLineDash([3, 5]); ctx.beginPath();
      actual.forEach(function (a, i) { (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, X(a.wk), Y(a.val)); });
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#f2f3f1';
      actual.forEach(function (a) { ctx.beginPath(); ctx.arc(X(a.wk), Y(a.val), 5, 0, 7); ctx.fill(); });
    }
  }

  /* ---------- Diagnosis ---------- */
  function renderDiagnosis() {
    var box = $('#diagnosis-body');
    var exs = uniqueExercises();
    if (!exs.length) {
      box.innerHTML = '<div class="empty"><p>Пока нечего анализировать.<br>Залогируй пару тренировок или загрузи пример на вкладке «Сегодня».</p></div>';
      return;
    }
    var chosen = renderDiagnosis._ex && exs.indexOf(renderDiagnosis._ex) >= 0 ? renderDiagnosis._ex : exs[0];
    box.innerHTML = '<div class="field"><label>Упражнение</label>' +
      '<div class="chips" id="dg-ex">' + exs.map(function (e) { return '<button class="chip" data-val="' + escapeHtml(e) + '" aria-pressed="' + (e === chosen) + '">' + escapeHtml(e) + '</button>'; }).join('') + '</div></div>' +
      '<div id="dg-result"></div>';
    $$('#dg-ex .chip').forEach(function (c) { c.onclick = function () { renderDiagnosis._ex = c.dataset.val; renderDiagnosis(); }; });
    diagnose(chosen, $('#dg-result'));
  }
  function uniqueExercises() {
    var seen = {}, out = [];
    S.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (s) { s.sets.forEach(function (x) { if (x.reps > 0 && !seen[x.exercise]) { seen[x.exercise] = 1; out.push(x.exercise); } }); });
    return out;
  }
  function seriesFor(name) {
    return S.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (s) {
      var best = bestE1rmOf(s.sets.filter(function (x) { return x.exercise === name; }));
      return best == null ? null : { date: s.date, e1rm: best };
    }).filter(Boolean);
  }
  function diagnose(name, box) {
    var series = seriesFor(name);
    if (series.length < 2) { box.innerHTML = '<div class="card"><p class="muted" style="margin:0">Нужно минимум 2 тренировки с «' + escapeHtml(name) + '», чтобы оценить тренд. Пока просто продолжай логировать.</p></div>'; return; }
    var first = series[0], last = series[series.length - 1];
    var span = Math.max(1, daysBetween(first.date, last.date));
    var weeksSpan = span / 7;
    var delta = E.round(last.e1rm - first.e1rm, 1);
    var perWeek = E.round(delta / weeksSpan, 2);

    var recentSets = [];
    S.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-3).forEach(function (s) { s.sets.forEach(function (x) { if (x.exercise === name) recentSets.push(x); }); });
    var reds = recentSets.filter(function (x) { return x.rpe === 'r'; }).length;
    var recentChecks = S.checkins.slice(-7);
    var avgSleep = avg(recentChecks.map(function (c) { return c.sleep; }));
    var avgStress = avg(recentChecks.map(function (c) { return c.stress; }));

    var verdict, cls, why, action, dispName = escapeHtml(name);
    if (perWeek > 0.4) {
      verdict = dispName + ' растёт — держи курс'; cls = 'good';
      why = 'Расчётный 1ПМ прибавил +' + delta + ' кг за ' + Math.round(weeksSpan) + ' нед (' + perWeek + ' кг/нед). Это в рамках нормального прогресса.';
      action = 'Ничего не меняй. Продолжай добавлять понемногу вес или повторы.';
    } else if (perWeek >= 0.05) {
      verdict = dispName + ' растёт медленно'; cls = 'warn';
      why = 'Прибавка всего +' + delta + ' кг за ' + Math.round(weeksSpan) + ' нед. Движение есть, но вялое.';
      action = 'Проверь калораж и сон. Если цель — масса, скорее всего недобираешь по еде.';
    } else {
      verdict = dispName + ' стоит на месте'; cls = 'bad';
      why = 'За ' + Math.round(weeksSpan) + ' нед расчётный 1ПМ почти не сдвинулся (' + (delta >= 0 ? '+' : '') + delta + ' кг). Это плато.';
      action = 'Смени схему повторов или дай упражнению неделю разгрузки, затем зайди заново.';
    }
    var extra = [];
    if (avgSleep != null && avgSleep < 6.5) extra.push('сон в среднем ' + fmt(avgSleep) + ' ч — маловато для восстановления');
    if (avgStress != null && avgStress >= 7) extra.push('высокий стресс (' + fmt(avgStress) + '/10) бьёт по прогрессу');
    if (reds >= 2) extra.push('последние подходы всё чаще на «красный» — работаешь на пределе');
    if (extra.length && cls !== 'good') why += ' Вероятная причина: ' + extra.join('; ') + '.';

    var colorStrip = recentSets.slice(-14).map(function (x) {
      var c = x.rpe === 'g' ? 'var(--good)' : x.rpe === 'y' ? 'var(--warn)' : x.rpe === 'r' ? 'var(--bad)' : 'var(--line-2)';
      return '<i style="background:' + c + '"></i>';
    }).join('');

    box.innerHTML =
      '<div class="card">' +
      '<span class="pill ' + cls + '">' + (cls === 'good' ? 'прогресс' : cls === 'warn' ? 'вялый рост' : 'плато') + '</span>' +
      '<div class="verdict" style="margin-top:12px"><h3>' + verdict + '</h3><p class="muted" style="margin:0">' + why + '</p></div>' +
      '<div class="evidence"><div class="lbl">Улики — расчётный 1ПМ <button type="button" class="info-i" id="dg-info">i</button></div>' +
      '<div class="mono">' + first.e1rm + ' кг → ' + last.e1rm + ' кг за ' + Math.round(weeksSpan) + ' нед</div></div>' +
      (colorStrip ? '<div class="evidence"><div class="lbl">Как давались подходы (свежие → )</div><div class="colorstrip">' + colorStrip + '</div></div>' : '') +
      (recentChecks.length ? '<div class="evidence"><div class="lbl">Образ жизни (7 дней)</div><div class="mono">сон ' + (avgSleep != null ? fmt(avgSleep) + ' ч' : '—') + ' · стресс ' + (avgStress != null ? fmt(avgStress) + '/10' : '—') + '</div></div>' : '') +
      '<div class="action"><b>Что сделать:</b> ' + action + '</div>' +
      '</div>';
    var ii = $('#dg-info', box); if (ii) ii.onclick = openInfo1rm;
  }
  function avg(arr) { arr = arr.filter(function (x) { return typeof x === 'number'; }); return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; }

  /* ---------- demo seed ---------- */
  function seedDemo() {
    var p = S.profile;
    var base = new Date(); base.setDate(base.getDate() - 42);
    function d(offset) { var x = new Date(base); x.setDate(x.getDate() + offset); return x.toISOString().slice(0, 10); }
    S.sessions = []; S.checkins = []; S.weighins = [{ date: d(0), weight: p.weight }];
    var benchStart = 60, squatStart = 90;
    for (var w = 0; w < 6; w++) {
      var day = d(w * 7);
      var bench = w < 3 ? benchStart + w * 2.5 : benchStart + 5;
      var squat = squatStart + w * 5;
      var rpe = w < 3 ? 'y' : (w < 5 ? 'y' : 'r');
      S.sessions.push({
        id: 'demo-' + w, date: day, sets: [
          { exercise: 'Жим лёжа', equipment: 'barbell', weight: bench, reps: 5, rpe: rpe, note: w >= 4 ? 'тяжело, подстраховали' : '', ts: w },
          { exercise: 'Жим лёжа', equipment: 'barbell', weight: bench, reps: w < 3 ? 5 : 4, rpe: w < 3 ? 'y' : 'r', note: '', ts: w + 0.1 },
          { exercise: 'Присед', equipment: 'barbell', weight: squat, reps: 5, rpe: 'y', note: '', ts: w + 0.2 }
        ]
      });
      S.checkins.push({ date: day, sleep: w < 3 ? 7.5 : 6, stress: w < 3 ? 4 : 8, calories: 2600 });
      if (w % 2 === 0) S.weighins.push({ date: day, weight: E.round(p.weight + w * 0.15, 1) });
    }
    save();
  }

  /* ---------- misc ---------- */
  function prettyDate(s) { var m = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']; var dt = new Date(s); return dt.getDate() + ' ' + m[dt.getMonth()]; }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  /* ---------- boot ---------- */
  function boot() {
    if (!S.profile) { $('#screen-onboarding').classList.add('active'); $('.tabbar').style.display = 'none'; startOnboarding(); }
    else { $('.tabbar').style.display = 'flex'; }
  }
  $$('.tab[data-go]').forEach(function (t) { t.onclick = function () { if (t.dataset.go === 'logger') logDate = null; go(t.dataset.go); }; });
  $('#sheet-bg').onclick = function (e) { if (e.target === $('#sheet-bg')) closeSheet(); };
  boot();
  if (S.profile) go('today');

  window.__ft = { reset: function () { localStorage.removeItem(KEY); location.reload(); }, state: function () { return S; } };
})();
