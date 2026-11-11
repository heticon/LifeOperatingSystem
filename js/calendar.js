/* Life OS — Google Calendar data + Calendar page (day/week/month/list), Settings → Calendar.
   Classic script: shares the global scope with the other js/*.js files (load order in index.html). */
"use strict";

/* =========================================================
   Google Calendar (лише читання). Події кладе в items серверна функція google-sync;
   тут вони лежать у Store.data.other: gconn (стан), gcal:* (календарі), gev:* (події).
   ========================================================= */
var GOOGLE_CLIENT_ID = "403726151772-ghcjpt0a314cm0pfovvbirni4u3iop6v.apps.googleusercontent.com";
var GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.readonly";
var gui = { busy: "", error: "" };

function otherOf(kind) {
  var o = Store.data.other || {};
  return Object.keys(o).filter(function (id) { return o[id] && o[id].k === kind; }).map(function (id) { return o[id].d; });
}
function gconn() { var e = (Store.data.other || {}).gconn; return e && e.k === "connection" ? e.d : null; }
// The user's choices (shown / in Month view) live in their own "gpref:<cal>" record that only devices write,
// so the server's sync can never overwrite them. Older choices on the gcal row still count until changed.
function calPref(cal) { var e = (Store.data.other || {})["gpref:" + cal]; return e && e.k === "calpref" ? e.d : null; }
function setCalPref(cal, patch) {
  var o = Store.data.other, cur = calMap()[cal] || {}, id = "gpref:" + cal;
  var d = { cal: cal, on: cur.on !== false, month: monthOn(cal) };
  Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
  o[id] = { k: "calpref", d: d }; Store.save();
}
function calendars() {
  return otherOf("calendar").map(function (c) {
    var p = calPref(c.cal), x = {}; Object.keys(c).forEach(function (k) { x[k] = c[k]; });
    if (p) { if (typeof p.on === "boolean") x.on = p.on; if (typeof p.month === "boolean") x.month = p.month; }
    return x;
  }).sort(function (a, b) { return (b.primary - a.primary) || a.name.localeCompare(b.name); });
}
function calMap() { var m = {}; calendars().forEach(function (c) { m[c.cal] = c; }); return m; }
function parseDay(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
// початок і кінець події як Date; у подій на весь день кінець — наступний день (не включно)
function evSpan(e) { return e.allDay ? [parseDay(e.start), parseDay(e.end)] : [new Date(e.start), new Date(e.end)]; }
// події увімкнених календарів, що перетинають день d
function eventsOn(d) {
  var cm = calMap(), d0 = startOfDay(d), d1 = addDays(d0, 1);
  return otherOf("event").filter(function (e) {
    var c = cm[e.cal]; if (!c || c.on === false) return false;
    var sp = evSpan(e); return sp[0] < d1 && sp[1] > d0;
  }).sort(function (a, b) { return (b.allDay - a.allDay) || (evSpan(a)[0] - evSpan(b)[0]) || a.title.localeCompare(b.title); });
}
function evTime(e, d) {
  if (e.allDay) return "All day";
  var sp = evSpan(e), d0 = startOfDay(d), d1 = addDays(d0, 1);
  if (sp[0] < d0 && sp[1] >= d1) return "All day";
  if (sp[0] < d0) return "until " + hhmm(sp[1]);
  return hhmm(sp[0]) + (sp[1] < d1 && sp[1] > sp[0] ? "–" + hhmm(sp[1]) : "");
}
function evRow(e, d) {
  var c = calMap()[e.cal] || {};
  var meta = '<span class="subj"><i style="background:' + esc(c.color || "#888") + '"></i>' + esc(c.name || "") + "</span>";
  if (e.location) meta += "<span>" + esc(e.location) + "</span>";
  var tag = e.link ? "a" : "div";
  return "<" + tag + ' class="task ev"' + (e.link ? ' href="' + esc(e.link) + '" target="_blank" rel="noopener"' : "") + ">" +
    '<span class="ev-time">' + evTime(e, d) + "</span>" +
    '<span class="task-main"><span class="task-title">' + esc(e.title) + '</span><span class="task-meta">' + meta + "</span></span></" + tag + ">";
}
function calFact() {
  if (!gconn()) return "";
  var now = new Date(), list = eventsOn(now).filter(function (e) { return e.allDay || evSpan(e)[1] > now; });
  var txt;
  if (!list.length) txt = "Nothing else today";
  else {
    var cur = list.filter(function (e) { return !e.allDay && evSpan(e)[0] <= now; })[0];
    var nxt = cur || list.filter(function (e) { return !e.allDay; })[0] || list[0];
    txt = cur ? "Now <b>" + esc(cur.title) + "</b> · until " + hhmm(evSpan(cur)[1])
      : nxt.allDay ? "<b>" + esc(nxt.title) + "</b> · all day"
      : "<b>" + esc(nxt.title) + "</b> at " + hhmm(evSpan(nxt)[0]);
    var more = list.length - 1;
    if (more) txt += " · " + more + " more today";
  }
  return '<div class="hp"><span class="hk">' + icon("calendar") + 'Calendar</span><span class="hv"><a href="#calendar">' + txt + "</a></span></div>";
}


/* =========================================================
   Calendar — сітка тижня / дня (як у Google Calendar) і список.
   Записи для календаря збирає agendaEntries(): зараз це події Google,
   пізніше сюди ж додамо власні зустрічі й дати без часу.
   ========================================================= */
var CAL_DAYS = 28;   // стільки днів уперед і назад тримає google-sync
var HOUR = 48;       // висота години в сітці, px — підбирається під екран (calFit), щоб увесь день влазив без прокрутки
var H0 = 0, H1 = 24; // перша й остання години сітки (за подіями періоду, мінімум 07–21)
// кольори подій Google (colorId 1–11), як у сучасному Google Calendar
var GCOLORS = { "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73", "5": "#f6bf26", "6": "#f4511e",
  "7": "#039be5", "8": "#616161", "9": "#3f51b5", "10": "#0b8043", "11": "#d50000" };
var cui = { view: ls("lifeos.calView") || null, zoom: !!ls("lifeos.calZoom"), date: startOfDay(new Date()), past: false, busy: false, error: "", pop: null, scrollKey: "", per: 3 };
// календар показується у Month view? (рішення користувача в налаштуваннях; за замовчуванням — усі, крім розпорядку «Schedule»)
function monthOn(calId) {
  var c = calMap()[calId]; if (!c) return true;
  return typeof c.month === "boolean" ? c.month : !/^schedule$/i.test(String(c.name || "").trim());
}

function calView() { return cui.view || (isNarrow() ? "day" : "week"); }
// Bohdan’s own colours (taken from his Google Calendar screenshot). Google doesn’t send a colour for his
// repeating Schedule events, so we colour them by title. A Google event colour (colorId) still wins.
var TITLE_COLORS = [
  ["morning routine", "#C9D1D9"], ["light focus", "#A9BBD8"], ["free time", "#AFC3E7"], ["focus", "#4F6D9A"],
  ["school", "#2E7D6B"], ["work", "#D4B896"], ["home", "#B7A7D9"], ["training", "#E17C68"], ["wind down", "#D8A7B1"]
];
var CAL_COLORS = { schedule: "#B39DDB" };
function evColor(e) {
  if (GCOLORS[e.colorId]) return GCOLORS[e.colorId];
  var t = String(e.title || "").toLowerCase().trim();
  for (var i = 0; i < TITLE_COLORS.length; i++) if (t.indexOf(TITLE_COLORS[i][0]) === 0) return TITLE_COLORS[i][1];
  var c = calMap()[e.cal] || {};
  return CAL_COLORS[String(c.name || "").toLowerCase()] || c.color || "#888888";
}
// [{id, e}] для дня d — події увімкнених календарів
function agendaEntries(d) {
  var o = Store.data.other || {}, cm = calMap(), d0 = startOfDay(d), d1 = addDays(d0, 1), out = [];
  Object.keys(o).forEach(function (id) {
    var x = o[id]; if (!x || x.k !== "event") return;
    var e = x.d, c = cm[e.cal]; if (!c || c.on === false) return;
    var sp = evSpan(e); if (sp[0] < d1 && sp[1] > d0) out.push({ id: id, e: e });
  });
  return out.sort(function (a, b) { return (b.e.allDay - a.e.allDay) || (evSpan(a.e)[0] - evSpan(b.e)[0]) || a.e.title.localeCompare(b.e.title); });
}
function agendaFor(d) { return agendaEntries(d).map(function (x) { return x.e; }); }
// подія займає весь день d (на весь день або тягнеться через цілу добу)
function fullDay(e, d) {
  if (e.allDay) return true;
  var sp = evSpan(e), d0 = startOfDay(d); return sp[0] <= d0 && sp[1] >= addDays(d0, 1);
}
function dayLabel(d) {
  var n = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : DAYS[(d.getDay() + 6) % 7];
}
function calRange() {
  var v = calView();
  if (v === "week") { var m = mondayOf(cui.date); return { from: m, days: 7 }; }
  if (v === "month") {
    var first = new Date(cui.date.getFullYear(), cui.date.getMonth(), 1), from = mondayOf(first);
    var dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return { from: from, days: Math.ceil((Math.round((first - from) / 864e5) + dim) / 7) * 7, month: first };
  }
  return { from: startOfDay(cui.date), days: 1 };
}
function calShift(n) {
  var v = calView();
  cui.date = v === "week" ? addDays(cui.date, 7 * n) : v === "day" ? addDays(cui.date, n)
    : v === "month" ? new Date(cui.date.getFullYear(), cui.date.getMonth() + n, 1) : cui.date;
  cui.pop = null; closeCalPop(); renderMain();
}
var fmtMonthYear = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
var fmtMonShort = new Intl.DateTimeFormat(LOCALE, { month: "short" });

// розкладка подій одного дня по колонках, щоб вони не накладались
function layoutDay(items) {
  items.sort(function (a, b) { return (a.s - b.s) || (b.e - a.e); });
  var groups = [], cur = [], end = -1;
  items.forEach(function (it) {
    if (cur.length && it.s >= end) { groups.push(cur); cur = []; end = -1; }
    cur.push(it); end = Math.max(end, it.e);
  });
  if (cur.length) groups.push(cur);
  groups.forEach(function (g) {
    var cols = [];
    g.forEach(function (it) {
      for (var c = 0; c < cols.length; c++) if (cols[c] <= it.s) break;
      cols[c] = it.e; it.col = c;
    });
    g.forEach(function (it) { it.cols = cols.length; });
  });
  return items;
}

function calHeadHTML() {
  var v = calView(), r = calRange(), last = addDays(r.from, r.days - 1);
  var title = v === "list" ? "Upcoming" : v === "month" ? fmtMonthYear.format(r.month) : fmtMonthYear.format(r.from);
  if ((v === "week" || v === "day") && last.getMonth() !== r.from.getMonth()) title = fmtMonShort.format(r.from) + " – " + fmtMonShort.format(last) + " " + last.getFullYear();
  var sub = v === "week" ? "Week " + isoWeek(r.from).week + " · " + weekRange(r.from)
    : v === "day" ? cap(fmtWeekday.format(r.from)) + ", " + fmtDayMonth.format(r.from)
    : v === "month" ? "Events and appointments" : "";
  var c = gconn();
  if (c && c.error) sub += (sub ? " · " : "") + '<span class="late">' + esc(c.error) + "</span>";
  if (cui.error) sub += (sub ? " · " : "") + '<span class="late">' + esc(cui.error) + "</span>";
  // на широкому екрані кнопки живуть у верхній панелі — так календарю лишається більше місця
  // phones: one small "View" button on the right instead of the 4-way switch
  var names = { day: "Day", week: "Week", month: "Month", list: "List" };
  var vb = '<button type="button" class="btn cal-viewbtn" data-cal-viewmenu aria-haspopup="menu" aria-label="Change view">' + names[v] + icon("chevron-down") + "</button>";
  return '<div class="page-head cal-bar"><div class="cal-titles"><h1>' + title + '</h1><div class="page-sub" id="calSub">' + sub + "</div></div>" +
    (isNarrow() ? vb : "") + "</div>";
}
// part: "modes" (Day/Week/…), "nav" (fit, Today, ‹ ›) or both
function calCtrlHTML(part) {
  var v = calView();
  var modes = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["list", "List"]].map(function (m) {
    return '<button type="button" role="tab" data-cal-view="' + m[0] + '" aria-selected="' + (v === m[0]) + '">' + m[1] + "</button>";
  }).join("");
  var fit = v === "day" || v === "week" ? '<button type="button" class="ibtn" data-cal-fit aria-pressed="' + !cui.zoom + '" title="' +
    (cui.zoom ? "Fit the whole day on screen" : "Zoom in (bigger hours, scroll)") + '" aria-label="' + (cui.zoom ? "Fit the whole day" : "Zoom in") + '">' +
    icon(cui.zoom ? "fold-vertical" : "unfold-vertical") + "</button>" : "";
  var nav = v === "list" ? "" :
    '<button type="button" class="btn" data-cal-today>Today</button>' +
    '<button type="button" class="ibtn" data-cal-nav="-1" aria-label="Previous">' + icon("chevron-left") + "</button>" +
    '<button type="button" class="ibtn" data-cal-nav="1" aria-label="Next">' + icon("chevron-right") + "</button>";
  var m = '<div class="modes cal-modes" role="tablist" aria-label="Calendar view">' + modes + "</div>", n = '<div class="cal-nav">' + fit + nav + "</div>";
  return '<div class="cal-ctrl">' + (part === "modes" ? m : part === "nav" ? n : m + n) + "</div>";
}

