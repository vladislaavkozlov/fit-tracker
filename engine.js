/*
 * engine.js — научная база фит-трекера в коде.
 * Источник формул: specs/2026-07-04-fit-tracker-nauchnaya-baza.md.
 * ПРАВИЛО: числа не выдумываем. Твёрдые формулы — 1ПМ (Epley/Brzycki), темпы Арагона,
 * калораж (Mifflin-St Jeor). Каркас (Casey Butt) и детренинг — ПОМЕЧЕННЫЕ оценки, не точные.
 */
(function (global) {
  'use strict';

  function round(x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; }

  // --- 1ПМ из объёма (научная-база п.1). reps<=0 => попытка (null, в прогресс НЕ идёт). ---
  function e1rm(weight, reps) {
    weight = +weight; reps = +reps;
    if (!(weight > 0) || !(reps > 0)) return null;      // «65×0» = попытка, не результат
    var epley = weight * (1 + reps / 30);
    var brz = reps < 37 ? weight * 36 / (37 - reps) : epley;
    return round((epley + brz) / 2, 1);
  }

  // Суммарный тоннаж подходов (попытки с 0 повторов не считаются).
  function tonnage(sets) {
    return (sets || []).reduce(function (s, x) {
      return s + (x.reps > 0 ? (+x.weight) * (+x.reps) : 0);
    }, 0);
  }

  // Лучший расчётный 1ПМ среди подходов.
  function bestE1rm(sets) {
    var best = null;
    (sets || []).forEach(function (x) {
      var v = e1rm(x.weight, x.reps);
      if (v != null && (best == null || v > best)) best = v;
    });
    return best;
  }

  // --- Темпы набора мышц по стажу (научная-база п.2), % массы тела в месяц. Женщины ~половина. ---
  var ARAGON = { beginner: [1.0, 1.5], intermediate: [0.5, 1.0], advanced: [0.25, 0.5] };
  function monthlyRange(experience, sex) {
    var r = ARAGON[experience] || ARAGON.intermediate;
    if (sex === 'f') r = [r[0] / 2, r[1] / 2];
    return r.slice();
  }

  // --- Каркас (научная-база п.3). ОЦЕНКА, не точная формула Casey Butt LBM.
  // Модулирует верх коридора ±~15% по относительной толщине кости. ---
  function frameFactor(wrist, ankle, height) {
    wrist = +wrist; ankle = +ankle; height = +height;
    if (!(wrist > 0) || !(ankle > 0) || !(height > 0)) return 1;
    var idx = (wrist + ankle) / height;   // типично ~0.22..0.28 (см/см)
    var f = 1 + (idx - 0.25) * 1.6;
    return Math.max(0.85, Math.min(1.15, round(f, 3)));
  }

  var WEEKS_PER_MONTH = 4.345;

  // Прогноз прибавки мышц вперёд: коридор [low, high] кг за weeks недель (научная-база пп.2-3).
  function forecastGain(p, weeks) {
    var r = monthlyRange(p.experience, p.sex);
    var ff = frameFactor(p.wrist, p.ankle, p.height);
    var perWeekLow = p.weight * (r[0] / 100) / WEEKS_PER_MONTH;
    var perWeekHigh = p.weight * (r[1] / 100) / WEEKS_PER_MONTH * ff;
    return { low: round(perWeekLow * weeks, 2), high: round(perWeekHigh * weeks, 2), frameFactor: ff };
  }

  // Линия «если бросишь» (научная-база: помечено как ОЦЕНКА-иллюстрация, точной скорости детренинга в базе нет).
  // Грубо: первые ~2 недели удержание, дальше медленная потеря. Возвращает кг ПОТЕРЯНО к неделе.
  function detrainLoss(weight, weeks) {
    var start = 2;
    var w = Math.max(0, weeks - start);
    return round(weight * 0.001 * w, 2);   // ~0.1% массы/нед после паузы — ИЛЛЮСТРАЦИЯ, уточнить ресёрчем
  }

  // --- Калораж под сценарий (научная-база п.4.5: Mifflin-St Jeor + активность + цель) ---
  function bmr(p) {
    var base = 10 * (+p.weight) + 6.25 * (+p.height) - 5 * (+p.age);
    return base + (p.sex === 'f' ? -161 : 5);
  }
  var ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 };
  var SCENARIO = { mass: [0.10, 0.15], lean: [0.05, 0.10], recomp: [-0.02, 0.02], cut: [-0.20, -0.15] };
  function calorieTarget(p) {
    var tdee = bmr(p) * (ACTIVITY[p.activity] || 1.375);
    var s = SCENARIO[p.scenario] || SCENARIO.recomp;
    var lo = tdee * (1 + s[0]), hi = tdee * (1 + s[1]);
    function r10(x) { return Math.round(x / 10) * 10; }
    return { low: r10(Math.min(lo, hi)), high: r10(Math.max(lo, hi)), tdee: Math.round(tdee) };
  }

  var Engine = {
    round: round, e1rm: e1rm, tonnage: tonnage, bestE1rm: bestE1rm,
    monthlyRange: monthlyRange, frameFactor: frameFactor,
    forecastGain: forecastGain, detrainLoss: detrainLoss,
    bmr: bmr, calorieTarget: calorieTarget
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else global.Engine = Engine;
})(typeof window !== 'undefined' ? window : this);
