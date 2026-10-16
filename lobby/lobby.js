/* ==========================================================
 * 大廳：賽博龐克的夜街，五塊招牌＝五個小黑貓（2026-10-16）
 *
 * 從外面打開首頁時，先出現一條 Blender 算好的夜街。街上掛著五塊招牌（五個產品），
 * 地上坐著一隻黑貓。點一塊招牌：貓跳上去抓住、跟著招牌左右晃，
 * 晃到那個產品載好；載好之後招牌掉下去，順勢把整條街撕成兩半，後面就是那個產品。
 *
 * 為什麼這樣做（細節在 架構.md「大廳：夜街、招牌與黑貓」）：
 *   - **背景與招牌是預先算好的圖，不在網頁裡跑 3D。** 網頁只負責疊起來動。
 *     大廳存在的理由是「等的時候有東西看」，不能反過來讓大廳自己先等一個 3D 引擎。
 *   - **貓是兩層：序列圖（一定有）＋即時 3D（載得到才換上）。** 走位全部在這支，
 *     3D 那支（lobby3d.js）只是「讀格子在哪、在播什麼，畫一隻 3D 貓蓋上去」。
 *     3D 沒載好之前、或這台跑不動，看到的就是序列圖，不會有空窗。見下面 want3d()。
 *   - **這支是普通 script，五頁共用，放在 <head>。** 不能放進主站的 module：
 *     module 要等 Firebase 那幾個 await 才跑，大廳早就該出現了；而錯題本、電路、
 *     文書三頁根本沒有那個 module。也因此碰不到主站的任何狀態，不會踩暫時性死區。
 *   - **換頁是「交棒」。** 點了別的產品：貓抓上招牌之後，把「誰、哪一塊」寫進
 *     sessionStorage 再換頁；新的那一頁一讀到就立刻畫出同一條街、同一塊招牌、
 *     同一隻掛著的貓繼續晃，等自己載好才撕開。兩頁的畫面是同一張，看起來就是沒換過頁。
 *
 * ⚠️ 招牌那張表（SIGNS）是主站 buildLogoMenu() 那張 items 的影子：
 *   站名、網址、桌機限定要跟它一致。tests/lobby.mjs 會比對，漏改的症狀是
 *   「選單叫 A、招牌叫 B」或「招牌點進去 404」，畫面上不會報錯。
 * ========================================================== */
