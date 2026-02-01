/**
 * Property-Based Tests for Command Queue
 * 
 * Tests universal properties that should hold across all valid inputs:
 * - Property 2: No Duplicate Commands
 * - Property 3: Command Expiration  
 * - Property 4: Polling Consistency
 */

const fc = require('fast-check');
const queue = require('../lib/queue');

describe('Command Queue Property Tests', () => {
    
    beforeEach(() => {
        // Clear queue before each test
        queue.clear();
    });
    
    /**
     * Property 2: No Duplicate Commands
     * For any player name, if a command is sent within 60 seconds of a previous command 
     * for the same player, the server should reject the duplicate command.
     * 
     * Validates: Requirements 1.5
     */
    describe('Property 2: No Duplicate Commands', () => {
        test('should reject duplicate commands within cooldown period', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 1, maxLength: 20 }), // playerName
                fc.constantFrom('kick', 'ban'), // commandType
                fc.integer({ min: 1000000000, max: 2000000000 }), // timestamp
                (playerName, commandType, timestamp) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Add first command
                    const result1 = queue.addCommand(commandType, playerName, timestamp);
                    
                    // Try to add duplicate command immediately (within cooldown)
                    const result2 = queue.addCommand(commandType, playerName, timestamp + 1000);
                    
                    // First command should succeed
                    expect(result1.success).toBe(true);
                    expect(result1.commandId).toBeDefined();
                    
                    // Second command should be rejected as duplicate
                    expect(result2.success).toBe(false);
                    expect(result2.error).toBe('DUPLICATE_COMMAND');
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should allow commands after cooldown period expires', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 1, maxLength: 20 }), // playerName
                fc.constantFrom('kick', 'ban'), // commandType
                fc.integer({ min: 1000000000, max: 2000000000 }), // timestamp
                (playerName, commandType, timestamp) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Mock time to simulate cooldown expiration
                    const originalNow = Date.now;
                    let mockTime = Date.now();
                    Date.now = () => mockTime;
                    
                    try {
                        // Add first command
                        const result1 = queue.addCommand(commandType, playerName, timestamp);
                        
                        // Advance time beyond cooldown period (60 seconds + buffer)
                        mockTime += 65000;
                        
                        // Try to add command after cooldown
                        const result2 = queue.addCommand(commandType, playerName, timestamp + 65000);
                        
                        // Both commands should succeed
                        expect(result1.success).toBe(true);
                        expect(result2.success).toBe(true);
                        expect(result1.commandId).not.toBe(result2.commandId);
                        
                        return true;
                    } finally {
                        Date.now = originalNow;
                    }
                }
            ), { numRuns: 100 });
        });
    });
    
    /**
     * Property 3: Command Expiration
     * For any command in the queue, if the command is older than 5 minutes, 
     * it should be automatically removed from the queue.
     * 
     * Validates: Requirements 2.4
     */
    describe('Property 3: Command Expiration', () => {
        test('should automatically remove expired commands', () => {
            fc.assert(fc.property(
                fc.array(fc.record({
                    player: fc.string({ minLength: 1, maxLength: 20 }),
                    type: fc.constantFrom('kick', 'ban'),
                    timestamp: fc.integer({ min: 1000000000, max: 2000000000 })
                }), { minLength: 1, maxLength: 10 }),
                (commands) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Mock time control
                    const originalNow = Date.now;
                    let mockTime = Date.now();
                    Date.now = () => mockTime;
                    
                    try {
                        // Add commands
                        const addedCommands = [];
                        for (const cmd of commands) {
                            const result = queue.addCommand(cmd.type, cmd.player, cmd.timestamp);
                            if (result.success) {
                                addedCommands.push(result.commandId);
                            }
                        }
                        
                        // Verify commands are in queue
                        const statusBefore = queue.getStatus();
                        expect(statusBefore.queueSize).toBe(addedCommands.length);
                        
                        // Advance time beyond expiration (5 minutes + buffer)
                        mockTime += 310000; // 5 minutes 10 seconds
                        
                        // Trigger cleanup by calling getStatus (which calls cleanupExpiredCommands)
                        const statusAfter = queue.getStatus();
                        
                        // All commands should be expired and removed
                        expect(statusAfter.queueSize).toBe(0);
                        
                        return true;
                    } finally {
                        Date.now = originalNow;
                    }
                }
            ), { numRuns: 100 });
        });
        
        test('should not remove non-expired commands', () => {
            fc.assert(fc.property(
                fc.array(fc.record({
                    player: fc.string({ minLength: 1, maxLength: 20 }),
                    type: fc.constantFrom('kick', 'ban'),
                    timestamp: fc.integer({ min: 1000000000, max: 2000000000 })
                }), { minLength: 1, maxLength: 5 }),
                (commands) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Mock time control
                    const originalNow = Date.now;
                    let mockTime = Date.now();
                    Date.now = () => mockTime;
                    
                    try {
                        // Add commands with unique players to avoid duplicates
                        const addedCommands = [];
                        for (let i = 0; i < commands.length; i++) {
                            const cmd = commands[i];
                            const uniquePlayer = `${cmd.player}_${i}`;
                            const result = queue.addCommand(cmd.type, uniquePlayer, cmd.timestamp);
                            if (result.success) {
                                addedCommands.push(result.commandId);
                            }
                        }
                        
                        // Advance time but not beyond expiration (2 minutes)
                        mockTime += 120000;
                        
                        // Trigger cleanup
                        const status = queue.getStatus();
                        
                        // Commands should still be in queue (not expired)
                        expect(status.queueSize).toBe(addedCommands.length);
                        
                        return true;
                    } finally {
                        Date.now = originalNow;
                    }
                }
            ), { numRuns: 100 });
        });
    });
    
    /**
     * Property 4: Polling Consistency
     * For any polling request from the Android app, the server should return 
     * the oldest unexecuted command or an empty response if the queue is empty.
     * 
     * Validates: Requirements 2.2, 2.5
     */
    describe('Property 4: Polling Consistency', () => {
        test('should return oldest command in FIFO order', () => {
            fc.assert(fc.property(
                fc.array(fc.record({
                    player: fc.string({ minLength: 1, maxLength: 20 }),
                    type: fc.constantFrom('kick', 'ban'),
                    timestamp: fc.integer({ min: 1000000000, max: 2000000000 })
                }), { minLength: 2, maxLength: 5 }),
                (commands) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Add commands with unique players to avoid duplicates
                    const addedCommands = [];
                    for (let i = 0; i < commands.length; i++) {
                        const cmd = commands[i];
                        const uniquePlayer = `${cmd.player}_${i}`;
                        const result = queue.addCommand(cmd.type, uniquePlayer, cmd.timestamp);
                        if (result.success) {
                            addedCommands.push({
                                id: result.commandId,
                                player: uniquePlayer,
                                type: cmd.type
                            });
                        }
                    }
                    
                    // Skip test if no commands were added
                    if (addedCommands.length === 0) {
                        return true;
                    }
                    
                    // Poll commands and verify FIFO order
                    const polledCommands = [];
                    while (true) {
                        const pollResult = queue.pollCommand();
                        if (!pollResult.hasCommand) {
                            break;
                        }
                        
                        polledCommands.push(pollResult.command);
                        
                        // Complete the command to remove it from queue
                        queue.completeCommand(pollResult.command.id, true);
                    }
                    
                    // Should have polled all added commands
                    expect(polledCommands.length).toBe(addedCommands.length);
                    
                    // Commands should be returned in FIFO order (same order as added)
                    for (let i = 0; i < polledCommands.length; i++) {
                        expect(polledCommands[i].id).toBe(addedCommands[i].id);
                        expect(polledCommands[i].player).toBe(addedCommands[i].player);
                        expect(polledCommands[i].type).toBe(addedCommands[i].type);
                    }
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should return empty response when queue is empty', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 1, maxLength: 20 }), // deviceId
                (deviceId) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Poll empty queue
                    const result = queue.pollCommand(deviceId);
                    
                    // Should return empty response
                    expect(result.hasCommand).toBe(false);
                    expect(result.command).toBeUndefined();
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
        
        test('should return same command on multiple polls until completed', () => {
            fc.assert(fc.property(
                fc.string({ minLength: 1, maxLength: 20 }), // playerName
                fc.constantFrom('kick', 'ban'), // commandType
                fc.integer({ min: 1000000000, max: 2000000000 }), // timestamp
                (playerName, commandType, timestamp) => {
                    // Clear queue for clean test
                    queue.clear();
                    
                    // Add single command
                    const addResult = queue.addCommand(commandType, playerName, timestamp);
                    if (!addResult.success) {
                        return true; // Skip if command couldn't be added
                    }
                    
                    // Poll multiple times
                    const poll1 = queue.pollCommand();
                    const poll2 = queue.pollCommand();
                    const poll3 = queue.pollCommand();
                    
                    // All polls should return the same command
                    expect(poll1.hasCommand).toBe(true);
                    expect(poll2.hasCommand).toBe(true);
                    expect(poll3.hasCommand).toBe(true);
                    
                    expect(poll1.command.id).toBe(addResult.commandId);
                    expect(poll2.command.id).toBe(addResult.commandId);
                    expect(poll3.command.id).toBe(addResult.commandId);
                    
                    // Complete the command
                    queue.completeCommand(addResult.commandId, true);
                    
                    // Next poll should be empty
                    const poll4 = queue.pollCommand();
                    expect(poll4.hasCommand).toBe(false);
                    
                    return true;
                }
            ), { numRuns: 100 });
        });
    });
});