import express from 'express';
import { signup } from '../controllers/auth/sign_up.js';
import { signin } from '../controllers/auth/sign_in.js';
import { librarianSignin } from '../controllers/auth/librarian_signin.js';
import { librarianStaffSignin } from '../controllers/auth/librarian_staff_signin.js';

import { forgotPassword, resetPassword } from '../controllers/auth/password_reset_controller.js';
import { changePassword } from '../controllers/auth/change_password_controller.js';
import { verifyToken } from '../middleware/auth.js';

import pool from '../db/connection.js';
import { createResetRateLimit } from '../middleware/password_reset_rate_limit.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/signin', signin);
router.post('/librarian/signin', librarianSignin);
router.post('/librarian-staff/signin', librarianStaffSignin);
router.post('/forgot-password', createResetRateLimit(pool, 'forgot'), forgotPassword);
router.post('/reset-password', createResetRateLimit(pool, 'reset'), resetPassword);
router.post('/change-password', verifyToken, changePassword);
router.post('/logout', (req, res) => {
    const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' };
    res.clearCookie('userSession', options);
    res.clearCookie('adminSession', options);
    res.status(200).json({ message: 'Signed out' });
});
export default router;
