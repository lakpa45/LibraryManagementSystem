const FINE_PER_DAY = 5;
let loans = [], books = [], selectedMember = null, returnMember = null;
let filters = { text: '', status: 'all' };
const el = (id) => document.getElementById(id);
const localISO = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const today = () => localISO(new Date());
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const dateText = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const safe = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

async function api(url, options) {
    const response = await LibraryAPI.staffFetch(url, options);
    const body = await LibraryAPI.read(response).catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body.message || 'Request failed.');
        error.status = response.status;
        throw error;
    }
    return body;
}

function errorFor(id, message = '') {
    el(id)?.classList.toggle('field-err', Boolean(message));
    const node = document.querySelector(`[data-err="${id}"]`);
    if (node) { node.textContent = message; node.classList.toggle('hidden', !message); }
}

function toast(title, message, isError = false) {
    el('toast-title').textContent = title; el('toast-body').textContent = message;
    el('toast').classList.toggle('bg-clay', isError); el('toast').classList.toggle('bg-forest', !isError);
    el('toast').classList.remove('translate-y-2', 'opacity-0');
    setTimeout(() => el('toast').classList.add('translate-y-2', 'opacity-0'), 3500);
}

function memberHtml(m) {
    const borrowing = m.active_borrowings ? `${m.active_borrowings} active borrowing${m.active_borrowings === 1 ? '' : 's'}` : 'No active borrowings';
    return `<p class="font-semibold">${safe(m.display_name)}</p><p>Username: ${safe(m.username)}</p><p>Card ID: ${safe(m.unique_id || 'Not assigned')}</p><p>Status: ${safe(m.status)} · ${borrowing}</p>`;
}

function enableBorrow() { el('borrow-button').disabled = !(selectedMember && el('i-book-id').value); }

async function findMember(inputId, detailId, mode) {
    const q = el(inputId).value.trim();
    if (!q) return errorFor(inputId, 'Enter an exact Card ID or username.');
    const button = el(mode === 'borrow' ? 'i-member-find' : 'r-member-find');
    button.disabled = true;
    try {
        const result = await api(`/api/loans/members/search?q=${encodeURIComponent(q)}`);
        const member = result.member;
        errorFor(inputId); el(detailId).innerHTML = memberHtml(member); el(detailId).classList.remove('hidden');
        if (mode === 'borrow') { selectedMember = member; el('i-member-id').value = member.member_id; enableBorrow(); }
        else { returnMember = member; await loadMemberLoans(member.member_id); }
    } catch (err) {
        errorFor(inputId, err.message); el(detailId).classList.add('hidden');
        if (mode === 'borrow') { selectedMember = null; el('i-member-id').value = ''; enableBorrow(); }
        else { returnMember = null; el('member-active-loans').innerHTML = ''; }
    } finally { button.disabled = false; }
}

let memberValidationTimer = null;
let memberValidationRequest = null;
let memberValidationVersion = 0;

function setMemberValidation(state, message = '') {
    const input = el('i-member-search');
    const icon = el('i-member-validation-icon');
    const status = el('i-member-validation-status');
    input.classList.remove('border-green-600', 'border-red-500');
    icon.className = 'hidden pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 items-center justify-center text-sm';
    icon.innerHTML = '';
    status.className = 'mt-1 text-xs text-ink-light';
    status.textContent = message;

    if (state === 'checking') {
        icon.className = 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-sm text-ink-light';
        icon.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
    } else if (state === 'valid') {
        input.classList.add('border-green-600');
        icon.className = 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-sm text-green-600';
        icon.innerHTML = '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>';
        status.className = 'mt-1 text-xs text-green-700';
    } else if (state === 'invalid') {
        input.classList.add('border-red-500');
        icon.className = 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-sm text-red-500';
        icon.innerHTML = '<i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>';
        status.className = 'mt-1 text-xs text-red-600';
    } else if (state === 'error') {
        icon.className = 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-sm text-red-500';
        icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>';
        status.className = 'mt-1 text-xs text-red-600';
    }
}

async function verifyBorrowMember(value, version) {
    memberValidationRequest?.abort();
    memberValidationRequest = new AbortController();
    try {
        const result = await api(`/api/loans/members/search?q=${encodeURIComponent(value.trim())}`, {
            signal: memberValidationRequest.signal
        });
        if (version !== memberValidationVersion || el('i-member-search').value.trim() !== value.trim()) return;
        selectedMember = result.member;
        el('i-member-id').value = result.member.member_id;
        el('i-member-detail').innerHTML = memberHtml(result.member);
        el('i-member-detail').classList.remove('hidden');
        setMemberValidation('valid', 'Member verified.');
        enableBorrow();
    } catch (error) {
        if (error.name === 'AbortError' || version !== memberValidationVersion) return;
        selectedMember = null;
        el('i-member-id').value = '';
        el('i-member-detail').classList.add('hidden');
        if (error.status === 404) setMemberValidation('invalid', 'Member not found.');
        else setMemberValidation('error', 'Unable to verify member. Please try again.');
        enableBorrow();
    }
}

