import { Resend } from 'resend';
import { resetConfig } from '../config/password_reset.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const knownErrors = new Set(['validation_error', 'invalid_api_key', 'missing_api_key', 'restricted_api_key', 'rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded']);

export function createResetMailer(config = resetConfig, provider, logger = console) {
    // Explicit HTTPS origin prevents an accidental SDK base-URL override from exposing the API key.
    const resend = provider || (config.apiKey ? new Resend(config.apiKey, { baseUrl: 'https://api.resend.com' }) : null);
    if (resend instanceof Resend) {
        // SDK 6.26 logs raw provider errors in development. Use only our sanitized logger below.
        resend.logError = () => {};
    }
    return async function sendResetEmail(toEmail, resetLink) {
        if (!resend || !config.apiKey || !config.emailFrom) {
            logger.error('Resend configuration missing; check RESEND_API_KEY and EMAIL_FROM');
            throw new Error('Failed to send password reset email');
        }
        const safeLink = escapeHtml(resetLink);
        let result;
        try {
            result = await resend.emails.send({
                from: config.emailFrom,
                to: toEmail,
                subject: 'Reset Your Password | Library Management System',
                text: `Library Management System\n\nReset Your Password\n\nA password reset was requested for your account.\nReset your password: ${resetLink}\n\nThis link expires in 30 minutes and can be used only once. If you did not request this reset, ignore this email. Your password will stay unchanged.`,
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1d1d1f">
                    <p style="font-weight:bold">Library Management System</p>
                    <h1>Reset Your Password</h1>
                    <p>A password reset was requested for your account. Use the button below to choose a new password.</p>
                    <p style="margin:28px 0"><a href="${safeLink}" style="background:#f5b301;color:#1d1d1f;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Reset Password</a></p>
                    <p>If the button does not work, open this link:</p>
                    <p style="overflow-wrap:anywhere"><a href="${safeLink}">${safeLink}</a></p>
                    <p>This link expires in <strong>30 minutes</strong> and can be used only once.</p>
                    <p>If you did not request this reset, ignore this email. Your password will stay unchanged.</p>
                </div>`
            }, { signal: AbortSignal.timeout(10000) });
        } catch {
            logger.error('Resend API error: network request failed');
            throw new Error('Failed to send password reset email');
        }
        if (result?.error || !result?.data?.id) {
            const category = knownErrors.has(result?.error?.name) ? result.error.name : 'provider_error';
            logger.error(`Resend API error: ${category}`);
            throw new Error('Failed to send password reset email');
        }
        logger.info('Reset email sent successfully (accepted by Resend)');
        return { id: result.data.id };
    };
}
export const sendResetEmail = createResetMailer();
