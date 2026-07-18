// 專屬單字庫：單字冊列表、單字列表，以及新增/編輯用的兩個 Modal。
import { collection, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { VOCAB_BOOKS_PATH, VOCAB_WORDS_PATH } from './constants.js';
import { state } from './state.js';
import { escapeHTML, isValidText, showToast } from './utils.js';

export function renderVocabBooks() {
    const grid = document.getElementById('vocabBookGrid');
    if (state.vocabBooks.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">目前還沒有單字冊喵。</div>';
        return;
    }

    grid.innerHTML = state.vocabBooks.map(b => `
        <div data-action="open-vocab-book" data-id="${b.id}" class="cursor-pointer bg-white rounded-3xl p-6 shadow-sm border-2 border-slate-100 hover:border-blue-300 transition-all flex flex-col group relative">
            <div class="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <i data-lucide="book-type" class="w-6 h-6"></i>
            </div>
            <h3 class="text-xl font-black text-slate-900 mb-2 truncate">${escapeHTML(b.title)}</h3>
            <p class="text-slate-500 text-sm mb-4 leading-relaxed font-bold truncate">${escapeHTML(b.description || '無描述')}</p>

            ${state.currentUserLevel >= 4 ? `
            <div class="absolute top-4 right-4 flex gap-2">
                <button data-action="edit-vocab-book" data-id="${b.id}" class="p-2 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button>
                <button data-action="delete" data-type="vocabBook" data-id="${b.id}" class="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
            </div>` : ''}
        </div>
    `).join('');
    lucide.createIcons();
}

export function renderVocabWords() {
    const list = document.getElementById('vocabWordList');
    if (!state.currentViewVocabBookId) return;

    const words = state.vocabWords.filter(w => w.bookId === state.currentViewVocabBookId);

    if (words.length === 0) {
        list.innerHTML = '<div class="col-span-full text-center py-20 text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">這個單字冊還是空的，等巫醫來補充喵 🐾</div>';
        return;
    }

    list.innerHTML = words.map(w => `
        <div class="bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-100 hover:shadow-md transition-all relative flex flex-col justify-center">
            ${state.currentUserLevel >= 4 ? `
            <div class="absolute top-4 right-4 flex gap-2">
                <button data-action="edit-vocab-word" data-id="${w.id}" class="p-2 text-slate-300 hover:text-emerald-500 rounded-lg transition"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button>
                <button data-action="delete" data-type="vocabWord" data-id="${w.id}" class="p-2 text-slate-300 hover:text-red-500 rounded-lg transition"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
            </div>` : ''}

            <h4 class="text-2xl font-black text-blue-700 mb-1 pr-14 break-words">${escapeHTML(w.english)}</h4>
            <p class="text-slate-700 font-bold mb-3 text-sm leading-relaxed">${escapeHTML(w.engDef)}</p>

            ${w.chinese ? `<p class="text-sm text-slate-600 mb-1"><span class="font-bold mr-2 text-slate-400">中文</span>${escapeHTML(w.chinese)}</p>` : ''}
            ${w.rootPrefix ? `<p class="text-sm text-slate-600 mb-1"><span class="font-bold mr-2 text-slate-400">字首根</span><span class="text-fuchsia-600 font-bold">${escapeHTML(w.rootPrefix)}</span></p>` : ''}
            ${w.example ? `<div class="text-sm text-slate-500 mt-3 p-3 bg-slate-50 rounded-xl italic font-medium">"${escapeHTML(w.example)}"</div>` : ''}
        </div>
    `).join('');
    lucide.createIcons();
}

export function openVocabBookDetails(bookId) {
    state.currentViewVocabBookId = bookId;
    const b = state.vocabBooks.find(x => x.id === bookId);
    if (!b) return;

    document.getElementById('page-vocabulary-main').classList.add('hidden');
    document.getElementById('page-vocabulary-details').classList.remove('hidden');

    document.getElementById('vocabDetailsTitle').textContent = b.title;
    document.getElementById('vocabDetailsSubtitle').innerHTML = `<i data-lucide="info" class="w-4 h-4"></i> ${escapeHTML(b.description || '無描述')}`;

    renderVocabWords();
    lucide.createIcons();
    setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
}

function openVocabBookModal(id) {
    const modal = document.getElementById('vocabBookModal');
    if (id) {
        const b = state.vocabBooks.find(x => x.id === id);
        if (!b) return;
        document.getElementById('vocabBookModalTitle').textContent = "編輯單字冊";
        document.getElementById('editVocabBookId').value = b.id;
        document.getElementById('vocabBookTitle').value = b.title;
        document.getElementById('vocabBookDescription').value = b.description || '';
    } else {
        document.getElementById('vocabBookModalTitle').textContent = "創建單字冊";
        document.getElementById('editVocabBookId').value = '';
        document.getElementById('vocabBookTitle').value = '';
        document.getElementById('vocabBookDescription').value = '';
    }
    modal.classList.remove('hidden');
}

function openVocabWordModal(id) {
    const modal = document.getElementById('vocabWordModal');
    if (id) {
        const w = state.vocabWords.find(x => x.id === id);
        if (!w) return;
        document.getElementById('vocabWordModalTitle').textContent = "編輯單字";
        document.getElementById('editVocabWordId').value = w.id;
        document.getElementById('vocabWordEnglish').value = w.english;
        document.getElementById('vocabWordEngDef').value = w.engDef;
        document.getElementById('vocabWordChinese').value = w.chinese || '';
        document.getElementById('vocabWordRootPrefix').value = w.rootPrefix || '';
        document.getElementById('vocabWordExample').value = w.example || '';
    } else {
        document.getElementById('vocabWordModalTitle').textContent = "新增單字";
        document.getElementById('editVocabWordId').value = '';
        document.getElementById('vocabWordEnglish').value = '';
        document.getElementById('vocabWordEngDef').value = '';
        document.getElementById('vocabWordChinese').value = '';
        document.getElementById('vocabWordRootPrefix').value = '';
        document.getElementById('vocabWordExample').value = '';
    }
    modal.classList.remove('hidden');
}

export function initVocabulary() {
    onSnapshot(collection(db, VOCAB_BOOKS_PATH), (snapshot) => {
        state.vocabBooks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.vocabBooks.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        renderVocabBooks();
    });

    onSnapshot(collection(db, VOCAB_WORDS_PATH), (snapshot) => {
        state.vocabWords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.vocabWords.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (state.currentViewVocabBookId) renderVocabWords();
    });

    document.getElementById('backToVocabBooksBtn').onclick = () => {
        state.currentViewVocabBookId = null;
        document.getElementById('page-vocabulary-details').classList.add('hidden');
        document.getElementById('page-vocabulary-main').classList.remove('hidden');
    };

    document.getElementById('addVocabBookBtn').onclick = () => openVocabBookModal(null);
    document.getElementById('closeVocabBookModal').onclick = () => document.getElementById('vocabBookModal').classList.add('hidden');

    document.getElementById('confirmSaveVocabBook').onclick = async () => {
        const id = document.getElementById('editVocabBookId').value;
        const title = document.getElementById('vocabBookTitle').value.trim();
        const description = document.getElementById('vocabBookDescription').value.trim();

        if (!isValidText(title, 80)) return showToast("喵，單字冊名稱請在 80 字以內！");
        if (description && !isValidText(description, 200)) return showToast("描述請在 200 字以內喔！");

        try {
            if (id) {
                await updateDoc(doc(db, VOCAB_BOOKS_PATH, id), { title, description });
                showToast("單字冊更新成功 🐾");
            } else {
                await setDoc(doc(collection(db, VOCAB_BOOKS_PATH)), { title, description, createdAt: Date.now() });
                showToast("單字冊創建成功 🐾");
            }
            document.getElementById('vocabBookModal').classList.add('hidden');
        } catch (err) { showToast("儲存失敗喵..."); }
    };

    document.getElementById('addVocabWordBtn').onclick = () => {
        if (!state.currentViewVocabBookId) return;
        openVocabWordModal(null);
    };
    document.getElementById('closeVocabWordModal').onclick = () => document.getElementById('vocabWordModal').classList.add('hidden');

    document.getElementById('confirmSaveVocabWord').onclick = async () => {
        const id = document.getElementById('editVocabWordId').value;
        const english = document.getElementById('vocabWordEnglish').value.trim();
        const engDef = document.getElementById('vocabWordEngDef').value.trim();
        const chinese = document.getElementById('vocabWordChinese').value.trim();
        const rootPrefix = document.getElementById('vocabWordRootPrefix').value.trim();
        const example = document.getElementById('vocabWordExample').value.trim();

        if (!isValidText(english, 100)) return showToast("喵，英文單字請在 1 到 100 字以內！");
        if (!isValidText(engDef, 200)) return showToast("喵，英譯英定義請在 1 到 200 字以內！");
        if (chinese && !isValidText(chinese, 100)) return showToast("中文解釋請在 100 字以內喔！");
        if (rootPrefix && !isValidText(rootPrefix, 100)) return showToast("字根字首請在 100 字以內喔！");
        if (example && !isValidText(example, 300)) return showToast("例句請在 300 字以內喔！");

        try {
            const payload = { bookId: state.currentViewVocabBookId, english, engDef, chinese, rootPrefix, example };

            if (id) {
                await updateDoc(doc(db, VOCAB_WORDS_PATH, id), payload);
                showToast("單字更新成功 🐾");
            } else {
                await setDoc(doc(collection(db, VOCAB_WORDS_PATH)), { ...payload, createdAt: Date.now() });
                showToast("單字新增成功 🐾");
            }
            document.getElementById('vocabWordModal').classList.add('hidden');
        } catch (err) { showToast("儲存失敗喵..."); }
    };

    document.addEventListener('click', (e) => {
        const openVocabBookTarget = e.target.closest('[data-action="open-vocab-book"]');
        if (openVocabBookTarget) { openVocabBookDetails(openVocabBookTarget.dataset.id); return; }

        const editVocabBookTarget = e.target.closest('[data-action="edit-vocab-book"]');
        if (editVocabBookTarget) { e.stopPropagation(); openVocabBookModal(editVocabBookTarget.dataset.id); return; }

        const editVocabWordTarget = e.target.closest('[data-action="edit-vocab-word"]');
        if (editVocabWordTarget) { e.stopPropagation(); openVocabWordModal(editVocabWordTarget.dataset.id); return; }
    });
}
