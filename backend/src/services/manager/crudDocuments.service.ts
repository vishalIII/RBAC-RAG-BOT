import pool from "../../config/db.js";
import fs from "fs";
import { IngestionService } from "../ingest/ingestion.service.js";

import { QdrantClient } from "@qdrant/js-client-rest";

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
const COLLECTION = process.env.QDRANT_COLLECTION; //  collection name

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
        tags
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
        document.file_path, // 1. filePath
        document.title, // 2. title
        document.document_type, // 3. document_type
        document.tags || [], // 4. tags
        metadata.department_ids || [], // 5. department_ids
        companyId, // 6. company_id
        uploadedBy, // 7. uploadedBy
        document.created_at.toISOString(), // 8. created_at
        document.id, // 9. documentId
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
      status = "processing";
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
      [
        title || doc.title,
        fileName,
        filePath,
        fileSize,
        mimeType,
        status,
        id,
        companyId,
      ],
    );

    return updated.rows[0];
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

    if (!COLLECTION) {
      throw new Error("QDRANT_COLLECTION is not defined");
    }

    // BEFORE DELETING
    const points = await qdrant.scroll(COLLECTION, {
      filter: {
        must: [
          {
            key: "metadata.document_id",
            match: {
              value: id,
            },
          },
        ],
      },
      limit: 100,
    });

    console.log(`Found ${points.points.length} chunks for document ${id}`);

    const deleteResult = await qdrant.delete(COLLECTION, {
      wait: true,
      filter: {
        must: [
          {
            key: "metadata.document_id",
            match: {
              value: id,
            },
          },
          {
            key: "metadata.company_id",
            match: {
              value: companyId,
            },
          },
        ],
      },
    });

    console.log(deleteResult);

    return true;
  }
}
