/* Life OS — Settings modal, keyboard shortcuts.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

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
function renderSizes() {
  var cur = (function () { try { return localStorage.getItem("lifeos.size") || "m"; } catch (e) { return "m"; } })();
  [].forEach.call($("sizeModes").querySelectorAll("[data-size]"), function (b) { b.setAttribute("aria-checked", b.getAttribute("data-size") === cur); b.setAttribute("aria-selected", b.getAttribute("data-size") === cur); });
}
$("sizeModes").addEventListener("click", function (e) {
  var b = e.target.closest("[data-size]"); if (!b) return;
  var k = b.getAttribute("data-size");
  try { localStorage.setItem("lifeos.size", k); } catch (err) {}
  window.lifeosApplySize(k); renderSizes();
  if (ui.route.name === "calendar") renderCalendar();
});
// the other pane / tab changed the look → follow it
window.addEventListener("storage", function (e) {
  if (e.key === THEME_KEY) window.lifeosApplyTheme(e.newValue || "auto");
  if (e.key === "lifeos.size") { window.lifeosApplySize(e.newValue || "m"); if (ui.route.name === "calendar") renderCalendar(); }
  if (e.key === LAYOUT_KEY) { window.lifeosApplyLayout(e.newValue); renderAll(); }
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
function openSettings(pane) {
  if (isNarrow()) setSidebar(false);
  renderThemes(); renderLayouts(); renderSizes(); renderPinList();
  var n = tasks().length, m = projects().length;
  var hn = hwList().length, nn = notesList().length;
  $("dataStat").textContent = n + " " + plural(n, "task", "tasks") + " · " + m + " " + plural(m, "project", "projects") +
    " · " + hn + " homework · " + nn + " " + plural(nn, "note", "notes");
  renderAccount(); renderCalendarPane(); exSize();
  showPane(typeof pane === "string" ? pane : "look");
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
  if (!$("auth").hidden) return; // екран входу: без гарячих клавіш
  var typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "");
  if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); $("settings").hidden ? openSettings() : closeSettings(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); setSidebar(!sidebarIsOpen()); return; }
  if (e.key === "Escape" && closeCalPop()) return;
  if (!typing && ui.route.name === "calendar" && $("settings").hidden && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); calShift(e.key === "ArrowLeft" ? -1 : 1); return; }
    if (e.key === "t" || e.key === "T") { cui.date = startOfDay(new Date()); cui.scrollKey = ""; renderMain(); return; }
  }
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
