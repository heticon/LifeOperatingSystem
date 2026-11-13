/* Life OS — Hubs, back button, tab bar, layout picker.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

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
      hubRow("#todos", icon("list-todo", "sq sq-blue"), "To-dos", open.filter(inTodos).length) +
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

/* ---------- sections: Browse page, tab bar with pins ---------- */
// every section once; the phone tab bar = Home + up to 2 pinned + Browse + Settings
var SECTIONS = [
  { key: "calendar", label: "Calendar", icon: "calendar", href: "#calendar", routes: ["calendar"] },
  { key: "tasks", label: "Tasks", icon: "list-checks", href: "#tasks", routes: ["tasks", "todos", "week", "project"] },
  { key: "focus", label: "Focus", icon: "timer", href: "#focus", routes: ["focus"] },
  { key: "school", label: "School", icon: "graduation-cap", href: "#school", routes: ["school", "timetable", "homework", "subject", "note"] },
  { key: "links", label: "Links", icon: "link", href: "#links", routes: ["links"] }
];
var PINS_KEY = "lifeos.pins", MAX_PINS = 2;
function pins() {
  var p = ls(PINS_KEY);
  return Array.isArray(p) ? p.filter(function (k) { return SECTIONS.some(function (s) { return s.key === k; }); }).slice(0, MAX_PINS) : [];
}
function sectionOf(routeName) { return SECTIONS.find(function (s) { return s.routes.indexOf(routeName) >= 0; }) || null; }

function renderTabbar() {
  var tab = function (href, key, ic, label) {
    return '<a href="' + href + '" data-tab="' + key + '">' + icon(ic) + "<span>" + label + "</span></a>";
  };
  $("tabbar").innerHTML = tab("#home", "home", "house", "Home") +
    pins().map(function (k) { var s = SECTIONS.find(function (x) { return x.key === k; }); return tab(s.href, s.key, s.icon, s.label); }).join("") +
    tab("#browse", "browse", "layout-grid", "Browse") +
    '<button type="button" data-tab-settings>' + icon("settings") + "<span>Settings</span></button>";
  renderChrome();
}
$("tabbar").addEventListener("click", function (e) { if (e.target.closest("[data-tab-settings]")) openSettings(); });

function renderPinList() {
  var cur = pins();
  $("pinList").innerHTML = SECTIONS.map(function (s) {
    var on = cur.indexOf(s.key) >= 0, full = !on && cur.length >= MAX_PINS;
    return '<button type="button" class="pin-row" role="checkbox" aria-checked="' + on + '" data-pin="' + s.key + '"' + (full ? " disabled" : "") + ">" +
      icon(s.icon) + "<span>" + s.label + "</span>" + icon(on ? "check" : "pin", "pin-mark") + "</button>";
  }).join("");
}
$("pinList").addEventListener("click", function (e) {
  var b = e.target.closest("[data-pin]"); if (!b || b.disabled) return;
  var k = b.getAttribute("data-pin"), cur = pins(), i = cur.indexOf(k);
  if (i >= 0) cur.splice(i, 1); else if (cur.length < MAX_PINS) cur.push(k);
  ls(PINS_KEY, cur); renderPinList(); renderTabbar();
});

function renderBrowse() {
  $("headActions").innerHTML = "";
  var open = tasks().filter(function (t) { return !t.done; }), cw = weekKey(new Date());
  var openHw = hwList().filter(function (h) { return !h.done; });
  var late = openHw.filter(function (h) { return h.due && dayDiff(h.due) < 0; }).length;
  var nLinks = linkList().length;
  var sec = function (title, rows) { return '<div class="section-h"><span>' + title + '</span></div><div class="list hub-list">' + rows.join("") + "</div>"; };
  $("view").innerHTML = '<div class="page hub browse"><div class="page-head"><div><h1>Browse</h1><div class="page-sub">Everything in Life OS</div></div></div>' +
    sec("Plan", [hubRow("#calendar", icon("calendar"), "Calendar", ""), hubRow("#focus", icon("timer"), "Focus", "")]) +
    sec("Tasks", [hubRow("#todos", icon("list-todo"), "To-dos", open.filter(inTodos).length),
      hubRow("#week", icon("calendar-days"), "This week", open.filter(function (t) { return t.week === cw; }).length),
      hubRow("#tasks", icon("folder"), "Projects", projects().length)]) +
    sec("School", [hubRow("#timetable", icon("calendar-clock"), "Timetable", ""),
      hubRow("#homework", icon("notebook-pen"), "Homework", late ? '<span class="late">' + late + " overdue</span> · " + openHw.length : openHw.length),
      hubRow("#school", icon("graduation-cap"), "Subjects", subjects().length)]) +
    sec("Tools", [hubRow("#links", icon("link"), "Links", nLinks)]) +
    "</div>";
}

function backFor(r) {
  if (r.name === "project") return ["#tasks", "Tasks"];
  if (r.name === "subject") return ["#school", "School"];
  if (r.name === "note") {
    var n = noteById(r.id), s = n && subjectById(n.subjectId);
    return s ? ["#subject-" + s.id, s.name] : ["#school", "School"];
  }
  if (r.name === "home" || r.name === "browse") return null;
  // a pinned section's own page needs no back button; everything else goes back to Browse
  var sec = sectionOf(r.name);
  if (sec && pins().indexOf(sec.key) >= 0) {
    if (sec.href === "#" + r.name) return null;
    return [sec.href, sec.label];
  }
  return ["#browse", "Browse"];
}
function renderChrome() {
  var r = ui.route, b = backFor(r), el = $("backBtn");
  if (b) { el.hidden = false; el.setAttribute("href", b[0]); $("backLabel").textContent = b[1]; el.classList.toggle("always", r.name === "note"); }
  else el.hidden = true;
  var sec = sectionOf(r.name);
  var tab = r.name === "home" ? "home" : sec && pins().indexOf(sec.key) >= 0 ? sec.key : "browse";
  document.querySelectorAll("#tabbar [data-tab]").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-tab") === tab); });
}

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
