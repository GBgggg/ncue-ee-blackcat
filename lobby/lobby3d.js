/* ==========================================================
 * 即時 3D 的黑貓（2026-10-16 晚）
 *
 * lobby.js 的序列圖貓還在，而且**所有走位都還是它在做**（跳上招牌的拋物線、掛著晃、撕開時跳到角落、
 * 角落那隻的散步）。這支只負責「把那個格子換成一隻即時算的 3D 貓」：
 * 每一格讀格子在螢幕上的位置、大小、正在播哪個動作，讓 3D 貓站在同一個地方做同一件事。
 * 這樣做的理由：
 *   - 3D 載不起來（舊手機沒有 WebGL2、網路慢、檔案抓不到）的時候，序列圖貓本來就在，什麼都不用退。
 *   - 走位邏輯只有一份。兩份的話，哪天改了跳躍的高度只改到一邊，3D 貓會跳到招牌旁邊的空氣上。
 *
 * 遊戲感來自三件事：每秒 60 格（動作之間 AnimationMixer 平滑混接，不是一格一格換圖）、
 * 走路時轉身面向前進方向、頭會轉向滑鼠／手指。
 *
 * 毛是遊戲常用的「分層毛皮」（shell fur）：同一個網格往外多畫 16 層，每層用雜訊挖掉更多洞，
 * 疊起來就是一根根往外的毛。毛的方向與長度是 Blender 算好、存在頂點顏色裡的
 * （RGB＝梳毛方向、A＝長度），跟預算圖那隻用的是同一份設定。
 *
 * 這支是 module，由 lobby.js 插一個 <script type="module"> 載入，載好後發 blackcat:3d 事件。
 * 不用 import()：那是語法，舊瀏覽器在解析 lobby.js 時就會整支壞掉，連序列圖貓都沒了。
 * ========================================================== */
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

/* 毛的層數：手機少一點（每一層都是整隻貓再畫一次）。 */
const SHELLS = matchMedia('(pointer: coarse)').matches ? 10 : 16;
const FUR_LEN = 0.019;            // 公尺；跟 Blender 的毛一樣長
const FRAME_M = 0.8;              // 序列圖一格代表 0.8m 見方
const GROUND = 0.025;             // 序列圖裡地面在格子底往上 2.5% 的地方（Blender 的 CatCam 量的）
const TILT = THREE.MathUtils.degToRad(8);   // CatCam 往下看 8°
const PINK = new THREE.Color('#ff2a6d'), CYAN = new THREE.Color('#00d8ff');
const RIM = { value: 1 };   // 邊光強度（所有毛層共用一個）

/* 每個動作預設面向哪裡（度）：0＝正對畫面，正的往畫面右邊轉。
   坐著的那幾個照序列圖（Blender 裡轉 200°＝往右偏 20°）；走路與跳改成真的側身。 */
const FACE = { idle: 20, look: 20, groom: 20, lie: 25, liedown: 20, sleep: 25, land: 20, stand: 20, walk: 80, jump: 90, hang: 0 };
const LOOKS = { idle: 1, look: 1, lie: 1, land: 1 };   // 這幾個動作頭可以轉去看游標

