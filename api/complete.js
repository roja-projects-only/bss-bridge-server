/**
 * POST /api/complete endpoint
 * 
 * Called by Android app after executing a command to mark it as complete.
 * Removes the command from the queue and handles idempotent completion.
 * 
 * Request body:
 * {
 *   "commandId": "uuid-v4",
 *   "success": true,
 *   "error": null | "error message"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "removed": true,
 *   "commandId": "uuid-v4"
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
            const { commandId, success, error } = req.body || {};

            // Validate required fields
            if (!commandId || typeof success !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'MISSING_REQUIRED_FIELDS',
                    message: 'Required fields: commandId (string), success (boolean)'
                });
            }

            // Validate commandId format (should be UUID)
            if (typeof commandId !== 'string' || commandId.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_COMMAND_ID',
                    message: 'Command ID must be a non-empty string'
                });
            }

            // Validate error field if provided
            if (error !== null && error !== undefined && typeof error !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_ERROR_FIELD',
                    message: 'Error field must be null or a string'
                });
            }

            // Mark command as complete
            const result = queue.completeCommand(commandId.trim(), success, error);

            if (!result.success) {
                // Handle specific completion errors
                if (result.error === 'COMMAND_NOT_FOUND') {
                    // For idempotent behavior, return success even if command not found
                    // This handles cases where the same completion request is sent multiple times
                    return res.status(200).json({
                        success: true,
                        removed: false,
                        commandId: commandId.trim(),
                        message: 'Command already completed or not found'
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: 'COMPLETION_ERROR',
                        message: result.message || 'Failed to complete command'
                    });
                }
            }

            // Success response
            res.status(200).json({
                success: true,
                removed: result.removed,
                commandId: result.commandId
            });

        } catch (error) {
            console.error('Error in /api/complete:', error);
            res.status(500).json({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred'
            });
        }
    });
};