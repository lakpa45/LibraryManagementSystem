import { validateId } from '../middleware/validate_id.js';
import express from 'express';
import { getCategories, getCategoryById, createCategory, updateCategory, deleteCategory } from '../controllers/categories/category_controller.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.param('id', validateId);

router.get('/', getCategories);
router.get('/:id', getCategoryById);
router.post('/', verifyToken, requireAdmin, createCategory);
router.put('/:id', verifyToken, requireAdmin, updateCategory);
router.delete('/:id', verifyToken, requireAdmin, deleteCategory);

export default router;
