import { Router } from "express";
import multer from "multer";
import { DocumentController } from "../../controllers/manager/crudDocuments.controller.js";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "uploads/");
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

// Accept any file field to avoid "Unexpected field" errors from clients
// Normalize to `req.file` so controllers can remain unchanged
const singleFileUpload = uploadMiddleware.any();

const router = Router();

router.post(
  "/",
  singleFileUpload,
  (req, res, next) => {
    // If multer returns an array (from .any()), pick the first file
    if (req.files && Array.isArray(req.files) && (req.files as Express.Multer.File[]).length > 0) {
      (req as any).file = (req.files as Express.Multer.File[])[0];
    }
    next();
  },
  DocumentController.create
);

router.get(
  "/",
  DocumentController.getAll
);

router.get(
  "/:id",
  DocumentController.getById
);

router.put(
  "/:id",
  singleFileUpload,
  (req, res, next) => {
    if (req.files && Array.isArray(req.files) && (req.files as Express.Multer.File[]).length > 0) {
      (req as any).file = (req.files as Express.Multer.File[])[0];
    }
    next();
  },
  DocumentController.update
);

router.delete(
  "/:id",
  DocumentController.remove
);

export default router;