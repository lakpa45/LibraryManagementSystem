import fs from 'node:fs/promises';
import pool from '../db/connection.js';
try {
  await pool.query(await fs.readFile(new URL('../migrations/009_member_first_login_password.sql', import.meta.url), 'utf8'));
  console.log('Member first-login migration completed.');
} catch {
  console.error('Member first-login migration failed.');
  process.exitCode = 1;
} finally { await pool.end(); }
