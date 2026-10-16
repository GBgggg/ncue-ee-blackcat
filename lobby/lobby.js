/* ==========================================================
 * 大廳：賽博龐克的夜街，五塊招牌＝五個小黑貓（2026-10-16）
 *
 * 從外面打開首頁時，先出現一條 Blender 算好的夜街。街上掛著五塊招牌（五個產品），
 * 地上坐著一隻黑貓。點一塊招牌：貓跳上去抓住、跟著招牌左右晃，
 * 晃到那個產品載好；載好之後招牌掉下去，順勢把整條街撕成兩半，後面就是那個產品。
 *
 * 為什麼這樣做（細節在 架構.md「大廳：夜街、招牌與黑貓」）：
 *   - **預先算圖分層，不在網頁裡跑 3D。** 背景、招牌、貓的每一格都是 Blender 算好的圖，
 *     網頁只負責疊起來動。跑 three.js 要多下載好幾 MB，大廳自己就要先等它——
 *     而大廳存在的理由正是「等的時候有東西看」。跟寵物不用 Godot 是同一個判斷。
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
    /* 貓可以留下來的產品。其他三頁是整個畫面拿來工作的（寫字、拉線、排版），
       角落多一隻會動的東西只會擋路。 */
    var HOMES = { cat: 1, ncue: 1 };

    /* ---- 場景座標：從 Blender 的攝影機投影出來的（tools/lobby/README.md）----
       背景圖用 object-fit: cover 鋪滿畫面，所以這裡存的是「在原圖上的比例位置」，
       執行時再換算成螢幕座標。改了 Blender 的攝影機或招牌位置，這張表要跟著重算。
       招牌：[x, y, 高]——x、y 是掛勾（招牌上緣中間）在圖上的位置，高是招牌高度佔圖高的比例。
       貓：  [x, y, 高]——x、y 是貓腳底中間。 */
    var SCENE = {
        wide: { src: 'street-wide.webp', w: 1920, h: 1080,
                signs: { cat: [0.2152, 0.0664, 0.3639], ncue: [0.7189, 0.0697, 0.3277],
                         md: [0.3318, 0.2165, 0.2150], spice: [0.6308, 0.2116, 0.1962], doc: [0.3832, 0.2756, 0.1491] },
                cat: [0.4865, 0.8756, 0.1955] },
        tall: { src: 'street-tall.webp', w: 1080, h: 1920,
                signs: { cat: [0.2200, 0.0500, 0.2349], ncue: [0.7800, 0.1300, 0.2094],
                         md: [0.3700, 0.2500, 0.1641], spice: [0.6300, 0.2700, 0.1444], doc: [0.5000, 0.3300, 0.1067] },
                cat: [0.5000, 0.7182, 0.1578] }
    };
    /* 招牌圖的寬 ÷ 高（sign-*.webp，408×1170）。圖的上緣就是掛勾，含 0.3m 的鏈子＋3.6m 的板子；
       寬度比板子多留兩側各 8cm 給霓虹的光暈，所以不是 1.2 ÷ 3.9。 */
    var SIGN_ASPECT = 408 / 1170;
    /* 貓掛在招牌上時的大小＝招牌高 × 這個比例。
       照透視算應該是 0.8 ÷ 3.9（序列圖一格 0.8m 見方，招牌含鏈子 3.9m），但那樣掛上去只剩
       指甲大，手機上根本看不出是貓。刻意放大成差不多跟招牌一樣寬：看得清楚比透視正確重要。 */
    var CAT_PER_SIGN = 0.34;

    /* 貓的序列圖：cat-<動作>.webp，一張橫條，每格正方形。[格數, 一輪幾秒] */
    var CAT = {
        idle:  [12, 1.80],   // 坐著，尾巴甩、眨眼
        jump:  [8,  0.54],   // 蹲 → 撲 → 伸手
        hang:  [8,  0.81],   // 前腳抓著，後腳踢
        land:  [6,  0.36],   // 落地（也是摸牠的時候那一下跳）
        sleep: [8,  2.88]    // 捲起來睡
    };

    var reduce = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var touch  = !!(W.matchMedia && W.matchMedia('(pointer: coarse) and (hover: none)').matches);

    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function within(p, ms) { return Promise.race([p, wait(ms)]); }
    function catStays() { try { return localStorage.getItem(CAT_KEY) !== 'away'; } catch (e) { return true; } }
    function signOf(k) { for (var i = 0; i < SIGNS.length; i++) if (SIGNS[i][0] === k) return SIGNS[i]; return null; }

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
    var root, half, scene, top, hud, catEl, bgImg, lay, picked = false, done = false;
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

    function setSprite(e, name, once) {
        var a = CAT[name];
        e.style.backgroundImage = 'url(' + DIR + 'cat-' + name + '.webp)';
        e.style.setProperty('--frames', a[0]);
        e.style.setProperty('--dur', a[1] + 's');
        e.classList.toggle('once', !!once);
        e.classList.toggle('hang', name === 'hang');
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
        lay = pickLayout();
        H.style.setProperty('--lb-bg', 'url(' + DIR + SCENE[lay].src + ')');
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
        setSprite(catEl, 'idle');

        hud = el('div', 'lb-hud', root);
        hud.textContent = mode === 'arrive' ? '連線中' : '選一家店走進去';
        top = el('div', 'lb-top', root);

        D.body.appendChild(root);
        H.classList.add('lobby-built');
        layout();
        W.addEventListener('resize', layout);

        /* ★ 不主動把焦點放到招牌上：開站時的程式聚焦在 Chrome 會被當成鍵盤焦點，
             第一塊招牌一進來就套著一圈虛線框。招牌是 <button>，按 Tab 就到得了。 */
        if (mode === 'arrive') arrive(PAGE);
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
            if (!b || !p || b.parentNode === top) return;
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
        } else if (catEl && catEl.parentNode && catEl.parentNode.className === 'lb-grip') {
            var host = catEl.parentNode.parentNode, hp = S.signs[host.dataset.k];
            if (hp) catEl.style.setProperty('--size', (hp[2] * m.ih * CAT_PER_SIGN) + 'px');
        }
    }

    var prefetched = {};
    function prefetch(href) {
        if (prefetched[href]) return;
        prefetched[href] = 1;
        try { var l = D.createElement('link'); l.rel = 'prefetch'; l.href = href; D.head.appendChild(l); } catch (e) {}
    }

    /* ---- 點了一塊招牌 ---- */
    function pick(k) {
        if (picked || done) return;
        var s = signOf(k);
        if (!s || (s[3] && touch)) return;
        picked = true;
        root.classList.add('picked');
        arm();
        if (k !== PAGE) prefetch(s[2]);

        if (reduce) {   // 減少動態：不跳不晃，選了就走
            if (k === PAGE) within(readyP, 20000).then(fadeOut);
            else go(s);
            return;
        }
        jumpTo(signEls[k]).then(function () {
            if (k === PAGE) Promise.all([within(readyP, 20000), wait(900)]).then(function () { tear(k); });
            else wait(480).then(function () { go(s); });
        });
    }

    /* 交棒：記下要去哪、換頁。新的那一頁在 arrive() 接手。 */
    function go(s) {
        try { sessionStorage.setItem(HAND_KEY, JSON.stringify({ to: s[0], at: Date.now() })); } catch (e) {}
        location.href = s[2];
    }

    /* 貓沿著拋物線跳到招牌底下、抓住。
       一律用 WAAPI 的 transform 移動，不動 left/top——那樣每一格都要重排版。 */
    function jumpTo(sign) {
        var grip = sign.querySelector('.lb-grip');
        var cr = catEl.getBoundingClientRect(), gr = grip.getBoundingClientRect();
        var size = cr.width;
        var sx = cr.left + size / 2, sy = cr.top + size * 0.12;   // 起點：貓的「手」大概在頭頂
        var ex = gr.left, ey = gr.top;
        var dx = ex - sx, dy = ey - sy;
        var peak = Math.min(sy, ey) - W.innerHeight * 0.12 - sy;   // 頂點比招牌底再高一點
        var flip = dx < 0 ? -1 : 1;
        /* 招牌比貓遠，抓上去之後要變小（見 CAT_PER_SIGN）。縮放的軸心放在「手」的位置
           （上緣往下 12%），這樣縮放不會把手拉離拋物線，落點才會剛好是抓點。 */
        var hp = SCENE[lay].signs[sign.dataset.k];
        var k = hp ? (hp[2] * mapper().ih * CAT_PER_SIGN) / size : 1;
        catEl.style.transformOrigin = '50% 12%';
        var frames = [];
        for (var i = 0; i <= 12; i++) {
            var t = i / 12;
            /* 二次貝茲：起點 → 控制點（水平中點、頂點高度）→ 終點。
               控制點的 y 取 2×peak − 端點平均，曲線的最高點才會剛好碰到 peak。 */
            var cy = 2 * peak - dy / 2;
            var x = dx * t;
            var y = 2 * (1 - t) * t * cy + t * t * dy;
            var sc = 1 + (k - 1) * t;
            frames.push({ transform: 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (flip * sc).toFixed(3) + ',' + sc.toFixed(3) + ')' });
        }
        setSprite(catEl, 'jump', true);
        var a = catEl.animate(frames, { duration: 620, easing: 'linear', fill: 'forwards' });
        return a.finished.then(function () {
            a.cancel();
            catEl.style.left = catEl.style.top = catEl.style.transformOrigin = '';
            grip.appendChild(catEl);
            layout();   // 換成掛在招牌上的大小
            setSprite(catEl, 'hang');
            sign.classList.add('chosen', 'kick');
            hud.textContent = '連線中';
        }, function () {});
    }

    /* 新的那一頁接手：同一條街、同一塊招牌、貓已經掛在上面晃。 */
    function arrive(k) {
        picked = true;
        arm();
        root.classList.add('picked');
        var sign = signEls[k];
        sign.querySelector('.lb-grip').appendChild(catEl);
        catEl.style.left = catEl.style.top = '';
        setSprite(catEl, 'hang');
        sign.classList.add('chosen');
        layout();
        var fuse = PAGE === 'doc' ? 12000 : 20000;   // 文書的編輯器第一次要抓十幾 MB，別讓人一直看貓晃
        Promise.all([within(readyP, fuse), wait(reduce ? 0 : 600)]).then(function () {
            if (reduce) fadeOut(); else tear(k);
        });
    }

    function fadeOut() {
        root.classList.add('fade');
        setTimeout(function () { finish(); if (HOMES[PAGE] && catStays()) Companion.spawn(); }, 300);
    }

    /* ---- 招牌掉下去，把街撕成兩半 ----
       撕的位置就是那塊招牌掛的地方，裂縫從上往下張開：
       左半邊以左下角為軸往左倒、右半邊以右下角為軸往右倒——
       上面先裂開、下面最後才分開，看起來就是招牌掉下去一路扯開的。 */
    function tear(k) {
        if (done) return;
        var sign = signEls[k];
        var vw = W.innerWidth, vh = W.innerHeight;
        var sr = sign.getBoundingClientRect();
        var tx = sr.left + sr.width / 2;

        /* 1. 招牌與貓搬到最上層，不跟著場景被剪開。先把晃到一半的角度凍住。 */
        var rot = getComputedStyle(sign).rotate;
        sign.style.rotate = (rot && rot !== 'none') ? rot : '0deg';
        sign.classList.remove('chosen', 'kick');
        sign.style.animation = 'none';
        top.appendChild(sign);
        var cr = catEl.getBoundingClientRect();
        top.appendChild(catEl);
        catEl.style.left = cr.left + 'px';
        catEl.style.top = cr.top + 'px';
        catEl.style.rotate = '0deg';
        catEl.classList.remove('hang');

        /* 2. 一模一樣的另一半，各剪一邊。裂縫是一條鋸齒線。 */
        var right = half.cloneNode(true);
        root.insertBefore(right, top);
        var pts = [], n = 16;
        for (var i = 0; i <= n; i++) {
            var jit = i === 0 ? 0 : (Math.random() - 0.5) * Math.min(28, vw * 0.035);
            pts.push([tx + jit, (vh * i) / n]);
        }
        var seam = pts.map(function (p) { return p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px'; });
        scene.style.clipPath = 'polygon(0 0, ' + seam.join(', ') + ', 0 ' + vh + 'px)';
        right.firstChild.style.clipPath = 'polygon(' + vw + 'px 0, ' + seam.join(', ') + ', ' + vw + 'px ' + vh + 'px)';
        /* 複製出來的那一半上面還有一份貓與招牌的空位、按鈕，全部拿掉，只留畫。 */
        Array.prototype.forEach.call(right.querySelectorAll('button'), function (b) { b.tabIndex = -1; b.disabled = true; });
        root.classList.add('tearing');

        /* 3. 招牌掉下去（加速：重力）。 */
        var spin = (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 14);
        var fall = sign.animate([
            { transform: 'translate(0,0)' },
            { transform: 'translate(' + (spin * 0.8).toFixed(0) + 'px,' + (vh * 1.15).toFixed(0) + 'px) rotate(' + spin.toFixed(0) + 'deg)' }
        ], { duration: 720, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' });

        /* 4. 兩半往外倒、掉出畫面。比招牌晚 90ms 起步：先看到招牌鬆手，才看到裂開。 */
        var ease = 'cubic-bezier(0.4, 0, 1, 1)';
        var L = half.animate([
            { transform: 'none', opacity: 1 },
            { transform: 'translate(-6vw, 2vh) rotate(-5deg)', opacity: 1, offset: 0.45 },
            { transform: 'translate(-70vw, 35vh) rotate(-18deg)', opacity: 0 }
        ], { duration: 900, delay: 90, easing: ease, fill: 'forwards' });
        half.style.transformOrigin = '0 100%';
        right.style.transformOrigin = '100% 100%';
        var R = right.animate([
            { transform: 'none', opacity: 1 },
            { transform: 'translate(6vw, 2vh) rotate(5deg)', opacity: 1, offset: 0.45 },
            { transform: 'translate(70vw, 35vh) rotate(18deg)', opacity: 0 }
        ], { duration: 900, delay: 90, easing: ease, fill: 'forwards' });
        if (hud) hud.style.opacity = '0';

        /* 5. 貓鬆手：留下來的話跳到左下角變成陪伴的那隻；不留就往旁邊跳走。 */
        var stay = HOMES[PAGE] && catStays();
        var catDone = stay ? catToCorner() : catAway(tx < vw / 2 ? -1 : 1);

        Promise.all([fall.finished, L.finished, R.finished, catDone]).catch(function () {}).then(function () {
            finish();
            if (stay) Companion.spawn(true);
        });
    }

    function catToCorner() {
        var cr = catEl.getBoundingClientRect();
        var t = Companion.target();   // {x, y, size}：左下角那隻的位置（左上角座標）
        var k = t.size / cr.width;
        var dx = t.x - cr.left, dy = t.y - cr.top;
        /* 先往上彈一下再落到角落：從招牌上「跳下來」，不是滑過去。 */
        var up = -W.innerHeight * 0.08;
        setSprite(catEl, 'jump', true);
        catEl.style.transformOrigin = '0 0';
        var a = catEl.animate([
            { transform: 'translate(0,0) scale(1)' },
            { transform: 'translate(' + (dx * 0.35).toFixed(0) + 'px,' + up.toFixed(0) + 'px) scale(' + ((1 + k) / 2).toFixed(3) + ')', offset: 0.35 },
            { transform: 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px) scale(' + k.toFixed(3) + ')' }
        ], { duration: 760, easing: 'cubic-bezier(0.3, 0, 0.7, 1)', fill: 'forwards' });
        return a.finished;
    }

    function catAway(dir) {
        setSprite(catEl, 'jump', true);
        var a = catEl.animate([
            { transform: 'translate(0,0) scaleX(' + dir + ')', opacity: 1 },
            { transform: 'translate(' + (dir * W.innerWidth * 0.18).toFixed(0) + 'px,' + (-W.innerHeight * 0.1).toFixed(0) + 'px) scaleX(' + dir + ')', opacity: 1, offset: 0.4 },
            { transform: 'translate(' + (dir * W.innerWidth * 0.6).toFixed(0) + 'px,' + (W.innerHeight * 0.5).toFixed(0) + 'px) scaleX(' + dir + ')', opacity: 0 }
        ], { duration: 820, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
        return a.finished;
    }

    /* ======================================================
     * 留在畫面上的那隻（小黑貓、彰師電子，設定裡可以關）
     *
     * ★ 不只是「大廳之後」才有：直接打開彰師電子、或站內換頁回來，牠也在。
     *   設定寫的是「黑貓留在畫面上」，使用者會期待牠一直在，而不是只有進站那一次。
     * ★ 位置在左下角：右下角是「回到頂端」與吐司的地盤。手機上要墊在底部分頁列上面。
     * ====================================================== */
    var Companion = (function () {
        var btn = null, timer = 0, bubbleT = 0;
        var SIZE = 68;
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
            btn.style.display = H.classList.contains('kb-open') ? 'none' : '';
        }
        function idleLoop() {
            clearTimeout(timer);
            if (!btn || reduce || H.classList.contains('fx-lite')) return;
            setSprite(btn, 'idle');
            /* 偶爾睡一下：18～40 秒之後捲起來睡 12 秒。 */
            timer = setTimeout(function () {
                if (!btn) return;
                setSprite(btn, 'sleep');
                timer = setTimeout(idleLoop, 12000);
            }, 18000 + Math.random() * 22000);
        }
        function poke() {
            if (!btn) return;
            clearTimeout(timer);
            if (!reduce && !H.classList.contains('fx-lite')) {
                setSprite(btn, 'land', true);
                timer = setTimeout(idleLoop, CAT.land[1] * 1000 + 60);
            }
            var b = btn.querySelector('.bc-bubble');
            b.textContent = LINES[Math.floor(Math.random() * LINES.length)];
            btn.classList.add('talk');
            clearTimeout(bubbleT);
            bubbleT = setTimeout(function () { if (btn) btn.classList.remove('talk'); }, 1600);
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
            if (fromLobby && !reduce) { setSprite(btn, 'land', true); timer = setTimeout(idleLoop, CAT.land[1] * 1000 + 60); }
            else { setSprite(btn, 'idle'); idleLoop(); }
            if (reduce || H.classList.contains('fx-lite')) btn.style.backgroundPosition = '0 0';
            W.addEventListener('resize', place);
            /* <html> 的 class 會因為很多事變（鍵盤彈出、分頁列搬家、深淺色）。
               位置每次都重算，但動作只在「省電」被切換時才重來——不然每變一次 class
               貓就從第一格重播，看起來像一直抽搐。 */
            var lite = H.classList.contains('fx-lite');
            new MutationObserver(function () {
                place();
                var now = H.classList.contains('fx-lite');
                if (now !== lite) { lite = now; idleLoop(); if (now && btn) btn.style.backgroundPosition = '0 0'; }
            }).observe(H, { attributes: true, attributeFilter: ['class'] });
        }
        function remove() {
            clearTimeout(timer);
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
