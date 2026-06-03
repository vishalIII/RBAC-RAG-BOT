import multer from "multer";
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, "uploads/");
    },
    filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
export const upload = multer({
    storage,
    // Use .fields() to accept file + other form fields
    // This prevents "Unexpected field" errors when sending title + file
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
    },
});