function chip(x, d) {
  var col = evColor(x.e), gone = evSpan(x.e)[1] <= new Date();
  return '<button type="button" class="cg-chip' + (gone ? " gone" : "") + '" style="--c:' + esc(col) + '" data-ev="' + esc(x.id) + '" data-day="' + isoDate(d) + '">' +
    '<span class="cg-t">' + esc(x.e.title) + "</span></button>";
}

function renderCalGrid() {
  var r = calRange(), today = startOfDay(new Date()), now = new Date(), days = [];
  for (var i = 0; i < r.days; i++) days.push(addDays(r.from, i));
  // діапазон годин: від найранішої до найпізнішої події, але щонайменше 07:00–21:00
  var lo = 7, hi = 21;
  days.forEach(function (d) {
    agendaEntries(d).forEach(function (x) {
      if (fullDay(x.e, d)) return;
      var sp = evSpan(x.e), s = Math.max(0, (sp[0] - d) / 3600000), e = Math.min(24, (sp[1] - d) / 3600000);
      if (e <= 0 || s >= 24) return;
      lo = Math.min(lo, Math.floor(s)); hi = Math.max(hi, Math.ceil(e));
    });
  });
  H0 = cui.zoom ? 0 : lo; H1 = cui.zoom ? 24 : hi;
  var head = "", allday = "", cols = "", anyAll = false;
  days.forEach(function (d) {
    var ents = agendaEntries(d), isT = +d === +today, past = d < today;
    var all = ents.filter(function (x) { return fullDay(x.e, d); });
    var timed = ents.filter(function (x) { return !fullDay(x.e, d); });
    if (all.length) anyAll = true;
    head += '<button type="button" class="cg-dh' + (isT ? " today" : "") + (past ? " past" : "") + '" data-cal-day="' + isoDate(d) + '"' +
      (r.days === 1 ? " disabled" : "") + '><span class="cg-wd">' + DAYS_S[(d.getDay() + 6) % 7] + '</span><span class="cg-dn">' + d.getDate() + "</span></button>";
    allday += '<div class="cg-ad">' + all.map(function (x) { return chip(x, d); }).join("") + "</div>";
    var d0 = +d, items = timed.map(function (x) {
      var sp = evSpan(x.e), s = Math.max(0, (sp[0] - d0) / 60000), e = Math.min(1440, (sp[1] - d0) / 60000);
      return { x: x, s: s, e: Math.max(e, s + 15) };
    });
    var blocks = layoutDay(items).map(function (it) {
      var s0 = Math.max(it.s, H0 * 60), e0 = Math.min(it.e, H1 * 60);
      var top = (s0 / 60 - H0) * HOUR, h = Math.max((e0 - s0) / 60 * HOUR - 2, 12), sp = evSpan(it.x.e);
      var gone = sp[1] <= now, live = sp[0] <= now && sp[1] > now;
        var time = evTime(it.x.e, d), tall = h >= 40, xs = h < 22;
      return '<button type="button" class="cg-ev' + (gone ? " gone" : "") + (live ? " live" : "") + (tall ? " tall" : "") + (xs ? " xs" : "") + '" data-ev="' + esc(it.x.id) + '" data-day="' + isoDate(d) + '"' +
        ' style="--c:' + esc(evColor(it.x.e)) + ";top:" + top + "px;height:" + h + "px;left:calc(" + (it.col / it.cols * 100) + "% + 2px);width:calc(" + (100 / it.cols) + '% - 4px)"' +
        ' aria-label="' + esc(it.x.e.title + ", " + time) + '">' +
        '<span class="cg-t">' + esc(it.x.e.title) + '</span><span class="cg-tm">' + time + "</span></button>";
    }).join("");
    var nowH = (now - d0) / 3600000;
    var line = isT && nowH >= H0 && nowH <= H1 ? '<div class="cg-now" id="cgNow" style="top:' + ((nowH - H0) * HOUR) + 'px"></div>' : "";
    cols += '<div class="cg-col' + (isT ? " today" : "") + (past ? " past" : "") + '">' + blocks + line + "</div>";
  });
  var hours = "";
  for (var hh = H0 + 1; hh < H1; hh++) hours += '<span style="top:' + (hh - H0) * HOUR + 'px">' + pad(hh) + ":00</span>";
  var strip = "";
  if (calView() === "day") {
    var mon = mondayOf(cui.date);
    for (var k = 0; k < 7; k++) {
      var sd = addDays(mon, k), has = agendaEntries(sd).length;
      strip += '<button type="button" class="cs-day' + (+sd === +cui.date ? " on" : "") + (+sd === +today ? " today" : "") + '" data-cal-pick="' + isoDate(sd) + '">' +
        '<span class="cg-wd">' + DAYS_S[k].charAt(0) + '</span><span class="cg-dn">' + sd.getDate() + "</span>" + (has ? '<i class="cs-dot"></i>' : '<i class="cs-dot off"></i>') + "</button>";
    }
    strip = '<div class="cal-strip">' + strip + "</div>";
  }
  return strip + '<div class="cal-grid" style="--days:' + r.days + ";--hour:" + HOUR + "px;--span:" + (H1 - H0) + '">' +
    '<div class="cg-top"><div class="cg-row cg-heads"><div class="cg-gut"></div>' + head + "</div>" +
    (anyAll ? '<div class="cg-row cg-alld"><div class="cg-gut cg-adl">all-day</div>' + allday + "</div>" : "") + "</div>" +
    '<div class="cg-scroll" id="cgScroll"><div class="cg-body"><div class="cg-gut cg-hours">' + hours + "</div>" + cols + "</div></div></div>";
}

