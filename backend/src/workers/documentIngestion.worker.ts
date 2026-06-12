import { Worker } from "bullmq";
// const connection = require("../config/redis.js");
import { connection } from  "../config/redis.js";
import pool from "../config/db.js";
import { IngestionService } from "../services/ingest/ingestion.service.js";

const worker = new Worker(
  "document-ingestion",
  async (job) => {
    console.log(`[WORKER] Processing job ${job.id} for document ${job.data.documentId}`);
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
    } = job.data;

    try {

      await IngestionService.ingestDocument(
        filePath,
        title,
        documentType,
        tags,
        departmentIds,
        companyId,
        uploadedBy,
        typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString(),
        documentId
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
        [documentId]
      );

      console.log(`[WORKER] Successfully ingested document ${documentId}`);
    //   return result.rows[0];
    } catch (error) {
      console.error(`[WORKER ERROR] Job ${job.id} failed:`, error);
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
            : "Unknown error"
        ]
      );

      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[WORKER] Job ${job?.id} failed with error: ${err.message}`);
});

console.log("[WORKER] Document Ingestion Worker started and listening to 'document-ingestion' queue");