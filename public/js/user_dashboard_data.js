function libEscapeHtmlUser(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function userAuthHeaders() {
    return { 'Authorization': 'Bearer ' + localStorage.getItem('token') };
}

function userAuthHeadersJson() {
    return { ...userAuthHeaders(), 'Content-Type': 'application/json' };
}

function formatDueDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr) {
    const due = new Date(dateStr);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due - today) / 86400000);
}

async function handleRenewClick(issueId, btn) {
    btn.disabled = true;
    btn.textContent = 'Renewing…';
    try {
        const response = await fetch(`/api/loans/renew/${issueId}`, {
            method: 'PUT',
            headers: userAuthHeaders()
        });
        if (!response.ok) throw new Error('Renew failed');
        await loadMyLoans(); // re-fetch so the due date and badges update
    } catch (err) {
        console.error('Renew failed:', err);
        btn.disabled = false;
        btn.textContent = 'Renew';
        alert("Couldn't renew this book. Please try again or contact the librarian.");
    }
}

async function loadMyLoans() {
    const grid = document.querySelector('.books__grid');
    if (!grid) return;
    grid.innerHTML = '<p class="dashboard-empty">Loading your active loans...</p>';

    try {
        const response = await fetch('/api/loans/my-loans', { headers: userAuthHeaders() });
        if (!response.ok) throw new Error('Failed to load loans');
        const loans = await LibraryAPI.read(response);

        document.getElementById('borrowedCount').textContent = loans.length;
        const dueSoonCount = loans.filter((l) => daysUntil(l.due_date) <= 2).length;
        document.getElementById('dueSoonCount').textContent = dueSoonCount;
        const dueAlert = document.getElementById('dueAlert');
        const nextDue = loans.find((loan) => daysUntil(loan.due_date) <= 2);
        dueAlert.hidden = !nextDue;
        if (nextDue) {
            const days = daysUntil(nextDue.due_date);
            document.getElementById('dueAlertTitle').textContent = days < 0 ? 'A book is overdue' : days === 0 ? 'A book is due today' : `A book is due in ${days} day${days === 1 ? '' : 's'}`;
            document.getElementById('dueAlertMessage').textContent = `“${nextDue.title}” is due ${formatDueDate(nextDue.due_date)}.`;
        }

        if (!loans.length) {
            grid.innerHTML = '<p style="padding:20px;color:#888;">You have no books currently borrowed.</p>';
            return;
        }

        grid.innerHTML = loans.map((loan) => {
            const days = daysUntil(loan.due_date);
            const isOverdue = days < 0;
            const isWarn = days <= 2;
            const statusLabel = isOverdue
                ? 'Overdue'
                : days === 0 ? 'Due today'
                : days <= 2 ? `Due in ${days} day${days === 1 ? '' : 's'}`
                : 'On time';

            return `
                <article class="book-card">
                    <div class="book-card__media">
                        <span class="book-card__status ${isWarn ? 'book-card__status--warn' : ''}">${statusLabel}</span>
                        <i class="fa-solid fa-book"></i>
                    </div>
                    <div class="book-card__body">
                        <h3>${libEscapeHtmlUser(loan.title)}</h3>
                        <div class="book-card__due"><span>Due date</span><strong>${formatDueDate(loan.due_date)}</strong></div>
                        <div class="book-card__actions">
                            <button class="primary" data-issue-id="${loan.issue_id}">Renew</button>
                            <button data-book-id="${loan.book_id}">Details</button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        grid.querySelectorAll('.book-card__actions .primary').forEach((btn) => {
            btn.addEventListener('click', () => handleRenewClick(btn.dataset.issueId, btn));
        });
        grid.querySelectorAll('.book-card__actions button:not(.primary)').forEach((btn) => {
            btn.addEventListener('click', () => {
                window.location.href = `/book.html?id=${btn.dataset.bookId}`;
            });
        });
    } catch (err) {
        console.error('Failed to load loans:', err);
        grid.innerHTML = '<p style="padding:20px;color:#c62828;">Couldn\'t load your borrowed books.</p>';
    }
}

async function loadMyActivity() {
    const panel = document.querySelector('.split .panel:first-child');
    if (!panel) return;
    panel.querySelectorAll('.activity-row').forEach(row => row.remove());
    panel.insertAdjacentHTML('beforeend', '<p class="dashboard-empty dashboard-activity-loading">Loading recent activity...</p>');

    try {
        const response = await fetch('/api/loans/my-activity', { headers: userAuthHeaders() });
        if (!response.ok) throw new Error('Failed to load activity');
        const activity = await LibraryAPI.read(response);
        panel.querySelector('.dashboard-activity-loading')?.remove();

        const rowsHtml = activity.length
            ? activity.map((a) => {
                const icon = a.action === 'Returned' ? 'fa-rotate-left' : 'fa-arrow-right-to-bracket';
                return `
                    <div class="activity-row">
                        <span class="activity-row__ic"><i class="fa-solid ${icon}"></i></span>
                        <div class="activity-row__body">
                            <strong>${a.action} "${libEscapeHtmlUser(a.title)}"</strong>
                        </div>
                        <span class="activity-row__time">${formatDueDate(a.date)}</span>
                    </div>
                `;
            }).join('')
            : '<p style="padding:20px;color:#888;">No activity yet.</p>';

        const heading = panel.querySelector('h2');
        panel.innerHTML = '';
        if (heading) panel.appendChild(heading);
        panel.insertAdjacentHTML('beforeend', rowsHtml);
    } catch (err) {
        console.error('Failed to load activity:', err);
        panel.querySelector('.dashboard-activity-loading')?.remove();
        panel.insertAdjacentHTML('beforeend', '<p class="dashboard-empty">Couldn\'t load recent activity.</p>');
    }
}

async function loadMyProfile() {
    const nameEl = document.getElementById('userDashboardName');
    const form = document.querySelector('.account__fields');

    try {
        const response = await fetch('/api/members/me', { headers: userAuthHeaders() });
        if (!response.ok) throw new Error('Failed to load profile');
        const member = await LibraryAPI.read(response);
        const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim();
        const uniqueId = member.card_no || 'Pending approval';

        if (nameEl) nameEl.textContent = member.first_name || 'there';
        document.getElementById('userMemberId').textContent = uniqueId;
        document.getElementById('userMemberStatus').textContent = `${member.status || 'Member'} · ${member.member_type || 'Library member'}`;
        document.getElementById('userDashboardAvatar').textContent = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase() || 'U';
        document.getElementById('profileMemberId').value = member.member_id;

        if (form) {
            document.getElementById('profileFullName').value = fullName;
            document.getElementById('profileEmail').value = member.email || '';
            document.getElementById('profilePhone').value = member.phone || '';
            document.getElementById('profileCardNumber').value = member.card_no || 'Pending approval';
        }
    } catch (err) {
        console.error('Failed to load profile:', err);
        if (nameEl) nameEl.textContent = 'there';
    }
}

async function loadMyWishlist() {
    const panel = document.getElementById('wishlist');
    const count = document.getElementById('wishlistCount');
    if (!panel || !count) return;

    try {
        const response = await fetch('/api/wishlist', { headers: userAuthHeaders() });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('token');
                window.location.replace('/#login');
                return;
            }
            throw new Error('Failed to load wishlist');
        }

        const wishlist = await LibraryAPI.read(response);
        count.textContent = wishlist.length;
        panel.querySelectorAll('.wish-item, .dashboard-empty').forEach(item => item.remove());

        if (!wishlist.length) {
            panel.insertAdjacentHTML('beforeend', '<p class="dashboard-empty">Your wishlist is empty. <a href="/books">Explore the catalog</a> to save books.</p>');
            return;
        }

        panel.insertAdjacentHTML('beforeend', wishlist.map(book => `
            <div class="wish-item" data-book-id="${book.book_id}">
                <span class="wish-item__thumb">${book.cover_image ? `<img src="${libEscapeHtmlUser(book.cover_image)}" alt="">` : '<i class="fa-solid fa-book"></i>'}</span>
                <a class="wish-item__body" href="/book.html?id=${book.book_id}"><strong>${libEscapeHtmlUser(book.title)}</strong><small>${libEscapeHtmlUser(book.category_name || 'Uncategorized')} · ${Number(book.available_copies) ? 'Available' : 'Unavailable'}</small></a>
                <button type="button" class="wish-item__action" data-remove-wishlist="${book.book_id}" aria-label="Remove ${libEscapeHtmlUser(book.title)} from wishlist"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
            </div>`).join(''));

        panel.querySelectorAll('[data-remove-wishlist]').forEach(button => {
            button.addEventListener('click', () => removeDashboardWishlistBook(button));
        });
    } catch (err) {
        console.error('Failed to load wishlist:', err);
        count.textContent = '—';
        panel.querySelectorAll('.wish-item, .dashboard-empty').forEach(item => item.remove());
        panel.insertAdjacentHTML('beforeend', '<p class="dashboard-empty">Couldn\'t load your wishlist. Please refresh and try again.</p>');
    }
}

async function removeDashboardWishlistBook(button) {
    const item = button.closest('.wish-item');
    const title = item?.querySelector('strong')?.textContent || 'Book';
    button.disabled = true;
    try {
        const response = await fetch(`/api/wishlist/${encodeURIComponent(button.dataset.removeWishlist)}`, {
            method: 'DELETE',
            headers: userAuthHeaders()
        });
        const result = await LibraryAPI.read(response);
        if (!response.ok) throw new Error(result.message || 'Unable to remove book');
        if (window.libToast) window.libToast(`"${title}" removed from wishlist`);
        await loadMyWishlist();
    } catch (err) {
        console.error('Wishlist removal failed:', err);
        button.disabled = false;
        if (window.libToast) window.libToast(err.message || "Couldn't update your wishlist");
    }
}

function initAccountForm() {
    const form = document.querySelector('.account__fields');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('profileFullName').value.trim();
        const email = document.getElementById('profileEmail').value.trim();
        const phone = document.getElementById('profilePhone').value.trim();

        const nameParts = fullName.split(' ');
        const first_name = nameParts[0];
        const last_name = nameParts.slice(1).join(' ') || first_name;

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';

        try {
            const response = await fetch('/api/members/me', {
                method: 'PUT',
                headers: userAuthHeadersJson(),
                body: JSON.stringify({ first_name, last_name, email, phone })
            });

            if (!response.ok) throw new Error('Save failed');

            if (window.libToast) window.libToast('Account details saved');
            document.getElementById('userDashboardName').textContent = first_name;
        } catch (err) {
            console.error('Failed to save profile:', err);
            if (window.libToast) window.libToast("Couldn't save changes. Please try again.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) {
        window.location.replace('/#login');
        return;
    }
    loadMyLoans();
    loadMyActivity();
    loadMyProfile();
    loadMyWishlist();
    initAccountForm();
});
