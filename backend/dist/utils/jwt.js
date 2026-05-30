import jwt from "jsonwebtoken";
const ISSUER = "multi-tenant-api";
function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}
function tokenLifetime(name, fallback) {
    return (process.env[name] ?? fallback);
}
const accessSecret = () => requiredEnv("JWT_ACCESS_SECRET");
const refreshSecret = () => requiredEnv("JWT_REFRESH_SECRET");
export const signAccessToken = (payload) => jwt.sign(payload, accessSecret(), {
    expiresIn: tokenLifetime("JWT_ACCESS_EXPIRES_IN", "15m"),
    issuer: ISSUER,
});
export const signRefreshToken = (payload) => jwt.sign(payload, refreshSecret(), {
    expiresIn: tokenLifetime("JWT_REFRESH_EXPIRES_IN", "7d"),
    issuer: ISSUER,
});
export const verifyAccessToken = (token) => jwt.verify(token, accessSecret(), { issuer: ISSUER });
export const verifyRefreshToken = (token) => jwt.verify(token, refreshSecret(), { issuer: ISSUER });
