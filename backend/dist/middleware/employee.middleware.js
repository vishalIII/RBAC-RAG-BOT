import pool from "../config/db.js";
export const loadEmployee = async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
            return;
        }
        const result = await pool.query(`
      SELECT *
      FROM employees
      WHERE user_id = $1
      `, [req.user.id]);
        // console.log("employee rows =", result.rows);
        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                message: "Employee record not found",
            });
            return;
        }
        req.employee = result.rows[0];
        console.log("employee row ", req?.employee);
        next();
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Failed to load employee",
        });
    }
};
