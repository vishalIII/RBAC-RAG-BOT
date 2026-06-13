import pool from "../../config/db.js";
// import fs from "fs";
// import { IngestionService } from "../ingest/ingestion.service.js";

// import { QdrantClient } from "@qdrant/js-client-rest";
import { documentIngestionQueue } from "../../queues/documentIngestion.queue.js";

// const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
// const COLLECTION = process.env.QDRANT_COLLECTION; //  collection name

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

      let result = await client.query(
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
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      'processing'
    )
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
          metadata.tags || [],
        ],
      );

      let document = result.rows[0];

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

      // Add ingestion job to the background queue.
      // The background worker (documentIngestion.worker.ts) is responsible
      // for updating status to 'ready' or 'failed' once the Python script finishes.
      await documentIngestionQueue.add("document-ingestion", {
        documentId: document.id,
        filePath: document.file_path,
        title: document.title,
        documentType: document.document_type,
        tags: document.tags,
        departmentIds: metadata.department_ids,
        companyId,
        uploadedBy,
        createdAt: document.created_at,
        active: true, // New documents are active by default
      });

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
    data: {
      title?: string;
      document_type?: string;
      tags?: string[];
      department_ids?: string[];
      active?: boolean;
    },
    file?: Express.Multer.File,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT * FROM documents
       WHERE id = $1 AND company_id = $2`,
        [id, companyId],
      );

      if (!existing.rows.length) {
        await client.query("ROLLBACK");
        return null;
      }

      const doc = existing.rows[0];

      const title = data.title ?? doc.title;
      const documentType = data.document_type ?? doc.document_type;
      const tags = data.tags ?? doc.tags ?? [];

      let fileName = doc.file_name;
      let filePath = doc.file_path;
      let fileSize = doc.file_size;
      let mimeType = doc.mime_type;

      if (file) {
        fileName = file.filename;
        filePath = file.path;
        fileSize = file.size;
        mimeType = file.mimetype;
      }

      const result = await client.query(
        `
      UPDATE documents
      SET
        title = $1,
        document_type = $2,
        tags = $3,
        file_name = $4,
        file_path = $5,
        file_size = $6,
        mime_type = $7,
        active = false,
        status = 'processing',
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
      `,
        [
          title,
          documentType,
          tags,
          fileName,
          filePath,
          fileSize,
          mimeType,
          id,
        ],
      );

      if (data.department_ids) {
        await client.query("DELETE FROM document_departments WHERE document_id = $1", [id]);
        for (const deptId of data.department_ids) {
          await client.query(
            "INSERT INTO document_departments (document_id, department_id) VALUES ($1, $2)",
            [id, deptId]
          );
        }
      }

      await client.query("COMMIT");

      await documentIngestionQueue.add("document-update", {
        documentId: id,
        companyId,
        oldFilePath: doc.file_path,
        newFileUploaded: !!file,
      });

      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Failed to re-ingest document ${id}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  // async function deleteDocument(documentId: string, tenantId: string) {
  //   // 1. Delete from SQL
  //   await db.query(
  //     `DELETE FROM documents WHERE id = $1 AND tenant_id = $2`,
  //     [documentId, tenantId]
  //   );

  //   // 2. Delete all vectors for this document from Qdrant
  //   await qdrant.delete(COLLECTION, {
  //     filter: {
  //       must: [
  //         { key: "document_id", match: { value: documentId } },
  //         { key: "tenant_id",   match: { value: tenantId } },   // important for multi-tenant
  //       ],
  //     },
  //   });
  // }

  static async deleteDocument(companyId: string, documentId: string) {
    try {
      const existing = await pool.query(
        `SELECT * FROM documents
       WHERE id = $1 AND company_id = $2`,
        [documentId, companyId],
      );

      if (!existing.rows.length) {
        return null;
      }
      await pool.query(
               `
         UPDATE documents
         SET
           active = false,
           status = 'processing',
           updated_at = NOW()
         WHERE id = $1
         `,
        [documentId],
      );

      await documentIngestionQueue.add("document-delete", {
        documentId,
        companyId,
      });

      return true;
    } catch (error) {
      console.error(`Failed to re-ingest document ${documentId}`, error);
      throw error;
    }
  }
}
