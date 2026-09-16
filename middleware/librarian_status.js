import pool from '../db/connection.js';

export const inactiveLibrarianMessage = 'Your librarian account is inactive. Please contact the administrator.';

export async function isActiveLibrarian(id) {
    const result = await pool.query('SELECT status FROM librarian WHERE librarian_id = $1', [id]);
    return result.rows[0]?.status === 'active';
}
