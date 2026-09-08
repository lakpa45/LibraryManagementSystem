import { validateId } from '../middleware/validate_id.js';
import express from 'express';
import { verifyToken, requireMember } from '../middleware/auth.js';
import { getWishlist, getWishlistStatus, addWishlistBook, removeWishlistBook } from '../controllers/wishlist/wishlist_controller.js';

const router = express.Router();
router.param('bookId', validateId);
router.use(verifyToken, requireMember);
router.get('/', getWishlist);
router.get('/:bookId/status', getWishlistStatus);
router.post('/:bookId', addWishlistBook);
router.delete('/:bookId', removeWishlistBook);
export default router;
