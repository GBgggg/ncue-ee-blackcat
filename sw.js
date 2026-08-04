/* 彰師電子小黑貓 Service Worker：離線可開 App 外殼
 *
 * 快取策略（改過，請勿改回去）：
 *   - HTML／導覽請求 → 「網路優先」。發布後使用者一開就是新版，
 *     不需要手動 Ctrl+Shift+R。斷線時才退回快取。
 *   - 其他同源靜態資源（圖片、manifest）→ 「快取優先 + 背景更新」，開得快。
 *
 * 為什麼要改：舊版對所有請求都是 `cached || network`（一律快取優先），
 * 結果每次發布後，所有人看到的都還是上一版，而且會一直停在那裡，
 * 因為新版只默默寫進快取、要等下一次開啟才生效。這是刻意修掉的行為。
 */
/* 改了 CORE 就要改版本號，否則 install 時 addAll 的清單不會重跑，
   新加的檔案永遠不會進預快取。 */
const CACHE = 'blackcat-v26';
const CORE = ['./', './index.html', './image.png', './manifest.json',
              './blackcatspice.html'];   // 電路模擬器（獨立頁）
const PUSH_API = 'https://blackcat-quote.cctsai03.workers.dev';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ==========================================================
 * 上課提醒：收到推播
 *
 * 伺服器送的是「無酬載」推播（只是喚醒訊號），內容要回頭跟 Worker 拿。
 * 這樣就不必實作 Web Push 的酬載加密，少掉一大塊容易出錯的密碼學。
 *
 * 注意：瀏覽器規定收到推播「一定」要顯示通知，否則會懲罰（甚至撤銷權限），
 * 所以就算拿不到內容也要顯示一則保底通知。
 * ========================================================== */
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let note = { title: '上課提醒 🐾', body: '快到上課時間了', tag: 'class-reminder' };
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch(`${PUSH_API}/push/pending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        const j = await r.json();
        if (j && j.note && j.note.title) note = j.note;
      }
    } catch (err) {
      // 取不到內容就用保底文案，不能不顯示
    }
    await self.registration.showNotification(note.title, {
      body: note.body || '',
      icon: './image.png',
      badge: './image.png',
      tag: note.tag || 'class-reminder',
      renotify: true,
      data: { url: './' },
    });
  })());
});

// 點通知就把 App 帶到前景（已開著就聚焦，沒開就開新的）
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

// 導覽請求，或明確要 HTML 的請求
const isHTML = (req) =>
  req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

const putInCache = (req, res) => {
  if (res && res.status === 200) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 只處理同源資源。跨源（Firebase／報價 Worker／字典 API）一律走網路。
  if (url.origin !== location.origin) return;

  if (isHTML(req)) {
    // 網路優先，且用 cache:'reload' 繞過瀏覽器自己的 HTTP 快取。
    // 少了這個還是會拿到舊版：GitHub Pages 對 HTML 送 max-age=600，
    // 光是 fetch(req) 會被瀏覽器用 10 分鐘內的舊副本擋下來。
    e.respondWith(
      fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
        .then((res) => putInCache(req, res))
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // 靜態資源：快取優先，同時在背景抓新版寫回快取
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => putInCache(req, res)).catch(() => cached);
      return cached || network;
    })
  );
});
