import { validateId } from '../middleware/validate_id.js';
import express from 'express';
import {
    getActiveLoans,
    searchMembers,
    searchAvailableBooks,
    getMemberActiveLoans,
    issueBook,
    returnBook,
    getMyLoans,
    getMyActivity,
    renewMyLoan,
    borrowBook
} from '../controllers/loans/loan_controller.js';
import { verifyToken, requireAdmin, requireMember } from '../middleware/auth.js';

const router = express.Router();
router.param('id', validateId);
router.param('memberId', validateId);

router.get('/active', verifyToken, requireAdmin, getActiveLoans);
router.get('/members/search', verifyToken, requireAdmin, searchMembers);
router.get('/books/search', verifyToken, requireAdmin, searchAvailableBooks);
router.get('/members/:memberId/active', verifyToken, requireAdmin, getMemberActiveLoans);
router.post('/issue', verifyToken, requireAdmin, issueBook);
router.put('/return/:id', verifyToken, requireAdmin, returnBook);

router.get('/my-loans', verifyToken, requireMember, getMyLoans);
router.get('/my-activity', verifyToken, requireMember, getMyActivity);
router.put('/renew/:id', verifyToken, requireMember, renewMyLoan);
router.post('/borrow', verifyToken, requireMember, borrowBook);

export default router;