// Month: тільки події й зустрічі (без щоденного розпорядку), 6 тижнів на одному екрані
function renderCalMonth() {
  var r = calRange(), today = startOfDay(new Date()), now = new Date(), per = cui.per, cells = "";
  for (var i = 0; i < r.days; i++) {
    var d = addDays(r.from, i), out = d.getMonth() !== r.month.getMonth();
    var ents = agendaEntries(d).filter(function (x) { return monthOn(x.e.cal); });
    ents.sort(function (a, b) { return (fullDay(b.e, d) - fullDay(a.e, d)) || (evSpan(a.e)[0] - evSpan(b.e)[0]); });
    var shown = ents.length > per ? ents.slice(0, Math.max(per - 1, 0)) : ents, more = ents.length - shown.length;
    cells += '<div class="cm-cell' + (out ? " out" : "") + (+d === +today ? " today" : "") + (d < today ? " past" : "") + '">' +
      '<button type="button" class="cm-dn" data-cal-day="' + isoDate(d) + '" aria-label="' + esc(cap(fmtWeekday.format(d)) + ", " + fmtDayMonth.format(d)) + '">' + d.getDate() + "</button>" +
      shown.map(function (x) {
        var all = fullDay(x.e, d), gone = evSpan(x.e)[1] <= now;
        return '<button type="button" class="cm-ev' + (all ? " all" : "") + (gone ? " gone" : "") + '" style="--c:' + esc(evColor(x.e)) + '" data-ev="' + esc(x.id) + '" data-day="' + isoDate(d) + '">' +
          (all ? "" : '<span class="cm-tm">' + hhmm(evSpan(x.e)[0]) + "</span>") + '<span class="cm-t">' + esc(x.e.title) + "</span></button>";
      }).join("") +
      (more ? '<button type="button" class="cm-more" data-cal-day="' + isoDate(d) + '">+' + more + " more</button>" : "") + "</div>";
  }
  var heads = DAYS_S.map(function (w) { return '<div class="cm-wd">' + w + "</div>"; }).join("");
  return '<div class="cal-month" style="--weeks:' + (r.days / 7) + '"><div class="cm-heads">' + heads + '</div><div class="cm-grid" id="cmGrid">' + cells + "</div></div>";
}

