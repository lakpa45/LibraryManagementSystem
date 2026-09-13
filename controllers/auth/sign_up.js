import { memberDefaultPassword } from '../../utils/member_default_password.js';
import { randomBytes } from 'node:crypto';
import { validDate } from '../../utils/date_validation.js';
import bcrypt from 'bcrypt';
import pool from '../../db/connection.js';

function generateTempPassword() { return randomBytes(18).toString('base64url'); }

async function generateCardNo(client, memberType) {
    const prefixMap = { Student: 'STU', Faculty: 'FAC', Staff: 'STF' };
    const prefix = prefixMap[memberType] || 'STU';
    const year = new Date().getFullYear();

    const scope = `${prefix}-${year}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope]);
    const numberResult = await client.query(
        `SELECT COALESCE(MAX(SUBSTRING(card_no FROM '[0-9]+$')::int), 0)::int AS last_number
         FROM member WHERE card_no LIKE $1`,
        [`${scope}-%`]
    );
    const nextNumber = numberResult.rows[0].last_number + 1;
    const padded = String(nextNumber).padStart(4, '0');

    return `${prefix}-${year}-${padded}`;
}

export const signup = async (req, res) => {
    let client;
    try {
        const librarianCreated = req.user?.role === 'librarian';
        let generatedPassword;
        // Public sign-up creates member accounts only. Never derive this from req.body.
        const accountRole = 'member';
        const memberStatus = 'Pending';
        let {
            first_name, last_name, email, phone, password,
            member_type, department, roll_id, dob, address, valid_till
        } = req.body || {};

        first_name = typeof first_name === 'string' ? first_name.trim() : '';
        last_name = typeof last_name === 'string' ? last_name.trim() : '';
        email = typeof email === 'string' ? email.trim().toLowerCase() : '';
        phone = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
        department = typeof department === 'string' ? department.trim() : '';
        member_type = member_type || 'Student';

        if (first_name.length < 1 || last_name.length < 1 || first_name.length > 100 || last_name.length > 100) {
            return res.status(400).json({ message: 'First and last name are required.' });
        }
        if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: 'A valid email address is required.' });
        }
        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({ message: 'Phone number must contain exactly 10 digits.' });
        }
        if (!['Student', 'Faculty', 'Staff'].includes(member_type)) {
            return res.status(400).json({ message: 'Please select a valid member role.' });
        }
        if (!librarianCreated && password && (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) {
            return res.status(400).json({ message: 'Password must be at least 8 characters and at most 72 bytes.' });
        }

        if ((dob && !validDate(dob)) || (valid_till && !validDate(valid_till)) || department.length > 100 || (roll_id && (typeof roll_id !== 'string' || roll_id.length > 50)) || (address && typeof address !== 'string')) {
            return res.status(400).json({ message: 'Please check the dates and member details.' });
        }

        if (librarianCreated) {
            try { generatedPassword = memberDefaultPassword(first_name, dob); }
            catch { return res.status(400).json({ message: 'First name must contain letters A-Z and date of birth must be a valid date with a four-digit year.' }); }
        }
        client = await pool.connect();
        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT member_id FROM member WHERE LOWER(email) = $1',
            [email]
        );

        if (existingResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Email already registered' });
        }

        const finalPassword = librarianCreated ? generatedPassword : password || generateTempPassword();
        const hashedPassword = await bcrypt.hash(finalPassword, 10);
        const cardNo = await generateCardNo(client, member_type);

        const insertResult = await client.query(
            `INSERT INTO member (first_name, last_name, email, password, phone, member_type, department, roll_id, dob, address, valid_till, card_no, status, role)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING member_id, first_name, last_name, email, phone, member_type, department, card_no, status, role`,
            [first_name, last_name, email, hashedPassword, phone, member_type, department, roll_id || null, dob || null, address || null, valid_till || null, cardNo, memberStatus, accountRole]
        );

        const newMember = insertResult.rows[0];
        await client.query('COMMIT');

        if (librarianCreated) res.set('Cache-Control', 'no-store');
        res.status(201).json({
            message: 'Sign up successful',
            member: newMember,
            temp_password: librarianCreated ? finalPassword : password ? undefined : finalPassword
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (err.code === '23505' && (err.constraint === 'member_email_key' || err.constraint === 'member_email_lower_unique')) {
            return res.status(409).json({ message: 'Email already registered' });
        }
        console.error('Member registration failed');
        res.status(500).json({ message: 'Server error' });
    } finally {
        client?.release();
    }
};
