import pool from '../../db/connection.js';

// GET all members
export const getMembers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT member_id, first_name, last_name, email, phone,
                   member_type, department, card_no, roll_id, dob,
                   address, valid_till, registered_on, status
            FROM member
            ORDER BY registered_on DESC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// DELETE a member
export const deleteMember = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const member = await client.query('SELECT email FROM member WHERE member_id = $1 FOR UPDATE', [req.params.id]);
        if (!member.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Member not found' }); }
        await client.query('UPDATE password_reset SET used = TRUE WHERE LOWER(email) = LOWER($1) AND used = FALSE', [member.rows[0].email]);
        await client.query('DELETE FROM member WHERE member_id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(200).json({ message: 'Member removed' });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (err.code === '23503') return res.status(409).json({ message: 'This member has borrowing records and cannot be removed.' });
        console.error('Member deletion failed');
        res.status(500).json({ message: 'Unable to remove member.' });
    } finally { client?.release(); }
};

async function generateCardNo(client, memberType) {
    const prefixMap = { Student: 'STU', Faculty: 'FAC', Staff: 'STF' };
    const prefix = prefixMap[memberType] || 'STU';
    const year = new Date().getFullYear();

    const scope = `${prefix}-${year}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope]);
    const countResult = await client.query(
        `SELECT COALESCE(MAX(SUBSTRING(card_no FROM '[0-9]+$')::int), 0)::int AS last_number FROM member WHERE card_no LIKE $1`,
        [`${scope}-%`]
    );
    const nextNumber = countResult.rows[0].last_number + 1;
    const padded = String(nextNumber).padStart(4, '0');

    return `${prefix}-${year}-${padded}`;
}

// GET pending members
export const getPendingMembers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT member_id, first_name, last_name, email, phone, member_type, department, registered_on
             FROM member WHERE status = 'Pending' ORDER BY registered_on DESC`
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// APPROVE a member
export const approveMember = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const { id } = req.params;
        const memberResult = await client.query('SELECT member_type, card_no FROM member WHERE member_id = $1 FOR UPDATE', [id]);
        if (!memberResult.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Member not found' });
        }
        const member = memberResult.rows[0];
        const cardNo = member.card_no || await generateCardNo(client, member.member_type);
        const result = await client.query(
            `UPDATE member SET status = 'Approved', card_no = $1 WHERE member_id = $2 RETURNING member_id, first_name, card_no`, [cardNo, id]
        );
        await client.query('COMMIT');
        res.status(200).json({ message: 'Member approved', member: result.rows[0] });
    } catch {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Member approval failed');
        res.status(500).json({ message: 'Unable to approve member.' });
    } finally { client?.release(); }
};

// REJECT a member
export const rejectMember = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE member SET status = 'Rejected' WHERE member_id = $1 RETURNING member_id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Member not found' });
        }

        res.status(200).json({ message: 'Member rejected' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET the logged-in member's own profile
export const getMyProfile = async (req, res) => {
    try {
        const user = req.user;
        let member;

        if (user.member_id || user.id) {
            const result = await pool.query(
                `SELECT member_id, first_name, last_name, email, phone, card_no,
                        member_type, department, status, registered_on, valid_till
                 FROM member WHERE member_id = $1`,
                [user.member_id || user.id]
            );
            member = result.rows[0];
        } else if (user.email) {
            const result = await pool.query(
                `SELECT member_id, first_name, last_name, email, phone, card_no,
                        member_type, department, status, registered_on, valid_till
                 FROM member WHERE LOWER(email) = LOWER($1)`,
                [user.email]
            );
            member = result.rows[0];
        }

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        res.status(200).json(member);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// UPDATE the logged-in member's own profile
export const updateMyProfile = async (req, res) => {
    const memberId = req.user.member_id || req.user.id;
    if (!memberId) return res.status(400).json({ message: 'Unable to identify member' });
    const first_name = typeof req.body?.first_name === 'string' ? req.body.first_name.trim() : '';
    const last_name = typeof req.body?.last_name === 'string' ? req.body.last_name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!first_name || !last_name || first_name.length > 100 || last_name.length > 100 || email.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (phone && !/^\d{10}$/.test(phone))) {
        return res.status(400).json({ message: 'Provide valid names, email, and a 10-digit phone number if supplied.' });
    }
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const previous = await client.query('SELECT email FROM member WHERE member_id = $1 FOR UPDATE', [memberId]);
        if (!previous.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Member not found' }); }
        if (previous.rows[0].email.toLowerCase() !== email) {
            // Email-based reset links must not survive an address change and target its next owner.
            await client.query('UPDATE password_reset SET used = TRUE WHERE LOWER(email) = LOWER($1) AND used = FALSE', [previous.rows[0].email]);
        }
        const result = await client.query(
            `UPDATE member SET first_name = $1, last_name = $2, email = $3, phone = $4
             WHERE member_id = $5 RETURNING member_id, first_name, last_name, email, phone, card_no`,
            [first_name, last_name, email, phone || null, memberId]
        );
        await client.query('COMMIT');
        res.status(200).json(result.rows[0]);
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (err.code === '23505') return res.status(409).json({ message: 'This email address is already registered.' });
        console.error('Member profile update failed');
        res.status(500).json({ message: 'Unable to update profile.' });
    } finally { client?.release(); }
};
