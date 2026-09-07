document.addEventListener('DOMContentLoaded', () => {
    /* ---- sticky header ---- */
    const header = document.querySelector('.header');
    const onScroll = () => {
        header.classList.toggle('is-stuck', window.scrollY > 10);
    };
    window.addEventListener('scroll', onScroll);
    onScroll();

    /* ---- animated stat counters ---- */
    const counters = document.querySelectorAll('.hero__stat .count');
    const animateCounter = (el) => {
        const target = parseInt(el.dataset.target, 10) || 0;

        const duration = 1400;
        const start = performance.now();

        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(eased * target);
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = target;
            }
        };
        requestAnimationFrame(step);
    };

    if (counters.length) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.4 });

        counters.forEach((counter) => observer.observe(counter));
    }

    /* ---- auth: login / register / user menu ---- */
    initAuth();

    /* ---- testimonials: reviews + star ratings ---- */
    initReviews();

    /* ---- featured books from database ---- */
    loadFeaturedBooks();

    /* ---- book of the month + new arrivals (cart-driven, from homepage_cart.js) ---- */
    loadHomepageProducts().then(() => {
        buildSlider('picks', {
            minSlides: 8,
            slidesPerView: 1,
            breakpoints: {
                560: { slidesPerView: 2 },
                900: { slidesPerView: 3 },
                1200: { slidesPerView: 4 }
            }
        });
    });
});

// For swiper sliders //
function buildSlider(name, options) {
    if (typeof Swiper === 'undefined') return;
    const container = document.querySelector('.' + name + '-swiper');
    if (!container) return;

    // clone slides so loop has enough to work with (keeps the markup clean)
    const wrapper = container.querySelector('.swiper-wrapper');
    const minSlides = options.minSlides || 0;
    delete options.minSlides;
    const originals = Array.prototype.slice.call(wrapper.children);
    let i = 0;
    while (wrapper.children.length < minSlides && originals.length) {
        wrapper.appendChild(originals[i % originals.length].cloneNode(true));
        i++;
    }

    const nav = document.querySelector('.slider-nav[data-slider="' + name + '"]');
    return new Swiper('.' + name + '-swiper', Object.assign({
        loop: true,
        spaceBetween: 22,
        grabCursor: true,
        navigation: nav ? {
            nextEl: nav.querySelector('[data-dir="next"]'),
            prevEl: nav.querySelector('[data-dir="prev"]')
        } : false
    }, options));
}

// For category collections from database //
async function loadFeaturedBooks() {
    const grid = document.getElementById('stylesGrid');
    const categoryGrid = document.getElementById('homepageCategoryGrid');
    if (!grid && !categoryGrid) return;

    try {
        const [bookResponse, categoryResponse] = await Promise.all([
            fetch('/api/books'),
            fetch('/api/categories')
        ]);
        if (!bookResponse.ok || !categoryResponse.ok) throw new Error('Unable to load collections');
        const books = await bookResponse.json();
        const categories = await categoryResponse.json();

        const colorClasses = ['style-card--g1', 'style-card--g2', 'style-card--g3', 'style-card--g4'];
        const icons = ['fa-book-open', 'fa-graduation-cap', 'fa-flask', 'fa-scale-balanced', 'fa-laptop-code', 'fa-landmark'];

        if (grid) {
            grid.replaceChildren(...books.slice(0, 4).map((book, index) => {
                const link = document.createElement('a');
                link.href = `/book.html?id=${encodeURIComponent(book.book_id)}`;
                link.className = `style-card ${colorClasses[index] || ''}`;
                const media = document.createElement('div');
                media.className = 'style-card__media';
                const image = document.createElement('img');
                image.src = book.cover_image || '/images/1stbook.jpg';
                image.alt = `Cover of ${book.title}`;
                image.loading = 'lazy';
                media.append(image);
                const body = document.createElement('div');
                body.className = 'style-card__body';
                const label = document.createElement('span');
                label.textContent = `${String(index + 1).padStart(2, '0')}. Featured Book`;
                const title = document.createElement('h3');
                title.textContent = book.title;
                body.append(label, title);
                link.append(media, body);
                return link;
            }));
        }

        if (categoryGrid) {
            categoryGrid.replaceChildren(...categories.slice(0, 4).map((category, index) => {
                const link = document.createElement('a');
                link.href = `/categories?categoryId=${encodeURIComponent(category.category_id)}`;
                link.className = 'cat-title';
                const iconWrap = document.createElement('span');
                iconWrap.className = 'cat-title__ic';
                const icon = document.createElement('i');
                icon.className = `fa-solid ${icons[index % icons.length]}`;
                iconWrap.append(icon);
                const title = document.createElement('h3');
                title.textContent = category.category_name;
                const count = document.createElement('span');
                count.className = 'cat-title__count';
                count.textContent = `${category.book_count} ${Number(category.book_count) === 1 ? 'Book' : 'Books'}`;
                link.append(iconWrap, title, count);
                return link;
            }));
        }
    } catch (err) {
        console.error(err);
    }
}

