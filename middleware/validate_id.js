export function validateId(req, res, next, value) {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
        return res.status(400).json({ message: 'A valid positive integer ID is required.' });
    }
    next();
}
