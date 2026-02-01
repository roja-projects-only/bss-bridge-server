/**
 * GET /api/status endpoint
 * 
 * Health check and queue status endpoint.
 * Returns server status, queue information, uptime, and version.
 * 
 * Response:
 * {
 *   "status": "online",
 *   "queueSize": 2,
 *   "uptime": 3600,
 *   "version": "1.0.0"
 * }
 */

const queue = require('../lib/queue');
const { apiKeyMiddleware } = require('../lib/auth');

// Track server start time for uptime calculation
const serverStartTime = Date.now();

module.exports = async (req, res) => {
    // Apply API key authentication (but allow status checks without auth in dev mode)
    const authMiddleware = process.env.API_KEY ? apiKeyMiddleware : (req, res, next) => next();
    
    authMiddleware(req, res, () => {
        try {
            // Only allow GET method
            if (req.method !== 'GET') {
                return res.status(405).json({
                    success: false,
                    error: 'METHOD_NOT_ALLOWED',
                    message: 'Only GET method is allowed'
                });
            }

            // Get queue status
            const queueStatus = queue.getStatus();

            // Calculate uptime in seconds
            const uptimeMs = Date.now() - serverStartTime;
            const uptimeSeconds = Math.floor(uptimeMs / 1000);

            // Get version from package.json
            let version = '1.0.0';
            try {
                const packageJson = require('../package.json');
                version = packageJson.version;
            } catch (error) {
                console.warn('Could not read version from package.json:', error.message);
            }

            // Build status response
            const statusResponse = {
                status: 'online',
                queueSize: queueStatus.queueSize,
                uptime: uptimeSeconds,
                version: version,
                // Additional queue information
                maxQueueSize: queueStatus.maxQueueSize,
                cooldownCount: queueStatus.cooldownCount,
                oldestCommandAge: Math.floor(queueStatus.oldestCommandAge / 1000), // Convert to seconds
                timestamp: Math.floor(Date.now() / 1000) // Current server time
            };

            res.status(200).json(statusResponse);

        } catch (error) {
            console.error('Error in /api/status:', error);
            
            // Even if there's an error, try to return basic status
            res.status(500).json({
                status: 'error',
                queueSize: 0,
                uptime: Math.floor((Date.now() - serverStartTime) / 1000),
                version: '1.0.0',
                error: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred'
            });
        }
    });
};