(function () {
    'use strict';
    var D = document, W = window, H = D.documentElement;
    if (W.top !== W.self) return;   // 被套進 iframe（文書小黑貓的編輯器、測試頁）就什麼都不做

    var me = D.currentScript;
    /* 這一頁是哪一個產品。主站與彰師電子共用一份原始碼，靠 <html data-product> 分；
       另外三頁在 <script data-page> 上寫自己的名字。 */
    var PAGE = (me && me.getAttribute('data-page')) || H.getAttribute('data-product') || '';

    var HAND_KEY = 'blackcat-lobby-handoff';   // sessionStorage：換頁時交棒
    var CAT_KEY  = 'eeblackcat-lobbycat';      // localStorage：'stay'（預設）或 'away'
    var DIR = 'lobby/';

    /* [key, 站名, 網址, 桌機限定, 霓虹色]。前四欄跟主站 logo 選單一致（見檔頭）。 */
    var SIGNS = [
        ['cat',   '小黑貓',         './',                 false, '#fcee0a'],
        ['ncue',  '彰師電子小黑貓', 'ncue.html',          false, '#ff2a6d'],
        ['md',    '錯題本小黑貓',   'blackcatmd.html',    false, '#00f0ff'],
        ['spice', '電路小黑貓',     'blackcatspice.html', true,  '#39ff14'],
        ['doc',   '文書小黑貓',     'blackcatdoc.html',   true,  '#ff9a3c']
    ];
    /* 貓可以留下來的產品：只有小黑貓（2026-10-16 深夜起彰師電子也不留），而且只在「主頁」分頁（見 onHome）。
       其他頁是整個畫面拿來工作的（寫字、拉線、排版），角落多一隻會動的東西只會擋路。 */
    var HOMES = { cat: 1 };
    /* 主站切分頁時 applyTab() 會在 <html> 寫 data-tab；沒寫過（還沒切過）就是主頁。 */
    function onHome() { return (H.getAttribute('data-tab') || 'home') === 'home'; }

    /* ---- 場景座標：從 Blender 的攝影機投影出來的（怎麼重算見 素材/大廳/README.md）----
       背景圖用 object-fit: cover 鋪滿畫面，所以這裡存的是「在原圖上的比例位置」，
       執行時再換算成螢幕座標。改了 Blender 的攝影機或招牌位置，這張表要跟著重算。
       招牌：[x, y, 高]——x、y 是掛勾（招牌上緣中間）在圖上的位置，高是招牌高度佔圖高的比例。
       貓：  [x, y, 高]——x、y 是貓腳底中間，高是「序列圖一格」佔圖高的比例。
       ★ 一格代表 0.8m 見方（掛在招牌上的那幾格要放得下整隻拉長的貓），寫實版的貓坐著只佔三分之一，
         所以這裡比 Blender 投影出來的值（橫 0.1955、直 0.1578）刻意放大約 1.6 倍：照實際大小的話貓只剩一小點。 */
    var SCENE = {
        wide: { src: 'street-wide.webp', w: 1920, h: 1080,
                signs: { cat: [0.2152, 0.0664, 0.3639], ncue: [0.7189, 0.0697, 0.3277],
                         md: [0.3318, 0.2165, 0.2150], spice: [0.6308, 0.2116, 0.1962], doc: [0.3832, 0.2756, 0.1491] },
                cat: [0.4865, 0.8756, 0.3100],
                doors: { cat: [0.0948, 0.6141], ncue: [0.9123, 0.6097], md: [0.2809, 0.6346], spice: [0.7141, 0.633], doc: [0.3464, 0.6412] } },
        tall: { src: 'street-tall.webp', w: 1080, h: 1920,
                signs: { cat: [0.2200, 0.0500, 0.2349], ncue: [0.7800, 0.1300, 0.2094],
                         md: [0.3700, 0.2500, 0.1641], spice: [0.6300, 0.2700, 0.1444], doc: [0.5000, 0.3300, 0.1067] },
                cat: [0.5000, 0.7182, 0.2500],
                doors: { cat: [-0.1948, 0.5182], ncue: [1.1521, 0.5185], md: [0.0206, 0.5254], spice: [0.8595, 0.5291], doc: [0.1668, 0.5308] } }
    };
    /* doors：每家店門口（離地 1.3m）在圖上的位置，只給「影片放不出來」的退路用（往那裡放大）。
       直式畫面的小黑貓、彰師電子兩家，店門在畫面外面（x 小於 0、大於 1），退路會夾回畫面內。
       跟 fly_rooms.py 的 DOORS 一起改。 */
    /* 招牌圖的寬 ÷ 高（sign-*.webp，408×1170）。圖的上緣就是掛勾，含 0.3m 的鏈子＋3.6m 的板子；
       寬度比板子多留兩側各 8cm 給霓虹的光暈，所以不是 1.2 ÷ 3.9。 */
    var SIGN_ASPECT = 408 / 1170;

    /* 貓的序列圖：cat-<動作>.webp，一張橫條，每格正方形。[格數, 一輪幾秒] */
    /* ★ 2026-10-16 晚：坐著、東張西望、理毛、走路、側躺這五個是**從真貓影片做的動態捕捉**
         （維基共享資源上 CC0／公有領域的影片，用 SuperAnimal 姿勢辨識抓出每一格的關節，
          再把骨頭角度套到 Blender 的骨架上；流程見 素材/大廳/README.md）。
         影片是每秒 12 格，坐著、東張西望、側躺這種慢的動作隔一格取一格（每秒 6 格）。 */
    var CAT = {
        idle:    [24, 4.00],   // 坐著：呼吸、轉頭、尾巴甩、眨眼（轉頭的時機取自動態捕捉）
        look:    [20, 3.33],   // 坐著東張西望、抬頭（轉頭的時機取自動態捕捉）
        groom:   [31, 2.58],   // 抬右前掌、低頭舔、放下
        walk:    [11, 0.92],   // 走路的一步循環（照 Muybridge 1887 側面連拍量的角度與腳步順序）
        stand:   [8,  0.67],   // 坐 → 站（倒著播就是站 → 坐）
        lie:     [15, 2.50],   // 趴著（前臂平放）、轉頭、尾巴拍地
        liedown: [8,  0.67],   // 坐 → 趴（倒著播就是起來）
        sleep:   [8,  2.88],   // 趴著睡
        jump:    [8,  0.54],   // 蹲 → 撲 → 伸手
        hang:    [8,  0.81],   // 前腳抓著，後腳踢
        land:    [6,  0.36],   // 跳一下（摸牠的時候）
        /* 2026-10-16 第二輪加的待機動作（都從坐姿開始、回到坐姿）。 */
        tilt:    [16, 1.33],   // 歪頭（好奇）
        wash:    [24, 2.00],   // 舔掌、用前掌從耳後抹到臉上
        scratch: [18, 1.50],   // 後腳抓耳朵
        stretch: [30, 2.50],   // 伸懶腰：前腳往前伸、胸口壓低、屁股翹高
        loafdown:[8,  0.67],   // 坐 → 趴成麵包（倒著播就是起來）
        loaf:    [24, 4.00]    // 麵包：前腳收在胸口下，慢慢呼吸
    };
    /* 大廳一開就要用到的三個先抓，其他等角落那隻貓要用時才抓（全部約 1.3MB，不該讓每個進站的人都扛）。 */
    var preloaded = {};
    function preload(names) {
        if (C3) return;   // 3D 貓上場之後序列圖就用不到了
        names.forEach(function (n) {
            if (preloaded[n]) return;
            preloaded[n] = new Image(); preloaded[n].src = DIR + 'cat-' + n + '.webp';
        });
    }

    var reduce = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var touch  = !!(W.matchMedia && W.matchMedia('(pointer: coarse) and (hover: none)').matches);

    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function within(p, ms) { return Promise.race([p, wait(ms)]); }
    function catStays() { try { return localStorage.getItem(CAT_KEY) !== 'away'; } catch (e) { return true; } }
    function signOf(k) { for (var i = 0; i < SIGNS.length; i++) if (SIGNS[i][0] === k) return SIGNS[i]; return null; }

    /* ---- 即時 3D 的貓（2026-10-16 晚）----
       lobby3d.js 是 module，用插 <script type="module"> 的方式載（不寫 import()：
       那是語法，不認得它的舊瀏覽器會連這整支都解析失敗，序列圖貓也跟著沒了）。
       載好之後牠會「跟著」一個序列圖格子：大廳的 .lb-cat，或角落的 #bcCat。
       ★ 只在小黑貓、彰師電子這兩頁載（HOMES）：錯題本、電路、文書三頁的貓只是掛一下就跳走，
         為了那兩秒多抓 1.2MB、還跟那一頁自己的載入搶頻寬，不划算——那裡就用序列圖。
       ★ 減少動態、省電模式、沒有 module 支援：不載，序列圖照舊。 */
    var C3 = null, c3want = null, c3started = false;
    function want3d(e, z) {
        c3want = e ? { e: e, z: z } : null;
        if (!C3) return;
        if (e) C3.follow(e, z); else C3.detach();
    }
    function load3d() {
        if (c3started || !HOMES[PAGE] || reduce || H.classList.contains('fx-lite')) return;
        c3started = true;
        try {
            var sc = D.createElement('script');
            if (!('noModule' in sc)) return;   // 不認得 module 的瀏覽器
            W.addEventListener('blackcat:3d', function () {
                W.__blackcat3d.init().then(function (c) {
                    C3 = c;
                    if (c3want && c3want.e.isConnected && !H.classList.contains('fx-lite')) C3.follow(c3want.e, c3want.z);
                }, function () { /* 沒有 WebGL2、檔案抓不到：留在序列圖 */ });
            }, { once: true });
            sc.type = 'module';
            sc.src = DIR + 'lobby3d.js';
            D.head.appendChild(sc);
        } catch (e) { /* 3D 是加分，出任何事都不能拖垮大廳 */ }
    }

    /* ---- 這一頁「載好了」是什麼時候 ----
       主站與彰師電子：載入畫面收掉的那一刻（hideSplash 會發 blackcat:ready）。
       那是「登入跑完、首頁資料有回音」，比 load 事件更接近使用者說的「內容載好」。
       其他三頁沒有那套，用 load。 */
    var readyP = new Promise(function (res) {
        if (PAGE === 'cat' || PAGE === 'ncue') {
            if (W.__blackcatReady) res();
            else W.addEventListener('blackcat:ready', function () { res(); }, { once: true });
        } else if (D.readyState === 'complete') res();
        else W.addEventListener('load', function () { res(); }, { once: true });
    });

    /* ---- 這次要不要出現 ---- */
    function readHand() {
        try {
            var raw = sessionStorage.getItem(HAND_KEY);
            if (!raw) return null;
            sessionStorage.removeItem(HAND_KEY);   // 只能用一次：重新整理不該再演一遍
            var h = JSON.parse(raw);
            return (h && Date.now() - h.at < 20000) ? h : null;
        } catch (e) { return null; }
    }
    /* 「只有首頁出現」的意思是：**從外面**打開首頁。
       站內走回首頁（logo 選單點小黑貓）、重新整理（手機下拉刷新）、上一頁，
       都不是「進站」，每次都演一遍只會擋路。 */
    function wantLobby() {
        var q;
        try { q = new URLSearchParams(location.search); } catch (e) { return false; }
        if (q.has('lobby')) return true;          // 測試用：強制出現
        if (q.has('nolobby')) return false;
        var keys = []; q.forEach(function (v, k) { keys.push(k); });
        /* 網址帶了別的參數或 #，代表是某個流程跳回來的（Google 登入走 #、通知帶參數），
           那個流程要的是首頁本身。只放行 nosky（關背景天際線的除錯參數）。 */
        if (keys.some(function (k) { return k !== 'nosky'; })) return false;
        if (location.hash && location.hash !== '#') return false;
        try {
            var nav = performance.getEntriesByType('navigation')[0];
            if (nav && (nav.type === 'reload' || nav.type === 'back_forward')) return false;
        } catch (e) {}
        try {
            if (D.referrer) {
                var ref = new URL(D.referrer);
                if (ref.origin === location.origin) return false;
                /* Google 登入的第一條路（整頁跳去 firebaseapp 再跳回來）網址是乾淨的，
                   只能從「從哪裡來」認出它。 */
                /* ★ 只認登入那兩個主機。寫成 google.com 整個網域的話，從 Google 搜尋點進來的人
                     也會被當成「登入跳回來」，第一次來的人反而看不到大廳（tests/lobby.mjs 第一條）。 */
                if (ref.hostname === 'accounts.google.com' || /\.firebaseapp\.com$/.test(ref.hostname)) return false;
            }
        } catch (e) {}
        return true;
    }

    var hand = readHand();
    var mode = 'none';
    if (hand && hand.to === PAGE && signOf(PAGE)) mode = 'arrive';
    else if (PAGE === 'cat' && wantLobby()) mode = 'lobby';

    /* ======================================================
     * 大廳本體
     * ====================================================== */
    var root, half, scene, hud, catEl, bgImg, lay, picked = false, done = false;
    var signEls = {};

    function pickLayout() { return W.innerWidth >= W.innerHeight ? 'wide' : 'tall'; }

    function whenBody(fn) {
        if (D.body) return fn();
        var mo = new MutationObserver(function () { if (D.body) { mo.disconnect(); fn(); } });
        mo.observe(H, { childList: true });
    }

    function el(tag, cls, parent) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (parent) parent.appendChild(e);
        return e;
    }

    var spriteSeq = 0;
    function setSprite(e, name, once, reverse, spd) {
        var a = CAT[name];
        spd = spd || 1;     // 播放時間的倍數（>1 是慢一點）；3D 貓也照這個速度播
        e.style.backgroundImage = 'url(' + DIR + 'cat-' + name + '.webp)';
        e.style.setProperty('--frames', a[0]);
        e.style.setProperty('--dur', (a[1] * spd).toFixed(3) + 's');
        e.dataset.spd = spd === 1 ? '' : spd.toFixed(3);
        e.classList.toggle('once', !!once);
        e.classList.toggle('rev', !!reverse);
        e.classList.toggle('hang', name === 'hang');
        /* 給 3D 貓看的：現在播哪個、播一次還是循環、倒著播嗎；t 每次都不同，
           同一個動作重播（例如連摸兩下）3D 那邊也認得出「要從頭來」。 */
        e.dataset.sprite = name;
        e.dataset.once = once ? '1' : '';
        e.dataset.rev = reverse ? '1' : '';
        e.dataset.t = String(++spriteSeq);
        /* 換了序列圖要從第一格重來：把動畫拿掉、讓瀏覽器量一次版面、再放回去。 */
        e.style.animationName = 'none';
        void e.offsetWidth;
        e.style.animationName = '';
    }

    /* 收掉整個大廳（不管成功或放棄都走這裡），把畫面還給底下那一頁。 */
    function finish() {
        if (done) return;
        done = true;
        if (root && root.parentNode) root.parentNode.removeChild(root);
        if (c3want && c3want.e === catEl) want3d(null);
        H.classList.remove('lobby-on', 'lobby-built');
        H.style.removeProperty('--lb-bg');
        W.removeEventListener('resize', layout);
    }

    /* 放棄大廳（背景圖抓不到、卡太久）：直接把畫面還給底下那一頁，貓照常出來。 */
    function abort() {
        finish();
        if (HOMES[PAGE]) readyP.then(function () { Companion.spawn(false); });
    }
    /* 保險絲：選了之後不管哪裡卡住，最多 30 秒一定把畫面還給使用者。
       永遠停在一條街上比看到還沒載完的頁面更糟。
       ★ 只在「選了之後」才點：還沒選的時候使用者想在街上看多久都可以。 */
    function arm() { setTimeout(function () { if (!done) abort(); }, 30000); }

    function start() {
        load3d();
        lay = pickLayout();
        /* 交棒過來的那一頁一開始就是店裡（影片最後一格），不是街上。 */
        H.style.setProperty('--lb-bg', 'url(' + (mode === 'arrive' ? endSrc(PAGE, hand && hand.lay) : DIR + SCENE[lay].src) + ')');
        H.classList.add('lobby-on');
        whenBody(build);
    }

    function build() {
        root = el('div');
        root.id = 'lobby';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '選一個小黑貓進去');
        half = el('div', 'lb-half', root);
        scene = el('div', 'lb-scene', half);

        bgImg = el('img', 'lb-bg', scene);
        bgImg.alt = '';
        bgImg.decoding = 'async';
        /* 背景圖抓不到（離線又沒進過快取）就直接放棄大廳：
           一條黑漆漆、只有招牌的街比沒有大廳更像壞掉。 */
        bgImg.onerror = abort;
        bgImg.src = DIR + SCENE[lay].src;

        el('div', 'lb-rain', scene);

        SIGNS.forEach(function (s, i) {
            var k = s[0], b = el('button', 'lb-sign' + (s[3] ? ' desk-only' : ''), scene);
            b.type = 'button';
            b.dataset.k = k;
            b.style.setProperty('--c', s[4]);
            b.style.setProperty('--lb-delay', (-i * 1.37).toFixed(2) + 's');   // 五塊不要同步晃
            b.setAttribute('aria-label', '進入' + s[1]);
            var art = el('img', '', b);
            art.alt = '';
            art.src = DIR + 'sign-' + k + '.webp';
            art.onerror = function () { art.remove(); b.style.background = 'rgba(7,6,12,.85)'; b.style.boxShadow = '0 0 0 2px ' + s[4] + ', 0 0 18px ' + s[4]; };
            el('span', 'lb-name', b).textContent = s[1];
            if (s[3]) el('span', 'lb-off', b).textContent = '用電腦開';
            el('span', 'lb-grip', b);
            if (s[3] && touch) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
            b.addEventListener('click', function () { pick(k); });
            /* 手指或滑鼠一靠近就先把那一頁抓起來，換頁時少等一點。 */
            if (k !== PAGE) b.addEventListener('pointerenter', function () { prefetch(s[2]); }, { once: true });
            signEls[k] = b;
        });

        catEl = el('div', 'lb-cat', scene);
        preload(['idle']);
        setSprite(catEl, 'idle');
        if (mode !== 'arrive') want3d(catEl, 2147483002);   // 比整個大廳（2147483001）高一層
        if (mode === 'lobby' && !reduce) streetLife();

        hud = el('div', 'lb-hud', root);
        hud.textContent = mode === 'arrive' ? '連線中' : '選一家店走進去';

        D.body.appendChild(root);
        H.classList.add('lobby-built');
        layout();
        W.addEventListener('resize', layout);

        /* ★ 不主動把焦點放到招牌上：開站時的程式聚焦在 Chrome 會被當成鍵盤焦點，
             第一塊招牌一進來就套著一圈虛線框。招牌是 <button>，按 Tab 就到得了。 */
        if (mode === 'arrive') arrive(PAGE);
    }

    /* 使用者還在挑招牌時，街上的貓不要一直同一個動作：坐一下、東張西望、舔舔爪子。 */
    function streetLife() {
        setTimeout(function () { preload(['look', 'groom']); }, 2500);
        var seq = ['look', 'idle', 'groom', 'idle'], k = 0;
        (function next() {
            setTimeout(function () {
                if (picked || done || !catEl || catEl.parentNode !== scene) return;
                var n = seq[k++ % seq.length];
                setSprite(catEl, n);
                next();
            }, k % 2 ? CAT.look[1] * 2000 : 6500);
        })();
    }

    /* 背景是 cover：短邊貼齊、長邊裁掉兩端。把圖上的比例座標換成螢幕座標。 */
    function mapper() {
        var S = SCENE[lay], vw = W.innerWidth, vh = W.innerHeight;
        var s = Math.max(vw / S.w, vh / S.h);
        var ox = (vw - S.w * s) / 2, oy = (vh - S.h * s) / 2;
        return { s: s, x: function (n) { return ox + n * S.w * s; }, y: function (n) { return oy + n * S.h * s; }, ih: S.h * s };
    }

    function layout() {
        if (!root || done) return;
        var nl = pickLayout();
        if (nl !== lay) {   // 手機轉向：換一張圖
            lay = nl;
            bgImg.src = DIR + SCENE[lay].src;
            H.style.setProperty('--lb-bg', 'url(' + DIR + SCENE[lay].src + ')');
        }
        var m = mapper(), S = SCENE[lay];
        SIGNS.forEach(function (s) {
            var b = signEls[s[0]], p = S.signs[s[0]];
            if (!b || !p) return;
            var h = p[2] * m.ih, w = h * SIGN_ASPECT;
            b.style.left = (m.x(p[0]) - w / 2) + 'px';
            b.style.top = m.y(p[1]) + 'px';
            b.style.width = w + 'px';
            b.style.height = h + 'px';
            /* 字要塞得進招牌：寬度的一半，或高度平均分給每個字，取小的。 */
            var n = s[1].length;
            b.querySelector('.lb-name').style.fontSize = Math.min(w * 0.52, (h * 0.76) / n) + 'px';
        });
        if (catEl && catEl.parentNode === scene) {
            var c = S.cat, size = c[2] * m.ih;
            catEl.style.setProperty('--size', size + 'px');
            catEl.style.left = (m.x(c[0]) - size / 2) + 'px';
            catEl.style.top = (m.y(c[1]) - size) + 'px';
        }
    }

    var prefetched = {};
    function prefetch(href) {
        if (prefetched[href]) return;
        prefetched[href] = 1;
        try { var l = D.createElement('link'); l.rel = 'prefetch'; l.href = href; D.head.appendChild(l); } catch (e) {}
    }

    /* ---- 點了一塊招牌：鏡頭飛進那家店（2026-10-16 深夜，取代原本的「貓跳上招牌、把街撕開」）----
       影片是 Blender 算好的（素材/大廳/README.md「轉場影片」）：鏡頭從街上轉向那家店、穿過亮著的店門、停在店裡。
       選小黑貓的那一段，街上那隻貓會先起跑、跑在鏡頭前面衝進店裡，最後坐在店裡的貓窩上；
       選別家的話，貓留在街上坐著，鏡頭從牠旁邊經過。
       ★ 影片第一格就是街景（招牌的字也算進去了），所以一開始是把 HTML 的招牌與貓淡掉、影片淡進來，看不出接縫。
       ★ 影片只有選到的那一段才下載（約 200～400KB）；滑鼠移到招牌上就先抓。
         1.5 秒內還播不起來（網路慢、格式不支援）就退回「畫面往店門放大＋門口的光」，不讓人乾等。 */
    function pick(k) {
        if (picked || done) return;
        var s = signOf(k);
        if (!s || (s[3] && touch)) return;
        picked = true;
        root.classList.add('picked');
        signEls[k].classList.add('chosen');
        arm();
        if (k !== PAGE) prefetch(s[2]);
        if (reduce) {   // 減少動態：不飛，選了就走
            if (k === PAGE) within(readyP, 20000).then(function () { reveal(k); });
            else go(s);
            return;
        }
        hud.textContent = '開門中';
        fly(k).then(function () {
            if (k === PAGE) within(readyP, 20000).then(function () { reveal(k); });
            else go(s);
        });
    }

    /* 交棒：記下要去哪、換頁。新的那一頁在 arrive() 接手，先畫出店裡的最後一格。 */
    function go(s) {
        try { sessionStorage.setItem(HAND_KEY, JSON.stringify({ to: s[0], at: Date.now(), lay: lay })); } catch (e) {}
        location.href = s[2];
    }

    function flySrc(k, l) { return DIR + 'fly/' + (l || lay) + '-' + k + '.mp4'; }
    function endSrc(k, l) { return DIR + 'fly/' + (l || lay) + '-' + k + '-end.webp'; }
    var flyCache = {};
    /* 先把影片（與最後一格的圖）抓起來：滑鼠移到招牌上、或點下去的那一刻。 */
    function flyVideo(k) {
        var key = lay + k;
        if (flyCache[key]) return flyCache[key];
        var v = D.createElement('video');
        v.className = 'lb-fly';
        v.muted = true; v.defaultMuted = true; v.playsInline = true;
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        v.preload = 'auto';
        v.src = flySrc(k);
        try { v.load(); } catch (e) {}
        var img = new Image(); img.src = endSrc(k);
        flyCache[key] = v;
        return v;
    }

    function fly(k) {
        var v = flyVideo(k);
        root.insertBefore(v, hud);
        return new Promise(function (res) {
            var started = false, finished = false;
            function end() { if (!finished) { finished = true; res(); } }
            function start() {
                if (started) return;
                started = true; clearTimeout(slow);
                v.classList.add('on');
                root.classList.add('flying');           // 招牌、貓、雨淡掉（影片裡已經有它們了）
                if (c3want && c3want.e === catEl) want3d(null);
                setTimeout(end, ((v.duration || 2) + 1.5) * 1000);   // 播到一半卡住也要能走
            }
            function fallback() {
                if (started) return;
                started = true; clearTimeout(slow);
                if (v.parentNode) v.parentNode.removeChild(v);
                dolly(k).then(end);
            }
            var slow = setTimeout(fallback, 1500);
            v.addEventListener('playing', start, { once: true });
            v.addEventListener('ended', end, { once: true });
            v.addEventListener('error', fallback, { once: true });
            try { var p = v.play(); if (p && p.catch) p.catch(fallback); } catch (e) { fallback(); }
        });
    }

    /* 退路：影片放不出來時，把整個場景往那家店的門口放大，門口的光（招牌的顏色）蓋滿畫面，
       再換上店裡最後一格的圖（抓得到的話）。 */
    function dolly(k) {
        var d = SCENE[lay].doors[k], m = mapper();
        var ox = Math.max(0.04, Math.min(0.96, d[0])), oy = d[1];
        var px = m.x(ox), py = m.y(oy);
        half.style.transformOrigin = px.toFixed(0) + 'px ' + py.toFixed(0) + 'px';
        var a = half.animate([{ transform: 'scale(1)', filter: 'blur(0)' }, { transform: 'scale(3.4)', filter: 'blur(3px)' }],
            { duration: 900, easing: 'cubic-bezier(0.55, 0, 0.9, 0.6)', fill: 'forwards' });
        var glow = el('div', 'lb-glow', root);
        glow.style.setProperty('--c', signOf(k)[4]);
        glow.style.setProperty('--gx', px.toFixed(0) + 'px'); glow.style.setProperty('--gy', py.toFixed(0) + 'px');
        var g = glow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' });
        if (c3want && c3want.e === catEl) want3d(null);
        return Promise.all([a.finished, g.finished]).catch(function () {}).then(function () {
            var img = el('img', 'lb-fly on', null);
            img.alt = ''; img.src = endSrc(k);
            img.onload = function () { root.insertBefore(img, glow); glow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 270, fill: 'forwards' }); };
        });
    }

    /* 新的那一頁接手：直接是店裡（影片的最後一格），等自己載好就走進去。 */
    function arrive(k) {
        picked = true;
        arm();
        root.classList.add('picked', 'flying');
        var img = el('img', 'lb-fly on', root);
        img.alt = '';
        img.onerror = function () { img.remove(); };
        img.src = endSrc(k, hand && hand.lay);
        root.insertBefore(img, hud);
        hud.textContent = '開門中';
        var fuse = PAGE === 'doc' ? 12000 : 20000;   // 文書的編輯器第一次要抓十幾 MB，別讓人一直看店門
        Promise.all([within(readyP, fuse), wait(reduce ? 0 : 400)]).then(function () { reveal(k); });
    }

    /* 走進店裡：店裡的畫面往前推近一點、同時淡掉，後面就是那個產品。 */
    function reveal(k) {
        if (done) return;
        var shot = root.querySelector('.lb-fly.on') || half;
        root.classList.add('opening');
        if (hud) hud.style.opacity = '0';
        var spawnCat = HOMES[PAGE] && catStays();
        if (reduce) { fadeOut(); return; }
        var a = shot.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }], { duration: 540, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
        var b = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 540, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
        Promise.all([a.finished, b.finished]).catch(function () {}).then(function () {
            finish();
            if (spawnCat) Companion.spawn(k === 'cat');
        });
    }

    function fadeOut() {
        root.classList.add('fade');
        setTimeout(function () { finish(); if (HOMES[PAGE] && catStays()) Companion.spawn(); }, 300);
    }

    /* ======================================================
     * 留在畫面上的那隻（只有小黑貓、而且只在「主頁」分頁；設定裡可以關）
     *
     * ★ 2026-10-16 深夜起：彰師電子不留貓（HOMES），切到其他分頁時藏起來（onHome()，看 <html data-tab>）。
     * ★ 不只是「大廳之後」才有：直接打開小黑貓、或站內換頁回來，牠也在。
     *   設定寫的是「黑貓留在畫面上」，使用者會期待牠一直在，而不是只有進站那一次。
     * ★ 位置在左下角：右下角是「回到頂端」與吐司的地盤。手機上要墊在底部分頁列上面。
     * ====================================================== */
    var Companion = (function () {
        var btn = null, timer = 0, bubbleT = 0;
        var SIZE = 128;  // 一格 0.8m 見方，寫實版的貓坐著只佔三分之一：128px 的格子裡貓大約 45px 高（格子其他地方是透明的）
        /* 走路速度要跟腳步對上，不然腳會在地上滑：Blender 裡一步（一個循環）往前 0.14m（cat2_natural.py 的 WALK.stride），
           一格 0.8m＝SIZE px，一個循環 CAT.walk[1] 秒。 */
        var WALK_PX = SIZE / 0.8 * 0.14 / CAT.walk[1];
        var LINES = ['喵', '喵～', '呼嚕呼嚕', '(=^･ω･^=)', '今天也要加油喵', '摸夠了沒'];

        function bottom() {
            var dock = D.getElementById('navDock');
            var base = 12;
            if (dock && H.classList.contains('nav-bottom') && !H.classList.contains('kb-open')) {
                var r = dock.getBoundingClientRect();
                if (r.height) base = Math.max(base, W.innerHeight - r.top + 8);
            }
            return base;
        }
        function target() {
            var size = SIZE;
            return { x: Math.max(10, 0), y: W.innerHeight - bottom() - size, size: size };
        }
        function place() {
            if (!btn) return;
            btn.style.setProperty('--bc-bottom', 'calc(' + bottom() + 'px + env(safe-area-inset-bottom, 0px))');
            btn.style.display = (H.classList.contains('kb-open') || !onHome()) ? 'none' : '';
        }
        /* ---- 牠自己決定接下來做什麼 ----
           坐著是「家」：從坐姿出發去東張西望、理毛、散步、趴下，做完一定回到坐姿。
           散步要先站起來（stand）、走完倒著播 stand 坐回去；趴下也一樣（liedown 正著播趴、倒著播起來）。
           所以序列圖之間永遠是同一個姿勢接同一個姿勢，不會「啪」一下換掉。 */
        var state = 'sit', x = 0, flip = 1;
        function play(name, once, reverse, spd) { setSprite(btn, name, once, reverse, spd); }
        function later(fn, ms) { clearTimeout(timer); timer = setTimeout(function () { if (btn) fn(); }, ms); }
        function still() { return reduce || H.classList.contains('fx-lite'); }
        function sit(ms) {
            state = 'sit'; play('idle', false, false, speed());
            /* 大多數時候坐 4～12 秒，偶爾發呆久一點（15～30 秒） */
            later(choose, ms || (Math.random() < 0.2 ? 15000 + Math.random() * 15000 : 4000 + Math.random() * 8000));
        }
        /* 坐著的時候接下來做什麼：照權重抽，剛做過的兩件事權重降到四分之一（不會一直重複同一招），
           循環的動作播 1～3 輪、播放速度每次差一點（0.85～1.2 倍），坐著休息的時間也不固定。
           還沒算圖的動作（CAT 裡沒有）自動跳過。 */
        var recent = [];
        var ACTS = [
            ['look', 24, function () { loopAct('look', 1, 3); }],
            ['groom', 14, function () { loopAct('groom', 1, 3); }],
            ['wash', 12, function () { loopAct('wash', 1, 2); }],
            ['scratch', 8, function () { loopAct('scratch', 1, 2); }],
            ['tilt', 10, function () { onceAct('tilt'); }],
            ['stretch', 9, function () { onceAct('stretch'); }],
            ['walk', 18, function () { stroll(); }],
            ['lie', 11, function () { liedown(); }],
            ['loaf', 11, function () { loaf(); }]
        ];
        function speed() { return 0.85 + Math.random() * 0.35; }
        function loopAct(name, lo, hi) {
            var k = speed(); state = name; play(name, false, false, k);
            later(function () { sit(); }, CAT[name][1] * 1000 * k * (lo + Math.floor(Math.random() * (hi - lo + 1))));
        }
        function onceAct(name) {
            state = name; play(name, true);
            later(function () { sit(1500 + Math.random() * 4000); }, CAT[name][1] * 1000);
        }
        function choose() {
            if (still()) return;
            preload(['look', 'groom', 'walk', 'stand', 'lie', 'liedown', 'sleep', 'wash', 'scratch', 'tilt', 'stretch', 'loaf', 'loafdown'].filter(function (n) { return CAT[n]; }));
            var pool = ACTS.filter(function (a) { return CAT[a[0]] && (a[0] !== 'loaf' || CAT.loafdown); });
            var tot = 0, w = pool.map(function (a) { var x = a[1] * (recent.indexOf(a[0]) >= 0 ? 0.25 : 1); tot += x; return x; });
            var r = Math.random() * tot, i = 0;
            while (i < pool.length - 1 && r >= w[i]) { r -= w[i]; i++; }
            recent.unshift(pool[i][0]); recent.length = Math.min(recent.length, 2);
            pool[i][2]();
        }
        function loaf() {
            state = 'loafdown'; play('loafdown', true);
            later(function () {
                state = 'loaf'; play('loaf', false, false, speed());
                later(function () {
                    state = 'loafdown'; play('loafdown', true, true);
                    later(function () { sit(); }, CAT.loafdown[1] * 1000);
                }, 6000 + Math.random() * 14000);
            }, CAT.loafdown[1] * 1000);
        }
        function stroll() {
            /* 往右走到最多 40% 寬（不超過 420px）再走回來；碰到邊就掉頭。
               方向要在站起來之前決定：stand 這段序列圖會從「朝前坐」轉成「側身」，轉錯邊的話一起步就啪一下翻面。 */
            var maxX = Math.min(W.innerWidth * 0.4, 420);
            var to = x < maxX / 2 ? maxX * (0.5 + Math.random() * 0.5) : maxX * Math.random() * 0.3;
            var dist = to - x, secs = Math.abs(dist) / WALK_PX;
            flip = dist >= 0 ? 1 : -1; move();
            state = 'stand'; play('stand', true);
            later(function () {
                state = 'walk'; play('walk');
                btn.style.transition = 'transform ' + secs.toFixed(2) + 's linear';
                x = to; move();
                later(function () {
                    btn.style.transition = '';
                    state = 'stand'; play('stand', true, true);
                    later(function () { sit(); }, CAT.stand[1] * 1000);
                }, secs * 1000);
            }, CAT.stand[1] * 1000);
        }
        function liedown() {
            state = 'liedown'; play('liedown', true);
            later(function () {
                state = 'lie'; play('lie');
                later(function () {
                    if (Math.random() < 0.5) {
                        state = 'sleep'; play('sleep');
                        later(getUp, 12000 + Math.random() * 14000);
                    } else getUp();
                }, CAT.lie[1] * 1000 * (2 + Math.floor(Math.random() * 3)));
            }, CAT.liedown[1] * 1000);
        }
        function getUp() {
            state = 'liedown'; play('liedown', true, true);
            later(function () { sit(); }, CAT.liedown[1] * 1000);
        }
        function move() { btn.style.transform = 'translateX(' + x.toFixed(1) + 'px) scaleX(' + flip + ')'; btn.style.setProperty('--bc-flip', flip); }
        function idleLoop() {
            clearTimeout(timer);
            if (!btn) return;
            if (still()) { play('idle'); return; }
            sit();
        }
        function poke() {
            if (!btn) return;
            var b = btn.querySelector('.bc-bubble');
            b.textContent = LINES[Math.floor(Math.random() * LINES.length)];
            btn.classList.add('talk');
            clearTimeout(bubbleT);
            bubbleT = setTimeout(function () { if (btn) btn.classList.remove('talk'); }, 1600);
            if (still()) return;
            /* 摸牠：坐著就跳一下；躺著、睡著就起來；走到一半就停下來坐好。 */
            if (state === 'sit' || state === 'look' || state === 'groom') {
                state = 'land'; play('land', true); later(function () { sit(); }, CAT.land[1] * 1000 + 60);
            } else if (state === 'lie' || state === 'sleep') getUp();
            else if (state === 'walk') {
                var cur = btn.getBoundingClientRect().left - (parseFloat(getComputedStyle(btn).left) || 0);
                x = Math.max(0, cur); btn.style.transition = ''; move();
                state = 'stand'; play('stand', true, true); later(function () { sit(); }, CAT.stand[1] * 1000);
            }
        }
        function spawn(fromLobby) {
            if (btn || !HOMES[PAGE] || !catStays() || !D.body) return;
            btn = D.createElement('button');
            btn.id = 'bcCat';
            btn.type = 'button';
            btn.setAttribute('aria-label', '摸摸黑貓');
            btn.title = '摸摸黑貓（設定 → 外觀可以請牠回家）';
            btn.style.setProperty('--size', SIZE + 'px');
            var bub = D.createElement('span');
            bub.className = 'bc-bubble';
            bub.setAttribute('aria-live', 'polite');
            btn.appendChild(bub);
            btn.addEventListener('click', poke);
            D.body.appendChild(btn);
            place();
            load3d();
            want3d(btn, 29);   // 比貓的按鈕（30）低一層：泡泡要在貓上面，點擊本來就穿透畫布
            if (fromLobby && !reduce) { state = 'land'; play('land', true); later(function () { sit(); }, CAT.land[1] * 1000 + 60); }
            else idleLoop();
            if (reduce || H.classList.contains('fx-lite')) btn.style.backgroundPosition = '0 0';
            W.addEventListener('resize', place);
            /* <html> 的 class 會因為很多事變（鍵盤彈出、分頁列搬家、深淺色）。
               位置每次都重算，但動作只在「省電」被切換時才重來——不然每變一次 class
               貓就從第一格重播，看起來像一直抽搐。 */
            var lite = H.classList.contains('fx-lite');
            new MutationObserver(function () {
                place();
                var now = H.classList.contains('fx-lite');
                if (now !== lite) {
                    lite = now; idleLoop();
                    if (now && btn) btn.style.backgroundPosition = '0 0';
                    /* 省電模式：3D 貓收掉，換回序列圖的第一格；關掉省電再請 3D 回來。 */
                    if (btn) { if (now) want3d(null); else { load3d(); want3d(btn, 29); } }
                }
            }).observe(H, { attributes: true, attributeFilter: ['class', 'data-tab'] });
        }
        function remove() {
            clearTimeout(timer);
            if (c3want && c3want.e === btn) want3d(null);
            if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
            btn = null;
        }
        return { spawn: spawn, remove: remove, target: target };
    })();

    /* 設定頁用的開關（主站的 setLobbyCat 會叫這兩個）。 */
    W.BlackcatLobby = {
        catStays: catStays,
        setCatStay: function (on) {
            try { localStorage.setItem(CAT_KEY, on ? 'stay' : 'away'); } catch (e) {}
            if (on) Companion.spawn(true); else Companion.remove();
        }
    };

    if (mode !== 'none') start();
    else if (HOMES[PAGE]) readyP.then(function () { Companion.spawn(false); });
})();
