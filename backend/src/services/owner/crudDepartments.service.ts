import pool from "../../config/db.js";

import { CreateDepartment } from "../../types/Department.types.js";

function mapDepartmentRow(row: any) {
  return {
    // ...row,
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DepartmentService {
  static async create(companyId: string, data: CreateDepartment){
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const departmentResult = await client.query(
            `
                INSERT INTO departments(
                    company_id,
                    name,
                    description,
                    created_at,
                    updated_at
                )
                VALUES(
                    $1,
                    $2,
                    $3,
                    NOW(),
                    NOW()
                )
                RETURNING id,name,description
            `,
            [companyId,data.name,data.description]
        );
        await client.query("COMMIT");
        return{
            departmentID:departmentResult.rows[0]
        }
    } catch (error:any) {
        await client.query("ROLLBACK");
        if(error.code === "23505"){
            throw new Error("DEPARTMENT_EXISTS");
        }
        throw error;
    }finally{
        client.release();
    }

  }

//   ======================================== getAll
  static async getAll(companyId:string){

    const {rows} = await pool.query(
        `SELECT * 
         FROM departments
         WHERE company_id = $1
         ORDER BY name;
        `,
        [companyId]
    )
    return rows.map(mapDepartmentRow);
  }




}
