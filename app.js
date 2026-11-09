/* Life OS — логіка програми.
   Розділи: Головна (годинник, дата, тиждень, погода) і Tasks (To-dos, This week, Проєкти).
   Дані поки лежать у браузері (localStorage). Весь доступ до даних іде через Store —
   пізніше саме його замінимо на базу даних із синхронізацією.                          */

(function () {
  "use strict";

  /* =========================================================
     Допоміжне
     ========================================================= */
  var $ = function (id) { return document.getElementById(id); };
  var LOCALE = "en-GB";
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
  var Store = {
    KEY: "lifeos.data",
    data: { version: 1, tasks: [], projects: [], school: null, focusLog: [] },
    load: function () {
      var d = ls(this.KEY);
      if (d && Array.isArray(d.tasks)) {
        this.data = { version: 1, tasks: d.tasks, projects: d.projects || [], school: d.school || null, focusLog: d.focusLog || [] };
      }
    },
    save: function () { ls(this.KEY, this.data); }
  };
  Store.load();

  function tasks() { return Store.data.tasks; }
  function projects() { return Store.data.projects; }
  function taskById(id) { return tasks().find(function (t) { return t.id === id; }); }
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

  /* =========================================================
     Стан інтерфейсу
     ========================================================= */
  var ui = {
    route: { name: "home", id: null },
    selected: null,          // відкрита задача
    weekOffset: 0,           // 0 = цей тиждень
    showDone: {},            // розгорнуті «Виконано» по сторінках
    refocus: null,           // яке поле знову сфокусувати після перемальовування
    addingGroup: null,       // в який день тижня зараз додаємо задачу
    selKind: "task",         // що відкрито в панелі: задача чи домашка
    hwSubject: null,         // останній вибраний предмет для домашки
    ttEdit: false,           // режим редагування розкладу
    ttNew: null              // в який день додаємо новий предмет
  };
  var app = $("app");
  var isNarrow = function () { return window.matchMedia("(max-width: 860px)").matches; };

  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (h === "todos" || h === "week" || h === "home" || h === "tasks" || h === "school" || h === "focus") return { name: h, id: null };
    if (h.indexOf("project-") === 0) return { name: "project", id: h.slice(8) };
    if (h === "timetable" || h === "homework") return { name: h, id: null };
    if (h.indexOf("subject-") === 0) return { name: "subject", id: h.slice(8) };
    if (h.indexOf("note-") === 0) return { name: "note", id: h.slice(5) };
    return { name: "home", id: null };
  }

  /* =========================================================
     Бокова панель
     ========================================================= */
  function renderSidebar() {
    var r = ui.route;
    document.querySelectorAll("#sideNav .nav-item[data-route]").forEach(function (a) {
      var on = a.getAttribute("data-route") === r.name;
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var open = tasks().filter(function (t) { return !t.done; });
    var cw = weekKey(new Date());
    $("cntTodos").textContent = open.length || "";
    var wk = open.filter(function (t) { return t.week === cw; }).length;
    $("cntWeek").textContent = wk || "";

    var list = $("projectList");
    if (!projects().length) {
      list.innerHTML = '<div class="side-empty">None yet</div>';
    } else {
      list.innerHTML = projects().map(function (p) {
        var c = open.filter(function (t) { return t.projectId === p.id; }).length;
        var cur = r.name === "project" && r.id === p.id;
        return '<a class="nav-item project" href="#project-' + p.id + '"' + (cur ? ' aria-current="page"' : "") + ">" +
          icon("folder") + "<span>" + esc(p.name) + '</span><span class="count">' + (c || "") + "</span></a>";
      }).join("");
    }
    renderSchoolSidebar();
  }

  function setSidebar(open) {
    if (isNarrow()) {
      app.classList.toggle("side-open", open);
      app.classList.remove("side-closed");
      updateScrim();
    } else {
      app.classList.toggle("side-closed", !open);
      ls("lifeos.sideClosed", !open);
    }
  }
  function sidebarIsOpen() { return isNarrow() ? app.classList.contains("side-open") : !app.classList.contains("side-closed"); }
  function updateScrim() {
    var apple = document.documentElement.dataset.layout !== "obsidian";
    var need = (isNarrow() && app.classList.contains("side-open")) || (!!ui.selected && (isNarrow() || apple));
    $("scrim").hidden = !need;
  }

  $("sideToggle").addEventListener("click", function () { setSidebar(true); });
  $("sideCollapse").addEventListener("click", function () { setSidebar(false); });
  $("scrim").addEventListener("click", function () {
    if (app.classList.contains("side-open")) setSidebar(false);
    else if (ui.selected) closeDetail();
  });
  $("sideNav").addEventListener("click", function (e) {
    if (e.target.closest("a.nav-item") && isNarrow()) setSidebar(false);
  });

  // групи в меню, які можна згорнути
  function collapsible(head, body, key, def) {
    var saved = ls(key), collapsed = saved == null ? def : saved === true;
    function apply() { head.setAttribute("aria-expanded", String(!collapsed)); body.hidden = collapsed; }
    apply();
    head.addEventListener("click", function () { collapsed = !collapsed; ls(key, collapsed); apply(); });
  }
  collapsible(document.querySelector("#grpTasks .group-head"), $("grpTasksBody"), "lifeos.tasksCollapsed", false);
  collapsible(document.querySelector("#grpSchool .group-head"), $("grpSchoolBody"), "lifeos.schoolCollapsed", false);
  collapsible($("subjToggle"), $("subjectList"), "lifeos.subjectsCollapsed", false);

  // новий проєкт
  $("newProjectBtn").addEventListener("click", function () {
    var f = $("newProjectForm"); f.hidden = false; $("newProjectInput").value = ""; $("newProjectInput").focus();
  });
  $("newProjectForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var p = addProject($("newProjectInput").value);
    $("newProjectForm").hidden = true;
    if (p) { if (isNarrow()) setSidebar(false); location.hash = "project-" + p.id; }
  });
  $("newProjectInput").addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); $("newProjectForm").hidden = true; } });
  $("newProjectInput").addEventListener("blur", function () {
    setTimeout(function () { if (!$("newProjectInput").value.trim()) $("newProjectForm").hidden = true; }, 120);
  });

  /* =========================================================
     Заголовок і рядок стану
     ========================================================= */
  function renderCrumbs() {
    var r = ui.route, c = $("crumbs"), sep = icon("chevron-right", "sep");
    if (r.name === "home") c.innerHTML = '<span class="cur">Home</span>';
    else if (r.name === "tasks") c.innerHTML = '<span class="cur">Tasks</span>';
    else if (r.name === "focus") c.innerHTML = '<span class="cur">Focus</span>';
    else if (["school", "timetable", "homework", "subject", "note"].indexOf(r.name) >= 0) c.innerHTML = schoolCrumbs(sep);
    else {
      var cur = r.name === "todos" ? "To-dos" : r.name === "week" ? "This week" : esc((projectById(r.id) || {}).name || "Project");
      var mid = r.name === "project" ? '<span>Projects</span>' + sep : "";
      c.innerHTML = '<a href="#todos">Tasks</a>' + sep + mid + '<span class="cur">' + cur + "</span>";
    }
  }
  function renderStatus() {
    var now = new Date();
    $("status").innerHTML = "<span>" + cap(fmtWdShort.format(now)) + ", " + fmtDayMonShort.format(now) + "</span>" +
      "<span>" + hhmm(now) + "</span><span>Week " + isoWeek(now).week + "</span>";
  }

  /* =========================================================
     Головна
     ========================================================= */
  // Home: date, clock, and week + weather beside the clock (under it on phones)
  function renderHome() {
    $("headActions").innerHTML = "";
    var date = '<div class="today-line"><span class="wd" id="wd"></span><span class="dt" id="dt"></span></div>';
    var clock = '<div class="clock" aria-label="Time"><span class="hm" id="hm"></span><span class="sec" id="sec"></span></div>';
    var meta = '<div class="clock-meta">' +
        '<div class="cm"><svg class="ic" aria-hidden="true"><use href="#i-calendar-days"/></svg><span id="factWeek"></span></div>' +
        '<div class="cm"><svg class="ic" aria-hidden="true"><use id="factWxIc" href="#i-cloud"/></svg><span id="factWx">Loading weather…</span></div>' +
      "</div>";
    $("view").innerHTML =
      '<div class="page home home-side">' + date + '<div class="clock-row">' + clock + meta + "</div>" +
        '<div class="hprops">' +
          '<div class="hp"><span class="hk">' + icon("calendar-clock") + 'School</span><span class="hv">' + schoolFact() + "</span></div>" +
          '<div class="hp"><span class="hk">' + icon("notebook-pen") + 'Homework</span><span class="hv">' + hwFact() + "</span></div>" +
          focusFact() +
        "</div>" +
      "</div>";
    tickHome(true);
    paintWeather();
  }

  var lastDay = "";
  function tickHome(force) {
    var now = new Date();
    if (!$("hm")) return;
    $("hm").textContent = pad(now.getHours()) + ":" + pad(now.getMinutes());
    $("sec").textContent = ":" + pad(now.getSeconds());
    var dk = now.toDateString();
    if (force || dk !== lastDay) {
      lastDay = dk;
      $("wd").textContent = cap(fmtWeekday.format(now));
      $("dt").textContent = longDate(now);
      var w = isoWeek(now);
      $("factWeek").innerHTML = "Week <b>" + w.week + '</b><span class="cm-sub"> of ' + weeksInYear(w.year) + " · " + weekRange(mondayOf(now)) + "</span>";
    }
  }

  function tick() {
    var now = new Date();
    tickHome(false);
    focusTick();
    if (now.getSeconds() === 0) {
      renderStatus();
      if (now.getHours() === 0 && now.getMinutes() === 0) renderAll(); // новий день
    }
    setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }

  /* ---------- погода (Open-Meteo, без ключа) ---------- */
  var HAMBURG = { lat: 53.5511, lon: 9.9937, tz: "Europe/Berlin" };
  var WMO = {
    0: ["Clear", "sun"], 1: ["Mostly clear", "sun"], 2: ["Partly cloudy", "cloud-sun"], 3: ["Cloudy", "cloud"],
    45: ["Fog", "cloud-fog"], 48: ["Freezing fog", "cloud-fog"],
    51: ["Light drizzle", "cloud-drizzle"], 53: ["Drizzle", "cloud-drizzle"], 55: ["Heavy drizzle", "cloud-drizzle"],
    56: ["Freezing drizzle", "cloud-drizzle"], 57: ["Freezing drizzle", "cloud-drizzle"],
    61: ["Light rain", "cloud-rain"], 63: ["Rain", "cloud-rain"], 65: ["Heavy rain", "cloud-rain"],
    66: ["Freezing rain", "cloud-rain"], 67: ["Freezing rain", "cloud-rain"],
    71: ["Light snow", "cloud-snow"], 73: ["Snow", "cloud-snow"], 75: ["Heavy snow", "cloud-snow"], 77: ["Snow grains", "cloud-snow"],
    80: ["Rain showers", "cloud-rain"], 81: ["Showers", "cloud-rain"], 82: ["Heavy showers", "cloud-rain"],
    85: ["Snow showers", "cloud-snow"], 86: ["Heavy snow showers", "cloud-snow"],
    95: ["Thunderstorm", "cloud-lightning"], 96: ["Thunderstorm with hail", "cloud-lightning"], 99: ["Thunderstorm with hail", "cloud-lightning"]
  };
  var WX_KEY = "lifeos.weather", WX_AGE = 30 * 60 * 1000;
  var wx = { data: null, error: false };

  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function paintWeather() {
    var el = $("factWx"); if (!el) return;
    var w = wx.data;
    if (!w) {
      el.textContent = wx.error ? "Weather unavailable" : "Loading weather…";
      return;
    }
    var info = WMO[w.code] || ["—", "cloud"];
    var sub = [Math.round(w.min) + "° / " + Math.round(w.max) + "°"];
    if (w.rain != null) sub.push(w.rain + "% rain");
    el.innerHTML = "<b>" + Math.round(w.mean) + "°</b> " + info[0] + '<span class="cm-sub"> · ' + sub.join(" · ") + "</span>";
    var ic = $("factWxIc"); if (ic) ic.setAttribute("href", "#i-" + info[1]);
    el.title = (wx.error ? "Offline. Data from " : "Updated at ") + hhmm(new Date(w.at)) + ". Average temperature for the day.";
  }

  function loadWeather(force) {
    var cached = ls(WX_KEY);
    if (cached && cached.day === todayISO()) { wx.data = cached; paintWeather(); }
    if (cached && cached.day === todayISO() && Date.now() - cached.at < WX_AGE && !force) return;
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + HAMBURG.lat + "&longitude=" + HAMBURG.lon +
      "&daily=weather_code,temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=" + encodeURIComponent(HAMBURG.tz) + "&forecast_days=1";
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      var d = j.daily, mn = d.temperature_2m_min[0], mx = d.temperature_2m_max[0];
      var mean = d.temperature_2m_mean && d.temperature_2m_mean[0] != null ? d.temperature_2m_mean[0] : (mn + mx) / 2;
      wx.data = { day: d.time[0], at: Date.now(), code: d.weather_code[0], mean: mean, min: mn, max: mx,
        rain: d.precipitation_probability_max ? d.precipitation_probability_max[0] : null };
      wx.error = false; ls(WX_KEY, wx.data); paintWeather();
    }).catch(function () { wx.error = true; paintWeather(); });
  }

  /* =========================================================
     Tasks — спільні частини
     ========================================================= */
  function metaFor(t, ctx) {
    var out = [];
    if (t.projectId && ctx !== "project") {
      var p = projectById(t.projectId); if (p) out.push("<span>" + icon("folder") + esc(p.name) + "</span>");
    }
    if (t.week && ctx !== "week") {
      var cw = weekKey(new Date());
      var label = t.week === cw ? (t.day != null ? DAYS_S[t.day] : "This week") : "Week " + weekNumOfKey(t.week) + (t.day != null ? ", " + DAYS_S[t.day] : "");
      out.push("<span>" + icon("calendar") + label + "</span>");
    }
    if (t.notes && t.notes.trim()) out.push('<span class="note" title="Has notes">' + icon("pencil") + "</span>");
    return out.length ? '<span class="task-meta">' + out.join("") + "</span>" : "";
  }

  function taskRow(t, ctx) {
    return '<div class="task' + (t.done ? " done" : "") + (ui.selected === t.id ? " sel" : "") + '" data-task="' + t.id + '">' +
      '<button type="button" class="check" role="checkbox" aria-checked="' + t.done + '" aria-label="Done">' + icon("check") + "</button>" +
      '<div class="task-main"><span class="task-title">' + esc(t.title) + "</span>" + metaFor(t, ctx) + "</div></div>";
  }

  function addRow(key, placeholder, ghost) {
    return '<form class="add-row' + (ghost ? " ghost" : "") + '" data-add="' + key + '">' + icon("plus") +
      '<input type="text" name="title" data-add-key="' + key + '" placeholder="' + placeholder + '" autocomplete="off" maxlength="300" enterkeyhint="done"></form>';
  }

  function doneSection(key, list, ctx) {
    if (!list.length) return "";
    var open = !!ui.showDone[key];
    return '<button type="button" class="done-toggle" data-done-toggle="' + key + '" aria-expanded="' + open + '">' +
      icon("chevron-down") + "Completed · " + list.length + "</button>" +
      (open ? '<div class="list">' + list.map(function (t) { return taskRow(t, ctx); }).join("") + "</div>" : "");
  }

  function byCreatedDesc(a, b) { return b.createdAt - a.createdAt; }
  function byDoneDesc(a, b) { return (b.doneAt || 0) - (a.doneAt || 0); }

  /* ---------- To-dos ---------- */
  function renderTodos() {
    $("headActions").innerHTML = "";
    var open = tasks().filter(function (t) { return !t.done; }).sort(byCreatedDesc);
    var done = tasks().filter(function (t) { return t.done; }).sort(byDoneDesc);
    $("view").innerHTML =
      '<div class="page">' +
        '<div class="page-head"><div><h1>To-dos</h1><div class="page-sub">' +
          (open.length ? open.length + " " + plural(open.length, "open task", "open tasks") : "All done") +
        "</div></div></div>" +
        addRow("todos", "New task") +
        '<div class="list">' + open.map(function (t) { return taskRow(t, "todos"); }).join("") + "</div>" +
        (open.length ? "" : '<div class="empty">Type a task above and press Enter. Click a task to add it to a week or a project.</div>') +
        doneSection("todos", done, "todos") +
      "</div>";
  }

  /* ---------- This week ---------- */
  function renderWeek() {
    var mon = addDays(mondayOf(new Date()), ui.weekOffset * 7);
    var key = weekKey(mon), wn = isoWeek(mon).week;
    var inWeek = tasks().filter(function (t) { return t.week === key; });
    var doneN = inWeek.filter(function (t) { return t.done; }).length;
    var tIdx = ui.weekOffset === 0 ? todayIdx() : -1;

    $("headActions").innerHTML = "";
    var title = ui.weekOffset === 0 ? "This week" : ui.weekOffset === 1 ? "Next week" : ui.weekOffset === -1 ? "Last week" : "Week " + wn;
    var nw = function (x) { return '<span style="white-space:nowrap">' + x + "</span>"; };
    var sub = nw(weekRange(mon)) + " · " + nw("week " + wn) + (inWeek.length ? " · " + nw(doneN + " of " + inWeek.length + " done") : "");

    function sortIn(list) {
      return list.sort(function (a, b) { return (a.done - b.done) || (a.createdAt - b.createdAt); });
    }
    function group(gkey, label, date, list, cls, tag, hws) {
      return '<section class="group' + (cls ? " " + cls : "") + '">' +
        '<div class="group-title"><span class="gt">' + label + "</span>" + (date ? '<span class="gd">' + date + "</span>" : "") +
        (tag ? '<span class="tag">' + tag + "</span>" : "") +
        '<button type="button" class="ibtn sm gadd" data-group-add="' + gkey + '" title="Add task" aria-label="Add task: ' + label + '">' + icon("plus") + "</button></div>" +
        '<div class="list">' + sortIn(list).map(function (t) { return taskRow(t, "week"); }).join("") +
          (hws || []).sort(function (a, b) { return a.done - b.done; }).map(function (h) { return hwRow(h, "week"); }).join("") + "</div>" +
        addRow(gkey, "New task", true).replace("<form ", ui.addingGroup === gkey ? "<form " : "<form hidden ") + "</section>";
    }

    var html = '<div class="page">' +
      '<div class="page-head"><div><h1>' + title + '</h1><div class="page-sub">' + sub + "</div></div>" +
      '<div class="seg">' +
        '<button type="button" class="ibtn" data-week-nav="-1" title="Previous week" aria-label="Previous week">' + icon("chevron-left") + "</button>" +
        (ui.weekOffset !== 0 ? '<button type="button" class="btn" data-week-nav="0">This week</button>' : "") +
        '<button type="button" class="ibtn" data-week-nav="1" title="Next week" aria-label="Next week">' + icon("chevron-right") + "</button>" +
      "</div></div>";

    var anyday = inWeek.filter(function (t) { return t.day == null; });
    html += group("week:" + key + ":any", "Anytime", "", anyday, "", "");
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i);
      var list = inWeek.filter(function (t) { return t.day === i; });
      var past = ui.weekOffset < 0 || (ui.weekOffset === 0 && i < tIdx);
      var dayIso = isoDate(d);
      var hws = hwList().filter(function (h) { return h.plan === dayIso; });
      html += group("week:" + key + ":" + i, DAYS[i], fmtDayMonth.format(d), list, past ? "past" : "", i === tIdx ? "Today" : "", hws);
    }
    $("view").innerHTML = html + "</div>";
  }

  /* ---------- Проєкт ---------- */
  function renderProject() {
    var p = projectById(ui.route.id);
    if (!p) { location.replace("#todos"); return; }
    var all = tasks().filter(function (t) { return t.projectId === p.id; });
    var open = all.filter(function (t) { return !t.done; }).sort(byCreatedDesc);
    var done = all.filter(function (t) { return t.done; }).sort(byDoneDesc);
    $("headActions").innerHTML = '<button type="button" class="ibtn" id="projMenuBtn" aria-label="Project actions" title="Project actions">' + icon("ellipsis") + "</button>";
    $("view").innerHTML =
      '<div class="page">' +
        '<div class="page-head"><div><h1>' + esc(p.name) + '</h1><div class="page-sub">' +
          open.length + " " + "open" + " · " + done.length + " completed</div></div></div>" +
        addRow("project:" + p.id, "New task in this project") +
        '<div class="list">' + open.map(function (t) { return taskRow(t, "project"); }).join("") + "</div>" +
        (all.length ? "" : '<div class="empty">No tasks in this project yet.</div>') +
        doneSection("project:" + p.id, done, "project") +
      "</div>";
  }

  /* ---------- дії у списках ---------- */
  $("view").addEventListener("submit", function (e) {
    var f = e.target.closest("form[data-add]"); if (!f) return;
    e.preventDefault();
    var input = f.querySelector("input"), key = f.getAttribute("data-add"), extra = {};
    if (key.indexOf("project:") === 0) extra.projectId = key.slice(8);
    if (key.indexOf("week:") === 0) {
      var parts = key.split(":"); extra.week = parts[1]; extra.day = parts[2] === "any" ? null : parseInt(parts[2], 10);
    }
    if (addTask(input.value, extra)) { ui.refocus = key; renderAll(); }
  });

  // поле «Нова задача» в дні тижня ховається, якщо з нього вийшли порожнім
  $("view").addEventListener("focusout", function (e) {
    var f = e.target.closest && e.target.closest(".add-row.ghost");
    if (!f) return;
    setTimeout(function () {
      if (!f.isConnected || f.contains(document.activeElement) || f.querySelector("input").value.trim()) return;
      f.hidden = true; if (ui.addingGroup === f.getAttribute("data-add")) ui.addingGroup = null;
    }, 150);
  });

  $("view").addEventListener("keydown", function (e) {
    if (e.key === "Escape" && e.target.matches(".add-row input")) { e.target.value = ""; e.target.blur(); e.stopPropagation(); }
  });

  $("view").addEventListener("click", function (e) {
    var nav = e.target.closest("[data-week-nav]");
    if (nav) { var v = parseInt(nav.getAttribute("data-week-nav"), 10); ui.weekOffset = v === 0 ? 0 : ui.weekOffset + v; renderAll(); return; }

    var ga = e.target.closest("[data-group-add]");
    if (ga) { ui.addingGroup = ga.getAttribute("data-group-add"); ui.refocus = ui.addingGroup; renderMain(); return; }

    var dt = e.target.closest("[data-done-toggle]");
    if (dt) { var k = dt.getAttribute("data-done-toggle"); ui.showDone[k] = !ui.showDone[k]; renderAll(); return; }

    var row = e.target.closest(".task"); if (!row) return;
    var isHw = row.hasAttribute("data-hw");
    var id = row.getAttribute(isHw ? "data-hw" : "data-task");
    if (e.target.closest(".check")) { if (isHw) toggleHw(id, row); else toggleDone(id, row); return; }
    if (ui.route.name === "focus") { pickFocus(isHw ? "hw" : "task", id); return; }
    openDetail(id, isHw ? "hw" : "task");
  });

  function toggleDone(id, row) {
    var t = taskById(id); if (!t) return;
    var nowDone = !t.done;
    updateTask(id, { done: nowDone });
    if (row) {
      row.classList.toggle("done", nowDone);
      var c = row.querySelector(".check"); if (c) c.setAttribute("aria-checked", String(nowDone));
    }
    // коротка пауза, щоб було видно галочку, а потім задача переїжджає у «Виконано»
    setTimeout(function () { renderAll(); }, nowDone ? 450 : 0);
  }

  // меню проєкту
  document.addEventListener("click", function (e) {
    var b = e.target.closest("#projMenuBtn");
    if (b) { e.stopPropagation(); openProjectMenu(b); return; }
    var sb = e.target.closest("#subjMenuBtn");
    if (sb) { e.stopPropagation(); openSubjectMenu(sb); return; }
    var nb = e.target.closest("#noteMenuBtn");
    if (nb) { e.stopPropagation(); openNoteMenu(nb); return; }
    if (e.target.closest("#ttEditBtn")) { ui.ttEdit = !ui.ttEdit; ui.ttNew = null; renderMain(); return; }
    var m = document.querySelector(".menu");
    if (m && !m.contains(e.target)) m.remove();
  });

  function openProjectMenu(btn) {
    var old = document.querySelector(".menu"); if (old) { old.remove(); return; }
    var p = projectById(ui.route.id); if (!p) return;
    var m = document.createElement("div");
    m.className = "menu"; m.setAttribute("role", "menu");
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + "px";
    m.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    function main() {
      m.innerHTML = '<button type="button" data-a="rename">' + icon("pencil") + 'Rename</button>' +
        '<button type="button" class="danger" data-a="delete">' + icon("trash-2") + "Delete project</button>";
    }
    main();
    m.addEventListener("click", function (e) {
      var a = e.target.closest("[data-a]"); if (!a) return;
      var act = a.getAttribute("data-a");
      if (act === "rename") {
        m.innerHTML = '<form style="padding:4px"><input class="rename" id="renameInput" maxlength="80" value="' + esc(p.name) + '"></form>';
        var inp = m.querySelector("input"); inp.focus(); inp.select();
        m.querySelector("form").addEventListener("submit", function (ev) {
          ev.preventDefault(); var v = inp.value.trim();
          if (v) { p.name = v; Store.save(); }
          m.remove(); renderAll();
        });
      } else if (act === "delete") {
        m.innerHTML = "<p>Delete “" + esc(p.name) + "”? Its tasks will stay in To-dos.</p>" +
          '<div class="row"><button type="button" class="btn" data-a="cancel">Cancel</button>' +
          '<button type="button" class="btn danger" data-a="confirm">Delete</button></div>';
      } else if (act === "cancel") { main(); }
      else if (act === "confirm") { deleteProject(p.id); m.remove(); location.hash = "todos"; }
    });
    document.body.appendChild(m);
  }

  /* =========================================================
     Панель задачі
     ========================================================= */
  function openDetail(id, kind) {
    ui.selected = id; ui.selKind = kind || "task";
    renderDetail();
    document.querySelectorAll(".task").forEach(function (r) {
      r.classList.toggle("sel", (r.getAttribute("data-task") || r.getAttribute("data-hw")) === id);
    });
    updateScrim();
  }
  function closeDetail() {
    ui.selected = null; $("detail").hidden = true; $("detail").innerHTML = "";
    document.querySelectorAll(".task.sel").forEach(function (r) { r.classList.remove("sel"); });
    updateScrim();
  }

  function weekOptions(t) {
    var now = new Date(), cur = weekKey(now), nxt = weekKey(addDays(now, 7));
    var opts = [["", "Not planned"], [cur, "This week (" + isoWeek(now).week + ")"], [nxt, "Next week (" + isoWeek(addDays(now, 7)).week + ")"]];
    if (t.week && t.week !== cur && t.week !== nxt) opts.push([t.week, "Week " + weekNumOfKey(t.week)]);
    return opts.map(function (o) { return '<option value="' + o[0] + '"' + ((t.week || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
  }

  function renderDetail() { if (ui.selKind === "hw") renderHwDetail(); else renderTaskDetail(); }
  function renderTaskDetail() {
    var t = taskById(ui.selected), el = $("detail");
    if (!t) { closeDetail(); return; }
    var pOpts = '<option value="">No project</option>' + projects().map(function (p) {
      return '<option value="' + p.id + '"' + (t.projectId === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>";
    }).join("");
    var dOpts = '<option value="">Anytime</option>' + DAYS.map(function (d, i) {
      return '<option value="' + i + '"' + (t.day === i ? " selected" : "") + ">" + d + "</option>";
    }).join("");
    var created = new Date(t.createdAt);

    el.innerHTML =
      '<div class="detail-head"><span>Task</span>' +
        '<button type="button" class="ibtn" id="detailClose" aria-label="Close">' + icon("x") + "</button></div>" +
      '<div class="detail-body">' +
        '<div class="d-title">' +
          '<button type="button" class="check" id="dCheck" role="checkbox" aria-checked="' + t.done + '" aria-label="Done">' + icon("check") + "</button>" +
          '<textarea id="dTitle" rows="1" maxlength="300" aria-label="Task name">' + esc(t.title) + "</textarea>" +
        "</div>" +
        '<div class="props">' +
          '<div class="prop"><span class="prop-k">' + icon("folder") + 'Project</span><div class="sel-wrap"><select id="dProject">' + pOpts + "</select>" + icon("chevron-down") + "</div></div>" +
          '<div class="prop"><span class="prop-k">' + icon("calendar-days") + 'Week</span><div class="sel-wrap"><select id="dWeek">' + weekOptions(t) + "</select>" + icon("chevron-down") + "</div></div>" +
          '<div class="prop"><span class="prop-k">' + icon("calendar") + 'Day</span><div class="sel-wrap"><select id="dDay"' + (t.week ? "" : " disabled") + ">" + dOpts + "</select>" + icon("chevron-down") + "</div></div>" +
        "</div>" +
        '<div><div class="notes-label">Notes</div><textarea class="notes" id="dNotes" placeholder="Details, links, steps…">' + esc(t.notes) + "</textarea></div>" +
      "</div>" +
      '<div class="detail-foot"><span>Created ' + fmtDayMonShort.format(created) + ", " + hhmm(created) + '</span><span id="dDelWrap">' +
        '<button type="button" class="ibtn" id="dDelete" title="Delete task" aria-label="Delete task">' + icon("trash-2") + "</button></span></div>";
    el.hidden = false;

    var ti = $("dTitle");
    function grow() { ti.style.height = "auto"; ti.style.height = ti.scrollHeight + "px"; }
    grow();
    var saveT;
    ti.addEventListener("input", function () {
      grow(); clearTimeout(saveT);
      saveT = setTimeout(function () { var v = ti.value.replace(/\s+/g, " ").trim(); if (v) { updateTask(t.id, { title: v }); renderMain(); } }, 250);
    });
    ti.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ti.blur(); } });
    ti.addEventListener("blur", function () { if (!ti.value.trim()) { ti.value = t.title; grow(); } });

    $("dCheck").addEventListener("click", function () {
      updateTask(t.id, { done: !t.done }); $("dCheck").setAttribute("aria-checked", String(t.done)); renderMain();
    });
    $("dProject").addEventListener("change", function (e) { updateTask(t.id, { projectId: e.target.value || null }); renderMain(); });
    $("dWeek").addEventListener("change", function (e) {
      var v = e.target.value || null; updateTask(t.id, v ? { week: v } : { week: null, day: null });
      renderMain(); renderDetail();
    });
    $("dDay").addEventListener("change", function (e) { updateTask(t.id, { day: e.target.value === "" ? null : parseInt(e.target.value, 10) }); renderMain(); });
    var saveN;
    $("dNotes").addEventListener("input", function (e) {
      clearTimeout(saveN); var v = e.target.value;
      saveN = setTimeout(function () { var hadNote = !!(t.notes && t.notes.trim()); updateTask(t.id, { notes: v }); if (hadNote !== !!v.trim()) renderMain(); }, 300);
    });
    $("detailClose").addEventListener("click", closeDetail);
    $("dDelete").addEventListener("click", function () {
      $("dDelWrap").innerHTML = '<span class="confirm">Delete?<button type="button" class="btn" id="dNo">No</button>' +
        '<button type="button" class="btn danger" id="dYes">Yes</button></span>';
      $("dNo").addEventListener("click", renderDetail);
      $("dYes").addEventListener("click", function () { deleteTask(t.id); closeDetail(); renderMain(); });
    });
  }

  /* =========================================================
     Школа: розклад, домашка, предмети, нотатки
     ========================================================= */
  var SUBJ_COLORS = ["#4C7DFF", "#3FA66B", "#D6409F", "#F2994A", "#12A594", "#E5484D", "#AD7F58", "#8D8D86",
    "#7C5CFF", "#84B342", "#E2B203", "#9B7BD4", "#0EA5B7"];

  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromISO(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayDiff(iso) { return Math.round((fromISO(iso) - startOfDay(new Date())) / 86400000); }
  function toMin(t) { var p = (t || "0:0").split(":"); return (+p[0]) * 60 + (+p[1]); }

  function school() { return Store.data.school; }
  function subjects() { return school().subjects; }
  function subjectById(id) { return subjects().find(function (s) { return s.id === id; }); }
  function hwList() { return school().homework; }
  function hwById(id) { return hwList().find(function (h) { return h.id === id; }); }
  function notesList() { return school().notes; }
  function noteById(id) { return notesList().find(function (n) { return n.id === id; }); }

  // Перший запуск: розклад і відкрита домашка зі старого Life OS
  function ensureSchool() {
    var sc = Store.data.school;
    if (sc && Array.isArray(sc.subjects)) return;
    var tt = [["Mathe", "Bio", "Kunst", "Spanisch", "Sport"], ["Deutsch", "Geschichte", "Seminar", "Englisch"],
      ["Spanisch", "Naturwissenschaften"], ["Englisch", "PGW", "Mathe"], ["Religion", "Chemie", "Deutsch"]];
    var ends = ["17:15", "15:45", "12:30", "15:00", "13:45"];
    var subs = [], byName = {};
    tt.forEach(function (day) {
      day.forEach(function (n) {
        if (byName[n]) return;
        var s = { id: uid(), name: n, color: SUBJ_COLORS[subs.length % SUBJ_COLORS.length] };
        subs.push(s); byName[n] = s.id;
      });
    });
    var now = Date.now();
    Store.data.school = {
      subjects: subs,
      timetable: tt.map(function (day, i) { return { start: "08:00", end: ends[i], items: day.map(function (n) { return byName[n]; }) }; }),
      homework: [
        { id: uid(), subjectId: byName.Religion, title: "AB AUFG 1,2", due: "2026-11-07", plan: null, done: false, doneAt: null, createdAt: now - 2, notes: "" },
        { id: uid(), subjectId: byName.Spanisch, title: "Worksheet", due: null, plan: null, done: false, doneAt: null, createdAt: now - 1, notes: "" }
      ],
      notes: []
    };
    Store.save();
  }

  function lessonDaysOf(sid) {
    var out = [];
    school().timetable.forEach(function (d, i) { if (d.items.indexOf(sid) >= 0) out.push(i); });
    return out;
  }
  // наступний урок предмета після вказаного дня (за замовчуванням — після сьогодні)
  function nextLesson(sid, after) {
    var start = startOfDay(after || new Date());
    for (var k = 1; k <= 14; k++) {
      var d = addDays(start, k), wi = (d.getDay() + 6) % 7;
      if (wi < 5 && school().timetable[wi].items.indexOf(sid) >= 0) return d;
    }
    return null;
  }
  function relDay(iso) {
    var n = dayDiff(iso);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n === -1) return "yesterday";
    var d = fromISO(iso);
    return DAYS_S[(d.getDay() + 6) % 7] + ", " + fmtDayMonShort.format(d);
  }
  function shortWhen(ts) {
    var d = new Date(ts);
    return isoDate(d) === todayISO() ? hhmm(d) : fmtDayMonShort.format(d);
  }
  function subjChip(sid) {
    var s = subjectById(sid); if (!s) return "";
    return '<span class="subj"><i style="background:' + s.color + '"></i>' + esc(s.name) + "</span>";
  }
  function byDue(a, b) {
    var x = a.due || "9999", y = b.due || "9999";
    return x < y ? -1 : x > y ? 1 : a.createdAt - b.createdAt;
  }

  /* ---------- дані домашки ---------- */
  function addHw(title, subjectId, due) {
    title = title.trim(); if (!title || !subjectId) return null;
    var h = { id: uid(), subjectId: subjectId, title: title, due: due || null, plan: null,
      done: false, doneAt: null, createdAt: Date.now(), notes: "" };
    hwList().push(h); Store.save(); return h;
  }
  function updateHw(id, patch) {
    var h = hwById(id); if (!h) return;
    Object.keys(patch).forEach(function (k) { h[k] = patch[k]; });
    if ("done" in patch) h.doneAt = patch.done ? Date.now() : null;
    Store.save();
  }
  function deleteHw(id) { school().homework = hwList().filter(function (h) { return h.id !== id; }); Store.save(); }
  function toggleHw(id, row) {
    var h = hwById(id); if (!h) return;
    var nowDone = !h.done;
    updateHw(id, { done: nowDone });
    if (row) {
      row.classList.toggle("done", nowDone);
      var c = row.querySelector(".check"); if (c) c.setAttribute("aria-checked", String(nowDone));
    }
    setTimeout(function () { renderAll(); }, nowDone ? 450 : 0);
  }

  /* ---------- рядок домашки ---------- */
  function hwRow(h, ctx) {
    var meta = [];
    if (ctx !== "subject") meta.push(subjChip(h.subjectId));
    if (h.due) {
      var late = !h.done && dayDiff(h.due) < 0;
      meta.push('<span class="' + (late ? "late" : "") + '">' + icon("calendar") + "due " + relDay(h.due) + "</span>");
    }
    if (h.plan && ctx !== "week") meta.push("<span>" + icon("calendar-clock") + "do " + relDay(h.plan) + "</span>");
    if (h.notes && h.notes.trim()) meta.push('<span class="note" title="Has notes">' + icon("pencil") + "</span>");
    return '<div class="task hw' + (h.done ? " done" : "") + (ui.selected === h.id ? " sel" : "") + '" data-hw="' + h.id + '">' +
      '<button type="button" class="check" role="checkbox" aria-checked="' + h.done + '" aria-label="Done">' + icon("check") + "</button>" +
      '<div class="task-main"><span class="task-title">' + esc(h.title) + "</span>" +
      (meta.length ? '<span class="task-meta">' + meta.join("") + "</span>" : "") + "</div></div>";
  }

  function hwGroupsHTML(list, ctx) {
    var g = { late: [], today: [], tomorrow: [], week: [], later: [], none: [] };
    var sunday = isoDate(addDays(mondayOf(new Date()), 6));
    list.slice().sort(byDue).forEach(function (h) {
      if (!h.due) { g.none.push(h); return; }
      var n = dayDiff(h.due);
      if (n < 0) g.late.push(h);
      else if (n === 0) g.today.push(h);
      else if (n === 1) g.tomorrow.push(h);
      else if (h.due <= sunday) g.week.push(h);
      else g.later.push(h);
    });
    var defs = [["late", "Overdue"], ["today", "Due today"], ["tomorrow", "Due tomorrow"],
      ["week", "Later this week"], ["later", "Later"], ["none", "No date"]];
    return defs.filter(function (d) { return g[d[0]].length; }).map(function (d) {
      return '<section class="group' + (d[0] === "late" ? " is-late" : "") + '"><div class="group-title"><span class="gt">' + d[1] +
        '</span><span class="gd">' + g[d[0]].length + '</span></div><div class="list">' +
        g[d[0]].map(function (h) { return hwRow(h, ctx); }).join("") + "</div></section>";
    }).join("");
  }

  function hwDoneSection(key, list, ctx) {
    if (!list.length) return "";
    var open = !!ui.showDone[key];
    return '<button type="button" class="done-toggle" data-done-toggle="' + key + '" aria-expanded="' + open + '">' +
      icon("chevron-down") + "Done · " + list.length + "</button>" +
      (open ? '<div class="list">' + list.map(function (h) { return hwRow(h, ctx); }).join("") + "</div>" : "");
  }

  /* ---------- форма «нова домашка» ---------- */
  function hwAddForm(fixedSid) {
    if (!subjects().length) return '<div class="empty">Add subjects to your timetable first.</div>';
    var sid = fixedSid || (subjectById(ui.hwSubject) ? ui.hwSubject : subjects()[0].id);
    var nl = nextLesson(sid);
    var subjSel = fixedSid ? "" :
      '<div class="sel-wrap subj-sel"><select name="subject" aria-label="Subject">' + subjects().map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === sid ? " selected" : "") + ">" + esc(s.name) + "</option>";
      }).join("") + "</select>" + icon("chevron-down") + "</div>";
    return '<form class="hw-add" data-hw-add="' + (fixedSid || "") + '">' +
      '<div class="add-row">' + icon("plus") +
        '<input type="text" name="title" data-add-key="hw' + (fixedSid || "") + '" placeholder="What’s the homework?" autocomplete="off" maxlength="300" enterkeyhint="done"></div>' +
      '<div class="hw-opts">' + subjSel +
        '<label class="date-pill"><span>Due</span><input type="date" name="due" value="' + (nl ? isoDate(nl) : "") + '"></label>' +
        '<span class="hint" data-hint>' + (nl ? "next lesson" : "not in timetable") + "</span>" +
        '<button type="submit" class="btn solid">Add</button>' +
      "</div></form>";
  }

  $("view").addEventListener("submit", function (e) {
    var f = e.target.closest("form[data-hw-add]");
    if (f) {
      e.preventDefault();
      var fixed = f.getAttribute("data-hw-add");
      var sel = f.querySelector('select[name="subject"]');
      var sid = fixed || (sel && sel.value);
      var h = addHw(f.querySelector('input[name="title"]').value, sid, f.querySelector('input[name="due"]').value);
      if (h) { if (!fixed) ui.hwSubject = sid; ui.refocus = "hw" + fixed; renderAll(); }
      return;
    }
    var nf = e.target.closest("form[data-tt-new]");
    if (nf) {
      e.preventDefault();
      var name = nf.querySelector("input").value.trim();
      if (name) {
        var s = { id: uid(), name: name, color: SUBJ_COLORS[subjects().length % SUBJ_COLORS.length] };
        subjects().push(s);
        school().timetable[+nf.getAttribute("data-tt-new")].items.push(s.id);
        Store.save();
      }
      ui.ttNew = null; renderAll();
    }
  });

  $("view").addEventListener("change", function (e) {
    var t = e.target;
    // вибрали інший предмет → дата здачі = його наступний урок
    if (t.matches('.hw-add select[name="subject"]')) {
      var f = t.closest(".hw-add"), nl = nextLesson(t.value);
      f.querySelector('input[name="due"]').value = nl ? isoDate(nl) : "";
      f.querySelector("[data-hint]").textContent = nl ? "next lesson" : "not in timetable";
      ui.hwSubject = t.value;
      return;
    }
    if (t.matches('.hw-add input[name="due"]')) {
      var ff = t.closest(".hw-add"), s2 = ff.querySelector('select[name="subject"]');
      var sid = ff.getAttribute("data-hw-add") || (s2 && s2.value), n2 = nextLesson(sid);
      ff.querySelector("[data-hint]").textContent = !t.value ? "no date" : (n2 && isoDate(n2) === t.value ? "next lesson" : relDay(t.value));
      return;
    }
    if (t.matches("[data-tt-time]")) {
      var p = t.getAttribute("data-tt-time").split(":");
      if (t.value) { school().timetable[+p[0]][p[1]] = t.value; Store.save(); }
      return;
    }
    if (t.matches("[data-tt-add]")) {
      var di = +t.getAttribute("data-tt-add");
      if (t.value === "__new") { ui.ttNew = di; ui.refocus = "ttnew"; renderMain(); return; }
      if (t.value) { school().timetable[di].items.push(t.value); Store.save(); renderAll(); }
    }
  });

  $("view").addEventListener("click", function (e) {
    var up = e.target.closest("[data-tt-up]"), del = e.target.closest("[data-tt-del]");
    var b = up || del; if (!b) {
      var nn = e.target.closest("[data-new-note]");
      if (nn) {
        var n = { id: uid(), subjectId: nn.getAttribute("data-new-note"), title: "", body: "", createdAt: Date.now(), updatedAt: Date.now() };
        notesList().push(n); Store.save(); location.hash = "note-" + n.id;
      }
      return;
    }
    var p = b.getAttribute(up ? "data-tt-up" : "data-tt-del").split(":"), items = school().timetable[+p[0]].items, j = +p[1];
    if (up && j > 0) { var x = items[j - 1]; items[j - 1] = items[j]; items[j] = x; }
    if (del) items.splice(j, 1);
    Store.save(); renderAll();
  });

  /* ---------- Розклад ---------- */
  function renderTimetable() {
    var edit = !!ui.ttEdit;
    $("headActions").innerHTML = '<button type="button" class="btn' + (edit ? " solid" : "") + '" id="ttEditBtn">' + (edit ? "Done" : "Edit") + "</button>";
    // on the weekend the timetable shows the coming week
    var weekend = todayIdx() >= 5;
    var mon = addDays(mondayOf(new Date()), weekend ? 7 : 0), tIdx = weekend ? -1 : todayIdx();
    var openHw = hwList().filter(function (h) { return !h.done; });

    var cols = school().timetable.map(function (day, i) {
      var date = addDays(mon, i), iso = isoDate(date);
      var cls = "tt-col" + (i === tIdx ? " today" : "") + (i < tIdx ? " past" : "");
      var head = '<div class="tt-head"><div class="tt-dn">' + DAYS[i] + (i === tIdx ? ' <span class="tag">Today</span>' : "") + "</div>" +
        (edit
          ? '<div class="tt-times"><label><span>from</span><input type="time" data-tt-time="' + i + ':start" value="' + day.start + '" aria-label="Start, ' + DAYS[i] + '"></label>' +
            '<label><span>to</span><input type="time" data-tt-time="' + i + ':end" value="' + day.end + '" aria-label="End, ' + DAYS[i] + '"></label></div>'
          : '<div class="tt-dm">' + fmtDayMonth.format(date) + " · " + day.start + "–" + day.end + "</div>") + "</div>";

      var items = day.items.map(function (sid, j) {
        var s = subjectById(sid); if (!s) return "";
        if (edit) {
          return '<div class="tt-lesson edit" style="--c:' + s.color + '"><span class="tt-name">' + esc(s.name) + "</span>" +
            (j > 0 ? '<button type="button" class="ibtn sm" data-tt-up="' + i + ":" + j + '" title="Move up" aria-label="Move up">' + icon("arrow-up") + "</button>" : "") +
            '<button type="button" class="ibtn sm" data-tt-del="' + i + ":" + j + '" title="Remove" aria-label="Remove lesson">' + icon("x") + "</button></div>";
        }
        var due = openHw.filter(function (h) { return h.subjectId === sid && h.due === iso; }).length;
        return '<a class="tt-lesson" href="#subject-' + sid + '" style="--c:' + s.color + '"><span class="tt-name">' + esc(s.name) + "</span>" +
          (due ? '<span class="badge" title="Homework due for this lesson">' + icon("notebook-pen") + due + "</span>" : "") + "</a>";
      }).join("");
      if (!day.items.length && !edit) items = '<div class="tt-empty">No lessons</div>';

      var add = "";
      if (edit) {
        add = ui.ttNew === i
          ? '<form class="tt-new" data-tt-new="' + i + '"><input type="text" data-add-key="ttnew" placeholder="Subject name, Enter" maxlength="60" autocomplete="off"></form>'
          : '<div class="sel-wrap tt-add"><select data-tt-add="' + i + '" aria-label="Add lesson, ' + DAYS[i] + '"><option value="">Add lesson</option>' +
            subjects().map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("") +
            '<option value="__new">New subject…</option></select>' + icon("plus") + "</div>";
      }
      return '<section class="' + cls + '">' + head + '<div class="tt-list">' + items + "</div>" + add + "</section>";
    }).join("");

    $("view").innerHTML = '<div class="page wide"><div class="page-head"><div><h1>Timetable</h1><div class="page-sub">' +
      (edit ? "Change times, order or subjects. The timetable repeats every week."
            : (weekend ? "Next week · " : "") + "Week " + isoWeek(mon).week + " · click a subject to open its homework and notes") +
      '</div></div></div><div class="tt">' + cols + "</div></div>";
  }

  /* ---------- Домашка ---------- */
  function renderHomework() {
    $("headActions").innerHTML = "";
    var open = hwList().filter(function (h) { return !h.done; });
    var done = hwList().filter(function (h) { return h.done; }).sort(byDoneDesc);
    var late = open.filter(function (h) { return h.due && dayDiff(h.due) < 0; }).length;
    var sub = open.length
      ? open.length + " open" + (late ? ' · <span class="late">' + late + " overdue</span>" : "")
      : "All done";
    $("view").innerHTML = '<div class="page"><div class="page-head"><div><h1>Homework</h1><div class="page-sub">' + sub + "</div></div></div>" +
      hwAddForm(null) +
      (open.length ? hwGroupsHTML(open, "hw")
        : '<div class="empty">No open homework. Add new homework above: the due date is filled in from your timetable.</div>') +
      hwDoneSection("hw", done, "hw") + "</div>";
  }

  /* ---------- Предмет ---------- */
  function renderSubject() {
    var s = subjectById(ui.route.id);
    if (!s) { location.replace("#timetable"); return; }
    var days = lessonDaysOf(s.id).map(function (i) { return DAYS_S[i]; }).join(", ");
    var nl = nextLesson(s.id, addDays(new Date(), -1)); // разом із сьогоднішнім
    var all = hwList().filter(function (h) { return h.subjectId === s.id; });
    var open = all.filter(function (h) { return !h.done; }).sort(byDue);
    var done = all.filter(function (h) { return h.done; }).sort(byDoneDesc);
    var notes = notesList().filter(function (n) { return n.subjectId === s.id; }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });

    $("headActions").innerHTML = '<button type="button" class="ibtn" id="subjMenuBtn" aria-label="Subject actions" title="Subject actions">' + icon("ellipsis") + "</button>";
    var sub = (days ? "Lessons: " + days : "Not in timetable") + (nl ? " · next " + relDay(isoDate(nl)) : "");

    var notesHtml = notes.length ? '<div class="list">' + notes.map(function (n) {
      var first = (n.body || "").split("\n").filter(function (l) { return l.trim(); })[0] || "";
      return '<a class="note-row" href="#note-' + n.id + '">' + icon("file-text") +
        '<span class="nt">' + esc(n.title || "Untitled") + '</span><span class="np">' + esc(first) + '</span><span class="nd">' + shortWhen(n.updatedAt) + "</span></a>";
    }).join("") + "</div>"
      : '<div class="empty">Class notes, formulas, what the teacher said: all of it goes here.</div>';

    $("view").innerHTML = '<div class="page">' +
      '<div class="page-head"><div><h1 class="subj-h"><i style="background:' + s.color + '"></i>' + esc(s.name) + '</h1><div class="page-sub">' + sub + "</div></div></div>" +
      '<div class="section-h"><span>Homework</span><span class="gd">' + (open.length || "") + "</span></div>" +
      hwAddForm(s.id) +
      (open.length ? '<div class="list">' + open.map(function (h) { return hwRow(h, "subject"); }).join("") + "</div>"
        : '<div class="empty">No open homework.</div>') +
      hwDoneSection("subject:" + s.id, done, "subject") +
      '<div class="section-h notes-h"><span>Notes</span><button type="button" class="btn" data-new-note="' + s.id + '">' + icon("file-plus") + "New note</button></div>" +
      notesHtml + "</div>";
  }

  /* ---------- Нотатка ---------- */
  function renderNote() {
    var n = noteById(ui.route.id);
    if (!n) { location.replace("#timetable"); return; }
    $("headActions").innerHTML = '<button type="button" class="ibtn" id="noteMenuBtn" aria-label="Note actions" title="Note actions">' + icon("ellipsis") + "</button>";
    $("view").innerHTML = '<div class="page note">' +
      '<input class="note-title" id="noteTitle" placeholder="Untitled" maxlength="200" autocomplete="off" value="' + esc(n.title) + '" aria-label="Note title">' +
      '<div class="note-meta">' + subjChip(n.subjectId) + '<span id="noteSaved">Edited ' + shortWhen(n.updatedAt) + "</span></div>" +
      '<textarea class="note-body" id="noteBody" placeholder="Write here: class notes, formulas, what the teacher said…" aria-label="Note text">' + esc(n.body) + "</textarea></div>";

    var ti = $("noteTitle"), bo = $("noteBody"), tmr;
    function grow() { bo.style.height = "auto"; bo.style.height = Math.max(bo.scrollHeight, 320) + "px"; }
    function save() {
      clearTimeout(tmr);
      tmr = setTimeout(function () {
        n.title = ti.value.trim(); n.body = bo.value; n.updatedAt = Date.now(); Store.save();
        $("noteSaved").textContent = "Saved"; renderCrumbs();
      }, 300);
    }
    grow();
    ti.addEventListener("input", save);
    ti.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); bo.focus(); } });
    bo.addEventListener("input", function () { grow(); save(); });
    if (!n.title && !n.body) setTimeout(function () { ti.focus(); }, 0);
  }

  /* ---------- меню предмета і нотатки ---------- */
  function makeMenu(btn) {
    var old = document.querySelector(".menu"); if (old) { old.remove(); return null; }
    var m = document.createElement("div");
    m.className = "menu"; m.setAttribute("role", "menu");
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + "px";
    m.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    document.body.appendChild(m);
    return m;
  }

  function openSubjectMenu(btn) {
    var s = subjectById(ui.route.id); if (!s) return;
    var m = makeMenu(btn); if (!m) return;
    function main() {
      m.innerHTML = '<button type="button" data-a="rename">' + icon("pencil") + "Rename</button>" +
        '<div class="swatches" role="group" aria-label="Color">' + SUBJ_COLORS.map(function (c) {
          return '<button type="button" class="sw' + (c === s.color ? " on" : "") + '" data-color="' + c + '" style="background:' + c + '" aria-label="Color ' + c + '"></button>';
        }).join("") + "</div>" +
        '<button type="button" class="danger" data-a="delete">' + icon("trash-2") + "Delete subject</button>";
    }
    main();
    m.addEventListener("click", function (e) {
      var sw = e.target.closest("[data-color]");
      if (sw) { s.color = sw.getAttribute("data-color"); Store.save(); main(); renderAll(); return; }
      var a = e.target.closest("[data-a]"); if (!a) return;
      var act = a.getAttribute("data-a");
      if (act === "rename") {
        m.innerHTML = '<form style="padding:4px"><input class="rename" maxlength="60" value="' + esc(s.name) + '"></form>';
        var inp = m.querySelector("input"); inp.focus(); inp.select();
        m.querySelector("form").addEventListener("submit", function (ev) {
          ev.preventDefault(); var v = inp.value.trim(); if (v) { s.name = v; Store.save(); }
          m.remove(); renderAll();
        });
      } else if (act === "delete") {
        var hc = hwList().filter(function (h) { return h.subjectId === s.id; }).length;
        var nc = notesList().filter(function (n) { return n.subjectId === s.id; }).length;
        m.innerHTML = "<p>Delete “" + esc(s.name) + "”? It will be removed from the timetable" +
          (hc || nc ? ", along with " + hc + " homework and " + nc + " " + plural(nc, "note", "notes") : "") + ".</p>" +
          '<div class="row"><button type="button" class="btn" data-a="cancel">Cancel</button>' +
          '<button type="button" class="btn danger" data-a="confirm">Delete</button></div>';
      } else if (act === "cancel") { main(); }
      else if (act === "confirm") {
        var sc = school();
        sc.subjects = sc.subjects.filter(function (x) { return x.id !== s.id; });
        sc.timetable.forEach(function (d) { d.items = d.items.filter(function (id) { return id !== s.id; }); });
        sc.homework = sc.homework.filter(function (h) { return h.subjectId !== s.id; });
        sc.notes = sc.notes.filter(function (n) { return n.subjectId !== s.id; });
        Store.save(); m.remove(); location.hash = "timetable";
      }
    });
  }

  function openNoteMenu(btn) {
    var n = noteById(ui.route.id); if (!n) return;
    var m = makeMenu(btn); if (!m) return;
    m.innerHTML = '<button type="button" class="danger" data-a="delete">' + icon("trash-2") + "Delete note</button>";
    m.addEventListener("click", function (e) {
      var a = e.target.closest("[data-a]"); if (!a) return;
      var act = a.getAttribute("data-a");
      if (act === "delete") {
        m.innerHTML = "<p>Delete “" + esc(n.title || "Untitled") + "”? This can't be undone.</p>" +
          '<div class="row"><button type="button" class="btn" data-a="cancel">Cancel</button>' +
          '<button type="button" class="btn danger" data-a="confirm">Delete</button></div>';
      } else if (act === "cancel") { m.remove(); }
      else if (act === "confirm") {
        school().notes = notesList().filter(function (x) { return x.id !== n.id; });
        Store.save(); m.remove(); location.hash = "subject-" + n.subjectId;
      }
    });
  }

  /* ---------- панель домашки ---------- */
  function renderHwDetail() {
    var h = hwById(ui.selected), el = $("detail");
    if (!h) { closeDetail(); return; }
    var sOpts = subjects().map(function (s) {
      return '<option value="' + s.id + '"' + (h.subjectId === s.id ? " selected" : "") + ">" + esc(s.name) + "</option>";
    }).join("");
    var nl = nextLesson(h.subjectId);
    var created = new Date(h.createdAt);
    el.innerHTML =
      '<div class="detail-head"><span>Homework</span>' +
        '<button type="button" class="ibtn" id="detailClose" aria-label="Close">' + icon("x") + "</button></div>" +
      '<div class="detail-body">' +
        '<div class="d-title">' +
          '<button type="button" class="check" id="dCheck" role="checkbox" aria-checked="' + h.done + '" aria-label="Done">' + icon("check") + "</button>" +
          '<textarea id="dTitle" rows="1" maxlength="300" aria-label="Homework">' + esc(h.title) + "</textarea>" +
        "</div>" +
        '<div class="props">' +
          '<div class="prop"><span class="prop-k">' + icon("notebook-pen") + 'Subject</span><div class="sel-wrap"><select id="hSubject">' + sOpts + "</select>" + icon("chevron-down") + "</div></div>" +
          '<div class="prop"><span class="prop-k">' + icon("calendar") + 'Due</span><div class="date-cell"><input type="date" id="hDue" value="' + (h.due || "") + '">' +
            (nl && h.due !== isoDate(nl) ? '<button type="button" class="link-btn" id="hDueNext">next lesson</button>' : "") + "</div></div>" +
          '<div class="prop"><span class="prop-k">' + icon("calendar-clock") + 'Do on</span><div class="date-cell"><input type="date" id="hPlan" value="' + (h.plan || "") + '">' +
            (h.plan ? "" : '<button type="button" class="link-btn" data-plan="0">today</button><button type="button" class="link-btn" data-plan="1">tomorrow</button>') + "</div></div>" +
        "</div>" +
        '<p class="d-hint">The “Do on” day puts this homework into This week, so it’s part of your plan.</p>' +
        '<div><div class="notes-label">Notes</div><textarea class="notes" id="dNotes" placeholder="Pages, exercise numbers, what exactly to do…">' + esc(h.notes) + "</textarea></div>" +
      "</div>" +
      '<div class="detail-foot"><span>Added ' + fmtDayMonShort.format(created) + ", " + hhmm(created) + '</span><span id="dDelWrap">' +
        '<button type="button" class="ibtn" id="dDelete" title="Delete" aria-label="Delete homework">' + icon("trash-2") + "</button></span></div>";
    el.hidden = false;

    var ti = $("dTitle");
    function grow() { ti.style.height = "auto"; ti.style.height = ti.scrollHeight + "px"; }
    grow();
    var tT;
    ti.addEventListener("input", function () {
      grow(); clearTimeout(tT);
      tT = setTimeout(function () { var v = ti.value.replace(/\s+/g, " ").trim(); if (v) { updateHw(h.id, { title: v }); renderMain(); } }, 250);
    });
    ti.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ti.blur(); } });
    ti.addEventListener("blur", function () { if (!ti.value.trim()) { ti.value = h.title; grow(); } });

    $("dCheck").addEventListener("click", function () {
      updateHw(h.id, { done: !h.done }); $("dCheck").setAttribute("aria-checked", String(h.done)); renderMain();
    });
    $("hSubject").addEventListener("change", function (e) { updateHw(h.id, { subjectId: e.target.value }); renderMain(); renderDetail(); });
    $("hDue").addEventListener("change", function (e) { updateHw(h.id, { due: e.target.value || null }); renderMain(); renderDetail(); });
    $("hPlan").addEventListener("change", function (e) { updateHw(h.id, { plan: e.target.value || null }); renderMain(); renderDetail(); });
    if ($("hDueNext")) $("hDueNext").addEventListener("click", function () { updateHw(h.id, { due: isoDate(nl) }); renderMain(); renderDetail(); });
    el.querySelectorAll("[data-plan]").forEach(function (b) {
      b.addEventListener("click", function () {
        updateHw(h.id, { plan: isoDate(addDays(new Date(), +b.getAttribute("data-plan"))) }); renderMain(); renderDetail();
      });
    });
    var nT;
    $("dNotes").addEventListener("input", function (e) {
      clearTimeout(nT); var v = e.target.value;
      nT = setTimeout(function () { var had = !!(h.notes && h.notes.trim()); updateHw(h.id, { notes: v }); if (had !== !!v.trim()) renderMain(); }, 300);
    });
    $("detailClose").addEventListener("click", closeDetail);
    $("dDelete").addEventListener("click", function () {
      $("dDelWrap").innerHTML = '<span class="confirm">Delete?<button type="button" class="btn" id="dNo">No</button>' +
        '<button type="button" class="btn danger" id="dYes">Yes</button></span>';
      $("dNo").addEventListener("click", renderDetail);
      $("dYes").addEventListener("click", function () { deleteHw(h.id); closeDetail(); renderMain(); });
    });
  }

  /* ---------- меню, хлібні крихти, головна ---------- */
  function renderSchoolSidebar() {
    var r = ui.route;
    var openHw = hwList().filter(function (h) { return !h.done; });
    var late = openHw.filter(function (h) { return h.due && dayDiff(h.due) < 0; }).length;
    var c = $("cntHw");
    c.textContent = openHw.length || ""; c.classList.toggle("late", late > 0);
    c.title = late ? late + " overdue" : "";
    var curSid = r.name === "subject" ? r.id : r.name === "note" ? (noteById(r.id) || {}).subjectId : null;
    $("subjectList").innerHTML = subjects().length ? subjects().map(function (s) {
      var n = openHw.filter(function (h) { return h.subjectId === s.id; }).length;
      return '<a class="nav-item subject" href="#subject-' + s.id + '"' + (curSid === s.id ? ' aria-current="page"' : "") + ">" +
        '<span class="sdot" style="background:' + s.color + '"></span><span>' + esc(s.name) + '</span><span class="count">' + (n || "") + "</span></a>";
    }).join("") : '<div class="side-empty">None yet</div>';
  }

  function schoolCrumbs(sep) {
    var r = ui.route, root = '<a href="#school">School</a>' + sep;
    if (r.name === "school") return '<span class="cur">School</span>';
    if (r.name === "timetable") return root + '<span class="cur">Timetable</span>';
    if (r.name === "homework") return root + '<span class="cur">Homework</span>';
    if (r.name === "subject") return root + '<span class="cur">' + esc((subjectById(r.id) || {}).name || "Subject") + "</span>";
    var n = noteById(r.id) || {}, s = subjectById(n.subjectId) || {};
    return root + '<a href="#subject-' + s.id + '">' + esc(s.name || "Subject") + "</a>" + sep + '<span class="cur">' + esc(n.title || "Untitled") + "</span>";
  }

  function schoolFact() {
    var now = new Date(), wi = todayIdx(), tt = school().timetable, mins = now.getHours() * 60 + now.getMinutes();
    function names(d) { return d.items.map(function (id) { return (subjectById(id) || {}).name; }).filter(Boolean).join(", "); }
    if (wi < 5 && tt[wi].items.length && mins < toMin(tt[wi].end)) {
      return '<a href="#timetable">Today until <b>' + tt[wi].end + "</b> · " + esc(names(tt[wi])) + "</a>";
    }
    for (var k = 1; k <= 7; k++) {
      var i = (addDays(now, k).getDay() + 6) % 7;
      if (i < 5 && tt[i].items.length) {
        return '<a href="#timetable">' + (k === 1 ? "Tomorrow" : DAYS[i]) + " from <b>" + tt[i].start + "</b> · " + esc(names(tt[i])) + "</a>";
      }
    }
    return '<a href="#timetable">Timetable is empty</a>';
  }

  function hwFact() {
    var open = hwList().filter(function (h) { return !h.done; });
    if (!open.length) return '<a href="#homework">Nothing open</a>';
    var late = 0, today = 0, tom = 0;
    open.forEach(function (h) { if (!h.due) return; var n = dayDiff(h.due); if (n < 0) late++; else if (n === 0) today++; else if (n === 1) tom++; });
    var parts = [];
    if (late) parts.push('<span class="late">' + late + " overdue</span>");
    if (today) parts.push("<b>" + today + "</b> due today");
    if (tom) parts.push("<b>" + tom + "</b> due tomorrow");
    parts.push(open.length + " open");
    return '<a href="#homework">' + parts.join(" · ") + "</a>";
  }

  /* =========================================================
     Focus: Pomodoro timer
     The timer keeps an end time, not a countdown, so it stays correct when you switch pages,
     reload, or the phone locks. Timer state lives on this device; finished sessions go into the data.
     ========================================================= */
  var T_KEY = "lifeos.timer";
  var MODES = { focus: "Focus", short: "Short break", long: "Long break" };
  var T = (function () {
    var d = ls(T_KEY) || {};
    var durs = d.durs || { focus: 25, short: 5, long: 15 };
    var mode = MODES[d.mode] ? d.mode : "focus";
    return {
      mode: mode, running: !!d.running, endsAt: d.endsAt || null,
      remaining: typeof d.remaining === "number" ? d.remaining : durs[mode] * 60,
      done: d.done || 0, ref: d.ref || null, durs: durs
    };
  })();
  function tSave() { ls(T_KEY, T); }
  function tLeft() { return T.running ? Math.max(0, Math.ceil((T.endsAt - Date.now()) / 1000)) : T.remaining; }
  function mmss(sec) { return pad(Math.floor(sec / 60)) + ":" + pad(sec % 60); }

  var audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function chime() {
    try {
      if (!audioCtx) return;
      [0, 0.28, 0.56].forEach(function (t, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), at = audioCtx.currentTime + t;
        o.type = "sine"; o.frequency.value = i === 2 ? 1046.5 : 880;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
        o.connect(g); g.connect(audioCtx.destination); o.start(at); o.stop(at + 0.26);
      });
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  }
  function notify(text) {
    try {
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        new Notification("Life OS", { body: text, icon: "icons/icon-192.png" });
      }
    } catch (e) {}
  }

  function tStart() {
    unlockAudio();
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
    if (T.remaining <= 0) T.remaining = T.durs[T.mode] * 60;
    T.running = true; T.endsAt = Date.now() + T.remaining * 1000; tSave(); paintFocus();
  }
  function tPause() { T.remaining = tLeft(); T.running = false; T.endsAt = null; tSave(); paintFocus(); }
  function tSetMode(m) { T.mode = m; T.running = false; T.endsAt = null; T.remaining = T.durs[m] * 60; tSave(); paintFocus(true); }
  function tReset() { tSetMode(T.mode); }
  function nextMode() { return T.mode === "focus" ? (T.done % 4 === 0 ? "long" : "short") : "focus"; }
  function tSkip() {
    if (T.mode === "focus") T.done++;
    tSetMode(nextMode());
  }
  function tComplete() {
    var was = T.mode;
    if (was === "focus") {
      T.done++;
      Store.data.focusLog.push({ at: Date.now(), mins: T.durs.focus, ref: T.ref });
      Store.save();
    }
    tSetMode(nextMode());
    chime();
    notify(was === "focus" ? "Focus done. Time for a " + (T.mode === "long" ? "long" : "short") + " break." : "Break over. Ready to focus?");
    renderAll();
  }
  function focusTick() {
    if (T.running && tLeft() <= 0) { tComplete(); return; }
    paintFocus();
  }

  function refItem(ref) {
    if (!ref) return null;
    var it = ref.kind === "hw" ? hwById(ref.id) : taskById(ref.id);
    return it && !it.done ? it : null;
  }
  function pickFocus(kind, id) {
    T.ref = T.ref && T.ref.kind === kind && T.ref.id === id ? null : { kind: kind, id: id };
    tSave(); renderMain();
  }
  function todaysFocus() {
    var t0 = startOfDay(new Date()).getTime();
    var list = Store.data.focusLog.filter(function (x) { return x.at >= t0; });
    return { n: list.length, mins: list.reduce(function (a, x) { return a + x.mins; }, 0) };
  }

  // the small parts that change every second
  function paintFocus(full) {
    var left = tLeft(), now = new Date();
    var c = $("cntFocus"); if (c) c.textContent = T.running ? mmss(left) : "";
    document.title = T.running ? mmss(left) + " · " + MODES[T.mode] : "Life OS";
    var ff = $("factFocus"); if (ff && T.running) ff.innerHTML = "<b>" + mmss(left) + "</b> left · " + MODES[T.mode];
    if (!$("fTime")) return;
    if (full) { renderMain(); return; }
    $("fTime").textContent = mmss(left);
    $("fClock").textContent = hhmm(now) + ":" + pad(now.getSeconds());
    var total = T.durs[T.mode] * 60;
    $("fBar").style.width = (100 * (total - left) / total).toFixed(2) + "%";
    var end = new Date(Date.now() + left * 1000);
    $("fSub").textContent = (T.mode === "focus" ? "Session " + (T.done % 4 + 1) + " of 4" : MODES[T.mode]) +
      " · " + (T.running ? "ends at " + hhmm(end) : left === total ? T.durs[T.mode] + " min" : "paused");
    var b = $("fStart");
    b.innerHTML = icon(T.running ? "pause" : "play") + "<span>" + (T.running ? "Pause" : left < total ? "Resume" : "Start") + "</span>";
    b.setAttribute("aria-label", T.running ? "Pause" : "Start");
  }

  function renderFocus() {
    $("headActions").innerHTML = '<span class="mini-clock" id="fClock" aria-label="Current time"></span>' +
      '<button type="button" class="ibtn" id="fDursBtn" title="Timer lengths" aria-label="Timer lengths">' + icon("sliders-horizontal") + "</button>";

    var now = new Date(), today = isoDate(now), cw = weekKey(now), ti = todayIdx();
    var hw = hwList().filter(function (h) {
      return !h.done && ((h.due && dayDiff(h.due) <= 1) || h.plan === today);
    }).sort(byDue);
    var tk = tasks().filter(function (t) { return !t.done && t.week === cw && (t.day === ti || t.day == null); })
      .sort(function (a, b) { return (a.day == null) - (b.day == null) || a.createdAt - b.createdAt; });
    var fallback = !hw.length && !tk.length;
    if (fallback) tk = tasks().filter(function (t) { return !t.done; }).sort(byCreatedDesc).slice(0, 6);

    var cur = refItem(T.ref);
    var working = cur
      ? '<div class="f-working"><span class="fw-k">Working on</span><span class="fw-v">' + esc(cur.title) + "</span>" +
        '<button type="button" class="ibtn sm" data-unpick title="Clear" aria-label="Clear the current task">' + icon("x") + "</button></div>"
      : '<div class="f-working empty-pick">' + icon("target") + "<span>Tap a task below to focus on it</span></div>";

    var stats = todaysFocus();
    var rows = hw.map(function (h) { return hwRow(h, "focus"); }).join("") + tk.map(function (t) { return taskRow(t, "focus"); }).join("");

    $("view").innerHTML = '<div class="page focus">' +
      '<div class="modes" role="tablist" aria-label="Timer mode">' +
        Object.keys(MODES).map(function (m) {
          return '<button type="button" role="tab" data-tmode="' + m + '" aria-selected="' + (T.mode === m) + '">' + MODES[m] + "</button>";
        }).join("") + "</div>" +
      '<div class="timer">' +
        '<div class="t-time" id="fTime" role="timer" aria-live="off"></div>' +
        '<div class="t-bar"><i id="fBar"></i></div>' +
        '<div class="t-sub" id="fSub"></div>' +
      "</div>" +
      '<div class="t-controls">' +
        '<button type="button" class="ibtn lg" id="fReset" title="Reset" aria-label="Reset">' + icon("rotate-ccw") + "</button>" +
        '<button type="button" class="btn solid t-main" id="fStart"></button>' +
        '<button type="button" class="ibtn lg" id="fSkip" title="Skip to ' + MODES[nextMode()].toLowerCase() + '" aria-label="Skip">' + icon("skip-forward") + "</button>" +
      "</div>" +
      working +
      '<div class="section-h"><span>' + (fallback ? "To-dos" : "Today") + '</span><span class="gd">' +
        (stats.n ? stats.n + " " + plural(stats.n, "session", "sessions") + " · " + stats.mins + " min focused" : "No sessions yet today") + "</span></div>" +
      '<div class="list f-list">' + rows + "</div>" +
      (rows ? "" : '<div class="empty">Nothing planned for today.</div>') +
      addRow("week:" + cw + ":" + ti, "New task for today") +
    "</div>";

    if (cur && T.ref) {
      var sel = document.querySelector('[data-' + (T.ref.kind === "hw" ? "hw" : "task") + '="' + T.ref.id + '"]');
      if (sel) sel.classList.add("focused");
    }
    paintFocus();
  }

  $("view").addEventListener("click", function (e) {
    if (ui.route.name !== "focus") return;
    var m = e.target.closest("[data-tmode]");
    if (m) { tSetMode(m.getAttribute("data-tmode")); return; }
    if (e.target.closest("#fStart")) { if (T.running) tPause(); else tStart(); return; }
    if (e.target.closest("#fReset")) { tReset(); return; }
    if (e.target.closest("#fSkip")) { tSkip(); return; }
    if (e.target.closest("[data-unpick]")) { T.ref = null; tSave(); renderMain(); }
  });

  // timer lengths popover
  document.addEventListener("click", function (e) {
    var b = e.target.closest("#fDursBtn"); if (!b) return;
    e.stopPropagation();
    var m = makeMenu(b); if (!m) return;
    m.classList.add("durs");
    m.innerHTML = '<p class="m-title">Timer lengths</p>' + [["focus", "Focus"], ["short", "Short break"], ["long", "Long break"]].map(function (x) {
      return '<label class="dur"><span>' + x[1] + '</span><input type="number" min="1" max="180" inputmode="numeric" id="dur-' + x[0] + '" value="' + T.durs[x[0]] + '"><span class="u">min</span></label>';
    }).join("");
    m.addEventListener("change", function (ev) {
      var inp = ev.target.closest("input"); if (!inp) return;
      var k = inp.id.slice(4), v = Math.max(1, Math.min(180, parseInt(inp.value, 10) || T.durs[k]));
      inp.value = v; T.durs[k] = v;
      if (!T.running && T.mode === k) T.remaining = v * 60;
      tSave(); paintFocus(true);
    });
  });

  function focusFact() {
    var s = todaysFocus();
    var txt = T.running
      ? "<b>" + mmss(tLeft()) + "</b> left · " + MODES[T.mode]
      : s.n ? "<b>" + s.n + "</b> " + plural(s.n, "session", "sessions") + " · " + s.mins + " min today" : "Start a focus session";
    return '<div class="hp"><span class="hk">' + icon("timer") + 'Focus</span><span class="hv"><a href="#focus" id="factFocus">' + txt + "</a></span></div>";
  }

  /* =========================================================
     Hubs (Apple layout on the phone), back button, tab bar, layout picker
     ========================================================= */
  function hubRow(href, iconHtml, label, count, cls) {
    return '<a class="hub-row' + (cls ? " " + cls : "") + '" href="' + href + '">' + iconHtml + '<span class="hub-l">' + label + "</span>" +
      (count ? '<span class="hub-c">' + count + "</span>" : "") + icon("chevron-right", "hub-chev") + "</a>";
  }

  function renderTasksHub() {
    $("headActions").innerHTML = "";
    var open = tasks().filter(function (t) { return !t.done; }), cw = weekKey(new Date());
    $("view").innerHTML = '<div class="page hub"><div class="page-head"><div><h1>Tasks</h1></div></div>' +
      '<div class="list hub-list">' +
        hubRow("#todos", icon("list-todo", "sq sq-blue"), "To-dos", open.length) +
        hubRow("#week", icon("calendar-days", "sq sq-red"), "This week", open.filter(function (t) { return t.week === cw; }).length) +
      "</div>" +
      '<div class="section-h"><span>Projects</span></div>' +
      '<div class="list hub-list">' +
        projects().map(function (p) {
          return hubRow("#project-" + p.id, icon("folder", "sq sq-gray"), esc(p.name), open.filter(function (t) { return t.projectId === p.id; }).length);
        }).join("") +
        '<form class="hub-row hub-new" id="hubNewProject">' + icon("plus", "sq sq-ghost") +
          '<input type="text" placeholder="New project" maxlength="80" autocomplete="off" aria-label="New project" enterkeyhint="done"></form>' +
      "</div></div>";
  }

  function renderSchoolHub() {
    $("headActions").innerHTML = "";
    var openHw = hwList().filter(function (h) { return !h.done; });
    var late = openHw.filter(function (h) { return h.due && dayDiff(h.due) < 0; }).length;
    $("view").innerHTML = '<div class="page hub"><div class="page-head"><div><h1>School</h1><div class="page-sub">' + schoolFact() + "</div></div></div>" +
      '<div class="list hub-list">' +
        hubRow("#timetable", icon("calendar-clock", "sq sq-orange"), "Timetable", "") +
        hubRow("#homework", icon("notebook-pen", "sq sq-green"), "Homework",
          late ? '<span class="late">' + late + " overdue</span> · " + openHw.length : openHw.length) +
      "</div>" +
      '<div class="section-h"><span>Subjects</span></div>' +
      '<div class="list hub-list">' +
        subjects().map(function (s) {
          return hubRow("#subject-" + s.id, '<span class="hub-dot" style="background:' + s.color + '"></span>', esc(s.name),
            openHw.filter(function (h) { return h.subjectId === s.id; }).length);
        }).join("") +
      "</div></div>";
  }

  $("view").addEventListener("submit", function (e) {
    var f = e.target.closest("#hubNewProject"); if (!f) return;
    e.preventDefault();
    var p = addProject(f.querySelector("input").value);
    if (p) location.hash = "project-" + p.id;
  });

  function backFor(r) {
    if (["todos", "week", "project"].indexOf(r.name) >= 0) return ["#tasks", "Tasks"];
    if (["timetable", "homework", "subject"].indexOf(r.name) >= 0) return ["#school", "School"];
    if (r.name === "note") {
      var n = noteById(r.id), s = n && subjectById(n.subjectId);
      return s ? ["#subject-" + s.id, s.name] : ["#school", "School"];
    }
    return null;
  }
  function renderChrome() {
    var r = ui.route, b = backFor(r), el = $("backBtn");
    if (b) { el.hidden = false; el.setAttribute("href", b[0]); $("backLabel").textContent = b[1]; el.classList.toggle("always", r.name === "note"); }
    else el.hidden = true;
    var tab = r.name === "home" ? "home" : r.name === "focus" ? "focus" : ["tasks", "todos", "week", "project"].indexOf(r.name) >= 0 ? "tasks" : "school";
    document.querySelectorAll("#tabbar [data-tab]").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-tab") === tab); });
  }
  $("tabSettings").addEventListener("click", function () { openSettings(); });

  var LAYOUT_KEY = "lifeos.layout";
  function layoutChoice() { try { return localStorage.getItem(LAYOUT_KEY) || "apple"; } catch (e) { return "apple"; } }
  function renderLayouts() {
    var cur = layoutChoice();
    var prev = {
      apple: '<i class="lp-side"><b></b><b></b><b></b></i><i class="lp-main"><b class="lp-title"></b><b class="lp-card"></b><b class="lp-card lp-short"></b></i>',
      obsidian: '<i class="lp-side lp-tree"><b></b><b class="lp-in"></b><b class="lp-in"></b><b></b></i><i class="lp-main"><b class="lp-bar"></b><b class="lp-line"></b><b class="lp-line"></b><b class="lp-line lp-short"></b></i><i class="lp-panel"></i>'
    };
    $("layoutGrid").innerHTML = [["apple", "Simple", "tab bar, sheets"], ["obsidian", "Obsidian", "tree, side panel"]].map(function (l) {
      return '<button type="button" class="theme-card layout-card" role="radio" data-layout-key="' + l[0] + '" aria-checked="' + (l[0] === cur) + '">' +
        '<div class="tprev lprev lprev-' + l[0] + '">' + prev[l[0]] + "</div>" +
        '<div class="tname"><span>' + l[1] + " <small>" + l[2] + "</small></span>" + icon("check") + "</div></button>";
    }).join("");
  }
  $("layoutGrid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-layout-key]"); if (!b) return;
    var k = b.getAttribute("data-layout-key");
    try { localStorage.setItem(LAYOUT_KEY, k); } catch (err) {}
    window.lifeosApplyLayout(k);
    app.classList.remove("side-open");
    renderLayouts(); renderAll(); updateScrim();
  });

  /* =========================================================
     Налаштування
     ========================================================= */
  var THEME_KEY = "lifeos.theme";
  function themeChoice() { try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { return "auto"; } }

  function previewInner(t) {
    return '<div class="ts" style="background:' + t.side + ";border-right-color:" + t.line + '">' +
        '<i style="background:' + t.faint + ';width:70%"></i><i style="background:' + t.hover + '"></i><i style="background:' + t.faint + ';width:55%"></i></div>' +
      '<div class="tm" style="background:' + t.bg + '">' +
        '<i style="background:' + t.fg + ';width:62%;height:5px"></i><i style="background:' + t.muted + ';width:85%"></i>' +
        '<i style="background:' + t.muted + ';width:70%"></i><i style="background:' + t.accent + ';width:32%"></i></div>';
  }

  function renderThemes() {
    var T = window.LIFEOS_THEMES, cur = themeChoice();
    var cards = [["auto", "Auto", "follows system"]].concat(Object.keys(T).map(function (k) { return [k, T[k].name, T[k].dark ? "dark" : "light"]; }));
    $("themeGrid").innerHTML = cards.map(function (c) {
      var prev = c[0] === "auto"
        ? previewInner(T.paper) + '<div class="half">' + previewInner(T.ink) + "</div>"
        : previewInner(T[c[0]]);
      return '<button type="button" class="theme-card" role="radio" data-theme-key="' + c[0] + '" aria-checked="' + (c[0] === cur) + '">' +
        '<div class="tprev">' + prev + "</div>" +
        '<div class="tname"><span>' + c[1] + " <small>" + c[2] + "</small></span>" + icon("check") + "</div></button>";
    }).join("");
  }
  $("themeGrid").addEventListener("click", function (e) {
    var b = e.target.closest(".theme-card"); if (!b) return;
    var k = b.getAttribute("data-theme-key");
    try { localStorage.setItem(THEME_KEY, k); } catch (err) {}
    window.lifeosApplyTheme(k); renderThemes();
  });
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onSys = function () { if (themeChoice() === "auto") window.lifeosApplyTheme("auto"); };
    if (mq.addEventListener) mq.addEventListener("change", onSys); else if (mq.addListener) mq.addListener(onSys);
  }

  function showPane(name) {
    document.querySelectorAll("#settings .pane").forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== name; });
    document.querySelectorAll("#settings .modal-nav .nav-item").forEach(function (b) {
      b.setAttribute("aria-current", String(b.getAttribute("data-pane") === name));
    });
  }
  function openSettings() {
    if (isNarrow()) setSidebar(false);
    renderThemes(); renderLayouts();
    var n = tasks().length, m = projects().length;
    var hn = hwList().length, nn = notesList().length;
    $("dataStat").textContent = n + " " + plural(n, "task", "tasks") + " · " + m + " " + plural(m, "project", "projects") +
      " · " + hn + " homework · " + nn + " " + plural(nn, "note", "notes");
    showPane("look");
    $("settings").hidden = false;
    var sel = document.querySelector('.theme-card[aria-checked="true"]'); if (sel) sel.focus();
  }
  function closeSettings() { $("settings").hidden = true; }
  $("openSettings").addEventListener("click", openSettings);
  $("closeSettings").addEventListener("click", closeSettings);
  $("settings").addEventListener("click", function (e) {
    if (e.target === $("settings")) closeSettings();
    var b = e.target.closest(".modal-nav .nav-item"); if (b) showPane(b.getAttribute("data-pane"));
  });

  /* =========================================================
     Клавіатура
     ========================================================= */
  document.addEventListener("keydown", function (e) {
    var typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "");
    if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); $("settings").hidden ? openSettings() : closeSettings(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); setSidebar(!sidebarIsOpen()); return; }
    if (e.key === "Escape") {
      var m = document.querySelector(".menu");
      if (m) { m.remove(); return; }
      if (!$("settings").hidden) { closeSettings(); return; }
      if (ui.selected && !typing) { closeDetail(); return; }
      if (ui.selected && typing) { document.activeElement.blur(); return; }
      if (app.classList.contains("side-open")) { setSidebar(false); return; }
    }
    if (!typing && e.key === " " && ui.route.name === "focus" && $("settings").hidden && !ui.selected) {
      e.preventDefault(); if (T.running) tPause(); else tStart(); return;
    }
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "n" || e.key === "N") && $("settings").hidden) {
      e.preventDefault();
      if (ui.route.name === "home") { ui.refocus = "todos"; location.hash = "todos"; return; }
      var first = document.querySelector("#view .add-row:not([hidden]) input");
      if (first) first.focus();
      else { var g = document.querySelector("#view [data-group-add]"); if (g) g.click(); }
    }
  });

  /* =========================================================
     Перемальовування
     ========================================================= */
  function renderMain() {
    var keepScroll = $("view").scrollTop;
    var r = ui.route;
    if (r.name === "home") renderHome();
    else if (r.name === "tasks") renderTasksHub();
    else if (r.name === "focus") renderFocus();
    else if (r.name === "school") renderSchoolHub();
    else if (r.name === "todos") renderTodos();
    else if (r.name === "week") renderWeek();
    else if (r.name === "project") renderProject();
    else if (r.name === "timetable") renderTimetable();
    else if (r.name === "homework") renderHomework();
    else if (r.name === "subject") renderSubject();
    else if (r.name === "note") renderNote();
    renderSidebar(); renderCrumbs(); renderChrome();
    $("view").scrollTop = keepScroll;
    if (ui.refocus) {
      var inp = document.querySelector('[data-add-key="' + ui.refocus + '"]');
      if (inp) inp.focus();
      ui.refocus = null;
    }
  }
  function renderAll() { renderMain(); if (ui.selected) renderDetail(); renderStatus(); }

  window.addEventListener("hashchange", function () {
    var prev = ui.route.name + ui.route.id;
    ui.route = parseHash();
    if (prev !== ui.route.name + ui.route.id) { $("view").scrollTop = 0; if (ui.route.name !== "week") ui.weekOffset = 0; }
    var m = document.querySelector(".menu"); if (m) m.remove();
    if (ui.selected && !(ui.selKind === "hw" ? hwById(ui.selected) : taskById(ui.selected))) closeDetail();
    if (ui.route.name !== "timetable") { ui.ttEdit = false; ui.ttNew = null; }
    renderMain();
    ls("lifeos.lastRoute", location.hash);
  });

  window.addEventListener("resize", function () {
    if (!isNarrow()) app.classList.remove("side-open");
    else app.classList.remove("side-closed");
    updateScrim();
  });

  /* =========================================================
     Старт
     ========================================================= */
  if (!isNarrow() && ls("lifeos.sideClosed") === true) app.classList.add("side-closed");
  if (!location.hash) { var last = ls("lifeos.lastRoute"); if (last) history.replaceState(null, "", last); }
  ensureSchool();
  ui.route = parseHash();
  renderAll();
  tick();
  loadWeather();
  setInterval(function () { loadWeather(); }, WX_AGE);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { renderAll(); loadWeather(); }
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  window.__lifeos = { isoWeek: isoWeek, weeksInYear: weeksInYear, Store: Store };
})();
