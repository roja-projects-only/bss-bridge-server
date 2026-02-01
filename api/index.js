/**
 * Root health check endpoint
 * GET /
 */
module.exports = (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'METHOD_NOT_ALLOWED',
            message: 'Only GET method is allowed'
        });
    }

    res.status(200).json({
        status: 'online',
        message: 'BSS Bridge Server is running',
        version: '1.0.0',
        endpoints: {
            status: '/api/status',
            command: '/api/command',
            poll: '/api/poll',
            complete: '/api/complete'
        }
    });
};
