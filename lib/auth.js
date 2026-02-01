/**
 * API Key Authentication Middleware
 * 
 * Provides Express middleware for validating API keys:
 * - Validates X-API-Key header
 * - Supports optional API key (dev mode)
 * - Returns 401 for invalid/missing keys when required
 */

/**
 * Create API key authentication middleware
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Required API key (from env var)
 * @param {boolean} options.required - Whether API key is required (default: true)
 * @returns {Function} Express middleware function
 */
function createApiKeyMiddleware(options = {}) {
    const {
        apiKey = process.env.API_KEY,
        required = true
    } = options;
    
    return (req, res, next) => {
        // If no API key is configured and not required, allow all requests (dev mode)
        if (!apiKey && !required) {
            return next();
        }
        
        // If API key is configured but not required, still validate if provided
        const providedKey = req.headers['x-api-key'];
        
        // If API key is required but not configured, return error
        if (required && !apiKey) {
            return res.status(500).json({
                success: false,
                error: 'SERVER_MISCONFIGURED',
                message: 'API key authentication is required but not configured'
            });
        }
        
        // If API key is required but not provided
        if (required && !providedKey) {
            return res.status(401).json({
                success: false,
                error: 'MISSING_API_KEY',
                message: 'API key is required. Provide X-API-Key header.'
            });
        }
        
        // If API key is provided, validate it
        if (providedKey) {
            if (providedKey !== apiKey) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_API_KEY',
                    message: 'Invalid API key provided'
                });
            }
        }
        
        // API key is valid or not required, proceed
        next();
    };
}

/**
 * Default middleware instance using environment configuration
 */
const apiKeyMiddleware = createApiKeyMiddleware({
    apiKey: process.env.API_KEY,
    required: !!process.env.API_KEY // Required if API_KEY is set
});

/**
 * Development mode middleware (API key optional)
 */
const devApiKeyMiddleware = createApiKeyMiddleware({
    apiKey: process.env.API_KEY,
    required: false
});

/**
 * Validate API key directly (for testing)
 * @param {string} providedKey - API key to validate
 * @param {string} expectedKey - Expected API key
 * @returns {boolean} True if valid
 */
function validateApiKey(providedKey, expectedKey) {
    if (!expectedKey) {
        return true; // No key required
    }
    
    if (!providedKey) {
        return false; // Key required but not provided
    }
    
    return providedKey === expectedKey;
}

/**
 * Generate a secure API key
 * @param {number} length - Length of the key (default: 32)
 * @returns {string} Random API key
 */
function generateApiKey(length = 32) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
}

module.exports = {
    createApiKeyMiddleware,
    apiKeyMiddleware,
    devApiKeyMiddleware,
    validateApiKey,
    generateApiKey
};