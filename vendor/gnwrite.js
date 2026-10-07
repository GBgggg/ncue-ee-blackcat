/*! gnwrite.js — 把「幾頁紙＋幾張圖」寫成一本 GoodNotes 筆記本（.goodnotes）。
 *
 * 移植自 gnnote（https://github.com/jakubfabrici/notability-goodnotes，MIT，© 2026 Jakub Fabrici）
 * 的 gnnote/goodnotes/writer.py，只取「圖片＋紙」那一半；筆畫、文字框、形狀填色都沒有搬。
 * 授權全文：vendor/LICENSE.gnnote.txt。
 *
 * ★ 為什麼寫成檔案格式本人，不是匯出 PDF：GoodNotes 匯入 PDF 時把整頁當成「紙」，
 *   裡面的題目圖用套索圈不起來（2026-10-07 在 iPad 上實測三種 PDF 寫法全部搬不動）。
 *   .goodnotes 裡的圖是 GoodNotes 自己的「圖片物件」，跟在 App 裡插入的照片一樣可以拖、可以縮放。
 * ★ 結構跟 gnnote 一字不差（欄位編號、順序、每一個常數），只是 Python → JavaScript。
 *   對照的方法在 tests/wbnote.mjs：同一份輸入交給 gnnote 本人讀回來，頁數、每張圖的位置與大小都要對得上。
 *   要改這裡之前先讀 gnnote 的 docs/goodnotes-container.md，**不要憑感覺加欄位**——
 *   GoodNotes 打不開的檔案不會告訴你是哪一欄錯，只會說「無法開啟」。
 *
 * 用法：
 *   const bytes = await GnWrite.write({
 *     title: '錯題本', pageW: 446.886, pageH: 587.455,        // 單位：PDF 點（pt）
 *     paperPdf: Uint8Array,                                   // 一頁的紙（每一頁共用同一張）
 *     pages: [{ images: [{ x, y, w, h, data: Uint8Array }] }] // PNG 或 JPEG，座標從左上角量、單位 pt
 *   });
 *   另附 GnWrite.paperPdfFromJpeg(jpegBytes, pxW, pxH, pageW, pageH)：一張 JPEG 鋪滿的一頁 PDF。
 */
