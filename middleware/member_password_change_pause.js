export const passwordChangeUnavailable = 'Password change is temporarily unavailable. Please contact the librarian if you need assistance.';

// Temporary member-only gate; preserve the existing controller for re-enabling.
export function pauseMemberPasswordChange(req, res, next) {
  if (['member', 'user'].includes(req.user?.role)) {
    return res.status(403).json({ message: passwordChangeUnavailable });
  }
  next();
}
