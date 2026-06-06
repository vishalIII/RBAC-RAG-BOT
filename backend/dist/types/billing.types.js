// ====================================================================
// ERROR TYPES
// ====================================================================
export class LimitExceededError extends Error {
    constructor(companyId, currentUsagePercent, limitType) {
        super(`Usage limit exceeded for company ${companyId}: ${currentUsagePercent}%`);
        this.companyId = companyId;
        this.currentUsagePercent = currentUsagePercent;
        this.limitType = limitType;
        this.name = "LimitExceededError";
    }
}
export class InsufficientTokensError extends Error {
    constructor(companyId, requestedTokens, availableTokens) {
        super(`Insufficient tokens. Requested: ${requestedTokens}, Available: ${availableTokens}`);
        this.companyId = companyId;
        this.requestedTokens = requestedTokens;
        this.availableTokens = availableTokens;
        this.name = "InsufficientTokensError";
    }
}
