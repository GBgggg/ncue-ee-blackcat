// 所有模組共用的「全域狀態」。
// 用一個物件裝起來（而不是各自 export let），這樣任何模組都能直接修改
// state.xxx 的屬性，其他有 import state 的模組也會立刻看到最新的值，
// 不會遇到 ES module 的 live-binding 限制。
export const state = {
    // Firestore 同步下來的集合
    courses: [],
    reviews: [],
    materials: [],
    kahoots: [],
    allUsers: [],
    ssCourses: [],
    ssUnits: [],
    vocabBooks: [],
    vocabWords: [],
    newsList: [],
    quickLinks: [],

    // 目前登入使用者
    userSchedule: {},
    userDisplayName: "無名小貓",
    isAdmin: false,
    currentUserRole: "訪客",
    currentUserLevel: 0,

    // UI / 流程旗標
    currentActiveNewsTab: '共同',
    usersUnsubscribe: null,
    isRegisterMode: false,
    isWizardTransitioning: false,
    isKahootTransitioning: false,
    currentViewSSCourseId: null,
    currentViewVocabBookId: null,
    editingDraftQIndex: null,
    currentDeleteId: null,
    currentDeleteType: null,
    searchQuery: "",
    selectedFilterCourseId: null,
    activeSemesterFilter: 'all',

    // 評價精靈 (review wizard)
    reviewWizardStep: 0,
    reviewWizardData: { courseId: "", courseDiff: 0, examDiff: 0, hwAmount: 0, learned: 0, comment: "" },

    // 測驗擂台 (kahoot) 編輯與作答
    draftQuestions: [],
    activeKahoot: null,
    currentQIndex: 0,
    currentScore: 0
};
