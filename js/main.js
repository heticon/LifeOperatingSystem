/* Life OS — Rendering, start-up, account + sync, split view, export UI.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

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
  else if (r.name === "calendar") renderCalendar();
  else if (r.name === "browse") renderBrowse();
  else if (r.name === "links") renderLinks();
  else if (r.name === "project") renderProject();
  else if (r.name === "timetable") renderTimetable();
  else if (r.name === "homework") renderHomework();
  else if (r.name === "subject") renderSubject();
  else if (r.name === "note") renderNote();
  renderSidebar(); renderCrumbs(); renderChrome();
  if (EMBED) embedHead();
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
  if (!EMBED) ls("lifeos.lastRoute", location.hash);
});

window.addEventListener("resize", function () {
  if (!isNarrow()) app.classList.remove("side-open");
  else app.classList.remove("side-closed");
  updateScrim();
  if (ui.route.name === "calendar") { clearTimeout(cui.rz); cui.rz = setTimeout(renderCalendar, 150); }
});

/* =========================================================
   Старт
   ========================================================= */
if (!isNarrow() && ls("lifeos.sideClosed") === true) app.classList.add("side-closed");
if (!location.hash) { var last = ls("lifeos.lastRoute"); if (last) history.replaceState(null, "", last); }
ensureSchool();
ui.route = parseHash();
renderTabbar();
renderAll();
tick();
loadWeather();
setInterval(function () { loadWeather(); }, WX_AGE);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") { renderAll(); loadWeather(); }
});

/* =========================================================
   Акаунт і синхронізація (sync.js)
   ========================================================= */
var pendingRender = false;
function renderWhenIdle() {
  var a = document.activeElement, field = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !a.closest("#auth");
  // хтось друкує — не чіпаємо екран, оновимо, коли поле втратить фокус
  if (field && a.value) {
    if (!pendingRender) {
      pendingRender = true;
      a.addEventListener("blur", function () { pendingRender = false; renderAll(); }, { once: true });
    }
    return;
  }
  var key = field ? (a.id ? "#" + a.id : a.getAttribute("placeholder") ? '[placeholder="' + a.getAttribute("placeholder") + '"]' : null) : null;
  renderAll();
  if (key) { var again = document.querySelector(key); if (again && again !== document.activeElement) again.focus(); }
}
function syncLine(st) {
  var n = st.pending, waiting = n ? " · " + n + " " + plural(n, "change", "changes") + " waiting" : "";
  if (st.state === "syncing") return "Syncing…";
  if (st.state === "offline") return "Offline" + waiting + ". Syncs when you’re back online.";
  if (st.state === "error") return "Sync failed" + waiting + (st.error ? " · " + st.error : "");
  if (st.at) return "Synced at " + shortWhen(st.at) + waiting;
  return "Not synced yet" + waiting;
}
function renderAccount() {
  if (!window.LifeSync) return;
  var st = window.LifeSync.status();
  $("accEmail").textContent = st.email || "Not signed in";
  $("accStatus").textContent = st.email ? syncLine(st) : "Sync is off.";
  $("syncNow").disabled = !st.email || st.state === "syncing";
}
function showAuth(on) {
  $("auth").hidden = !on;
  document.body.classList.toggle("auth-on", on);
  if (on) setTimeout(function () { $("authEmail").focus(); }, 50);
}
if (window.LifeSync && !EMBED) {
  if (!window.LifeSync.hasSession()) showAuth(true);
  window.LifeSync.init({
    records: function () { return Store.records(); },
    apply: function (changes, full) {
      var map = full ? {} : Store.records();
      changes.forEach(function (c) { if (c.deleted) delete map[c.id]; else map[c.id] = { k: c.k, d: c.d }; });
      Store.data = Store.fromRecords(map, full ? { tasks: [], projects: [], school: null } : Store.data);
      ls(Store.KEY, Store.data);
      if (!Store.data.school) ensureSchool();
      renderWhenIdle();
    },
    backup: function () { ls("lifeos.data.backup", { at: Date.now(), data: Store.data }); },
    onStatus: function () { renderAccount(); if (!$("settings").hidden) renderCalendarPane(); },
    onSignedOut: function () { showAuth(true); }
  }).then(finishGoogleReturn);
}
$("authForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var email = $("authEmail").value.trim(), pass = $("authPass").value;
  if (!email || !pass) { $("authErr").textContent = "Enter your email and password."; return; }
  if (!navigator.onLine) { $("authErr").textContent = "You’re offline. Connect to the internet to sign in."; return; }
  $("authErr").textContent = ""; $("authBtn").disabled = true; $("authBtn").textContent = "Signing in…";
  window.LifeSync.signIn(email, pass).then(function () {
    $("authPass").value = ""; showAuth(false); renderAll(); renderAccount(); finishGoogleReturn();
  }, function (err) {
    var m = (err && err.message) || "";
    $("authErr").textContent = /invalid/i.test(m) ? "Wrong email or password." : (m || "Couldn’t sign in. Try again.");
  }).then(function () { $("authBtn").disabled = false; $("authBtn").textContent = "Sign in"; });
});
$("syncNow").addEventListener("click", function () { window.LifeSync.syncNow(); });
$("signOut").addEventListener("click", function () {
  var n = window.LifeSync.status().pending;
  var msg = n ? n + " " + plural(n, "change hasn’t", "changes haven’t") + " synced yet and will be lost. Sign out anyway?"
    : "Sign out? Your data will be removed from this device. It stays in your account.";
  if (!confirm(msg)) return;
  window.LifeSync.signOut().then(function () {
    ["lifeos.data", "lifeos.lastRoute", "lifeos.timer"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    location.reload();
  });
});
$("exportData").addEventListener("click", function () {
  var blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "lifeos-" + todayISO() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(watchUpdates).catch(function () {});
  });
}

