import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class IngestionService {
    static async ingestDocument(documentId, filePath) {
        return new Promise((resolve, reject) => {
            console.log("Before spawn");
            const pythonScriptPath = join(__dirname, "../../python_rag/ingest.py");
            const pythonProcess = spawn("python", [
                pythonScriptPath,
                filePath,
                documentId,
            ]);
            console.log("cwd =", process.cwd());
            console.log("atleast here");
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
