// 頁首捲動顯示/隱藏、上方分頁切換、Logo 點擊回首頁。
import { state } from './state.js';
import { renderCourseGrid } from './courses.js';
import { renderReviews } from './reviews.js';
import { renderMaterials } from './materials.js';
import { renderKahoots } from './quiz.js';
import { renderVocabBooks } from './vocabulary.js';
import { highlightCurrentClass } from './schedule.js';

export function initNavigation() {
    const mainHeader = document.getElementById('mainHeader');
    let lastScrollY = window.scrollY;

    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        if (currentScrollY <= 0) {
            mainHeader.style.transform = 'translateY(0)';
            lastScrollY = currentScrollY;
            return;
        }
        if (currentScrollY > 60 && currentScrollY > lastScrollY) {
            mainHeader.style.transform = 'translateY(-100%)';
        } else if (currentScrollY < lastScrollY) {
            mainHeader.style.transform = 'translateY(0)';
        }
        lastScrollY = currentScrollY;
    }, { passive: true });

    document.getElementById('logoBtn').addEventListener('click', () => {
        document.querySelector('[data-tab="home"]').click();
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    const pageSections = document.querySelectorAll('.page-section');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => {
                b.classList.remove('bg-emerald-500', 'text-white', 'shadow-md');
                b.classList.add('text-slate-400');
            });
            btn.classList.remove('text-slate-400');
            btn.classList.add('bg-emerald-500', 'text-white', 'shadow-md');

            pageSections.forEach(page => page.classList.add('hidden'));
            const target = btn.dataset.tab;
            document.getElementById(`page-${target}`).classList.remove('hidden');

            if (state.searchQuery !== "") {
                state.searchQuery = "";
                document.getElementById('searchInput').value = "";
                renderCourseGrid();
                renderReviews();
                renderMaterials();
                renderKahoots();
                renderVocabBooks();
            }

            if (target === 'home') {
                highlightCurrentClass();
            }

            if (target === 'evaluation') {
                document.getElementById('course-detail-view').classList.add('hidden');
                document.getElementById('course-list-view').classList.remove('hidden');
                document.getElementById('evaluationHero').classList.remove('hidden');
                state.selectedFilterCourseId = null;
            }

            if (target === 'self-study') {
                document.getElementById('page-self-study-main').classList.remove('hidden');
                document.getElementById('page-self-study-details').classList.add('hidden');
                state.currentViewSSCourseId = null;
            }

            if (target === 'vocabulary') {
                document.getElementById('page-vocabulary-main').classList.remove('hidden');
                document.getElementById('page-vocabulary-details').classList.add('hidden');
                state.currentViewVocabBookId = null;
            }
            lucide.createIcons();
        });
    });
}