// ======Shared storage keys + session helpers (used by auth and reviews) ========//
const LIB_REVIEWS_KEY = 'icfai_library_reviews';

function libGetSession() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return { name: payload.email, email: payload.email };
    } catch (err) {
        return null;
    }
}

function libGetInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    const initials = parts.length > 1
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0].slice(0, 2);
    return initials.toUpperCase();
}
// For auth (login / user menu)
function ensurePublicLoginModal() {
    let overlay = document.getElementById('authOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'authOverlay';
        overlay.className = 'auth-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="auth-modal">
            <button type="button" class="auth-modal__close" id="authClose" aria-label="Close">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
            <form class="auth-form is-active" id="loginForm" novalidate>
                <h2>Welcome back</h2>
                <p class="auth-sub">Login to your account</p>
                <label class="auth-field">
                    Email
                    <input type="email" name="email" required placeholder="you@example.com" autocomplete="email">
                </label>
                <label class="auth-field">
                    Password
                    <span style="position:relative;display:block">
                        <input type="password" name="password" required placeholder="••••••••" autocomplete="current-password" style="padding-right:2.75rem">
                        <button type="button" data-password-toggle aria-label="Show password" title="Show password" style="position:absolute;right:.85rem;top:50%;transform:translateY(-50%);border:0;background:transparent;cursor:pointer;color:inherit;padding:.25rem"><i class="fa-regular fa-eye" aria-hidden="true"></i></button>
                    </span>
                </label>
                <label class="auth-field">
                    Role
                    <select id="loginRole" name="role" required>
                        <option value="" selected disabled>Select a role</option>
                        <option value="member">Member</option>
                        <option value="librarian">Librarian</option>
                        <option value="admin">Admin</option>
                    </select>
                </label>
                <p class="auth-error" id="loginError" role="alert" aria-live="polite"></p>
                <button type="submit" class="btn btn--accent auth-submit">Login</button>
                <p class="auth-switch">New here? <a href="/register.html" class="auth-switch__link">Register now</a></p>
            </form>
        </div>`;
    return overlay;
}

function initAuth() {
    const overlay = ensurePublicLoginModal();
    const modal = overlay ? overlay.querySelector('.auth-modal') : null;
    const closeBtn = document.getElementById('authClose');
    const loginButtons = document.querySelectorAll('[data-login-trigger], #loginBtn');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    const authLinks = document.getElementById('navbarAuth');
    const userBlock = document.getElementById('navbarUser');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    const logoutBtn = document.getElementById('logoutBtn');
    const userAvatar = document.getElementById('userAvatar');
    const userAvatarLg = document.getElementById('userAvatarLg');
    const userMenuName = document.getElementById('userMenuName');
    const userMenuEmail = document.getElementById('userMenuEmail');

    if (!loginForm) return;

    /* --- real session helpers (based on JWT) --- */
    const getSession = () => {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            // Safer base64 decoding for JWTs
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(base64));
            return { email: payload.email };
        } catch (err) {
            return null;
        }
    };
    const clearSession = () => localStorage.removeItem('token');
    const getInitials = libGetInitials;

    /* --- header state --- */
    const renderAuthState = () => {
        const session = getSession();
        if (session) {
            if (authLinks) authLinks.hidden = true;
            if (userBlock) userBlock.hidden = false;
            const initials = getInitials(session.email);
            if (userAvatar) userAvatar.textContent = initials;
            if (userAvatarLg) userAvatarLg.textContent = initials;
            if (userMenuName) userMenuName.textContent = session.name || session.email.split('@')[0];
            if (userMenuEmail) userMenuEmail.textContent = session.email;
            document.querySelectorAll('[data-menu-auth]').forEach((item) => { item.hidden = true; });
        } else {
            if (authLinks) authLinks.hidden = false;
            if (userBlock) userBlock.hidden = true;
            if (userBlock) userBlock.classList.remove('is-open');
            document.querySelectorAll('[data-menu-auth]').forEach((item) => { item.hidden = false; });
        }
        document.dispatchEvent(new CustomEvent('libauthchange'));
    };

    /* --- modal open/close --- */
    const clearErrors = () => {
        if (loginError) loginError.textContent = '';
    };

    const openModal = () => {
        clearErrors();
        overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        const firstInput = loginForm.querySelector('input');
        if (firstInput) firstInput.focus();
    };

    const closeModal = () => {
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        loginForm.reset();
        clearErrors();
    };

    // Password-reset completion links directly to the existing login modal.
    if (new URLSearchParams(window.location.search).get('login') === '1') openModal();

    // Modal Event Listeners
    loginButtons.forEach((button) => {
        button.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    });
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeModal(); });

    const passwordToggle = loginForm.querySelector('[data-password-toggle]');
    passwordToggle?.addEventListener('click', () => {
        const input = loginForm.elements.password;
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        passwordToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        passwordToggle.title = showing ? 'Show password' : 'Hide password';
        passwordToggle.querySelector('i').className = showing ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
    });

    /* --- login (real backend) --- */
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        
        const formData = new FormData(loginForm);
        const email = (formData.get('email') || '').trim().toLowerCase();
        const password = formData.get('password') || '';
        const role = formData.get('role');

        const loginOptions = {
            member: {
                endpoint: '/api/auth/signin',
                tokenKey: 'token',
                redirect: '/user_dashboard.html'
            },
            librarian: {
                endpoint: '/api/auth/librarian-staff/signin',
                tokenKey: 'librarianToken',
                redirect: '/librarian/dashboard'
            },
            admin: {
                endpoint: '/api/auth/librarian/signin',
                tokenKey: 'adminToken',
                redirect: '/admin/dashboard'
            }
        };
        const loginOption = loginOptions[role];

        if (!loginOption) {
            loginError.textContent = 'Please select a role.';
            return;
        }

        if (!email || !password) {
            loginError.textContent = 'Please enter your email address and password.';
            return;
        }

        try {
            const response = await fetch(loginOption.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, role })
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok && result.token) {
                localStorage.setItem(loginOption.tokenKey, result.token);
                closeModal();
                if (role === 'member') renderAuthState();
                window.location.href = loginOption.redirect;
            } else if (response.status === 401) {
                loginError.textContent = 'The email or password is incorrect, or the selected role does not match this account.';
            } else if (response.status >= 500) {
                loginError.textContent = 'The server cannot process the login right now. Please try again.';
            } else {
                loginError.textContent = result.message || 'Unable to sign in with the selected role.';
            }
        } catch (err) {
            console.error(err);
            loginError.textContent = 'Unable to connect to the server. Please try again.';
        }
    });

    /* --- user dropdown --- */
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = userBlock.classList.toggle('is-open');
            userMenuBtn.setAttribute('aria-expanded', isOpen);
        });
    }
    document.addEventListener('click', (e) => {
        if (userBlock && userBlock.classList.contains('is-open') && !userBlock.contains(e.target)) {
            userBlock.classList.remove('is-open');
            if(userMenuBtn) userMenuBtn.setAttribute('aria-expanded', 'false');
        }
    });

    /* --- logout --- */
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (err) { console.error('Server sign-out failed:', err); }
            clearSession();
            renderAuthState();
        });
    }

    /* --- init state on load --- */
    renderAuthState();
    if (window.location.hash === '#login' && !getSession()) {
        openModal();
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
}

// For testimonials (star ratings + reviews)//
function initReviews() {
    const SEED_REVIEWS = [
        {
            name: 'Ananya Rao',
            rating: 5,
            message: 'The collection is huge and the staff always help me track down obscure titles. My go-to library for years now.',
            date: '2026-06-14'
        },
        {
            name: 'Marcus Chen',
            rating: 4,
            message: 'Great range of books and a comfy reading area. Would love slightly longer weekend hours, but no real complaints.',
            date: '2026-05-02'
        },
        {
            name: 'Priya Nair',
            rating: 5,
            message: 'Fast returns process and the reservation system actually works. Renewed my membership without a second thought.',
            date: '2026-03-21'
        }
    ];

    const grid = document.getElementById('testimonialGrid');
    const avgValue = document.getElementById('avgRatingValue');
    const avgStars = document.getElementById('avgRatingStars');
    const countEl = document.getElementById('reviewCount');

    const writeBtn = document.getElementById('writeReviewBtn');
    const overlay = document.getElementById('reviewOverlay');
    const closeBtn = document.getElementById('reviewClose');
    const form = document.getElementById('reviewForm');
    const nameField = document.getElementById('reviewNameField');
    const nameInput = document.getElementById('reviewNameInput');
    const messageInput = document.getElementById('reviewMessageInput');
    const ratingInput = document.getElementById('reviewRatingInput');
    const ratingValue = document.getElementById('reviewRatingValue');
    const errorEl = document.getElementById('reviewError');
    const stars = ratingInput ? Array.from(ratingInput.querySelectorAll('.review-star')) : [];

    if (!grid || !overlay || !form) return;

    /* --- storage helpers --- */
    const getReviews = () => {
        try {
            return JSON.parse(localStorage.getItem(LIB_REVIEWS_KEY)) || [];
        } catch (err) {
            return [];
        }
    };
    const saveReviews = (reviews) => localStorage.setItem(LIB_REVIEWS_KEY, JSON.stringify(reviews));

    const formatDate = (isoDate) => {
        const d = new Date(isoDate);
        if (isNaN(d)) return '';
        return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    };

    const starsMarkup = (rating) => {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            html += i <= rating
                ? '<i class="fa-solid fa-star"></i>'
                : '<i class="fa-solid fa-star is-empty"></i>';
        }
        return html;
    };

    /* --- render grid + summary --- */
    const renderReviews = () => {
        const all = SEED_REVIEWS.concat(getReviews())
            .slice()
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (!all.length) {
            grid.innerHTML = '<p class="testimonial-empty">No reviews yet — be the first to share one.</p>';
        } else {
            grid.innerHTML = all.map((r) => (
                '<article class="testimonial-card">' +
                    '<div class="testimonial-card__head">' +
                        '<span class="testimonial-card__avatar">' + libGetInitials(r.name) + '</span>' +
                        '<div>' +
                            '<strong>' + escapeHtml(r.name) + '</strong>' +
                            '<small>' + formatDate(r.date) + '</small>' +
                        '</div>' +
                    '</div>' +
                    '<div class="testimonial-card__stars">' + starsMarkup(r.rating) + '</div>' +
                    '<p>' + escapeHtml(r.message) + '</p>' +
                '</article>'
            )).join('');
        }

        const count = all.length;
        const avg = count ? all.reduce((sum, r) => sum + r.rating, 0) / count : 5;
        if (avgValue) avgValue.textContent = avg.toFixed(1);
        if (avgStars) avgStars.innerHTML = starsMarkup(Math.round(avg));
        if (countEl) countEl.textContent = count + (count === 1 ? ' review' : ' reviews');
    };

    const escapeHtml = (str) => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    /* --- star picker --- */
    let selectedRating = 0;

    const paintStars = (value) => {
        stars.forEach((btn) => {
            btn.classList.toggle('is-selected', Number(btn.dataset.value) <= value);
        });
    };

    stars.forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
            stars.forEach((s) => s.classList.toggle('is-hover', Number(s.dataset.value) <= Number(btn.dataset.value)));
        });
        btn.addEventListener('mouseleave', () => {
            stars.forEach((s) => s.classList.remove('is-hover'));
        });
        btn.addEventListener('click', () => {
            selectedRating = Number(btn.dataset.value);
            ratingValue.value = selectedRating;
            paintStars(selectedRating);
        });
    });

    /* --- modal open/close --- */
    const openModal = () => {
        const session = libGetSession();
        if (session && nameInput) {
            nameInput.value = session.name;
            nameInput.readOnly = true;
        } else if (nameInput) {
            nameInput.readOnly = false;
        }
        overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        const focusTarget = session ? messageInput : nameInput;
        if (focusTarget) focusTarget.focus();
    };

    const closeModal = () => {
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        form.reset();
        selectedRating = 0;
        ratingValue.value = 0;
        paintStars(0);
        if (errorEl) errorEl.textContent = '';
    };

    if (writeBtn) writeBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeModal(); });

    /* --- submit --- */
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (errorEl) errorEl.textContent = '';

        const session = libGetSession();
        const name = session ? session.name : (nameInput.value || '').trim();
        const message = (messageInput.value || '').trim();

        if (!name) {
            errorEl.textContent = 'Please tell us your name.';
            return;
        }
        if (!selectedRating) {
            errorEl.textContent = 'Please select a star rating.';
            return;
        }
        if (!message) {
            errorEl.textContent = 'Please write a short review.';
            return;
        }

        const reviews = getReviews();
        reviews.push({
            name,
            rating: selectedRating,
            message,
            date: new Date().toISOString().slice(0, 10)
        });
        saveReviews(reviews);

        closeModal();
        renderReviews();
    });

    /* --- init --- */
    renderReviews();
}
