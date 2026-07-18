// 課程評價：右側的多步驟「評價精靈」，以及課程詳細頁下方的評價列表。
import { collection, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { REVIEWS_PATH, reviewQuestions, reviewLabels, reviewBtnColors, reviewShapes } from './constants.js';
import { state } from './state.js';
import { escapeHTML, isValidText, drawMetricDots, showToast } from './utils.js';
import { renderCourseGrid } from './courses.js';

export function renderReviewWizard() {
    const container = document.getElementById('reviewWizardBody');
    const indicator = document.getElementById('reviewStepIndicator');
    if (!container) return;

    if (state.reviewWizardStep === 0) {
        indicator.classList.add('hidden');
        container.innerHTML = `
            <div class="space-y-6 animate-[slideUp_0.2s_ease-out]">
                <div class="text-center">
                    <div class="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 rounded-full mb-3 text-emerald-500 shadow-inner">
                        <i data-lucide="paw-print" class="w-10 h-10"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-500">喵，你想為哪門課留下足跡？</p>
                </div>
                <div>
                    <select id="wizardCourseSelect" class="w-full px-5 py-4 bg-slate-50 rounded-2xl border-2 border-slate-200 focus:border-emerald-500 font-bold text-slate-700 appearance-none transition-all outline-none">
                        <option value="" disabled selected>請選擇課程...</option>
                        ${state.courses.map(c => `<option value="${c.id}" ${state.reviewWizardData.courseId === c.id ? 'selected' : ''}>${escapeHTML(c.name)} (${escapeHTML(c.instructor)})</option>`).join('')}
                    </select>
                </div>
                ${state.currentUserLevel >= 4 ? `
                <button data-action="open-add-course" class="w-full py-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-100">
                    找不到？點我新增課程
                </button>
                ` : ''}
                <button data-action="next-review-step" class="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-lg hover:bg-slate-800 transition-all flex justify-center items-center gap-2">
                    開始評價 <i data-lucide="arrow-right" class="w-5 h-5 pointer-events-none"></i>
                </button>
            </div>
        `;
        lucide.createIcons();
    } else if (state.reviewWizardStep >= 1 && state.reviewWizardStep <= 4) {
        indicator.classList.remove('hidden');
        indicator.textContent = `${state.reviewWizardStep} / 5`;
        const q = reviewQuestions[state.reviewWizardStep - 1];

        let buttonsHTML = '<div class="grid grid-cols-2 gap-3 mb-3">';
        for (let i = 0; i < 4; i++) {
            buttonsHTML += `<button data-action="set-review-score" data-score="${i + 1}" class="kahoot-btn py-5 ${reviewBtnColors[i]} text-white rounded-2xl font-black shadow-md border-b-[6px] flex flex-col items-center justify-center gap-2 leading-tight">
                <div class="flex items-center gap-2 pointer-events-none">${reviewShapes[i]} <span class="text-2xl">${i + 1}</span></div>
                <span class="text-sm pointer-events-none opacity-90">${reviewLabels[q.id][i]}</span>
            </button>`;
        }
        buttonsHTML += `</div>`;
        buttonsHTML += `<button data-action="set-review-score" data-score="5" class="kahoot-btn w-full py-5 ${reviewBtnColors[4]} text-white rounded-2xl font-black shadow-md border-b-[6px] flex flex-col items-center justify-center gap-2 leading-tight mb-4">
            <div class="flex items-center gap-2 pointer-events-none">${reviewShapes[4]} <span class="text-2xl">5</span></div>
            <span class="text-sm pointer-events-none opacity-90">${reviewLabels[q.id][4]}</span>
        </button>`;

        container.innerHTML = `
            <div class="flex flex-col h-full justify-center animate-[slideUp_0.2s_ease-out]">
                <h4 class="text-2xl font-black text-slate-900 text-center mb-6">${q.title}</h4>
                ${buttonsHTML}
                <button data-action="prev-review-step" class="mt-2 text-sm font-bold text-slate-400 hover:text-slate-700 flex items-center justify-center gap-1 mx-auto transition-colors">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> 上一題
                </button>
            </div>
        `;
        lucide.createIcons();
    } else if (state.reviewWizardStep === 5) {
        indicator.textContent = `5 / 5`;
        container.innerHTML = `
            <div class="flex flex-col h-full animate-[slideUp_0.2s_ease-out]">
                <h4 class="text-xl font-black text-slate-900 mb-2">最後一步：修課心得</h4>
                <p class="text-xs font-medium text-slate-400 mb-4">喵，分享一下這門課的有趣（或是痛苦）之處吧...</p>
                <textarea id="wizardComment" maxlength="500" class="w-full px-4 py-4 bg-slate-50 rounded-2xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none flex-1 min-h-[160px] resize-none transition-all font-medium mb-5 text-slate-700 placeholder:text-slate-400" placeholder="這門課有什麼特別的嗎？..."></textarea>
                <div class="flex gap-3">
                    <button data-action="prev-review-step" class="px-5 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center">
                        <i data-lucide="arrow-left" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                    <button data-action="submit-wizard-review" class="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black text-lg shadow-lg shadow-emerald-200 hover:bg-emerald-400 transition-all transform active:scale-95 flex items-center justify-center gap-2">
                        正式送出評價 <i data-lucide="send" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `;
        lucide.createIcons();
        if (state.reviewWizardData.comment) document.getElementById('wizardComment').value = state.reviewWizardData.comment;
    }
}

export function renderReviews() {
    const list = document.getElementById('reviewsList');

    const filtered = state.reviews.filter(r => {
        const matchSearch = (r.courseName || "").toLowerCase().includes(state.searchQuery.toLowerCase()) ||
            (r.instructor || "").toLowerCase().includes(state.searchQuery.toLowerCase()) ||
            (r.comment || "").toLowerCase().includes(state.searchQuery.toLowerCase());
        const matchCourseFilter = r.courseId === state.selectedFilterCourseId;
        return matchSearch && matchCourseFilter;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div class="text-center py-20 text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">目前這門課還沒有評價，安靜地像一隻正在睡覺的貓。</div>`;
        return;
    }
    list.innerHTML = filtered.map(r => `
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all">
            <div class="flex justify-between items-start mb-5">
                <div>
                    <h4 class="text-xl font-black text-slate-900">${escapeHTML(r.courseName)}</h4>
                    <p class="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-2"><span>@${escapeHTML(r.instructor)}</span><span class="text-slate-300">|</span><span class="text-slate-400">${escapeHTML(r.date || '')}</span></p>
                </div>
                ${state.isAdmin ? `<button data-action="delete" data-type="review" data-id="${r.id}" class="p-2 text-red-200 hover:text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i></button>` : ''}
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 p-4 bg-slate-50 rounded-2xl">
                <div class="flex flex-col gap-1.5"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">課程難度</span><div class="flex gap-1">${drawMetricDots(r.courseDiff, 'bg-emerald-500')}</div></div>
                <div class="flex flex-col gap-1.5"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">考試難度</span><div class="flex gap-1">${drawMetricDots(r.examDiff, 'bg-rose-500')}</div></div>
                <div class="flex flex-col gap-1.5"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">作業多寡</span><div class="flex gap-1">${drawMetricDots(r.hwAmount, 'bg-amber-500')}</div></div>
                <div class="flex flex-col gap-1.5"><span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">學到多少</span><div class="flex gap-1">${drawMetricDots(r.learned, 'bg-blue-500')}</div></div>
            </div>
            <div class="text-slate-700 leading-relaxed font-medium italic relative"><i data-lucide="paw-print" class="absolute -left-2 -top-2 w-6 h-6 text-slate-200 opacity-30"></i>「${escapeHTML(r.comment)}」</div>
        </div>
    `).join('');
    lucide.createIcons();
}

async function submitWizardReview() {
    const commentBox = document.getElementById('wizardComment');
    if (!commentBox) return;
    const comment = commentBox.value.trim();

    if (!isValidText(comment, 500)) {
        return showToast("喵，心得內容請限制在 1 到 500 字以內喔！");
    }
    state.reviewWizardData.comment = comment;

    const d = state.reviewWizardData;
    if (!d.courseId || !comment || d.courseDiff === 0 || d.examDiff === 0 || d.hwAmount === 0 || d.learned === 0) {
        return showToast("喵，最後的心得也要填寫完整才能送出喔！");
    }

    const btn = document.querySelector('[data-action="submit-wizard-review"]');
    if (btn) btn.disabled = true;

    try {
        const course = state.courses.find(c => c.id === d.courseId);
        const newDoc = doc(collection(db, REVIEWS_PATH));

        await setDoc(newDoc, {
            courseId: d.courseId,
            courseName: course.name,
            instructor: course.instructor,
            semester: "未提供學期",
            courseDiff: d.courseDiff,
            examDiff: d.examDiff,
            hwAmount: d.hwAmount,
            learned: d.learned,
            comment: comment,
            date: new Date().toLocaleDateString(),
            createdAt: Date.now()
        });

        state.reviewWizardStep = 0;
        state.reviewWizardData = { courseId: "", courseDiff: 0, examDiff: 0, hwAmount: 0, learned: 0, comment: "" };
        renderReviewWizard();
        showToast("評價送出啦，小黑貓收到你的心血了 🐾");
    } catch (err) {
        showToast("失敗喵...");
        if (btn) btn.disabled = false;
    }
}

export function initReviews() {
    onSnapshot(collection(db, REVIEWS_PATH), (snapshot) => {
        state.reviews = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.reviews.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderReviews();
        renderCourseGrid();
    });

    document.addEventListener('click', (e) => {
        const nextReviewStepTarget = e.target.closest('[data-action="next-review-step"]');
        if (nextReviewStepTarget) {
            const select = document.getElementById('wizardCourseSelect');
            if (state.reviewWizardStep === 0) {
                if (!select || !select.value) return showToast("請先選擇一門課程喵！");
                state.reviewWizardData.courseId = select.value;
            }
            state.reviewWizardStep++;
            renderReviewWizard();
            return;
        }

        const setReviewScoreTarget = e.target.closest('[data-action="set-review-score"]');
        if (setReviewScoreTarget) {
            if (state.isWizardTransitioning) return;
            state.isWizardTransitioning = true;

            const score = parseInt(setReviewScoreTarget.dataset.score);
            const q = reviewQuestions[state.reviewWizardStep - 1];
            state.reviewWizardData[q.id] = score;

            setTimeout(() => {
                state.reviewWizardStep++;
                renderReviewWizard();
                state.isWizardTransitioning = false;
            }, 150);
            return;
        }

        const prevReviewStepTarget = e.target.closest('[data-action="prev-review-step"]');
        if (prevReviewStepTarget) {
            if (state.reviewWizardStep === 5) {
                const commentBox = document.getElementById('wizardComment');
                if (commentBox) state.reviewWizardData.comment = commentBox.value;
            }
            if (state.reviewWizardStep > 0) {
                state.reviewWizardStep--;
                renderReviewWizard();
            }
            return;
        }

        const submitWizardReviewTarget = e.target.closest('[data-action="submit-wizard-review"]');
        if (submitWizardReviewTarget) { submitWizardReview(); return; }
    });
}
