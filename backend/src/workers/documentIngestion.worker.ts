import { Worker } from "bullmq";
// const connection = require("../config/redis.js");
import fs from "fs";
import { connection } from "../config/redis.js";
import pool from "../config/db.js";
import { IngestionService } from "../services/ingest/ingestion.service.js";


import { QdrantClient } from "@qdrant/js-client-rest";
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
const COLLECTION = process.env.QDRANT_COLLECTION; //  collection name

const worker = new Worker(
  "document-ingestion",
  async (job) => {
    console.log(
      `[WORKER] Processing job ${job.id} (${job.name}) for document ${job.data.documentId}`,
    );

    switch (job.name) {
      case "document-ingestion":
        return handleIngest(job.data);
      case "document-update":
        return handleUpdate(job.data);
      case "document-delete":
        return handleDelete(job.data);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 3,
  },
);

async function handleIngest(data: any) {
  const {
    documentId,
    filePath,
    title,
    documentType,
    tags,
    departmentIds,
    companyId,
    uploadedBy,
    createdAt,
    active,
  } = data;

  try {
    await IngestionService.ingestDocument(
      filePath,
      title,
      documentType,
      tags,
      departmentIds,
      companyId,
      uploadedBy,
      typeof createdAt === "string"
        ? createdAt
        : new Date(createdAt).toISOString(),
      documentId,
      active ?? true,
    );

    await pool.query(
      `
        UPDATE documents
        SET
          status='ready',
          processed_at=NOW(),
          error_message=NULL,
          updated_at=NOW()
        WHERE id=$1
        RETURNING *
        `,
      [documentId],
    );

    console.log(`[WORKER] Successfully ingested document ${documentId}`);
    //   return result.rows[0];
  } catch (error) {
    // console.error(`[WORKER ERROR] Job ${job.id} failed:`, error);
    await pool.query(
      `
        UPDATE documents
        SET
          status='failed',
          error_message=$2,
          updated_at=NOW()
        WHERE id=$1
        `,
      [documentId, error instanceof Error ? error.message : "Unknown error"],
    );

    throw error;
  }
}

async function handleUpdate(data: any) {
  const {
    documentId,
    companyId,
  } = data;

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM documents
      WHERE id = $1
      AND company_id = $2
      `,
      [documentId, companyId]
    );

    if (!result.rows.length) {
      throw new Error("Document not found");
    }

    const doc = result.rows[0];

    const deptResult = await pool.query(
      `
      SELECT department_id
      FROM document_departments
      WHERE document_id = $1
      `,
      [documentId]
    );

    const departmentIds = deptResult.rows.map(
      (r) => r.department_id
    );

    await qdrant.delete(COLLECTION!, {
      wait: true,
      filter: {
        must: [
          {
            key: "metadata.document_id",
            match: { value: documentId },
          },
          {
            key: "metadata.company_id",
            match: { value: companyId },
          },
        ],
      },
    });

    await IngestionService.ingestDocument(
      doc.file_path,
      doc.title,
      doc.document_type,
      doc.tags || [],
      departmentIds,
      companyId,
      doc.uploaded_by,
      doc.created_at.toISOString(),
      documentId,
      true,
    );

    await pool.query(
      `
      UPDATE documents
      SET
        active = true,
        status = 'ready',
        error_message = NULL,
        processed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [documentId]
    );

    console.log(
      `[WORKER] Successfully updated document ${documentId}`
    );
    // return doc;
  } catch (error) {
    await pool.query(
      `
      UPDATE documents
      SET
        status='failed',
        error_message=$2,
        updated_at=NOW()
      WHERE id=$1
      `,
      [
        documentId,
        error instanceof Error
          ? error.message
          : "Unknown error",
      ]
    );

    throw error;
  }
}

async function handleDelete(data: any) {
  const {
    documentId,
    companyId,
  } = data;

  const result = await pool.query(
    `
    SELECT *
    FROM documents
    WHERE id = $1
    AND company_id = $2
    `,
    [documentId, companyId]
  );

  if (!result.rows.length) {
    return;
  }

  const doc = result.rows[0];

  try {
    await qdrant.delete(COLLECTION!, {
      wait: true,
      filter: {
        must: [
          {
            key: "metadata.document_id",
            match: {
              value: documentId,
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

    if (
      doc.file_path &&
      fs.existsSync(doc.file_path)
    ) {
      fs.unlinkSync(doc.file_path);
    }

    await pool.query(
      `
      DELETE FROM document_departments
      WHERE document_id = $1
      `,
      [documentId]
    );

    await pool.query(
      `
      DELETE FROM documents
      WHERE id = $1
      `,
      [documentId]
    );

    console.log(
      `[WORKER] Successfully deleted document ${documentId}`
    );
  } catch (error) {
    await pool.query(
      `
      UPDATE documents
      SET
        active = false,
        status = 'failed',
        error_message = $2,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        documentId,
        error instanceof Error
          ? error.message
          : "Unknown error",
      ]
    );

    throw error;
  }
}

// const worker = new Worker(
//   "document-ingestion",
//   async (job) => {
//     console.log(`[WORKER] Processing job ${job.id} for document ${job.data.documentId}`);
//     const {
//       documentId,
//       filePath,
//       title,
//       documentType,
//       tags,
//       departmentIds,
//       companyId,
//       uploadedBy,
//       createdAt,
//       active,
//     } = job.data;

//     try {

//       await IngestionService.ingestDocument(
//         filePath,
//         title,
//         documentType,
//         tags,
//         departmentIds,
//         companyId,
//         uploadedBy,
//         typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString(),
//         documentId,
//         active ?? true
//       );

//        await pool.query(
//         `
//         UPDATE documents
//         SET
//           status='ready',
//           processed_at=NOW(),
//           error_message=NULL,
//           updated_at=NOW()
//         WHERE id=$1
//         RETURNING *
//         `,
//         [documentId]
//       );

//       console.log(`[WORKER] Successfully ingested document ${documentId}`);
//     //   return result.rows[0];
//     } catch (error) {
//       console.error(`[WORKER ERROR] Job ${job.id} failed:`, error);
//       await pool.query(
//         `
//         UPDATE documents
//         SET
//           status='failed',
//           error_message=$2,
//           updated_at=NOW()
//         WHERE id=$1
//         `,
//         [
//           documentId,
//           error instanceof Error
//             ? error.message
//             : "Unknown error"
//         ]
//       );

//       throw error;
//     }
//   },
//   {
//     connection,
//     concurrency: 3,
//   }
// );

// worker.on('failed', (job, err) => {
//   console.error(`[WORKER] Job ${job?.id} failed with error: ${err.message}`);
// });

// console.log("[WORKER] Document Ingestion Worker started and listening to 'document-ingestion' queue");