function scheduleMemberValidation() {
    const value = el('i-member-search').value;
    memberValidationVersion += 1;
    const version = memberValidationVersion;
    clearTimeout(memberValidationTimer);
    memberValidationRequest?.abort();
    selectedMember = null;
    el('i-member-id').value = '';
    el('i-member-detail').classList.add('hidden');
    enableBorrow();

    if (!value.trim()) {
        setMemberValidation('empty');
        return;
    }
    setMemberValidation('checking', 'Checking member…');
    memberValidationTimer = setTimeout(() => verifyBorrowMember(value, version), 450);
}

async function loadBooks(q = '') {
    try { books = await api(`/api/loans/books/search?q=${encodeURIComponent(q)}`); renderBooks(); }
    catch (err) { errorFor('i-book-search', err.message); }
}

function renderBooks() {
    el('i-book-suggest').innerHTML = books.length ? books.map((b, i) => `<button type="button" data-book="${i}" class="suggest-item block w-full text-left px-3.5 py-2.5 text-sm"><span class="font-medium">${safe(b.title)}</span><span class="text-xs text-sage"> · ID ${b.book_id} · ${b.available_quantity} available</span><span class="block text-xs text-ink-light">ISBN: ${safe(b.isbn || 'Not recorded')}</span></button>`).join('') : '<div class="px-3.5 py-2.5 text-xs text-ink-light">No available physical books match.</div>';
    el('i-book-suggest').classList.remove('hidden');
}

function selectBook(b) {
    el('i-book-search').value = b.title; el('i-book-id').value = b.book_id; el('i-book-suggest').classList.add('hidden');
    el('i-book-detail').innerHTML = `<div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div class="min-w-0"><p class="font-semibold break-words">${safe(b.title)}</p><p class="mt-1 text-ink-light break-words">Author: ${safe(b.author || 'Not recorded')}</p><p class="mt-1 text-ink-light">Unique ID: ${b.book_id}</p></div><span class="shrink-0 self-start rounded-full bg-forest/10 px-2.5 py-1 font-semibold text-forest">${b.available_quantity} available</span></div>`;
    el('i-book-detail').classList.remove('hidden'); errorFor('i-book-search'); enableBorrow();
}

async function loadLoans() {
    try { loans = await api('/api/loans/active'); renderLoans(); }
    catch (err) { toast('Could not load borrowings', err.message, true); }
}

async function loadMemberLoans(memberId) {
    const list = await api(`/api/loans/members/${memberId}/active`);
    el('member-active-loans').innerHTML = list.length ? list.map((loan) => `<article class="flex min-w-0 flex-col gap-3 bg-paper rounded-lg p-4 border border-ink/10 sm:flex-row sm:items-center sm:justify-between"><div class="min-w-0"><p class="font-medium text-sm break-words">${safe(loan.title)}</p><p class="text-xs text-ink-light mt-1 break-words">Book ID ${loan.book_id} · Due ${dateText(loan.due_date)}</p></div><button type="button" data-return="${loan.issue_id}" class="w-full min-h-10 shrink-0 bg-forest hover:bg-forest-light disabled:opacity-50 text-paper font-semibold text-xs rounded-full px-5 py-2 sm:w-auto focus:outline-none focus:ring-2 focus:ring-brass/50">Return</button></article>`).join('') : '<p class="text-sm text-ink-light bg-paper rounded-lg p-4 border border-ink/10">This member has no active borrowed books.</p>';
}

function updateDue() {
    const value = el('i-issue-date').value || today(), due = new Date(`${value}T00:00:00`);
    due.setDate(due.getDate() + Number(el('i-period').value)); el('i-due-preview').textContent = dateText(localISO(due));
}

el('tab-issue').onclick = () => { el('tab-issue').classList.add('active'); el('tab-return').classList.remove('active'); el('issue-form').classList.remove('hidden'); el('return-form').classList.add('hidden'); };
el('tab-return').onclick = () => { el('tab-return').classList.add('active'); el('tab-issue').classList.remove('active'); el('return-form').classList.remove('hidden'); el('issue-form').classList.add('hidden'); };
el('i-member-find').onclick = () => {
    clearTimeout(memberValidationTimer);
    const value = el('i-member-search').value;
    if (!value.trim()) return setMemberValidation('empty');
    memberValidationVersion += 1;
    setMemberValidation('checking', 'Checking member…');
    verifyBorrowMember(value, memberValidationVersion);
};
el('r-member-find').onclick = () => findMember('r-member-search', 'r-member-detail', 'return');
['i-member-search', 'r-member-search'].forEach((id) => el(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el(id === 'i-member-search' ? 'i-member-find' : 'r-member-find').click(); } }));
el('i-member-search').oninput = scheduleMemberValidation;

