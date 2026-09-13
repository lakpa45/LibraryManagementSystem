document.getElementById('passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById('message');
  const button = form.querySelector('button');
  if (form.newPassword.value !== form.confirmPassword.value) {
    message.textContent = 'The new passwords do not match.';
    return;
  }
  button.disabled = true;
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ currentPassword: form.currentPassword.value, newPassword: form.newPassword.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to change password.');
    localStorage.removeItem('token');
    form.reset();
    message.textContent = 'Password changed. Sign in with your new password to continue.';
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
