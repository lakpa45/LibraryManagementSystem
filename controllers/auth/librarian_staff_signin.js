import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../db/connection.js';
import { inactiveLibrarianMessage } from '../../middleware/librarian_status.js';

export const librarianStaffSignin = async (req, res) => {
    try {
        if (typeof req.body?.email !== 'string' || typeof req.body?.password !== 'string' || !req.body.password || Buffer.byteLength(req.body.password, 'utf8') > 72) {
            return res.status(400).json({ message: 'A valid email and password are required.' });
        }
        const email = String(req.body.email || '').trim().toLowerCase();
        const { password, role = 'librarian' } = req.body;

        if (role !== 'librarian') {
            return res.status(400).json({ message: 'Please use the selected role to sign in.' });
        }

        const librarian = await pool.query(
            'SELECT * FROM librarian WHERE LOWER(email) = $1',
            [email]
        ).then((result) => result.rows[0]);

        if (!librarian) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, librarian.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (librarian.status !== 'active') {
            return res.status(403).json({ message: inactiveLibrarianMessage });
        }

        const token = jwt.sign(
            { id: librarian.librarian_id, email: librarian.email, role: 'librarian' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // The admin pages are server-guarded, so staff need the same session cookie.
        res.cookie('adminSession', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 1000
        });

        res.status(200).json({ message: 'Sign in successful', token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};
