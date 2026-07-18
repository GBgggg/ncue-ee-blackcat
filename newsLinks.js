// 首頁的「最新消息」與「常用連結」兩個小區塊。
import { collection, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { NEWS_PATH, LINKS_PATH } from './constants.js';
import { state } from './state.js';
import { escapeHTML, isValidText, isValidUrl, showToast } from './utils.js';

export function renderNews() {
    const list = document.getElementById('newsList');
    if (!list) return;

    const filtered = state.newsList.filter(n => n.category === state.currentActiveNewsTab);
    if (filtered.length === 0) {
        list.innerHTML = `<div class="text-center py-10 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-slate-100">這個分類目前沒有最新消息喵！</div>`;
        return;
    }

    list.innerHTML = filtered.map(n => `
        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition border border-slate-100">
            <div class="flex items-center gap-3">
                <i data-lucide="bell-ring" class="w-4 h-4 text-emerald-400 shrink-0"></i>
                <a ${n.url ? `href="${escapeHTML(n.url)}" target="_blank" class="font-bold text-slate-800 hover:text-emerald-600 hover:underline"` : `class="font-bold text-slate-800"`}>
                    ${escapeHTML(n.title)}
                </a>
            </div>
            ${state.currentUserLevel >= 4 ? `<button data-action="delete" data-type="news" data-id="${n.id}" class="p-1.5 text-slate-300 hover:text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>` : ''}
        </div>
    `).join('');
    lucide.createIcons();
}

export function renderQuickLinks() {
    const list = document.getElementById('quickLinksList');
    if (!list) return;

    if (state.quickLinks.length === 0) {
        list.innerHTML = `<div class="text-center py-10 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-slate-100">還沒有常用連結喵！</div>`;
        return;
    }

    list.innerHTML = state.quickLinks.map(l => `
        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition border border-slate-100">
            <div class="flex items-center gap-3">
                <i data-lucide="link" class="w-4 h-4 text-blue-400 shrink-0"></i>
                <a href="${escapeHTML(l.url)}" target="_blank" class="font-bold text-slate-800 hover:text-blue-600 hover:underline">
                    ${escapeHTML(l.title)}
                </a>
            </div>
            ${state.currentUserLevel >= 4 ? `<button data-action="delete" data-type="quickLink" data-id="${l.id}" class="p-1.5 text-slate-300 hover:text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>` : ''}
        </div>
    `).join('');
    lucide.createIcons();
}

export function initNewsLinks() {
    onSnapshot(collection(db, NEWS_PATH), (snapshot) => {
        state.newsList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.newsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderNews();
    });

    onSnapshot(collection(db, LINKS_PATH), (snapshot) => {
        state.quickLinks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.quickLinks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderQuickLinks();
    });

    document.addEventListener('click', (e) => {
        const newsTabBtn = e.target.closest('.news-tab-btn');
        if (newsTabBtn) {
            document.querySelectorAll('.news-tab-btn').forEach(btn => {
                btn.classList.remove('bg-slate-800', 'text-white');
                btn.classList.add('text-slate-400');
            });
            newsTabBtn.classList.remove('text-slate-400');
            newsTabBtn.classList.add('bg-slate-800', 'text-white');
            state.currentActiveNewsTab = newsTabBtn.dataset.newsTab;
            renderNews();
        }
    });

    document.getElementById('addNewsBtn').onclick = () => { document.getElementById('newsModal').classList.remove('hidden'); };
    document.getElementById('closeNewsModal').onclick = () => { document.getElementById('newsModal').classList.add('hidden'); };
    document.getElementById('confirmSaveNews').onclick = async () => {
        const category = document.getElementById('newsCategory').value;
        const title = document.getElementById('newsTitle').value.trim();
        const url = document.getElementById('newsUrl').value.trim();

        if (!isValidText(title, 50)) return showToast("喵，標題請在 50 字以內喔！");
        if (url && !isValidUrl(url)) return showToast("連結格式錯誤！");

        try {
            await setDoc(doc(collection(db, NEWS_PATH)), { category, title, url, createdAt: Date.now() });
            showToast("最新消息發布成功 🐾");
            document.getElementById('newsTitle').value = '';
            document.getElementById('newsUrl').value = '';
            document.getElementById('newsModal').classList.add('hidden');
        } catch (e) { showToast("發布失敗喵..."); }
    };

    document.getElementById('addLinkBtn').onclick = () => { document.getElementById('linkModal').classList.remove('hidden'); };
    document.getElementById('closeLinkModal').onclick = () => { document.getElementById('linkModal').classList.add('hidden'); };
    document.getElementById('confirmSaveLink').onclick = async () => {
        const title = document.getElementById('linkTitle').value.trim();
        const url = document.getElementById('linkUrl').value.trim();

        if (!isValidText(title, 30)) return showToast("喵，標題請在 30 字以內喔！");
        if (!isValidUrl(url)) return showToast("連結格式錯誤！(必需包含 http/https)");

        try {
            await setDoc(doc(collection(db, LINKS_PATH)), { title, url, createdAt: Date.now() });
            showToast("常用連結新增成功 🐾");
            document.getElementById('linkTitle').value = '';
            document.getElementById('linkUrl').value = '';
            document.getElementById('linkModal').classList.add('hidden');
        } catch (e) { showToast("新增失敗喵..."); }
    };
}
