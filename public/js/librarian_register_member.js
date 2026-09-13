(() => {
  const form = document.getElementById('memberForm');
  const submitButton = document.getElementById('submitMember');
  const message = document.getElementById('formMessage');
  const fields = {
    firstName: document.getElementById('firstName'), lastName: document.getElementById('lastName'),
    email: document.getElementById('email'), phone: document.getElementById('phone'),
    dateOfBirth: document.getElementById('dateOfBirth'),
    department: document.getElementById('department'), rollId: document.getElementById('rollId'),
    validTill: document.getElementById('validTill'), address: document.getElementById('address')
  };

  const setValid = (field, valid) => {
    field.closest('.member-field').classList.toggle('invalid', !valid);
    return valid;
  };

  function validate() {
    return [
      setValid(fields.firstName, fields.firstName.value.trim().length >= 1),
      setValid(fields.lastName, fields.lastName.value.trim().length >= 1),
      setValid(fields.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim())),
      setValid(fields.phone, /^\d{10}$/.test(fields.phone.value.trim())),
      setValid(fields.dateOfBirth, Boolean(fields.dateOfBirth.value)),
      setValid(fields.department, fields.department.value.trim().length >= 2),
      setValid(fields.rollId, fields.rollId.value.trim().length >= 2)
    ].every(Boolean);
  }

  const formatDate = (value) => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'â€”';

  function updatePreview() {
    const firstName = fields.firstName.value.trim().split(/\s+/)[0];
    const dob = fields.dateOfBirth.value;
    const parsedDate = new Date(`${dob}T00:00:00.000Z`);
    const validDob = /^\d{4}-\d{2}-\d{2}$/.test(dob) && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === dob;
    document.getElementById('memberPassword').value = firstName && validDob
      ? Array.from(firstName).slice(0, 4).join('') + dob.slice(0, 4) : '';
    const name = `${fields.firstName.value.trim()} ${fields.lastName.value.trim()}`.trim();
    document.getElementById('previewName').textContent = name || 'New Member';
    document.getElementById('previewType').textContent = 'Student';
    document.getElementById('previewDepartment').textContent = fields.department.value.trim() || 'â€”';
    document.getElementById('previewExpiry').textContent = formatDate(fields.validTill.value);
  }

  Object.values(fields).forEach((field) => field.addEventListener('input', () => {
    field.closest('.member-field').classList.remove('invalid');
    updatePreview();
  }));

  form.addEventListener('reset', () => window.setTimeout(() => {
    document.querySelectorAll('.member-field.invalid').forEach((field) => field.classList.remove('invalid'));
    document.getElementById('previewCard').textContent = 'Generated after saving';
    message.textContent = '';
    message.className = 'form-message';
    updatePreview();
  }, 0));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    message.textContent = '';
    message.className = 'form-message';
    if (!validate()) {
      message.textContent = 'Please correct the highlighted fields.';
      message.classList.add('error');
      return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Addingâ€¦';
    try {
      const response = await LibraryAPI.staffFetch('/api/auth/librarian/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: fields.firstName.value.trim(), last_name: fields.lastName.value.trim(),
          email: fields.email.value.trim().toLowerCase(), phone: fields.phone.value.trim(),
          dob: fields.dateOfBirth.value, member_type: 'Student',
          department: fields.department.value.trim(), roll_id: fields.rollId.value.trim(),
          valid_till: fields.validTill.value || null, address: fields.address.value.trim()
        })
      });
      const result = await LibraryAPI.read(response);
      if (!response.ok) throw new Error(result.message || 'Unable to add member.');
      document.getElementById('previewCard').textContent = result.member.card_no;
      message.textContent = `Member added. Card ID: ${result.member.card_no}. Default password: first four characters of the first name (same capitalization), followed by birth year. After approval, the member can sign in with this password to access their dashboard.`;
      message.classList.add('success');
    } catch (error) {
      message.textContent = error.message || 'Unable to add member. Please try again.';
      message.classList.add('error');
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fa-solid fa-user-plus"></i> Add Member';
    }
  });

  updatePreview();
})();
