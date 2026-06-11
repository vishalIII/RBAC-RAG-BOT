import { spawn } from "child_process";
import { join } from "path";
export class IngestionService {
    static async ingestDocument(filePath, title, document_type, tags, department_ids, company_id, uploadedBy, created_at, documentId) {
        return new Promise((resolve, reject) => {
            const rootDir = process.cwd();
            const pythonScriptPath = join(rootDir, "src/python_rag/ingest.py");
            // Use the virtual env python path from your package.json
            const pythonExecutable = join(rootDir, ".venv/Scripts/python.exe");
            console.log(`[INGEST] Spawning Python for: ${title} (${documentId})`);
            const pythonProcess = spawn(pythonExecutable, [
                pythonScriptPath,
                filePath,
                title,
                document_type,
                JSON.stringify(tags),
                JSON.stringify(department_ids),
                company_id,
                uploadedBy,
                created_at,
                documentId,
            ]);
            pythonProcess.stdout.on("data", (data) => {
                console.log(`[INGEST]: ${data.toString()}`);
            });
            pythonProcess.stderr.on("data", (data) => {
                console.error(`[INGEST ERROR]: ${data.toString()}`);
            });
            pythonProcess.on("close", (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error(`Ingestion failed with code ${code}`));
                }
            });
            pythonProcess.on("error", (error) => {
                reject(error);
            });
        });
    }
}
