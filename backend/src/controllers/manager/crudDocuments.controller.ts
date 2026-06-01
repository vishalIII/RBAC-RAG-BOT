import { Request, Response } from "express";
import { DocumentService } from "../../services/manager/crudDocuments.service.js";

export class DocumentController {
  static async create(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "File required",
        });
      }

      const document = await DocumentService.create(req.body.title, req.file);

      return res.status(201).json(document);
    } catch (error) {
      return res.status(500).json(error);
    }
  }

  static async getAll(_req: Request, res: Response) {
    try {
      const documents = await DocumentService.getAllDocuments();

      return res.json(documents);
    } catch (error) {
      return res.status(500).json(error);
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
     
      const document = await DocumentService.getDocumentById(id);

      if (!document) {
         res.status(404).json({
          message: "Document not found",
        });
        return  
      }

      res.json(document);
      return
    } catch (error) {
       res.status(500).json(error);
    }
  }

  static async update (req: Request, res: Response){
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const document = await DocumentService.updateDocument(
        id,
        req.body.title,
        req.file as Express.Multer.File | undefined,
      );

      if (!document) {
        return res.status(404).json({
          message: "Document not found",
        });
      }

      return res.json(document);
    } catch (error) {
      return res.status(500).json(error);
    }
  };

  static async remove (req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const deleted = await DocumentService.deleteDocument(id);

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
  };
}
