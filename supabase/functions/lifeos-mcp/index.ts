// Life OS connector (MCP, Streamable HTTP, stateless JSON responses).
// Sign-in: Supabase Auth's own OAuth 2.1 server (consent page = oauth.html on the live site).
// The bearer token is a normal Supabase user token, so every query runs under the user's RLS —
// this function holds no secret key and can only touch the signed-in user's own rows.
// Writes go into public.items exactly like a device would; open apps get them through realtime / next pull.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const SUPA = Deno.env.get("SUPABASE_URL")!;
const ANON = "sb_publishable_RCK_PYOpusB7LcupzeDf_g_BOzeB8ev"; // public key (same as in sync.js)
const PUBLIC_BASE = "https://ulezusdpxglednvswkyk.supabase.co/functions/v1/lifeos-mcp";
const ISSUER = "https://ulezusdpxglednvswkyk.supabase.co/auth/v1";
const TZ = "Europe/Berlin";
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};
const json = (b: unknown, status = 200, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", ...h } });

/* ---------- dates (all in Europe/Berlin) ---------- */
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const utc = (iso: string) => new Date(iso + "T00:00:00Z");
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = utc(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const wd = (iso: string) => (utc(iso).getUTCDay() + 6) % 7; // 0 = Monday
function weekKey(iso: string) {
  const t = utc(iso); t.setUTCDate(t.getUTCDate() + 3 - wd(iso));
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return t.getUTCFullYear() + "-W" + String(Math.ceil(((+t - y0) / 864e5 + 1) / 7)).padStart(2, "0");
}
function mondayOfWeek(key: string) { // "2026-W46" → ISO date of that Monday
  const [y, w] = key.split("-W").map(Number);
  const jan4 = `${y}-01-04`;
  return addDays(addDays(jan4, -wd(jan4)), (w - 1) * 7);
}
const nice = (iso: string) => `${DAYS[wd(iso)]} ${iso}`;
const hm = (dt: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(dt));
const dayOfDT = (dt: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(dt));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- data ---------- */
type Row = { id: string; kind: string; data: any };
class Data {
  rows: Row[] = [];
  constructor(public db: SupabaseClient, public userId: string) {}
  async load(kinds: string[]) {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from("items").select("id,kind,data")
        .eq("deleted", false).in("kind", kinds).range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data as Row[]));
      if (data!.length < 1000) break;
    }
    this.rows = out; return this;
  }
  of(kind: string) { return this.rows.filter((r) => r.kind === kind).map((r) => r.data); }
  get(id: string, kind: string) { const r = this.rows.find((x) => x.id === id && x.kind === kind); return r ? r.data : null; }
  async put(id: string, kind: string, data: any, deleted = false) {
    const { error } = await this.db.from("items").upsert({ user_id: this.userId, id, kind, data: deleted ? {} : data,
      updated_at: new Date().toISOString(), deleted }, { onConflict: "user_id,id" });
    if (error) throw new Error(error.message);
  }
  subjects() { return this.of("subject").sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)); }
  subjName(id: string) { const s = this.subjects().find((x) => x.id === id); return s ? s.name : "?"; }
  findSubject(name: string) {
    const n = String(name || "").trim().toLowerCase(), all = this.subjects();
    return all.find((s) => s.name.toLowerCase() === n) || all.find((s) => s.name.toLowerCase().startsWith(n)) || null;
  }
  timetable(): { start: string; end: string; items: string[] }[] { const t = this.get("timetable", "timetable"); return t ? t.days : []; }
  nextLesson(sid: string, after = todayISO()) {
    const tt = this.timetable();
    for (let k = 1; k <= 14; k++) { const d = addDays(after, k), i = wd(d); if (i < 5 && tt[i]?.items.includes(sid)) return d; }
    return null;
  }
  projectName(id: string | null) { const p = id && this.of("project").find((x) => x.id === id); return p ? p.name : null; }
}

