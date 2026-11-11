/* Life OS — UI state, sidebar, header/status line, Home.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

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
  if (["todos", "week", "home", "tasks", "school", "focus", "calendar", "browse", "links"].indexOf(h) >= 0) return { name: h, id: null };
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
  if (!head || !body) return; // стара розмітка з кешу — не падаємо
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
  else if (r.name === "calendar") c.innerHTML = '<span class="cur">Calendar</span>';
  else if (r.name === "browse") c.innerHTML = '<span class="cur">Browse</span>';
  else if (r.name === "links") c.innerHTML = '<span class="cur">Links</span>';
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
        calFact() +
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
    renderStatus(); calNowTick();
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
