const dateElement = document.getElementById("today-date");
const today = new Date();
dateElement.textContent = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
});

// Real stats from the database
async function loadStats() {
    try {
        const response = await LibraryAPI.staffFetch('/api/dashboard/stats', { headers: adminAuthHeaders() });
        if (!response.ok) throw new Error('Unable to load dashboard statistics.');
        const stats = await LibraryAPI.read(response);

        animateCount('stat-books', stats.books);
        animateCount('stat-borrowers', stats.borrowers);
        animateCount('stat-overdue', stats.overdue);
    } catch (err) {
        console.error(err);
    }
}

loadStats();

function toggleAdminMenu() {
    document.getElementById("adminMenu").classList.toggle("hidden");
}

async function logout() {
    if (confirm("Are you sure you want to logout?")) {
        try { await LibraryAPI.staffFetch('/api/auth/logout', { method: 'POST' }); } catch (error) { console.error('Server sign-out failed:', error); }
        localStorage.removeItem('adminToken');
        localStorage.removeItem('librarianToken');
        window.location.href = "/";
    }
}
function openPasswordModal() {
    document.getElementById("passwordModal").classList.remove("hidden");
}

function closePasswordModal() {
    document.getElementById("passwordModal").classList.add("hidden");

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";
    document.getElementById("passwordMessage").textContent = "";
}

async function changePassword(event) {
    event.preventDefault();
    const submit = event.target.querySelector('[type=submit]');
    if (submit.disabled) return;

    const currentPassword =
        document.getElementById("currentPassword").value;

    const newPassword =
        document.getElementById("newPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;

    const message =
        document.getElementById("passwordMessage");

    if (newPassword.length < 8 || newPassword.length > 72) {
        message.textContent =
            "New password must be between 8 and 72 characters.";
        message.className = "text-sm mb-4 text-red-600";
        return;
    }

    if (newPassword !== confirmPassword) {
        message.textContent =
            "New passwords do not match.";
        message.className = "text-sm mb-4 text-red-600";
        return;
    }

    try {
        submit.disabled = true;
        const response = await LibraryAPI.staffFetch('/api/auth/change-password', {
            method: 'POST', headers: { ...adminAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        const result = await LibraryAPI.read(response).catch(() => ({}));
        message.textContent = result.message || (response.ok ? 'Password changed successfully.' : 'Unable to change password.');
        message.className = `text-sm mb-4 ${response.ok ? 'text-green-600' : 'text-red-600'}`;
        if (response.ok) setTimeout(closePasswordModal, 1500);
    } catch (error) {
        message.textContent = 'Unable to change password. Please try again.';
        message.className = 'text-sm mb-4 text-red-600';
    } finally { submit.disabled = false; }
}

function animateCount(
    id,
    target,
    prefix = ''
) {
    const el =
        document.getElementById(id);
    let cur = 0;
    const step =
        Math.max(
            1,
            Math.ceil(target / 40)
        );
    const t =
        setInterval(() => {
            cur += step;
            if (cur >= target) {
                cur = target;
                clearInterval(t);
            }
            el.textContent =
                prefix +
                cur.toLocaleString('en-IN');
        }, 20);
}

function libEscapeHtmlDash(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function adminAuthHeaders() {
    return { 'Authorization': 'Bearer ' + (localStorage.getItem('adminToken') || localStorage.getItem('librarianToken')) };
}

function formatActivityDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadgeClasses(status) {
    if (status === 'Overdue') return 'bg-red-50 text-red-600';
    if (status === 'Completed') return 'bg-green-50 text-green-700';
    return 'bg-amber-50 text-amber-700'; // Active
}

async function loadRecentActivity() {
    const tbody = document.getElementById('activity-body');
    if (!tbody) return;

    try {
        const response = await LibraryAPI.staffFetch('/api/dashboard/activity', { headers: adminAuthHeaders() });
        if (!response.ok) throw new Error('Failed to load activity');
        const activity = await LibraryAPI.read(response);

        if (!activity.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-6 text-center text-[#8A7B5C] text-sm">No recent activity.</td></tr>';
            return;
        }

        tbody.innerHTML = activity.map((row) => `
            <tr>
                <td class="px-5 py-3">${libEscapeHtmlDash(row.member)}</td>
                <td class="px-5 py-3">${libEscapeHtmlDash(row.title)}</td>
                <td class="px-5 py-3">${libEscapeHtmlDash(row.action)}</td>
                <td class="px-5 py-3">${formatActivityDate(row.date)}</td>
                <td class="px-5 py-3">
                    <span class="text-xs font-medium px-2 py-1 rounded-full ${statusBadgeClasses(row.status)}">${row.status}</span>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Failed to load recent activity:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-6 text-center text-red-500 text-sm">Couldn\'t load activity.</td></tr>';
    }
}

async function loadDueSoon() {
    const list = document.getElementById('due-list');
    if (!list) return;

    try {
        const response = await LibraryAPI.staffFetch('/api/dashboard/due-soon', { headers: adminAuthHeaders() });
        if (!response.ok) throw new Error('Failed to load due list');
        const dueSoon = await LibraryAPI.read(response);

        if (!dueSoon.length) {
            list.innerHTML = '<li class="px-5 py-6 text-center text-[#8A7B5C] text-sm">Nothing due soon.</li>';
            return;
        }

        list.innerHTML = dueSoon.map((row) => {
            const isOverdue = row.days_remaining < 0;
            const label = isOverdue
                ? `${Math.abs(row.days_remaining)}d overdue`
                : row.days_remaining === 0
                    ? 'Due today'
                    : `Due in ${row.days_remaining}d`;
            return `
                <li class="px-5 py-3 flex items-center justify-between">
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-ink truncate">${libEscapeHtmlDash(row.title)}</p>
                        <p class="text-xs text-[#8A7B5C] truncate">${libEscapeHtmlDash(row.member)}</p>
                    </div>
                    <span class="text-xs font-medium px-2 py-1 rounded-full shrink-0 ${isOverdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}">${label}</span>
                </li>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load due list:', err);
        list.innerHTML = '<li class="px-5 py-6 text-center text-red-500 text-sm">Couldn\'t load due list.</li>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadRecentActivity();
    loadDueSoon();
});
