import pool from "../../config/db.js";
import fs from "fs";
import { IngestionService } from "../ingest/ingestion.service.js";

import { QdrantClient } from "@qdrant/js-client-rest";
import { documentIngestionQueue } from "../../queues/documentIngestion.queue.js";

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
    },
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
    const oldFilePath = doc.file_path;

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

    const updated = await pool.query(
      `
    UPDATE documents
    SET title = $1,
        document_type = $2,
        tags = $3,
        file_name = $4,
        file_path = $5,
        file_size = $6,
        mime_type = $7,
        updated_at = NOW()
    WHERE id = $8
      AND company_id = $9
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
        companyId,
      ],
    );

    const updatedDoc = updated.rows[0];

    // Update department mappings if supplied
    if (data.department_ids) {
      await pool.query(
        "DELETE FROM document_departments WHERE document_id = $1",
        [id],
      );

      for (const departmentId of data.department_ids) {
        await pool.query(
          `
        INSERT INTO document_departments (
          document_id,
          department_id
        )
        VALUES ($1, $2)
        `,
          [id, departmentId],
        );
      }
    }

    const metadataChanged =
      data.title !== undefined ||
      data.document_type !== undefined ||
      data.tags !== undefined ||
      data.department_ids !== undefined;

    // No need to touch Qdrant
    if (!file && !metadataChanged) {
      return updatedDoc;
    }

    if (!COLLECTION) {
      throw new Error("QDRANT_COLLECTION is not defined");
    }

    const deptResult = await pool.query(
      `
    SELECT department_id
    FROM document_departments
    WHERE document_id = $1
    `,
      [id],
    );

    const departmentIds = deptResult.rows.map((row) => row.department_id);

    try {
      // Delete existing chunks
      await qdrant.delete(COLLECTION, {
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

      // Re-ingest using latest metadata
      await IngestionService.ingestDocument(
        updatedDoc.file_path,
        updatedDoc.title,
        updatedDoc.document_type,
        updatedDoc.tags || [],
        departmentIds,
        companyId,
        updatedDoc.uploaded_by,
        updatedDoc.created_at.toISOString(),
        updatedDoc.id,
      );

      // Remove old physical file only after successful re-ingestion
      if (
        file &&
        oldFilePath &&
        oldFilePath !== updatedDoc.file_path &&
        fs.existsSync(oldFilePath)
      ) {
        fs.unlinkSync(oldFilePath);
      }

      return updatedDoc;
    } catch (error) {
      console.error(`Failed to re-ingest document ${id}`, error);

      throw error;
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
