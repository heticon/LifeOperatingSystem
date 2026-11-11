/* Life OS — Links: a grid of favourite sites (logo + name), opens each in a new tab.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html).
   Links are records in Store.data.other ("link:<id>", kind "link"), so they sync like everything else. */
"use strict";

var LINK_DEFAULTS = [
  ["AI", "Claude", "https://claude.ai"], ["AI", "ChatGPT", "https://chatgpt.com"], ["AI", "Gemini", "https://gemini.google.com"],
  ["AI", "Perplexity", "https://www.perplexity.ai"], ["AI", "Grok", "https://grok.com"],
  ["Google", "Gmail", "https://mail.google.com"], ["Google", "Drive", "https://drive.google.com"], ["Google", "Docs", "https://docs.google.com"],
  ["Google", "Sheets", "https://sheets.google.com"], ["Google", "Slides", "https://slides.google.com"], ["Google", "Calendar", "https://calendar.google.com"],
  ["Google", "Maps", "https://maps.google.com"], ["Google", "YouTube", "https://www.youtube.com"],
  ["Messages", "Telegram", "https://web.telegram.org"], ["Messages", "WhatsApp", "https://web.whatsapp.com"],
  ["Tools", "DeepL", "https://www.deepl.com/translator"]
];
var lui = { edit: false, form: null }; // form: null | {id|null, title, url, group}

function linkList() {
  var o = Store.data.other || {};
  return Object.keys(o).filter(function (id) { return o[id].k === "link"; }).map(function (id) { return o[id].d; })
    .sort(function (a, b) { return (a.pos || 0) - (b.pos || 0); });
}
// first visit: put in the defaults once. Fixed ids, so two devices seeding at once can't make duplicates.
function seedLinks() {
  var o = Store.data.other || (Store.data.other = {});
  if (o.linkmeta) return;
  LINK_DEFAULTS.forEach(function (l, i) {
    var id = "link:" + l[1].toLowerCase();
    if (!o[id]) o[id] = { k: "link", d: { id: id, title: l[1], url: l[2], group: l[0], pos: (i + 1) * 10 } };
  });
  o.linkmeta = { k: "linkmeta", d: { seeded: true } };
  Store.save();
}
function linkHost(url) { try { return new URL(url).hostname; } catch (e) { return ""; } }
function normUrl(u) {
  u = String(u || "").trim(); if (!u) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
  try { var x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; }
}
// Google's favicon service shows one "G" for every Google app, so those get their real product logos
var G_ICONS = { "mail.google.com": "gmail", "drive.google.com": "drive", "docs.google.com": "docs", "sheets.google.com": "sheets",
  "slides.google.com": "slides", "calendar.google.com": "calendar" };
function linkIcon(l) {
  var h = linkHost(l.url), letter = esc((l.title || h || "?").charAt(0).toUpperCase()), path = "";
  try { path = new URL(l.url).pathname; } catch (e) {}
  var g = G_ICONS[h];
  if (h === "docs.google.com") g = /^\/spreadsheets/.test(path) ? "sheets" : /^\/presentation/.test(path) ? "slides" : "docs";
  var src = g ? "https://ssl.gstatic.com/images/branding/product/2x/" + g + "_2020q4_48dp.png"
    : "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(h) + "&amp;sz=64";
  // if the logo can't load (offline) the first letter shows instead
  return '<span class="lk-ic" data-l="' + letter + '"><img src="' + src + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>';
}
function linkGroups(list) {
  var order = [], by = {};
  list.forEach(function (l) { var g = l.group || "Other"; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(l); });
  return order.map(function (g) { return [g, by[g]]; });
}

function linkFormHTML() {
  var f = lui.form, groups = linkGroups(linkList()).map(function (g) { return g[0]; });
  return '<form class="lk-form" id="lkForm" novalidate>' +
    '<div class="lk-fields">' +
      '<label><span>Name</span><input name="title" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Schul-Mail" value="' + esc(f.title) + '"></label>' +
      '<label><span>Address</span><input name="url" type="text" inputmode="url" autocapitalize="off" spellcheck="false" autocomplete="off" placeholder="example.com" value="' + esc(f.url) + '"></label>' +
      '<label><span>Group</span><input name="group" type="text" maxlength="40" list="lkGroups" autocomplete="off" placeholder="Other" value="' + esc(f.group) + '"></label>' +
      '<datalist id="lkGroups">' + groups.map(function (g) { return '<option value="' + esc(g) + '">'; }).join("") + "</datalist>" +
    "</div>" +
    '<div class="lk-actions">' +
      (f.id ? '<button type="button" class="btn danger-btn" data-lk-del>' + icon("trash-2") + "Delete</button>" : "") +
      '<span class="lk-sp"></span><button type="button" class="btn" data-lk-cancel>Cancel</button>' +
      '<button type="submit" class="btn solid">' + (f.id ? "Save" : "Add") + "</button>" +
    "</div><p class=\"lk-err\" id=\"lkErr\" hidden></p></form>";
}

