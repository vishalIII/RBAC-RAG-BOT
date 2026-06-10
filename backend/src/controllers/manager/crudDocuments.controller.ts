import { Request, Response } from "express";
import { DocumentService } from "../../services/manager/crudDocuments.service.js";
import { sendError } from "../../utils/response.js";
export class DocumentController {
  static async create(req: Request, res: Response) {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId || !userId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "File required",
        });
      }

      if (!req.body.metadata) {
        return sendError(res, "Metadata is required", 400);
      }

      let metadata;
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch (e) {
        return sendError(res, "Invalid metadata JSON", 400);
      }

      const { title, document_type, tags, department_ids } = metadata;

      if (!title) {
        return sendError(res, "Title is required", 400);
      }

      if (
        !department_ids ||
        !Array.isArray(department_ids) ||
        department_ids.length === 0
      ) {
        return sendError(
          res,
          "department_ids is required and must be an array and non-empty",
          400,
        );
      }

      const document = await DocumentService.create(
        companyId,
        userId,
        metadata,
        req.file,
      );

      return res.status(201).json(document);
    } catch (error: any) {
      console.error(error);

      return res.status(500).json({
        message: error.message,
        detail: error.detail,
        code: error.code,
      });
    }
  }

  static async getAll(req: Request, res: Response) {
    try {
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const documents = await DocumentService.getAllDocuments(companyId);

      return res.json(documents);
    } catch (error) {
      return res.status(500).json(error);
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!companyId) {
        res.status(401).json({
          message: "Unauthorized",
        });
        return;
      }

      const document = await DocumentService.getDocumentById(companyId, id);

      if (!document) {
        res.status(404).json({
          message: "Document not found",
        });
        return;
      }

      res.json(document);
      return;
    } catch (error) {
      res.status(500).json(error);
    }
  }

  static async update(req: Request, res: Response) {
  try {
    const companyId = req.user?.companyId;
    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!companyId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    let metadata: {
      title?: string;
      document_type?: string;
      tags?: string[];
      department_ids?: string[];
    } = {};

    if (req.body.metadata) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch (error) {
        return res.status(400).json({
          message: "Invalid metadata JSON",
        });
      }
    }

    const document = await DocumentService.updateDocument(
      companyId,
      id,
      metadata,
      req.file as Express.Multer.File | undefined,
    );

    if (!document) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    return res.json(document);
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      message: error.message,
      detail: error.detail,
      code: error.code,
    });
  }
}

  static async remove(req: Request, res: Response) {
    try {
      const companyId = req.user?.companyId;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!companyId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const deleted = await DocumentService.deleteDocument(companyId, id);

      if (!deleted) {
        return res.status(404).json({
          message: "Document not found",
        });
      }

      return res.json({
        message: "Document deleted successfully",
      });
    } catch (error) {
      return res.status(500).json(error);
    }
  }
}
