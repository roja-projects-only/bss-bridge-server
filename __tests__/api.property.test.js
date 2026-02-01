/**
 * Property-Based Tests for API Endpoints
 * 
 * Tests universal properties that should hold across all valid inputs:
 * - Property 1: Command Delivery Guarantee
 * - Property 5: Command Execution Idempotency
 */

const fc = require('fast-check');
const request = require('supertest');
const express = require('express');
const queue = require('../lib/queue');

// Create test app with all endpoints
function createTestApp() {
    const app = express();
    app.use(express.json());
    
    // Import endpoints
    const commandEndpoint = require('../api/command');
    const pollEndpoint = require('../api/poll');
    const completeEndpoint = require('../api/complete');
    const statusEndpoint = require('../api/status');
    
    // Mount endpoints
    app.use('/api/command', commandEndpoint);
    app.use('/api/poll', pollEndpoint);
    app.use('/api/complete', completeEndpoint);
    app.use('/api/status', statusEndpoint);
    
    return app;
}

describe('API Endpoints Property Tests', () => {
    let app;
    
    beforeAll(() => {
        app = createTestApp();
        // Disable API key requirement for testing
        delete process.env.API_KEY;
    });
    
    beforeEach(() => {
        // Clear queue before each test
        queue.clear();
    });
    
    afterAll(() => {
        // Restore API key if it was set
        if (process.env.TEST_API_KEY) {
            process.env.API_KEY = process.env.TEST_API_KEY;
        }
    });
    
    /**
     * Property 1: Command Delivery Guarantee
     * For any command sent by BSS Monitor when the bridge server is reachable, 
     * the command should appear in the server queue within 5 seconds.
     * 
     * Validates: Requirements 1.1, 1.2
     */
    describe('Property 1: Command Delivery Guarantee', () => {
        test('should deliver valid commands to queue successfully', () => {
            return fc.assert(fc.asyncProperty(
                fc.record({
                    type: fc.constantFrom('kick', 'ban'),
                    player: fc.string({ minLength: 1, maxLength: 20 })
                        .filter(s => s.trim().length > 0)
                        .filter(s => /^[a-zA-Z0-9\s]+$/.test(s.trim())), // Only alphanumeric and spaces
                    timestamp: fc.integer({ min: 1000000000, max: 2000000000 })
                }),
                async (command) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Send command via API
                    const response = await request(app)
                        .post('/api/command')
                        .send(command)
                        .expect(200);
                    
                    // Command should be accepted
                    expect(response.body.success).toBe(true);
                    expect(response.body.commandId).toBeDefined();
                    expect(response.body.queuePosition).toBe(1);
                    
                    // Command should appear in queue immediately
                    const pollResponse = await request(app)
                        .get('/api/poll')
                        .expect(200);
                    
                    expect(pollResponse.body.hasCommand).toBe(true);
                    expect(pollResponse.body.command.id).toBe(response.body.commandId);
                    expect(pollResponse.body.command.type).toBe(command.type);
                    expect(pollResponse.body.command.player).toBe(command.player.trim().replace(/[^a-zA-Z0-9\s]/g, ''));
                    expect(pollResponse.body.command.timestamp).toBe(command.timestamp);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should handle multiple concurrent commands correctly', () => {
            return fc.assert(fc.asyncProperty(
                fc.array(fc.record({
                    type: fc.constantFrom('kick', 'ban'),
                    player: fc.string({ minLength: 1, maxLength: 20 })
                        .filter(s => s.trim().length > 0)
                        .filter(s => /^[a-zA-Z0-9\s]+$/.test(s.trim())), // Only alphanumeric and spaces
                    timestamp: fc.integer({ min: 1000000000, max: 2000000000 })
                }), { minLength: 1, maxLength: 5 }),
                async (commands) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Make players unique to avoid duplicate detection
                    const uniqueCommands = commands.map((cmd, index) => ({
                        ...cmd,
                        player: `${cmd.player}_${index}`
                    }));
                    
                    // Send all commands concurrently
                    const responses = await Promise.all(
                        uniqueCommands.map(cmd => 
                            request(app)
                                .post('/api/command')
                                .send(cmd)
                                .expect(200)
                        )
                    );
                    
                    // All commands should be accepted
                    responses.forEach((response, index) => {
                        expect(response.body.success).toBe(true);
                        expect(response.body.commandId).toBeDefined();
                        expect(response.body.queuePosition).toBeGreaterThan(0);
                        expect(response.body.queuePosition).toBeLessThanOrEqual(uniqueCommands.length);
                    });
                    
                    // All commands should be available for polling
                    const commandIds = responses.map(r => r.body.commandId);
                    const polledIds = [];
                    
                    for (let i = 0; i < commandIds.length; i++) {
                        const pollResponse = await request(app)
                            .get('/api/poll')
                            .expect(200);
                        
                        expect(pollResponse.body.hasCommand).toBe(true);
                        polledIds.push(pollResponse.body.command.id);
                        
                        // Complete the command to get the next one
                        await request(app)
                            .post('/api/complete')
                            .send({
                                commandId: pollResponse.body.command.id,
                                success: true
                            })
                            .expect(200);
                    }
                    
                    // Should have polled all commands
                    expect(polledIds.length).toBe(commandIds.length);
                    
                    // All command IDs should be present (order might vary due to concurrency)
                    expect(new Set(polledIds)).toEqual(new Set(commandIds));
                    
                    return true;
                }
            ), { numRuns: 50 }); // Reduced runs for concurrent test
        });
        
        test('should reject invalid commands appropriately', () => {
            return fc.assert(fc.asyncProperty(
                fc.record({
                    type: fc.oneof(
                        fc.constant('invalid'),
                        fc.constant(''),
                        fc.constant(null),
                        fc.constant(undefined)
                    ),
                    player: fc.oneof(
                        fc.constant(''),
                        fc.constant(null),
                        fc.constant(undefined),
                        fc.string({ maxLength: 0 })
                    ),
                    timestamp: fc.oneof(
                        fc.constant(0),
                        fc.constant(-1),
                        fc.constant(null),
                        fc.constant(undefined),
                        fc.constant('invalid')
                    )
                }),
                async (invalidCommand) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Send invalid command
                    const response = await request(app)
                        .post('/api/command')
                        .send(invalidCommand);
                    
                    // Should be rejected with 400 status
                    expect(response.status).toBe(400);
                    expect(response.body.success).toBe(false);
                    expect(response.body.error).toBeDefined();
                    
                    // Queue should remain empty
                    const pollResponse = await request(app)
                        .get('/api/poll')
                        .expect(200);
                    
                    expect(pollResponse.body.hasCommand).toBe(false);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
    });
    
    /**
     * Property 5: Command Execution Idempotency
     * For any command marked as complete, subsequent completion requests 
     * for the same command ID should not cause errors or side effects.
     * 
     * Validates: Requirements 2.3
     */
    describe('Property 5: Command Execution Idempotency', () => {
        test('should handle multiple completion requests idempotently', () => {
            return fc.assert(fc.asyncProperty(
                fc.record({
                    type: fc.constantFrom('kick', 'ban'),
                    player: fc.string({ minLength: 1, maxLength: 20 })
                        .filter(s => s.trim().length > 0)
                        .filter(s => /^[a-zA-Z0-9\s]+$/.test(s.trim())), // Only alphanumeric and spaces
                    timestamp: fc.integer({ min: 1000000000, max: 2000000000 })
                }),
                fc.boolean(), // success status
                fc.oneof(fc.constant(null), fc.string({ maxLength: 100 })), // error message
                fc.integer({ min: 2, max: 5 }), // number of completion attempts
                async (command, success, error, attempts) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Add command to queue
                    const addResponse = await request(app)
                        .post('/api/command')
                        .send(command)
                        .expect(200);
                    
                    const commandId = addResponse.body.commandId;
                    
                    // Complete the command multiple times
                    const completionResponses = [];
                    for (let i = 0; i < attempts; i++) {
                        const response = await request(app)
                            .post('/api/complete')
                            .send({
                                commandId: commandId,
                                success: success,
                                error: error
                            })
                            .expect(200);
                        
                        completionResponses.push(response.body);
                    }
                    
                    // First completion should remove the command
                    expect(completionResponses[0].success).toBe(true);
                    expect(completionResponses[0].removed).toBe(true);
                    expect(completionResponses[0].commandId).toBe(commandId);
                    
                    // Subsequent completions should be idempotent (no errors)
                    for (let i = 1; i < attempts; i++) {
                        expect(completionResponses[i].success).toBe(true);
                        expect(completionResponses[i].removed).toBe(false);
                        expect(completionResponses[i].commandId).toBe(commandId);
                        expect(completionResponses[i].message).toContain('already completed');
                    }
                    
                    // Queue should be empty after first completion
                    const pollResponse = await request(app)
                        .get('/api/poll')
                        .expect(200);
                    
                    expect(pollResponse.body.hasCommand).toBe(false);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should handle completion of non-existent commands gracefully', () => {
            return fc.assert(fc.asyncProperty(
                fc.string({ minLength: 5, maxLength: 50 })
                    .filter(s => s.trim().length >= 5), // Ensure non-empty after trim
                fc.boolean(), // success status
                fc.oneof(fc.constant(null), fc.string({ maxLength: 100 })), // error message
                async (fakeCommandId, success, error) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Try to complete non-existent command
                    const response = await request(app)
                        .post('/api/complete')
                        .send({
                            commandId: fakeCommandId,
                            success: success,
                            error: error
                        })
                        .expect(200);
                    
                    // Should handle gracefully (idempotent behavior)
                    expect(response.body.success).toBe(true);
                    expect(response.body.removed).toBe(false);
                    expect(response.body.commandId).toBe(fakeCommandId.trim()); // API trims the ID
                    expect(response.body.message).toContain('already completed or not found');
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should maintain queue consistency during concurrent completions', () => {
            return fc.assert(fc.asyncProperty(
                fc.array(fc.record({
                    type: fc.constantFrom('kick', 'ban'),
                    player: fc.string({ minLength: 1, maxLength: 20 })
                        .filter(s => s.trim().length > 0)
                        .filter(s => /^[a-zA-Z0-9\s]+$/.test(s.trim())), // Only alphanumeric and spaces
                    timestamp: fc.integer({ min: 1000000000, max: 2000000000 })
                }), { minLength: 2, maxLength: 4 }),
                async (commands) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Make players unique
                    const uniqueCommands = commands.map((cmd, index) => ({
                        ...cmd,
                        player: `${cmd.player}_${index}`
                    }));
                    
                    // Add all commands
                    const addResponses = await Promise.all(
                        uniqueCommands.map(cmd => 
                            request(app)
                                .post('/api/command')
                                .send(cmd)
                                .expect(200)
                        )
                    );
                    
                    const commandIds = addResponses.map(r => r.body.commandId);
                    
                    // Complete all commands concurrently (multiple times each)
                    const completionPromises = [];
                    commandIds.forEach(commandId => {
                        // Complete each command 3 times concurrently
                        for (let i = 0; i < 3; i++) {
                            completionPromises.push(
                                request(app)
                                    .post('/api/complete')
                                    .send({
                                        commandId: commandId,
                                        success: true
                                    })
                                    .expect(200)
                            );
                        }
                    });
                    
                    const completionResponses = await Promise.all(completionPromises);
                    
                    // All completion requests should succeed (idempotent)
                    completionResponses.forEach(response => {
                        expect(response.body.success).toBe(true);
                    });
                    
                    // Queue should be empty
                    const pollResponse = await request(app)
                        .get('/api/poll')
                        .expect(200);
                    
                    expect(pollResponse.body.hasCommand).toBe(false);
                    
                    // Status should show empty queue
                    const statusResponse = await request(app)
                        .get('/api/status')
                        .expect(200);
                    
                    expect(statusResponse.body.queueSize).toBe(0);
                    
                    return true;
                }
            ), { numRuns: 50 }); // Reduced runs for concurrent test
        });
    });
});