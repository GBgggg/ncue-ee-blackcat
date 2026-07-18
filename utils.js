// 共用的小工具函式：HTML 逃逸、防抖、輸入驗證、指標圓點繪製、Toast 提示。

export function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

export function isValidText(text, maxLength = 100, minLength = 1) {
    if (text === null || text === undefined) return false;
    const str = String(text).trim();
    return str.length >= minLength && str.length <= maxLength;
}

export function isValidUrl(urlStr, maxLength = 500) {
    if (!urlStr) return true;
    const str = String(urlStr).trim();
    if (str.length > maxLength) return false;
    try {
        const parsedUrl = new URL(str);
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch (e) {
        return false;
    }
}

export const drawMetricDots = (value, colorClass) => {
    return Array(5).fill().map((_, i) =>
        `<div class="w-1.5 h-1.5 rounded-full ${i < (value || 0) ? colorClass : 'bg-slate-200'}"></div>`
    ).join('');
};

export function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('toast-animate');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}
