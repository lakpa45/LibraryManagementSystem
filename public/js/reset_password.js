const form = document.getElementById('resetPasswordForm');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const submitBtn = document.getElementById('submitBtn');
const buttonText = document.getElementById('buttonText');
const alertBox = document.getElementById('alertBox');

const queryParameters = new URLSearchParams(window.location.search);
const token = queryParameters.get('token');
const resendLink = document.getElementById('resendLink');
let busy = false;
// Keep the token in memory, not browser history or referrer URLs.
window.history.replaceState(null, '', window.location.pathname);

// Prevent the form from being used without a reset token.
if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    resendLink.classList.remove('hidden');
    showMessage(
        token ? 'This reset link is invalid. Please request a new link.' : 'The reset token is missing. Please request a new link.',
        'error'
    );

    disableForm();
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || submitBtn.disabled) return;

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!token) {
        showMessage('The reset token is missing.', 'error');
        return;
    }

    if (newPassword.length < 8 || new TextEncoder().encode(newPassword).length > 72) {
        showMessage(
            'Use at least 8 characters (maximum 72 UTF-8 bytes).',
            'error'
        );
        return;
    }

    if (newPassword !== confirmPassword) {
        showMessage('The passwords do not match.', 'error');
        return;
    }

    setLoading(true);

    try {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token,
                newPassword
            })
        });

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : {};

        if (data.code === 'INVALID_RESET_LINK') {
            showMessage(data.message, 'error');
            resendLink.classList.remove('hidden');
            disableForm();
            buttonText.textContent = 'Reset Password';
            return;
        }
        if (!response.ok) {
            throw new Error(
                response.status >= 500 ? 'Unable to reset your password right now. Please try again later.' : data.message || 'Unable to reset your password.'
            );
        }

        showMessage(
            'Your password has been reset successfully. You can now log in.',
            'success'
        );

        form.reset();
        disableForm();
        buttonText.textContent = 'Password reset';

        document.getElementById('loginLink').focus();
    } catch (error) {
        showMessage(
            error.message || 'Something went wrong. Please try again.',
            'error'
        );

        setLoading(false);
    }
});

function showMessage(message, type) {
    alertBox.textContent = message;

    alertBox.classList.remove(
        'hidden',
        'bg-green-100',
        'text-green-700',
        'border-green-200',
        'bg-red-100',
        'text-red-700',
        'border-red-200'
    );

    if (type === 'success') {
        alertBox.classList.add(
            'bg-green-100',
            'text-green-700',
            'border-green-200'
        );
    } else {
        alertBox.classList.add(
            'bg-red-100',
            'text-red-700',
            'border-red-200'
        );
    }
}

function setLoading(isLoading) {
    busy = isLoading;
    submitBtn.disabled = isLoading;
    buttonText.textContent = isLoading
        ? 'Resetting...'
        : 'Reset Password';
}

function disableForm() {
    newPasswordInput.disabled = true;
    confirmPasswordInput.disabled = true;
    submitBtn.disabled = true;
}
