import fs from 'node:fs/promises';
import pool from '../db/connection.js';

let client;
try {
    client = await pool.connect();
    const migration = await fs.readFile(new URL('../migrations/008_secure_password_reset.sql', import.meta.url), 'utf8');
    await client.query(migration);
    console.log('Password-reset migration completed. Raw token column removed; hash and rate-limit indexes ready.');
} catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Password-reset migration failed and was rolled back. Check database access and schema compatibility.');
    process.exitCode = 1;
} finally {
    client?.release();
    await pool.end();
}
