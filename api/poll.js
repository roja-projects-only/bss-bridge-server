/**
 * GET /api/poll endpoint
 * 
 * Polled by Android app to get the next command for execution.
 * Returns the oldest unexecuted command or empty response if queue is empty.
 * 
 * Query parameters:
 * - deviceId: Optional unique device identifier for multi-device support
 * 
 * Response (command available):
 * {
 *   "hasCommand": true,
 *   "command": {
 *     "id": "uuid-v4",
 *     "type": "kick" | "ban",
 *     "player": "PlayerName",
 *     "timestamp": 1234567890,
 *     "attempts": 0
 *   }
 * }
 * 
 * Response (no commands):
 * {
 *   "hasCommand": false
 * }
 */

const queue = require('../lib/queue');
const { apiKeyMiddleware } = require('../lib/auth');

module.exports = async (req, res) => {
    // Apply API key authentication
    apiKeyMiddleware(req, res, () => {
        try {
            // Only allow GET method
            if (req.method !== 'GET') {
                return res.status(405).json({
                    success: false,
                    error: 'METHOD_NOT_ALLOWED',
                    message: 'Only GET method is allowed'
                });
            }

            // Extract optional deviceId from query parameters
            const { deviceId } = req.query || {};

            // Validate deviceId if provided
            if (deviceId && typeof deviceId !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_DEVICE_ID',
                    message: 'Device ID must be a string'
                });
            }

            // Poll for next command
            const result = queue.pollCommand(deviceId);

            // Return the result (either with command or empty)
            res.status(200).json(result);

        } catch (error) {
            console.error('Error in /api/poll:', error);
            res.status(500).json({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred'
            });
        }
    });
};