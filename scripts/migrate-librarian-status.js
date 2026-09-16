import fs from 'node:fs/promises';
import pool from '../db/connection.js';

let client;
try {
    client = await pool.connect();
    await client.query(await fs.readFile(new URL('../migrations/010_librarian_status.sql', import.meta.url), 'utf8'));
    console.log('Librarian status migration completed. Existing accounts and history preserved.');
} catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Librarian status migration failed:', error.message);
    process.exitCode = 1;
} finally {
    client?.release();
    await pool.end();
}
