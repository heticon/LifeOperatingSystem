/* Life OS — Helpers, dates (ISO weeks), Store (the single data seam), task data.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

/* =========================================================
   Допоміжне
   ========================================================= */
var $ = function (id) { return document.getElementById(id); };
var LOCALE = "en-GB";
// EMBED: this copy runs inside the right-hand pane of split view (no sidebar, no sync — the main window syncs)
var EMBED = /[?&]pane=1\b/.test(location.search);
if (EMBED) document.documentElement.classList.add("embed");
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function icon(name, cls) { return '<svg class="ic' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function plural(n, one, many) { return n === 1 ? one : many; }
function ls(key, val) {
  try {
    if (val === undefined) { var v = localStorage.getItem(key); return v == null ? null : JSON.parse(v); }
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { return null; }
}

/* =========================================================
   Дати й тижні (ISO 8601: тиждень з понеділка, як у Німеччині)
   ========================================================= */
function isoWeek(d) {
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t - y0) / 86400000 + 1) / 7), year: t.getUTCFullYear() };
}
function weeksInYear(y) { return isoWeek(new Date(y, 11, 28)).week; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
function mondayOf(d) { var x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); }
function weekKey(d) { var w = isoWeek(d); return w.year + "-W" + pad(w.week); }
function weekNumOfKey(k) { return k ? parseInt(k.split("-W")[1], 10) : null; }
function todayIdx() { return (new Date().getDay() + 6) % 7; } // 0 = понеділок

var fmtWeekday = new Intl.DateTimeFormat(LOCALE, { weekday: "long" });
var fmtWdShort = new Intl.DateTimeFormat(LOCALE, { weekday: "short" });
var fmtDayMonth = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long" });
var fmtDayMonShort = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" });
var fmtDate = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric" });
var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
var DAYS_S = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function longDate(d) {
  var p = {}; fmtDate.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
  return p.day + " " + p.month + " " + p.year;
}
function weekRange(mon) {
  var sun = addDays(mon, 6);
  return mon.getMonth() === sun.getMonth()
    ? mon.getDate() + "–" + fmtDayMonth.format(sun)
    : fmtDayMonth.format(mon) + " – " + fmtDayMonth.format(sun);
}
function hhmm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

/* =========================================================
   Дані
   ========================================================= */
// Store — єдине місце, через яке проходять дані. localStorage = офлайн-кеш;
// кожне save() повідомляє sync.js, а той відправляє зміни в акаунт (Supabase).
var Store = {
  KEY: "lifeos.data",
  data: { version: 1, tasks: [], projects: [], school: null, focusLog: [], other: {} },
  load: function () {
    var d = ls(this.KEY);
    if (d && Array.isArray(d.tasks)) {
      this.data = { version: 1, tasks: d.tasks, projects: d.projects || [], school: d.school || null,
        focusLog: d.focusLog || [], other: d.other || {} };
    }
  },
  save: function () { ls(this.KEY, this.data); if (window.LifeSync) window.LifeSync.changed(); },
  // дані → окремі записи {id: {k: kind, d: data}} (по одному рядку в таблиці items)
  records: function () {
    var d = this.data, r = {};
    d.tasks.forEach(function (x) { r[x.id] = { k: "task", d: x }; });
    d.projects.forEach(function (x) { r[x.id] = { k: "project", d: x }; });
    if (d.school) {
      // pos — порядок предметів у меню (у предметів немає createdAt), щоб новий пристрій показав їх так само
      (d.school.subjects || []).forEach(function (x, i) { if (x.pos !== i) x.pos = i; r[x.id] = { k: "subject", d: x }; });
      (d.school.homework || []).forEach(function (x) { r[x.id] = { k: "homework", d: x }; });
      (d.school.notes || []).forEach(function (x) { r[x.id] = { k: "note", d: x }; });
      if (d.school.timetable) r.timetable = { k: "timetable", d: { days: d.school.timetable } };
    }
    d.focusLog.forEach(function (x) { r["f" + x.at] = { k: "focus", d: x }; });
    // записи, яких ця версія застосунку ще не знає (напр. події календаря) — зберігаємо як є
    Object.keys(d.other || {}).forEach(function (id) { if (!r[id]) r[id] = d.other[id]; });
    return r;
  },
  // записи → дані; порядок списків зберігаємо як був, нові записи — в кінець
  fromRecords: function (map, prev) {
    function list(prevList, kind, key) {
      var out = [], seen = {};
      (prevList || []).forEach(function (x) { var e = map[x.id]; if (e && e.k === kind) { out.push(e.d); seen[x.id] = 1; } });
      var extra = Object.keys(map).filter(function (id) { return map[id].k === kind && !seen[id]; })
        .map(function (id) { return map[id].d; });
      extra.sort(function (a, b) { return (a[key] || 0) - (b[key] || 0); });
      return out.concat(extra);
    }
    var ps = prev.school || {}, known = { task: 1, project: 1, subject: 1, homework: 1, note: 1, timetable: 1, focus: 1 };
    var d = { version: 1, tasks: list(prev.tasks, "task", "createdAt"), projects: list(prev.projects, "project", "createdAt"),
      school: null, focusLog: [], other: {} };
    var subs = list(ps.subjects, "subject", "pos"), tt = map.timetable && map.timetable.k === "timetable" ? map.timetable.d.days : null;
    if (subs.length || tt) {
      d.school = { subjects: subs, timetable: tt || [0, 1, 2, 3, 4].map(function () { return { start: "08:00", end: "13:00", items: [] }; }),
        homework: list(ps.homework, "homework", "createdAt"), notes: list(ps.notes, "note", "createdAt") };
    }
    Object.keys(map).forEach(function (id) {
      var e = map[id];
      if (e.k === "focus") d.focusLog.push(e.d);
      else if (!known[e.k]) d.other[id] = e;
    });
    d.focusLog.sort(function (a, b) { return a.at - b.at; });
    return d;
  }
};
Store.load();

function tasks() { return Store.data.tasks; }
function projects() { return Store.data.projects; }
function taskById(id) { return tasks().find(function (t) { return t.id === id; }); }
// project tasks show in To-dos only when added there (todo: true)
function inTodos(t) { return !t.projectId || !!t.todo; }
function projectById(id) { return projects().find(function (p) { return p.id === id; }); }

function addTask(title, extra) {
  title = title.trim(); if (!title) return null;
  var t = { id: uid(), title: title, done: false, doneAt: null, createdAt: Date.now(),
    projectId: null, week: null, day: null, notes: "" };
  Object.keys(extra || {}).forEach(function (k) { t[k] = extra[k]; });
  tasks().push(t); Store.save(); return t;
}
function updateTask(id, patch) {
  var t = taskById(id); if (!t) return;
  Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
  if ("done" in patch) t.doneAt = patch.done ? Date.now() : null;
  Store.save();
}
function deleteTask(id) { Store.data.tasks = tasks().filter(function (t) { return t.id !== id; }); Store.save(); }
function addProject(name) {
  name = name.trim(); if (!name) return null;
  var p = { id: uid(), name: name, createdAt: Date.now() };
  projects().push(p); Store.save(); return p;
}
function deleteProject(id) {
  tasks().forEach(function (t) { if (t.projectId === id) t.projectId = null; });
  Store.data.projects = projects().filter(function (p) { return p.id !== id; });
  Store.save();
}