/* ---------- formatting ---------- */
function taskWhen(t: any) {
  if (!t.week) return "";
  if (t.day == null) return t.week === weekKey(todayISO()) ? "this week" : "week " + t.week;
  return nice(addDays(mondayOfWeek(t.week), t.day));
}
function taskLine(d: Data, t: any) {
  const bits = [taskWhen(t), d.projectName(t.projectId) && "project: " + d.projectName(t.projectId), t.notes && "notes: " + t.notes].filter(Boolean);
  return `- [${t.done ? "x" : " "}] ${t.title} (id ${t.id})${bits.length ? " · " + bits.join(" · ") : ""}`;
}
function hwLine(d: Data, h: any) {
  const today = todayISO();
  const due = h.due ? (h.due < today && !h.done ? "OVERDUE " : "") + "due " + nice(h.due) : "no due date";
  const bits = [d.subjName(h.subjectId), due, h.plan && "do on " + nice(h.plan), h.notes && "notes: " + h.notes].filter(Boolean);
  return `- [${h.done ? "x" : " "}] ${h.title} (id ${h.id}) · ${bits.join(" · ")}`;
}
function eventLine(e: any) {
  const when = e.allDay ? "all day" : `${hm(e.start)}–${hm(e.end)}`;
  return `- ${when} ${e.title}${e.location ? " @ " + e.location : ""}`;
}
function eventsBetween(d: Data, from: string, to: string) { // inclusive dates
  const calOn = new Map(d.of("calendar").map((c) => [c.cal, c]));
  return d.of("event").filter((e) => calOn.get(e.cal)?.on !== false).filter((e) => {
    const s = e.allDay ? e.start : dayOfDT(e.start);
    const end = e.allDay ? addDays(e.end, -1) : dayOfDT(e.end);
    return s <= to && end >= from;
  }).sort((a, b) => (a.start < b.start ? -1 : 1));
}
function lessonsOn(d: Data, iso: string) {
  const i = wd(iso), day = d.timetable()[i];
  if (i > 4 || !day || !day.items.length) return "no school";
  return `${day.start}–${day.end}: ${day.items.map((s) => d.subjName(s)).join(", ")}`;
}

/* ---------- tools ---------- */
const S = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });
const DATE = str("Date YYYY-MM-DD (Europe/Berlin)");

const TOOLS = [
  { name: "today", title: "Today overview", description: "Start here. Today's date and ISO week, school lessons, calendar events, open tasks for today/this week and the inbox, and open homework (overdue first).",
    inputSchema: S({}), annotations: { readOnlyHint: true } },
  { name: "list_tasks", title: "List tasks", description: "List to-dos. Tasks can sit in the inbox (no date), in a week (any day) or on a day of a week.",
    inputSchema: S({ status: { type: "string", enum: ["open", "done", "all"], description: "Default open" }, week: str("Only this ISO week, e.g. 2026-W46") }),
    annotations: { readOnlyHint: true } },
  { name: "add_task", title: "Add task", description: "Add a to-do. Give `date` to plan it on a day, or `week` (ISO, e.g. 2026-W47) for 'some day that week', or neither for the inbox.",
    inputSchema: S({ title: str("Task title"), date: DATE, week: str("ISO week like 2026-W47 (ignored if date is given)"), project: str("Project name (must exist)"), notes: str("Optional notes") }, ["title"]) },
  { name: "update_task", title: "Update task", description: "Change a task: mark done/undone, rename, re-plan (date, week, or inbox) or edit notes.",
    inputSchema: S({ id: str("Task id"), done: { type: "boolean" }, title: str("New title"), date: DATE, week: str("ISO week (sets 'any day that week')"), inbox: { type: "boolean", description: "true = remove date/week" }, notes: str("Replace notes") }, ["id"]) },
  { name: "delete_task", title: "Delete task", description: "Delete a task permanently. Prefer update_task done=true for finished tasks.",
    inputSchema: S({ id: str("Task id") }, ["id"]), annotations: { destructiveHint: true } },
  { name: "list_homework", title: "List homework", description: "List homework with subject, due date and 'do on' plan.",
    inputSchema: S({ status: { type: "string", enum: ["open", "done", "all"], description: "Default open" }, subject: str("Only this subject") }),
    annotations: { readOnlyHint: true } },
  { name: "add_homework", title: "Add homework", description: "Add homework for a school subject (German name, e.g. Mathe, Deutsch, Spanisch). Due date defaults to the subject's next lesson.",
    inputSchema: S({ subject: str("Subject name"), title: str("What to do"), due: DATE, do_on: str("Day to work on it, YYYY-MM-DD"), notes: str("Optional notes") }, ["subject", "title"]) },
  { name: "update_homework", title: "Update homework", description: "Mark homework done/undone or change title, due date, 'do on' day or notes.",
    inputSchema: S({ id: str("Homework id"), done: { type: "boolean" }, title: str("New title"), due: str("YYYY-MM-DD, or 'none'"), do_on: str("YYYY-MM-DD, or 'none'"), notes: str("Replace notes") }, ["id"]) },
  { name: "list_events", title: "List calendar events", description: "Google Calendar events (read-only mirror, about 4 weeks back/ahead; important calendars up to 6 months ahead).",
    inputSchema: S({ from: DATE, to: str("End date YYYY-MM-DD inclusive (default: from + 6 days)") }), annotations: { readOnlyHint: true } },
  { name: "get_timetable", title: "School timetable", description: "Weekly school timetable (Mon–Fri) and the list of subjects.",
    inputSchema: S({}), annotations: { readOnlyHint: true } },
];

