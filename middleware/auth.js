import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : req.cookies?.userSession || req.cookies?.adminSession;

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
        return res.status(403).json({ message: 'Access denied' });
    }
    next();
};

export const optionalMemberAuth = (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : req.cookies?.userSession;
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role === 'member' || decoded.role === 'user') req.user = decoded;
    } catch (err) {
        // Public book browsing remains available when a stale token is supplied.
    }
    next();
};

export const requireMember = (req, res, next) => {
    if (req.user?.role !== 'member' && req.user?.role !== 'user') {
        return res.status(403).json({ message: 'Member access required' });
    }
    next();
};

export const requireAdminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Administrator access required' });
    }
    next();
};
