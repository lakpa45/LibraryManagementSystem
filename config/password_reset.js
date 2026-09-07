import 'dotenv/config';

export function readResetConfig(env = process.env) {
    const production = env.NODE_ENV?.trim() === 'production' || Boolean(env.RAILWAY_ENVIRONMENT_ID);
    const required = ['RESEND_API_KEY', 'FRONTEND_URL', 'EMAIL_FROM'];
    const missing = required.filter(key => !env[key]?.trim());
    if (production && missing.length) throw new Error(`Password-reset configuration missing: ${missing.join(', ')}`);
    const baseUrl = env.FRONTEND_URL?.trim().replace(/\/+$/, '') || '';
    if (baseUrl) {
        let url;
        try { url = new URL(baseUrl); } catch { throw new Error('FRONTEND_URL must be a valid absolute URL'); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
            (production && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
            throw new Error('FRONTEND_URL must be an origin URL; production requires public HTTPS');
        }
    }
    const emailFrom = env.EMAIL_FROM?.trim() || '';
    const fromAddress = emailFrom.match(/<([^<>]+)>$/)?.[1] || emailFrom;
    if (emailFrom && (/[\r\n]/.test(emailFrom) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromAddress))) {
        throw new Error('EMAIL_FROM must contain a valid sender email address');
    }
    return { production, baseUrl, apiKey: env.RESEND_API_KEY?.trim() || '', emailFrom, testingSender: fromAddress.toLowerCase().endsWith('@resend.dev') };
}

export const resetConfig = readResetConfig();
