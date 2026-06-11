import { Request,Response } from "express";
import { RetrievalAnalytics } from "../../services/manager/crudRetrievalAnalytics.service.js";

export class RetrievalAnalyticsController{
    static async getNoAnswerLogs(req:Request,res:Response){
        try {
            const companyId=req.user?.companyId
            if(!companyId){
                return res.status(401).json({
                    message:"Unauthorized"
                })
            }
            const noAnswerLogs=await RetrievalAnalytics.getNoAnswerLogs(companyId)
            return res.status(200).json(noAnswerLogs)
        } catch (error) {
            return res.status(500).json(error)
        }
    }
}