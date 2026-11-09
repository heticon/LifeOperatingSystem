// Офлайн-кеш Life OS. Після кожного оновлення програми збільшуй номер версії.
const VERSION = "lifeos-v14";
const SHELL = [
  "./", "index.html", "styles.css", "themes.js", "app.js", "sync.js", "vendor/supabase.js", "manifest.webmanifest",
  "fonts/inter-latin-wght-normal.woff2", "fonts/inter-latin-ext-wght-normal.woff2", "fonts/inter-cyrillic-wght-normal.woff2",
  "fonts/open-sans-latin-wght-normal.woff2", "fonts/open-sans-latin-ext-wght-normal.woff2", "fonts/open-sans-cyrillic-wght-normal.woff2", "fonts/inconsolata-latin-wght-normal.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  // не активуємось одразу: нова версія чекає, поки користувач натисне «Reload» у банері
  // cache: "reload" — беремо файли з мережі, а не зі звичайного кешу браузера (інакше нова версія може змішатися зі старою)
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // погоду завжди беремо з інтернету (кеш погоди тримає сама програма)
  if (url.origin !== location.origin) return;
  // свої файли: спершу мережа (щоб бачити оновлення), без мережі — кеш
  if (e.request.method !== "GET") return;
  // no-cache: браузер щоразу перевіряє в сервера, чи файл змінився (GitHub Pages кешує на 10 хв)
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin", redirect: e.request.mode === "navigate" ? "manual" : "follow" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
