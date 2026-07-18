// 通用的「確定要抹除痕跡？」刪除確認 Modal，依照 currentDeleteType 決定要刪哪個集合，
// 部分類型 (course / ssCourse / vocabBook) 需要連同底下的子資料一併批次刪除。
import { doc, deleteDoc, writeBatch, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import {
    COURSES_PATH, REVIEWS_PATH, MATERIALS_PATH, KAHOOTS_PATH,
    SS_COURSES_PATH, SS_UNITS_PATH, VOCAB_BOOKS_PATH, VOCAB_WORDS_PATH,
    NEWS_PATH, LINKS_PATH
} from './constants.js';
import { state } from './state.js';
import { showToast } from './utils.js';

function confirmDeleteUI(type, id) {
    state.currentDeleteType = type;
    state.currentDeleteId = id;
    document.getElementById('deleteModal').classList.remove('hidden');
}

export function initDeleteModal() {
    document.addEventListener('click', (e) => {
        const deleteTarget = e.target.closest('[data-action="delete"]');
        if (deleteTarget) {
            e.stopPropagation();
            confirmDeleteUI(deleteTarget.dataset.type, deleteTarget.dataset.id);
        }
    });

    document.getElementById('closeDeleteModal').onclick = () => document.getElementById('deleteModal').classList.add('hidden');

    document.getElementById('confirmDelete').onclick = async () => {
        try {
            if (state.currentDeleteType === 'course') {
                const qR = query(collection(db, REVIEWS_PATH), where("courseId", "==", state.currentDeleteId));
                const qM = query(collection(db, MATERIALS_PATH), where("courseId", "==", state.currentDeleteId));
                const qK = query(collection(db, KAHOOTS_PATH), where("courseId", "==", state.currentDeleteId));
                const batch = writeBatch(db);

                const sR = await getDocs(qR);
                const sM = await getDocs(qM);
                const sK = await getDocs(qK);

                sR.forEach(d => batch.delete(d.ref));
                sM.forEach(d => batch.delete(d.ref));
                sK.forEach(d => batch.delete(d.ref));

                batch.delete(doc(db, COURSES_PATH, state.currentDeleteId));
                await batch.commit();

                if (state.currentDeleteId === state.selectedFilterCourseId) {
                    state.selectedFilterCourseId = null;
                    document.getElementById('course-detail-view').classList.add('hidden');
                    document.getElementById('course-list-view').classList.remove('hidden');
                    document.getElementById('evaluationHero').classList.remove('hidden');
                }
            } else if (state.currentDeleteType === 'ssCourse') {
                const qUnits = query(collection(db, SS_UNITS_PATH), where("courseId", "==", state.currentDeleteId));
                const batch = writeBatch(db);
                const sUnits = await getDocs(qUnits);
                sUnits.forEach(d => batch.delete(d.ref));
                batch.delete(doc(db, SS_COURSES_PATH, state.currentDeleteId));
                await batch.commit();

                if (state.currentViewSSCourseId === state.currentDeleteId) {
                    state.currentViewSSCourseId = null;
                    document.getElementById('page-self-study-details').classList.add('hidden');
                    document.getElementById('page-self-study-main').classList.remove('hidden');
                }
            } else if (state.currentDeleteType === 'vocabBook') {
                const qWords = query(collection(db, VOCAB_WORDS_PATH), where("bookId", "==", state.currentDeleteId));
                const batch = writeBatch(db);
                const sWords = await getDocs(qWords);
                sWords.forEach(d => batch.delete(d.ref));
                batch.delete(doc(db, VOCAB_BOOKS_PATH, state.currentDeleteId));
                await batch.commit();

                if (state.currentViewVocabBookId === state.currentDeleteId) {
                    state.currentViewVocabBookId = null;
                    document.getElementById('page-vocabulary-details').classList.add('hidden');
                    document.getElementById('page-vocabulary-main').classList.remove('hidden');
                }
            } else {
                let path;
                if (state.currentDeleteType === 'review') path = REVIEWS_PATH;
                else if (state.currentDeleteType === 'material') path = MATERIALS_PATH;
                else if (state.currentDeleteType === 'kahoot') path = KAHOOTS_PATH;
                else if (state.currentDeleteType === 'ssUnit') path = SS_UNITS_PATH;
                else if (state.currentDeleteType === 'vocabWord') path = VOCAB_WORDS_PATH;
                else if (state.currentDeleteType === 'news') path = NEWS_PATH;
                else if (state.currentDeleteType === 'quickLink') path = LINKS_PATH;

                await deleteDoc(doc(db, path, state.currentDeleteId));
            }
            showToast("已成功抹除 🐾");
            document.getElementById('deleteModal').classList.add('hidden');
        } catch (err) {
            showToast("失敗喵...");
        }
    };
}
