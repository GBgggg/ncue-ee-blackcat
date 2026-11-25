/* ==========================================================
 * 城市背景：8 層的夜城（深色）／白天的城（淺色），捲動像坐觀景電梯（2026-11-25）
 *
 * 只有主站與彰師電子載這支（publicnew.html 的 <head>；ncue.html 是產生檔，跟著來）。
 * 取代原本 #cyberCanvas 用程式即時畫的天際線：
 *   - 背景是 Gemini 畫、放大兩倍、去背的 8 層圖（lobby/city/），由遠到近：
 *       天空 → 雲 → 遠霧 → 遠樓 → 主塔 → 街區 → 近樓 → 電線燈泡。
 *     越近的層捲得越多（EX），就是視差。街區、近樓兩層左右兩半各自貼齊螢幕邊（split），
 *     中間是空的，內容欄後面看得到主塔。
 *   - 往下捲＝電梯往下：背景不直接貼著捲軸，用 requestAnimationFrame 平順追上
 *     （起步慢、中段有速度上限、停靠前減速），兩側光軌的刻度掠過、樓層顯示一路跳。
 *   - 底部的水泥女兒牆就是分頁列（#navDock）：電腦也一起搬到底部（placeNav 看 html.city-wall），
 *     分頁按鈕是掛在牆上的霓虹招牌。牆頂＝主頁那隻貓的地板（lobby.js 的 bottom()）。
 *
 * ★ 為什麼是普通 script、放在 <head>：跟 lobby.js 同一個理由——它跟登入、資料無關，
 *   主站的 module 要等 Firebase，背景不該跟著等；也因此碰不到 module 的任何狀態（CLAUDE.md 第一條）。
 * ★ 圖沒到之前，舊的畫布天際線照常畫（它就是降級路徑）。天空那一層載好才掛 html.city-on，
 *   畫布看到這個 class 就停（publicnew.html 的 cyberSky 那段 off()）。
 * ★ 兩道門跟站上其他特效一樣：系統「減少動態」、設定裡的「特效：省電」（html.fx-lite）
 *   → 背景完全不動（不視差、不慣性、光軌不跑），只留一張靜止的城市。
 * ★ 圖不進 sw.js 的 CORE：兩套（夜／日）× 兩種比例（電腦／手機）約 8MB，每個人只會用到其中一套約 2MB。
 *   離線抓不到就留在畫布天際線，不會壞。
 * ========================================================== */