function renderCalList() {
  var today = startOfDay(new Date()), from = cui.past ? addDays(today, -CAL_DAYS) : today, to = addDays(today, CAL_DAYS);
  var html = "", lastWeek = "";
  for (var d = from; d < to; d = addDays(d, 1)) {
    var list = agendaFor(d), isToday = +d === +today;
    if (!list.length && !isToday) continue;
    var wk = weekKey(d);
    if (wk !== lastWeek) {
      lastWeek = wk;
      html += '<div class="section-h cal-week">Week ' + isoWeek(d).week + ' <span class="gd">' + weekRange(mondayOf(d)) + "</span></div>";
    }
    var wd = DAYS[(d.getDay() + 6) % 7];
    html += '<section class="group' + (d < today ? " past" : "") + '">' +
      '<div class="group-title"><span class="gt">' + dayLabel(d) + '</span><span class="gd">' +
      (dayLabel(d) === wd ? fmtDayMonth.format(d) : wd + ", " + fmtDayMonth.format(d)) + "</span></div>" +
      '<div class="list">' + (list.length ? list.map(function (e) { return agendaRow(e, d); }).join("") : '<div class="empty">Nothing scheduled</div>') + "</div></section>";
  }
  return '<button type="button" class="done-toggle" data-cal-past aria-expanded="' + cui.past + '">' +
    icon(cui.past ? "chevron-down" : "chevron-right") + (cui.past ? "Hide earlier" : "Show earlier") + "</button>" + html;
}
function agendaRow(e, d) {
  var now = new Date(), sp = evSpan(e), cls = "";
  if (!e.allDay && sp[1] <= now) cls = " gone";
  else if (!e.allDay && sp[0] <= now && sp[1] > now) cls = " now";
  return evRow(e, d).replace('class="task ev"', 'class="task ev' + cls + '"');
}

