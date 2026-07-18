// 集中管理所有靜態設定值：Firestore 路徑、階級對照表、課表時段、評價選項文字等。
// 這裡的內容原本散落在單一 <script> 檔案的最上方，抽出來讓其他模組可以直接 import 使用。

export const appId = "eeblackcat-c605d";

export const COURSES_PATH = `artifacts/${appId}/public/data/courses`;
export const REVIEWS_PATH = `artifacts/${appId}/public/data/reviews`;
export const MATERIALS_PATH = `artifacts/${appId}/public/data/materials`;
export const KAHOOTS_PATH = `artifacts/${appId}/public/data/kahoots`;
export const USERS_PATH = `artifacts/${appId}/public/data/users`;
export const SS_COURSES_PATH = `artifacts/${appId}/public/data/selfStudyCourses`;
export const SS_UNITS_PATH = `artifacts/${appId}/public/data/selfStudyUnits`;
export const VOCAB_BOOKS_PATH = `artifacts/${appId}/public/data/vocabBooks`;
export const VOCAB_WORDS_PATH = `artifacts/${appId}/public/data/vocabWords`;
export const NEWS_PATH = `artifacts/${appId}/public/data/news`;
export const LINKS_PATH = `artifacts/${appId}/public/data/quickLinks`;

export const MAX_KAHOOT_QUESTIONS = 50;

export const ROLE_LEVELS = {
    '星族': 5, '巫醫': 4, '族長': 3, '戰士': 2, '見習生': 1, '訪客': 0
};

export const ROLE_COLORS = {
    '星族': 'bg-fuchsia-500 text-white border-fuchsia-600',
    '巫醫': 'bg-emerald-500 text-white border-emerald-600',
    '族長': 'bg-amber-500 text-white border-amber-600',
    '戰士': 'bg-rose-500 text-white border-rose-600',
    '見習生': 'bg-slate-400 text-white border-slate-500',
    '訪客': 'bg-slate-300 text-white border-slate-400'
};

export const yearMap = { '1': '一年級', '2': '二年級', '3': '三年級', '4': '四年級', 'elective': '系選修', 'other': '其他' };
export const semMap = { '1': '上學期', '2': '下學期' };

export const timeSlots = [
    { id: 1, label: '1', timeStr: '08:10-<br>09:00', start: 8 * 60 + 10, end: 9 * 60 + 0 },
    { id: 2, label: '2', timeStr: '09:05-<br>09:55', start: 9 * 60 + 5, end: 9 * 60 + 55 },
    { id: 3, label: '3', timeStr: '10:15-<br>11:05', start: 10 * 60 + 15, end: 11 * 60 + 5 },
    { id: 4, label: '4', timeStr: '11:10-<br>12:00', start: 11 * 60 + 10, end: 12 * 60 + 0 },
    { id: 'noon', label: '中午', timeStr: '12:05-<br>12:55', start: 12 * 60 + 5, end: 12 * 60 + 55 },
    { id: 5, label: '5', timeStr: '13:10-<br>14:00', start: 13 * 60 + 10, end: 14 * 60 + 0 },
    { id: 6, label: '6', timeStr: '14:05-<br>14:55', start: 14 * 60 + 5, end: 14 * 60 + 55 },
    { id: 7, label: '7', timeStr: '15:15-<br>16:05', start: 15 * 60 + 15, end: 16 * 60 + 5 },
    { id: 8, label: '8', timeStr: '16:10-<br>17:00', start: 16 * 60 + 10, end: 17 * 60 + 0 },
    { id: 9, label: '9', timeStr: '17:10-<br>18:00', start: 17 * 60 + 10, end: 18 * 60 + 0 }
];

export const reviewQuestions = [
    { id: 'courseDiff', title: "Q1. 這門課的難度如何？" },
    { id: 'examDiff', title: "Q2. 考試準備起來的感覺？" },
    { id: 'hwAmount', title: "Q3. 平時作業的負擔量？" },
    { id: 'learned', title: "Q4. 這學期下來學到了多少？" }
];

export const reviewLabels = {
    courseDiff: ["超涼躺分", "稍微輕鬆", "中規中矩", "有些硬度", "硬到爆肝"],
    examDiff: ["閉眼都會", "考前看看", "需要準備", "很難高分", "懷疑人生"],
    hwAmount: ["幾乎沒有", "偶爾一份", "份量適中", "每週都有", "寫到手軟"],
    learned: ["浪費時間", "學到皮毛", "普通收穫", "學到不少", "滿載而歸"]
};

export const reviewBtnColors = [
    "bg-red-500 border-red-700 hover:bg-red-400",
    "bg-blue-500 border-blue-700 hover:bg-blue-400",
    "bg-amber-500 border-amber-700 hover:bg-amber-400",
    "bg-emerald-500 border-emerald-700 hover:bg-emerald-400",
    "bg-fuchsia-500 border-fuchsia-700 hover:bg-fuchsia-400"
];

export const reviewShapes = [
    '<div class="w-4 h-4 rounded-full bg-white/30"></div>',
    '<div class="w-4 h-4 rotate-45 bg-white/30"></div>',
    '<div class="w-4 h-4 rounded-full bg-white/30"></div>',
    '<div class="w-4 h-4 rounded bg-white/30"></div>',
    '<i data-lucide="star" class="w-4 h-4 fill-white/30 text-transparent"></i>'
];