const ALL_KINDS = ["task", "project", "homework", "subject", "timetable", "event", "calendar"];

async function callTool(d: Data, name: string, a: any): Promise<string> {
  const today = todayISO();
  switch (name) {
    case "today": {
      await d.load(ALL_KINDS);
      const wk = weekKey(today), di = wd(today);
      const tasks = d.of("task").filter((t) => !t.done);
      const todayT = tasks.filter((t) => t.week === wk && t.day === di);
      const overdueT = tasks.filter((t) => t.week && t.day != null && addDays(mondayOfWeek(t.week), t.day) < today);
      const weekT = tasks.filter((t) => t.week === wk && t.day == null);
      const inbox = tasks.filter((t) => !t.week);
      const hw = d.of("homework").filter((h) => !h.done).sort((x, y) => (x.due || "9999") < (y.due || "9999") ? -1 : 1);
      const ev = eventsBetween(d, today, today);
      const sec = (title: string, lines: string[]) => lines.length ? `\n## ${title}\n${lines.join("\n")}` : "";
      return `Today: ${nice(today)} · ISO week ${wk} · now ${hm(new Date().toISOString())} (Europe/Berlin)\nSchool: ${lessonsOn(d, today)}` +
        sec("Calendar today", ev.map(eventLine)) +
        sec("Tasks planned earlier, still open", overdueT.map((t) => taskLine(d, t))) +
        sec("Tasks today", todayT.map((t) => taskLine(d, t))) +
        sec("Tasks this week (any day)", weekT.map((t) => taskLine(d, t))) +
        sec("Inbox", inbox.map((t) => taskLine(d, t))) +
        sec("Open homework", hw.map((h) => hwLine(d, h)));
    }
    case "list_tasks": {
      await d.load(["task", "project"]);
      const st = a.status || "open";
      const list = d.of("task").filter((t) => st === "all" || (st === "done") === !!t.done).filter((t) => !a.week || t.week === a.week)
        .sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
      return list.length ? list.map((t) => taskLine(d, t)).join("\n") : "No tasks.";
    }
    case "add_task": {
      await d.load(["task", "project"]);
      const t: any = { id: uid(), title: String(a.title || "").trim(), done: false, doneAt: null, createdAt: Date.now(), projectId: null, week: null, day: null, notes: a.notes || "" };
      if (!t.title) throw new Error("title is empty");
      planTask(t, a);
      if (a.project) {
        const p = d.of("project").find((x) => x.name.toLowerCase() === String(a.project).toLowerCase());
        if (!p) throw new Error(`No project "${a.project}". Existing: ${d.of("project").map((x) => x.name).join(", ") || "none"}`);
        t.projectId = p.id;
      }
      await d.put(t.id, "task", t);
      return "Added: " + taskLine(d, t);
    }
    case "update_task": {
      await d.load(["task", "project"]);
      const t = d.get(a.id, "task"); if (!t) throw new Error("No task with id " + a.id);
      if (typeof a.done === "boolean") { t.done = a.done; t.doneAt = a.done ? Date.now() : null; }
      if (a.title) t.title = String(a.title).trim();
      if (typeof a.notes === "string") t.notes = a.notes;
      if (a.inbox) { t.week = null; t.day = null; } else planTask(t, a);
      await d.put(t.id, "task", t);
      return "Updated: " + taskLine(d, t);
    }
    case "delete_task": {
      await d.load(["task"]);
      const t = d.get(a.id, "task"); if (!t) throw new Error("No task with id " + a.id);
      await d.put(t.id, "task", null, true);
      return `Deleted task "${t.title}".`;
    }
    case "list_homework": {
      await d.load(["homework", "subject"]);
      const st = a.status || "open", s = a.subject ? d.findSubject(a.subject) : null;
      if (a.subject && !s) throw new Error(`No subject "${a.subject}"`);
      const list = d.of("homework").filter((h) => st === "all" || (st === "done") === !!h.done).filter((h) => !s || h.subjectId === s.id)
        .sort((x, y) => (x.due || "9999") < (y.due || "9999") ? -1 : 1);
      return list.length ? list.map((h) => hwLine(d, h)).join("\n") : "No homework.";
    }
    case "add_homework": {
      await d.load(["homework", "subject", "timetable"]);
      const s = d.findSubject(a.subject);
      if (!s) throw new Error(`No subject "${a.subject}". Subjects: ${d.subjects().map((x) => x.name).join(", ")}`);
      const title = String(a.title || "").trim(); if (!title) throw new Error("title is empty");
      const h = { id: uid(), subjectId: s.id, title, due: checkDate(a.due) || d.nextLesson(s.id), plan: checkDate(a.do_on) || null,
        done: false, doneAt: null, createdAt: Date.now(), notes: a.notes || "" };
      await d.put(h.id, "homework", h);
      return "Added: " + hwLine(d, h);
    }
    case "update_homework": {
      await d.load(["homework", "subject"]);
      const h = d.get(a.id, "homework"); if (!h) throw new Error("No homework with id " + a.id);
      if (typeof a.done === "boolean") { h.done = a.done; h.doneAt = a.done ? Date.now() : null; }
      if (a.title) h.title = String(a.title).trim();
      if (a.due) h.due = a.due === "none" ? null : checkDate(a.due);
      if (a.do_on) h.plan = a.do_on === "none" ? null : checkDate(a.do_on);
      if (typeof a.notes === "string") h.notes = a.notes;
      await d.put(h.id, "homework", h);
      return "Updated: " + hwLine(d, h);
    }
    case "list_events": {
      await d.load(["event", "calendar"]);
      const from = checkDate(a.from) || today, to = checkDate(a.to) || addDays(from, 6);
      const ev = eventsBetween(d, from, to);
      if (!ev.length) return `No events ${from} – ${to}.`;
      const byDay = new Map<string, string[]>();
      for (const e of ev) {
        const s = e.allDay ? e.start : dayOfDT(e.start), k = s < from ? from : s;
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k)!.push(eventLine(e));
      }
      return [...byDay.keys()].sort().map((k) => `## ${nice(k)}\n${byDay.get(k)!.join("\n")}`).join("\n");
    }
    case "get_timetable": {
      await d.load(["subject", "timetable"]);
      const tt = d.timetable();
      if (!tt.length) return "No timetable yet.";
      return tt.map((day, i) => `${DAYS[i]} ${day.start}–${day.end}: ${day.items.map((s) => d.subjName(s)).join(", ") || "—"}`).join("\n") +
        "\nSubjects: " + d.subjects().map((s) => s.name).join(", ");
    }
  }
  throw new Error("Unknown tool " + name);
}
function checkDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error(`Bad date "${v}", use YYYY-MM-DD`);
  return String(v);
}
function planTask(t: any, a: any) {
  if (a.date) { const iso = checkDate(a.date)!; t.week = weekKey(iso); t.day = wd(iso); }
  else if (a.week) {
    if (!/^\d{4}-W\d{2}$/.test(a.week)) throw new Error(`Bad week "${a.week}", use e.g. 2026-W47`);
    t.week = a.week; t.day = null;
  }
}

