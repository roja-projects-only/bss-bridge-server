/**
 * Property-Based Tests for API Key Authentication
 * 
 * Tests universal properties that should hold across all valid inputs:
 * - Property 9: API Key Validation
 */

const fc = require('fast-check');
const { createApiKeyMiddleware, validateApiKey, generateApiKey } = require('../lib/auth');

describe('API Key Authentication Property Tests', () => {
    
    /**
     * Property 9: API Key Validation
     * For any request to the bridge server when an API key is configured, 
     * requests without a valid API key should be rejected with 401 status.
     * 
     * Validates: Requirements 8.1, 8.4
     */
    describe('Property 9: API Key Validation', () => {
        test('should reject requests with invalid API keys when key is required', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 16, maxLength: 64 }), // validApiKey
                fc.string({ minLength: 1, maxLength: 64 }), // invalidApiKey
                (validApiKey, invalidApiKey) => {
                    // Ensure the invalid key is actually different from valid key
                    fc.pre(validApiKey !== invalidApiKey);
                    
                    // Create middleware with required API key
                    const middleware = createApiKeyMiddleware({
                        apiKey: validApiKey,
                        required: true
                    });
                    
                    // Mock Express request/response objects
                    const req = {
                        headers: {
                            'x-api-key': invalidApiKey
                        }
                    };
                    
                    let responseStatus = null;
                    let responseBody = null;
                    let nextCalled = false;
                    
                    const res = {
                        status: (code) => {
                            responseStatus = code;
                            return {
                                json: (body) => {
                                    responseBody = body;
                                }
                            };
                        }
                    };
                    
                    const next = () => {
                        nextCalled = true;
                    };
                    
                    // Execute middleware
                    middleware(req, res, next);
                    
                    // Should reject with 401 status
                    expect(responseStatus).toBe(401);
                    expect(responseBody.success).toBe(false);
                    expect(responseBody.error).toBe('INVALID_API_KEY');
                    expect(nextCalled).toBe(false);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should accept requests with valid API keys', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 16, maxLength: 64 }), // apiKey
                (apiKey) => {
                    // Create middleware with API key
                    const middleware = createApiKeyMiddleware({
                        apiKey: apiKey,
                        required: true
                    });
                    
                    // Mock Express request with valid API key
                    const req = {
                        headers: {
                            'x-api-key': apiKey
                        }
                    };
                    
                    let responseStatus = null;
                    let nextCalled = false;
                    
                    const res = {
                        status: (code) => {
                            responseStatus = code;
                            return {
                                json: (body) => {}
                            };
                        }
                    };
                    
                    const next = () => {
                        nextCalled = true;
                    };
                    
                    // Execute middleware
                    middleware(req, res, next);
                    
                    // Should accept and call next()
                    expect(responseStatus).toBeNull();
                    expect(nextCalled).toBe(true);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should reject requests with missing API keys when required', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 16, maxLength: 64 }), // apiKey
                (apiKey) => {
                    // Create middleware with required API key
                    const middleware = createApiKeyMiddleware({
                        apiKey: apiKey,
                        required: true
                    });
                    
                    // Mock Express request without API key
                    const req = {
                        headers: {}
                    };
                    
                    let responseStatus = null;
                    let responseBody = null;
                    let nextCalled = false;
                    
                    const res = {
                        status: (code) => {
                            responseStatus = code;
                            return {
                                json: (body) => {
                                    responseBody = body;
                                }
                            };
                        }
                    };
                    
                    const next = () => {
                        nextCalled = true;
                    };
                    
                    // Execute middleware
                    middleware(req, res, next);
                    
                    // Should reject with 401 status
                    expect(responseStatus).toBe(401);
                    expect(responseBody.success).toBe(false);
                    expect(responseBody.error).toBe('MISSING_API_KEY');
                    expect(nextCalled).toBe(false);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should accept all requests when API key is not required (dev mode)', () => {
            fc.assert(fc.property(
                fc.option(fc.string({ minLength: 1, maxLength: 64 })), // optionalApiKey
                (optionalApiKey) => {
                    // Create middleware with API key not required
                    const middleware = createApiKeyMiddleware({
                        apiKey: 'some-key',
                        required: false
                    });
                    
                    // Mock Express request with or without API key
                    const req = {
                        headers: optionalApiKey ? { 'x-api-key': optionalApiKey } : {}
                    };
                    
                    let responseStatus = null;
                    let nextCalled = false;
                    
                    const res = {
                        status: (code) => {
                            responseStatus = code;
                            return {
                                json: (body) => {}
                            };
                        }
                    };
                    
                    const next = () => {
                        nextCalled = true;
                    };
                    
                    // Execute middleware
                    middleware(req, res, next);
                    
                    // Should accept and call next() regardless of API key
                    expect(responseStatus).toBeNull();
                    expect(nextCalled).toBe(true);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should validate API keys correctly with direct validation function', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 16, maxLength: 64 }), // expectedKey
                fc.string({ minLength: 1, maxLength: 64 }), // providedKey
                (expectedKey, providedKey) => {
                    const isValid = validateApiKey(providedKey, expectedKey);
                    
                    // Should be valid only if keys match exactly
                    if (providedKey === expectedKey) {
                        expect(isValid).toBe(true);
                    } else {
                        expect(isValid).toBe(false);
                    }
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should accept any key when no expected key is configured', () => {
            fc.assert(fc.property(
                fc.option(fc.string({ minLength: 1, maxLength: 64 })), // providedKey
                (providedKey) => {
                    const isValid = validateApiKey(providedKey, null);
                    
                    // Should always be valid when no key is expected
                    expect(isValid).toBe(true);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should reject missing keys when expected key is configured', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 16, maxLength: 64 }), // expectedKey
                (expectedKey) => {
                    const isValid = validateApiKey(null, expectedKey);
                    
                    // Should be invalid when key is expected but not provided
                    expect(isValid).toBe(false);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should generate unique API keys', () => {
            fc.assert(fc.property(
                fc.integer({ min: 16, max: 64 }), // keyLength
                (keyLength) => {
                    const key1 = generateApiKey(keyLength);
                    const key2 = generateApiKey(keyLength);
                    
                    // Keys should be different
                    expect(key1).not.toBe(key2);
                    
                    // Keys should have correct length (hex encoding doubles byte length)
                    expect(key1.length).toBe(keyLength * 2);
                    expect(key2.length).toBe(keyLength * 2);
                    
                    // Keys should be valid hex strings
                    expect(key1).toMatch(/^[0-9a-f]+$/);
                    expect(key2).toMatch(/^[0-9a-f]+$/);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
    });
});