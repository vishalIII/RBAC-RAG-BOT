import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class IngestionService {
  static async ingestDocument(
    filePath: string,
    title: string,
    document_type: string,
    tags: string[],
    department_ids: string[],
    company_id: string,
    uploadedBy: string,
    created_at: string,
    documentId: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Resolve path to python script relative to project root
      // Assuming project structure: backend/src/python_rag/ingest.py
      const rootDir = join(__dirname, "../../../"); 
      const pythonScriptPath = join(rootDir, "src", "python_rag", "ingest.py");
      
      // Use the virtual env python path. Note: Use 'python' for Linux/macOS or 'python.exe' for Windows
      const isWindows = process.platform === "win32";
      const pythonExecutable = isWindows 
        ? join(rootDir, ".venv", "Scripts", "python.exe")
        : join(rootDir, ".venv", "bin", "python");

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
        String(created_at),
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
        } else {
          reject(new Error(`Ingestion failed with code ${code}`));
        }
      });

      pythonProcess.on("error", (error) => {
        reject(error);
      });
    });
  }
}
