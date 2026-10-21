
const CACHE_NAME = "bunkasai-pos-v4";
const OPTIONAL_ASSETS = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const indexUrl = new URL("./index.html", self.registration.scope).href;

    // オフライン表示に必要なトップページを先に保存
    await cache.add(indexUrl);

    // アイコンなどは取得に失敗してもインストールを続ける
    await Promise.all(
      OPTIONAL_ASSETS.map(async path => {
        try {
          await cache.add(new URL(path, self.registration.scope).href);
        } catch (error) {
          console.warn("Optional asset could not be cached:", path);
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith("bunkasai-pos-") &&
          key !== CACHE_NAME
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 外部サイトへの通信には介入しない
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // ページ移動・再読み込みは、通信失敗時に保存済みページを返す
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);

        if (response.ok) {
          await cache.put(
            new URL("./index.html", self.registration.scope).href,
            response.clone()
          );
        }

        return response;
      } catch (error) {
        const savedPage = await cache.match(
          new URL("./index.html", self.registration.scope).href
        );

        if (savedPage) return savedPage;

        return new Response(
          "オフラインです。インターネットに接続して再度お試しください。",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          }
        );
      }
    }

    // 保存済みファイルを優先して利用
    const cached = await cache.match(request);
    if (cached) return cached;

    // 未保存のファイルはオンライン時に取得し、保存を試みる
    try {
      const response = await fetch(request);

      if (response.ok) {
        await cache.put(request, response.clone());
      }

      return response;
    } catch (error) {
      return new Response("オフラインです。", { status: 503 });
    }
  })());
});
