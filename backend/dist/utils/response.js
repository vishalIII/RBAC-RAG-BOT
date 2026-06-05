export const sendSuccess = (res, message, data, statusCode = 200) => {
    return res.status(statusCode).json({
        message,
        data,
    });
};
export const sendError = (res, message, statusCode = 400) => {
    return res.status(statusCode).json({
        message,
    });
};
