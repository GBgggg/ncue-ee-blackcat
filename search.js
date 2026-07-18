// 評價頁最上方的搜尋框，同時過濾課程、評價、資料庫、測驗、單字冊。
import { state } from './state.js';
import { debounce } from './utils.js';
import { renderCourseGrid } from './courses.js';
import { renderReviews } from './reviews.js';
import { renderMaterials } from './materials.js';
import { renderKahoots } from './quiz.js';
import { renderVocabBooks } from './vocabulary.js';

export function initSearch() {
    document.getElementById('searchInput').oninput = debounce((e) => {
        state.searchQuery = e.target.value;
        renderCourseGrid();
        renderReviews();
        renderMaterials();
        renderKahoots();
        renderVocabBooks();
    }, 300);
}
