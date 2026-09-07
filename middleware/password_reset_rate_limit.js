import crypto from 'node:crypto';
import { FORGOT_MESSAGE, normalizeResetEmail } from '../utils/password_reset_validation.js';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export function createResetRateLimit(pool, kind) {
    return async (req, res, next) => {
        const email = normalizeResetEmail(req.body?.email);
        const buckets = [{ key: `${kind}:ip:${req.ip}`, seconds: 3600, limit: kind === 'forgot' ? 20 : 60 }];
        if (kind === 'forgot' && email) buckets.push(
            { key: `email:minute:${email}`, seconds: 60, limit: 1 },
            { key: `email:hour:${email}`, seconds: 3600, limit: 5 }
        );
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            let retryAfter = 0;
            // Consistent lock order prevents concurrent requests from deadlocking.
            for (const bucket of buckets.map(b => ({ ...b, hash: digest(b.key) })).sort((a,b) => a.hash.localeCompare(b.hash))) {
                const { rows: [row] } = await client.query(`
                    INSERT INTO password_reset_rate_limit (bucket_hash, attempts, expires_at)
                    VALUES ($1, 1, clock_timestamp() + $2 * INTERVAL '1 second')
                    ON CONFLICT (bucket_hash) DO UPDATE SET
                        attempts = CASE WHEN password_reset_rate_limit.expires_at <= clock_timestamp() THEN 1 ELSE password_reset_rate_limit.attempts + 1 END,
                        expires_at = CASE WHEN password_reset_rate_limit.expires_at <= clock_timestamp() THEN clock_timestamp() + $2 * INTERVAL '1 second' ELSE password_reset_rate_limit.expires_at END
                    RETURNING attempts, GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - clock_timestamp()))) AS retry_after
                `, [bucket.hash, bucket.seconds]);
                if (row.attempts > bucket.limit) retryAfter = Math.max(retryAfter, Number(row.retry_after));
            }
            await client.query("DELETE FROM password_reset_rate_limit WHERE expires_at < NOW() - INTERVAL '1 hour'");
            await client.query('COMMIT');
            if (retryAfter) return res.set('Retry-After', String(retryAfter)).status(429).json({
                success: false, message: kind === 'forgot' ? FORGOT_MESSAGE : 'Too many attempts. Please try again later.'
            });
            next();
        } catch {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Password-reset rate limiter unavailable');
            res.status(503).json({ success: false, message: kind === 'forgot' ? FORGOT_MESSAGE : 'Password reset is temporarily unavailable. Please try again later.' });
        } finally { client?.release(); }
    };
}
