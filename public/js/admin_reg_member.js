const form = document.getElementById('member-form');
const toast = document.getElementById('toast');
const fields = {
  name:  document.getElementById('f-name'),
  email: document.getElementById('f-email'),
  phone: document.getElementById('f-phone'),
  dob:   document.getElementById('f-dob'),
  type:  document.getElementById('f-type'),
  dept:  document.getElementById('f-dept'),
  roll:  document.getElementById('f-roll'),
  expiry:document.getElementById('f-expiry'),
  address:document.getElementById('f-address'),
};

function updatePreview() {
  document.getElementById('prev-name').textContent = fields.name.value.trim() || '—';
  document.getElementById('prev-type').textContent = fields.type.value || '—';
  document.getElementById('prev-dept').textContent = fields.dept.value || '—';
  document.getElementById('prev-expiry').textContent = fields.expiry.value
    ? new Date(fields.expiry.value).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : '—';
}
Object.values(fields).forEach(el => el.addEventListener('input', updatePreview));

function showError(id, show) {
  const input = document.getElementById(id);
  const msg = document.querySelector(`[data-err="${id}"]`);
  if (input) input.classList.toggle('field-err', show);
  if (msg) msg.classList.toggle('hidden', !show);
}

function validate() {
  let valid = true;
  const nameOk = fields.name.value.trim().length >= 2;
  showError('f-name', !nameOk); valid = valid && nameOk;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim());
  showError('f-email', !emailOk); valid = valid && emailOk;
  const phoneOk = /^\d{10}$/.test(fields.phone.value.trim());
  showError('f-phone', !phoneOk); valid = valid && phoneOk;
  const dobOk = fields.dob.value !== '';
  showError('f-dob', !dobOk); valid = valid && dobOk;
  const typeOk = fields.type.value !== '';
  showError('f-type', !typeOk); valid = valid && typeOk;
  const deptOk = fields.dept.value !== '';
  showError('f-dept', !deptOk); valid = valid && deptOk;
  const rollOk = fields.roll.value.trim().length >= 3;
  showError('f-roll', !rollOk); valid = valid && rollOk;
  return valid;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;

  const nameParts = fields.name.value.trim().split(' ');
  const first_name = nameParts[0];
  const last_name = nameParts.slice(1).join(' ') || first_name;

  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name,
        last_name,
        email: fields.email.value.trim(),
        phone: fields.phone.value.trim(),
        member_type: fields.type.value,
        department: fields.dept.value,
        roll_id: fields.roll.value.trim(),
        dob: fields.dob.value,
        valid_till: fields.expiry.value || null,
        address: fields.address.value.trim()
      })
    });

    const result = await LibraryAPI.read(response);

    if (response.ok) {
      document.getElementById('prev-id').textContent = result.member.card_no;
      document.getElementById('toast-title').textContent = 'Member registered';
      document.getElementById('toast-body').textContent = result.temp_password
        ? `${result.member.first_name} — Card ID ${result.member.card_no} — temp password: ${result.temp_password}`
        : `${result.member.first_name} — Card ID ${result.member.card_no}`;
      toast.classList.remove('translate-y-24', 'opacity-0');
      setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 6000);
      form.reset();
      setTimeout(updatePreview, 0);
    } else {
      alert(result.message);
    }
  } catch (err) {
    console.error(err);
    alert('Something went wrong. Please try again.');
  }
});
