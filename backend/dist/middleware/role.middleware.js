export const authorize = (...roles) => (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            message: "Unauthorized",
        });
        return;
    }
    if (!roles.includes(req.user.role)) {
        res.status(403).json({
            message: "Forbidden",
        });
        return;
    }
    next();
};
