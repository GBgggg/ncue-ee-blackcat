// 課程資料庫：「戰士寶藏庫」與「族長秘寶」兩層權限的資源列表，以及管理頁的上傳表單。
import { collection, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { MATERIALS_PATH } from './constants.js';
import { state } from './state.js';
import { escapeHTML, showToast } from './utils.js';

function generateMaterialHTML(m) {
    return `
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex justify-between items-center hover:border-emerald-200 transition-all">
            <div class="flex items-center gap-4">
                <div class="bg-emerald-50 text-emerald-500 p-3 rounded-2xl"><i data-lucide="link-2" class="w-6 h-6"></i></div>
                <div>
                    <h4 class="font-bold text-slate-900">${escapeHTML(m.title)}</h4>
                    <p class="text-xs text-slate-500 font-medium tracking-tight">${escapeHTML(m.courseName)}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <a href="${escapeHTML(m.url)}" target="_blank" class="px-5 py-2 bg-slate-900 text-white font-bold rounded-full hover:bg-slate-800 transition-colors text-xs">下載資源</a>
                ${state.isAdmin ? `<button data-action="delete" data-type="material" data-id="${m.id}" class="p-2 text-slate-300 hover:text-red-500 rounded-xl"><i data-lucide="x-circle" class="w-4 h-4"></i></button>` : ''}
            </div>
        </div>
    `;
}

export function renderMaterials() {
    const wList = document.getElementById('warriorMaterialsList');
    const lList = document.getElementById('leaderMaterialsList');

    const filteredMaterials = state.materials.filter(m => {
        const matchSearch = (m.courseName || "").toLowerCase().includes(state.searchQuery.toLowerCase()) || (m.title || "").toLowerCase().includes(state.searchQuery.toLowerCase());
        const matchCourseFilter = state.selectedFilterCourseId ? (m.courseId === state.selectedFilterCourseId) : true;
        return matchSearch && matchCourseFilter;
    });

    if (state.currentUserLevel < 2) {
        wList.innerHTML = `<div class="text-center py-6 text-slate-400 font-medium bg-white rounded-2xl border border-slate-100"><i data-lucide="lock" class="w-5 h-5 mx-auto mb-1 text-rose-300"></i> 升級為【戰士】後解鎖戰士寶藏庫喵</div>`;
    } else {
        const wMaterials = filteredMaterials.filter(m => !m.requiredRole || m.requiredRole <= 2);
        if (wMaterials.length === 0) {
            wList.innerHTML = `<div class="text-center py-6 text-slate-400 font-medium bg-white rounded-2xl border border-slate-100">戰士區目前沒有寶藏喵。</div>`;
        } else {
            wList.innerHTML = wMaterials.map(m => generateMaterialHTML(m)).join('');
        }
    }

    if (state.currentUserLevel < 3) {
        lList.innerHTML = `<div class="text-center py-6 text-slate-400 font-medium bg-white rounded-2xl border border-slate-100"><i data-lucide="lock" class="w-5 h-5 mx-auto mb-1 text-amber-300"></i> 升級為【族長】後解鎖族長專屬秘寶喵</div>`;
    } else {
        const lMaterials = filteredMaterials.filter(m => m.requiredRole && m.requiredRole >= 3);
        if (lMaterials.length === 0) {
            lList.innerHTML = `<div class="text-center py-6 text-slate-400 font-medium bg-white rounded-2xl border border-slate-100">族長區目前沒有秘寶喵。</div>`;
        } else {
            lList.innerHTML = lMaterials.map(m => generateMaterialHTML(m)).join('');
        }
    }
    lucide.createIcons();
}

export function initMaterials() {
    onSnapshot(collection(db, MATERIALS_PATH), (snapshot) => {
        state.materials = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.materials.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderMaterials();
    });

    document.getElementById('uploadPdfBtn').onclick = async () => {
        const courseId = document.getElementById('uploadCourseSelect').value;
        const urlInput = document.getElementById('pdfUrlInput').value.trim();
        const titleInput = document.getElementById('pdfTitleInput').value.trim();
        const requiredRole = parseInt(document.getElementById('materialLevelSelect').value);

        if (!courseId || !urlInput || !titleInput) return showToast("喵，請填寫完整喔！");

        try {
            const course = state.courses.find(c => c.id === courseId);
            const newDoc = doc(collection(db, MATERIALS_PATH));
            await setDoc(newDoc, { courseId, courseName: course.name, title: titleInput, url: urlInput, requiredRole: requiredRole, createdAt: Date.now() });
            showToast(`考題已存入${requiredRole === 3 ? '族長' : '戰士'}寶藏庫 🐾`);
            document.getElementById('pdfUrlInput').value = '';
            document.getElementById('pdfTitleInput').value = '';
        } catch (err) { showToast("失敗喵..."); }
    };
}
