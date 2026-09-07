export const FORGOT_MESSAGE = 'If an account exists for this email, a password reset link has been sent.';
export function normalizeResetEmail(value) {
    if (typeof value !== 'string') return null;
    const email = value.trim().toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function validResetPassword(value) {
    return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
}
export const PASSWORD_MESSAGE = 'Use at least 8 characters (maximum 72 UTF-8 bytes).';
export const validResetToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
