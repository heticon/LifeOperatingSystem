/* Life OS — To-dos, This week, projects, task detail panel.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

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
  if (ctx === "project" && t.todo) out.push("<span>" + icon("list-todo") + "In To-dos</span>");
  if (t.notes && t.notes.trim()) out.push('<span class="note" title="Has notes">' + icon("pencil") + "</span>");
  return out.length ? '<span class="task-meta">' + out.join("") + "</span>" : "";
}

function taskRow(t, ctx) {
  return '<div class="task' + (t.done ? " done" : "") + (ui.selected === t.id ? " sel" : "") + '" data-task="' + t.id + '">' +
    '<button type="button" class="check" role="checkbox" aria-checked="' + t.done + '" aria-label="Done">' + icon("check") + "</button>" +
    '<div class="task-main"><span class="task-title">' + esc(t.title) + "</span>" + metaFor(t, ctx) + "</div>" +
    (ctx === "project" ? todoPin(t) : "") + "</div>";
}
function todoPin(t) {
  var lbl = t.todo ? "Remove from To-dos" : "Add to To-dos";
  return '<button type="button" class="ibtn todo-pin' + (t.todo ? " on" : "") + '" data-todo-pin aria-pressed="' + !!t.todo + '" title="' + lbl + '" aria-label="' + lbl + '">' +
    icon(t.todo ? "list-minus" : "list-plus") + "</button>";
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
  var mine = tasks().filter(inTodos);
  var open = mine.filter(function (t) { return !t.done; }).sort(byCreatedDesc);
  var done = mine.filter(function (t) { return t.done; }).sort(byDoneDesc);
  $("view").innerHTML =
    '<div class="page">' +
      '<div class="page-head"><div><h1>To-dos</h1><div class="page-sub">' +
        (open.length ? open.length + " " + plural(open.length, "open task", "open tasks") : done.length ? "All done" : "No tasks yet") +
      "</div></div></div>" +
      addRow("todos", "New task") +
      '<div class="list">' + open.map(function (t) { return taskRow(t, "todos"); }).join("") + "</div>" +
      (open.length ? "" : '<div class="empty">Type a task above and press Enter. Project tasks show here when you add them to To-dos.</div>') +
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
  function group(gkey, label, date, list, cls, tag, hws, evs) {
    return '<section class="group' + (cls ? " " + cls : "") + '">' +
      '<div class="group-title"><span class="gt">' + label + "</span>" + (date ? '<span class="gd">' + date + "</span>" : "") +
      (tag ? '<span class="tag">' + tag + "</span>" : "") +
      '<button type="button" class="ibtn sm gadd" data-group-add="' + gkey + '" title="Add task" aria-label="Add task: ' + label + '">' + icon("plus") + "</button></div>" +
      '<div class="list">' + (evs || "") + sortIn(list).map(function (t) { return taskRow(t, "week"); }).join("") +
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
    // only real appointments here (calendars shown in Month view) — the daily Schedule lives in Calendar
    var evs = eventsOn(d).filter(function (e) { return monthOn(e.cal); }).map(function (e) { return evRow(e, d); }).join("");
    html += group("week:" + key + ":" + i, DAYS[i], fmtDayMonth.format(d), list, past ? "past" : "", i === tIdx ? "Today" : "", hws, evs);
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
  if (!isHw && e.target.closest("[data-todo-pin]")) { toggleTodo(id); return; }
  if (e.target.closest(".check")) { if (isHw) toggleHw(id, row); else toggleDone(id, row); return; }
  if (ui.route.name === "focus") { pickFocus(isHw ? "hw" : "task", id); return; }
  openDetail(id, isHw ? "hw" : "task");
});

function toggleTodo(id) {
  var t = taskById(id); if (!t || !t.projectId) return;
  updateTask(id, { todo: !t.todo });
  renderAll(); if (ui.selected === id) renderDetail();
}

/* right-click (or long-press on phones) a project task → add to / remove from To-dos */
function openTaskCtx(t, x, y) {
  var old = document.querySelector(".menu"); if (old) old.remove();
  var m = document.createElement("div");
  m.className = "menu ctx"; m.setAttribute("role", "menu");
  m.innerHTML = '<button type="button" role="menuitem" data-ctx="todo">' + icon(t.todo ? "list-minus" : "list-plus") + "<span>" + (t.todo ? "Remove from To-dos" : "Add to To-dos") + "</span></button>" +
    '<button type="button" role="menuitem" data-ctx="project">' + icon("folder") + "<span>Open project</span></button>";
  document.body.appendChild(m);
  m.style.left = Math.max(8, Math.min(x, window.innerWidth - m.offsetWidth - 8)) + "px";
  m.style.top = Math.max(8, Math.min(y, window.innerHeight - m.offsetHeight - 8)) + "px";
  m.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-ctx]"); if (!b) return;
    m.remove();
    if (b.getAttribute("data-ctx") === "todo") toggleTodo(t.id); else location.hash = "project-" + t.projectId;
  });
  m.querySelector("button").focus();
}
function ctxTask(target) {
  var row = target.closest && target.closest(".task[data-task]");
  var t = row && taskById(row.getAttribute("data-task"));
  return t && t.projectId ? t : null;
}
$("view").addEventListener("contextmenu", function (e) {
  var t = ctxTask(e.target); if (!t) return;
  e.preventDefault(); openTaskCtx(t, e.clientX, e.clientY);
});
var lp = null;
$("view").addEventListener("touchstart", function (e) {
  var t = ctxTask(e.target); if (!t || e.touches.length > 1) return;
  var p = e.touches[0], x = p.clientX, y = p.clientY;
  lp = { x: x, y: y, timer: setTimeout(function () { lp.fired = true; if (navigator.vibrate) navigator.vibrate(10); openTaskCtx(t, x, y); }, 500) };
}, { passive: true });
$("view").addEventListener("touchmove", function (e) {
  if (lp && Math.hypot(e.touches[0].clientX - lp.x, e.touches[0].clientY - lp.y) > 10) { clearTimeout(lp.timer); lp = null; }
}, { passive: true });
$("view").addEventListener("touchend", function (e) {
  if (!lp) return; clearTimeout(lp.timer);
  if (lp.fired) e.preventDefault(); // keep the menu open: no click on the row
  lp = null;
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
      m.innerHTML = "<p>Delete “" + esc(p.name) + "”? Its tasks will move to To-dos.</p>" +
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
        (t.projectId ? '<div class="prop"><span class="prop-k">' + icon("list-todo") + 'To-dos</span><div class="sel-wrap"><select id="dTodo">' +
          '<option value="1"' + (t.todo ? " selected" : "") + '>Shown in To-dos</option><option value=""' + (t.todo ? "" : " selected") + ">Project only</option></select>" + icon("chevron-down") + "</div></div>" : "") +
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
  $("dProject").addEventListener("change", function (e) {
    var v = e.target.value || null, patch = { projectId: v };
    if (v && !t.projectId) patch.todo = true; // a to-do moved into a project stays in To-dos
    updateTask(t.id, patch); renderMain(); renderDetail();
  });
  if ($("dTodo")) $("dTodo").addEventListener("change", function (e) { updateTask(t.id, { todo: !!e.target.value }); renderMain(); });
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
