import { validateId } from '../middleware/validate_id.js';
import express from 'express';
import upload, { validateUploadedSignatures, validateUploadedSizes } from '../middleware/upload.js';
import { getBooks, createBook, updateBook, deleteBook, searchBooks, getBookById, getAvailableBooks } from '../controllers/books/book_controller.js';
import { getFreeBooks } from '../controllers/books/free_books_controller.js';
import { optionalMemberAuth, verifyToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.param('id', validateId);

router.get('/available', getAvailableBooks);
router.get('/search', searchBooks);
router.get('/free', getFreeBooks);
router.get('/:id', getBookById);
router.get('/', optionalMemberAuth, getBooks);
const bookUploads = upload.fields([
    { name: 'cover_image', maxCount: 1 },
    { name: 'book_pdf', maxCount: 1 }
]);

router.post('/', verifyToken, requireAdmin, bookUploads, validateUploadedSizes, validateUploadedSignatures, createBook);
router.put('/:id', verifyToken, requireAdmin, bookUploads, validateUploadedSizes, validateUploadedSignatures, updateBook);
router.delete('/:id', verifyToken, requireAdmin, deleteBook);

export default router;
