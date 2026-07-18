// 登入/註冊 Modal、匿名登入後台狀態切換、忘記密碼、以及個人顯示名稱編輯。
import {
    signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    onAuthStateChanged, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from './firebase-init.js';
import { USERS_PATH, ROLE_LEVELS } from './constants.js';
import { state } from './state.js';
import { isValidText, showToast } from './utils.js';
import { renderSchedule, highlightCurrentClass } from './schedule.js';
import { updateAdminUI } from './adminUI.js';

export function initAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (user && !user.isAnonymous) {
            const userRef = doc(db, USERS_PATH, user.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
                await setDoc(userRef, { email: user.email, role: '見習生', displayName: '無名小貓', schedule: {}, createdAt: Date.now() });
                state.currentUserRole = '見習生';
                state.userDisplayName = '無名小貓';
                state.userSchedule = {};
            } else {
                const data = userSnap.data();
                state.currentUserRole = data.role || '見習生';
                state.userDisplayName = data.displayName || '無名小貓';
                state.userSchedule = data.schedule || {};
            }

            state.currentUserLevel = ROLE_LEVELS[state.currentUserRole] || 1;
            state.isAdmin = (state.currentUserLevel === 5);

            document.getElementById('home-guest-hero').classList.add('hidden');
            document.getElementById('home-user-hero').classList.remove('hidden');
            document.getElementById('home-user-schedule').classList.remove('hidden');

            document.getElementById('displayUserName').textContent = state.userDisplayName;

            renderSchedule();
            highlightCurrentClass();
            showToast(`歡迎回來，${state.currentUserRole} ${state.userDisplayName} 🐾`);
        } else {
            state.isAdmin = false;
            state.currentUserRole = "訪客";
            state.currentUserLevel = 0;
            state.userDisplayName = "無名小貓";
            state.userSchedule = {};

            document.getElementById('home-guest-hero').classList.remove('hidden');
            document.getElementById('home-user-hero').classList.add('hidden');
            document.getElementById('home-user-schedule').classList.add('hidden');

            if (!user) { signInAnonymously(auth).catch(e => console.error(e)); }
        }
        updateAdminUI();
    });

    document.getElementById('editNameBtn').onclick = () => {
        document.getElementById('editDisplayName').value = state.userDisplayName;
        document.getElementById('nameModal').classList.remove('hidden');
    };
    document.getElementById('closeNameModal').onclick = () => { document.getElementById('nameModal').classList.add('hidden'); };
    document.getElementById('confirmSaveName').onclick = async () => {
        const newName = document.getElementById('editDisplayName').value.trim();
        if (!isValidText(newName, 15)) return showToast("喵，名字請在 1 到 15 個字以內！");

        try {
            await updateDoc(doc(db, USERS_PATH, auth.currentUser.uid), { displayName: newName });
            state.userDisplayName = newName;
            document.getElementById('displayUserName').textContent = state.userDisplayName;
            document.getElementById('nameModal').classList.add('hidden');
            showToast("名稱修改成功 🐾");
        } catch (e) { showToast("儲存失敗喵..."); }
    };

    document.getElementById('forgotPasswordBtn').onclick = async () => {
        const email = document.getElementById('adminEmail').value.trim();
        if (!email) { return showToast("喵，請先在上方輸入你的信箱，再點擊這個按鈕喔！"); }
        try {
            await sendPasswordResetEmail(auth, email);
            showToast("重置密碼信件已寄出，請去信箱收信喵！ 🐾");
            document.getElementById('adminModal').classList.add('hidden');
        } catch (error) {
            showToast("錯誤：找不到這個信箱，或是輸入格式不對喵...");
        }
    };

    document.getElementById('toggleAuthMode').onclick = () => {
        state.isRegisterMode = !state.isRegisterMode;
        const title = document.getElementById('modalTitle');
        const submitBtn = document.getElementById('confirmAdminLogin');
        const toggleText = document.getElementById('toggleAuthMode');
        if (state.isRegisterMode) {
            title.textContent = "註冊部族帳號";
            submitBtn.textContent = "確認註冊🐾";
            toggleText.textContent = "已有帳號？登入";
        } else {
            title.textContent = "部族登入";
            submitBtn.textContent = "進入領地🐾";
            toggleText.textContent = "沒有帳號？註冊";
        }
    };

    document.getElementById('confirmAdminLogin').onclick = async () => {
        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPassword').value.trim();
        const submitBtn = document.getElementById('confirmAdminLogin');

        if (!email || !password) return showToast("喵，請輸入帳密喔！");

        submitBtn.disabled = true;
        try {
            if (state.isRegisterMode) {
                await createUserWithEmailAndPassword(auth, email, password);
                showToast("註冊成功喵！");
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            document.getElementById('adminEmail').value = '';
            document.getElementById('adminPassword').value = '';
            document.getElementById('adminModal').classList.add('hidden');
        } catch (error) {
            showToast("錯誤：帳密不對或是信箱已被用過");
        } finally {
            submitBtn.disabled = false;
        }
    };

    document.getElementById('adminBtn').onclick = async () => {
        if (auth.currentUser && !auth.currentUser.isAnonymous) {
            await signOut(auth);
            showToast("掰掰，期待再見到你喵！");
        } else {
            document.getElementById('adminModal').classList.remove('hidden');
        }
    };

    document.getElementById('closeAdminModal').onclick = () => document.getElementById('adminModal').classList.add('hidden');
}
