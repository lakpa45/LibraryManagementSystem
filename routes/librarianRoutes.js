import express from 'express';
import { createLibrarian, getLibrarians, deactivateLibrarian, reactivateLibrarian } from '../controllers/librarians/librarian_controller.js';
import { requireAdminOnly, verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken, requireAdminOnly);
router.get('/', getLibrarians);
router.post('/', createLibrarian);
router.patch('/:id/deactivate', deactivateLibrarian);
router.patch('/:id/reactivate', reactivateLibrarian);

export default router;
