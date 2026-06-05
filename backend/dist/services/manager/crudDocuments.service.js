import pool from "../../config/db.js";
import fs from "fs";
import { IngestionService } from "../ingest/ingestion.service.js";
export class DocumentService {
    static async create(companyId, uploadedBy, metadata, file) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(`
      INSERT INTO documents (
        company_id,
        title,
        file_name,
        file_path,
        uploaded_by,
        document_type,
        tags
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `, [
                companyId,
                metadata.title,
                file.filename,
                file.path,
                uploadedBy,
                metadata.document_type,
                metadata.tags,
            ]);
            const document = result.rows[0];
            for (const departmentId of metadata.department_ids) {
                await client.query(`
        INSERT INTO document_departments (
          document_id,
          department_id
        )
        VALUES ($1,$2)
        `, [document.id, departmentId]);
            }
            await client.query("COMMIT");
            await IngestionService.ingestDocument(document.title, document.document_type, document.tags || [], companyId, metadata.department_ids, document.id, uploadedBy, document.created_at.toISOString(), document.file_path);
            return document;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    static async getAllDocuments(companyId) {
        const result = await pool.query("SELECT * FROM documents WHERE company_id = $1 ORDER BY created_at DESC", [companyId]);
        return result.rows;
    }
    static async getDocumentById(companyId, id) {
        const result = await pool.query("SELECT * FROM documents WHERE id = $1 AND company_id = $2", [id, companyId]);
        return result.rows[0] || null;
    }
    static async updateDocument(companyId, id, title, file) {
        const existing = await pool.query("SELECT * FROM documents WHERE id = $1 AND company_id = $2", [id, companyId]);
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
        const updated = await pool.query(`
    UPDATE documents
    SET title = $1,
        file_name = $2,
        file_path = $3
    WHERE id = $4
      AND company_id = $5
    RETURNING *
    `, [title || doc.title, fileName, filePath, id, companyId]);
        return updated.rows[0];
    }
    static async deleteDocument(companyId, id) {
        const existing = await pool.query("SELECT * FROM documents WHERE id = $1 AND company_id = $2", [id, companyId]);
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
