import pool from '../../db/connection.js';

export const getCategories = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.category_id, c.category_name, c.description, c.color,
                   COUNT(b.book_id)::int AS book_count
            FROM category c
            LEFT JOIN book b ON b.category_id = c.category_id
            GROUP BY c.category_id
            ORDER BY c.category_id
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createCategory = async (req, res) => {
    try {
        const category_name = String(req.body?.category_name || '').trim();
        const description = String(req.body?.description || '').trim();
        const color = /^#[0-9a-f]{6}$/i.test(req.body?.color || '') ? req.body?.color : '#1B4332';
        if (!category_name || category_name.length > 100) {
            return res.status(400).json({ message: 'Category name must contain 1 to 100 characters' });
        }
        const result = await pool.query(
            `INSERT INTO category (category_name, description, color)
             VALUES ($1, $2, $3) RETURNING *`,
            [category_name, description, color]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'A category with this name already exists' });
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category_name = String(req.body?.category_name || '').trim();
        const description = String(req.body?.description || '').trim();
        const color = /^#[0-9a-f]{6}$/i.test(req.body?.color || '') ? req.body?.color : '#1B4332';
        if (!category_name || category_name.length > 100) return res.status(400).json({ message: 'Category name must contain 1 to 100 characters' });
        const result = await pool.query(
            `UPDATE category SET category_name = $1, description = $2, color = $3
             WHERE category_id = $4 RETURNING *`,
            [category_name, description, color, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Category not found' });
        res.status(200).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'A category with this name already exists' });
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'DELETE FROM category WHERE category_id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Category not found' });
        res.status(200).json({ message: 'Category deleted' });
    } catch (err) {
        if (err.code === '23503') {
            return res.status(409).json({ message: 'This category cannot be deleted while books are assigned to it.' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getCategoryById = async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid category ID' });
    try {
        const result = await pool.query(
            `SELECT c.category_id, c.category_name, c.description, c.color,
                    COUNT(b.book_id)::int AS book_count
             FROM category c LEFT JOIN book b ON b.category_id = c.category_id
             WHERE c.category_id = $1 GROUP BY c.category_id`, [id]
        );
        if (!result.rowCount) return res.status(404).json({ message: 'Category not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Category read failed:', error.message);
        res.status(500).json({ message: 'Unable to load category' });
    }
};
