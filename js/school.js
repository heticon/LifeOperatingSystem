/* Life OS — School: timetable, homework, subjects, notes.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

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
