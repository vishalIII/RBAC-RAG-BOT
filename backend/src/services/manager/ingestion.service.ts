import { spawn } from "child_process";

export class IngestionService {
  static async ingestDocument(
    documentId: string,
    filePath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {

      const pythonProcess = spawn(
        "python",
        [
          "src/python/ingest.py",
          filePath,
          documentId,
        ]
      );

      pythonProcess.stdout.on(
        "data",
        (data) => {
          console.log(
            `[INGEST]: ${data.toString()}`
          );
        }
      );

      pythonProcess.stderr.on(
        "data",
        (data) => {
          console.error(
            `[INGEST ERROR]: ${data.toString()}`
          );
        }
      );

      pythonProcess.on(
        "close",
        (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `Ingestion failed with code ${code}`
              )
            );
          }
        }
      );

      pythonProcess.on(
        "error",
        (error) => {
          reject(error);
        }
      );
    });
  }
}