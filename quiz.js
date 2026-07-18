// 挑戰擂台 (Kahoot 風格測驗)：測驗清單、建立/編輯測驗與題目草稿、實際作答流程與結算畫面。
import { collection, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { KAHOOTS_PATH, MAX_KAHOOT_QUESTIONS } from './constants.js';
import { state } from './state.js';
import { escapeHTML, isValidText, showToast } from './utils.js';

export function renderKahoots() {
    const list = document.getElementById('kahootList');
    if (state.currentUserLevel < 2) {
        list.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400 font-medium bg-white rounded-3xl border border-slate-100"><i data-lucide="lock" class="w-6 h-6 mx-auto mb-2 text-emerald-300"></i> 升級為【戰士】後即可解鎖挑戰擂台！</div>`;
        lucide.createIcons();
        return;
    }

    const filtered = state.kahoots.filter(k => {
        const matchSearch = (k.title || "").toLowerCase().includes(state.searchQuery.toLowerCase()) || (k.courseName || "").toLowerCase().includes(state.searchQuery.toLowerCase());
        return matchSearch;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">目前沒有相關挑戰，自己做一個吧！</div>`;
        return;
    }

    list.innerHTML = filtered.map(k => `
        <div class="bg-white rounded-3xl p-5 shadow-sm border-2 border-slate-100 hover:border-emerald-300 transition-all flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-xl font-black text-slate-900">${escapeHTML(k.title)}</h4>
                    ${state.isAdmin ? `
                    <div class="flex gap-2">
                        ${state.currentUserLevel === 5 ? `<button data-action="edit-kahoot" data-id="${k.id}" class="text-slate-300 hover:text-blue-500"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button>` : ''}
                        <button data-action="delete" data-type="kahoot" data-id="${k.id}" class="text-slate-300 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
                    </div>` : ''}
                </div>
                <p class="text-sm text-emerald-600 font-bold mb-4 flex items-center gap-1"><i data-lucide="book" class="w-3 h-3"></i> ${escapeHTML(k.courseName)}</p>
                <p class="text-xs text-slate-400 font-medium mb-4">共 ${k.questions ? k.questions.length : 0} 題</p>
            </div>
            <button data-action="start-kahoot" data-id="${k.id}" class="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-md hover:bg-emerald-400 transition-colors flex justify-center items-center gap-2">
                <i data-lucide="play" class="w-4 h-4 fill-white pointer-events-none"></i> 開始測驗
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

function resetDraftQuestionForm() {
    state.editingDraftQIndex = null;
    const btn = document.getElementById('addDraftQuestionBtn');
    btn.textContent = "將此題加入測驗";
    btn.className = "w-full py-2 bg-emerald-500 text-white rounded-xl font-bold shadow-md hover:bg-emerald-600 transition-colors text-sm";

    document.getElementById('qText').value = '';
    document.getElementById('opt0').value = '';
    document.getElementById('opt1').value = '';
    document.getElementById('opt2').value = '';
    document.getElementById('opt3').value = '';
    const checkedRadio = document.querySelector('input[name="correctOpt"]:checked');
    if (checkedRadio) checkedRadio.checked = false;
}

function renderDraftQuestions() {
    const list = document.getElementById('draftQuestionsList');
    document.getElementById('draftQCount').textContent = state.draftQuestions.length;
    if (state.draftQuestions.length === 0) {
        list.innerHTML = "還沒有題目，請在下方新增。";
        return;
    }
    list.innerHTML = state.draftQuestions.map((item, idx) => `
        <div class="flex justify-between items-center p-2 bg-white rounded-lg shadow-sm">
            <span class="truncate pr-2">Q${idx + 1}: ${escapeHTML(item.q)}</span>
            <div class="flex shrink-0">
                <button data-action="edit-draft-q" data-index="${idx}" class="text-blue-400 hover:text-blue-600 mr-3">
                    <i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i>
                </button>
                <button data-action="remove-draft-q" data-index="${idx}" class="text-red-400 hover:text-red-600">
                    <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function editDraftQ(idx) {
    const q = state.draftQuestions[idx];
    document.getElementById('qText').value = q.q;
    document.getElementById('opt0').value = q.options[0];
    document.getElementById('opt1').value = q.options[1];
    document.getElementById('opt2').value = q.options[2];
    document.getElementById('opt3').value = q.options[3];
    const correctRadio = document.querySelector(`input[name="correctOpt"][value="${q.correctIdx}"]`);
    if (correctRadio) correctRadio.checked = true;

    state.editingDraftQIndex = idx;
    const btn = document.getElementById('addDraftQuestionBtn');
    btn.textContent = "更新此題目";
    btn.className = "w-full py-2 bg-blue-500 text-white rounded-xl font-bold shadow-md hover:bg-blue-600 transition-colors text-sm";
}

function removeDraftQ(idx) {
    state.draftQuestions.splice(idx, 1);
    if (state.editingDraftQIndex === idx) {
        resetDraftQuestionForm();
    } else if (state.editingDraftQIndex !== null && state.editingDraftQIndex > idx) {
        state.editingDraftQIndex--;
    }
    renderDraftQuestions();
}

function openEditKahootModal(kahootId) {
    const kahoot = state.kahoots.find(k => k.id === kahootId);
    if (!kahoot) return;

    document.getElementById('editKahootId').value = kahoot.id;
    document.getElementById('kahootTitle').value = kahoot.title;
    document.getElementById('kahootCourseSelect').value = kahoot.courseId;

    state.draftQuestions = JSON.parse(JSON.stringify(kahoot.questions || []));

    resetDraftQuestionForm();
    renderDraftQuestions();
    document.getElementById('createKahootModal').classList.remove('hidden');
}

function startKahoot(kahootId) {
    const kahoot = state.kahoots.find(k => k.id === kahootId);
    if (!kahoot || !kahoot.questions || kahoot.questions.length === 0) return showToast("找不到測驗內容喵...");
    state.activeKahoot = kahoot;
    state.currentQIndex = 0;
    state.currentScore = 0;
    document.getElementById('playKahootModal').classList.remove('hidden');
    document.getElementById('playKahootModal').classList.add('flex');
    renderPlayQuestion();
}

function renderPlayQuestion() {
    if (!state.activeKahoot || state.currentQIndex >= state.activeKahoot.questions.length) {
        document.getElementById('playKahootModal').classList.add('hidden');
        document.getElementById('playKahootModal').classList.remove('flex');
        document.getElementById('finalScoreDisplay').textContent = state.currentScore;
        document.getElementById('finalTotalDisplay').textContent = `/ ${state.activeKahoot.questions.length}`;
        document.getElementById('kahootResultModal').classList.remove('hidden');
        document.getElementById('kahootResultModal').classList.add('flex');
        return;
    }
    const qData = state.activeKahoot.questions[state.currentQIndex];
    document.getElementById('kahootProgress').textContent = `${state.currentQIndex + 1} / ${state.activeKahoot.questions.length}`;
    document.getElementById('kahootScoreDisplay').textContent = `分數: ${state.currentScore}`;
    document.getElementById('kahootQuestionDisplay').textContent = qData.q;
    document.getElementById('textOpt0').textContent = qData.options[0];
    document.getElementById('textOpt1').textContent = qData.options[1];
    document.getElementById('textOpt2').textContent = qData.options[2];
    document.getElementById('textOpt3').textContent = qData.options[3];
}

function submitKahootAnswer(selectedIdx) {
    state.isKahootTransitioning = true;
    const qData = state.activeKahoot.questions[state.currentQIndex];

    const clickedBtn = document.getElementById(`playOpt${selectedIdx}`);
    if (clickedBtn) clickedBtn.classList.add('opacity-50', 'scale-95');

    if (selectedIdx === qData.correctIdx) {
        state.currentScore++;
        showToast("答對了！喵 🐾");
    } else {
        showToast("哎呀，答錯囉！");
    }
    state.currentQIndex++;

    setTimeout(() => {
        if (clickedBtn) clickedBtn.classList.remove('opacity-50', 'scale-95');
        renderPlayQuestion();
        state.isKahootTransitioning = false;
    }, 600);
}

export function initQuiz() {
    onSnapshot(collection(db, KAHOOTS_PATH), (snapshot) => {
        state.kahoots = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        state.kahoots.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderKahoots();
    });

    document.getElementById('openCreateKahootBtn').onclick = () => {
        document.getElementById('editKahootId').value = '';
        state.draftQuestions = [];
        document.getElementById('kahootTitle').value = '';
        document.getElementById('kahootCourseSelect').value = '';

        resetDraftQuestionForm();
        renderDraftQuestions();
        document.getElementById('createKahootModal').classList.remove('hidden');
    };

    document.getElementById('closeKahootModalBtn').onclick = () => document.getElementById('createKahootModal').classList.add('hidden');

    document.getElementById('addDraftQuestionBtn').onclick = () => {
        if (state.draftQuestions.length >= MAX_KAHOOT_QUESTIONS && state.editingDraftQIndex === null) {
            return showToast(`喵！一次測驗最多只能有 ${MAX_KAHOOT_QUESTIONS} 題喔！`);
        }

        const qText = document.getElementById('qText').value.trim();
        const opts = [
            document.getElementById('opt0').value.trim(),
            document.getElementById('opt1').value.trim(),
            document.getElementById('opt2').value.trim(),
            document.getElementById('opt3').value.trim()
        ];
        const correctRadio = document.querySelector('input[name="correctOpt"]:checked');

        if (!isValidText(qText, 200)) return showToast("喵，題目內容長度不符！(最多200字)");
        if (opts.some(o => !isValidText(o, 100))) return showToast("選項內容不能為空，且最多100字喔！");
        if (!correctRadio) return showToast("請選擇一個正確答案！");

        const questionPayload = {
            q: qText,
            options: opts,
            correctIdx: parseInt(correctRadio.value)
        };

        if (state.editingDraftQIndex !== null) {
            state.draftQuestions[state.editingDraftQIndex] = questionPayload;
            resetDraftQuestionForm();
            showToast("題目更新成功 🐾");
        } else {
            state.draftQuestions.push(questionPayload);
            showToast("題目加入成功 🐾");
            document.getElementById('qText').value = '';
            document.getElementById('opt0').value = '';
            document.getElementById('opt1').value = '';
            document.getElementById('opt2').value = '';
            document.getElementById('opt3').value = '';
            correctRadio.checked = false;
        }

        renderDraftQuestions();
    };

    document.getElementById('saveKahootBtn').onclick = async () => {
        const id = document.getElementById('editKahootId').value;
        const title = document.getElementById('kahootTitle').value.trim();
        const courseId = document.getElementById('kahootCourseSelect').value;

        if (!isValidText(title, 50)) return showToast("喵，測驗主題請在 50 字以內！");
        if (!courseId) return showToast("請選擇關聯課程！");
        if (state.draftQuestions.length === 0) return showToast("至少要新增一題才能發布喔！");

        try {
            const course = state.courses.find(c => c.id === courseId);

            if (id) {
                await updateDoc(doc(db, KAHOOTS_PATH, id), {
                    title: title,
                    courseId,
                    courseName: course.name,
                    questions: state.draftQuestions
                });
                showToast("測驗更新成功 🐾");
            } else {
                const newDoc = doc(collection(db, KAHOOTS_PATH));
                await setDoc(newDoc, {
                    title: title,
                    courseId,
                    courseName: course.name,
                    questions: state.draftQuestions,
                    createdAt: Date.now()
                });
                showToast("測驗建立成功，大家可以開始挑戰了 🐾");
            }

            document.getElementById('createKahootModal').classList.add('hidden');
        } catch (err) {
            showToast("儲存失敗喵...");
        }
    };

    document.getElementById('quitKahootBtn').onclick = () => {
        document.getElementById('playKahootModal').classList.add('hidden');
        document.getElementById('playKahootModal').classList.remove('flex');
    };

    document.getElementById('closeResultBtn').onclick = () => {
        document.getElementById('kahootResultModal').classList.add('hidden');
        document.getElementById('kahootResultModal').classList.remove('flex');
    };

    document.addEventListener('click', (e) => {
        const startKahootTarget = e.target.closest('[data-action="start-kahoot"]');
        if (startKahootTarget) { startKahoot(startKahootTarget.dataset.id); return; }

        const editKahootTarget = e.target.closest('[data-action="edit-kahoot"]');
        if (editKahootTarget) {
            if (state.currentUserLevel !== 5) return showToast("只有星族可以編輯測驗喵！");
            openEditKahootModal(editKahootTarget.dataset.id);
            return;
        }

        const submitKahootTarget = e.target.closest('[data-action="submit-kahoot"]');
        if (submitKahootTarget) {
            if (state.isKahootTransitioning) return;
            submitKahootAnswer(parseInt(submitKahootTarget.dataset.index));
            return;
        }

        const removeDraftQTarget = e.target.closest('[data-action="remove-draft-q"]');
        if (removeDraftQTarget) { removeDraftQ(parseInt(removeDraftQTarget.dataset.index)); return; }

        const editDraftQTarget = e.target.closest('[data-action="edit-draft-q"]');
        if (editDraftQTarget) { editDraftQ(parseInt(editDraftQTarget.dataset.index)); return; }
    });
}
