// 依照目前登入狀態與階位，切換所有「管理員專屬」按鈕/區塊的顯示，
// 並在登入狀態改變後，重新渲染所有跟權限有關的畫面。
import { auth } from './firebase-init.js';
import { ROLE_COLORS } from './constants.js';
import { state } from './state.js';
import { renderCourseGrid } from './courses.js';
import { renderReviews, renderReviewWizard } from './reviews.js';
import { renderMaterials } from './materials.js';
import { renderKahoots } from './quiz.js';
import { renderSelfStudyCourses, renderSelfStudyUnits } from './selfStudy.js';
import { renderVocabBooks, renderVocabWords } from './vocabulary.js';
import { renderNews, renderQuickLinks } from './newsLinks.js';
import { subscribeUsers, unsubscribeUsers, renderStarclanPanel } from './starclan.js';

export function updateAdminUI() {
    const adminBtn = document.getElementById('adminBtn');
    const uploadSection = document.getElementById('adminUploadSection');
    const starclanSection = document.getElementById('starclanSection');
    const openCreateKahootBtn = document.getElementById('openCreateKahootBtn');

    const addSSCourseBtn = document.getElementById('addSelfStudyCourseBtn');
    const addSSUnitBtn = document.getElementById('addSelfStudyUnitBtn');

    const addVocabBookBtn = document.getElementById('addVocabBookBtn');
    const addVocabWordBtn = document.getElementById('addVocabWordBtn');

    const addNewsBtn = document.getElementById('addNewsBtn');
    const addLinkBtn = document.getElementById('addLinkBtn');

    const navManagementTab = document.getElementById('navManagementTab');

    const user = auth.currentUser;

    if (user && !user.isAnonymous) {
        const badgeStyle = ROLE_COLORS[state.currentUserRole] || ROLE_COLORS['見習生'];
        const roleBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${badgeStyle} shadow-sm border">${state.currentUserRole}</span>`;

        if (state.isAdmin) {
            adminBtn.innerHTML = `${roleBadge} <span class="truncate max-w-[80px]">管理員</span> <i data-lucide="log-out" class="w-4 h-4 ml-1"></i>`;
            adminBtn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold bg-slate-800 text-white shadow-md hover:bg-slate-700 transition-colors border border-slate-600';
            starclanSection.classList.remove('hidden');

            subscribeUsers();
            renderStarclanPanel();
        } else {
            adminBtn.innerHTML = `${roleBadge} <span class="truncate max-w-[80px]">${user.email.split('@')[0]}</span> <i data-lucide="log-out" class="w-4 h-4 ml-1"></i>`;
            adminBtn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold bg-slate-900 text-white shadow-sm hover:bg-slate-800 transition-colors';
            starclanSection.classList.add('hidden');

            unsubscribeUsers();
        }

        if (state.currentUserLevel >= 4) {
            navManagementTab.classList.remove('hidden');
            uploadSection.classList.remove('hidden');
            openCreateKahootBtn.classList.remove('hidden');

            if (addSSCourseBtn) addSSCourseBtn.classList.remove('hidden');
            if (addSSUnitBtn) addSSUnitBtn.classList.remove('hidden');
            if (addVocabBookBtn) addVocabBookBtn.classList.remove('hidden');
            if (addVocabWordBtn) addVocabWordBtn.classList.remove('hidden');
            if (addNewsBtn) addNewsBtn.classList.remove('hidden');
            if (addLinkBtn) addLinkBtn.classList.remove('hidden');
        } else {
            navManagementTab.classList.add('hidden');
            uploadSection.classList.add('hidden');
            openCreateKahootBtn.classList.add('hidden');

            if (addSSCourseBtn) addSSCourseBtn.classList.add('hidden');
            if (addSSUnitBtn) addSSUnitBtn.classList.add('hidden');
            if (addVocabBookBtn) addVocabBookBtn.classList.add('hidden');
            if (addVocabWordBtn) addVocabWordBtn.classList.add('hidden');
            if (addNewsBtn) addNewsBtn.classList.add('hidden');
            if (addLinkBtn) addLinkBtn.classList.add('hidden');

            if (!document.getElementById('page-management').classList.contains('hidden')) {
                document.querySelector('[data-tab="home"]').click();
            }
        }
    } else {
        adminBtn.innerHTML = '<i data-lucide="user" class="w-4 h-4"></i><span>登入 / 註冊</span>';
        adminBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold bg-slate-900 text-white';
        navManagementTab.classList.add('hidden');
        uploadSection.classList.add('hidden');
        starclanSection.classList.add('hidden');
        openCreateKahootBtn.classList.add('hidden');

        if (addSSCourseBtn) addSSCourseBtn.classList.add('hidden');
        if (addSSUnitBtn) addSSUnitBtn.classList.add('hidden');
        if (addVocabBookBtn) addVocabBookBtn.classList.add('hidden');
        if (addVocabWordBtn) addVocabWordBtn.classList.add('hidden');
        if (addNewsBtn) addNewsBtn.classList.add('hidden');
        if (addLinkBtn) addLinkBtn.classList.add('hidden');

        unsubscribeUsers();

        if (!document.getElementById('page-management').classList.contains('hidden')) {
            document.querySelector('[data-tab="home"]').click();
        }
    }

    lucide.createIcons();
    renderCourseGrid();
    renderReviews();
    renderMaterials();
    renderKahoots();
    renderSelfStudyCourses();
    renderVocabBooks();
    renderNews();
    renderQuickLinks();
    if (state.currentViewSSCourseId) renderSelfStudyUnits();
    if (state.currentViewVocabBookId) renderVocabWords();

    if (state.reviewWizardStep === 0) renderReviewWizard();
}
