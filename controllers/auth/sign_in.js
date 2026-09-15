import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../db/connection.js';

export const signin = async (req, res) => {
    try {
        const staffSession = req.cookies?.adminSession;
        if (staffSession) {
            try {
                const staff = jwt.verify(staffSession, process.env.JWT_SECRET);
                if (staff.role === 'admin' || staff.role === 'librarian') {
                    return res.status(409).json({ message: 'Please sign out of the admin or librarian account before signing in as a member.' });
                }
            } catch {
                res.clearCookie('adminSession');
            }
        }

        if (typeof req.body?.email !== 'string' || typeof req.body?.password !== 'string' || !req.body.password || Buffer.byteLength(req.body.password, 'utf8') > 72) {
            return res.status(400).json({ message: 'A valid email and password are required.' });
        }
        const email = String(req.body.email || '').trim().toLowerCase();
        const { password, role = 'member' } = req.body;

        if (role !== 'member' && role !== 'user') {
            return res.status(400).json({ message: 'Please use the selected role to sign in.' });
        }

        const member = await pool.query(
            'SELECT * FROM member WHERE LOWER(email) = $1',
            [email]
        ).then(r => r.rows[0]);

        if (!member) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (String(member.status || '').toLowerCase() !== 'approved') {
            return res.status(403).json({ message: 'This account is not active.' });
        }

        const isMatch = await bcrypt.compare(password, member.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: member.member_id, email: member.email, role: 'member' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.cookie('userSession', token, {
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