function renderCalendar() {
  var c = gconn(), v = calView();
  $("headActions").innerHTML = (c ? calCtrlHTML(isNarrow() ? "nav" : "") : "") + (c ? '<button type="button" class="ibtn" data-cal-refresh title="Refresh from Google" aria-label="Refresh from Google"' +
    (cui.busy ? " disabled" : "") + ">" + icon("rotate-ccw", cui.busy ? "spin" : "") + "</button>" : "");
  if (!c) {
    $("view").innerHTML = '<div class="page cal"><div class="page-head"><div><h1>Calendar</h1><div class="page-sub">Not connected</div></div></div>' +
      '<div class="empty">Connect Google Calendar to see your schedule here.</div>' +
      '<button type="button" class="btn solid" data-cal-connect>Connect Google Calendar</button></div>';
    return;
  }
  var prev = $("cgScroll"), keep = prev ? prev.scrollTop : null;
  var body = function () { return v === "list" ? renderCalList() : v === "month" ? renderCalMonth() : renderCalGrid(); };
  $("view").innerHTML = '<div class="page cal ' + (v === "list" ? "" : "wide cal-g") + (cui.zoom ? " zoom" : "") + '">' + calHeadHTML() + body() + "</div>";
  if (v === "month") {
    // скільки подій влазить у клітинку — за її висотою
    var g = $("cmGrid"), cell = g && g.firstElementChild;
    if (cell) {
      var per = Math.max(1, Math.floor((cell.clientHeight - 32) / (isNarrow() ? 8 : 22)));
      if (per !== cui.per) { cui.per = per; $("view").querySelector(".page").innerHTML = calHeadHTML() + body(); }
    }
    return;
  }
  var sc = $("cgScroll"); if (!sc) return;
  // підганяємо висоту години, щоб увесь день влазив на екран (мінімум 18px — тоді вже прокрутка)
  var fit = cui.zoom ? (isNarrow() ? 48 : 56) : Math.max(18, Math.min(64, Math.floor((sc.clientHeight - 12) / (H1 - H0))));
  if (fit !== HOUR) {
    HOUR = fit;
    $("view").querySelector(".page").innerHTML = calHeadHTML() + renderCalGrid();
    sc = $("cgScroll");
  }
  // перший показ періоду — до «зараз» (або до 07:00); далі зберігаємо, де користувач прокрутив
  var key = v + isoDate(calRange().from);
  if (cui.scrollKey !== key || keep == null) {
    cui.scrollKey = key;
    var r = calRange(), today = startOfDay(new Date()), inRange = today >= r.from && today < addDays(r.from, r.days);
    sc.scrollTop = Math.max((inRange ? new Date().getHours() - 2 : 7) - H0, 0) * HOUR;
  } else sc.scrollTop = keep;
}
// лінія «зараз» — раз на хвилину
function calNowTick() {
  var l = $("cgNow"); if (!l) return;
  var now = new Date(); l.style.top = (((now - startOfDay(now)) / 3600000 - H0) * HOUR) + "px";
}

