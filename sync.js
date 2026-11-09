/* Life OS — синхронізація з Supabase.
   Модель: локальні дані (localStorage) — головні й працюють офлайн.
   app.js розкладає дані на записи {id: {k: kind, d: data}}; тут ми:
   1) порівнюємо записи зі «знімком» останнього синхронізованого стану → зміни йдуть у чергу (outbox);
   2) відправляємо чергу в таблицю items;
   3) забираємо чужі зміни (synced_at > lastPull) + live-оновлення через Realtime.
   Конфлікт: перемагає новіший updated_at. */
(function () {
  "use strict";

  // Публічні значення: дані захищає row-level security. Секретний ключ сюди НІКОЛИ не кладемо.
  var SUPABASE_URL = "https://ulezusdpxglednvswkyk.supabase.co";
  var SUPABASE_KEY = "sb_publishable_RCK_PYOpusB7LcupzeDf_g_BOzeB8ev";
  var AUTH_KEY = "lifeos.auth";
  var PAGE = 1000;

  function ls(key, val) {
    try {
      if (val === undefined) { var v = localStorage.getItem(key); return v == null ? null : JSON.parse(v); }
      if (val === null) { localStorage.removeItem(key); return; }
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  // стабільний JSON (ключі за алфавітом) — Postgres jsonb міняє порядок ключів
  function stable(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
  }

  var client = null, user = null, hooks = null, channel = null;
  var snap = ls("lifeos.synced") || {};    // id -> {k, j}   останній відомий серверу стан
  var outbox = ls("lifeos.outbox") || {};  // id -> рядок для upsert
  var lastPull = ls("lifeos.lastPull");    // ISO synced_at
  var status = { state: "idle", at: ls("lifeos.syncedAt"), error: null };
  var flushTimer = null, busy = false, again = false;

  function saveState() { ls("lifeos.synced", snap); ls("lifeos.outbox", outbox); ls("lifeos.lastPull", lastPull); }
  // немає мережі (або сервер недоступний) — це «Offline», а не помилка
  function failState(e) {
    var m = (e && e.message) || "";
    return !navigator.onLine || /fetch|network|load failed/i.test(m) ? "offline" : "error";
  }
  function pending() { return Object.keys(outbox).length; }
  function setStatus(state, err) {
    status.state = state; status.error = err || null;
    if (state === "synced") { status.at = Date.now(); ls("lifeos.syncedAt", status.at); }
    if (hooks && hooks.onStatus) hooks.onStatus(api.status());
  }

  /* ---------- локальні зміни → черга ---------- */
  function changed() {
    if (!hooks || !user) return;
    var cur = hooks.records(), now = new Date().toISOString(), any = false;
    Object.keys(cur).forEach(function (id) {
      var j = stable(cur[id].d), s = snap[id];
      if (s && s.j === j) return;
      snap[id] = { k: cur[id].k, j: j };
      outbox[id] = { id: id, user_id: user.id, kind: cur[id].k, data: JSON.parse(j), updated_at: now, deleted: false };
      any = true;
    });
    Object.keys(snap).forEach(function (id) {
      if (cur[id]) return;
      outbox[id] = { id: id, user_id: user.id, kind: snap[id].k, data: {}, updated_at: now, deleted: true };
      delete snap[id]; any = true;
    });
    if (!any) return;
    saveState();
    clearTimeout(flushTimer);
    flushTimer = setTimeout(sync, 400);
  }

  /* ---------- серверні зміни → локальні дані ---------- */
  function applyRows(rows, full) {
    var changes = [];
    rows.forEach(function (r) {
      var mine = outbox[r.id], mt = mine ? Date.parse(mine.updated_at) : 0, rt = Date.parse(r.updated_at);
      if (mine && mt > rt) return; // наша зміна новіша — вона ще піде на сервер
      if (mine && mt === rt) { delete outbox[r.id]; return; } // це наш власний запис
      delete outbox[r.id];
      if (r.deleted) {
        if (snap[r.id] || full) changes.push({ id: r.id, k: r.kind, deleted: true });
        delete snap[r.id];
      } else {
        var j = stable(r.data);
        if (!full && snap[r.id] && snap[r.id].j === j) return;
        snap[r.id] = { k: r.kind, j: j };
        changes.push({ id: r.id, k: r.kind, d: r.data });
      }
    });
    rows.forEach(function (r) { if (r.synced_at && (!lastPull || r.synced_at > lastPull)) lastPull = r.synced_at; });
    saveState();
    if (changes.length || full) hooks.apply(changes, !!full);
  }

  async function pullAll(since) {
    var rows = [], from = 0;
    for (;;) {
      var q = client.from("items").select("id,kind,data,updated_at,deleted,synced_at").order("synced_at").range(from, from + PAGE - 1);
      if (since) q = q.gt("synced_at", since);
      var res = await q;
      if (res.error) throw res.error;
      rows = rows.concat(res.data);
      if (res.data.length < PAGE) return rows;
      from += PAGE;
    }
  }

  async function push() {
    var rows = Object.keys(outbox).map(function (id) { return outbox[id]; });
    if (!rows.length) return;
    for (var i = 0; i < rows.length; i += 500) {
      var part = rows.slice(i, i + 500);
      var res = await client.from("items").upsert(part, { onConflict: "user_id,id" });
      if (res.error) throw res.error;
      part.forEach(function (r) { if (outbox[r.id] && outbox[r.id].updated_at === r.updated_at) delete outbox[r.id]; });
      saveState();
    }
  }

  async function sync() {
    if (!user) return;
    if (busy) { again = true; return; }
    if (!navigator.onLine) { setStatus("offline"); return; }
    busy = true; setStatus("syncing");
    try {
      await push();
      applyRows(await pullAll(lastPull), false);
      setStatus("synced");
    } catch (e) {
      setStatus(failState(e), e && e.message);
    } finally {
      busy = false;
      if (again) { again = false; sync(); }
    }
  }

  // Перший вхід на пристрої: якщо в акаунті вже є дані — беремо їх (локальні зберігаємо як резервну копію);
  // якщо акаунт порожній — завантажуємо туди дані цього пристрою.
  async function firstSync() {
    setStatus("syncing");
    var rows = await pullAll(null);
    var live = rows.filter(function (r) { return !r.deleted; });
    snap = {}; outbox = {}; lastPull = null;
    if (live.length) {
      hooks.backup();
      applyRows(rows, true);
    } else {
      rows.forEach(function (r) { if (r.synced_at && (!lastPull || r.synced_at > lastPull)) lastPull = r.synced_at; });
      saveState();
      changed();
      await push();
    }
    ls("lifeos.syncUser", user.id);
    setStatus("synced");
  }

  function listen() {
    if (channel) client.removeChannel(channel);
    channel = client.channel("items-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: "user_id=eq." + user.id },
        function (p) { if (p.new && p.new.id) { applyRows([p.new], false); setStatus("synced"); } })
      .subscribe();
  }

  async function start(session) {
    user = session.user;
    if (ls("lifeos.syncUser") !== user.id) await firstSync();
    else await sync();
    listen();
  }

  var api = {
    hasSession: function () { return !!ls(AUTH_KEY); },
    init: async function (h) {
      hooks = h;
      if (!window.supabase) { setStatus("error", "Sync library missing"); return; }
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_KEY, detectSessionInUrl: false }
      });
      window.addEventListener("online", sync);
      window.addEventListener("offline", function () { setStatus("offline"); });
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") sync(); });
      setInterval(function () { if (document.visibilityState === "visible") sync(); }, 60000);
      var res = await client.auth.getSession();
      var s = res.data && res.data.session;
      if (s) { try { await start(s); } catch (e) { setStatus(failState(e), e && e.message); } }
      else if (hooks.onSignedOut) hooks.onSignedOut();
    },
    signIn: async function (email, password) {
      var res = await client.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      await start(res.data.session);
    },
    signOut: async function () {
      try { await client.auth.signOut(); } catch (e) { /* офлайн — все одно виходимо локально */ }
      ls(AUTH_KEY, null);
      ["lifeos.synced", "lifeos.outbox", "lifeos.lastPull", "lifeos.syncUser", "lifeos.syncedAt"].forEach(function (k) { ls(k, null); });
    },
    changed: changed,
    syncNow: sync,
    status: function () { return { state: status.state, at: status.at, error: status.error, pending: pending(), email: user ? user.email : null }; }
  };
  window.LifeSync = api;
})();
