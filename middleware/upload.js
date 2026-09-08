import { randomUUID } from 'node:crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const MAX_UPLOAD_SIZE = 35 * 1024 * 1024;

// Set up storage configuration for multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = file.fieldname === 'book_pdf'
            ? path.join(__dirname, '..', 'public', 'pdfs', 'books')
            : path.join(__dirname, '..', 'public', 'images', 'books');
        fs.mkdirSync(folder, { recursive: true });
        cb(null, folder);
    },
    filename: (req, file, cb) => {
        const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '-');
        const uniqueName = randomUUID() + '-' + safeName;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    // Busboy marks a file as truncated when it reaches (not only exceeds) its
    // transport limit. One extra byte lets the validator below accept exactly
    // 35 MB while still detecting the first byte over the application limit.
    limits: { fileSize: MAX_UPLOAD_SIZE + 1 },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const coverTypes = new Map([
            ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
            ['.png', 'image/png'], ['.webp', 'image/webp']
        ]);
        const validCover = file.fieldname === 'cover_image' && coverTypes.get(extension) === file.mimetype;
        const validPdf = file.fieldname === 'book_pdf' && extension === '.pdf' && file.mimetype === 'application/pdf';
        const valid = validCover || validPdf;
        cb(valid ? null : new Error('Only JPG, PNG, WebP images and PDF files are allowed.'), valid);
    }
});

export default upload;

const uploadedFiles = req => Object.values(req.files || {}).flat();

export const removeUploadedFiles = async req => {
    await Promise.all(uploadedFiles(req).map(file => fs.promises.unlink(file.path).catch(() => {})));
};

export const validateUploadedSizes = async (req, res, next) => {
    if (uploadedFiles(req).some(file => file.size > MAX_UPLOAD_SIZE)) {
        await removeUploadedFiles(req);
        return res.status(413).json({
            success: false,
            message: 'File size must not exceed 35 MB.'
        });
    }
    next();
};

export const validateUploadedSignatures = async (req, res, next) => {
    try {
        for (const file of uploadedFiles(req)) {
            const handle = await fs.promises.open(file.path, 'r');
            const buffer = Buffer.alloc(12);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            await handle.close();
            const bytes = buffer.subarray(0, bytesRead);
            const isPdf = file.fieldname === 'book_pdf' && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
            const isJpeg = file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
            const isPng = file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
            const isWebp = file.mimetype === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
            if (!(isPdf || isJpeg || isPng || isWebp)) {
                await removeUploadedFiles(req);
                return res.status(400).json({ message: 'The uploaded file content does not match its declared type.' });
            }
        }
        next();
    } catch (error) {
        await removeUploadedFiles(req);
        next(error);
    }
};
