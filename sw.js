/* 小黑貓 Service Worker：離線可開 App 外殼
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
const CACHE = 'blackcat-v88';
/* ★★ 推播金鑰的快取。下面 activate 那段會刪掉「不是這一版 CACHE」的
   所有快取，**這個一定要排除掉**——洗掉的話，頁面下次訂閱會帶一把新鑰匙
   上去，Worker 認得是舊的那把於是回 403，症狀是
   「發布新版之後所有人的上課提醒都打不開」，而畫面上只寫著「失敗」。
   名字要跟 publicnew.html 的 PUSH_KEY_CACHE 一致。 */
const AUTH_CACHE = 'blackcat-push-auth';
const AUTH_URL   = 'https://blackcat-push.local/authkey';
/* ★ 每一個會發布出去的頁面都要在這裡。漏掉不會報錯——
   只有離線、或 service worker 已經接管的時候點過去才會白畫面，
   而且只有把網站裝成 App 的人遇得到。
   `tests/mainsmoke.mjs` 會拿發布腳本的 git add 清單來比對這一行。 */
const CORE = ['./', './index.html', './logomain.jpg', './manifest.json',
              './logoncueee.jpg',           // 彰師電子的 logo（ncue.html 用）
              './ncue.html',            // 彰師電子（獨立頁）
              './blackcatspice.html',   // 電路模擬器（獨立頁）
              './blackcatmd.html',      // 筆記編輯器（獨立頁）
              /* ★ 自己 host 的第三方函式庫（原本掛在 unpkg／cdnjs 上）。
                 搬進來的理由是資安不是效能：`unpkg.com/lucide@latest`
                 那種浮動版本等於「上游下一次發布的程式碼會自動在使用者的
                 瀏覽器上、以我們的來源執行」，而它拿得到的是 Firebase 的
                 登入狀態與整個私人區。詳見 publicnew.html 那段註解。

                 ★ 同源之後才進得了 CORE——原本這裡寫著「跨來源不能加，
                 addAll 會整批失敗」，那個限制隨著搬家一起消失了，
                 順便把「離線時筆記不排版」那個舊代價也解掉一半。
                 lucide 是每一頁的圖示，marked 與 DOMPurify 是筆記頁
                 沒有就不能用的東西（DOMPurify 缺席時它會拒絕渲染）。

                 ★ KaTeX **刻意不進**：js 加 20 個 woff2 字型約 570KB，
                 而多數人開筆記頁不是為了寫公式。它走下面「同源靜態資源
                 快取優先」那條路，用過一次就留著。這跟單字庫 1.8MB
                 不進 CORE 是同一個判斷：不是「翻到才需要」的東西才預先抓。
                 tests/latex.mjs 有一條在釘這件事。 */
              './vendor/lucide.min.js',
              './vendor/marked.min.js',
              './vendor/purify.min.js',
              /* 筆記那張紙（亮／夜兩張，共約 35KB）。跟背景畫同一個理由要進 CORE：
                 它不是「翻到才需要」的內容，是紙本身。少了它筆記還是有橫線
                 （CSS 漸層接得住），但頁首與紙紋會不見——而那看起來很像
                 「這一版把紙改壞了」，沒有人會知道那只是圖沒進快取。 */
              './notepaper.webp', './notepaper-dark.webp',
              /* ★ 筆記那頁用的三支排版函式庫**不能**加進來：
                 CORE 走 addAll，而 addAll 對跨來源網址會整批失敗——
                 一個外部網址就會讓整個預快取掛掉，連自己的頁面都沒進快取。
                 代價是離線時筆記的預覽不排版，只顯示 Markdown 原文；
                 那三支各自的降級路徑就是為了這件事寫的。
                 ★ 這段刻意不寫出它們的名字：`tests/latex.mjs` 是用
                 「這個檔案裡不准出現那個名字」在擋的，很便宜也很準，
                 不該為了一句說明把它弄鈍。 */
              /* 背景畫：亮／夜 × 橫／直四張，共約 1.6 MB。
                 ★ 這四張**必須**進 CORE，跟單字庫那 1.8MB 的取捨相反。
                 理由是它們不是「翻到才需要」的內容，是每一頁的底：
                 沒預快取的話，離線開站會是一片純色，而純色跟「圖還沒載完」
                 長得一模一樣，沒有人會知道那是壞的。
                 ★ 只會下載到其中一張嗎？不會——addAll 是全部抓。
                 換主題或把手機轉個方向就會用到另一張，那時才下載就太遲了
                 （切過去的瞬間背景會空一拍）。 */
              './brightcomputer.jpg', './brightphone.jpg',
              './nightcomputer.jpg',  './nightphone.jpg'];
/* ★ 內建單字庫（./data/vocab/*.json，約 1.8MB）**故意不放進 CORE**：
   放進去等於每個人安裝時都先下載整套，而多數人只會翻其中幾個資料夾。
   它走下面「靜態資源快取優先」那條路——開過的資料夾自然會留在快取裡，
   之後離線也打得開；沒開過的就沒有，這是想要的行為。 */
const PUSH_API = 'https://blackcat-quote.cctsai03.workers.dev';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // AUTH_CACHE 不是版本化的快取，是一把金鑰，絕對不能跟著清（見上面）
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== AUTH_CACHE).map((k) => caches.delete(k))))
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
        /* ★ 要帶 authKey，否則 Worker 會回 403 而這裡只會走到保底文案——
           「通知會響但永遠只寫『快到上課時間了』」，沒有錯誤訊息。
           金鑰是頁面產生並存進 AUTH_CACHE 的，SW 讀不到 localStorage，
           所以兩邊約好用 Cache API。 */
        let authKey = '';
        try {
          const hit = await (await caches.open(AUTH_CACHE)).match(AUTH_URL);
          if (hit) authKey = (await hit.text()).trim();
        } catch (e) { /* 拿不到就讓 Worker 去判斷，保底文案還在 */ }
        const r = await fetch(`${PUSH_API}/push/pending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint, authKey }),
        });
        const j = await r.json();
        if (j && j.note && j.note.title) note = j.note;
      }
    } catch (err) {
      // 取不到內容就用保底文案，不能不顯示
    }
    await self.registration.showNotification(note.title, {
      body: note.body || '',
      icon: './logomain.jpg',
      badge: './logomain.jpg',
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
