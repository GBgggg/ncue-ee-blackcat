// 進入點：載入所有模組並依序初始化。
// 這個檔案本身應該保持很薄——實際邏輯都放在對應的功能模組裡。
import './firebase-init.js';
import { initNavigation } from './navigation.js';
import { initSchedule } from './schedule.js';
import { initNewsLinks } from './newsLinks.js';
import { initCourses } from './courses.js';
import { initReviews, renderReviewWizard } from './reviews.js';
import { initMaterials } from './materials.js';
import { initSelfStudy } from './selfStudy.js';
import { initVocabulary } from './vocabulary.js';
import { initQuiz } from './quiz.js';
import { initStarclan } from './starclan.js';
import { initDeleteModal } from './deleteModal.js';
import { initSearch } from './search.js';
import { initAuth } from './auth.js';

lucide.createIcons();
renderReviewWizard();

initNavigation();
initSchedule();
initNewsLinks();
initCourses();
initReviews();
initMaterials();
initSelfStudy();
initVocabulary();
initQuiz();
initStarclan();
initDeleteModal();
initSearch();

// 放最後：onAuthStateChanged 會觸發 updateAdminUI()，
// 這時其他模組的 DOM 監聽器都已經掛好了。
initAuth();
