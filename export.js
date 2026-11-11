// Life OS — compact export (Markdown / JSON / HTML / TXT / ZIP with all four).
// Goal: every piece of the user's own information, nothing technical (no ids, sync fields,
// colours, timestamps nobody reads), so the file stays small and cheap to paste into an AI.
// Dates inside the current year are written MM-DD; the legend at the top says so.
(function () {
  "use strict";
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoDay(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  var YEAR = new Date().getFullYear();
  // short date: "11-12" this year, "2027-01-04" otherwise
  function sd(v) {
    if (v == null || v === "") return "";
    var d = typeof v === "number" ? new Date(v) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : new Date(v);
    if (isNaN(d)) return String(v);
    return d.getFullYear() === YEAR ? pad(d.getMonth() + 1) + "-" + pad(d.getDate()) : isoDay(d);
  }
  function hm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function clean(s) { return String(s == null ? "" : s).replace(/\s+$/g, ""); }
  function wd(dayIdx) { return dayIdx == null ? "" : DAYS[dayIdx] || ""; }

  /* ---------- 1. collect: the data as a small, nested, id-free model ---------- */
  function collect(opts) {
    var L = window.__lifeos, D = L.Store.data, sc = D.school || { subjects: [], homework: [], notes: [], timetable: [] };
    var subjName = {}; (sc.subjects || []).forEach(function (s) { subjName[s.id] = s.name; });
    var projName = {}; (D.projects || []).forEach(function (p) { projName[p.id] = p.name; });
    var keepDone = opts.done !== false;

    function task(t) {
      var o = { t: t.title };
      if (t.done) o.x = t.doneAt ? sd(t.doneAt) : 1;
      if (t.week) o.wk = t.week.replace(/^\d{4}-W/, "W") + (t.day != null ? " " + wd(t.day) : "");
      if (t.notes && t.notes.trim()) o.n = clean(t.notes);
      return o;
    }
    var tasks = (D.tasks || []).filter(function (t) { return keepDone || !t.done; });
    var inbox = tasks.filter(function (t) { return !t.projectId; }).map(task);
    var projects = (D.projects || []).map(function (p) {
      return { name: p.name, tasks: tasks.filter(function (t) { return t.projectId === p.id; }).map(task) };
    });

    var timetable = (sc.timetable || []).map(function (day, i) {
      return { day: DAYS[i], time: day.start + "–" + day.end, lessons: (day.items || []).map(function (id) { return subjName[id] || "?"; }) };
    });
    var homework = (sc.homework || []).filter(function (h) { return keepDone || !h.done; }).map(function (h) {
      var o = { s: subjName[h.subjectId] || "", t: h.title };
      if (h.due) o.due = sd(h.due);
      if (h.plan) o.do = sd(h.plan);
      if (h.done) o.x = h.doneAt ? sd(h.doneAt) : 1;
      if (h.notes && h.notes.trim()) o.n = clean(h.notes);
      return o;
    });
    var notes = (sc.notes || []).filter(function (n) { return (n.title || "").trim() || (n.body || "").trim(); }).map(function (n) {
      return { s: subjName[n.subjectId] || "", t: n.title || "Untitled", body: clean(n.body) };
    });

    // focus: one line per day (count + minutes) instead of every session
    var fd = {};
    (D.focusLog || []).forEach(function (f) {
      var k = isoDay(new Date(f.at)); fd[k] = fd[k] || { n: 0, min: 0 }; fd[k].n++; fd[k].min += f.mins || 0;
    });
    var focus = Object.keys(fd).sort().map(function (k) { return { d: sd(k), n: fd[k].n, min: fd[k].min }; });

    // calendar
    var cals = [], events = [];
    if (opts.cal !== "none") {
      var o = D.other || {}, cm = {};
      L.calendars().forEach(function (c) { cm[c.cal] = c; }); // includes the user's shown / Month choices
      var used = {}, abbr = {};
      Object.keys(cm).forEach(function (id) {
        var c = cm[id]; if (c.on === false) return;
        if (opts.cal === "events" && !L.monthOn(id)) return;
        var a = (c.name || "?").charAt(0).toUpperCase(), base = a, i = 2;
        while (used[a]) a = base + i++;
        used[a] = 1; abbr[id] = a; cals.push({ a: a, name: c.name });
      });
      Object.keys(o).forEach(function (id) {
        var x = o[id]; if (!x || x.k !== "event" || !abbr[x.d.cal]) return;
        var e = x.d, s, en;
        if (e.allDay) { s = e.start; en = e.end; } else { s = new Date(e.start); en = new Date(e.end); }
        events.push({ e: e, a: abbr[e.cal], s: s, en: en, sort: e.allDay ? new Date(e.start + "T00:00").getTime() - 1 : s.getTime() });
      });
      events.sort(function (a, b) { return a.sort - b.sort; });
    }
    return { at: new Date(), inbox: inbox, projects: projects, timetable: timetable, homework: homework, notes: notes,
      focus: focus, cals: cals, events: events, opts: opts };
  }

  /* ---------- 2. render: one line model → Markdown / TXT / HTML ---------- */
  // line: [kind, text] kind = h1 h2 h3 li p
  function lines(m) {
    var out = [];
    function h(k, s) { out.push([k, s]); }
    function check(o) { return (o.x ? "[x] " : "[ ] "); }
    function taskLine(o) {
      var bits = [o.t]; if (o.wk) bits.push("wk " + o.wk); if (o.x && o.x !== 1) bits.push("done " + o.x);
      return check(o) + bits.join(" · ") + (o.n ? "\n  " + o.n.replace(/\n/g, "\n  ") : "");
    }
    h("h1", "Life OS export · " + isoDay(m.at));
    h("p", "Legend: [ ] open · [x] done · dates MM-DD = " + YEAR + " · wk W46 Mon = ISO week + day · due = due date · do = day planned to do it" +
      (m.cals.length > 1 ? " · [C] = which calendar (see Calendar)" : "") + " · indented lines = notes");

    h("h2", "Tasks");
    if (!m.inbox.length && !m.projects.length) h("p", "None.");
    if (m.inbox.length) { h("h3", "To-dos"); m.inbox.forEach(function (o) { h("li", taskLine(o)); }); }
    m.projects.forEach(function (p) {
      h("h3", "Project: " + p.name);
      if (!p.tasks.length) h("p", "No tasks.");
      p.tasks.forEach(function (o) { h("li", taskLine(o)); });
    });

    h("h2", "School");
    if (m.timetable.length) {
      h("h3", "Timetable");
      m.timetable.forEach(function (d) { h("li", d.day + " " + d.time + ": " + (d.lessons.join(", ") || "—")); });
    }
    h("h3", "Homework");
    if (!m.homework.length) h("p", "None.");
    m.homework.forEach(function (o) {
      var bits = [(o.s ? o.s + ": " : "") + o.t];
      if (o.due) bits.push("due " + o.due); if (o.do) bits.push("do " + o.do); if (o.x && o.x !== 1) bits.push("done " + o.x);
      h("li", check(o) + bits.join(" · ") + (o.n ? "\n  " + o.n.replace(/\n/g, "\n  ") : ""));
    });
    if (m.notes.length) {
      h("h3", "Notes");
      m.notes.forEach(function (n) { h("h4", (n.s ? n.s + ": " : "") + n.t); if (n.body) h("p", n.body); });
    }

    if (m.focus.length) {
      h("h2", "Focus sessions");
      h("p", m.focus.map(function (f) { return f.d + " " + f.n + "×/" + f.min + "m"; }).join(" · "));
    }

    if (m.opts.cal !== "none") {
      h("h2", "Calendar");
      if (!m.cals.length) h("p", "Not connected.");
      else {
        h("p", m.cals.map(function (c) { return "[" + c.a + "] " + c.name; }).join(" · ") +
          (m.opts.cal === "events" ? " (daily Schedule left out)" : ""));
        var day = "";
        m.events.forEach(function (x) {
          var e = x.e, key, txt;
          if (e.allDay) {
            key = e.start;
            var last = new Date(+e.end.slice(0, 4), +e.end.slice(5, 7) - 1, +e.end.slice(8, 10) - 1);
            txt = "all day" + (isoDay(last) !== e.start ? " → " + sd(isoDay(last)) : "");
          } else {
            key = isoDay(x.s);
            txt = hm(x.s) + "–" + (isoDay(x.en) !== key ? sd(isoDay(x.en)) + " " : "") + hm(x.en);
          }
          if (key !== day) {
            day = key; var dd = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
            h("h3", sd(key) + " " + DAYS[(dd.getDay() + 6) % 7]);
          }
          h("li", txt + " " + e.title + (e.location ? " @ " + e.location : "") + (m.cals.length > 1 ? " [" + x.a + "]" : ""));
        });
        if (!m.events.length) h("p", "No events.");
      }
    }
    return out;
  }

  function toMD(ls) {
    var mark = { h1: "# ", h2: "\n## ", h3: "\n### ", h4: "\n#### ", li: "- ", p: "" };
    return ls.map(function (l) { return mark[l[0]] + l[1]; }).join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }
  function toTXT(ls) {
    return ls.map(function (l) {
      if (l[0] === "h1") return l[1].toUpperCase();
      if (l[0] === "h2") return "\n" + l[1].toUpperCase();
      if (l[0] === "h3" || l[0] === "h4") return "\n" + l[1] + ":";
      if (l[0] === "li") return "- " + l[1];
      return l[1];
    }).join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function toHTML(ls, title) {
    var body = "", inList = false;
    ls.forEach(function (l) {
      var k = l[0], t = esc(l[1]).replace(/\n {2}/g, "<br><span class=n>").replace(/(<span class=n>[^<]*)/g, "$1</span>");
      if (k === "li") { if (!inList) { body += "<ul>"; inList = true; } body += "<li>" + t + "</li>"; return; }
      if (inList) { body += "</ul>"; inList = false; }
      body += k === "p" ? "<p>" + t.replace(/\n/g, "<br>") + "</p>" : "<" + k + ">" + t + "</" + k + ">";
    });
    if (inList) body += "</ul>";
    return "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>" + esc(title) + "</title>" +
      "<style>body{max-width:720px;margin:0 auto;padding:32px 16px;font:15px/1.5 system-ui,sans-serif;color:#0c0c09;background:#f4f4f1}" +
      "h1{font-size:28px}h2{margin-top:32px;border-bottom:1px solid #dcdcd6}h3{font-size:16px;margin:20px 0 4px}h4{margin:12px 0 4px}" +
      "ul{padding-left:20px;margin:4px 0}p{color:#5f5f59}.n{color:#5f5f59}" +
      "@media(prefers-color-scheme:dark){body{background:#0c0c09;color:#f4f4f1}h2{border-color:#2b2b26}p,.n{color:#a3a39c}}</style>" + body;
  }
  // JSON: same model, short keys explained once in "_keys"
  function toJSON(m) {
    var o = {
      _keys: { t: "title", x: "done (date or 1)", wk: "ISO week + day", n: "notes", s: "subject", due: "due date", do: "planned day",
        d: "date", min: "minutes", a: "calendar", dates: "MM-DD = " + YEAR },
      exported: isoDay(m.at),
      todos: m.inbox, projects: m.projects,
      school: { timetable: m.timetable, homework: m.homework, notes: m.notes },
      focus: m.focus
    };
    if (m.opts.cal !== "none") {
      o.calendars = m.cals;
      o.events = m.events.map(function (x) {
        var e = x.e, r = { t: e.title, a: x.a };
        if (e.allDay) { r.d = sd(e.start); r.allDay = 1; } else { r.d = sd(isoDay(x.s)); r.time = hm(x.s) + "–" + hm(x.en); }
        if (e.location) r.at = e.location;
        return r;
      });
    }
    return JSON.stringify(o);
  }

  /* ---------- 3. ZIP (deflate when the browser can, otherwise stored) ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function deflate(bytes) {
    if (typeof CompressionStream === "undefined") return Promise.resolve(null);
    try {
      var cs = new CompressionStream("deflate-raw");
      var stream = new Blob([bytes]).stream().pipeThrough(cs);
      return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function zip(files) { // files: [{name, text}]
    var enc = new TextEncoder();
    return Promise.all(files.map(function (f) {
      var raw = enc.encode(f.text);
      return deflate(raw).then(function (z) {
        var use = z && z.length < raw.length;
        return { name: enc.encode(f.name), raw: raw, data: use ? z : raw, method: use ? 8 : 0, crc: crc32(raw) };
      });
    })).then(function (fs) {
      var parts = [], central = [], off = 0, now = new Date();
      var dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
      var dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
      fs.forEach(function (f) {
        var h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, f.method, true);
        h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, f.crc, true);
        h.setUint32(18, f.data.length, true); h.setUint32(22, f.raw.length, true); h.setUint16(26, f.name.length, true);
        parts.push(new Uint8Array(h.buffer), f.name, f.data);
        var c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, f.method, true);
        c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, f.crc, true);
        c.setUint32(20, f.data.length, true); c.setUint32(24, f.raw.length, true); c.setUint16(28, f.name.length, true);
        c.setUint32(42, off, true);
        central.push(new Uint8Array(c.buffer), f.name);
        off += 30 + f.name.length + f.data.length;
      });
      var csize = central.reduce(function (s, b) { return s + b.length; }, 0);
      var e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, fs.length, true); e.setUint16(10, fs.length, true);
      e.setUint32(12, csize, true); e.setUint32(16, off, true);
      return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: "application/zip" });
    });
  }

  /* ---------- 4. public ---------- */
  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  // fmt: md | json | html | txt | zip ; opts: {cal: "events"|"all"|"none", done: bool}
  function build(fmt, opts) {
    var m = collect(opts || {}), ls = lines(m), base = "lifeos-" + isoDay(m.at), title = "Life OS export · " + isoDay(m.at);
    var files = {
      md: { name: base + ".md", text: toMD(ls), type: "text/markdown" },
      json: { name: base + ".json", text: toJSON(m), type: "application/json" },
      html: { name: base + ".html", text: toHTML(ls, title), type: "text/html" },
      txt: { name: base + ".txt", text: toTXT(ls), type: "text/plain" }
    };
    if (fmt === "zip") {
      return zip(["md", "json", "html", "txt"].map(function (k) { return files[k]; })).then(function (b) { return { blob: b, name: base + ".zip" }; });
    }
    var f = files[fmt] || files.md;
    return Promise.resolve({ blob: new Blob([f.text], { type: f.type + ";charset=utf-8" }), name: f.name, text: f.text });
  }
  window.LifeExport = {
    build: build,
    download: function (fmt, opts) { return build(fmt, opts).then(function (r) { save(r.blob, r.name); return r; }); }
  };
})();
