import bcrypt from 'bcrypt';
import pool from '../../db/connection.js';

const relatedRecordsMessage = 'This librarian cannot be removed because the account is connected to existing library records.';

export const removeLibrarian = async (req, res) => {
    const id = String(req.params.id);
    if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) {
        return res.status(404).json({ message: 'Librarian not found.' });
    }
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // Lock the account while checking references so a concurrent library
        // assignment cannot slip between the check and the delete.
        const librarian = await client.query('SELECT librarian_id FROM librarian WHERE librarian_id = $1 FOR UPDATE', [id]);
        if (!librarian.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Librarian not found.' });
        }
        // Loans/returns reference issue.library_id -> library.librarian_id.
        // Even a library assignment without loans must be preserved.
        const related = await client.query('SELECT 1 FROM library WHERE librarian_id = $1 LIMIT 1', [id]);
        if (related.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: relatedRecordsMessage });
        }
        await client.query('DELETE FROM librarian WHERE librarian_id = $1', [id]);
        await client.query('COMMIT');
        return res.json({ message: 'Librarian removed successfully.', librarian_id: Number(id) });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        // Keep database constraints as the final safeguard for any references.
        if (error.code === '23503') return res.status(409).json({ message: relatedRecordsMessage });
        console.error('Failed to remove librarian:', error);
        return res.status(500).json({ message: 'Unable to remove librarian. Please try again.' });
    } finally {
        client?.release();
    }
};

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
