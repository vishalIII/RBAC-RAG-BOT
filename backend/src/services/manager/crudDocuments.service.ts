import pool from "../../config/db.js";
import fs from "fs";
import { IngestionService } from "../ingest/ingestion.service.js";

export class DocumentService {
  static async create(
    companyId: string,
    createdBy: string,
    title: string,
    file: Express.Multer.File
  ) {
    const result = await pool.query(
      `INSERT INTO documents (company_id, title, file_name, file_path, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *
            `,
      [companyId, title, file.filename, file.path, createdBy],
    );

    const document = result.rows[0];
    await IngestionService.ingestDocument(document.id, file.path).catch(
      console.error,
    );

    return document;
  }

  static async getAllDocuments(companyId: string) {
    const result = await pool.query(
      "SELECT * FROM documents WHERE company_id = $1 ORDER BY created_at DESC",
      [companyId],
    );

    return result.rows;
  }

  static async getDocumentById(companyId: string, id: string) {
    const result = await pool.query("SELECT * FROM documents WHERE id = $1 AND company_id = $2", [
      id,
      companyId,
    ]);

    return result.rows[0] || null;
  }

  static async updateDocument(
    companyId: string,
    id: string,
    title?: string,
    file?: Express.Multer.File,
  ) {
    const existing = await pool.query("SELECT * FROM documents WHERE id = $1 AND company_id = $2", [
      id,
      companyId,
    ]);

    if (!existing.rows.length) {
      return null;
    }

    const doc = existing.rows[0];

    let fileName = doc.file_name;
    let filePath = doc.file_path;

    if (file) {
      if (fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path);
      }

      fileName = file.filename;
      filePath = file.path;
    }

    const updated = await pool.query(
      `
    UPDATE documents
    SET title = $1,
        file_name = $2,
        file_path = $3
    WHERE id = $4
      AND company_id = $5
    RETURNING *
    `,
      [title || doc.title, fileName, filePath, id, companyId],
    );

    return updated.rows[0];
  }

  static async deleteDocument(companyId: string, id: string) {
    const existing = await pool.query("SELECT * FROM documents WHERE id = $1 AND company_id = $2", [
      id,
      companyId,
    ]);

    if (!existing.rows.length) {
      return false;
    }

    const doc = existing.rows[0];

    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }

    await pool.query("DELETE FROM documents WHERE id = $1 AND company_id = $2", [id, companyId]);

    return true;
  }
}
