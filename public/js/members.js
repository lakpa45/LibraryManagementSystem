function escapeMemberHtml(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
let members = [];
let state = { search:'', type:'all', sort:'recent' };

async function loadMembers() {
    try {
        const response = await LibraryAPI.staffFetch('/api/members');
        if (!response.ok) throw new Error((await LibraryAPI.read(response)).message || 'Unable to load records.');
        members = await LibraryAPI.read(response);
        render();
    } catch (err) {
        const body = document.getElementById('members-body');
        body.innerHTML = '<tr><td colspan=7>Unable to load members. Please refresh and try again.</td></tr>';
    }
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function isExpired(iso) {
    if (!iso) return false;
    return new Date(iso) < new Date();
}
function renderStats() {
    document.getElementById('stat-total').textContent = members.length;
    document.getElementById('stat-student').textContent = members.filter(m => m.member_type === 'Student').length;
    document.getElementById('stat-faculty').textContent = members.filter(m => m.member_type === 'Faculty').length;
    document.getElementById('stat-expired').textContent = members.filter(m => isExpired(m.valid_till)).length;
}
function getFiltered() {
    let list = [...members];
    if (state.type !== 'all') list = list.filter(m => m.member_type === state.type);
    if (state.search.trim()) {
        const q = state.search.trim().toLowerCase();
        list = list.filter(m =>
            `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
            (m.card_no || '').toLowerCase().includes(q) ||
            (m.roll_id || '').toLowerCase().includes(q)
        );
    }
    if (state.sort === 'name') list.sort((a,b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    else if (state.sort === 'expiry') list.sort((a,b) => new Date(a.valid_till || '9999-12-31') - new Date(b.valid_till || '9999-12-31'));
    else list.sort((a,b) => new Date(b.registered_on) - new Date(a.registered_on));
    return list;
}
function initials(first, last) {
    return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}
function render() {
    const list = getFiltered();
    const body = document.getElementById('members-body');
    const empty = document.getElementById('empty-state');
    if (list.length === 0) {
        body.innerHTML = '';
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        body.innerHTML = list.map(m => {
            const expired = isExpired(m.valid_till);
            return `
            <tr class="fade-row hover:bg-paper/60 transition cursor-pointer" data-id="${escapeMemberHtml(m.member_id)}">
                <td class="px-5 py-3">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-forest/10 text-forest flex items-center justify-center font-display text-xs shrink-0">${escapeMemberHtml(initials(m.first_name, m.last_name))}</div>
                        <span class="font-medium">${escapeMemberHtml(m.first_name)} ${escapeMemberHtml(m.last_name)}</span>
                    </div>
                </td>
                <td class="px-5 py-3 font-mono text-xs text-ink-light">${escapeMemberHtml(m.card_no || '—')}</td>
                <td class="px-5 py-3">
                    <span class="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold stamp bg-forest/10 text-forest">${escapeMemberHtml(m.member_type || '—')}</span>
                </td>
                <td class="px-5 py-3 text-ink-light">${escapeMemberHtml(m.department || '—')}</td>
                <td class="px-5 py-3 text-ink-light text-xs">
                    <p>${escapeMemberHtml(m.phone || '—')}</p>
                </td>
                <td class="px-5 py-3">
                    <span class="text-xs font-medium ${expired ? 'text-clay' : 'text-ink-light'}">${fmtDate(m.valid_till)}${expired ? ' · Expired' : ''}</span>
                </td>
                <td class="px-5 py-3 text-right">
                    <button class="text-xs font-medium text-brass-dark hover:text-brass" data-view="${escapeMemberHtml(m.member_id)}">View</button>
                </td>
            </tr>`;
        }).join('');
    }
    renderStats();
}

document.getElementById('search').addEventListener('input', (e) => { state.search = e.target.value; render(); });
document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
document.getElementById('type-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    state.type = btn.dataset.type;
    document.querySelectorAll('#type-chips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    render();
});

const drawer = document.getElementById('drawer');
const backdrop = document.getElementById('drawer-backdrop');
let activeId = null;

function openDrawer(id) {
    const m = members.find(x => String(x.member_id) === String(id));
    if (!m) return;
    activeId = id;
    document.getElementById('d-name').textContent = `${m.first_name} ${m.last_name}`;
    document.getElementById('d-card').textContent = m.card_no || '—';
    document.getElementById('d-type').textContent = m.member_type || '—';
    document.getElementById('d-dept').textContent = m.department || '—';
    document.getElementById('d-roll').textContent = m.roll_id || '—';
    document.getElementById('d-email').textContent = m.email;
    document.getElementById('d-phone').textContent = m.phone || '—';
    document.getElementById('d-dob').textContent = fmtDate(m.dob);
    document.getElementById('d-reg').textContent = fmtDate(m.registered_on);
    document.getElementById('d-expiry').textContent = fmtDate(m.valid_till);
    document.getElementById('d-address').textContent = m.address || '—';
    drawer.classList.remove('translate-x-full');
    backdrop.classList.remove('opacity-0', 'pointer-events-none');
}
function closeDrawer() {
    drawer.classList.add('translate-x-full');
    backdrop.classList.add('opacity-0', 'pointer-events-none');
    activeId = null;
}

document.getElementById('members-body').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-id]');
    if (row) openDrawer(row.dataset.id);
});
document.getElementById('drawer-close').addEventListener('click', closeDrawer);
backdrop.addEventListener('click', closeDrawer);

document.getElementById('drawer-delete').addEventListener('click', async () => {
    const button = document.getElementById('drawer-delete');
    if (!activeId || button.disabled) return;
    button.disabled = true;

    try {
        const response = await LibraryAPI.staffFetch(`/api/members/${activeId}`, { method: 'DELETE' });

        if (response.ok) {
            closeDrawer();
            await loadMembers();
            const toast = document.getElementById('toast');
            document.getElementById('toast-msg').textContent = 'Member removed';
            toast.classList.remove('translate-y-24', 'opacity-0');
            setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 2500);
        } else { alert((await LibraryAPI.read(response)).message || 'Unable to remove member.'); }
    } catch (err) {
        alert('Unable to remove member. Please try again.');
    } finally { button.disabled = false; }
});

loadMembers();