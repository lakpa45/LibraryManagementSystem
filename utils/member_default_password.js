import { validDate } from './date_validation.js';

export function memberDefaultPassword(firstName, dob) {
  const name = typeof firstName === 'string' ? firstName.trim().split(/\s+/)[0].replace(/[^a-zA-Z]/g, '').toLowerCase() : '';
  if (!name || !validDate(dob) || dob.startsWith('0000')) throw new Error('First name and a valid date of birth are required.');
  return Array.from(name).slice(0, 4).join('') + dob.slice(0, 4);
}
