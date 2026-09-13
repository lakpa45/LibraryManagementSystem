import jwt from 'jsonwebtoken';
export function requireMemberPage(req, res, next) {
  try {
    const member = jwt.verify(req.cookies?.userSession || '', process.env.JWT_SECRET);
    if (!['member','user'].includes(member.role)) return res.redirect('/?login=1');
    if (member.mustChangePassword) return res.redirect('/change_password.html');
    next();
  } catch {
    res.clearCookie('userSession');
    res.redirect('/?login=1');
  }
}
