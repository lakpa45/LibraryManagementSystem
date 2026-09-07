import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../../db/connection.js';
import { sendResetEmail } from '../../utils/mailer.js';
import { resetConfig } from '../../config/password_reset.js';
import { FORGOT_MESSAGE, normalizeResetEmail, validResetPassword, validResetToken, PASSWORD_MESSAGE } from '../../utils/password_reset_validation.js';

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const invalidLink = res => res.status(400).json({ code: 'INVALID_RESET_LINK', message: 'This reset link is invalid, expired, or already used. Please request a new link.' });

export function createPasswordResetHandlers({ db = pool, sendEmail = sendResetEmail, config = resetConfig, logger = console } = {}) {
    async function forgotPassword(req, res) {
        const email = normalizeResetEmail(req.body?.email);
        if (!email) return res.status(400).json({ message: 'Enter a valid email address.' });
        logger.info?.('Password reset requested');
        let client;
        let delivery;
        try {
            if (!config.baseUrl || !config.apiKey || !config.emailFrom) throw new Error('configuration');
            client = await db.connect();
            await client.query('BEGIN');
            const member = await client.query('SELECT member_id FROM member WHERE LOWER(email) = $1 FOR UPDATE', [email]);
            if (member.rowCount === 1) {
                const token = crypto.randomBytes(32).toString('hex');
                await client.query('UPDATE password_reset SET used = TRUE WHERE LOWER(email) = $1 AND used = FALSE', [email]);
                await client.query(`INSERT INTO password_reset (email, token_hash, expires_at) VALUES ($1, $2, clock_timestamp() + INTERVAL '30 minutes')`, [email, hashToken(token)]);
                delivery = { email, link: `${config.baseUrl}/reset_password.html?token=${encodeURIComponent(token)}` };
            }
            await client.query('COMMIT');
        } catch {
            if (client) await client.query('ROLLBACK').catch(() => {});
            logger.error('Password-reset request could not be prepared; check configuration and database migration');
        } finally { client?.release(); }
        if (delivery) {
            try { await sendEmail(delivery.email, delivery.link); }
            catch { logger.error('Password-reset email delivery failed; check Resend API key and sender verification'); }
        }
        // Never expose account existence or provider failures through response content/status.
        res.status(200).json({ success: true, message: FORGOT_MESSAGE });
    }

    async function resetPassword(req, res) {
        const { token, newPassword } = req.body || {};
        if (!validResetToken(token)) return invalidLink(res);
        if (!validResetPassword(newPassword)) return res.status(400).json({ code: 'WEAK_PASSWORD', message: PASSWORD_MESSAGE });
        let client;
        try {
            const hashed = await bcrypt.hash(newPassword, 10);
            client = await db.connect();
            await client.query('BEGIN');
            const candidate = await client.query('SELECT email FROM password_reset WHERE token_hash = $1', [hashToken(token)]);
            if (candidate.rowCount !== 1) { await client.query('ROLLBACK'); logger.info?.('Reset token invalid'); return invalidLink(res); }
            // Lock member first, just like forgotPassword, to serialize reset/resend races.
            const member = await client.query('SELECT member_id FROM member WHERE LOWER(email) = $1 FOR UPDATE', [candidate.rows[0].email.toLowerCase()]);
            const result = await client.query(`SELECT reset_id FROM password_reset WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW() AND expires_at > clock_timestamp() FOR UPDATE`, [hashToken(token)]);
            if (member.rowCount !== 1 || result.rowCount !== 1) { await client.query('ROLLBACK'); logger.info?.('Reset token expired, already used, or account unavailable'); return invalidLink(res); }
            const updated = await client.query('UPDATE member SET password = $1 WHERE member_id = $2', [hashed, member.rows[0].member_id]);
            const consumed = await client.query('UPDATE password_reset SET used = TRUE WHERE reset_id = $1 AND used = FALSE', [result.rows[0].reset_id]);
            if (updated.rowCount !== 1 || consumed.rowCount !== 1) throw new Error('update failed');
            await client.query('UPDATE password_reset SET used = TRUE WHERE LOWER(email) = $1 AND used = FALSE', [candidate.rows[0].email.toLowerCase()]);
            await client.query('COMMIT');
            logger.info?.('Password successfully changed');
            res.status(200).json({ success: true, message: 'Your password has been reset successfully.' });
        } catch {
            if (client) await client.query('ROLLBACK').catch(() => {});
            logger.error('Password-reset transaction failed');
            res.status(500).json({ message: 'Unable to reset your password right now. Please try again later.' });
        } finally { client?.release(); }
    }
    return { forgotPassword, resetPassword };
}
export const { forgotPassword, resetPassword } = createPasswordResetHandlers();
