import pool from "../../config/db.js";
import fs from "fs";
import { IngestionService } from "../ingest/ingestion.service.js";

export class DocumentService {
  static async create(
    companyId: string,
    uploadedBy: string,
    metadata: {
      title: string;
      document_type: string;
      tags: string[];
      department_ids: string[];
    },
    file: Express.Multer.File,
  ) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `
      INSERT INTO documents (
        company_id,
        title,
        file_name,
        file_path,
        file_size,
        mime_type,
        uploaded_by,
        document_type,
        tags,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
        [
          companyId,
          metadata.title,
          file.filename,
          file.path,
          file.size,
          file.mimetype,
          uploadedBy,
          metadata.document_type,
          metadata.tags,
          'processing',
        ],
      );

      const document = result.rows[0];

      for (const departmentId of metadata.department_ids) {
        await client.query(
          `
        INSERT INTO document_departments (
          document_id,
          department_id
        )
        VALUES ($1,$2)
        `,
          [document.id, departmentId],
        );
      }

      await client.query("COMMIT");

      await IngestionService.ingestDocument(
        document.title,
        document.document_type,
        document.tags || [],
        companyId,
        metadata.department_ids,
        document.id,
        uploadedBy,
        document.created_at.toISOString(),
        document.file_path,
      );

      return document;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async getAllDocuments(companyId: string) {
    const result = await pool.query(
      "SELECT * FROM documents WHERE company_id = $1 ORDER BY created_at DESC",
      [companyId],
    );

    return result.rows;
  }

  static async getDocumentById(companyId: string, id: string) {
    const result = await pool.query(
      "SELECT * FROM documents WHERE id = $1 AND company_id = $2",
      [id, companyId],
    );

    return result.rows[0] || null;
  }

  static async updateDocument(
    companyId: string,
    id: string,
    title?: string,
    file?: Express.Multer.File,
  ) {
    const existing = await pool.query(
      "SELECT * FROM documents WHERE id = $1 AND company_id = $2",
      [id, companyId],
    );

    if (!existing.rows.length) {
      return null;
    }

    const doc = existing.rows[0];

    let fileName = doc.file_name;
    let filePath = doc.file_path;
    let fileSize = doc.file_size;
    let mimeType = doc.mime_type;
    let status = doc.status;

    if (file) {
      if (fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path);
      }

      fileName = file.filename;
      filePath = file.path;
      fileSize = file.size;
      mimeType = file.mimetype;
      status = 'processing';
    }

    const updated = await pool.query(
      `
    UPDATE documents
    SET title = $1,
        file_name = $2,
        file_path = $3,
        file_size = $4,
        mime_type = $5,
        status = $6,
        updated_at = NOW()
    WHERE id = $7
      AND company_id = $8
    RETURNING *
    `,
      [title || doc.title, fileName, filePath, fileSize, mimeType, status, id, companyId],
    );

    return updated.rows[0];
  }

  static async deleteDocument(companyId: string, id: string) {
    const existing = await pool.query(
      "SELECT * FROM documents WHERE id = $1 AND company_id = $2",
      [id, companyId],
    );

    if (!existing.rows.length) {
      return false;
    }

    const doc = existing.rows[0];

    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }

    await pool.query(
      "DELETE FROM documents WHERE id = $1 AND company_id = $2",
      [id, companyId],
    );

    return true;
  }
}