/* ---------- HTTP ---------- */
function unauthorized(msg = "Sign in required") {
  return json({ error: "invalid_token", error_description: msg }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${PUBLIC_BASE}/.well-known/oauth-protected-resource"`,
  });
}
const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (path.endsWith("/.well-known/oauth-protected-resource") || path.includes("/.well-known/oauth-protected-resource/")) {
    return json({ resource: PUBLIC_BASE, authorization_servers: [ISSUER], bearer_methods_supported: ["header"],
      resource_name: "Life OS" });
  }
  if (req.method === "GET") return new Response("Life OS MCP endpoint. Use POST (Streamable HTTP).", { status: 405, headers: { ...cors, Allow: "POST" } });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: cors });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return unauthorized();
  const db = createClient(SUPA, ANON, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await db.auth.getUser(token);
  if (ue || !u?.user) return unauthorized("Token expired or invalid");

  let msg: any;
  try { msg = await req.json(); } catch { return rpcError(null, -32700, "Parse error"); }
  if (Array.isArray(msg)) return rpcError(null, -32600, "Batches are not supported");
  const { id, method, params } = msg || {};
  if (id === undefined) return new Response(null, { status: 202, headers: cors }); // notification

  switch (method) {
    case "initialize": {
      const v = VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0];
      return rpcResult(id, { protocolVersion: v, capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "life-os", title: "Life OS", version: "1.0.0" },
        instructions: "Bohdan's Life OS: to-dos, school homework and timetable (German subject names), and a read-only mirror of his Google Calendar. Times are Europe/Berlin. Call `today` first. Ids come from list results; never invent them." });
    }
    case "ping": return rpcResult(id, {});
    case "tools/list": return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      try {
        const text = await callTool(new Data(db, u.user.id), params?.name, params?.arguments || {});
        return rpcResult(id, { content: [{ type: "text", text }] });
      } catch (e) {
        return rpcResult(id, { content: [{ type: "text", text: "Error: " + ((e as Error).message || e) }], isError: true });
      }
    }
    case "resources/list": return rpcResult(id, { resources: [] });
    case "prompts/list": return rpcResult(id, { prompts: [] });
    default: return rpcError(id, -32601, "Method not found: " + method);
  }
});
