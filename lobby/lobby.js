/* ==========================================================
 * 大廳：夜街的路面上五個發光的大洞＝五個小黑貓（2026-10-22 第四版）
 *
 * 從外面打開首頁時，先出現一條 Blender 算好的夜街，鏡頭從高處往下看：路面裂開五個發光的洞，
 * 每個洞後緣立一塊電子看板（字是這裡畫上去的）。地上坐著一隻黑貓。
 * 點一個洞：貓跑過去跳進去，畫面跟著衝進洞裡，接著是所有產品共用的「下墜隧道」（循環影片），
 * 貓在畫面中間一起往下掉，掉到那個產品載好為止：
 *   - 小黑貓：貓從隧道底掉出去，揭開首頁，接著貓從主頁上方掉下來（Companion 的出場）。
 *   - 其他產品：換頁交棒，新的那一頁接著掉；載好時貓旁邊裂開一道次元裂縫，貓被吸進去，再揭開那一頁。
 *
 * 為什麼這樣做（細節在 架構.md「大廳」各節）：
 *   - **背景與隧道是預先算好的圖與影片，不在網頁裡跑 3D 場景。** 網頁只負責疊起來動。
 *     大廳存在的理由是「等的時候有東西看」，不能反過來讓大廳自己先等一個 3D 引擎。
 *   - **隧道影片裡沒有貓**，貓是疊上去的：載入多久影片就循環多久，抵達時貓要掉出去還是鑽進裂縫由這裡決定。
 *   - **貓是兩層：序列圖（一定有）＋即時 3D（載得到才換上）。** 走位全部在這支，
 *     3D 那支（lobby3d.js）只是「讀格子在哪、在播什麼，畫一隻 3D 貓蓋上去」。見下面 want3d()。
 *   - **這支是普通 script，五頁共用，放在 <head>。** 不能放進主站的 module：
 *     module 要等 Firebase 那幾個 await 才跑，大廳早就該出現了；而錯題本、電路、
 *     文書三頁根本沒有那個 module。也因此碰不到主站的任何狀態，不會踩暫時性死區。
 *   - **換頁是「交棒」。** 選了別的產品：貓掉進隧道之後，把「誰、哪一種畫面」寫進
 *     sessionStorage 再換頁；新的那一頁一讀到就立刻畫出同一條隧道、同一隻在掉的貓，
 *     等自己載好才揭開。兩頁的畫面是同一個，看起來就是沒換過頁。
 *
 * ⚠️ 洞那張表（SIGNS）是主站 buildLogoMenu() 那張 items 的影子：
 *   站名、網址、桌機限定要跟它一致。tests/lobby.mjs 會比對，漏改的症狀是
 *   「選單叫 A、看板叫 B」或「跳進去 404」，畫面上不會報錯。
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
    /* 主站切分頁時 applyTab() 會在 <html> 寫 data-cur-tab；沒寫過（還沒切過）就是主頁。
       ⚠️ 不是 data-tab：主站很多地方在找 [data-tab]（分頁按鈕），<html> 帶著它就會被當成按鈕（見 applyTab 的註解）。 */
    function onHome() { return (H.getAttribute('data-cur-tab') || 'home') === 'home'; }

    /* ---- 場景座標：從 Blender 的攝影機投影出來的（素材/大廳/scripts/lb_holes2.py 的 project()；怎麼重算見 素材/大廳/README.md）----
       背景圖用 object-fit: cover 鋪滿畫面，所以這裡存的是「在原圖上的比例位置」（0～1），執行時再換算成螢幕座標。
       改了 Blender 的攝影機或洞的位置，這張表要跟著重算。
       洞：c＝洞口中心；l、r＝左右緣；n、f＝靠鏡頭那一邊與遠的那一邊（按鈕的橢圓就是這四點框出來的）；
           h＝在洞口前緣站一隻貓時「序列圖一格（0.8m）」佔圖高的比例（照透視，遠的洞貓比較小）；
           t＝字的錨點（洞中心正上方 1m，字的底邊中間放這裡）。
       貓：[x, y, 高]——x、y 是一開始坐的地方（腳底中間），高同上。
       ★ 照實際大小的話貓只剩一小點（一格 0.8m 見方、寫實版的貓坐著只佔三分之一），所以格子再放大 ENL 倍。 */
    var ENL = 3.2;   // 2.4 時街上的貓只有 48px 高（720p），黑貓在暗的路面上幾乎看不到
    var SCENE = {
        wide: { src: 'street-wide.webp', w: 1920, h: 1080,
                cat: [0.5139, 0.8091, 0.0838],
                holes: {
                cat: { c: [0.3221, 0.5514], l: [0.2439, 0.5514], r: [0.4002, 0.5514], n: [0.3021, 0.6524], f: [0.3383, 0.469], t: [0.3118, 0.4745], h: 0.0725 },
                ncue: { c: [0.6779, 0.5514], l: [0.5998, 0.5514], r: [0.7561, 0.5514], n: [0.6979, 0.6524], f: [0.6617, 0.469], t: [0.6882, 0.4745], h: 0.0725 },
                doc: { c: [0.5, 0.3876], l: [0.4405, 0.3876], r: [0.5595, 0.3876], n: [0.5, 0.4488], f: [0.5, 0.3351], t: [0.5, 0.3177], h: 0.0578 },
                md: { c: [0.3545, 0.2742], l: [0.3022, 0.2742], r: [0.4067, 0.2742], n: [0.3439, 0.3192], f: [0.3636, 0.2349], t: [0.3488, 0.2111], h: 0.0484 },
                spice: { c: [0.6455, 0.2742], l: [0.5933, 0.2742], r: [0.6978, 0.2742], n: [0.6561, 0.3192], f: [0.6364, 0.2349], t: [0.6512, 0.2111], h: 0.0484 } } },
        tall: { src: 'street-tall.webp', w: 1080, h: 1920,
                cat: [0.5259, 0.851, 0.0496],
                holes: {
                cat: { c: [0.3225, 0.6808], l: [0.1747, 0.6808], r: [0.4704, 0.6808], n: [0.3141, 0.7656], f: [0.3302, 0.6033], t: [0.3101, 0.6589], h: 0.0474 },
                ncue: { c: [0.6718, 0.5162], l: [0.543, 0.5162], r: [0.8007, 0.5162], n: [0.6789, 0.5828], f: [0.6653, 0.4546], t: [0.6827, 0.4861], h: 0.0428 },
                md: { c: [0.3427, 0.3794], l: [0.2247, 0.3794], r: [0.4607, 0.3794], n: [0.3368, 0.4351], f: [0.3482, 0.3276], t: [0.3336, 0.3441], h: 0.039 },
                spice: { c: [0.6451, 0.2639], l: [0.5363, 0.2639], r: [0.7539, 0.2639], n: [0.6501, 0.3111], f: [0.6404, 0.2197], t: [0.6527, 0.2254], h: 0.0359 },
                doc: { c: [0.4243, 0.1651], l: [0.3234, 0.1651], r: [0.5252, 0.1651], n: [0.4219, 0.2056], f: [0.4266, 0.127], t: [0.4206, 0.1247], h: 0.0332 } } }
    };
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
        loaf:    [24, 4.00],   // 麵包：前腳收在胸口下，慢慢呼吸
        /* 2026-10-17：主頁的貓從畫面外跑進來、跑去方框邊邊用（Blender 的 nat_run，跟轉場影片裡衝進店的是同一套）。 */
        run:     [8,  0.33],   // 奔跑的一個循環（每秒 3 步，一步往前 0.42m）
        /* 2026-10-22：跳進洞之後在下墜隧道裡、以及從主頁上方掉下來時用。四腳張開、尾巴往上當舵、耳朵往後貼，輕輕划動。 */
        fall:    [8,  0.67]
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
       ★ 只在小黑貓、彰師電子這兩頁載（HOMES）：錯題本、電路、文書三頁的貓掉一下就鑽進次元裂縫，
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
        e.dataset.face = '';   // 換動作就回到那個動作預設的朝向（runTo／jumpIn 會再蓋掉）
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
        /* 交棒過來的那一頁一開始就是隧道裡（下墜影片的第一格），不是街上。 */
        H.style.setProperty('--lb-bg', 'url(' + (mode === 'arrive' ? fallPoster(hand && hand.lay) : DIR + SCENE[lay].src) + ')');
        H.classList.add('lobby-on');
        whenBody(build);
    }

    function build() {
        root = el('div');
        root.id = 'lobby';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '選一個洞跳下去');
        half = el('div', 'lb-half', root);
        scene = el('div', 'lb-scene', half);

        bgImg = el('img', 'lb-bg', scene);
        bgImg.alt = '';
        bgImg.decoding = 'async';
        /* 背景圖抓不到（離線又沒進過快取）就直接放棄大廳：一條黑漆漆、只有字的街比沒有大廳更像壞掉。
           ★ 交棒過來的那一頁不看街景（直接是隧道），所以不用等它。 */
        if (mode !== 'arrive') { bgImg.onerror = abort; bgImg.src = DIR + SCENE[lay].src; }

        el('div', 'lb-rain', scene);

        if (mode !== 'arrive') SIGNS.forEach(function (s) {
            var k = s[0], off = s[3] && touch;
            /* 洞：一顆橢圓的按鈕蓋在路面的洞口上；字：浮在洞口正上方的全息投影（2026-10-22 第五版，拿掉了看板）。
               兩個都點得到，hover／focus 時一起亮。 */
            /* 訊號干擾只在洞上：洞口範圍一塊（.lb-gz），裡面有掃描線和三條切片（切片的背景是同一張圖、對齊到原位）。 */
            var gz = el('div', 'lb-gz', scene), gs = [];
            for (var gi = 0; gi < 3; gi++) gs.push(el('div', 'lb-slice s' + gi, gz));
            var hole = el('button', 'lb-hole' + (s[3] ? ' desk-only' : ''), scene);
            hole.type = 'button';
            hole.dataset.k = k;
            hole.style.setProperty('--c', s[4]);
            hole.setAttribute('aria-label', '跳進' + s[1]);
            var board = el('div', 'lb-label' + (s[3] ? ' desk-only' : ''), scene);
            board.style.setProperty('--c', s[4]);
            board.setAttribute('aria-hidden', 'true');
            var nm = el('span', 'lb-name', board); nm.textContent = s[1]; nm.dataset.t = s[1];
            if (s[3]) el('span', 'lb-off', board).textContent = '用電腦開';
            if (off) { hole.disabled = true; hole.setAttribute('aria-disabled', 'true'); }
            var go = function () { pick(k); };
            hole.addEventListener('click', go);
            if (!off) board.addEventListener('click', go);
            var hot = function (on) { hole.classList.toggle('hot', on); board.classList.toggle('hot', on); };
            [hole, board].forEach(function (e) {
                e.addEventListener('pointerenter', function () { hot(true); if (k !== PAGE) prefetch(s[2]); });
                e.addEventListener('pointerleave', function () { hot(false); });
            });
            hole.addEventListener('focus', function () { hot(true); });
            hole.addEventListener('blur', function () { hot(false); });
            signEls[k] = { hole: hole, board: board, gz: gz, gs: gs };
        });

        if (mode === 'lobby') glitch();   // 洞的訊號干擾

        catEl = el('div', 'lb-cat', scene);
        preload(['idle', 'run', 'jump', 'fall']);
        if (mode !== 'arrive') { var pi = new Image(); pi.src = fallPoster(); }   // 下墜第一格先抓起來
        setSprite(catEl, mode === 'arrive' ? 'fall' : 'idle');
        if (mode !== 'arrive') want3d(catEl, 2147483002);   // 比整個大廳（2147483001）高一層
        if (mode === 'lobby' && !reduce) streetLife();

        hud = el('div', 'lb-hud', root);
        hud.textContent = mode === 'arrive' ? '下墜中' : '選一個洞跳下去';

        D.body.appendChild(root);
        H.classList.add('lobby-built');
        layout();
        W.addEventListener('resize', layout);

        /* ★ 不主動把焦點放到洞上：開站時的程式聚焦在 Chrome 會被當成鍵盤焦點，第一個洞一進來就套著一圈虛線框。 */
        if (mode === 'arrive') arrive(PAGE);
    }

    /* 訊號干擾（只在洞上）：每 0.9～2.6 秒挑一個洞閃一下（0.2 秒），那個洞的三條切片各自往左右錯開、上面的字紅藍分離拉大。
       洞的掃描線一直都在（CSS）。減少動態、省電模式都不閃（每次輪到時才檢查，中途切換也跟得上）。 */
    function glitch() {
        setTimeout(function () {
            if (done || picked || !root) return;
            if (!reduce && !H.classList.contains('fx-lite')) {
                var ks = Object.keys(signEls), o = signEls[ks[Math.floor(Math.random() * ks.length)]];
                if (o && o.gz) {
                    o.gs.forEach(function (e) {
                        var y = Math.random() * 85, h = 4 + Math.random() * 14;
                        e.style.clipPath = 'inset(' + y + '% 0 ' + Math.max(0, 100 - y - h) + '% 0)';
                        e.style.transform = 'translateX(' + ((Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 16)) + 'px)';
                    });
                    o.gz.classList.add('glitching'); o.board.classList.add('glitching');
                    setTimeout(function () { o.gz.classList.remove('glitching'); o.board.classList.remove('glitching'); }, 200);
                }
            }
            glitch();
        }, 900 + Math.random() * 1700);
    }

    /* 使用者還在挑的時候，街上的貓不要一直同一個動作：坐一下、東張西望、舔舔爪子。 */
    function streetLife() {
        setTimeout(function () { preload(['look', 'groom']); }, 2500);
        var seq = ['look', 'idle', 'groom', 'idle'], k = 0;
        (function next() {
            setTimeout(function () {
                if (picked || done || !catEl || catEl.parentNode !== scene) return;
                setSprite(catEl, seq[k++ % seq.length]);
                next();
            }, k % 2 ? CAT.look[1] * 2000 : 6500);
        })();
    }

    /* 背景是 cover：短邊貼齊、長邊裁掉兩端。把圖上的比例座標換成螢幕座標。 */
    function mapper() {
        var S = SCENE[lay], vw = W.innerWidth, vh = W.innerHeight;
        var s = Math.max(vw / S.w, vh / S.h);
        var ox = (vw - S.w * s) / 2, oy = (vh - S.h * s) / 2;
        return { s: s, x: function (n) { return ox + n * S.w * s; }, y: function (n) { return oy + n * S.h * s; }, ih: S.h * s,
                 p: function (q) { return [ox + q[0] * S.w * s, oy + q[1] * S.h * s]; } };
    }

    /* 2026-10-22：跑向洞口時照「實際要去的方向」轉身，不是固定側身。
       回傳 3D 貓的朝向（度）：0＝朝鏡頭（往畫面下方跑），90＝往右，180＝背對鏡頭（往畫面上方跑）。 */
    function headingTo(dx, dy) { return (Math.atan2(dx, dy) * 180 / Math.PI).toFixed(1); }

    var catAt = null;   // 大廳裡的貓：{x, y, size}（腳底中間、格子邊長，px）；跑去洞口時由 runTo 改寫
    function placeCat(x, y, size) {
        catAt = { x: x, y: y, size: size };
        catEl.style.setProperty('--size', size + 'px');
        catEl.style.left = (x - size / 2) + 'px';
        catEl.style.top = (y - size) + 'px';
    }

    function layout() {
        if (!root || done) return;
        var nl = pickLayout();
        if (nl !== lay && mode !== 'arrive' && !picked) {   // 手機轉向：換一張圖
            lay = nl;
            bgImg.src = DIR + SCENE[lay].src;
            H.style.setProperty('--lb-bg', 'url(' + DIR + SCENE[lay].src + ')');
        }
        var m = mapper(), S = SCENE[lay];
        SIGNS.forEach(function (s) {
            var o = signEls[s[0]], p = S.holes[s[0]];
            if (!o || !p) return;
            var l = m.p(p.l), r = m.p(p.r), f = m.p(p.f), n = m.p(p.n);
            o.hole.style.left = l[0] + 'px'; o.hole.style.width = (r[0] - l[0]) + 'px';
            o.hole.style.top = f[1] + 'px'; o.hole.style.height = (n[1] - f[1]) + 'px';
            /* 干擾範圍：洞口外擴一圈（含崩裂的邊）；切片背景用整張圖的大小、往回移到這塊的位置，平常完全對齊原圖。 */
            var gw = (r[0] - l[0]) * 1.3, gh = (n[1] - f[1]) * 1.45, gx = l[0] - (r[0] - l[0]) * 0.15, gy = f[1] - (n[1] - f[1]) * 0.25;
            var gz = o.gz.style;
            gz.left = gx + 'px'; gz.top = gy + 'px'; gz.width = gw + 'px'; gz.height = gh + 'px';
            gz.setProperty('--bgs', (S.w * m.s) + 'px ' + (S.h * m.s) + 'px');
            gz.setProperty('--bgp', (m.x(0) - gx) + 'px ' + (m.y(0) - gy) + 'px');
            /* 字：底邊中間對齊錨點 t（洞中心正上方 1m）；直版鏡頭幾乎朝下，1m 高投影出來還在洞口裡，
               所以底邊最低只到洞的遠緣 f（字永遠在洞的上方、不蓋住洞）。字級跟洞一樣寬（遠的洞字小），但不小於 13px。 */
            var t = m.p(p.t), w = r[0] - l[0];
            o.board.style.left = t[0] + 'px'; o.board.style.top = Math.min(t[1], f[1] - w * 0.04) + 'px';
            o.board.style.fontSize = Math.max(13, Math.min(w * 0.24, (w * 1.2) / s[1].length)) + 'px';
        });
        if (catEl && catEl.parentNode === scene && !picked) {
            var c = S.cat;
            placeCat(m.x(c[0]), m.y(c[1]), c[2] * ENL * m.ih);
        }
        if (fallOn) fallLayout();
    }

    var prefetched = {};
    function prefetch(href) {
        if (prefetched[href]) return;
        prefetched[href] = 1;
        try { var l = D.createElement('link'); l.rel = 'prefetch'; l.href = href; D.head.appendChild(l); } catch (e) {}
    }

    /* ---- 點了一個洞（2026-10-22，取代「鏡頭飛進店裡」）----
       貓跑到洞口、跳進去；畫面往洞裡衝下去，接著是所有產品共用的下墜隧道（影片循環，載多久掉多久），貓在畫面中間一起掉。
       選小黑貓：這一頁載好就從隧道底掉出去、揭開首頁，貓再從主頁上方掉下來（Companion.enter）。
       選別的：掉一下就換頁（交棒），新的那一頁一開始就是同一條隧道、同一隻貓；載好時貓旁邊裂開一道次元裂縫，貓被吸進去，再揭開那一頁。 */
    function pick(k) {
        if (picked || done) return;
        var s = signOf(k);
        if (!s || (s[3] && touch)) return;
        picked = true;
        root.classList.add('picked');
        signEls[k].hole.classList.add('chosen'); signEls[k].board.classList.add('chosen');
        arm();
        if (k !== PAGE) prefetch(s[2]);
        if (reduce) {   // 減少動態：不跑、不掉，選了就走
            if (k === PAGE) within(readyP, 20000).then(function () { fadeOut(); });
            else go(s);
            return;
        }
        hud.textContent = '跳';
        fallVideo();   // 先開始抓影片
        var p = SCENE[lay].holes[k], m = mapper();
        var n = m.p(p.n), c = m.p(p.c), hs = p.h * ENL * m.ih;
        runTo(n[0], n[1] - hs * 0.04, hs).then(function () {
            return jumpIn(c[0], c[1], hs);
        }).then(function () {
            return dive(c[0], c[1], s[4]);
        }).then(function () {
            fallStart();
            if (k === PAGE) Promise.all([within(readyP, 20000), wait(1600)]).then(function () { dropOut(); });
            else wait(900).then(function () { go(s); });
        });
    }

    /* 交棒：記下要去哪、換頁。新的那一頁在 arrive() 接手，直接從隧道開始。 */
    function go(s) {
        /* ft：隧道影片播到第幾秒。新的那一頁從「這一秒＋換頁花掉的時間」接著播，不從頭開始（從頭開始會頓一下，像掉的速度變了）。 */
        var ft = fallEl && isFinite(fallEl.currentTime) ? fallEl.currentTime : 0;
        try { sessionStorage.setItem(HAND_KEY, JSON.stringify({ to: s[0], at: Date.now(), lay: lay, ft: ft })); } catch (e) {}
        location.href = s[2];
    }

    /* 跑到洞口：位置與格子大小一起內插（越遠的洞貓越小，照透視）。 */
    function frames(dur, step) {
        return new Promise(function (res) {
            var t0 = 0;
            function f(now) {
                if (done) return res();
                if (!t0) t0 = now;
                var u = Math.min(1, (now - t0) / (dur * 1000));
                step(u);
                if (u < 1) requestAnimationFrame(f); else res();
            }
            requestAnimationFrame(f);
        });
    }
    function runTo(x, y, size) {
        var a = catAt, dx = x - a.x, dist = Math.hypot(dx, y - a.y);
        catEl.style.transform = dx < 0 ? 'scaleX(-1)' : '';
        setSprite(catEl, 'run');
        if (dist > 1) catEl.dataset.face = headingTo(dx, y - a.y);
        var dur = Math.max(0.45, Math.min(1.6, dist / ((a.size + size) * 1.1)));
        return frames(dur, function (u) {
            placeCat(a.x + dx * u, a.y + (y - a.y) * u, a.size + (size - a.size) * u);
        });
    }
    /* 跳進洞：往洞中間拋物線，越掉越小（掉進去了），最後縮到看不見。3D 貓讀的是格子大小，所以也跟著縮。 */
    function jumpIn(x, y, size) {
        var a = { x: catAt.x, y: catAt.y, size: catAt.size };
        var face = catEl.dataset.face;
        setSprite(catEl, 'jump', true);
        /* 跳的時候維持跑來的方向（洞口中心幾乎都在前緣的正後方），不要半空中突然轉成側身 */
        if (face) catEl.dataset.face = face;
        return frames(0.5, function (u) {
            var k = u < 0.45 ? 1 : 1 - (u - 0.45) / 0.55;
            placeCat(a.x + (x - a.x) * u, a.y + (y - a.y) * u - size * 0.55 * 4 * u * (1 - u) + size * 0.25 * u * u,
                     Math.max(1, a.size * (0.15 + 0.85 * k)));
        });
    }
    /* 往洞裡衝：整個街景以洞口為中心放大、變暗，洞的顏色蓋上來。 */
    function dive(x, y, color) {
        if (c3want && c3want.e === catEl) want3d(null);
        catEl.style.visibility = 'hidden';
        half.style.transformOrigin = x.toFixed(0) + 'px ' + y.toFixed(0) + 'px';
        var a = half.animate([{ transform: 'scale(1)', filter: 'brightness(1) blur(0)' }, { transform: 'scale(7)', filter: 'brightness(0.35) blur(4px)' }],
            { duration: 620, easing: 'cubic-bezier(0.55, 0, 0.9, 0.6)', fill: 'forwards' });
        var glow = el('div', 'lb-glow', root);
        glow.style.setProperty('--c', color);
        glow.style.setProperty('--gx', x.toFixed(0) + 'px'); glow.style.setProperty('--gy', y.toFixed(0) + 'px');
        var g = glow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 620, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' });
        return Promise.all([a.finished, g.finished]).catch(function () {}).then(function () { root.dataset.glow = '1'; });
    }

    /* ---- 下墜隧道：一支所有產品共用的循環影片（Blender 算的，素材/大廳/scripts/fall.py）＋畫面中間的貓 ----
       ★ 影片裡沒有貓：貓是 cat-fall 序列圖（或 3D 貓）疊上去的，抵達時要掉出去還是鑽進裂縫由這裡決定。
       ★ 影片抓不到或播不起來：留著第一格的圖（poster），一樣是隧道，只是不會動。 */
    var fallEl = null, fallOn = false;
    function fallSrc(l) { return DIR + 'fall-' + (l || lay) + '.mp4'; }
    function fallPoster(l) { return DIR + 'fall-' + (l || lay) + '.webp'; }
    function fallVideo(l) {
        if (fallEl) return fallEl;
        var v = D.createElement('video');
        v.className = 'lb-fall';
        v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true;
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('loop', ''); v.setAttribute('aria-hidden', 'true');
        v.preload = 'auto';
        v.poster = fallPoster(l);
        /* poster 還沒畫出來之前影片是黑的（手機實測下墜一開始黑一下）：底下再鋪同一張圖 */
        v.style.background = '#07060c url(' + fallPoster(l) + ') center / cover no-repeat';
        v.src = fallSrc(l);
        try { v.load(); } catch (e) {}
        fallEl = v;
        return v;
    }
    /* 貓在隧道裡：很小、在畫面正中間（使用者畫的參考：遠遠的一隻在翻滾往下掉）。
       格子裡的貓只佔格子的三分之一左右，所以格子取短邊的兩成，貓本身大約是短邊的 7%。 */
    function fallLayout() {
        var vw = W.innerWidth, vh = W.innerHeight, size = Math.min(vw, vh) * 0.2;
        catEl.style.transform = '';
        placeCat(vw / 2, vh * 0.36 + size * 0.42, size);   // 0.46 時貓跟花瓣帶同高，看起來像站在花瓣上
    }
    function fallStart(l) {
        var v = fallVideo(l);
        root.insertBefore(v, half.nextSibling);
        /* 往洞裡衝時蓋上來的那層顏色，等影片淡進來就收掉 */
        Array.prototype.forEach.call(root.querySelectorAll('.lb-glow'), function (g) {
            var a = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, fill: 'forwards' });
            a.finished.catch(function () {}).then(function () { if (g.parentNode) g.parentNode.removeChild(g); });
        });
        root.classList.add('falling');
        /* 貓搬出會被放大的街景那一層，放到隧道上面、畫面中間 */
        root.insertBefore(catEl, hud);
        catEl.style.visibility = '';
        fallOn = true; fallLayout();
        setSprite(catEl, 'fall');
        catEl.classList.add('bob');
        hud.textContent = '下墜中';
        /* 隧道裡不用 3D 貓：翻滾是 CSS 的 rotate，3D 那支只讀格子的位置與左右翻面，接上去會變成不會翻的貓。 */
        /* 交棒過來的那一頁：前一頁最後就是隧道，這裡直接接上，不淡入（淡入的那 0.27 秒是黑的） */
        if (mode === 'arrive' && hand && hand.ft != null) {
            var seek = function () {
                var d = v.duration;
                if (!(d > 0) || !isFinite(d)) return;
                try { v.currentTime = (hand.ft + Math.max(0, Date.now() - (hand.at || Date.now())) / 1000) % d; } catch (e) {}
            };
            if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true });
        }
        if (mode === 'arrive') v.classList.add('on');
        else requestAnimationFrame(function () { v.classList.add('on'); });
        try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }

    /* 新的那一頁接手：直接是隧道、貓在中間掉，等自己載好。 */
    function arrive(k) {
        picked = true;
        arm();
        root.classList.add('picked');
        fallStart(hand && hand.lay);
        var fuse = PAGE === 'doc' ? 12000 : 20000;   // 文書的編輯器第一次要抓十幾 MB，別讓人一直掉
        Promise.all([within(readyP, fuse), wait(reduce ? 0 : 900)]).then(function () {
            if (reduce) { fadeOut(); return; }
            if (HOMES[k]) dropOut(); else rift().then(reveal);
        });
    }

    /* 小黑貓：貓從隧道底掉出畫面，隧道亮一下、淡掉，後面就是首頁；貓接著從首頁上方掉下來。 */
    function dropOut() {
        if (done) return;
        catEl.classList.remove('bob');
        var size = catAt ? catAt.size : 200;
        var a = catEl.animate([{ translate: '0 0' }, { translate: '0 ' + (W.innerHeight + size) + 'px' }],
            { duration: 420, easing: 'cubic-bezier(0.5, 0, 1, 0.5)', fill: 'forwards' });
        a.finished.catch(function () {}).then(function () { if (c3want && c3want.e === catEl) want3d(null); reveal(); });
    }

    /* 次元裂縫（不是小黑貓的那幾頁：貓不留在那裡）：貓旁邊裂開一道發光的縫，貓被吸進去、縫闔上，再揭開那一頁。 */
    function rift() {
        if (done) return Promise.resolve();
        catEl.classList.remove('bob');
        var a = catAt || { x: W.innerWidth / 2, y: W.innerHeight * 0.7, size: 200 };
        var cx = a.x + a.size * 0.18, cy = a.y - a.size * 0.42;
        var r = el('div', 'lb-rift', root);
        r.style.left = cx + 'px'; r.style.top = cy + 'px';
        r.style.setProperty('--w', (a.size * 0.5) + 'px'); r.style.setProperty('--h', (a.size * 1.05) + 'px');
        r.innerHTML = '<svg viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="lbRiftG" x1="0" y1="0" x2="1" y2="0">'
            + '<stop offset="0" stop-color="#00f0ff"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#ff2a6d"/></linearGradient></defs>'
            + '<path d="M20 0 L24 14 L17 27 L26 41 L15 55 L25 68 L18 82 L22 100 L19 100 L14 82 L21 68 L11 55 L22 41 L13 27 L20 14 L16 0 Z" fill="url(#lbRiftG)"/></svg>';
        root.insertBefore(r, catEl);
        var open = r.animate([{ scale: '0.2 0', opacity: 0 }, { scale: '1 1', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
        return open.finished.catch(function () {}).then(function () {
            setSprite(catEl, 'jump', true);
            var dx = cx - a.x, dy = cy + a.size * 0.42 - a.y;
            var s = catEl.animate([
                { translate: '0 0', scale: '1', rotate: '0deg', filter: 'none', opacity: 1 },
                { translate: (dx * 0.6) + 'px ' + (dy * 0.6 - a.size * 0.15) + 'px', scale: '0.7', rotate: '-12deg', filter: 'hue-rotate(40deg) brightness(1.4)', opacity: 1, offset: 0.55 },
                { translate: dx + 'px ' + dy + 'px', scale: '0.05 0.4', rotate: '-25deg', filter: 'hue-rotate(90deg) brightness(3) blur(2px)', opacity: 0 }
            ], { duration: 520, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)', fill: 'forwards' });
            return s.finished.catch(function () {});
        }).then(function () {
            var c = r.animate([{ scale: '1 1', opacity: 1, filter: 'brightness(1)' }, { scale: '0 0.9', opacity: 0, filter: 'brightness(3)' }],
                { duration: 240, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
            return c.finished.catch(function () {});
        });
    }

    /* 揭開：大廳（隧道）淡掉，後面就是那個產品。 */
    function reveal() {
        if (done) return;
        root.classList.add('opening');
        if (hud) hud.style.opacity = '0';
        var spawnCat = HOMES[PAGE] && catStays();
        if (reduce) { fadeOut(); return; }
        var b = root.animate([{ opacity: 1, filter: 'brightness(1)' }, { opacity: 1, filter: 'brightness(1.8)', offset: 0.25 }, { opacity: 0, filter: 'brightness(1)' }],
            { duration: 520, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
        b.finished.catch(function () {}).then(function () {
            finish();
            if (spawnCat) Companion.spawn(true);
        });
    }

    function fadeOut() {
        root.classList.add('fade');
        setTimeout(function () { finish(); if (HOMES[PAGE] && catStays()) Companion.spawn(); }, 300);
    }

    /* ======================================================
     * 留在畫面上的那隻（只有小黑貓、而且只在「主頁」分頁；設定裡可以關）
     *
     * ★ 2026-10-16 深夜起：彰師電子不留貓（HOMES），切到其他分頁時藏起來（onHome()，看 <html data-cur-tab>）。
     * ★ 不只是「大廳之後」才有：直接打開小黑貓、或站內換頁回來，牠也在。
     * ★ 2026-10-17 改成「會跳的貓」（使用者要的）：
     *   - 地板只有兩種：畫面最底下一條，以及主頁上每個方框的頂邊（課表大卡、課表的每一格、今日提示列、時鐘、任務卡，見 PLAT_SEL）。
     *   - 每次出現（進站、從別的分頁切回主頁）都從畫面左邊跑進來，跳上課表那張大卡。
     *   - 自己會在方框上散步、走到方框邊邊跳到別的方框，或跳下地板（hopAct）。
     *   - 捲動時方框跟著動，站在上面的貓也跟著動。方框快被捲到頁首底下時，牠先跳到畫面裡別的方框（沒有就跳下地板）；
     *     方框往下捲過地板線時，牠順勢留在底部那條地板上；捲動停下來時如果在地板上，多半會跳回畫面中間的方框（afterScroll）。
     * ★ 位置全部用 JS 算（position: fixed＋transform），每一格讀「腳下那個方框」現在在螢幕的哪裡。
     *   只有在動的時候（走、跳、捲動後 0.3 秒內）才跑 requestAnimationFrame，坐著不動時不吃電。
     * ★ 3D 貓（lobby3d.js）照舊只讀這個格子的位置與動作，不用改。
     * ====================================================== */
    var Companion = (function () {
        var btn = null, timer = 0, bubbleT = 0, raf = 0, endT = 0, lastT = 0, scrollT = 0, watchT = 0, ro = null, mo = null, shown = false;
        var SIZE = 128;  // 一格 0.8m 見方，寫實版的貓坐著只佔三分之一：128px 的格子裡貓大約 45px 高（格子其他地方是透明的）
        var DROP_G = 2600;   // 從上方掉下來的重力加速度（px／秒²）：從畫面頂掉到 600px 處約 0.68 秒
        var FEET = SIZE * 0.025;   // 腳底在格子底往上 2.5%（跟 lobby3d.js 的 GROUND 同一個數，不然 3D 貓會浮在方框上或陷進去）
        /* 走路速度要跟腳步對上，不然腳會在地上滑：Blender 裡一步（一個循環）往前 0.14m（cat2_natural.py 的 WALK.stride），
           一格 0.8m＝SIZE px，一個循環 CAT.walk[1] 秒。 */
        var WALK = { name: 'walk', spd: 1, px: SIZE / 0.8 * 0.14 / CAT.walk[1] };
        /* 跑：一步往前 0.42m（cat2_idle2.py 的 RUN.stride），換算方式跟走路一樣，腳才不會在地上滑（約 200px／秒）。
           萬一 CAT.run 被拿掉，退回把走路加快 2.5 倍播。 */
        var RUN = CAT.run ? { name: 'run', spd: 1, px: SIZE / 0.8 * 0.42 / CAT.run[1] } : { name: 'walk', spd: 0.4, px: WALK.px / 0.4 * 1.6 };
        var EDGE = 28;   // 貓的中心離方框左右邊至少這麼遠（側身走路時身體約 60px 長，再近就半隻懸空）
        /* 哪些東西算「方框」。只認主頁上的：別的分頁、別的子分頁藏起來時寬高是 0，自然不算。
           ⚠️ 主頁改版（換 id、課表不再是 <table>）時這張表要跟著改，漏了不會報錯，只會「貓不上那個框」。 */
        var PLAT_SEL = '#page-home [id^="home-sub-"] > div, #page-home [id^="home-sub-"] > section, #scheduleNowNext, ' +
                       '#scheduleTable th, #scheduleTable td, #missionList > *, #home-user-hero .shrink-0';
        var LINES = ['喵', '喵～', '呼嚕呼嚕', '(=^･ω･^=)', '今天也要加油喵', '摸夠了沒'];

        /* 貓現在站在哪：cur＝腳下的方框（null＝底部地板）；rx＝在方框上的位置（離方框左邊幾 px），地板上就是螢幕 x。 */
        var state = 'sit', flip = 1, cur = null, rx = 0, air = null, mv = null, lastX = 0, lastY = 0;

        function bottom() {
            var dock = D.getElementById('navDock');
            var base = 12;
            if (dock && H.classList.contains('nav-bottom') && !H.classList.contains('kb-open')) {
                var r = dock.getBoundingClientRect();
                if (r.height) base = Math.max(base, W.innerHeight - r.top + 8);
            }
            return base;
        }
        function floorY() { return W.innerHeight - bottom(); }
        /* 方框頂邊要在這條線以下，貓才不會被黏在上面的頁首蓋住。
           坐著的 3D 貓（含耳朵）約半格高；只留 0.42 格的時候頭頂會被頁首切掉（測試頁上看到的），所以留 0.6 格。 */
        function topY() {
            var h = D.querySelector('header'), b = 0;
            if (h) { var r = h.getBoundingClientRect(); if (r.height && r.bottom > 0) b = r.bottom; }
            return b + SIZE * 0.6;
        }
        function clampFloor(x) { return Math.max(24, Math.min(W.innerWidth - 96, x)); }   // 右下角是「回到頂端」與吐司
        /* 方框在螢幕上看得到的那一段；課表在手機上是橫向捲動的，被裁掉的部分不算。a～b 是貓的中心可以站的範圍。 */
        function view(el) {
            var r = el.getBoundingClientRect();
            if (!r.width || !r.height) return null;
            var a = Math.max(r.left, 0), b = Math.min(r.right, W.innerWidth);
            var clip = el.closest && el.closest('.schedule-scroll');
            if (clip) { var c = clip.getBoundingClientRect(); a = Math.max(a, c.left); b = Math.min(b, c.right); }
            return { el: el, r: r, top: r.top, a: a + EDGE, b: b - EDGE };
        }
        function plats() {
            var out = [], zt = topY(), zb = floorY() - 36;
            D.querySelectorAll(PLAT_SEL).forEach(function (el) {
                var v = view(el);
                if (v && v.top >= zt && v.top <= zb && v.b - v.a >= 16) out.push(v);
            });
            return out;
        }
        /* 畫面裡最適合站的方框：盡量在畫面中段、離貓近。都沒有就回 null（呼叫的人自己決定落地板）。 */
        function best(ex, x, y) {
            var zt = topY(), mid = zt + (floorY() - zt) * 0.45, out = null, bs = Infinity;
            plats().forEach(function (v) {
                if (v.el === ex) return;
                var px = Math.max(v.a, Math.min(v.b, x));
                var s = Math.abs(v.top - mid) * 0.5 + Math.abs(px - x) + Math.abs(v.top - y) * 0.35;
                if (s < bs) { bs = s; out = { el: v.el, rx: px - v.r.left, x: px }; }
            });
            return out;
        }
        /* 腳下那一段能走的範圍（跟 rx 同一套座標）。 */
        function span() {
            if (!cur) return [24, W.innerWidth - 96];
            var v = view(cur);
            return v ? [v.a - v.r.left, v.b - v.r.left] : null;
        }
        function feet() {
            if (!cur) return { x: rx, y: floorY() };
            var r = cur.getBoundingClientRect();
            return { x: r.left + rx, y: r.top };
        }
        function draw(x, y) {
            lastX = x; lastY = y;
            btn.style.transform = 'translate(' + (x - SIZE / 2).toFixed(1) + 'px,' + (y + FEET - SIZE).toFixed(1) + 'px) scaleX(' + flip + ')';
            btn.style.setProperty('--bc-flip', flip);
        }

        /* ---- 每一格：跳到一半就照拋物線走；站著就跟著腳下的方框，順便檢查方框還站不站得住 ---- */
        function kick(ms) {
            endT = Math.max(endT, performance.now() + (ms || 300));
            if (!raf && btn && shown) raf = requestAnimationFrame(tick);
        }
        function tick(now) {
            raf = 0;
            if (!btn || !shown) { lastT = 0; return; }
            var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;   // 分頁被切到背景再回來時不要一步瞬移
            lastT = now;
            if (air) flyStep(now);
            else { if (mv) walkStep(dt); if (!air) ground(); }
            if (air || mv || now < endT) raf = requestAnimationFrame(tick);
            else lastT = 0;
        }
        function ground() {
            if (cur) {
                var v = view(cur);
                if (!v) { cur = null; rx = clampFloor(lastX); escape(lastX, lastY); return; }   // 方框不見了（切子分頁、重畫課表）
                var x = v.r.left + rx;
                if (v.top > floorY()) {
                    /* 方框往下捲過地板線：貓順勢站到地板上（看起來就是方框從牠腳下滑走）。 */
                    if (mv) mv.to += v.r.left;
                    cur = null; rx = x;
                } else if (v.top < topY() || x < v.a - EDGE || x > v.b + EDGE) {
                    escape(x, v.top); return;   // 快被頁首蓋住、或被橫向捲出去：跳走
                } else if (!mv && v.b >= v.a && (x < v.a || x > v.b)) {
                    rx = Math.max(v.a, Math.min(v.b, x)) - v.r.left;   // 方框變窄了：往內站一點
                }
            } else if (!mv) rx = clampFloor(rx);
            var p = feet();
            draw(p.x, p.y);
        }
        function escape(x, y) {
            mv = null;
            hop(best(cur, x, y) || { el: null, rx: clampFloor(x) }, false);
        }

        function aim(to) {
            if (!to.el) return { x: to.rx, y: floorY() };
            var r = to.el.getBoundingClientRect();
            return r.height ? { x: r.left + to.rx, y: r.top } : null;
        }
        /* 跳：crouch＝先蹲一下再跳（自己想跳的時候）；被捲動逼著跳的時候直接起跳。 */
        function hop(to, crouch) {
            clearTimeout(timer); mv = null;
            if (still()) { cur = to.el; rx = to.rx; air = null; state = 'sit'; play('idle'); kick(); return; }
            var g = aim(to);
            if (!g) { to = { el: null, rx: clampFloor(lastX) }; g = aim(to); }
            flip = g.x >= lastX ? 1 : -1;
            air = { sx: lastX, sy: lastY, to: to, t0: 0, wait: crouch ? 0.16 : 0.03, dur: 0, h: 0 };
            state = 'jump'; play('jump', true);
            kick();
        }
        function flyStep(now) {
            var a = air;
            if (!a.t0) a.t0 = now;
            var g = aim(a.to);
            if (!g) { a.to = { el: null, rx: clampFloor(lastX) }; g = aim(a.to); }   // 要跳上去的方框半路不見了：改落地板
            if (!a.dur) {
                var d = Math.hypot(g.x - a.sx, g.y - a.sy);
                if (a.drop) a.dur = Math.max(0.3, Math.min(0.95, Math.sqrt(2 * Math.max(0, g.y - a.sy) / DROP_G)));
                else a.dur = Math.max(0.4, Math.min(0.85, 0.28 + d / 1000));
                /* 往上跳：最高點要比目標高一截再落下來；往下跳：只往上彈一點點。 */
                a.h = a.drop ? 0 : (g.y < a.sy ? (a.sy - g.y) * 0.45 + 36 : 26 + Math.min(30, d * 0.05));
            }
            var t = (now - a.t0) / 1000 - a.wait;
            if (t <= 0) { draw(a.sx, a.sy); return; }
            var u = Math.min(1, t / a.dur);
            /* 從上方掉下來：等加速度（越掉越快），不是拋物線 */
            if (a.drop) draw(a.sx + (g.x - a.sx) * u, a.sy + (g.y - a.sy) * u * u);
            else draw(a.sx + (g.x - a.sx) * u, a.sy + (g.y - a.sy) * u - a.h * 4 * u * (1 - u));
            if (u >= 1) {
                cur = a.to.el; rx = a.to.rx; air = null;
                state = 'land'; play('land', true);
                later(function () { sit(); }, CAT.land[1] * 1000 + 60);
                kick();
            }
        }
        function walkStep(dt) {
            var dir = mv.to >= rx ? 1 : -1;
            rx += dir * mv.v * dt;
            if ((dir > 0 && rx >= mv.to) || (dir < 0 && rx <= mv.to)) {
                rx = mv.to;
                var f = mv.done; mv = null;
                if (f) f();
            }
        }
        function walkTo(to, g, done) {
            flip = to >= rx ? 1 : -1;
            state = g === RUN ? 'run' : 'walk';
            play(g.name, false, false, g.spd);
            mv = { to: to, v: g.px, done: done };
            kick();
        }

        /* ---- 牠自己決定接下來做什麼 ----
           坐著是「家」：從坐姿出發去東張西望、理毛、散步、趴下、跳去別的方框，做完一定回到坐姿。
           散步要先站起來（stand）、走完倒著播 stand 坐回去；趴下也一樣（liedown 正著播趴、倒著播起來）。
           所以序列圖之間永遠是同一個姿勢接同一個姿勢，不會「啪」一下換掉（跳是例外：被捲動逼著跳時來不及站起來）。 */
        function play(name, once, reverse, spd) { setSprite(btn, name, once, reverse, spd); }
        function later(fn, ms) { clearTimeout(timer); timer = setTimeout(function () { if (btn && shown && !air) fn(); }, ms); }
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
            ['look', 22, function () { loopAct('look', 1, 3); }],
            ['groom', 12, function () { loopAct('groom', 1, 3); }],
            ['wash', 10, function () { loopAct('wash', 1, 2); }],
            ['scratch', 7, function () { loopAct('scratch', 1, 2); }],
            ['tilt', 9, function () { onceAct('tilt'); }],
            ['stretch', 8, function () { onceAct('stretch'); }],
            ['walk', 16, function () { stroll(); }],
            ['hop', 18, function () { hopAct(); }],
            ['lie', 10, function () { liedown(); }],
            ['loaf', 10, function () { loaf(); }]
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
            preload(['look', 'groom', 'walk', 'run', 'stand', 'jump', 'land', 'lie', 'liedown', 'sleep', 'wash', 'scratch', 'tilt', 'stretch', 'loaf', 'loafdown'].filter(function (n) { return CAT[n]; }));
            var pool = ACTS.filter(function (a) { return (a[0] === 'hop' || CAT[a[0]]) && (a[0] !== 'loaf' || CAT.loafdown); });
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
        /* 在腳下這個方框（或地板）上走一段，最多 260px。方向要在站起來之前決定：
           stand 這段序列圖會從「朝前坐」轉成「側身」，轉錯邊的話一起步就啪一下翻面。 */
        function stroll() {
            var s = span();
            if (!s || s[1] - s[0] < 50) return hopAct();
            var lo = Math.max(s[0], rx - 260), hi = Math.min(s[1], rx + 260);
            var to = lo + (hi - lo) * Math.random();
            if (Math.abs(to - rx) < 24) return sit();
            flip = to >= rx ? 1 : -1; kick();
            state = 'stand'; play('stand', true);
            later(function () {
                walkTo(to, WALK, function () {
                    state = 'stand'; play('stand', true, true);
                    later(function () { sit(); }, CAT.stand[1] * 1000);
                });
            }, CAT.stand[1] * 1000);
        }
        /* 跳去別的方框：挑附近（左右 340px、上下 400px 內）的一個，近的機率高；站在方框上時也可能跳下地板。
           目標在方框外面的話，先走到方框上離目標最近的地方再跳（看起來是「走到邊邊、往下看、跳」）。 */
        function hopAct() {
            var opts = [], tot = 0;
            plats().forEach(function (v) {
                if (v.el === cur) return;
                var px = Math.max(v.a, Math.min(v.b, lastX + (Math.random() - 0.5) * 160));
                var dx = Math.abs(px - lastX), dy = Math.abs(v.top - lastY);
                if (dx > 340 || dy > 400 || (dy < 6 && dx < 40)) return;
                var w = 1 / (1 + (dx + dy) / 160);
                opts.push({ to: { el: v.el, rx: px - v.r.left }, x: px, w: w }); tot += w;
            });
            if (cur) {
                var fx = clampFloor(lastX + (Math.random() - 0.5) * 200), fw = 0.3;
                opts.push({ to: { el: null, rx: fx }, x: fx, w: fw }); tot += fw;
            }
            if (!opts.length) return sit();
            var r = Math.random() * tot, o = opts[0];
            for (var i = 0; i < opts.length; i++) { o = opts[i]; if ((r -= o.w) <= 0) break; }
            var go = function () { hop(o.to, true); };
            var s = span();
            if (cur && s) {
                var left = cur.getBoundingClientRect().left, off = Math.max(s[0], Math.min(s[1], o.x - left));
                if (Math.abs(off - rx) > 16) {
                    flip = off >= rx ? 1 : -1; kick();
                    state = 'stand'; play('stand', true);
                    later(function () { walkTo(off, Math.abs(off - rx) > 120 ? RUN : WALK, go); }, CAT.stand[1] * 1000);
                    return;
                }
            }
            flip = o.x >= lastX ? 1 : -1; kick();
            state = 'stand'; play('stand', true);
            later(go, CAT.stand[1] * 1000);
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
        /* 捲動停下來：在地板上的話，多半跳回畫面中間的方框（使用者要「盡量出現在畫面中」）。睡著、趴著就讓牠待著。 */
        function afterScroll() {
            if (!btn || !shown || air || mv || still() || cur) return;
            if (!/^(sit|look|groom|wash|tilt|land)$/.test(state) || Math.random() > 0.8) return;
            var t = best(null, lastX, lastY);
            if (t) hop(t, true);
        }

        /* ---- 出場：從畫面上方掉下來，落在課表那張大卡上（2026-10-22 起；之前是從左邊跑進來跳上去）----
           沒登入（沒有課表）、切在任務／倒數子分頁、或課表大卡的頂邊不在畫面裡：改跳上畫面裡最好的方框，再沒有就停在地板上。 */
        function homeSpot() {
            var el = D.getElementById('home-user-schedule'), v = el && view(el);
            if (v && v.top >= topY() && v.top <= floorY() - 36 && v.b > v.a) {
                var x = Math.min(v.b, v.a + 30 + Math.random() * 60);
                return { el: el, rx: x - v.r.left, x: x };
            }
            return best(null, 140, floorY());
        }
        function enter() {
            clearTimeout(timer); air = null; mv = null;
            var home = homeSpot();
            if (still()) {
                if (home) { cur = home.el; rx = home.rx; } else { cur = null; rx = 60; }
                state = 'sit'; play('idle'); btn.style.backgroundPosition = '0 0';
                kick(); return;
            }
            /* 2026-10-22：從畫面上方掉下來（大廳的貓從隧道底掉出去之後，就是從這裡掉進首頁），落在課表大卡上；
               沒有大卡就落在畫面裡最好的方框，再沒有就落在地板。 */
            var to = home || { el: null, rx: clampFloor(80 + Math.random() * 120) };
            var x = to.el ? to.x : to.rx;
            cur = null; flip = 1; rx = x;
            draw(x, -8);   // 腳底在畫面上緣再上面一點：整格都還在畫面外
            air = { sx: x, sy: -8, to: to, t0: 0, wait: 0, dur: 0, h: 0, drop: true };
            state = 'jump'; play('fall');
            kick();
        }

        /* 只在主頁出現；鍵盤彈出時先藏起來（不重演出場）；從別的分頁切回主頁時重新跑進來。 */
        function place() {
            if (!btn) return;
            var home = onHome();
            btn.style.display = home && !H.classList.contains('kb-open') ? '' : 'none';
            if (home && !shown) { shown = true; enter(); }
            else if (!home && shown) { shown = false; clearTimeout(timer); air = null; mv = null; }
            kick();
        }
        function idleLoop() {
            clearTimeout(timer);
            if (!btn) return;
            air = null; mv = null;
            if (still()) { state = 'sit'; play('idle'); kick(); return; }
            sit();
        }
        function poke() {
            if (!btn) return;
            var b = btn.querySelector('.bc-bubble');
            b.textContent = LINES[Math.floor(Math.random() * LINES.length)];
            btn.classList.add('talk');
            clearTimeout(bubbleT);
            bubbleT = setTimeout(function () { if (btn) btn.classList.remove('talk'); }, 1600);
            if (still() || air) return;
            /* 摸牠：坐著就跳一下；躺著、睡著就起來；走到一半（或正要走去邊邊跳）就停下來坐好。 */
            if (/^(sit|look|groom|wash|tilt)$/.test(state)) {
                state = 'land'; play('land', true); later(function () { sit(); }, CAT.land[1] * 1000 + 60);
            } else if (state === 'lie' || state === 'sleep') getUp();
            else if (state === 'walk' || state === 'run') {
                mv = null;
                state = 'stand'; play('stand', true, true); later(function () { sit(); }, CAT.stand[1] * 1000);
            }
        }
        function onScroll() {
            if (!btn) return;
            kick();
            clearTimeout(scrollT);
            scrollT = setTimeout(afterScroll, 280);
        }
        function onResize() { kick(); }
        /* 保險：每 0.8 秒看一眼腳下的方框還在不在、還站不站得住。
           ResizeObserver 只看得到 #page-home 長高變矮；課表重畫、某一格被換掉這種「大小沒變但方框換人」的事它看不到，
           沒有這一眼的話貓會一直站在已經不存在的方框位置上（空氣上）。只讀一次位置，不跑動畫。 */
        function watch() {
            clearTimeout(watchT);
            if (!btn) return;
            if (shown && !air && !mv && !raf) ground();
            watchT = setTimeout(watch, 800);
        }
        function spawn() {
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
            preload(['fall', 'run', 'walk', 'jump', 'land', 'stand']);
            load3d();
            want3d(btn, 29);   // 比貓的按鈕（30）低一層：泡泡要在貓上面，點擊本來就穿透畫布
            if (still()) btn.style.backgroundPosition = '0 0';
            W.addEventListener('resize', onResize);
            /* capture：課表在手機上是橫向捲動的 div，它的 scroll 不會冒泡到 window，用捕獲階段才收得到。 */
            W.addEventListener('scroll', onScroll, { capture: true, passive: true });
            /* 主頁內容長高變矮（課表畫好、切子分頁）時方框會移動，牠要跟著。 */
            try {
                var pg = D.getElementById('page-home');
                if (pg && W.ResizeObserver) { ro = new ResizeObserver(function () { kick(); }); ro.observe(pg); }
            } catch (e) {}
            place();
            watch();
            /* <html> 的 class 會因為很多事變（鍵盤彈出、分頁列搬家、深淺色）。
               位置每次都重算，但動作只在「省電」被切換時才重來——不然每變一次 class
               貓就從第一格重播，看起來像一直抽搐。 */
            var lite = H.classList.contains('fx-lite');
            mo = new MutationObserver(function () {
                place();
                var now = H.classList.contains('fx-lite');
                if (now !== lite) {
                    lite = now; idleLoop();
                    if (now && btn) btn.style.backgroundPosition = '0 0';
                    /* 省電模式：3D 貓收掉，換回序列圖的第一格；關掉省電再請 3D 回來。 */
                    if (btn) { if (now) want3d(null); else { load3d(); want3d(btn, 29); } }
                }
            });
            mo.observe(H, { attributes: true, attributeFilter: ['class', 'data-cur-tab'] });
        }
        function remove() {
            clearTimeout(timer); clearTimeout(scrollT); clearTimeout(watchT);
            if (raf) cancelAnimationFrame(raf);
            raf = 0; shown = false; air = null; mv = null;
            if (mo) { mo.disconnect(); mo = null; }
            if (ro) { ro.disconnect(); ro = null; }
            W.removeEventListener('resize', onResize);
            W.removeEventListener('scroll', onScroll, { capture: true });
            if (c3want && c3want.e === btn) want3d(null);
            if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
            btn = null;
        }
        return { spawn: spawn, remove: remove };
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
