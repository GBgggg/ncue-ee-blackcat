// 星族大會：管理員用來查看所有使用者並調整階位的面板。
import { collection, doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { USERS_PATH, ROLE_COLORS } from './constants.js';
import { state } from './state.js';
import { escapeHTML, showToast } from './utils.js';

export function renderStarclanPanel() {
    const container = document.getElementById('usersListContainer');
    if (!container) return;
    if (state.allUsers.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-slate-400">目前沒有其他貓咪...</div>';
        return;
    }

    container.innerHTML = state.allUsers.map(u => `
        <div class="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <div class="flex flex-col">
                <span class="font-bold text-slate-800 text-sm">${escapeHTML(u.email)}</span>
                <span class="text-xs text-slate-400">${new Date(u.createdAt).toLocaleDateString()} 加入</span>
            </div>
            <div>
                <select data-action="change-role" data-uid="${u.uid}"
                        class="px-3 py-1.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-fuchsia-400 transition-colors">
                    <option value="星族" ${u.role === '星族' ? 'selected' : ''}>星族</option>
                    <option value="巫醫" ${u.role === '巫醫' ? 'selected' : ''}>巫醫</option>
                    <option value="族長" ${u.role === '族長' ? 'selected' : ''}>族長</option>
                    <option value="戰士" ${u.role === '戰士' ? 'selected' : ''}>戰士</option>
                    <option value="見習生" ${u.role === '見習生' ? 'selected' : ''}>見習生</option>
                </select>
            </div>
        </div>
    `).join('');
}

async function changeUserRole(uid, newRole) {
    try {
        await updateDoc(doc(db, USERS_PATH, uid), { role: newRole });
        showToast(`已成功將階位更新為「${newRole}」🐾`);
    } catch (err) {
        showToast("權限不足或更新失敗喵...");
    }
}

// isAdmin 變成 true 時開始訂閱使用者名冊，變成 false 時取消訂閱。
// 由 adminUI.js 在登入狀態改變時呼叫。
export function subscribeUsers() {
    if (state.usersUnsubscribe) return;
    state.usersUnsubscribe = onSnapshot(collection(db, USERS_PATH), (snapshot) => {
        state.allUsers = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
        renderStarclanPanel();
    });
}

export function unsubscribeUsers() {
    if (state.usersUnsubscribe) {
        state.usersUnsubscribe();
        state.usersUnsubscribe = null;
    }
    state.allUsers = [];
}

export function initStarclan() {
    document.getElementById('openStarclanBtn').onclick = () => {
        renderStarclanPanel();
        document.getElementById('starclanModal').classList.remove('hidden');
    };
    document.getElementById('closeStarclanBtn').onclick = () => { document.getElementById('starclanModal').classList.add('hidden'); };

    document.addEventListener('change', (e) => {
        if (e.target.dataset.action === 'change-role') {
            changeUserRole(e.target.dataset.uid, e.target.value);
        }
    });
}