(function () {
    'use strict';
    var D = document, W = window, H = D.documentElement;
    if (W.top !== W.self) return;   // 被套進 iframe（測試頁）就不做
    /* ?nosky：關背景的除錯參數（舊畫布天際線也認它）。分頁列也留在原本的位置。 */
    try { if (new URLSearchParams(location.search).has('nosky')) return; } catch (e) {}

    var DIR = 'lobby/city/';
    /* [檔名, 多出的捲動量（視窗高的比例）, 左右兩半各自貼邊, 慢慢飄]。圖由遠到近。 */
    var LAYERS = [['1_sky', 0], ['2_cloud', 0.02, 0, 1], ['3_haze', 0.04], ['4_far', 0.06],
                  ['5_tower', 0.09], ['6_mid', 0.13, 1], ['7_near', 0.18, 1], ['8_hang', 0.26]];
    var SZ = { d: [2752, 1536], p: [1536, 2752] };   // 電腦版／手機版的圖寬高（每一層一樣大）
    var TOPF = 60, FH = 4, PER = 110;                // 樓層數、每層幾公尺（只是顯示用）、光軌上每層刻度間距 px

    H.classList.add('city-wall');   // ★ 要在主站 module 的 placeNav() 第一次跑之前掛上（這支在 <head>，一定比較早）

    var calm = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    function still() { return calm.matches || H.classList.contains('fx-lite'); }
    function night() { return H.classList.contains('dark'); }
    function kind() { return (innerWidth / innerHeight < 0.8 || innerWidth < 700) ? 'p' : 'd'; }

    var els = [], rails = [], tracks = [], hud = null, fn = null, spd = null, alt = null;
    var cur = 0, target = 0, raf = 0, lastT = 0, lastF = -1, moving = false, k = '', th = '';

    function build() {
        var sky = D.getElementById('cyberSky');
        if (!sky) return false;
        var box = D.createElement('div'); box.id = 'cityBg'; box.setAttribute('aria-hidden', 'true');
        LAYERS.forEach(function (L) {
            var parts = [];
            (L[2] ? ['l', 'r'] : ['c']).forEach(function (side) {
                var e = D.createElement('div');
                e.className = 'city-lay' + (L[2] ? ' half ' + side : '') + (L[3] ? ' sway' : '');
                box.appendChild(e); parts.push(e);
            });
            els.push({ name: L[0], ex: L[1], split: !!L[2], parts: parts, h: 0 });
        });
        /* 內容欄後面墊一層半透明的底（跟舊畫布的 veil 同一個理由：直接寫在底上的小字會壓在亮著的招牌上）。 */
        var veil = D.createElement('div'); veil.id = 'cityVeil'; box.appendChild(veil);
        /* 兩側光軌：每層一條刻度、每 5 層標樓層數。 */
        ['l', 'r'].forEach(function (side) {
            var r = D.createElement('div'); r.className = 'city-rail ' + side;
            var t = D.createElement('div'); t.className = 'city-track';
            var s = '';
            for (var i = 0; i < TOPF; i++) {
                var f = TOPF - i;
                s += '<div class="city-tick' + (f % 5 ? '' : ' big') + '" data-f="' + f + '" style="top:' + (i * PER) + 'px"><span>' + (f % 5 ? '' : f + 'F') + '</span></div>';
            }
            t.innerHTML = s; r.appendChild(t); box.appendChild(r); rails.push(r); tracks.push(t);
        });
        sky.appendChild(box);
        return true;
    }

    /* 樓層面板：掛在牆（#navDock）上。主站 module 之後會把 #mainNav 搬進同一個 #navDock，兩個互不干擾。 */
    function buildHud() {
        var dock = D.getElementById('navDock');
        if (!dock || D.getElementById('cityHud')) return;
        hud = D.createElement('div'); hud.id = 'cityHud'; hud.setAttribute('aria-hidden', 'true');
        hud.innerHTML = '<span class="big"><b>60</b><small>F</small></span>' +
            '<span class="row"><span class="chev"><i>▼</i><i>▼</i><i>▼</i></span><span class="spd">0.0 m/s</span></span>' +
            '<span class="row alt">ALT 240.0 m</span>';
        dock.appendChild(hud);
        fn = hud.querySelector('b'); spd = hud.querySelector('.spd'); alt = hud.querySelector('.alt');
    }

    /* 換圖：深淺色或比例變了才換。天空那層載好才掛 city-on（之前畫布天際線還在畫）。 */
    function setImages() {
        var nk = kind(), nt = night() ? '' : '_day';
        if (nk === k && nt === th) return;
        k = nk; th = nt;
        /* 牆上招牌的圖（熄燈／點亮）先抓：不然第一次切分頁時亮起來那塊會空白一下。 */
        (th ? ['day', 'day_on'] : ['off', 'on_cyan', 'on_mag', 'on_yel', 'on_grn', 'on_org']).forEach(function (n) { new Image().src = DIR + 'sign-' + n + '.webp'; });
        els.forEach(function (L, i) {
            var url = DIR + k + L.name + th + '.webp';
            var img = new Image();
            img.onload = function () {
                if (url !== DIR + k + L.name + th + '.webp') return;   // 已經又換成別套了
                L.parts.forEach(function (e) { e.style.backgroundImage = 'url(' + url + ')'; e.classList.add('in'); });
                if (i === 0) H.classList.add('city-on');
            };
            img.src = url;
        });
    }

    function layout() {
        if (!els.length) return;
        setImages();
        var S = SZ[k], vw = innerWidth, vh = innerHeight;
        els.forEach(function (L) {
            var s = Math.max(vw / S[0], vh * (1 + L.ex) / S[1]), w = S[0] * s, h = S[1] * s;
            L.h = h;
            L.parts.forEach(function (e, j) {
                e.style.backgroundSize = w + 'px ' + h + 'px';
                e.style.height = h + 'px';
                e.style.backgroundPosition = L.split ? (j ? 'right top' : 'left top') : 'center top';
                if (L.split) e.style.width = Math.min(w / 2, vw / 2) + 'px';
            });
        });
        move();
    }

    function progress() {
        var max = Math.max(D.documentElement.scrollHeight, D.body ? D.body.scrollHeight : 0) - innerHeight;
        return max > 0 ? Math.min(1, Math.max(0, (W.scrollY || W.pageYOffset || 0) / max)) : 0;
    }

    function draw(p, v) {
        var vh = innerHeight, q = still() ? 0 : p;   // 省電／減少動態：整張不動
        for (var i = 0; i < els.length; i++) {
            var L = els[i], y = -(L.h - vh) * q;
            for (var j = 0; j < L.parts.length; j++) L.parts[j].style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
        }
        var fpos = p * (TOPF - 1);
        for (var t = 0; t < tracks.length; t++) tracks[t].style.transform = 'translate3d(0,' + (vh * 0.45 - fpos * PER).toFixed(1) + 'px,0)';
        var f = Math.max(1, Math.round(TOPF - fpos));
        if (f !== lastF) {
            if (fn) fn.textContent = (f < 10 ? '0' : '') + f;
            D.querySelectorAll('.city-tick.now').forEach(function (x) { x.classList.remove('now'); });
            D.querySelectorAll('.city-tick[data-f="' + f + '"]').forEach(function (x) { x.classList.add('now'); });
            lastF = f;
        }
        if (alt) alt.textContent = 'ALT ' + ((TOPF - fpos) * FH).toFixed(1) + ' m';
        /* 實際算出來的速度是一百多 m/s（一秒多走完 60 層），顯示成接近真實電梯的數字（最高 18 m/s）。 */
        if (spd) spd.textContent = Math.min(18, Math.abs(v) * 0.1).toFixed(1) + ' m/s';
    }

    function setMoving(m, up) {
        if (hud) hud.classList.toggle('up', !!up);
        if (m === moving) return;
        moving = m;
        if (hud) hud.classList.toggle('mv', m);
        rails.forEach(function (r) { r.classList.toggle('mv', m); });
        if (!m && hud) { hud.classList.remove('ding'); void hud.offsetWidth; hud.classList.add('ding'); }   // 到站閃一下
    }

    function tick(t) {
        var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60; lastT = t;
        var d = target - cur;
        /* 電梯：每格最多走剩下距離的 9%、上限 0.012（整頁進度）→ 起步、等速、停靠前減速。 */
        var step = (d > 0 ? 1 : -1) * Math.min(Math.abs(d) * 0.09, 0.012);
        var prev = cur;
        cur = Math.abs(d) < 0.0004 ? target : cur + step;
        draw(cur, (cur - prev) * (TOPF - 1) * FH / dt);
        setMoving(cur !== target, d < 0);
        if (cur !== target) raf = requestAnimationFrame(tick);
        else { raf = 0; lastT = 0; if (spd) spd.textContent = '0.0 m/s'; }
    }

    function move() {
        target = progress();
        if (still()) { cur = target; draw(cur, 0); setMoving(false); return; }
        if (!raf) raf = requestAnimationFrame(tick);
    }

    function start() {
        if (!build()) return;
        buildHud();
        layout();
        W.addEventListener('scroll', move, { passive: true });
        W.addEventListener('resize', layout);
        /* 換深淺色（html.dark）、特效開關（html.fx-lite）：換圖、重畫一次。 */
        new MutationObserver(function () { layout(); }).observe(H, { attributes: true, attributeFilter: ['class'] });
        if (calm.addEventListener) calm.addEventListener('change', layout);
        /* 換分頁時頁面高度會變（捲軸位置也會被拉回頂端）：量一次，電梯會自己開回去。 */
        if (W.ResizeObserver && D.body) new ResizeObserver(function () { move(); }).observe(D.body);
    }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