/* ---------- деталі події (поповер / нижній лист на телефоні) ---------- */
function closeCalPop() {
  var p = document.querySelector(".cal-pop"); if (!p) return false;
  p.remove(); cui.pop = null; return true;
}
function openCalPop(id, day, anchor) {
  closeCalPop();
  var x = (Store.data.other || {})[id]; if (!x) return;
  var e = x.d, c = calMap()[e.cal] || {}, d = day ? parseDay(day) : startOfDay(evSpan(e)[0]);
  var sp = evSpan(e), when;
  if (e.allDay) {
    var last = addDays(sp[1], -1);
    when = +last === +sp[0] ? cap(fmtWeekday.format(sp[0])) + ", " + fmtDayMonth.format(sp[0]) + " · All day"
      : fmtDayMonth.format(sp[0]) + " – " + fmtDayMonth.format(last) + " · All day";
  } else {
    var same = startOfDay(sp[0]).getTime() === startOfDay(sp[1]).getTime();
    when = cap(fmtWeekday.format(sp[0])) + ", " + fmtDayMonth.format(sp[0]) + " · " + hhmm(sp[0]) + "–" +
      (same ? "" : fmtDayMonShort.format(sp[1]) + " ") + hhmm(sp[1]);
  }
  var p = document.createElement("div");
  p.className = "cal-pop"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", e.title);
  p.style.setProperty("--c", evColor(e));
  p.innerHTML = '<div class="cp-head"><i class="cp-sw"></i><h3>' + esc(e.title) + "</h3>" +
    '<button type="button" class="ibtn" data-cal-pop-close aria-label="Close">' + icon("x") + "</button></div>" +
    '<div class="cp-row">' + icon("calendar-clock") + "<span>" + when + "</span></div>" +
    (e.location ? '<div class="cp-row">' + icon("target") + "<span>" + esc(e.location) + "</span></div>" : "") +
    '<div class="cp-row">' + icon("calendar") + '<span class="subj"><i style="background:' + esc(c.color || "#888") + '"></i>' + esc(c.name || "") + "</span></div>" +
    (e.link ? '<a class="btn" href="' + esc(e.link) + '" target="_blank" rel="noopener">Open in Google Calendar</a>' : "");
  document.body.appendChild(p);
  cui.pop = id;
  if (!isNarrow() && anchor) {
    var b = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    var left = b.right + 8 + w > window.innerWidth - 16 ? b.left - w - 8 : b.right + 8;
    left = Math.max(16, Math.min(left, window.innerWidth - w - 16));
    var top = Math.max(16, Math.min(b.top, window.innerHeight - h - 16));
    p.style.left = left + "px"; p.style.top = top + "px";
  } else p.classList.add("sheet");
  var cl = p.querySelector("[data-cal-pop-close]"); if (cl) cl.focus();
}