function furMaterial(skinned, h) {
    /* 鏡面反射壓低（specularIntensity）：毛層從側面看全是「掠射角」，標準材質在那裡反光接近 100%，
       背後的粉紅燈會把趴著的貓整片背照成紅的。 */
    const m = new THREE.MeshPhysicalMaterial({ color: 0x0d0c10, roughness: 0.8, metalness: 0, specularIntensity: 0.15 });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uH = { value: h };
        sh.uniforms.uLen = { value: FUR_LEN };
        sh.uniforms.uPink = { value: PINK };
        sh.uniforms.uCyan = { value: CYAN };
        sh.uniforms.uRim = RIM;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>
                attribute vec4 color;
                uniform float uH; uniform float uLen;
                varying vec3 vRest; varying float vL;`)
            .replace('#include <skinning_vertex>', `#include <skinning_vertex>
                {
                    // 頂點顏色存的是 Blender 座標（Z 朝上）的梳毛方向，換成 glTF 的 Y 朝上
                    vec3 cb = color.rgb * 2.0 - 1.0;
                    vec3 comb = vec3(cb.x, cb.z, -cb.y);
                    #ifdef USE_SKINNING
                        comb = (skinMatrix * vec4(comb, 0.0)).xyz;
                    #endif
                    float L = color.a * 1.4 * uLen;
                    transformed += (normalize(objectNormal) * 0.8 + comb * (0.25 + uH)) * uH * L;
                    vRest = position; vL = color.a;
                }`);
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform vec3 uPink; uniform vec3 uCyan; uniform float uH; uniform float uRim;
                varying vec3 vRest; varying float vL;
                float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`)
            .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
                if (uH > 0.0) {
                    if (vL < 0.02) discard;                       // 內耳之類不長毛的地方
                    // 一根毛＝一個小格子；越外層留下來的毛越少、越細
                    vec3 p = vRest * 520.0;
                    vec3 c = floor(p); vec3 f = fract(p) - 0.5;
                    float r = h13(c);
                    vec3 j = (vec3(h13(c + 7.1), h13(c + 3.3), h13(c + 5.7)) - 0.5) * 0.5;
                    float d = length(f + j);
                    float rad = 0.62 * (1.0 - uH) * (0.55 + 0.6 * r);
                    float cov = smoothstep(rad, rad - 0.14, d) * step(uH, 0.3 + 0.8 * r);
                    // ★ 硬切，不用半透明：畫布是透明背景，半透明的毛尖會讓底下的街景「加亮」透上來，
                    //   整隻貓泛粉紅（alphaToCoverage 也一樣，寫進畫布的 alpha 還是小於 1）
                    if (cov < 0.45) discard;
                }`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                // 毛根暗、毛尖亮一點（毛之間互相遮光）
                diffuseColor.rgb *= mix(0.4, 1.3, uH);`)
            .replace('#include <opaque_fragment>', `
                // 霓虹的邊光：畫面左邊的輪廓偏粉、右邊偏青（跟預算圖那隻、跟夜街的燈一致）
                vec3 vn = normalize(normal);
                // 只算朝左右的輪廓：背、頭頂朝上的面不算，不然趴著的貓整片背都會發光
                float fres = pow(1.0 - clamp(abs(vn.z), 0.0, 1.0), 5.0) * smoothstep(0.35, 0.9, abs(vn.x)) * (1.0 - smoothstep(0.0, 0.5, vn.y));
                vec3 rim = vn.x < 0.0 ? uPink : uCyan;
                outgoingLight += rim * fres * (0.05 + 0.25 * uH) * uRim;
                #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'catfur' + (skinned ? 's' : 'm') + (h > 0 ? 'h' : 'b');
    return m;
}

class Cat3D {
    constructor(gltf) {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'lb-cat3d';
        this.canvas.setAttribute('aria-hidden', 'true');
        const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.setClearColor(0x000000, 0);
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
        this.camera.position.z = 1000;
        // 燈：柔和的主光＋後方兩盞霓虹（粉、青）＋很暗的環境光（夜街的顏色）
        this.scene.add(new THREE.HemisphereLight(0x8a7fb0, 0x1a1020, 0.5));
        const key = new THREE.DirectionalLight(0xfff1e6, 1.6); key.position.set(0.6, 1.0, 1.2); this.scene.add(key);
        const p1 = new THREE.DirectionalLight(PINK, 0.5); p1.position.set(-1.0, 0.12, -0.5); this.scene.add(p1);
        const p2 = new THREE.DirectionalLight(CYAN, 0.45); p2.position.set(1.0, 0.08, -0.5); this.scene.add(p2);

        this.tilt = new THREE.Group(); this.tilt.rotation.x = TILT;
        this.turn = new THREE.Group(); this.tilt.add(this.turn);
        this.scene.add(this.tilt);
        const root = gltf.scene; this.turn.add(root);
        this.mixer = new THREE.AnimationMixer(root);
        this.clips = {};
        for (const c of gltf.animations) this.clips[c.name.replace(/^cat_/, '')] = c;
        this.actions = {};
        this.head = null; this.neck = null; this.eyes = [];
        root.traverse((o) => {
            if (o.isBone && o.name === 'head') this.head = o;
            if (o.isBone && o.name === 'neck') this.neck = o;
            if (/^Cat3D(Iris|Cornea|Eye)_/.test(o.name)) this.eyes.push(o);
            if (o.isMesh) o.frustumCulled = false;
        });
        this.eyeScale = this.eyes.map((o) => o.scale.clone());
        this.buildFur(root);
        // 地上的影子：一片放射漸層的圓
        const sc = document.createElement('canvas'); sc.width = sc.height = 64;
        const g = sc.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
        gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
        this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.002; this.shadow.renderOrder = -1;
        this.tilt.add(this.shadow);

        this.yaw = THREE.MathUtils.degToRad(20);
        this.cur = null; this.curKey = '';
        this.look = { x: 0, y: 0, t: -1e9 }; this.lookAmt = new THREE.Vector2();
        this.base = null;
        this.blinkT = performance.now() + 2500;
        this.el = null; this.clock = new THREE.Clock(); this.running = false;
        this.onPointer = (e) => { this.look.x = e.clientX; this.look.y = e.clientY; this.look.t = performance.now(); };
        window.addEventListener('pointermove', this.onPointer, { passive: true });
        window.addEventListener('pointerdown', this.onPointer, { passive: true });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && this.el) this.loop(); });
        r.compile(this.scene, this.camera);
    }

    buildFur(root) {
        const bodies = [], ears = [];
        root.traverse((o) => {
            if (o.isSkinnedMesh && /Body/.test(o.name)) bodies.push(o);
            // 耳朵有內側（W_EarInner，不長毛）與外側（W_Skin）兩塊；只有外側長毛
            else if (o.isMesh && o.material && o.material.name === 'W_Skin' && o.geometry.attributes.color && /Ear/.test(o.name + (o.parent && o.parent.name))) ears.push(o);
        });
        for (const b of bodies) {
            b.material = furMaterial(true, 0);
            for (let i = 1; i <= SHELLS; i++) {
                const s = new THREE.SkinnedMesh(b.geometry, furMaterial(true, i / SHELLS));
                s.name = b.name + '_fur' + i;
                s.bind(b.skeleton, b.bindMatrix); s.frustumCulled = false; s.renderOrder = i;
                s.position.copy(b.position); s.quaternion.copy(b.quaternion); s.scale.copy(b.scale);
                b.parent.add(s);
            }
        }
        for (const e of ears) {
            e.material = furMaterial(false, 0);
            for (let i = 1; i <= SHELLS / 2; i++) {
                const s = new THREE.Mesh(e.geometry, furMaterial(false, i / (SHELLS / 2)));
                s.frustumCulled = false; s.renderOrder = i; e.add(s);
            }
        }
    }

    /* 讓 3D 貓跟著一個序列圖格子（lobby.js 的 .lb-cat 或 #bcCat）走。 */
    follow(el, zIndex) {
        this.el = el;
        el.classList.add('is3d');
        if (!this.canvas.parentNode) document.body.appendChild(this.canvas);
        this.canvas.style.zIndex = String(zIndex);
        this.curKey = '';
        this.loop();
    }
    detach(el) {
        if (el && el !== this.el) return;
        if (this.el) this.el.classList.remove('is3d');
        this.el = null;
        if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    }

    play(name, once, reverse) {
        const clip = this.clips[name];
        if (!clip) return;
        const a = this.actions[name] || (this.actions[name] = this.mixer.clipAction(clip));
        const prev = this.cur;
        a.reset();
        a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        a.clampWhenFinished = true;
        a.timeScale = reverse ? -1 : 1;
        if (reverse) a.time = clip.duration;
        a.play();
        if (prev && prev !== a) prev.crossFadeTo(a, name === 'jump' || name === 'hang' ? 0.1 : 0.25, false);
        this.cur = a;
    }

    /* 讀格子的狀態：播哪個動作、在螢幕哪裡、多大、面向哪邊。 */
    sync() {
        const el = this.el; if (!el || !el.isConnected) return null;
        const d = el.dataset, name = d.sprite || 'idle';
        const key = name + '|' + (d.t || '');
        if (key !== this.curKey) { this.curKey = key; this.play(name, d.once === '1', d.rev === '1'); }
        const cs = getComputedStyle(el);
        const m = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform) : new DOMMatrix();
        const size = el.offsetWidth * Math.hypot(m.a, m.b);
        if (!size || cs.display === 'none') return null;
        const flipped = m.a < 0;
        let ax, ay, rot = 0, ground = true;
        const grip = el.parentNode;
        if (grip && grip.classList && grip.classList.contains('lb-grip')) {
            // 掛在招牌上：前爪就是抓點；整隻跟著招牌晃，再加上自己的擺盪
            const g = grip.getBoundingClientRect(); ax = g.left; ay = g.top; ground = false;
            rot = (parseFloat(getComputedStyle(grip.parentNode).rotate) || 0) + (parseFloat(cs.rotate) || 0);
        } else {
            const r = el.getBoundingClientRect();
            ax = r.left + r.width / 2; ay = r.bottom - GROUND * size;
        }
        let face = FACE[name] != null ? FACE[name] : 20;
        if (flipped) face = -face;
        return { name, ax, ay, size, rot, face, ground, opacity: parseFloat(cs.opacity) };
    }

    loop() {
        if (this.running) return;
        this.running = true;
        this.clock.getDelta();
        const tick = () => {
            if (!this.el || document.hidden) { this.running = false; return; }
            requestAnimationFrame(tick);
            const s = this.sync();
            if (!s) { this.canvas.style.visibility = 'hidden'; return; }
            /* 省電：角落那隻安靜坐著（沒在走、沒在跳、游標也沒在動）時改成每秒 30 格。
               大廳裡、或牠在動的時候維持 60 格——遊戲感就是靠這個。 */
            this.odd = !this.odd;
            const calm = this.el.id === 'bcCat' && !/walk|stand|jump|land|liedown/.test(s.name) && performance.now() - this.look.t > 3000;
            if (calm && this.odd) return;
            this.draw(s, Math.min(this.clock.getDelta(), 0.08));
        };
        requestAnimationFrame(tick);
    }

    draw(s, dt) {
        const F = s.size;                      // 一格（0.8m）在螢幕上幾 px
        const W = Math.ceil(F * 1.7), H = Math.ceil(F * 1.6);
        const cv = this.canvas;
        if (cv._w !== W || cv._h !== H) { this.renderer.setSize(W, H, false); cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv._w = W; cv._h = H; }
        // 畫布跟著貓走：腳（或掛著時的前爪）落在畫布裡固定的位置
        const ox = W / 2, oy = s.ground ? H * 0.86 : H * 0.14;
        cv.style.transform = 'translate3d(' + (s.ax - ox).toFixed(1) + 'px,' + (s.ay - oy).toFixed(1) + 'px,0)';
        cv.style.visibility = '';
        cv.style.opacity = s.opacity < 1 ? String(s.opacity) : '';
        const cam = this.camera; cam.left = -ox; cam.right = W - ox; cam.top = oy; cam.bottom = oy - H; cam.updateProjectionMatrix();
        this.tilt.scale.setScalar(F / FRAME_M);
        this.tilt.rotation.z = THREE.MathUtils.degToRad(-s.rot);
        // 轉身：慢慢轉過去（走到一半掉頭會看到牠轉身），不是瞬間翻面
        const target = THREE.MathUtils.degToRad(s.face);
        this.yaw += (target - this.yaw) * Math.min(1, dt * (s.name === 'jump' ? 14 : 6));
        this.turn.rotation.y = Math.PI + this.yaw;   // 模型本來背對鏡頭（Blender 裡面向 +Y）
        this.shadow.visible = s.ground && s.name !== 'jump';
        // 上一格加在頭上的轉動先還原，再讓動作覆寫（某些動作沒有頭的軌道時才不會越轉越多）
        if (this.base) { this.neck.quaternion.copy(this.base[0]); this.head.quaternion.copy(this.base[1]); }
        this.mixer.update(dt);
        this.lookAt(s, dt);
        this.blink(s.name);
        this.renderer.render(this.scene, cam);
    }

    /* 頭轉向滑鼠／手指：坐著、躺著的時候，最近 3 秒內有動過才轉，不然慢慢轉回來。 */
    lookAt(s, dt) {
        if (!this.head || !this.neck) return;
        this.base = [this.neck.quaternion.clone(), this.head.quaternion.clone()];
        const ok = LOOKS[s.name] && performance.now() - this.look.t < 3000;
        let tx = 0, ty = 0;
        if (ok) {
            const hx = s.ax, hy = s.ay - s.size * 0.32;
            tx = THREE.MathUtils.clamp((this.look.x - hx) / (s.size * 1.6), -1, 1);
            ty = THREE.MathUtils.clamp((this.look.y - hy) / (s.size * 1.6), -1, 1);
        }
        const k = Math.min(1, dt * 4);
        this.lookAmt.x += (tx - this.lookAmt.x) * k;
        this.lookAmt.y += (ty - this.lookAmt.y) * k;
        if (Math.abs(this.lookAmt.x) < 1e-3 && Math.abs(this.lookAmt.y) < 1e-3) return;
        // 想看的方向：右＝往畫面右轉、下＝低頭；扣掉身體本來就轉的角度
        const yawA = this.lookAmt.x * 0.8 - this.yaw * Math.abs(this.lookAmt.x) * 0.5;
        const pitchA = this.lookAmt.y * 0.4;
        const tq = new THREE.Quaternion(); this.tilt.getWorldQuaternion(tq);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(tq), side = new THREE.Vector3(1, 0, 0).applyQuaternion(tq);
        const qw = new THREE.Quaternion(), pq = new THREE.Quaternion();
        for (const [b, w] of [[this.neck, 0.4], [this.head, 0.6]]) {
            b.getWorldQuaternion(qw);
            const add = new THREE.Quaternion().setFromAxisAngle(up, yawA * w)
                .multiply(new THREE.Quaternion().setFromAxisAngle(side, pitchA * w));
            b.parent.getWorldQuaternion(pq);
            b.quaternion.copy(pq.invert().multiply(add.multiply(qw)));
            b.updateMatrixWorld(true);
        }
    }

    blink(name) {
        const now = performance.now();
        const closed = name === 'sleep' || (now > this.blinkT && now < this.blinkT + 140);
        this.eyes.forEach((o, i) => { o.scale.copy(this.eyeScale[i]); if (closed) o.scale.multiplyScalar(0.08); });
        if (now > this.blinkT + 140) this.blinkT = now + 2500 + Math.random() * 4500;
    }
}

async function init() {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) throw new Error('no webgl2');
    const loader = new GLTFLoader();
    /* ★ 眼睛（虹膜）的貼圖包在 glb 裡。GLTFLoader 預設用 fetch(blob:) 解它，
         但主站的 CSP connect-src 沒有 blob:（img-src 有）→ 貼圖載不到、眼睛一片白。
         換成用 <img> 載的 TextureLoader，走 img-src，不用為這個放寬 CSP。 */
    loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'blackcat_img_texture' }; });
    const gltf = await loader.loadAsync(new URL('cat.glb', import.meta.url).href);
    return new Cat3D(gltf);
}

window.__blackcat3d = { init, RIM };
window.dispatchEvent(new Event('blackcat:3d'));
