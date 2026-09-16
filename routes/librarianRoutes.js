import express from 'express';
import { createLibrarian, getLibrarians, removeLibrarian } from '../controllers/librarians/librarian_controller.js';
import { requireAdminOnly, verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken, requireAdminOnly);
router.get('/', getLibrarians);
router.post('/', createLibrarian);
router.delete('/:id', removeLibrarian);

export default router;
