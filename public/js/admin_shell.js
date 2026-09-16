(() => {
    const path = window.location.pathname;
    const isLibrarianPage = path.startsWith('/librarian/');
    const isDashboard = path === '/librarian/dashboard';

    if (isLibrarianPage && !isDashboard) {
        document.body.classList.add('librarian-page');
        const activeSection = path.includes('borrow-return') ? 'borrow-return'
            : path.includes('pending-members') ? 'pending-members'
                : path.includes('register-member') ? 'register-member'
                    : path.includes('members') ? 'members'
                        : 'books';
        const active = (section) => section === activeSection ? ' class="active" aria-current="page"' : '';
        const sidebarNode = document.getElementById('sidebar');
        if (sidebarNode) sidebarNode.innerHTML = `
            <div class="sidebar-brand"><span class="brand-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span><span>APNA</span></div>
            <p class="quick-label">Quick Links</p>
            <div class="quick-icons">
                <a href="/librarian/borrow-return" title="Borrow and return"><i class="fa-solid fa-arrow-right-arrow-left"></i></a>
                <a href="/librarian/members" title="Members"><i class="fa-solid fa-users"></i></a>
                <a href="/librarian/book-categories" title="Books"><i class="fa-solid fa-book"></i></a>
            </div>
            <nav class="side-nav" aria-label="Librarian navigation">
                <a href="/librarian/dashboard"><i class="fa-solid fa-chart-column"></i> Dashboard</a>
                <a href="/librarian/book-categories"${active('books')}><i class="fa-solid fa-book"></i> Books <span class="badge">Catalog</span></a>
                <a href="/librarian/borrow-return"${active('borrow-return')}><i class="fa-solid fa-arrow-right-arrow-left"></i> Borrow / Return</a>
                <a href="/librarian/members"${active('members')}><i class="fa-solid fa-users"></i> Members</a>
                <a href="/librarian/pending-members"${active('pending-members')}><i class="fa-solid fa-user-clock"></i> Pending Members</a>
                <a href="/librarian/register-member"${active('register-member')}><i class="fa-regular fa-address-card"></i> Register Member</a>
                <a href="/e-books"><i class="fa-solid fa-book-open-reader"></i> Digital Library</a>
                <a href="/overdue&fine.html"><i class="fa-regular fa-calendar-xmark"></i> Overdue &amp; Fines</a>
                <a href="/"><i class="fa-solid fa-house"></i> Main Website</a>
                <a href="/" id="shellLogout"><i class="fa-solid fa-arrow-right-from-bracket"></i> Logout</a>
            </nav>
            <div class="sidebar-footer">Librarian Workspace<br>APNA Library &middot; 2026</div>`;

        const header = document.querySelector('.main-area > .top-header');
        if (header) {
            const title = header.querySelector('.welcome-title span:last-child')?.textContent?.trim() || 'Librarian Workspace';
            const icon = header.querySelector('.home-icon i')?.className || 'fa-solid fa-book';
            header.className = 'top-header dashboard-header';
            header.innerHTML = `
                <button type="button" class="mobile-menu" id="mobileMenuBtn" aria-label="Open navigation" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
                <div class="profile">
                    <button type="button" class="profile-button" id="shellProfileButton" aria-expanded="false"><i class="fa-regular fa-comment-dots"></i><span class="profile-name" id="librarianName">Librarian</span><span class="avatar">L</span></button>
                    <div id="shellProfileMenu" class="profile-menu hidden"><a href="/librarian/dashboard">Dashboard</a><button type="button" id="shellMenuLogout">Logout</button></div>
                </div>
                <div class="welcome"><div class="welcome-title"><span class="home-icon"><i class="${icon}"></i></span><span>${title}</span></div><span class="today" id="shellToday"></span></div>`;
            const storedName = localStorage.getItem('adminName');
            if (storedName) document.getElementById('librarianName').textContent = storedName;
            document.getElementById('shellToday').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
            const profileButton = document.getElementById('shellProfileButton');
            const profileMenu = document.getElementById('shellProfileMenu');
            profileButton.addEventListener('click', () => {
                const open = profileMenu.classList.toggle('hidden') === false;
                profileButton.setAttribute('aria-expanded', String(open));
            });
        }

        document.querySelectorAll('.dashboard-content a[href="/librarian/dashboard"]').forEach((link) => {
            const heading = link.closest('.flex.flex-wrap');
            if (heading) heading.classList.add('legacy-page-heading');
        });
    }

    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('mobileMenuBtn');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !toggle || !overlay) return;
    if (!sidebar.id) sidebar.id = 'sidebar';
    toggle.setAttribute('aria-controls', sidebar.id);

    const setOpen = (open) => {
        sidebar.classList.toggle('open', open);
        overlay.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        const icon = toggle.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-bars', !open);
            icon.classList.toggle('fa-xmark', open);
        }
    };

    toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
    overlay.addEventListener('click', () => setOpen(false));
    document.querySelectorAll('.side-nav a').forEach((link) => {
        link.addEventListener('click', () => setOpen(false));
    });

    const signOut = async (event) => {
        event?.preventDefault();
        try { await LibraryAPI.staffFetch('/api/auth/logout', { method: 'POST' }); } catch (error) { console.error('Server sign-out failed:', error); }
        localStorage.removeItem('adminToken');
        localStorage.removeItem('librarianToken');
        window.location.href = '/';
    };
    document.getElementById('shellLogout')?.addEventListener('click', signOut);
    document.getElementById('shellMenuLogout')?.addEventListener('click', signOut);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && sidebar.classList.contains('open')) {
            setOpen(false);
            toggle.focus();
        }
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
        if (event.matches) setOpen(false);
    });
})();
