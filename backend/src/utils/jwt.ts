import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

const ISSUER = "pdf-chatbot-api";

type TokenPayload = Omit<JwtPayload, "iat" | "exp" | "iss">;

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function tokenLifetime(
  name: string,
  fallback: SignOptions["expiresIn"],
): SignOptions["expiresIn"] {
  return (process.env[name] ?? fallback) as SignOptions["expiresIn"];
}

const accessSecret = () => requiredEnv("JWT_ACCESS_SECRET");
const refreshSecret = () => requiredEnv("JWT_REFRESH_SECRET");

export const signAccessToken = (payload: TokenPayload): string =>
  jwt.sign(payload, accessSecret(), {
    expiresIn: tokenLifetime("JWT_ACCESS_EXPIRES_IN", "1d"),
    issuer: ISSUER,
  });

export const signRefreshToken = (payload: TokenPayload): string =>
  jwt.sign(payload, refreshSecret(), {
    expiresIn: tokenLifetime("JWT_REFRESH_EXPIRES_IN", "7d"),
    issuer: ISSUER,
  });

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, accessSecret(), { issuer: ISSUER }) as JwtPayload;

export const verifyRefreshToken = (token: string): JwtPayload =>
  jwt.verify(token, refreshSecret(), { issuer: ISSUER }) as JwtPayload;
