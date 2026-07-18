// 個人課表：渲染課表格子、目前上課中高亮、編輯單一格子的 Modal。
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from './firebase-init.js';
import { USERS_PATH, timeSlots } from './constants.js';
import { state } from './state.js';
import { escapeHTML, showToast } from './utils.js';

export function renderSchedule() {
    const tbody = document.getElementById('scheduleBody');
    if (!tbody) return;

    let html = '';
    timeSlots.forEach(p => {
        html += `<tr>`;
        html += `<td class="bg-teal-400/90 text-white rounded-xl p-1 md:p-2 text-center align-middle shadow-sm border border-teal-500 w-16 md:w-24">
                    <div class="flex flex-col items-center justify-center leading-tight">
                        <span class="font-black text-sm md:text-xl">${p.label}</span>
                        <span class="opacity-90 text-[8px] md:text-[10px] mt-0.5 whitespace-nowrap tracking-tighter">${p.timeStr}</span>
                    </div>
                 </td>`;

        for (let day = 1; day <= 5; day++) {
            if (p.id === 'noon') {
                html += `<td id="cell-${day}-noon" class="schedule-cell bg-slate-50/50 rounded-xl p-1 text-center transition-all border border-slate-100"></td>`;
            } else {
                const cellData = state.userSchedule[`${day}-${p.id}`] || { courseName: '', location: '' };
                const hasData = cellData.courseName || cellData.location;
                html += `<td id="cell-${day}-${p.id}" data-action="open-schedule-cell" data-day="${day}" data-period="${p.id}" class="schedule-cell cursor-pointer bg-white rounded-xl p-1 md:p-2 text-center transition-all hover:bg-teal-50 hover:shadow-md border-2 border-slate-100 relative group min-w-[100px] h-16 md:h-24 shadow-sm align-middle">`;
                if (hasData) {
                    html += `<div class="font-black text-slate-800 text-xs md:text-sm mb-1 break-words leading-tight">${escapeHTML(cellData.courseName)}</div>`;
                    if (cellData.location) html += `<div class="text-[10px] md:text-xs text-slate-500 font-bold bg-slate-100 rounded-md inline-block px-1.5 py-0.5">@ ${escapeHTML(cellData.location)}</div>`;
                } else {
                    html += `<div class="text-[10px] md:text-xs text-slate-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity">點擊編輯</div>`;
                }
                html += `</td>`;
            }
        }
        html += `</tr>`;
    });
    tbody.innerHTML = html;
    highlightCurrentClass();
}

export function highlightCurrentClass() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) return;
    const now = new Date();
    const day = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();

    const timeDisplay = document.getElementById('currentTimeDisplay');
    if (timeDisplay) {
        timeDisplay.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    document.querySelectorAll('.schedule-cell').forEach(el => {
        el.classList.remove('ring-4', 'ring-emerald-400', 'bg-emerald-50', 'transform', 'scale-105', 'z-10');
    });

    if (day >= 1 && day <= 5) {
        const slot = timeSlots.find(s => mins >= s.start && mins <= s.end);
        if (slot) {
            const cell = document.getElementById(`cell-${day}-${slot.id}`);
            if (cell) cell.classList.add('ring-4', 'ring-emerald-400', 'bg-emerald-50', 'transform', 'scale-105', 'z-10');
        }
    }
}

function openScheduleModal(day, period) {
    const cellId = `${day}-${period}`;
    document.getElementById('editScheduleCellId').value = cellId;
    const data = state.userSchedule[cellId] || { courseName: '', location: '' };
    document.getElementById('editScheduleCourse').value = data.courseName;
    document.getElementById('editScheduleLocation').value = data.location;
    document.getElementById('scheduleModal').classList.remove('hidden');
}

export function initSchedule() {
    setInterval(highlightCurrentClass, 60000);

    document.addEventListener('click', (e) => {
        const cellTarget = e.target.closest('[data-action="open-schedule-cell"]');
        if (cellTarget) {
            openScheduleModal(parseInt(cellTarget.dataset.day), cellTarget.dataset.period);
        }
    });

    document.getElementById('closeScheduleModal').onclick = () => {
        document.getElementById('scheduleModal').classList.add('hidden');
    };

    document.getElementById('confirmSaveSchedule').onclick = async () => {
        const cellId = document.getElementById('editScheduleCellId').value;
        const courseName = document.getElementById('editScheduleCourse').value.trim();
        const location = document.getElementById('editScheduleLocation').value.trim();

        const newSchedule = { ...state.userSchedule };
        newSchedule[cellId] = { courseName, location };

        try {
            await updateDoc(doc(db, USERS_PATH, auth.currentUser.uid), { schedule: newSchedule });
            state.userSchedule = newSchedule;
            renderSchedule();
            document.getElementById('scheduleModal').classList.add('hidden');
        } catch (e) {
            showToast("儲存失敗喵...");
        }
    };
}