function renderLinks() {
  seedLinks();
  var list = linkList();
  $("headActions").innerHTML = '<button type="button" class="btn" data-lk-edit aria-pressed="' + lui.edit + '">' + (lui.edit ? "Done" : "Edit") + "</button>" +
    '<button type="button" class="ibtn" data-lk-add title="Add link" aria-label="Add link">' + icon("plus") + "</button>";
  var body = linkGroups(list).map(function (g) {
    return '<section class="lk-sec"><div class="section-h"><span>' + esc(g[0]) + '</span></div><div class="lk-grid">' +
      g[1].map(function (l) {
        var inner = linkIcon(l) + '<span class="lk-t">' + esc(l.title || linkHost(l.url)) + "</span>";
        return lui.edit
          ? '<button type="button" class="lk editing" data-lk-id="' + esc(l.id) + '" aria-label="Edit ' + esc(l.title) + '">' + inner + icon("pencil", "lk-pen") + "</button>"
          : '<a class="lk" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(linkHost(l.url)) + '">' + inner + "</a>";
      }).join("") + "</div></section>";
  }).join("");
  $("view").innerHTML = '<div class="page links"><div class="page-head"><div><h1>Links</h1><div class="page-sub">' +
    (lui.edit ? "Tap a link to change or delete it" : list.length + " " + plural(list.length, "site", "sites") + " · opens in a new tab") + "</div></div></div>" +
    (lui.form ? linkFormHTML() : "") +
    (list.length ? body : '<div class="empty">No links yet. Add your first one with +.</div>') + "</div>";
  if (lui.form) { var inp = $("lkForm").querySelector(lui.form.id ? "[name=title]" : "[name=url]"); if (inp) inp.focus(); }
}

document.addEventListener("click", function (e) {
  if (ui.route.name !== "links") return;
  var t = e.target;
  if (t.closest("[data-lk-edit]")) { lui.edit = !lui.edit; lui.form = null; renderLinks(); return; }
  if (t.closest("[data-lk-add]")) { lui.form = { id: null, title: "", url: "", group: "" }; renderLinks(); return; }
  if (t.closest("[data-lk-cancel]")) { lui.form = null; renderLinks(); return; }
  var ed = t.closest("[data-lk-id]");
  if (ed) {
    var l = (Store.data.other[ed.getAttribute("data-lk-id")] || {}).d; if (!l) return;
    lui.form = { id: l.id, title: l.title, url: l.url, group: l.group || "" }; renderLinks(); $("view").scrollTop = 0; return;
  }
  if (t.closest("[data-lk-del]") && lui.form && lui.form.id) {
    delete Store.data.other[lui.form.id]; Store.save(); lui.form = null; renderLinks();
  }
});
document.addEventListener("submit", function (e) {
  if (e.target.id !== "lkForm") return;
  e.preventDefault();
  var f = e.target, url = normUrl(f.elements.url.value), err = $("lkErr");
  if (!url) { err.textContent = "Enter a web address, e.g. example.com"; err.hidden = false; return; }
  var host = linkHost(url).replace(/^www\./, "");
  var title = f.elements.title.value.trim() || cap(host.split(".")[0]);
  var group = f.elements.group.value.trim() || "Other";
  var o = Store.data.other || (Store.data.other = {}), id = lui.form.id;
  if (id && o[id]) { var d = o[id].d; d.title = title; d.url = url; d.group = group; }
  else {
    id = "link:" + uid();
    var max = linkList().reduce(function (m, l) { return Math.max(m, l.pos || 0); }, 0);
    o[id] = { k: "link", d: { id: id, title: title, url: url, group: group, pos: max + 10 } };
  }
  Store.save(); lui.form = null; renderLinks();
});
