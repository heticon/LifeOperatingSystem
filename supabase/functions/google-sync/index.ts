// Life OS — refresh Google Calendar events.
// With the user's JWT (Refresh button): syncs that user now.
// Without a user (pg_cron every 15 min): syncs every connection not synced in the last 10 minutes.
// That throttle makes the public, no-JWT call harmless — it can only trigger a normal refresh.
import { admin, cors, json, syncUser, userFrom } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const user = await userFrom(req, db);
  if (user) return json(await syncUser(db, user.id));

  const cutoff = new Date(Date.now() - 10 * 60e3).toISOString();
  const { data, error } = await db.from("connections").select("user_id")
    .eq("provider", "google").or("synced_at.is.null,synced_at.lt." + cutoff);
  if (error) return json({ error: error.message }, 500);
  const results = [];
  for (const c of data || []) results.push(await syncUser(db, c.user_id));
  return json({ ok: true, users: results.length });
});
