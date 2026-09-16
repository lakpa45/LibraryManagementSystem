export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const INVALID_EMAIL_MESSAGE = 'Please enter a valid email address, for example: name@example.com.';
export const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists.';

export function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value) {
    const email = normalizeEmail(value);
    return email.length <= 100 && EMAIL_PATTERN.test(email);
}
