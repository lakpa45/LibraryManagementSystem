import 'dotenv/config';
import { passwordChangeUnavailable } from './middleware/member_password_change_pause.js';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { removeUploadedFiles } from './middleware/upload.js';
import { fileURLToPath } from 'url';
import authRoutes from './routes/authRoutes.js';
import bookRoutes from './routes/bookRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import loanRoutes from './routes/loanRoutes.js';
import memberRoutes from './routes/memberRoutes.js';
import librarianRoutes from './routes/librarianRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import { requireMemberPage } from './middleware/member_page_guard.js';
import { requireAdminPage } from './middleware/admin_page_guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.JWT_SECRET?.trim()) throw new Error('JWT_SECRET is required');

const PORT = process.env.PORT || 3000;

const app = express();
if (process.env.NODE_ENV?.trim() === 'production' || process.env.RAILWAY_ENVIRONMENT_ID) app.set('trust proxy', 1);
// Password reset is temporarily disabled. Block static HTML aliases as well
// as clean URLs without modifying the preserved reset templates/controllers.
app.use(['/forgot-password', '/forgot_password.html', '/forget_password.html', '/reset-password', '/reset_password.html'], (req, res) => {
    res.set('Cache-Control', 'no-store').status(404).send('Not found');
});

app.use(express.json());
app.use(cookieParser());
// Keep legacy stylesheet URLs on the same generated Tailwind build.
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public', 'images', 'placeholder-book.svg')));
app.get('/css/output.css', (req, res) => res.sendFile(path.join(__dirname, 'public', 'output.css')));
app.get(['/change_password.html', '/change-password'], (req, res) => res.set('Cache-Control', 'no-store').status(403).type('text').send(passwordChangeUnavailable));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
    const directProtectedView = /^\/(?:admin|librarian)\/.*\.html$/i.test(req.path);
    if (directProtectedView) return res.status(404).send('Not found');
    next();
});
app.get('/login', (req, res) => res.redirect('/?login=1'));
app.get(['/user_dashboard.html', '/member/dashboard'], requireMemberPage, (req, res) => res.sendFile(path.join(__dirname, 'views', 'user_dashboard.html')));
// Retired localStorage demos lead to the real account/loan workflows.
app.get('/studentlibrary.html', (req, res) => res.redirect('/user_dashboard.html'));
app.get('/overdue&fine.html', (req, res) => res.redirect('/librarian/borrow-return'));
app.use(express.static(path.join(__dirname, 'views'), {
    index: false
}));

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/librarians', librarianRoutes);
app.use('/api/wishlist', wishlistRoutes);

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/e-books', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'e_books.html'));
});

app.get('/books', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'all_books.html'));
});

app.get('/categories', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'categories.html'));
});

app.get('/my-books', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'my_books.html'));
});

app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
// Temporarily disabled: app.get(['/forgot-password', '/forgot_password.html'], (req, res) => res.sendFile(path.join(__dirname, 'views', 'forget_password.html')));
// Temporarily disabled: app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'views', 'reset_password.html')));

// Map of clean admin pages
const ADMIN_PAGES = {
    'dashboard': 'admin_dashboard.html',
    'librarians': 'admin_librarians.html',
};

const LIBRARIAN_PAGES = {
    'dashboard': 'librarian_dashboard.html',
    'book-categories': 'librarian_book_category.html',
    'books': 'librarian_books.html',
    'borrow-return': 'librarian_borrow_return.html',
    'members': 'librarian_members.html',
    'pending-members': 'librarian_pending_members.html',
    'register-member': 'librarian_register_member.html',
};

// guarded admin pages — one route covers all of views/admin
app.get('/admin/:page', requireAdminPage, (req, res) => {
    const filename = ADMIN_PAGES[req.params.page];

    if (!filename) {
        return res.status(404).send('Not found');
    }

    if (req.admin.role !== 'admin') {
        return res.status(403).send('Administrator access required');
    }

    res.sendFile(path.join(__dirname, 'views', 'admin', filename));
});

app.get('/librarian/:page', requireAdminPage, (req, res) => {
    const filename = LIBRARIAN_PAGES[req.params.page];

    if (!filename) {
        return res.status(404).send('Not found');
    }

    res.sendFile(path.join(__dirname, 'views', 'librarian', filename));
});

app.use('/api', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found' });
});

app.use(async (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ message: 'Invalid JSON request body' });
    }
    if (err instanceof multer.MulterError) {
        await removeUploadedFiles(req);
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: 'File size must not exceed 35 MB.'
            });
        }
        return res.status(400).json({ success: false, message: `Upload failed: ${err.message}` });
    }
    if (err?.message === 'Only JPG, PNG, WebP images and PDF files are allowed.') {
        await removeUploadedFiles(req);
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error('Unhandled request error:', err?.message || err);
    res.status(500).json({ message: 'Server error' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
