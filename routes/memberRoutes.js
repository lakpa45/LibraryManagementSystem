import { validateId } from '../middleware/validate_id.js';
import express from 'express';
import { getMembers, deleteMember, getPendingMembers, approveMember, rejectMember, getMyProfile, updateMyProfile } from '../controllers/members/member_controller.js';
import { verifyToken, requireAdmin, requireMember } from '../middleware/auth.js';

const router = express.Router();
router.param('id', validateId);

router.get('/me', verifyToken, requireMember, getMyProfile);
router.put('/me', verifyToken, requireMember, updateMyProfile);
router.get('/', verifyToken, requireAdmin, getMembers);
router.get('/pending', verifyToken, requireAdmin, getPendingMembers);
router.put('/:id/approve', verifyToken, requireAdmin, approveMember);
router.put('/:id/reject', verifyToken, requireAdmin, rejectMember);
router.delete('/:id', verifyToken, requireAdmin, deleteMember);

export default router;
