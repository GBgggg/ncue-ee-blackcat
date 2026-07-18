// 課程地圖：課程卡片列表、單一課程詳細頁、新增課程 Modal、分類篩選下拉選單、
// 管理員可直接在卡片上調整的課程特性 (遠距/點名/分組)。
import { collection, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { COURSES_PATH, yearMap, semMap } from './constants.js';
import { state } from './state.js';
import { escapeHTML, isValidText, showToast } from './utils.js';
import { renderReviewWizard, renderReviews } from './reviews.js';
import { renderMaterials } from './materials.js';

export function renderCourseSelect() {
    const selects = [
        document.getElementById('uploadCourseSelect'),
        document.getElementById('kahootCourseSelect')
    ];
    selects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="" disabled selected>請選擇課程...</option>';
        state.courses.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.name} (${c.instructor})`;
            select.appendChild(opt);
        });
        if (currentVal) select.value = currentVal;
    });
}

export function renderCourseGrid() {
    const grid = document.getElementById('courseGrid');
    if (state.courses.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400 bg-white rounded-3xl border border-slate-100">小黑貓還在抓老鼠，目前沒有課程喔。</div>';
        return;
    }
    const filteredCourses = state.courses.filter(c => {
        const matchSearch = (c.name || "").toLowerCase().includes(state.searchQuery.toLowerCase()) ||
            (c.instructor || "").toLowerCase().includes(state.searchQuery.toLowerCase());
        let matchSemester = true;
        if (state.activeSemesterFilter !== 'all') {
            if (state.activeSemesterFilter === 'elective' || state.activeSemesterFilter === 'other') {
                matchSemester = (c.year === state.activeSemesterFilter);
            } else {
                const [filterYear, filterSem] = state.activeSemesterFilter.split('-');
                matchSemester = (c.year === filterYear) && (c.semester === filterSem);
            }
        }
        return matchSearch && matchSemester;
    });

    if (filteredCourses.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400 bg-white rounded-3xl border border-slate-100">找不到符合條件的課程，是不是貓咪記錯了？</div>';
        return;
    }

    grid.innerHTML = filteredCourses.map(course => {
        const courseReviews = state.reviews.filter(r => r.courseId === course.id);
        const reviewCount = courseReviews.length;
        let avgCD = "-", avgED = "-", avgHW = "-", avgLN = "-";

        if (reviewCount > 0) {
            avgCD = (courseReviews.reduce((sum, r) => sum + (r.courseDiff || 0), 0) / reviewCount).toFixed(1);
            avgED = (courseReviews.reduce((sum, r) => sum + (r.examDiff || 0), 0) / reviewCount).toFixed(1);
            avgHW = (courseReviews.reduce((sum, r) => sum + (r.hwAmount || 0), 0) / reviewCount).toFixed(1);
            avgLN = (courseReviews.reduce((sum, r) => sum + (r.learned || 0), 0) / reviewCount).toFixed(1);
        }

        let tagText = '未分類';
        if (course.year === 'elective') tagText = '系選修';
        else if (course.year === 'other') tagText = '其他';
        else if (course.year && course.semester) tagText = `${yearMap[course.year]} ${semMap[course.semester]}`;

        const remoteVal = course.isRemote || '未設定';
        const rollCallVal = course.isRollCall || '未設定';
        const groupVal = course.groupActivity || '未設定';

        let featureSection = '';
        if (state.isAdmin) {
            featureSection = `
                <div class="mt-3 flex flex-wrap gap-2">
                    <select data-action="update-course-feature" data-id="${course.id}" data-field="isRemote" class="text-xs bg-slate-100 rounded-lg px-2 py-1 border border-slate-200 focus:outline-none font-bold text-slate-600 pointer-events-auto">
                        <option value="是" ${remoteVal === '是' ? 'selected' : ''}>遠距: 是</option>
                        <option value="否" ${remoteVal === '否' ? 'selected' : ''}>遠距: 否</option>
                        <option value="未設定" ${remoteVal === '未設定' ? 'selected' : ''}>遠距: 未定</option>
                    </select>
                    <select data-action="update-course-feature" data-id="${course.id}" data-field="isRollCall" class="text-xs bg-slate-100 rounded-lg px-2 py-1 border border-slate-200 focus:outline-none font-bold text-slate-600 pointer-events-auto">
                        <option value="是" ${rollCallVal === '是' ? 'selected' : ''}>點名: 是</option>
                        <option value="否" ${rollCallVal === '否' ? 'selected' : ''}>點名: 否</option>
                        <option value="未設定" ${rollCallVal === '未設定' ? 'selected' : ''}>點名: 未定</option>
                    </select>
                    <select data-action="update-course-feature" data-id="${course.id}" data-field="groupActivity" class="text-xs bg-slate-100 rounded-lg px-2 py-1 border border-slate-200 focus:outline-none font-bold text-slate-600 pointer-events-auto">
                        <option value="老師分組" ${groupVal === '老師分組' ? 'selected' : ''}>分組: 老師</option>
                        <option value="自由分組" ${groupVal === '自由分組' ? 'selected' : ''}>分組: 自由</option>
                        <option value="否" ${groupVal === '否' ? 'selected' : ''}>分組: 無</option>
                        <option value="未設定" ${groupVal === '未設定' ? 'selected' : ''}>分組: 未定</option>
                    </select>
                </div>
            `;
        } else {
            featureSection = `
                <div class="mt-3 flex flex-wrap gap-2 text-[10px] uppercase font-black tracking-widest pointer-events-none">
                    <span class="px-2 py-1 bg-blue-50 text-blue-600 rounded-md border border-blue-100">遠距: ${remoteVal}</span>
                    <span class="px-2 py-1 bg-amber-50 text-amber-600 rounded-md border border-amber-100">點名: ${rollCallVal}</span>
                    <span class="px-2 py-1 bg-fuchsia-50 text-fuchsia-600 rounded-md border border-fuchsia-100">分組: ${groupVal}</span>
                </div>
            `;
        }

        return `
        <div data-action="toggle-course" data-id="${course.id}" data-name="${escapeHTML(course.name)}" class="cat-card cursor-pointer bg-white rounded-3xl p-6 shadow-sm border-2 transition-all hover:shadow-xl flex flex-col border-slate-100 hover:border-emerald-300">
            <div class="mb-3 flex justify-between items-start">
                <span class="inline-block text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded border border-emerald-200 pointer-events-none">${tagText}</span>
                <div class="flex items-center gap-2">
                    <div class="text-slate-400 font-bold text-[10px] bg-slate-50 px-3 py-1 rounded-full uppercase pointer-events-none whitespace-nowrap">${reviewCount} 貓評</div>
                    ${state.isAdmin ? `<button data-action="delete" data-type="course" data-id="${course.id}" class="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i></button>` : ''}
                </div>
            </div>
            <div class="flex justify-between items-start mb-2">
                <div class="overflow-hidden pointer-events-none w-full">
                    <h4 class="text-lg font-black text-slate-900 truncate w-full">${escapeHTML(course.name)}</h4>
                    <p class="text-sm text-emerald-600 font-bold flex items-center gap-1 mt-1"><i data-lucide="user" class="w-3 h-3"></i> ${escapeHTML(course.instructor)}</p>
                    ${featureSection}
                </div>
            </div>
            <div class="mt-auto grid grid-cols-2 gap-3 text-xs font-bold bg-slate-50 p-3 rounded-2xl pointer-events-none">
                <div class="flex justify-between items-center text-slate-500"><span class="flex items-center gap-1"><i data-lucide="book-open" class="w-3 h-3 text-emerald-500"></i> 課程難度</span><span class="text-slate-700">${avgCD}</span></div>
                <div class="flex justify-between items-center text-slate-500"><span class="flex items-center gap-1"><i data-lucide="pen-tool" class="w-3 h-3 text-rose-500"></i> 考試難度</span><span class="text-slate-700">${avgED}</span></div>
                <div class="flex justify-between items-center text-slate-500"><span class="flex items-center gap-1"><i data-lucide="layers" class="w-3 h-3 text-amber-500"></i> 作業多寡</span><span class="text-slate-700">${avgHW}</span></div>
                <div class="flex justify-between items-center text-slate-500"><span class="flex items-center gap-1"><i data-lucide="brain" class="w-3 h-3 text-blue-500"></i> 學到多少</span><span class="text-slate-700">${avgLN}</span></div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

export function openCourseDetails(courseId) {
    state.selectedFilterCourseId = courseId;
    const course = state.courses.find(c => c.id === courseId);
    if (!course) return;

    document.getElementById('course-list-view').classList.add('hidden');
    document.getElementById('evaluationHero').classList.add('hidden');
    document.getElementById('course-detail-view').classList.remove('hidden');

    document.getElementById('detailCourseTitle').textContent = course.name;
    document.getElementById('detailCourseInstructor').innerHTML = `<i data-lucide="user" class="w-4 h-4"></i> ${escapeHTML(course.instructor)}`;

    const remoteVal = course.isRemote || '未設定';
    const rollCallVal = course.isRollCall || '未設定';
    const groupVal = course.groupActivity || '未設定';
    document.getElementById('detailCourseFeatures').innerHTML = `
        <span class="px-3 py-1.5 bg-white/10 border border-white/20 rounded-xl text-xs font-bold text-blue-300">是否遠距：${remoteVal}</span>
        <span class="px-3 py-1.5 bg-white/10 border border-white/20 rounded-xl text-xs font-bold text-amber-300">是否點名：${rollCallVal}</span>
        <span class="px-3 py-1.5 bg-white/10 border border-white/20 rounded-xl text-xs font-bold text-fuchsia-300">分組活動：${groupVal}</span>
    `;

    renderReviews();
    renderMaterials();
    lucide.createIcons();

    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
}

export function initCourses() {
    onSnapshot(collection(db, COURSES_PATH), (snapshot) => {
        state.courses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCourseSelect();
        renderCourseGrid();
        if (state.reviewWizardStep === 0) renderReviewWizard();
    });

    document.getElementById('backToCoursesBtn').onclick = () => {
        state.selectedFilterCourseId = null;
        document.getElementById('course-detail-view').classList.add('hidden');
        document.getElementById('course-list-view').classList.remove('hidden');
        document.getElementById('evaluationHero').classList.remove('hidden');
    };

    document.getElementById('closeCourseModal').onclick = () => document.getElementById('courseModal').classList.add('hidden');

    document.getElementById('confirmAddCourse').onclick = async () => {
        if (state.currentUserLevel < 4) return showToast("喵，權限不足喔！");

        const name = document.getElementById('newCourseName').value.trim();
        const instructor = document.getElementById('newInstructor').value.trim();
        const year = document.getElementById('newCourseYear').value;
        const semester = document.getElementById('newCourseSemester').value || "";

        if (!isValidText(name, 50)) return showToast("喵，課程名稱太長或格式不對！(最多50字)");
        if (!isValidText(instructor, 30)) return showToast("喵，教授姓名太長囉！(最多30字)");

        const isRemote = document.getElementById('newCourseRemote').value || "未設定";
        const isRollCall = document.getElementById('newCourseRollCall').value || "未設定";
        const groupActivity = document.getElementById('newCourseGroup').value || "未設定";

        if (!name || !instructor || !year || (!['elective', 'other'].includes(year) && !semester)) {
            return showToast("喵，一般課程的年級與學期都要填寫喔！(系選修/其他可免填學期)");
        }

        const btn = document.getElementById('confirmAddCourse');
        btn.disabled = true;
        btn.textContent = "新增中...";

        try {
            const newDocRef = doc(collection(db, COURSES_PATH));
            await setDoc(newDocRef, {
                name: name,
                instructor: instructor,
                year, semester, isRemote, isRollCall, groupActivity,
                createdAt: Date.now()
            });
            showToast("太棒了，小黑貓已經把新課程記下來了 🐾");
            document.getElementById('newCourseName').value = '';
            document.getElementById('newInstructor').value = '';
            document.getElementById('newCourseYear').value = '';
            document.getElementById('newCourseSemester').value = '';
            document.getElementById('newCourseRemote').value = '';
            document.getElementById('newCourseRollCall').value = '';
            document.getElementById('newCourseGroup').value = '';
            document.getElementById('courseModal').classList.add('hidden');
        } catch (err) {
            showToast("新增失敗喵...");
        } finally {
            btn.disabled = false;
            btn.textContent = "新增這門課";
        }
    };

    // 分類篩選下拉選單
    document.addEventListener('click', (e) => {
        const filterToggleBtn = e.target.closest('#courseFilterToggle');
        const courseFilterDropdown = document.getElementById('courseFilterDropdown');
        const filterChevron = document.getElementById('filterChevron');

        if (filterToggleBtn) {
            const isHidden = courseFilterDropdown.classList.contains('hidden');
            courseFilterDropdown.classList.toggle('hidden');
            if (isHidden) { filterChevron.classList.add('rotate-180'); }
            else { filterChevron.classList.remove('rotate-180'); }
            return;
        }

        if (courseFilterDropdown && !courseFilterDropdown.classList.contains('hidden') && !e.target.closest('#courseFilterContainer')) {
            courseFilterDropdown.classList.add('hidden');
            filterChevron.classList.remove('rotate-180');
        }

        const filterDropdownBtn = e.target.closest('.filter-dropdown-btn');
        if (filterDropdownBtn) {
            document.querySelectorAll('.filter-dropdown-btn').forEach(btn => {
                btn.classList.remove('bg-emerald-50', 'text-emerald-600');
                btn.classList.add('text-slate-600');
            });

            filterDropdownBtn.classList.remove('text-slate-600');
            filterDropdownBtn.classList.add('bg-emerald-50', 'text-emerald-600');
            document.getElementById('currentFilterText').innerHTML = `<i data-lucide="filter" class="w-4 h-4"></i> 分類：${filterDropdownBtn.textContent}`;
            lucide.createIcons();

            courseFilterDropdown.classList.add('hidden');
            filterChevron.classList.remove('rotate-180');
            state.activeSemesterFilter = filterDropdownBtn.dataset.filterTag;
            renderCourseGrid();
            return;
        }

        // 點卡片切換到課程詳細頁
        const toggleCourseTarget = e.target.closest('[data-action="toggle-course"]');
        if (toggleCourseTarget && e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') {
            openCourseDetails(toggleCourseTarget.dataset.id);
            return;
        }

        // 從評價精靈第一步跳出的「找不到？點我新增課程」
        const openAddCourseTarget = e.target.closest('[data-action="open-add-course"]');
        if (openAddCourseTarget) {
            if (state.currentUserLevel < 4) return showToast("喵，你的階位還不夠新增課程喔！");
            document.getElementById('courseModal').classList.remove('hidden');
        }
    });

    // 管理員直接在卡片上調整課程特性
    document.addEventListener('change', (e) => {
        if (e.target.dataset.action === 'update-course-feature') {
            const courseId = e.target.dataset.id;
            const field = e.target.dataset.field;
            const value = e.target.value;
            updateCourseFeature(courseId, field, value);
        }
    });
}

async function updateCourseFeature(courseId, field, value) {
    try {
        await updateDoc(doc(db, COURSES_PATH, courseId), { [field]: value });
        showToast("課程特性更新成功 🐾");
    } catch (err) {
        showToast("更新失敗喵...");
        console.error(err);
    }
}
