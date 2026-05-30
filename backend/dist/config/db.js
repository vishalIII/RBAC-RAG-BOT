import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "rag_chatbot",
    password: "Vish@l",
    port: 5432,
});
export default pool;
