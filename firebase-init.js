// Firebase 初始化。所有其他模組都從這裡拿 auth / db 實例，
// 避免每個檔案各自呼叫 initializeApp 造成重複初始化。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD9uIEAe3InKxHs86QhWHjuMSuimxrhdkQ",
    authDomain: "eeblackcat-c605d.firebaseapp.com",
    projectId: "eeblackcat-c605d",
    storageBucket: "eeblackcat-c605d.firebasestorage.app",
    messagingSenderId: "1012329411307",
    appId: "1:1012329411307:web:63b87debbbc3e4778044ae"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
