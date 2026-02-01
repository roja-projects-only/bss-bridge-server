/**
 * POST /api/command endpoint
 * 
 * Receives kick/ban commands from BSS Monitor and adds them to the queue.
 * 
 * Request body:
 * {
 *   "type": "kick" | "ban",
 *   "player": "PlayerName",
 *   "timestamp": 1234567890
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "commandId": "uuid-v4",
 *   "queuePosition": 1
 * }
 */

const queue = require('../lib/queue');
const { apiKeyMiddleware } = require('../lib/auth');

module.exports = async (req, res) => {
    // Apply API key authentication
    apiKeyMiddleware(req, res, () => {
        try {
            // Only allow POST method
            if (req.method !== 'POST') {
                return res.status(405).json({
                    success: false,
                    error: 'METHOD_NOT_ALLOWED',
                    message: 'Only POST method is allowed'
                });
            }

            // Parse and validate request body
            const { type, player, timestamp } = req.body || {};

            // Validate required fields
            if (!type || !player || !timestamp) {
                return res.status(400).json({
                    success: false,
                    error: 'MISSING_REQUIRED_FIELDS',
                    message: 'Required fields: type, player, timestamp'
                });
            }

            // Validate command type
            if (type !== 'kick' && type !== 'ban') {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_COMMAND_TYPE',
                    message: 'Command type must be "kick" or "ban"'
                });
            }

            // Validate player name (basic validation)
            if (typeof player !== 'string' || player.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_PLAYER_NAME',
                    message: 'Player name must be a non-empty string'
                });
            }

            // Validate timestamp
            if (typeof timestamp !== 'number' || timestamp <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_TIMESTAMP',
                    message: 'Timestamp must be a positive number'
                });
            }

            // Sanitize player name (alphanumeric + spaces only)
            const sanitizedPlayer = player.trim().replace(/[^a-zA-Z0-9\s]/g, '');
            if (sanitizedPlayer.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_PLAYER_NAME',
                    message: 'Player name contains only invalid characters'
                });
            }

            // Add command to queue
            const result = queue.addCommand(type, sanitizedPlayer, timestamp);

            if (!result.success) {
                // Handle specific queue errors
                if (result.error === 'DUPLICATE_COMMAND') {
                    return res.status(409).json({
                        success: false,
                        error: result.error,
                        message: result.message
                    });
                } else if (result.error === 'QUEUE_FULL') {
                    return res.status(503).json({
                        success: false,
                        error: result.error,
                        message: result.message
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: 'QUEUE_ERROR',
                        message: result.message || 'Failed to add command to queue'
                    });
                }
            }

            // Success response
            res.status(200).json({
                success: true,
                commandId: result.commandId,
                queuePosition: result.queuePosition
            });

        } catch (error) {
            console.error('Error in /api/command:', error);
            res.status(500).json({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred'
            });
        }
    });
};