// Life OS — connect / disconnect Google Calendar.
// POST {action: "exchange", code, redirect_uri}  → stores the refresh token, then syncs once
// POST {action: "disconnect"}                    → revokes the token, removes calendars and events
// Needs the signed-in user's JWT (the app sends it automatically).
import { admin, cors, exchangeCode, json, revoke, syncUser, userFrom } from "../_shared/google.ts";

const ALLOWED_REDIRECTS = [
  "https://heticon.github.io/LifeOperatingSystem/",
  "http://localhost:8765/",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const user = await userFrom(req, db);
  if (!user) return json({ error: "Sign in first" }, 401);
  const body = await req.json().catch(() => ({}));

  if (body.action === "exchange") {
    if (!body.code || !ALLOWED_REDIRECTS.includes(body.redirect_uri)) return json({ error: "Bad request" }, 400);
    try {
      const { refresh, account } = await exchangeCode(body.code, body.redirect_uri);
      if (!refresh) return json({ error: "Google sent no refresh token. Remove Life OS at myaccount.google.com/permissions and connect again." }, 400);
      const { error } = await db.from("connections").upsert({ user_id: user.id, provider: "google", account, refresh_token: refresh },
        { onConflict: "user_id,provider" });
      if (error) throw error;
      return json(await syncUser(db, user.id));
    } catch (e) {
      return json({ error: String((e as Error).message || e) }, 400);
    }
  }

  if (body.action === "disconnect") {
    const { data: conn } = await db.from("connections").select("refresh_token").eq("user_id", user.id).eq("provider", "google").maybeSingle();
    if (conn) await revoke(conn.refresh_token);
    await db.from("connections").delete().eq("user_id", user.id).eq("provider", "google");
    await db.from("items").update({ deleted: true, data: {}, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).in("kind", ["connection", "calendar", "event"]).eq("deleted", false);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
