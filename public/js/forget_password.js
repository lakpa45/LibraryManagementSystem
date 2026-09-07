const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const emailInput = document.getElementById('email');
const submitButton = document.getElementById('submitBtn');
const resendButton = document.getElementById('resendBtn');
const alertBox = document.getElementById('alertBox');
const cooldownText = document.getElementById('cooldownText');
const cooldownKey = 'passwordResetCooldownUntil';
const genericMessage = 'If an account exists for this email, a password reset link has been sent.';
let busy = false;
let lastEmail = null;
let cooldownUntil = 0;
try { cooldownUntil = Number(localStorage.getItem(cooldownKey)) || 0; } catch { /* Storage may be disabled. */ }
function startCooldown(seconds) {
    cooldownUntil = Math.max(cooldownUntil, Date.now() + seconds * 1000);
    try { localStorage.setItem(cooldownKey, String(cooldownUntil)); } catch { /* Server still enforces limits. */ }
    renderButton();
}
function renderButton() {
    const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    submitButton.disabled = busy || remaining > 0;
    resendButton.disabled = busy || remaining > 0 || !lastEmail;
    submitButton.textContent = busy ? 'Sending...' : 'Send Reset Link';
    resendButton.textContent = 'Resend Reset Link';
    cooldownText.textContent = remaining ? `Resend link in ${remaining}s` : '';
}
window.addEventListener('storage', event => {
    if (event.key === cooldownKey) { cooldownUntil = Math.max(cooldownUntil, Number(event.newValue) || 0); renderButton(); }
});
setInterval(renderButton, 1000);
renderButton();
forgotPasswordForm.addEventListener('submit', event => {
    event.preventDefault();
    requestReset(emailInput.value.trim().toLowerCase());
});
resendButton.addEventListener('click', () => { if (lastEmail) requestReset(lastEmail); });
async function requestReset(email) {
    if (busy || Date.now() < cooldownUntil) return;
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        displayMessage('Please enter a valid email address.', false); return;
    }
    emailInput.value = email;
    busy = true;
    renderButton();
    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
        });
        if (response.status === 429) {
            const retry = Number(response.headers.get('Retry-After'));
            startCooldown(Number.isFinite(retry) ? Math.max(60, retry) : 60);
        } else if (!response.ok) {
            displayMessage('Unable to request a reset link right now. Please try again later.', false); return;
        } else {
            startCooldown(60);
        }
        lastEmail = email;
        resendButton.classList.remove('hidden');
        displayMessage(genericMessage, true);
    } catch {
        // The server may have accepted a request whose response was lost.
        startCooldown(60);
        displayMessage('Unable to reach the server. Check your connection and try again.', false);
    } finally { busy = false; renderButton(); }
}
function displayMessage(message, success) {
    alertBox.textContent = message;
    alertBox.className = 'mb-4 p-3.5 rounded-xl border text-sm font-medium';
    alertBox.classList.add(...(success ? ['bg-green-100', 'text-green-700', 'border-green-200'] : ['bg-red-100', 'text-red-700', 'border-red-200']));
}