/* Банер «New version available · Reload»: нова версія sw.js чекає, поки користувач погодиться */
function watchUpdates(reg) {
  var bar = document.getElementById("updateBar");
  var reloading = false;
  function offer(worker) {
    if (!worker || !navigator.serviceWorker.controller) return; // перше встановлення — не оновлення
    bar.hidden = false;
    document.getElementById("updateReload").onclick = function () { worker.postMessage("SKIP_WAITING"); };
  }
  document.getElementById("updateDismiss").onclick = function () { bar.hidden = true; };
  offer(reg.waiting);
  reg.addEventListener("updatefound", function () {
    var w = reg.installing;
    if (w) w.addEventListener("statechange", function () { if (w.state === "installed") offer(w); });
  });
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  // застосунок на телефоні може бути відкритим днями — перевіряємо оновлення при поверненні
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") reg.update().catch(function () {});
  });
}

/* =========================================================
   Split view: a second pane on the right (desktop only), like Obsidian.
   The pane is this same app in an iframe (?pane=1). Both share localStorage;
   the main window does the syncing. Tabs/headers appear only when split.
   ========================================================= */
function paneRoutes() {
  return [["#home", "Home"], ["#focus", "Focus"], ["#calendar", "Calendar"], ["#todos", "To-dos"], ["#week", "This week"],
    ["#timetable", "Timetable"], ["#homework", "Homework"], ["#links", "Links"]];
}
function paneLabel(h) { var PANE_ROUTES = paneRoutes(); for (var i = 0; i < PANE_ROUTES.length; i++) if (PANE_ROUTES[i][0] === h) return PANE_ROUTES[i][1]; return null; }
function embedHead() {
  var h = location.hash || "#home", cur = paneLabel(h);
  $("crumbs").innerHTML = '<label class="p2-pick"><span class="sr">Section</span><select id="p2Route" aria-label="Section in this pane">' +
    (cur ? "" : '<option value="' + esc(h) + '" selected>' + esc(document.title.replace(/ · Life OS$/, "") || "This page") + "</option>") +
    paneRoutes().map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === h ? " selected" : "") + ">" + r[1] + "</option>"; }).join("") +
    "</select>" + icon("chevron-down") + "</label>";
  if (!$("p2Close")) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "ibtn"; b.id = "p2Close"; b.title = "Close pane"; b.setAttribute("aria-label", "Close pane");
    b.innerHTML = icon("x");
    b.addEventListener("click", function () { parent.postMessage({ lifeosPane: "close" }, location.origin); });
    $("headActions").parentNode.appendChild(b);
  }
  $("p2Route").onchange = function (e) { location.hash = e.target.value; };
  try { parent.postMessage({ lifeosPane: "route", hash: h }, location.origin); } catch (e) {}
}
// both windows: when the other one saves, reload the data and redraw (the main window also queues it for sync)
window.addEventListener("storage", function (e) {
  if (e.key !== Store.KEY || !e.newValue) return;
  Store.load();
  if (!EMBED && window.LifeSync) window.LifeSync.changed();
  renderWhenIdle();
});
if (EMBED) {
  $("auth").hidden = true;
} else {
  var splitW = function () { return window.innerWidth >= 1000; };
  var openPane = function (hash) {
    if (!splitW()) { location.hash = hash; return; }
    var f = $("p2Frame");
    app.classList.add("split"); $("pane2").hidden = false;
    if (!f.getAttribute("src")) f.src = "./?pane=1" + hash;
    else f.contentWindow.location.hash = hash;
    ls("lifeos.pane2", hash); renderSplitBtn();
  };
  var closePane = function () {
    app.classList.remove("split"); $("pane2").hidden = true; $("p2Frame").removeAttribute("src");
    ls("lifeos.pane2", null); renderSplitBtn();
    if (ui.route.name === "calendar") renderCalendar();
  };
  var renderSplitBtn = function () {
    var on = app.classList.contains("split"), b = $("splitBtn");
    b.setAttribute("aria-pressed", on); b.title = on ? "Close split view" : "Split view: open this page on the right";
  };
  $("splitBtn").addEventListener("click", function () {
    if (app.classList.contains("split")) closePane(); else openPane(location.hash || "#home");
  });
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || !e.data.lifeosPane) return;
    if (e.data.lifeosPane === "close") closePane();
    if (e.data.lifeosPane === "route") ls("lifeos.pane2", e.data.hash);
  });
  // right-click a section in the sidebar → open it on the right
  $("sidebar").addEventListener("contextmenu", function (e) {
    var a = e.target.closest('a[href^="#"]'); if (!a || !splitW()) return;
    e.preventDefault();
    var old = document.querySelector(".menu"); if (old) old.remove();
    var m = document.createElement("div");
    m.className = "menu ctx"; m.setAttribute("role", "menu");
    m.innerHTML = '<button type="button" role="menuitem" data-ctx="right">' + icon("columns-2") + "<span>Open on the right</span></button>" +
      '<button type="button" role="menuitem" data-ctx="here">' + icon("chevron-right") + "<span>Open here</span></button>";
    document.body.appendChild(m);
    m.style.left = Math.min(e.clientX, window.innerWidth - m.offsetWidth - 8) + "px";
    m.style.top = Math.min(e.clientY, window.innerHeight - m.offsetHeight - 8) + "px";
    var href = a.getAttribute("href");
    m.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-ctx]"); if (!b) return;
      m.remove();
      if (b.getAttribute("data-ctx") === "right") openPane(href); else location.hash = href;
    });
    m.querySelector("button").focus();
    setTimeout(function () {
      document.addEventListener("click", function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("click", off); } });
    }, 0);
  });
  // drag the divider to resize
  $("p2Div").addEventListener("pointerdown", function (e) {
    e.preventDefault();
    var div = e.currentTarget; div.setPointerCapture(e.pointerId); app.classList.add("p2-drag");
    var move = function (ev) {
      var w = Math.max(320, Math.min(window.innerWidth - ev.clientX, window.innerWidth - 560));
      app.style.setProperty("--p2-w", w + "px");
    };
    var up = function () {
      div.removeEventListener("pointermove", move); div.removeEventListener("pointerup", up); app.classList.remove("p2-drag");
      ls("lifeos.p2w", app.style.getPropertyValue("--p2-w"));
      if (ui.route.name === "calendar") renderCalendar();
    };
    div.addEventListener("pointermove", move); div.addEventListener("pointerup", up);
  });
  if (ls("lifeos.p2w")) app.style.setProperty("--p2-w", ls("lifeos.p2w"));
  if (ls("lifeos.pane2") && splitW()) openPane(ls("lifeos.pane2"));
  renderSplitBtn();
}

window.__lifeos = { isoWeek: isoWeek, weeksInYear: weeksInYear, Store: Store, eventsOn: eventsOn, evTime: evTime, calFact: calFact, monthOn: monthOn, calendars: calendars };

// Export (export.js): show the size before downloading
function exOpts() { return { cal: $("exCal").value, done: $("exDone").value === "1" }; }
function exSize() {
  if (!window.LifeExport) return;
  var f = $("exFmt").value;
  window.LifeExport.build(f, exOpts()).then(function (r) {
    var kb = r.blob.size / 1024, tok = r.text ? Math.round(r.text.length / 4) : 0;
    $("exSize").textContent = (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + " KB" + (tok ? " · ~" + (tok >= 1000 ? (tok / 1000).toFixed(1) + "k" : tok) + " tokens" : "");
  });
}
["exFmt", "exCal", "exDone"].forEach(function (id) { $(id).addEventListener("change", exSize); });
$("exGo").addEventListener("click", function () { window.LifeExport.download($("exFmt").value, exOpts()).then(exSize); });
