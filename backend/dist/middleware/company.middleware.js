export const requireCompany = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            message: "Unauthorized",
        });
        return;
    }
    if (req.user.userType === "company_user" &&
        !req.user.companyId) {
        res.status(403).json({
            message: "Company not assigned",
        });
        return;
    }
    next();
};