(function (root) {
    'use strict';

    /* ---------------- 常數（gnnote/goodnotes/constants.py） ---------------- */
    const SCHEMA_VERSION = 24;
    const CANVAS_PER_POINT = 132 / 72;
    const ELEMENT_MAGIC = 5381;
    const ELEMENT_CLOCK_VERSION = 2;
    const EVENT_CLOCK_VERSION = 1;
    const DOCUMENT_CONSTANT_UUID = '5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E';
    const ORIENTATION_PORTRAIT = 'P';
    const RECOGNITION_LANGUAGE = 'auto';
    const PAGING_PREFIX = 'PagingViewServiceUpdater:';
    const EV = { DOC: 30, ATTACH: 6, TEMPLATE: 2, PAGE: 54, SEARCH: 105, CURRENT: 10, NOTES: 102 };
    const CONTENT_IMAGE = 1;
    const IMAGE_KIND_PHOTO = 1;           // JPEG；PNG 不寫這一欄
    const ORDER_KEY_PREFIX = '43';
    const PAPER_NAME_SUFFIX = ' - White';
    const A4 = [595.28, 841.89];
    const hex = (s) => Uint8Array.from(s.match(/../g).map(h => parseInt(h, 16)));
    const PAGE_COLOUR_BLOCK = hex('0a2e122c0a140ddedd5d3f15dedd5d3f1ddedd5d3f250000803f'
                                + '12140d0000803f150000803f1d0000803f250000803f');
    const SCHEMA_PB = Uint8Array.of(0x08, 0x18);
    const THUMBNAIL_JPEG = hex(
        'ffd8ffe000104a46494600010100000100010000ffdb00430001010101010101' +
        '0101010101010101010101010101010101010101010101010101010101010101' +
        '01010101010101010101010101010101010101010101010101ffc0001108001f' +
        '001803011100021100031100ffc4001f00000105010101010101000000000000' +
        '00000102030405060708090a0bffc400b5100002010303020403050504040000' +
        '017d01020300041105122131410613516107227114328191a1082342b1c11552' +
        'd1f02433627282090a161718191a25262728292a3435363738393a4344454647' +
        '48494a535455565758595a636465666768696a737475767778797a8384858687' +
        '88898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3' +
        'c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6' +
        'f7f8f9faffda000c03010002000300003f00fefe28a28a28a28a28a28a28a28a' +
        '28a28a28a28a28a28a28a28a28a28affd9');

    /* ---------------- 位元組 ---------------- */
    const enc = new TextEncoder();
    function cat(parts) {
        let n = 0;
        for (const p of parts) n += p.length;
        const out = new Uint8Array(n);
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
    }
    const u8 = (b) => (typeof b === 'string' ? enc.encode(b) : b);

    /* ---------------- protobuf（gnnote/protobuf.py 的編碼那一半） ----------------
       ★ varint 一律走 BigInt：裝置代號是 63 位元、序號是毫秒時間戳（超過 2^32），
         用一般數字做位移會在第 32 位元悄悄截斷，檔案照樣產生、GoodNotes 照樣打不開。 */
    function varint(n) {
        let v = BigInt(n);
        if (v < 0n) v &= (1n << 64n) - 1n;
        const out = [];
        for (;;) {
            const b = Number(v & 0x7fn);
            v >>= 7n;
            if (v) out.push(b | 0x80); else { out.push(b); return Uint8Array.from(out); }
        }
    }
    const key = (num, wire) => varint((num << 3) | wire);
    const fVarint = (num, n) => cat([key(num, 0), varint(n)]);
    function fBytes(num, b) { const p = u8(b); return cat([key(num, 2), varint(p.length), p]); }
    const fMsg = fBytes;
    function fFixed32(num, f) {
        const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, f, true);
        return cat([key(num, 5), b]);
    }
    function fFloat64(num, f) {
        const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, f, true);
        return cat([key(num, 1), b]);
    }
    const records = (list) => cat(list.flatMap(r => [varint(r.length), r]));

    /* ---------------- 亂數與識別碼（writer.py 的 _Ids） ---------------- */
    function rand32() {
        const a = new Uint32Array(1);
        (root.crypto || globalThis.crypto).getRandomValues(a);
        return a[0];
    }
    function rand63() {
        const v = (BigInt(rand32() & 0x7fffffff) << 32n) | BigInt(rand32());
        return v || 1n;
    }
    function uuid4() {
        const b = new Uint8Array(16);
        (root.crypto || globalThis.crypto).getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
    function makeIds() {
        const nowMs = Math.floor(Date.now());
        const ids = {
            deviceId: rand63(),
            nowMs,
            seq: BigInt(nowMs),
            element: 0,
            uuid: uuid4,
            /* 一頁兩個識別碼：頁本身 P（最後一位 0–E）與它的筆記層 N（P 最後一位 +1）。 */
            pageUuids() {
                const p = uuid4(), last = rand32() % 15;
                return [p.slice(0, -1) + last.toString(16).toUpperCase(), p.slice(0, -1) + (last + 1).toString(16).toUpperCase()];
            },
            clock: (version) => cat([fVarint(1, version), fVarint(2, rand32())]),
            nextSeq() { ids.seq += 1n; return ids.seq; },
            nextElement() { ids.element += 1; return ids.element; }
        };
        return ids;
    }

    /* ---------------- 幾何 ---------------- */
    const point = (x, y) => cat([fFixed32(1, x), fFixed32(2, y)]);
    const rect = (x, y, w, h) => cat([fMsg(1, point(x, y)), fMsg(2, point(w, h))]);
    function base36(n) {
        const D = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (n === 0) return '0';
        let s = '';
        while (n) { s = D[n % 36] + s; n = Math.floor(n / 36); }
        return s;
    }
    const orderKey = (index) => ORDER_KEY_PREFIX + base36(index + 1).padStart(4, '0');

    /* ---------------- 頁面內容 ---------------- */
    function metadataRecord(ctx, element, clock, attachment) {
        const parts = [fBytes(1, element), fMsg(2, clock)];
        if (attachment != null) parts.push(fBytes(4, attachment));
        parts.push(fVarint(8, ctx.ids.deviceId), fVarint(9, ctx.ids.nextElement()),
                   fVarint(14, ELEMENT_MAGIC), fVarint(16, SCHEMA_VERSION));
        return cat(parts);
    }
    const isJpeg = (d) => d[0] === 0xff && d[1] === 0xd8;
    const isPng = (d) => d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47;
    function imageRecords(ctx, im, sx, sy) {
        const data = im.data;
        if (!data || !data.length) throw new Error('有一張圖是空的');
        if (!isJpeg(data) && !isPng(data)) throw new Error('圖只收 PNG 或 JPEG');
        /* 同一張圖只放一份附件（gnnote 用 SHA-1 判斷；這裡同一個 Uint8Array 物件就當同一張）。 */
        let att = ctx.rasterOf.get(data);
        if (!att) { att = { uuid: ctx.ids.uuid(), data, isPdf: false }; ctx.rasterOf.set(data, att); ctx.attachments.push(att); }
        const x = im.x * sx, y = im.y * sy, w = im.w * sx, h = im.h * sy;
        const element = ctx.ids.uuid();
        const clock = ctx.ids.clock(ELEMENT_CLOCK_VERSION);
        const body = [fBytes(1, element), fMsg(2, rect(x, y, w, h)), fMsg(3, rect(x + w / 2, y + h / 2, w, h)),
                      fBytes(4, att.uuid), fMsg(5, fMsg(1, ctx.ids.clock(1)))];
        if (isJpeg(data)) body.push(fVarint(6, IMAGE_KIND_PHOTO));
        body.push(fMsg(15, clock), fVarint(18, SCHEMA_VERSION));
        return [metadataRecord(ctx, element, clock, att.uuid), fMsg(CONTENT_IMAGE, cat(body))];
    }

    /* ---------------- 事件紀錄（writer.py 的 _events） ---------------- */
    function events(ctx, docUuid, title, outs) {
        const { ids } = ctx;
        const stamp = () => cat([fFloat64(10, ids.nowMs), fBytes(11, ids.uuid())]);
        const trio = (first) => cat([fVarint(first, ids.deviceId), fVarint(first + 1, ids.nextSeq()), fVarint(first + 2, SCHEMA_VERSION)]);
        const register = (value) => cat([value, fMsg(2, ids.clock(EVENT_CLOCK_VERSION))]);
        const event = (entity, num, body) => cat([fBytes(1, entity), fMsg(num, body)]);
        const recs = [];
        recs.push(event(docUuid, EV.DOC, cat([
            fBytes(1, docUuid),
            fMsg(2, register(fBytes(1, title))),
            fMsg(3, register(fBytes(1, DOCUMENT_CONSTANT_UUID))),
            fMsg(6, register(fBytes(1, ORIENTATION_PORTRAIT))),
            fMsg(7, register(fBytes(1, DOCUMENT_CONSTANT_UUID))),
            fBytes(9, RECOGNITION_LANGUAGE),
            stamp(),
            fVarint(13, ids.deviceId),
            fVarint(14, ids.nextSeq()),
            fBytes(17, new Uint8Array(0)),
            fBytes(18, new Uint8Array(0)),
            fMsg(19, fMsg(2, ids.clock(EVENT_CLOCK_VERSION))),
            fVarint(20, SCHEMA_VERSION)])));
        const attachmentEvent = (att) => {
            const kind = att.isPdf ? fMsg(12, cat([fVarint(1, 1), fVarint(2, 1)])) : fBytes(12, new Uint8Array(0));
            return event(att.uuid, EV.ATTACH, cat([fBytes(1, att.uuid), fBytes(2, att.uuid), fVarint(5, att.data.length),
                fBytes(6, docUuid), stamp(), kind, trio(14)]));
        };
        const templateEvent = (t) => event(t.uuid, EV.TEMPLATE, cat([
            fBytes(1, docUuid), fBytes(2, t.uuid), fBytes(4, t.attachment.uuid),
            fVarint(5, t.pdfPage), fVarint(6, 1),
            fMsg(8, point(t.canvasW, t.canvasH)),
            fBytes(9, t.name),
            stamp(),
            fMsg(12, fMsg(2, ids.clock(EVENT_CLOCK_VERSION))),
            fMsg(13, fMsg(2, ids.clock(EVENT_CLOCK_VERSION))),
            fVarint(15, ids.deviceId), fVarint(16, ids.nextSeq()),
            fMsg(17, register(fVarint(1, 1))),
            fMsg(19, fMsg(2, ids.clock(EVENT_CLOCK_VERSION))),
            fVarint(21, SCHEMA_VERSION)]));
        /* PDF 附件先、各自跟著它的紙；圖片附件後。順序照 gnnote，不要動。 */
        const done = new Set();
        for (const att of ctx.attachments) {
            if (!att.isPdf) continue;
            recs.push(attachmentEvent(att));
            for (const t of ctx.templates) if (t.attachment === att && !done.has(t.uuid)) { done.add(t.uuid); recs.push(templateEvent(t)); }
        }
        for (const att of ctx.attachments) if (!att.isPdf) recs.push(attachmentEvent(att));
        for (const o of outs) recs.push(event(o.entity, EV.PAGE, cat([
            fBytes(1, docUuid), fBytes(2, o.entity),
            fMsg(3, register(fBytes(1, o.template.uuid))),
            fMsg(4, register(fBytes(1, orderKey(o.index)))),
            stamp(), trio(13),
            fMsg(17, register(PAGE_COLOUR_BLOCK))])));
        for (const o of outs) recs.push(event(o.notes, EV.SEARCH, cat([
            fVarint(1, 1), fBytes(2, docUuid), fBytes(4, o.notes), fBytes(6, RECOGNITION_LANGUAGE), stamp(), trio(13)])));
        recs.push(event(docUuid, EV.CURRENT, cat([
            fBytes(1, docUuid), fBytes(2, outs[0].entity), fBytes(3, PAGING_PREFIX + ids.uuid()), stamp(), trio(13)])));
        for (const o of outs) if (o.content.length)
            recs.push(event(o.notes, EV.NOTES, cat([fBytes(1, o.notes), stamp(), trio(13), fBytes(16, docUuid)])));
        return records(recs);
    }

    /* ---------------- 主程式（writer.py 的 build_members） ---------------- */
    function buildMembers(doc) {
        const W = Number(doc.pageW), H = Number(doc.pageH);
        if (!(W > 0 && H > 0)) throw new Error('紙的大小不對');
        if (!doc.paperPdf || !doc.paperPdf.length) throw new Error('少了紙');
        const ids = makeIds();
        const ctx = { ids, attachments: [], templates: [], rasterOf: new Map() };
        /* ★ 紙走 gnnote「自己產生的紙」那條路（名稱是 <UUID>_<尺寸>_1_1 - White），
             只是 PDF 換成我們的筆記紙。2026-10-07 iPad 上試過的檔案就是這個形狀；
             走「使用者匯入的 PDF」那條路的話 GoodNotes 會把它當成匯入的文件頁。 */
        const paper = { uuid: ids.uuid(), data: doc.paperPdf, isPdf: true };
        ctx.attachments.push(paper);
        const tUuid = ids.uuid();
        const size = Math.abs(W - A4[0]) < 1 && Math.abs(H - A4[1]) < 1 ? 'a4' : 'standard';
        const template = { uuid: tUuid, attachment: paper, pdfPage: 1, canvasW: W * CANVAS_PER_POINT, canvasH: H * CANVAS_PER_POINT,
                           name: `${tUuid}_${size}_1_1${PAPER_NAME_SUFFIX}` };
        ctx.templates.push(template);
        const pages = (doc.pages && doc.pages.length) ? doc.pages : [{ images: [] }];
        const outs = pages.map((page, index) => {
            const [entity, notes] = ids.pageUuids();
            return { index, page, entity, notes, template, content: null };
        });
        const s = CANVAS_PER_POINT;
        for (const o of outs) {
            const recs = [];
            for (const im of (o.page.images || [])) recs.push(...imageRecords(ctx, im, s, s));
            o.content = records(recs);
        }
        const docUuid = ids.uuid();
        const title = String(doc.title || 'Untitled Notebook');
        const members = [['index.search.pb', new Uint8Array(0)]];
        members.push(['index.notes.pb', records(outs.map(o => cat([fBytes(1, o.notes), fBytes(2, 'notes/' + o.notes)])))]);
        for (const o of outs) members.push(['notes/' + o.notes, o.content]);
        members.push(['index.events.pb', events(ctx, docUuid, title, outs)]);
        members.push(['thumbnail.jpg', THUMBNAIL_JPEG]);
        members.push(['index.attachments.pb', records(ctx.attachments.map(a => cat([fBytes(1, a.uuid), fBytes(2, 'attachments/' + a.uuid)])))]);
        for (const a of ctx.attachments) members.push(['attachments/' + a.uuid, a.data]);
        members.push(['schema.pb', SCHEMA_PB]);
        return members;
    }

    /* ---------------- ZIP ----------------
       ★ 跟 Python zipfile 寫的一樣：每一份都 deflate、建立系統 = Unix（3）、權限 0644。
         壓縮用瀏覽器內建的 CompressionStream('deflate-raw')（Safari 16.4 起有）；
         沒有的話退回「不壓縮」（method 0）——那是合法的 ZIP，只是檔案大一點。 */
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
        return t;
    })();
    function crc32(d) {
        let c = 0xffffffff;
        for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }
    async function deflateRaw(data) {
        const CS = root.CompressionStream || globalThis.CompressionStream;
        if (!CS) return null;
        try {
            /* ★ 用 Response 不用 Blob：兩者在瀏覽器裡一樣，但測試環境（tests/shim.mjs）把 Blob 換成空殼，
                 用 Blob 的話測試裡一律退回不壓縮，而那不是瀏覽器裡會走的路。 */
            const stream = new Response(data).body.pipeThrough(new CS('deflate-raw'));
            return new Uint8Array(await new Response(stream).arrayBuffer());
        } catch (e) { return null; }
    }
    async function zip(members, date) {
        const d = date || new Date();
        const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
        const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        const locals = [], centrals = [];
        let offset = 0;
        for (const [name, data] of members) {
            const nameB = enc.encode(name);
            const crc = crc32(data);
            let comp = data.length ? await deflateRaw(data) : null, method = 8;
            if (!data.length) comp = Uint8Array.of(0x03, 0x00);       // 空檔的 deflate（Python 也是這兩個位元組）
            if (!comp) { comp = data; method = 0; }
            const lh = new Uint8Array(30), lv = new DataView(lh.buffer);
            lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true);
            lv.setUint16(8, method, true); lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
            lv.setUint32(14, crc, true); lv.setUint32(18, comp.length, true); lv.setUint32(22, data.length, true);
            lv.setUint16(26, nameB.length, true); lv.setUint16(28, 0, true);
            locals.push(lh, nameB, comp);
            const ch = new Uint8Array(46), cv = new DataView(ch.buffer);
            cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, (3 << 8) | 20, true); cv.setUint16(6, 20, true);
            cv.setUint16(8, 0, true); cv.setUint16(10, method, true); cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true);
            cv.setUint32(16, crc, true); cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true);
            cv.setUint16(28, nameB.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
            cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, (0o100644 << 16) >>> 0, true);
            cv.setUint32(42, offset, true);
            centrals.push(ch, nameB);
            offset += 30 + nameB.length + comp.length;
        }
        const central = cat(centrals);
        const end = new Uint8Array(22), ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, members.length, true); ev.setUint16(10, members.length, true);
        ev.setUint32(12, central.length, true); ev.setUint32(16, offset, true);
        return cat([...locals, central, end]);
    }

    async function write(doc) { return zip(buildMembers(doc)); }

    /* ---------------- 紙：一張 JPEG 鋪滿的一頁 PDF ----------------
       ★ 自己寫最小的 PDF（五個物件、一張 DCTDecode 圖），JPEG 原封不動塞進去，不用解碼。
         交叉參照表的位移量是**位元組**數，JPEG 是二進位，所以全程用 Uint8Array 拼，不要拼字串。 */
    function paperPdfFromJpeg(jpeg, pxW, pxH, pageW, pageH) {
        const f = (n) => (Math.round(n * 1000) / 1000).toString();
        const content = enc.encode(`q ${f(pageW)} 0 0 ${f(pageH)} 0 0 cm /Im0 Do Q\n`);
        const objs = [
            enc.encode('<< /Type /Catalog /Pages 2 0 R >>'),
            enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
            enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pageW)} ${f(pageH)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
            cat([enc.encode(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
                 jpeg, enc.encode('\nendstream')]),
            cat([enc.encode(`<< /Length ${content.length} >>\nstream\n`), content, enc.encode('endstream')])
        ];
        const parts = [enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
        let pos = parts[0].length;
        const offs = [];
        objs.forEach((body, i) => {
            offs.push(pos);
            const p = cat([enc.encode(`${i + 1} 0 obj\n`), body, enc.encode('\nendobj\n')]);
            parts.push(p); pos += p.length;
        });
        const xref = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ', ...offs.map(o => String(o).padStart(10, '0') + ' 00000 n ')].join('\n') + '\n';
        parts.push(enc.encode(xref + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
        return cat(parts);
    }

    const api = { write, buildMembers, zip, paperPdfFromJpeg, CANVAS_PER_POINT };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.GnWrite = api;
})(typeof window !== 'undefined' ? window : globalThis);
