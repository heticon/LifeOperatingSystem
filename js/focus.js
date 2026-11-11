/* Life OS — Focus: Pomodoro timer.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

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
// re-read the timer another window (split pane / other tab) saved
function tLoad() {
  var d = ls(T_KEY); if (!d) return false;
  ["mode", "running", "endsAt", "remaining", "done", "ref", "durs"].forEach(function (k) { if (k in d) T[k] = d[k]; });
  return true;
}
function tComplete() {
  // the other pane may already have finished this session — then just follow it (no double log, no double chime)
  var saved = ls(T_KEY);
  if (saved && (saved.running !== T.running || saved.endsAt !== T.endsAt || saved.mode !== T.mode)) { tLoad(); renderAll(); return; }
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
    '<div class="page-head"><div><h1>Focus</h1><div class="page-sub">' +
      (stats.n ? stats.n + " " + plural(stats.n, "session", "sessions") + " · " + stats.mins + " min today" : "No sessions yet today") + "</div></div>" +
    '<div class="modes" role="tablist" aria-label="Timer mode">' +
      Object.keys(MODES).map(function (m) {
        return '<button type="button" role="tab" data-tmode="' + m + '" aria-selected="' + (T.mode === m) + '">' + MODES[m] + "</button>";
      }).join("") + "</div></div>" +
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
    '<div class="section-h"><span>' + (fallback ? "To-dos" : "Today") + '</span><span class="gd">' + "" + "</span></div>" +
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

// another window changed the timer → show the same thing here
window.addEventListener("storage", function (e) {
  if (e.key !== T_KEY) return;
  if (!tLoad()) return;
  if (ui.route.name === "focus") renderMain(); else paintFocus();
});
