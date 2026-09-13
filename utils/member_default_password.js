import { validDate } from './date_validation.js';

export function memberDefaultPassword(firstName, dob) {
  const name = typeof firstName === 'string' ? firstName.trim().split(/\s+/)[0] : '';
  if (!name || !validDate(dob)) throw new Error('First name and a valid date of birth are required.');
  return Array.from(name).slice(0, 4).join('') + dob.slice(0, 4);
}
