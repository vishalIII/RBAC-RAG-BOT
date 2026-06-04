import { Response } from "express";

export const sendSuccess = (
  res: Response,
  message: string,
  data?: unknown,
  statusCode = 200,
) => {
  return res.status(statusCode).json({
    message,
    data,
  });
};

export const sendError = (
  res: Response,
  message: string,
  statusCode = 400,
) => {
  return res.status(statusCode).json({
    message,
  });
};