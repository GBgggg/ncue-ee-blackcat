// 課程自學：自學課程列表、單元列表，以及新增/編輯用的兩個 Modal。
import { collection, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { SS_COURSES_PATH, SS_UNITS_PATH } from './constants.js';
import { state } from './state.js';
import { escapeHTML, isValidText, isValidUrl, showToast } from './utils.js';

export function renderSelfStudyCourses() {
    const grid = document.getElementById('ssCourseGrid');
    if (state.ssCourses.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">目前還沒有自學課程喵。</div>';
        return;
    }

    grid.innerHTML = state.ssCourses.map(c => `
        <div data-action="open-ss-course" data-id="${c.id}" class="cursor-pointer bg-white rounded-3xl p-6 shadow-sm border-2 border-slate-100 hover:border-fuchsia-300 transition-all flex flex-col group relative">
            <div class="w-12 h-12 bg-fuchsia-50 text-fuchsia-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <i data-lucide="book" class="w-6 h-6"></i>
            </div>
            <h3 class="text-xl font-black text-slate-900 mb-2 truncate">${escapeHTML(c.title)}</h3>
            <p class="text-slate-500 text-sm mb-4 leading-relaxed font-bold flex items-center gap-1 truncate"><i data-lucide="link" class="w-3 h-3"></i> ${escapeHTML(c.linkedCourseName)}</p>

            ${state.isAdmin ? `
            <div class="absolute top-4 right-4 flex gap-2">
                <button data-action="edit-ss-course" data-id="${c.id}" class="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button>
                <button data-action="delete" data-type="ssCourse" data-id="${c.id}" class="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
            </div>` : ''}
        </div>
    `).join('');
    lucide.createIcons();
}

export function renderSelfStudyUnits() {
    const list = document.getElementById('ssUnitList');
    if (!state.currentViewSSCourseId) return;

    const units = state.ssUnits.filter(u => u.courseId === state.currentViewSSCourseId);

    if (units.length === 0) {
        list.innerHTML = '<div class="text-center py-20 text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">這個課程還沒有任何單元，等星族來補充喵 🐾</div>';
        return;
    }

    list.innerHTML = units.map(u => `
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all relative">
            ${state.isAdmin ? `
            <div class="absolute top-4 right-4 flex gap-2">
                <button data-action="edit-ss-unit" data-id="${u.id}" class="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button>
                <button data-action="delete" data-type="ssUnit" data-id="${u.id}" class="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
            </div>` : ''}

            <h4 class="text-xl font-black text-slate-900 mb-3 pr-20">${escapeHTML(u.title)}</h4>

            ${u.description ? `<p class="text-slate-600 text-sm font-medium mb-5 bg-slate-50 p-4 rounded-2xl whitespace-pre-line leading-relaxed">${escapeHTML(u.description)}</p>` : ''}

            <div class="flex flex-wrap gap-3">
                ${u.ytUrl ? `<a href="${escapeHTML(u.ytUrl)}" target="_blank" class="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition border border-red-100 text-sm"><i data-lucide="youtube" class="w-4 h-4"></i> 觀看影片</a>` : ''}
                ${u.driveUrl ? `<a href="${escapeHTML(u.driveUrl)}" target="_blank" class="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition border border-blue-100 text-sm"><i data-lucide="hard-drive" class="w-4 h-4"></i> 雲端筆記</a>` : ''}
                ${u.hwUrl ? `<a href="${escapeHTML(u.hwUrl)}" target="_blank" class="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 font-bold rounded-xl hover:bg-amber-100 transition border border-amber-100 text-sm"><i data-lucide="file-text" class="w-4 h-4"></i> 課程作業</a>` : ''}
                ${u.ansUrl ? `<a href="${escapeHTML(u.ansUrl)}" target="_blank" class="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition border border-indigo-100 text-sm"><i data-lucide="check-circle" class="w-4 h-4"></i> 作業解答</a>` : ''}
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

export function openSelfStudyDetails(ssCourseId) {
    state.currentViewSSCourseId = ssCourseId;
    const c = state.ssCourses.find(x => x.id === ssCourseId);
    if (!c) return;

    document.getElementById('page-self-study-main').classList.add('hidden');
    document.getElementById('page-self-study-details').classList.remove('hidden');

    document.getElementById('ssDetailsTitle').textContent = c.title;
    document.getElementById('ssDetailsLinkedCourse').textContent = c.linkedCourseName || "未連結學校課程";

    renderSelfStudyUnits();
    lucide.createIcons();
    setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
}

function openSSCourseModal(id) {
    const modal = document.getElementById('ssCourseModal');
    const select = document.getElementById('ssCourseSelect');

    select.innerHTML = '<option value="" disabled selected>選擇關聯的學校課程...</option>';
    state.courses.forEach(course => {
        const opt = document.createElement('option');
        opt.value = course.id;
        opt.textContent = course.name;
        select.appendChild(opt);
    });

    if (id) {
        const c = state.ssCourses.find(x => x.id === id);
        if (!c) return;
        document.getElementById('ssCourseModalTitle').textContent = "編輯自學課程";
        document.getElementById('editSSCourseId').value = c.id;
        document.getElementById('ssCourseTitle').value = c.title;
        select.value = c.linkedCourseId || "";
    } else {
        document.getElementById('ssCourseModalTitle').textContent = "新增自學課程";
        document.getElementById('editSSCourseId').value = '';
        document.getElementById('ssCourseTitle').value = '';
        select.value = "";
    }
    modal.classList.remove('hidden');
}

function openSSUnitModal(id) {
    const modal = document.getElementById('ssUnitModal');

    if (id) {
        const u = state.ssUnits.find(x => x.id === id);
        if (!u) return;
        document.getElementById('ssUnitModalTitle').textContent = "編輯自學單元";
        document.getElementById('editSSUnitId').value = u.id;
        document.getElementById('ssUnitTitle').value = u.title;
        document.getElementById('ssUnitYtUrl').value = u.ytUrl || '';
        document.getElementById('ssUnitDriveUrl').value = u.driveUrl || '';
        document.getElementById('ssUnitHwUrl').value = u.hwUrl || '';
        document.getElementById('ssUnitAnsUrl').value = u.ansUrl || '';
        document.getElementById('ssUnitDescription').value = u.description || '';
    } else {
        document.getElementById('ssUnitModalTitle').textContent = "新增自學單元";
        document.getElementById('editSSUnitId').value = '';
        document.getElementById('ssUnitTitle').value = '';
        document.getElementById('ssUnitYtUrl').value = '';
        document.getElementById('ssUnitDriveUrl').value = '';
        document.getElementById('ssUnitHwUrl').value = '';
        document.getElementById('ssUnitAnsUrl').value = '';
        document.getElementById('ssUnitDescription').value = '';
    }
    modal.classList.remove('hidden');
}

export function initSelfStudy() {
    onSnapshot(collection(db, SS_COURSES_PATH), (snapshot) => {
        state.ssCourses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.ssCourses.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        renderSelfStudyCourses();
    });

    onSnapshot(collection(db, SS_UNITS_PATH), (snapshot) => {
        state.ssUnits = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.ssUnits.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (state.currentViewSSCourseId) renderSelfStudyUnits();
    });

    document.getElementById('backToSSCoursesBtn').onclick = () => {
        state.currentViewSSCourseId = null;
        document.getElementById('page-self-study-details').classList.add('hidden');
        document.getElementById('page-self-study-main').classList.remove('hidden');
    };

    document.getElementById('addSelfStudyCourseBtn').onclick = () => openSSCourseModal(null);
    document.getElementById('closeSSCourseModal').onclick = () => document.getElementById('ssCourseModal').classList.add('hidden');

    document.getElementById('confirmSaveSSCourse').onclick = async () => {
        const id = document.getElementById('editSSCourseId').value;
        const title = document.getElementById('ssCourseTitle').value.trim();
        const linkedCourseId = document.getElementById('ssCourseSelect').value;

        if (!isValidText(title, 80)) return showToast("喵，自學課程名稱請在 80 字以內！");
        if (!linkedCourseId) return showToast("請選擇關聯的學校課程！");

        try {
            const linkedCourse = state.courses.find(c => c.id === linkedCourseId);
            const payload = { title, linkedCourseId, linkedCourseName: linkedCourse ? linkedCourse.name : "" };

            if (id) {
                await updateDoc(doc(db, SS_COURSES_PATH, id), payload);
                showToast("自學課程更新成功 🐾");
            } else {
                await setDoc(doc(collection(db, SS_COURSES_PATH)), { ...payload, createdAt: Date.now() });
                showToast("自學課程新增成功 🐾");
            }
            document.getElementById('ssCourseModal').classList.add('hidden');
        } catch (err) { showToast("儲存失敗喵..."); }
    };

    document.getElementById('addSelfStudyUnitBtn').onclick = () => {
        if (!state.currentViewSSCourseId) return;
        openSSUnitModal(null);
    };
    document.getElementById('closeSSUnitModal').onclick = () => document.getElementById('ssUnitModal').classList.add('hidden');

    document.getElementById('confirmSaveSSUnit').onclick = async () => {
        const id = document.getElementById('editSSUnitId').value;
        const title = document.getElementById('ssUnitTitle').value.trim();
        const ytUrl = document.getElementById('ssUnitYtUrl').value.trim();
        const driveUrl = document.getElementById('ssUnitDriveUrl').value.trim();
        const hwUrl = document.getElementById('ssUnitHwUrl').value.trim();
        const ansUrl = document.getElementById('ssUnitAnsUrl').value.trim();
        const description = document.getElementById('ssUnitDescription').value.trim();

        if (!isValidText(title, 80)) return showToast("喵，單元名稱請在 80 字以內！");
        if (!isValidUrl(ytUrl) || !isValidUrl(driveUrl) || !isValidUrl(hwUrl) || !isValidUrl(ansUrl)) return showToast("有連結格式不正確喔！");
        if (description && !isValidText(description, 1000)) return showToast("單元介紹請在 1000 字以內！");

        try {
            const payload = { courseId: state.currentViewSSCourseId, title, ytUrl, driveUrl, hwUrl, ansUrl, description };

            if (id) {
                await updateDoc(doc(db, SS_UNITS_PATH, id), payload);
                showToast("單元更新成功 🐾");
            } else {
                await setDoc(doc(collection(db, SS_UNITS_PATH)), { ...payload, createdAt: Date.now() });
                showToast("單元新增成功 🐾");
            }
            document.getElementById('ssUnitModal').classList.add('hidden');
        } catch (err) { showToast("儲存失敗喵..."); }
    };

    document.addEventListener('click', (e) => {
        const openSSCourseTarget = e.target.closest('[data-action="open-ss-course"]');
        if (openSSCourseTarget) { openSelfStudyDetails(openSSCourseTarget.dataset.id); return; }

        const editSSCourseTarget = e.target.closest('[data-action="edit-ss-course"]');
        if (editSSCourseTarget) { e.stopPropagation(); openSSCourseModal(editSSCourseTarget.dataset.id); return; }

        const editSSUnitTarget = e.target.closest('[data-action="edit-ss-unit"]');
        if (editSSUnitTarget) { e.stopPropagation(); openSSUnitModal(editSSUnitTarget.dataset.id); return; }
    });
}
