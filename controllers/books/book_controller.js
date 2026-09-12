import pool from '../../db/connection.js';
import crypto from 'crypto';
import { removeUploadedFiles } from '../../middleware/upload.js';

// GET all books
export const getBooks = async (req, res) => {
    try {
        const usePublicListing = ['q', 'category', 'availability', 'type', 'page', 'limit', 'sort', 'public']
            .some(key => req.query[key] !== undefined);

        if (!usePublicListing) {
            const result = await pool.query(
                `SELECT b.*,
                        COUNT(bc.copy_id)::int AS total_copies,
                        COUNT(bc.copy_id) FILTER (WHERE LOWER(bc.status) = 'available')::int AS available_copies
                 FROM book b
                 LEFT JOIN book_copy bc ON bc.book_id = b.book_id
                 GROUP BY b.book_id
                 ORDER BY b.book_id DESC`
            );
            return res.status(200).json(result.rows);
        }

        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 48);
        const category = req.query.category ? Number.parseInt(req.query.category, 10) : null;
        const availability = ['available', 'unavailable'].includes(req.query.availability) ? req.query.availability : 'all';
        const bookType = ['physical', 'digital'].includes(String(req.query.type || '').toLowerCase())
            ? String(req.query.type).toLowerCase()
            : null;
        const sortMap = {
            newest: 'b.book_id DESC', title_asc: 'b.title ASC',
            title_desc: 'b.title DESC', most_available: 'available_copies DESC, b.title ASC'
        };
        const orderBy = sortMap[req.query.sort] || sortMap.newest;
        const search = String(req.query.q || '').trim();
        const memberId = req.user?.role === 'member' || req.user?.role === 'user'
            ? req.user.id
            : null;
        const values = [memberId];
        const where = [];

        if (search) {
            values.push(`%${search}%`);
            where.push(`(b.title ILIKE $${values.length} OR COALESCE(b.isbn, '') ILIKE $${values.length} OR COALESCE(c.category_name, '') ILIKE $${values.length})`);
        }
        if (Number.isInteger(category) && category > 0) {
            values.push(category);
            where.push(`b.category_id = $${values.length}`);
        }
        if (bookType) {
            values.push(bookType);
            where.push(`LOWER(b.book_type) = $${values.length}`);
        }
        if (availability === 'available') where.push(`EXISTS (SELECT 1 FROM book_copy ac WHERE ac.book_id = b.book_id AND LOWER(ac.status) = 'available')`);
        if (availability === 'unavailable') where.push(`NOT EXISTS (SELECT 1 FROM book_copy ac WHERE ac.book_id = b.book_id AND LOWER(ac.status) = 'available')`);

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM book b
             LEFT JOIN category c ON c.category_id = b.category_id
             CROSS JOIN (SELECT $1::int AS authenticated_member_id) auth
             ${whereSql}`,
            values
        );
        const queryValues = [...values, limit, (page - 1) * limit];
        const result = await pool.query(
            `SELECT b.book_id, b.title, b.isbn, b.description, b.cover_image, b.pdf_file,
                    b.book_type, b.category_id,
                    c.category_name, COUNT(bc.copy_id)::int AS total_copies,
                    COUNT(bc.copy_id) FILTER (WHERE LOWER(bc.status) = 'available')::int AS available_copies,
                    EXISTS (SELECT 1 FROM wishlist w WHERE w.book_id = b.book_id AND w.member_id = $1) AS wishlisted
             FROM book b
             LEFT JOIN category c ON c.category_id = b.category_id
             LEFT JOIN book_copy bc ON bc.book_id = b.book_id
             ${whereSql}
             GROUP BY b.book_id, c.category_name
             ORDER BY ${orderBy}
             LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
            queryValues
        );
        res.status(200).json({ books: result.rows, total: countResult.rows[0].total, page, limit, pages: Math.max(Math.ceil(countResult.rows[0].total / limit), 1) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// CREATE a book (with copies)
export const createBook = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const title = String(req.body.title || '').trim();
        const description = String(req.body.description || '').trim();
        const isbn = String(req.body.isbn || '').trim() || null;
        const categoryId = Number(req.body.category_id);
        const numCopies = Number(req.body.copies);
        const bookType = String(req.body.book_type || 'physical').trim().toLowerCase();

        if (!title || title.length > 255) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'Title must contain 1 to 255 characters' });
        }
        if (isbn && isbn.length > 20) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'ISBN must be 20 characters or fewer' });
        }
        if (!Number.isInteger(categoryId) || categoryId < 1) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'A valid category is required' });
        }
        if (!Number.isInteger(numCopies) || numCopies < 1 || numCopies > 100) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'Copies must be between 1 and 100' });
        }
        if (!['physical', 'digital'].includes(bookType)) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'Book type must be physical or digital' });
        }

        const coverFile = req.files?.cover_image?.[0];
        const pdfFile = req.files?.book_pdf?.[0];
        const cover_image = coverFile ? `/images/books/${coverFile.filename}` : null;
        const pdf_file = pdfFile ? `/pdfs/books/${pdfFile.filename}` : null;
        const savedBookType = pdfFile ? 'digital' : bookType;

        await client.query('BEGIN');
        const category = await client.query('SELECT category_id FROM category WHERE category_id = $1', [categoryId]);
        if (!category.rowCount) {
            await client.query('ROLLBACK');
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'Category not found' });
        }

        const bookResult = await client.query(
            `INSERT INTO book (title, isbn, description, cover_image, category_id, pdf_file, book_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [title, isbn, description, cover_image, categoryId, pdf_file, savedBookType]
        );
        const book = bookResult.rows[0];

        for (let i = 0; i < numCopies; i++) {
            const barcode = `BK-${book.book_id}-${crypto.randomUUID()}`;
            await client.query(
                `INSERT INTO book_copy (barcode, status, book_id) VALUES ($1, 'Available', $2)`,
                [barcode, book.book_id]
            );
        }

        await client.query('COMMIT');
        res.status(201).json(book);
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        await removeUploadedFiles(req);
        if (err.code === '23505' && err.constraint === 'book_isbn_key') {
            return res.status(409).json({ message: 'A book with this ISBN already exists' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    } finally {
        client?.release();
    }
};

// UPDATE a book
export const updateBook = async (req, res) => {
    try {
        const { id } = req.params;
        const title = String(req.body.title || '').trim();
        const description = String(req.body.description || '').trim();
        const isbn = String(req.body.isbn || '').trim() || null;
        const categoryId = Number(req.body.category_id);
        const bookType = String(req.body.book_type || 'physical').trim().toLowerCase();

        if (!title || title.length > 255) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'Title must contain 1 to 255 characters' });
        }
        if (isbn && isbn.length > 20) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'ISBN must be 20 characters or fewer' });
        }
        if (!Number.isInteger(categoryId) || categoryId < 1) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'A valid category is required' });
        }
        if (!['physical', 'digital'].includes(bookType)) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'Book type must be physical or digital' });
        }

        const category = await pool.query('SELECT category_id FROM category WHERE category_id = $1', [categoryId]);
        if (!category.rowCount) {
            await removeUploadedFiles(req);
            return res.status(400).json({ message: 'Category not found' });
        }

        const coverFile = req.files?.cover_image?.[0];
        const pdfFile = req.files?.book_pdf?.[0];
        const cover_image = coverFile ? `/images/books/${coverFile.filename}` : null;
        const pdf_file = pdfFile ? `/pdfs/books/${pdfFile.filename}` : null;

        const query = `UPDATE book
                       SET title = $1, isbn = $2, description = $3, category_id = $4,
                           cover_image = COALESCE($5, cover_image),
                           pdf_file = COALESCE($6, pdf_file),
                           book_type = CASE
                               WHEN COALESCE($6, pdf_file) IS NOT NULL THEN 'digital'
                               ELSE $7
                           END
                       WHERE book_id = $8 RETURNING *`;
        const values = [title, isbn, description, categoryId, cover_image, pdf_file, bookType, id];

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            await removeUploadedFiles(req);
            return res.status(404).json({ message: 'Book not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        await removeUploadedFiles(req);
        if (err.code === '23505' && err.constraint === 'book_isbn_key') {
            return res.status(409).json({ message: 'A book with this ISBN already exists' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// DELETE a book
export const deleteBook = async (req, res) => {
    let client;

    try {
        client = await pool.connect();
        const { id } = req.params;

        await client.query('BEGIN');

        const bookResult = await client.query(
            'SELECT book_id FROM book WHERE book_id = $1 FOR UPDATE',
            [id]
        );

        if (bookResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Book not found' });
        }

        const issueResult = await client.query(
            `SELECT 1
             FROM issue i
             JOIN book_copy bc ON bc.copy_id = i.copy_id
             WHERE bc.book_id = $1
             LIMIT 1`,
            [id]
        );

        if (issueResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                message: 'This book cannot be removed because it has borrowing records.'
            });
        }

        await client.query('DELETE FROM book_copy WHERE book_id = $1', [id]);

        await client.query(
            'DELETE FROM book WHERE book_id = $1 RETURNING *',
            [id]
        );

        await client.query('COMMIT');
        res.status(200).json({ message: 'Book deleted' });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (err.code === '23503') return res.status(409).json({ message: 'This book has related records and cannot be removed.' });
        console.error('Book deletion failed');
        res.status(500).json({ message: 'Server error' });
    } finally {
        client?.release();
    }
};

// SEARCH books by title or category name
export const searchBooks = async (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (!q) {
            return res.status(200).json([]);
        }
        const searchTerm = `%${q}%`;
        const result = await pool.query(
            `SELECT book.*, category.category_name
             FROM book
             LEFT JOIN category ON book.category_id = category.category_id
             WHERE book.title ILIKE $1 OR category.category_name ILIKE $1
             ORDER BY book.title ASC
             LIMIT 8`,
            [searchTerm]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET single book by id (with availability info)
export const getBookById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ message: 'Invalid book ID.' });
        }
        const result = await pool.query(
            `SELECT book.*, category.category_name,
                    COUNT(book_copy.copy_id) FILTER (WHERE LOWER(book_copy.status) = 'available') AS available_copies,
                    COUNT(book_copy.copy_id) AS total_copies
             FROM book
             LEFT JOIN category ON book.category_id = category.category_id
             LEFT JOIN book_copy ON book_copy.book_id = book.book_id
             WHERE book.book_id = $1
             GROUP BY book.book_id, category.category_name`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Book not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET all books that currently have at least one available copy
export const getAvailableBooks = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT b.book_id, b.title, b.cover_image, c.category_name,
                    COUNT(bc.copy_id) FILTER (WHERE bc.status = 'Available') AS available_copies
             FROM book b
             LEFT JOIN category c ON b.category_id = c.category_id
             JOIN book_copy bc ON bc.book_id = b.book_id
             GROUP BY b.book_id, c.category_name
             HAVING COUNT(bc.copy_id) FILTER (WHERE bc.status = 'Available') > 0
             ORDER BY b.title ASC`
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};