let bookTimer;
el('i-book-search').oninput = () => { el('i-book-id').value = ''; el('i-book-detail').classList.add('hidden'); enableBorrow(); clearTimeout(bookTimer); bookTimer = setTimeout(() => loadBooks(el('i-book-search').value.trim()), 200); };
el('i-book-search').onfocus = () => loadBooks(el('i-book-search').value.trim());
el('i-book-suggest').onclick = (e) => { const button = e.target.closest('[data-book]'); if (button) selectBook(books[Number(button.dataset.book)]); };
document.addEventListener('click', (e) => { if (!el('i-book-suggest').contains(e.target) && e.target !== el('i-book-search')) el('i-book-suggest').classList.add('hidden'); });

el('i-issue-date').value = today(); el('i-issue-date').onchange = updateDue; el('i-period').onchange = updateDue; updateDue();
el('issue-form').onsubmit = async (e) => {
    e.preventDefault(); if (!selectedMember || !el('i-book-id').value) return;
    const button = el('borrow-button'), issueDate = el('i-issue-date').value || today(), due = new Date(`${issueDate}T00:00:00`);
    due.setDate(due.getDate() + Number(el('i-period').value)); button.disabled = true;
    try {
        const result = await api('/api/loans/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member_id: selectedMember.member_id, book_id: Number(el('i-book-id').value), issue_date: issueDate, due_date: localISO(due) }) });
        toast(result.message || 'Book borrowed successfully.', `Due ${dateText(localISO(due))}`); el('i-book-id').value = ''; el('i-book-search').value = ''; el('i-book-detail').classList.add('hidden');
        const refreshes = [loadBooks(), loadLoans(), findMember('i-member-search', 'i-member-detail', 'borrow')];
        if (returnMember?.member_id === selectedMember.member_id) refreshes.push(loadMemberLoans(selectedMember.member_id));
        await Promise.all(refreshes);
    } catch (err) { console.error('Borrow request failed:', err.message); toast('Borrow failed', err.message, true); } finally { enableBorrow(); }
};

el('member-active-loans').onclick = async (e) => {
    const button = e.target.closest('[data-return]'); if (!button || !returnMember) return; button.disabled = true;
    try { await api(`/api/loans/return/${button.dataset.return}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ return_date: today() }) }); toast('Book returned', 'The physical copy is available again.'); await Promise.all([loadMemberLoans(returnMember.member_id), loadBooks(), loadLoans()]); await findMember('r-member-search', 'r-member-detail', 'return'); }
    catch (err) { button.disabled = false; toast('Return failed', err.message, true); }
};

function renderLoans() {
    let list = loans.slice(), q = filters.text.trim().toLowerCase();
    if (q) list = list.filter((l) => l.title.toLowerCase().includes(q) || `${l.first_name} ${l.last_name}`.toLowerCase().includes(q));
    if (filters.status === 'overdue') list = list.filter((l) => days(l.due_date, today()) > 0);
    if (filters.status === 'active') list = list.filter((l) => days(l.due_date, today()) <= 0);
    el('loans-empty').classList.toggle('hidden', list.length > 0);
    el('loans-body').innerHTML = list.map((l) => { const overdue = days(l.due_date, today()), status = overdue > 0 ? `Overdue · ₹${overdue * FINE_PER_DAY}` : overdue === 0 ? 'Due today' : 'On time'; return `<tr><td class="px-5 py-3 font-medium">${safe(l.title)}</td><td class="px-5 py-3 text-ink-light">${safe(l.first_name)} ${safe(l.last_name)}</td><td class="px-5 py-3 font-mono text-xs">${dateText(l.issue_date)}</td><td class="px-5 py-3 font-mono text-xs">${dateText(l.due_date)}</td><td class="px-5 py-3 text-xs">${status}</td></tr>`; }).join('');
    el('stat-out').textContent = loans.length; el('stat-today').textContent = loans.filter((l) => days(l.due_date, today()) === 0).length;
    const overdue = loans.filter((l) => days(l.due_date, today()) > 0); el('stat-overdue').textContent = overdue.length; el('stat-fines').textContent = `₹${overdue.reduce((sum, l) => sum + days(l.due_date, today()) * FINE_PER_DAY, 0)}`;
}
el('loan-filter').oninput = (e) => { filters.text = e.target.value; renderLoans(); };
el('loan-status-filter').onchange = (e) => { filters.status = e.target.value; renderLoans(); };
Promise.all([loadBooks(), loadLoans()]);
