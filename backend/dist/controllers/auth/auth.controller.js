import { AuthService } from "../../services/auth/auth.service.js";
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function sendValidationError(res, message) {
    res.status(400).json({ message });
}
export class AuthController {
    static async register(req, res) {
        try {
            const { company_name, email, password } = req.body;
            if (!isNonEmptyString(company_name) ||
                !isNonEmptyString(email) ||
                !isNonEmptyString(password)) {
                sendValidationError(res, "company_name, email, and password are required");
                return;
            }
            const result = await AuthService.register(req.body);
            res.status(201).json(result);
        }
        catch (error) {
            if (error instanceof Error &&
                error.message === "EMAIL_EXISTS") {
                res.status(409).json({
                    message: "Email already registered",
                });
                return;
            }
            console.error("Registration failed w:", error);
            res.status(500).json({
                message: "Registration failed w",
            });
        }
    }
    static async login(req, res) {
        try {
            const { email, password, user_type } = req.body;
            if (!isNonEmptyString(email) ||
                !isNonEmptyString(password) ||
                !["platform_admin", "company_user"].includes(user_type)) {
                sendValidationError(res, "email, password, and valid user_type are required");
                return;
            }
            const result = await AuthService.login(req.body);
            res.json(result);
        }
        catch (error) {
            if (error instanceof Error &&
                error.message === "INVALID_CREDENTIALS") {
                res.status(401).json({
                    message: "Invalid credentials",
                });
                return;
            }
            if (error instanceof Error &&
                error.message === "ACCOUNT_DISABLED") {
                res.status(403).json({
                    message: "Account disabled",
                });
                return;
            }
            res.status(500).json({
                message: "Login failed",
            });
        }
    }
    static async refresh(req, res) {
        try {
            if (!isNonEmptyString(req.body.refresh_token)) {
                sendValidationError(res, "refresh_token is required");
                return;
            }
            const result = await AuthService.refresh(req.body.refresh_token);
            res.json(result);
        }
        catch {
            res.status(401).json({
                message: "Invalid refresh token",
            });
        }
    }
}
