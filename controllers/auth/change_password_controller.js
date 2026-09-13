import bcrypt from 'bcrypt';
import pool from '../../db/connection.js';

const accountMap = {
  member: { table: 'member', idColumn: 'member_id' },
  // Keep already-issued member tokens working until their one-hour expiry.
  user: { table: 'member', idColumn: 'member_id' },
  librarian: { table: 'librarian', idColumn: 'librarian_id' },
  admin: { table: 'admins', idColumn: 'id' }
};

export const changePassword = async (req, res) => {
  const account = accountMap[req.user?.role];
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body?.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body?.newPassword : '';
  if (!account) return res.status(403).json({ message: 'Access denied' });
  if (!currentPassword || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ message: 'The new password must contain at least 8 characters and at most 72 bytes.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT password, email FROM ${account.table} WHERE ${account.idColumn} = $1 FOR UPDATE`,
      [req.user.id]
    );
    if (!result.rowCount || !await bcrypt.compare(currentPassword, result.rows[0].password)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }
    if (await bcrypt.compare(newPassword, result.rows[0].password)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Choose a password different from your current password.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await client.query(
      `UPDATE ${account.table} SET password = $1 WHERE ${account.idColumn} = $2`,
      [passwordHash, req.user.id]
    );
    if (account.table === 'member') await client.query('UPDATE password_reset SET used = TRUE WHERE LOWER(email) = LOWER($1) AND used = FALSE', [result.rows[0].email]);
    await client.query('COMMIT');
    res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Password change failed');
    res.status(500).json({ message: 'Unable to change password.' });
  } finally { client?.release(); }
};
