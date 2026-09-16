import { validDate } from '../../utils/date_validation.js';
import pool from '../../db/connection.js';

const FINE_PER_DAY = 5;

// GET active loans
export const getActiveLoans = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT i.issue_id, i.issue_date, i.due_date, i.return_date,
                   m.member_id, m.first_name, m.last_name,
                   bc.copy_id, b.book_id, b.title
            FROM issue i
            JOIN member m ON m.member_id = i.member_id
            JOIN book_copy bc ON bc.copy_id = i.copy_id
            JOIN book b ON b.book_id = bc.book_id
            WHERE i.return_date IS NULL
            ORDER BY i.due_date ASC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// SEARCH members
export const searchMembers = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim().replace(/\s+/g, ' ');
        if (!q) return res.status(400).json({ valid: false, message: 'Enter a member name, Card ID, or Roll ID.' });
        const partial = `%${q}%`;

        const result = await pool.query(
            `SELECT m.member_id, m.first_name, m.last_name,
                    m.card_no AS unique_id, m.roll_id, m.member_type,
                    m.department, m.status, m.valid_till,
                    COUNT(i.issue_id)::int AS active_borrowings
             FROM member m
             LEFT JOIN issue i ON i.member_id = m.member_id AND i.return_date IS NULL
             WHERE LOWER(COALESCE(m.card_no, '')) = LOWER($1)
                OR LOWER(COALESCE(m.roll_id, '')) = LOWER($1)
                OR LOWER(m.email) = LOWER($1)
                OR m.first_name ILIKE $2
                OR m.last_name ILIKE $2
                OR CONCAT_WS(' ', m.first_name, m.last_name) ILIKE $2
             GROUP BY m.member_id
             ORDER BY
                CASE
                    WHEN LOWER(COALESCE(m.card_no, '')) = LOWER($1) THEN 0
                    WHEN LOWER(COALESCE(m.roll_id, '')) = LOWER($1) THEN 1
                    WHEN LOWER(m.email) = LOWER($1) THEN 2
                    WHEN LOWER(CONCAT_WS(' ', m.first_name, m.last_name)) = LOWER($1) THEN 3
                    ELSE 4
                END,
                m.first_name, m.last_name, m.member_id
             LIMIT 20`,
            [q, partial]
        );
        if (!result.rows.length) {
            return res.status(404).json({ valid: false, message: 'No member found with that name or Card ID.' });
        }

        const members = result.rows.map(member => ({
            member_id: member.member_id,
            unique_id: member.unique_id,
            roll_id: member.roll_id,
            display_name: `${member.first_name} ${member.last_name}`.trim(),
            member_type: member.member_type,
            department: member.department,
            status: member.status,
            valid_till: member.valid_till,
            active_borrowings: member.active_borrowings
        }));
        res.status(200).json({
            valid: true,
            count: members.length,
            members,
            member: members.length === 1 ? members[0] : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// SEARCH available books (with an available copy)
export const searchAvailableBooks = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const pattern = `%${q}%`;
        const result = await pool.query(
            `SELECT b.book_id, b.title, b.isbn,
                    NULL::text AS author,
                    COUNT(bc.copy_id) FILTER (WHERE LOWER(bc.status) = 'available')::int AS available_quantity
             FROM book b
             JOIN book_copy bc ON bc.book_id = b.book_id
             WHERE LOWER(b.book_type) = 'physical'
               AND ($1 = '' OR b.title ILIKE $2 OR COALESCE(b.isbn, '') ILIKE $2 OR b.book_id::text ILIKE $2)
             GROUP BY b.book_id, b.title, b.isbn
             HAVING COUNT(bc.copy_id) FILTER (WHERE LOWER(bc.status) = 'available') > 0
             ORDER BY b.title
             LIMIT 50`,
            [q, pattern]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET one member's active loans
export const getMemberActiveLoans = async (req, res) => {
    try {
        const memberId = Number(req.params.memberId);
        if (!Number.isInteger(memberId) || memberId < 1) {
            return res.status(400).json({ message: 'A valid member ID is required.' });
        }
        const member = await pool.query('SELECT member_id FROM member WHERE member_id = $1', [memberId]);
        if (!member.rows.length) return res.status(404).json({ message: 'Member not found.' });

        const result = await pool.query(
            `SELECT i.issue_id, i.issue_date, i.due_date, b.book_id, b.title, b.isbn,
                    NULL::text AS author
             FROM issue i
             JOIN book_copy bc ON bc.copy_id = i.copy_id
             JOIN book b ON b.book_id = bc.book_id
             WHERE i.member_id = $1 AND i.return_date IS NULL
             ORDER BY i.due_date, b.title`,
            [memberId]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ISSUE a book (admin-initiated)
export const issueBook = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const memberId = Number(req.body.member_id);
        const bookId = Number(req.body.book_id);
        const issueDate = String(req.body.issue_date || '').trim();
        const dueDate = String(req.body.due_date || '').trim();

        if (!Number.isInteger(memberId) || memberId < 1 || !Number.isInteger(bookId) || bookId < 1 ||
            !validDate(issueDate) || !validDate(dueDate) || dueDate < issueDate) {
            return res.status(400).json({ message: 'Valid member, book, issue date, and due date are required.' });
        }

        await client.query('BEGIN');

        const memberResult = await client.query(
            `SELECT member_id, status, valid_till FROM member WHERE member_id = $1 FOR SHARE`, [memberId]
        );
        if (!memberResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Member not found.' });
        }
        if (String(memberResult.rows[0].status).toLowerCase() !== 'approved') {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Only approved members may borrow books.' });
        }
        if (memberResult.rows[0].valid_till && String(memberResult.rows[0].valid_till).slice(0, 10) < issueDate) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'This member account has expired and cannot borrow books.' });
        }

        // Serialize this member/book pair so concurrent requests cannot both pass
        // the no-active-borrowing check before either inserts its issue row.
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [memberId, bookId]);

        const bookResult = await client.query(
            'SELECT book_id, book_type FROM book WHERE book_id = $1 FOR SHARE',
            [bookId]
        );
        if (!bookResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Book not found.' });
        }
        if (String(bookResult.rows[0].book_type).toLowerCase() !== 'physical') {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Only physical books can be borrowed.' });
        }

        const duplicate = await client.query(
            `SELECT i.issue_id FROM issue i
             JOIN book_copy bc ON bc.copy_id = i.copy_id
             WHERE i.member_id = $1 AND bc.book_id = $2 AND i.return_date IS NULL
             LIMIT 1 FOR UPDATE OF i`,
            [memberId, bookId]
        );
        if (duplicate.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'This member already has an active borrowing for this book.' });
        }

        const copyResult = await client.query(
            `SELECT bc.copy_id FROM book_copy bc
             JOIN book b ON b.book_id = bc.book_id
             WHERE bc.book_id = $1 AND LOWER(b.book_type) = 'physical' AND LOWER(bc.status) = 'available'
             ORDER BY bc.copy_id LIMIT 1 FOR UPDATE OF bc SKIP LOCKED`,
            [bookId]
        );

        if (copyResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'No physical copies are currently available for this book.' });
        }

        const copyId = copyResult.rows[0].copy_id;

        await client.query(
            `UPDATE book_copy SET status = 'Issued' WHERE copy_id = $1`,
            [copyId]
        );

        const issueResult = await client.query(
            `INSERT INTO issue (issue_date, due_date, member_id, copy_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [issueDate, dueDate, memberId, copyId]
        );

        await client.query('COMMIT');
        res.status(201).json(req.selfServiceBorrow ? issueResult.rows[0] : {
            message: 'Book borrowed successfully.',
            borrowing: issueResult.rows[0]
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Loan operation failed');
        res.status(500).json({ message: 'Server error' });
    } finally {
        client?.release();
    }
};

// RETURN a book
export const returnBook = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const id = Number(req.params.id);
        const requestedReturnDate = req.body.return_date ? String(req.body.return_date).trim() : '';
        if (!Number.isInteger(id) || id < 1 || (requestedReturnDate && !validDate(requestedReturnDate))) {
            return res.status(400).json({ message: 'A valid borrowing ID and return date are required.' });
        }

        await client.query('BEGIN');

        const issueResult = await client.query(
            `SELECT * FROM issue WHERE issue_id = $1 AND return_date IS NULL FOR UPDATE`,
            [id]
        );

        if (issueResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Active loan not found' });
        }

        const loan = issueResult.rows[0];
        const actualReturnDate = requestedReturnDate || new Date().toISOString().slice(0, 10);
        const loanIssueDate = loan.issue_date instanceof Date
            ? loan.issue_date.toISOString().slice(0, 10)
            : String(loan.issue_date).slice(0, 10);
        if (actualReturnDate < loanIssueDate) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Return date cannot be before the borrow date.' });
        }

        const overdueDays = Math.max(0,
            Math.round((new Date(actualReturnDate) - new Date(loan.due_date)) / 86400000)
        );
        const fine = overdueDays * FINE_PER_DAY;

        await client.query(
            `UPDATE issue SET return_date = $1 WHERE issue_id = $2`,
            [actualReturnDate, id]
        );

        await client.query(
            `UPDATE book_copy SET status = 'Available' WHERE copy_id = $1`,
            [loan.copy_id]
        );

        await client.query('COMMIT');
        res.status(200).json({ message: 'Book returned', fine });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Loan operation failed');
        res.status(500).json({ message: 'Server error' });
    } finally {
        client?.release();
    }
};

// GET the logged-in member's currently borrowed books
export const getMyLoans = async (req, res) => {
    try {
        const memberId = await resolveMemberId(req.user);
        if (!memberId) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const result = await pool.query(
            `SELECT b.book_id, b.title, b.cover_image, i.issue_id, i.issue_date, i.due_date
             FROM issue i
             JOIN book_copy bc ON i.copy_id = bc.copy_id
             JOIN book b ON bc.book_id = b.book_id
             WHERE i.member_id = $1 AND i.return_date IS NULL
             ORDER BY i.due_date ASC`,
            [memberId]
        );

        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET the logged-in member's recent borrow/return history
export const getMyActivity = async (req, res) => {
    try {
        const memberId = await resolveMemberId(req.user);
        if (!memberId) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const result = await pool.query(
            `SELECT b.title, i.issue_date, i.due_date, i.return_date
             FROM issue i
             JOIN book_copy bc ON i.copy_id = bc.copy_id
             JOIN book b ON bc.book_id = b.book_id
             WHERE i.member_id = $1
             ORDER BY COALESCE(i.return_date, i.issue_date) DESC
             LIMIT 10`,
            [memberId]
        );

        const activity = result.rows.map((row) => ({
            title: row.title,
            action: row.return_date ? 'Returned' : 'Borrowed',
            date: row.return_date || row.issue_date
        }));

        res.status(200).json(activity);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// RENEW a loan (member-initiated — extends due date by 14 days)
export const renewMyLoan = async (req, res) => {
    try {
        const memberId = await resolveMemberId(req.user);
        if (!memberId) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const { id } = req.params;

        const result = await pool.query(
            `UPDATE issue SET due_date = due_date + INTERVAL '14 days'
             WHERE issue_id = $1 AND member_id = $2 AND return_date IS NULL RETURNING due_date`,
            [id, memberId]
        );
        if (!result.rowCount) return res.status(404).json({ message: 'Active loan not found' });

        res.status(200).json({ message: 'Loan renewed', due_date: result.rows[0].due_date });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// BORROW a book (self-service — the logged-in member borrows for themselves)
export const borrowBook = async (req, res) => {
    try {
        const memberId = await resolveMemberId(req.user);
        if (!memberId) return res.status(404).json({ message: 'Member not found' });
        const today = new Date();
        const due = new Date(today);
        due.setUTCDate(due.getUTCDate() + 14);
        // Reuse the same approved-member, physical-book and concurrency checks as staff issuance.
        return await issueBook({ ...req, selfServiceBorrow: true, body: {
            member_id: memberId, book_id: req.body?.book_id,
            issue_date: today.toISOString().slice(0, 10), due_date: due.toISOString().slice(0, 10)
        } }, res);
    } catch {
        res.status(500).json({ message: 'Unable to borrow this book right now.' });
    }
};

// Works whether the JWT payload has member_id directly, or only email
async function resolveMemberId(user) {
    if (!user) return null;
    if (user.member_id) return user.member_id;
    if (user.id) return user.id;
    if (user.email) {
        const result = await pool.query('SELECT member_id FROM member WHERE email = $1', [user.email]);
        return result.rows.length ? result.rows[0].member_id : null;
    }
    return null;
}
