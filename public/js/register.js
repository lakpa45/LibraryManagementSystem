const form = document.getElementById('registerForm');
const errorEl = document.getElementById('registerError');
const successEl = document.getElementById('registerSuccess');
const submitButton = document.getElementById('registerSubmit');
const emailInput = document.getElementById('regEmail');
const emailError = document.getElementById('regEmailError');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const invalidEmailMessage = 'Please enter a valid email address, for example: name@example.com.';

function normalizeEmail() {
    emailInput.value = emailInput.value.trim().toLowerCase();
    return emailInput.value;
}

function setEmailValidity(valid) {
    emailError.classList.toggle('hidden', valid);
    emailInput.setAttribute('aria-invalid', String(!valid));
    return valid;
}

emailInput.addEventListener('input', () => {
    const email = emailInput.value.trim().toLowerCase();
    if (emailPattern.test(email)) setEmailValidity(true);
});

function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    successEl.classList.add('hidden');
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitButton.disabled) return;
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const fullName = document.getElementById('regName').value.trim();
    const email = normalizeEmail();
    const phone = document.getElementById('regPhone').value.replace(/\D/g, '');
    const department = document.getElementById('regDept').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (fullName.length < 2) return showError('Please enter your full name.');
    if (!setEmailValidity(emailPattern.test(email))) return showError(invalidEmailMessage);
    if (!/^\d{10}$/.test(phone)) return showError('Phone number must contain exactly 10 digits.');
    if (department.length < 2) return showError('Please enter your department.');
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) return showError('Password must be at least 8 characters and at most 72 bytes.');
    if (password !== confirmPassword) return showError('Passwords do not match.');

    const nameParts = fullName.split(' ');
    const first_name = nameParts[0];
    const last_name = nameParts.slice(1).join(' ') || first_name;

    try {
        submitButton.disabled = true;
        submitButton.textContent = 'CREATING ACCOUNT…';
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name, last_name, email, phone, department, password })
        });

        const result = await LibraryAPI.read(response).catch(() => ({}));

        if (response.ok) {
            successEl.textContent = 'Registration submitted for librarian approval. Redirecting to sign in…';
            successEl.classList.remove('hidden');
            form.reset();
            window.setTimeout(() => { window.location.href = '/#login'; }, 1500);
        } else {
            showError(result.message || 'Registration failed. Please check your details.');
        }
    } catch (err) {
        console.error(err);
        showError('Unable to connect to the server. Please try again.');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'CREATE ACCOUNT';
    }
});
