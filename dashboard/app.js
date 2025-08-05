const express = require('express');
const path = require('path');
const cors = require('cors');
const { logInfo, logError, logSuccess } = require('../utils');
const db = require('./connectDB');
const { config } = require('../config/globals');

class WebServer {
    constructor() {
        this.app = express();
        this.port = 5000;
        this.startTime = Date.now();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // CORS middleware
        this.app.use(cors());

        // JSON parsing middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Static files
        this.app.use('/css', express.static(path.join(__dirname, 'css')));
        this.app.use('/js', express.static(path.join(__dirname, 'js')));
        this.app.use('/images', express.static(path.join(__dirname, 'images')));

        // Request logging middleware (disabled for cleaner console)
        // this.app.use((req, res, next) => {
        //     logInfo(`${req.method} ${req.path} - ${req.ip}`);
        //     next();
        // });
    }

    setupRoutes() {
        // Dashboard route
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
        });

        // API Routes
        this.app.get('/api/stats', async (req, res) => {
            try {
                const db = require('./connectDB');

                if (!db.getStatus().connected) {
                    return res.status(503).json({
                        success: false,
                        error: 'Database not connected'
                    });
                }

                const userCount = await db.getUserCount();
                const groupCount = await db.getGroupCount();

                // Get message stats for last 24 hours
                const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const messageStats = await db.all(
                    'SELECT COUNT(*) as count FROM messages WHERE timestamp >= ?',
                    [last24h]
                );

                const botStatus = global.botConnected ? 'online' : 'offline';
                const uptime = process.uptime();

                res.json({
                    success: true,
                    stats: {
                        users: userCount || 0,
                        groups: groupCount || 0,
                        messages24h: messageStats[0]?.count || 0,
                        botStatus: botStatus,
                        uptime: Math.floor(uptime)
                    }
                });
            } catch (error) {
                console.error('Stats API error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch stats'
                });
            }
        });

        this.app.get('/api/users', async (req, res) => {
            try {
                const db = require('./connectDB');
                let users = [];

                if (db.getStatus().connected) {
                    users = await db.getAllUsers();
                }

                res.json({
                    success: true,
                    users: users,
                    total: users.length
                });
            } catch (error) {
                logError(`Users API error: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch users'
                });
            }
        });

        this.app.get('/api/groups', async (req, res) => {
            try {
                const db = require('./connectDB');
                let groups = [];

                if (db.getStatus().connected) {
                    groups = await db.getAllGroups();
                }

                res.json({
                    success: true,
                    groups: groups,
                    total: groups.length
                });
            } catch (error) {
                logError(`Groups API error: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch groups'
                });
            }
        });

        // Message analytics endpoints
        this.app.get('/api/analytics/user/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                const db = require('./connectDB');

                if (!db.getStatus().connected) {
                    return res.status(503).json({
                        success: false,
                        error: 'Database not connected'
                    });
                }

                const stats = await db.getUserMessageStats(userId);
                res.json({
                    success: true,
                    userStats: stats
                });
            } catch (error) {
                logError(`User analytics API error: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch user analytics'
                });
            }
        });

        this.app.get('/api/analytics/group/:groupId', async (req, res) => {
            try {
                const { groupId } = req.params;
                const { days = 7 } = req.query;
                const db = require('./connectDB');

                if (!db.getStatus().connected) {
                    return res.status(503).json({
                        success: false,
                        error: 'Database not connected'
                    });
                }

                const stats = await db.getGroupMessageStats(groupId, parseInt(days));
                const activities = await db.getRecentGroupActivities(groupId, 20);

                res.json({
                    success: true,
                    groupStats: stats,
                    recentActivities: activities
                });
            } catch (error) {
                logError(`Group analytics API error: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch group analytics'
                });
            }
        });

        this.app.post('/api/maintenance/cleanup', async (req, res) => {
            try {
                const { daysToKeep = 30 } = req.body;
                const db = require('./connectDB');

                if (!db.getStatus().connected) {
                    return res.status(503).json({
                        success: false,
                        error: 'Database not connected'
                    });
                }

                const deletedCount = await db.cleanOldMessages(daysToKeep);

                res.json({
                    success: true,
                    message: `Cleaned ${deletedCount} old messages`,
                    deletedCount
                });
            } catch (error) {
                logError(`Cleanup API error: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to cleanup messages'
                });
            }
        });

        this.app.post('/api/execute', async (req, res) => {
            try {
                const { command } = req.body;

                if (!command) {
                    return res.status(400).json({
                        success: false,
                        error: 'Command is required'
                    });
                }

                // Here you would implement command execution logic
                // For security, only allow specific admin commands

                res.json({
                    success: true,
                    message: 'Command execution not implemented yet',
                    command
                });
            } catch (error) {
                logError(`Execute API error: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to execute command'
                });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: Date.now() - this.startTime,
                timestamp: new Date().toISOString(),
                database: db.getStatus()
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found'
            });
        });

        // Error handler
        this.app.use((error, req, res, next) => {
            logError(`Server error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });
    }

    async getStats() {
        try {
            const uptime = Math.floor((Date.now() - this.startTime) / 1000);

            // Get user and group counts from database
            let userCount = 0;
            let groupCount = 0;

            try {
                const database = require('./connectDB');
                const dbStatus = database.getStatus();
                if (dbStatus && dbStatus.isConnected) {
                    userCount = await database.getUserCount();
                    groupCount = await database.getGroupCount();
                }
            } catch (dbError) {
                logError(`Database error in getStats: ${dbError.message}`);
            }

            return {
                users: userCount || 0,
                groups: groupCount || 0,
                commands: global.commands ? global.commands.size : 0,
                uptime: uptime || 0,
                memory: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform
            };
        } catch (error) {
            logError(`Error getting stats: ${error.message}`);
            return {
                users: 0,
                groups: 0,
                commands: 0,
                uptime: 0
            };
        }
    }

    start() {
        this.app.listen(this.port, '0.0.0.0', () => {
            // Web server started silently for cleaner console output
        });
    }

    stop() {
        // Graceful shutdown logic would go here
        logInfo('Web server stopped');
    }
}

module.exports = WebServer;

// Start server if this file is run directly
if (require.main === module) {
    const server = new WebServer();
    server.start();
}