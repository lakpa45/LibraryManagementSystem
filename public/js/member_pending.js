let pending = [];

async function loadPending() {
    try {
        const response = await LibraryAPI.staffFetch('/api/members/pending');
        if (!response.ok) throw new Error((await LibraryAPI.read(response)).message || 'Unable to load records.');
        pending = await LibraryAPI.read(response);
        render();
    } catch (err) {
        showToast('Unable to load pending registrations. Please refresh and try again.');
    }
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function render() {
    const body = document.getElementById('pending-body');
    const cards = document.getElementById('pending-cards');
    const empty = document.getElementById('empty-state');

    if (pending.length === 0) {
        body.innerHTML = '';
        cards.innerHTML = '';
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        body.innerHTML = pending.map(m => `
            <tr class="fade-row hover:bg-paper/60 transition" data-id="${escapeHtml(m.member_id)}">
                <td class="px-5 py-3 font-medium">${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</td>
                <td class="px-5 py-3 text-ink-light text-xs">${escapeHtml(m.email)}</td>
                <td class="px-5 py-3">
                    <span class="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-forest/10 text-forest">${escapeHtml(m.member_type || '—')}</span>
                </td>
                <td class="px-5 py-3 text-ink-light">${escapeHtml(m.department || '—')}</td>
                <td class="px-5 py-3 text-ink-light text-xs">${escapeHtml(m.phone || '—')}</td>
                <td class="px-5 py-3 font-mono text-xs text-ink-light">${fmtDate(m.registered_on)}</td>
                <td class="px-5 py-3 text-right">
                    <div class="pending-actions">
                        <button type="button" class="pending-action-button pending-action-button--approve" data-action="approve" data-id="${escapeHtml(m.member_id)}">Accept</button>
                        <button type="button" class="pending-action-button pending-action-button--reject" data-action="reject" data-id="${escapeHtml(m.member_id)}">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');
        cards.innerHTML = pending.map(m => `
            <article class="pending-member-card fade-row" data-id="${escapeHtml(m.member_id)}">
                <h2>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</h2>
                <p class="pending-member-card__email">${escapeHtml(m.email)}</p>
                <dl>
                    <div><dt>Type</dt><dd>${escapeHtml(m.member_type || '—')}</dd></div>
                    <div><dt>Department</dt><dd>${escapeHtml(m.department || '—')}</dd></div>
                    <div><dt>Phone</dt><dd>${escapeHtml(m.phone || '—')}</dd></div>
                    <div><dt>Registered</dt><dd>${fmtDate(m.registered_on)}</dd></div>
                </dl>
                <div class="pending-actions">
                    <button type="button" class="pending-action-button pending-action-button--approve" data-action="approve" data-id="${escapeHtml(m.member_id)}">Accept</button>
                    <button type="button" class="pending-action-button pending-action-button--reject" data-action="reject" data-id="${escapeHtml(m.member_id)}">Reject</button>
                </div>
            </article>
        `).join('');
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 3000);
}

document.getElementById('pending-lists').addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button || button.disabled) return;

    const id = button.dataset.id;
    const action = button.dataset.action;
    const matchingButtons = document.querySelectorAll(`button[data-action][data-id="${id}"]`);

    try {
        matchingButtons.forEach((item) => { item.disabled = true; });
        const response = await LibraryAPI.staffFetch(`/api/members/${id}/${action}`, { method: 'PUT' });
        const result = await LibraryAPI.read(response);

        if (response.ok) {
            showToast(action === 'approve' ? `Approved — Card ID ${result.member.card_no}` : 'Registration rejected');
            await loadPending();
        } else {
            showToast(result.message || 'Unable to update this registration');
            matchingButtons.forEach((item) => { item.disabled = false; });
        }
    } catch (err) {
        console.error(err);
        showToast('Unable to update this registration');
        matchingButtons.forEach((item) => { item.disabled = false; });
    }
});

loadPending();
