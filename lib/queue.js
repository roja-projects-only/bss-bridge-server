/**
 * Command Queue Management Module
 * 
 * Manages an in-memory queue of kick/ban commands with:
 * - Unique command IDs
 * - Command expiration (5 minutes)
 * - Duplicate detection (60 second cooldown)
 * - FIFO ordering for polling
 */

const crypto = require('crypto');

class CommandQueue {
    constructor() {
        // Main command queue - Map for O(1) operations
        this.commands = new Map(); // key: commandId, value: Command
        
        // Player cooldown tracking for duplicate detection
        this.playerCooldowns = new Map(); // key: playerName, value: timestamp
        
        // Configuration
        this.config = {
            maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE) || 50,
            commandExpirationMs: parseInt(process.env.COMMAND_EXPIRATION_MS) || 300000, // 5 minutes
            duplicateCooldownMs: parseInt(process.env.DUPLICATE_COOLDOWN_MS) || 60000, // 60 seconds
            cleanupIntervalMs: 30000 // 30 seconds
        };
        
        // Start cleanup interval
        this.startCleanup();
    }
    
    /**
     * Add a command to the queue
     * @param {string} type - "kick" or "ban"
     * @param {string} player - Player name
     * @param {number} timestamp - Unix timestamp from client
     * @returns {Object} Result with success, commandId, error, etc.
     */
    addCommand(type, player, timestamp) {
        const now = Date.now();
        
        // Check for duplicate command (same player within cooldown period)
        if (this.isDuplicateCommand(player, now)) {
            return {
                success: false,
                error: 'DUPLICATE_COMMAND',
                message: `Command for player ${player} already exists within cooldown period`
            };
        }
        
        // Check queue size limit
        if (this.commands.size >= this.config.maxQueueSize) {
            return {
                success: false,
                error: 'QUEUE_FULL',
                message: `Queue is full (max ${this.config.maxQueueSize} commands)`
            };
        }
        
        // Generate unique command ID
        const commandId = this.generateCommandId();
        
        // Create command object
        const command = {
            id: commandId,
            type: type,
            player: player,
            timestamp: timestamp, // Original client timestamp
            attempts: 0,
            createdAt: now,
            expiresAt: now + this.config.commandExpirationMs
        };
        
        // Add to queue and cooldown tracking
        this.commands.set(commandId, command);
        this.playerCooldowns.set(player, now);
        
        return {
            success: true,
            commandId: commandId,
            queuePosition: this.commands.size
        };
    }
    
    /**
     * Get the next command for polling (oldest unexecuted)
     * @param {string} deviceId - Optional device identifier
     * @returns {Object} Result with hasCommand and command data
     */
    pollCommand(deviceId = null) {
        // Clean expired commands first
        this.cleanupExpiredCommands();
        
        if (this.commands.size === 0) {
            return {
                hasCommand: false
            };
        }
        
        // Get oldest command (first in insertion order)
        const oldestCommand = this.commands.values().next().value;
        
        return {
            hasCommand: true,
            command: {
                id: oldestCommand.id,
                type: oldestCommand.type,
                player: oldestCommand.player,
                timestamp: oldestCommand.timestamp,
                attempts: oldestCommand.attempts
            }
        };
    }
    
    /**
     * Mark a command as complete and remove from queue
     * @param {string} commandId - Command ID to complete
     * @param {boolean} success - Whether execution was successful
     * @param {string} error - Error message if failed
     * @returns {Object} Result with success and removed status
     */
    completeCommand(commandId, success, error = null) {
        const command = this.commands.get(commandId);
        
        if (!command) {
            return {
                success: false,
                error: 'COMMAND_NOT_FOUND',
                message: `Command ${commandId} not found`
            };
        }
        
        // Remove from queue
        this.commands.delete(commandId);
        
        // Remove from cooldown if successful (allow immediate retry if failed)
        if (success) {
            this.playerCooldowns.delete(command.player);
        }
        
        return {
            success: true,
            removed: true,
            commandId: commandId
        };
    }
    
    /**
     * Get queue status information
     * @returns {Object} Status information
     */
    getStatus() {
        this.cleanupExpiredCommands();
        
        return {
            queueSize: this.commands.size,
            maxQueueSize: this.config.maxQueueSize,
            cooldownCount: this.playerCooldowns.size,
            oldestCommandAge: this.getOldestCommandAge()
        };
    }
    
    /**
     * Check if a command for this player already exists within cooldown
     * @param {string} player - Player name
     * @param {number} now - Current timestamp
     * @returns {boolean} True if duplicate
     */
    isDuplicateCommand(player, now) {
        const lastCommandTime = this.playerCooldowns.get(player);
        if (!lastCommandTime) {
            return false;
        }
        
        return (now - lastCommandTime) < this.config.duplicateCooldownMs;
    }
    
    /**
     * Generate a unique command ID
     * @returns {string} UUID v4
     */
    generateCommandId() {
        return crypto.randomUUID();
    }
    
    /**
     * Clean up expired commands and cooldowns
     */
    cleanupExpiredCommands() {
        const now = Date.now();
        
        // Remove expired commands
        for (const [commandId, command] of this.commands.entries()) {
            if (now > command.expiresAt) {
                this.commands.delete(commandId);
                // Also remove from cooldown to allow new commands
                this.playerCooldowns.delete(command.player);
            }
        }
        
        // Clean up expired cooldowns (shouldn't be necessary but good practice)
        for (const [player, timestamp] of this.playerCooldowns.entries()) {
            if ((now - timestamp) > this.config.duplicateCooldownMs) {
                // Only remove if no active command exists for this player
                const hasActiveCommand = Array.from(this.commands.values())
                    .some(cmd => cmd.player === player);
                if (!hasActiveCommand) {
                    this.playerCooldowns.delete(player);
                }
            }
        }
    }
    
    /**
     * Get age of oldest command in milliseconds
     * @returns {number} Age in milliseconds, or 0 if queue empty
     */
    getOldestCommandAge() {
        if (this.commands.size === 0) {
            return 0;
        }
        
        const oldestCommand = this.commands.values().next().value;
        return Date.now() - oldestCommand.createdAt;
    }
    
    /**
     * Start periodic cleanup of expired commands
     */
    startCleanup() {
        setInterval(() => {
            this.cleanupExpiredCommands();
        }, this.config.cleanupIntervalMs);
    }
    
    /**
     * Clear all commands and cooldowns (for testing)
     */
    clear() {
        this.commands.clear();
        this.playerCooldowns.clear();
    }
}

// Export singleton instance
const queueInstance = new CommandQueue();
module.exports = queueInstance;