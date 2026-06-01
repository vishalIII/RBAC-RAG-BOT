import pool from "../../config/db.js";
import fs from "fs";

export class DocumentService {
  static async create(title: string, file: Express.Multer.File) {
    const result = await pool.query(
      `INSERT INTO DOCUMENTS (title, file_name, file_path) VALUES ($1, $2, $3) RETURNING *
            `,
      [title, file.filename, file.path],
    );

    return result.rows[0];
  }

  static async getAllDocuments() {
    const result = await pool.query(
      "SELECT * FROM documents ORDER BY created_at DESC",
    );

    return result.rows;
  }

  static async getDocumentById(id: string) {
    const result = await pool.query("SELECT * FROM documents WHERE id = $1", [
      id,
    ]);

    return result.rows[0] || null;
  }

  static async updateDocument(
    id: string,
    title?: string,
    file?: Express.Multer.File,
  ) {
    const existing = await pool.query("SELECT * FROM documents WHERE id = $1", [
      id,
    ]);

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

    const updated = await pool.query(
      `
    UPDATE documents
    SET title = $1,
        file_name = $2,
        file_path = $3
    WHERE id = $4
    RETURNING *
    `,
      [title || doc.title, fileName, filePath, id],
    );

    return updated.rows[0];
  }

  static async deleteDocument(id: string) {
    const existing = await pool.query("SELECT * FROM documents WHERE id = $1", [
      id,
    ]);

    if (!existing.rows.length) {
      return false;
    }

    const doc = existing.rows[0];

    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }

    await pool.query("DELETE FROM documents WHERE id = $1", [id]);

    return true;
  }
}
