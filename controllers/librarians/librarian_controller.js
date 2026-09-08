import bcrypt from 'bcrypt';
import pool from '../../db/connection.js';

export const getLibrarians = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT librarian_id, name, email, phone
             FROM librarian
             ORDER BY name ASC, librarian_id ASC`
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Failed to load librarians:', error);
        res.status(500).json({ message: 'Unable to load librarians.' });
    }
};

export const createLibrarian = async (req, res) => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body?.name.trim() : '';
        const email = typeof req.body?.email === 'string' ? req.body?.email.trim().toLowerCase() : '';
        const password = typeof req.body?.password === 'string' ? req.body?.password : '';
        const phone = typeof req.body?.phone === 'string' ? req.body?.phone.trim() : '';

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: 'Enter a valid email address.' });
        }
        if (name.length > 100 || email.length > 100 || phone.length > 20) return res.status(400).json({message:'Please shorten the librarian details.'});
        if (password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) {
            return res.status(400).json({ message: 'Password must contain at least 6 characters and at most 72 bytes.' });
        }

        const existing = await pool.query(
            'SELECT librarian_id FROM librarian WHERE LOWER(email) = LOWER($1)',
            [email]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ message: 'A librarian with this email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO librarian (name, email, password, phone)
             VALUES ($1, $2, $3, $4)
             RETURNING librarian_id, name, email, phone`,
            [name, email, hashedPassword, phone || null]
        );

        res.status(201).json({ message: 'Librarian added successfully.', librarian: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'A librarian with this email already exists.' });
        }
        console.error('Failed to create librarian');
        res.status(500).json({ message: 'Unable to add the librarian.' });
    }
};