document.addEventListener("click", function (e) {
  var t = e.target;
  if (t.closest("[data-cal-pop-close]")) { closeCalPop(); return; }
  var ev = t.closest("[data-ev]");
  if (ev) { e.preventDefault(); openCalPop(ev.getAttribute("data-ev"), ev.getAttribute("data-day"), ev); return; }
  if (!t.closest(".cal-pop")) closeCalPop();
  if (t.closest("[data-cal-fit]")) { cui.zoom = !cui.zoom; ls("lifeos.calZoom", cui.zoom); cui.scrollKey = ""; renderMain(); return; }
  var vm = t.closest("[data-cal-viewmenu]");
  if (vm) {
    var menu = makeMenu(vm); if (!menu) return;
    menu.innerHTML = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["list", "List"]].map(function (x) {
      return '<button type="button" role="menuitemradio" aria-checked="' + (calView() === x[0]) + '" data-cal-view="' + x[0] + '">' + x[1] + "</button>";
    }).join("");
    return;
  }
  var m = t.closest("[data-cal-view]");
  if (m) { var om = document.querySelector(".menu"); if (om) om.remove(); cui.view = m.getAttribute("data-cal-view"); ls("lifeos.calView", cui.view); cui.scrollKey = ""; renderMain(); return; }
  var n = t.closest("[data-cal-nav]");
  if (n) { calShift(+n.getAttribute("data-cal-nav")); return; }
  if (t.closest("[data-cal-today]")) { cui.date = startOfDay(new Date()); cui.scrollKey = ""; renderMain(); return; }
  var dh = t.closest("[data-cal-day]");
  if (dh && !dh.disabled) { cui.date = parseDay(dh.getAttribute("data-cal-day")); cui.view = "day"; ls("lifeos.calView", "day"); renderMain(); return; }
  var pk = t.closest("[data-cal-pick]");
  if (pk) { cui.date = parseDay(pk.getAttribute("data-cal-pick")); renderMain(); return; }
  if (t.closest("[data-cal-past]")) { cui.past = !cui.past; renderMain(); return; }
  if (t.closest("[data-cal-connect]")) { openSettings("calendar"); return; }
  if (t.closest("[data-cal-refresh]") && !cui.busy) {
    cui.busy = true; cui.error = ""; renderMain();
    window.LifeSync.call("google-sync").then(function (res) {
      if (res && res.ok === false && res.error) throw new Error(res.error);
    }).catch(function (err) { cui.error = (err && err.message) || "Couldn’t refresh."; })
      .then(function () { cui.busy = false; window.LifeSync.syncNow(); renderMain(); });
  }
});
// свайп вліво/вправо по сітці — попередній / наступний день чи тиждень
(function () {
  var sx = 0, sy = 0, on = false;
  document.addEventListener("touchstart", function (e) {
    on = ui.route.name === "calendar" && calView() !== "list" && !!e.target.closest(".cal-grid") && e.touches.length === 1;
    if (on) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!on) return; on = false;
    var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) calShift(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

/* ---------- Settings → Calendar ---------- */
function redirectUri() { return location.origin + location.pathname; }
function renderCalendarPane() {
  var c = gconn(), on = window.LifeSync && window.LifeSync.status().email;
  var btns = "", desc;
  if (gui.busy) desc = gui.busy;
  else if (!c) desc = "Shows your Google calendars in Calendar, on Home and in This week. Read-only.";
  else if (c.error) desc = '<span class="late">' + esc(c.error) + "</span>";
  else desc = "Synced at " + shortWhen(Date.parse(c.at)) + " · updates every 15 minutes";
  if (gui.error) desc += '<br><span class="late">' + esc(gui.error) + "</span>";
  if (!c) btns = '<button class="btn solid" type="button" data-g="connect"' + (on && !gui.busy ? "" : " disabled") + ">Connect</button>";
  else btns = '<button class="btn" type="button" data-g="refresh"' + (gui.busy ? " disabled" : "") + ">Refresh</button>" +
    '<button class="btn danger" type="button" data-g="disconnect"' + (gui.busy ? " disabled" : "") + ">Disconnect</button>";
  $("gName").textContent = c ? c.account || "Google Calendar" : "Google Calendar";
  $("gDesc").innerHTML = on ? desc : "Sign in to Life OS first.";
  $("gBtns").innerHTML = btns;
  var cals = c ? calendars() : [];
  $("gCals").innerHTML = cals.length ? '<div class="cal-head">Show calendars</div>' + cals.map(function (k) {
    var checked = k.on !== false;
    return '<button type="button" class="cal-row" role="checkbox" aria-checked="' + checked + '" data-gcal="' + esc(k.cal) + '">' +
      '<span class="check">' + icon("check") + '</span><i style="background:' + esc(k.color) + '"></i><span>' + esc(k.name) + "</span></button>";
  }).join("") + '<div class="cal-head">Show in Month view and This week</div>' + cals.map(function (k) {
    return '<button type="button" class="cal-row" role="checkbox" aria-checked="' + monthOn(k.cal) + '" data-gcalm="' + esc(k.cal) + '">' +
      '<span class="check">' + icon("check") + '</span><i style="background:' + esc(k.color) + '"></i><span>' + esc(k.name) + "</span></button>";
  }).join("") : "";
}
function gRun(label, fn) {
  gui.busy = label; gui.error = ""; renderCalendarPane();
  return Promise.resolve().then(fn).catch(function (err) { gui.error = (err && err.message) || "Something went wrong."; })
    .then(function () { gui.busy = ""; window.LifeSync.syncNow(); renderCalendarPane(); });
}
function gConnect() {
  if (!GOOGLE_CLIENT_ID) { gui.error = "Google sign-in isn’t set up yet."; renderCalendarPane(); return; }
  var state = uid() + uid();
  try { sessionStorage.setItem("lifeos.gstate", state); } catch (e) {}
  location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: "code", scope: GOOGLE_SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: state
  }).toString();
}
// Повернення з Google: ?code=…&state=… → прибираємо з адреси й міняємо код на доступ (на сервері)
var gReturn = (function () {
  var q = new URLSearchParams(location.search);
  if (!q.has("state") || !(q.has("code") || q.has("error"))) return null;
  var want = null; try { want = sessionStorage.getItem("lifeos.gstate"); sessionStorage.removeItem("lifeos.gstate"); } catch (e) {}
  history.replaceState(null, "", location.pathname + location.hash);
  if (!want || want !== q.get("state")) return { error: "Google sign-in expired. Try again." };
  if (q.has("error")) return { error: q.get("error") === "access_denied" ? "Google access wasn’t allowed." : "Google sign-in failed." };
  return { code: q.get("code") };
})();
function finishGoogleReturn() {
  if (!gReturn || !window.LifeSync || !window.LifeSync.status().email) return;
  var r = gReturn; gReturn = null;
  openSettings("calendar");
  if (r.error) { gui.error = r.error; renderCalendarPane(); return; }
  gRun("Connecting…", function () {
    return window.LifeSync.call("google-connect", { action: "exchange", code: r.code, redirect_uri: redirectUri() }).then(function (res) {
      if (res && res.ok === false && res.error) throw new Error(res.error);
    });
  });
}
$("settings").addEventListener("click", function (e) {
  var b = e.target.closest("[data-g]");
  if (b) {
    var a = b.getAttribute("data-g");
    if (a === "connect") gConnect();
    if (a === "refresh") gRun("Refreshing…", function () {
      return window.LifeSync.call("google-sync").then(function (res) { if (res && res.ok === false && res.error) throw new Error(res.error); });
    });
    if (a === "disconnect" && confirm("Disconnect Google Calendar? Events disappear from Life OS on all devices. Your Google calendars stay as they are.")) {
      gRun("Disconnecting…", function () { return window.LifeSync.call("google-connect", { action: "disconnect" }); });
    }
    return;
  }
  var mr = e.target.closest("[data-gcalm]");
  if (mr) {
    var mc = mr.getAttribute("data-gcalm");
    setCalPref(mc, { month: !monthOn(mc) }); renderCalendarPane(); renderAll();
    return;
  }
  var row = e.target.closest("[data-gcal]");
  if (row) {
    var rc = row.getAttribute("data-gcal");
    setCalPref(rc, { on: (calMap()[rc] || {}).on === false }); renderCalendarPane(); renderAll();
  }
});
