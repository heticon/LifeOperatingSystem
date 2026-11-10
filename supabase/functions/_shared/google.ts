// Life OS — shared Google Calendar logic for the Edge Functions.
// The refresh token lives only in public.connections (no browser access).
// Calendars and events are written into public.items, so every device gets them through normal sync:
//   gconn            kind "connection"  {account, at, error}
//   gcal:<calId>     kind "calendar"    {cal, name, color, primary, on}
//   gev:<calId>:<id> kind "event"       {cal, title, start, end, allDay, location, link, colorId}
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export const WINDOW_DAYS = 28;
// Calendars shown in the Month view (everything except the daily "Schedule") are read further ahead.
export const MONTH_BACK = 35, MONTH_AHEAD = 185;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function serviceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (k) return k;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  return keys.default || Object.values(keys)[0] as string;
}
export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });
}
// The signed-in Life OS user behind the request (null if none / invalid).
export async function userFrom(req: Request, db: SupabaseClient) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.startsWith("sb_")) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error ? null : data.user;
}

export function clientId() { return Deno.env.get("GOOGLE_CLIENT_ID")!; }
function clientSecret() { return Deno.env.get("GOOGLE_CLIENT_SECRET")!; }

export async function exchangeCode(code: string, redirectUri: string) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || "Token exchange failed");
  let account = "";
  try { account = JSON.parse(atob(j.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || ""; } catch (_) { /* no email */ }
  return { refresh: j.refresh_token as string | undefined, account };
}

class Expired extends Error {}
async function accessToken(refresh: string) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: clientId(), client_secret: clientSecret(), grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (j.error === "invalid_grant") throw new Expired("Google access expired. Connect again.");
  if (!r.ok) throw new Error(j.error_description || j.error || "Google token refresh failed");
  return j.access_token as string;
}

export async function revoke(refresh: string) {
  await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(refresh), { method: "POST" }).catch(() => {});
}

async function gget(token: string, path: string, params: Record<string, string>) {
  const out: any[] = [];
  let page = "";
  for (;;) {
    const q = new URLSearchParams({ ...params, ...(page ? { pageToken: page } : {}) });
    const r = await fetch(API + path + "?" + q, { headers: { Authorization: "Bearer " + token } });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || "Google Calendar request failed");
    out.push(...(j.items || []));
    if (!j.nextPageToken) return out;
    page = j.nextPageToken;
  }
}

// Stable JSON (sorted keys) so we only write rows that really changed.
function stable(v: any): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}

export function eventData(cal: string, e: any) {
  const allDay = !e.start.dateTime;
  const d: Record<string, unknown> = {
    cal, title: e.summary || "(No title)",
    start: allDay ? e.start.date : e.start.dateTime,
    end: allDay ? e.end.date : e.end.dateTime,
    allDay,
  };
  if (e.location) d.location = e.location;
  if (e.colorId) d.colorId = String(e.colorId); // Google's own event colour (Tomato, Sage, …); the app maps it
  if (e.htmlLink) d.link = e.htmlLink;
  return d;
}
export function declined(e: any) {
  return (e.attendees || []).some((a: any) => a.self && a.responseStatus === "declined");
}

async function writeStatus(db: SupabaseClient, userId: string, account: string, error: string | null) {
  const now = new Date().toISOString();
  await db.from("items").upsert({ user_id: userId, id: "gconn", kind: "connection",
    data: { account, at: now, error }, updated_at: now, deleted: false }, { onConflict: "user_id,id" });
  await db.from("connections").update({ synced_at: now, last_error: error }).eq("user_id", userId).eq("provider", "google");
}

// Pull calendars + events (±4 weeks) for one user and mirror them into items.
export async function syncUser(db: SupabaseClient, userId: string) {
  const { data: conn } = await db.from("connections").select("refresh_token, account").eq("user_id", userId).eq("provider", "google").maybeSingle();
  if (!conn) return { ok: false, error: "Not connected" };
  try {
    const token = await accessToken(conn.refresh_token);
    const now = new Date().toISOString();

    const { data: rows, error } = await db.from("items").select("id, kind, data")
      .eq("user_id", userId).eq("deleted", false).in("kind", ["calendar", "event"]);
    if (error) throw error;
    const have = new Map<string, any>(rows!.map((r) => [r.id, r]));
    const want = new Map<string, { kind: string; data: any }>();

    const cals = await gget(token, "/users/me/calendarList", { maxResults: "250" });
    const on: { id: string; long: boolean }[] = [];
    for (const c of cals) {
      const id = "gcal:" + c.id, prev = have.get(id);
      const name = c.summaryOverride || c.summary || c.id;
      const enabled = prev ? prev.data.on !== false : true; // new calendars start on; the user's choice is kept
      // month: shown in the Month view; the daily "Schedule" calendar is off by default, the user's choice is kept
      const month = prev && typeof prev.data.month === "boolean" ? prev.data.month : !/^schedule$/i.test(String(name).trim());
      want.set(id, { kind: "calendar", data: { cal: c.id, name,
        color: c.backgroundColor || "#888888", primary: !!c.primary, on: enabled, month } });
      if (enabled) on.push({ id: c.id, long: month });
    }

    for (const { id: cal, long } of on) {
      const t0 = new Date(Date.now() - (long ? MONTH_BACK : WINDOW_DAYS) * 864e5).toISOString();
      const t1 = new Date(Date.now() + (long ? MONTH_AHEAD : WINDOW_DAYS) * 864e5).toISOString();
      const evs = await gget(token, "/calendars/" + encodeURIComponent(cal) + "/events",
        { timeMin: t0, timeMax: t1, singleEvents: "true", orderBy: "startTime", maxResults: "2500" });
      for (const e of evs) {
        if (e.status === "cancelled" || !e.start || declined(e)) continue;
        want.set("gev:" + cal + ":" + e.id, { kind: "event", data: eventData(cal, e) });
      }
    }

    const up: any[] = [];
    for (const [id, w] of want) {
      const prev = have.get(id);
      if (prev && stable(prev.data) === stable(w.data)) continue;
      up.push({ user_id: userId, id, kind: w.kind, data: w.data, updated_at: now, deleted: false });
    }
    for (const [id, prev] of have) {
      if (!want.has(id)) up.push({ user_id: userId, id, kind: prev.kind, data: {}, updated_at: now, deleted: true });
    }
    for (let i = 0; i < up.length; i += 500) {
      const { error: e2 } = await db.from("items").upsert(up.slice(i, i + 500), { onConflict: "user_id,id" });
      if (e2) throw e2;
    }
    // Deleted events older than 30 days are no longer needed by any device.
    await db.from("items").delete().eq("user_id", userId).eq("kind", "event").eq("deleted", true)
      .lt("synced_at", new Date(Date.now() - 30 * 864e5).toISOString());

    await writeStatus(db, userId, conn.account, null);
    return { ok: true, calendars: cals.length, written: up.length };
  } catch (e) {
    const msg = e instanceof Expired ? e.message : String((e as Error).message || e);
    await writeStatus(db, userId, conn.account, msg);
    return { ok: false, error: msg };
  }
}
