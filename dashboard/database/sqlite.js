const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { logInfo, logError, logSuccess } = require('../../utils');

class SQLiteDB {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, 'luna.db');
        this.isConnected = false;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            // Ensure database directory exists
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    logError(`SQLite connection failed: ${err.message}`);
                    reject(false);
                } else {
                    this.isConnected = true;
                    this.initializeTables();
                    resolve(true);
                }
            });
        });
    }

    async checkTablesExist() {
        try {
            const result = await this.get("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'");
            return result !== undefined;
        } catch (error) {
            return false;
        }
    }

    async addColumnIfNotExists(tableName, columnName, columnDef) {
        try {
            const result = await this.get(`PRAGMA table_info(${tableName})`);
            const columns = await this.all(`PRAGMA table_info(${tableName})`);
            const columnExists = columns.some(col => col.name === columnName);
            
            if (!columnExists) {
                await this.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
            }
        } catch (error) {
            // Ignore errors - column might already exist
        }
    }

    async initializeTables() {
        // Check if tables exist first
        const tablesExist = await this.checkTablesExist();
        
        if (!tablesExist) {
            // Drop existing tables to clean up any inconsistencies
            const dropTables = [
                'DROP TABLE IF EXISTS users',
                'DROP TABLE IF EXISTS groups', 
                'DROP TABLE IF EXISTS commandLogs',
                'DROP TABLE IF EXISTS botSettings',
                'DROP TABLE IF EXISTS cooldowns',
                'DROP TABLE IF EXISTS messages',
                'DROP TABLE IF EXISTS group_activities',
                'DROP TABLE IF EXISTS user_stats'
            ];

            for (const dropTable of dropTables) {
                try {
                    await this.run(dropTable);
                } catch (error) {
                    // Ignore errors
                }
            }
        } else {
            return;
        }

        const tables = [
            `CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phoneNumber TEXT UNIQUE NOT NULL,
                name TEXT,
                profilePic TEXT,
                isAdmin BOOLEAN DEFAULT 0,
                isBanned BOOLEAN DEFAULT 0,
                commandCount INTEGER DEFAULT 0,
                messageCount INTEGER DEFAULT 0,
                lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                groupId TEXT UNIQUE NOT NULL,
                groupName TEXT,
                description TEXT,
                adminNumbers TEXT,
                memberCount INTEGER DEFAULT 0,
                messageCount INTEGER DEFAULT 0,
                isActive BOOLEAN DEFAULT 1,
                customPrefix TEXT,
                settings TEXT,
                lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE commandLogs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                commandName TEXT NOT NULL,
                userId TEXT NOT NULL,
                groupId TEXT,
                success BOOLEAN DEFAULT 1,
                executionTime INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE botSettings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE cooldowns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                commandName TEXT NOT NULL,
                expiresAt DATETIME NOT NULL,
                UNIQUE(userId, commandName)
            )`,
            `CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                messageId TEXT UNIQUE NOT NULL,
                userId TEXT NOT NULL,
                groupId TEXT,
                messageType TEXT DEFAULT 'text',
                messageLength INTEGER DEFAULT 0,
                hasMedia BOOLEAN DEFAULT 0,
                isForwarded BOOLEAN DEFAULT 0,
                isReply BOOLEAN DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE group_activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                groupId TEXT NOT NULL,
                activityType TEXT NOT NULL,
                userId TEXT,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE user_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT UNIQUE NOT NULL,
                totalMessages INTEGER DEFAULT 0,
                totalMediaSent INTEGER DEFAULT 0,
                totalGroupsJoined INTEGER DEFAULT 0,
                lastActivityType TEXT,
                lastActivityTime DATETIME DEFAULT CURRENT_TIMESTAMP,
                weeklyMessageCount INTEGER DEFAULT 0,
                monthlyMessageCount INTEGER DEFAULT 0,
                lastWeekReset DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastMonthReset DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const table of tables) {
            await this.run(table);
        }

        // Create indexes separately
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_messages_userId ON messages(userId)',
            'CREATE INDEX IF NOT EXISTS idx_messages_groupId ON messages(groupId)',
            'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_group_activities_groupId ON group_activities(groupId)',
            'CREATE INDEX IF NOT EXISTS idx_group_activities_activityType ON group_activities(activityType)',
            'CREATE INDEX IF NOT EXISTS idx_group_activities_timestamp ON group_activities(timestamp)'
        ];

        for (const index of indexes) {
            try {
                await this.run(index);
            } catch (error) {
                // Ignore if index already exists
            }
        }
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    logError(`SQLite run error: ${err.message}`);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    logError(`SQLite get error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logError(`SQLite all error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // User operations
    async saveUser(userData) {
        try {
            const sql = `INSERT OR REPLACE INTO users
                (phoneNumber, name, profilePic, isAdmin, isBanned, commandCount, messageCount, lastSeen)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
            await this.run(sql, [
                userData.phoneNumber,
                userData.name || '',
                userData.profilePic || '',
                userData.isAdmin || 0,
                userData.isBanned || 0,
                userData.commandCount || 0,
                userData.messageCount || 0
            ]);
            return true;
        } catch (error) {
            logError(`Failed to save user: ${error.message}`);
            return false;
        }
    }

    async getUser(phoneNumber) {
        try {
            return await this.get('SELECT * FROM users WHERE phoneNumber = ?', [phoneNumber]);
        } catch (error) {
            logError(`Failed to get user: ${error.message}`);
            return null;
        }
    }

    // Group operations
    async saveGroup(groupData) {
        try {
            const sql = `INSERT OR REPLACE INTO groups
                (groupId, groupName, description, adminNumbers, memberCount, messageCount, customPrefix, settings, lastActivity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
            await this.run(sql, [
                groupData.groupId,
                groupData.groupName || '',
                groupData.description || '',
                JSON.stringify(groupData.adminNumbers || []),
                groupData.memberCount || 0,
                groupData.messageCount || 0,
                groupData.customPrefix || '',
                JSON.stringify(groupData.settings || {})
            ]);
            return true;
        } catch (error) {
            logError(`Failed to save group: ${error.message}`);
            return false;
        }
    }

    async getGroup(groupId) {
        try {
            const group = await this.get('SELECT * FROM groups WHERE groupId = ?', [groupId]);
            if (group) {
                group.adminNumbers = JSON.parse(group.adminNumbers || '[]');
                group.settings = JSON.parse(group.settings || '{}');
            }
            return group;
        } catch (error) {
            logError(`Failed to get group: ${error.message}`);
            return null;
        }
    }

    async close() {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }

    async getUserCount() {
        try {
            if (!this.isConnected || !this.db) {
                return 0;
            }
            const result = await this.get('SELECT COUNT(*) as count FROM users');
            return result?.count || 0;
        } catch (error) {
            logError('Error getting user count: ' + error.message);
            return 0;
        }
    }

    async getGroupCount() {
        try {
            if (!this.isConnected || !this.db) {
                return 0;
            }
            const result = await this.get('SELECT COUNT(*) as count FROM groups');
            return result?.count || 0;
        } catch (error) {
            logError('Error getting group count: ' + error.message);
            return 0;
        }
    }

    async getAllUsers() {
        try {
            const users = await this.all('SELECT * FROM users ORDER BY lastSeen DESC');
            return users || [];
        } catch (error) {
            logError('Error getting all users: ' + error.message);
            return [];
        }
    }

    async getAllGroups() {
        try {
            const groups = await this.all('SELECT * FROM groups ORDER BY lastActivity DESC');
            return groups || [];
        } catch (error) {
            logError('Error getting all groups: ' + error.message);
            return [];
        }
    }

    async updateUserActivity(userNumber, userName = null) {
        try {
            const now = new Date().toISOString();
            await this.run(`
                INSERT OR REPLACE INTO users (userNumber, userName, lastSeen, messageCount, joinDate)
                VALUES (?, ?, ?,
                    COALESCE((SELECT messageCount FROM users WHERE userNumber = ?), 0) + 1,
                    COALESCE((SELECT joinDate FROM users WHERE userNumber = ?), ?)
                )
            `, [userNumber, userName, now, userNumber, userNumber, now]);
        } catch (error) {
            console.error('Error updating user activity:', error);
        }
    }

    async updateGroupActivity(groupId, groupName = null, participantCount = 0) {
        try {
            const now = new Date().toISOString();
            await this.run(`
                INSERT OR REPLACE INTO groups (groupId, groupName, lastActivity, messageCount, participantCount, joinDate)
                VALUES (?, ?, ?,
                    COALESCE((SELECT messageCount FROM groups WHERE groupId = ?), 0) + 1,
                    ?,
                    COALESCE((SELECT joinDate FROM groups WHERE groupId = ?), ?)
                )
            `, [groupId, groupName, now, groupId, participantCount, groupId, now]);
        } catch (error) {
            console.error('Error updating group activity:', error);
        }
    }

    // Message tracking methods
    async logMessage(messageData) {
        try {
            const { messageId, userId, groupId, messageType, messageLength, hasMedia, isForwarded, isReply } = messageData;

            await this.run(`
                INSERT OR IGNORE INTO messages
                (messageId, userId, groupId, messageType, messageLength, hasMedia, isForwarded, isReply)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [messageId, userId, groupId, messageType || 'text', messageLength || 0, hasMedia || 0, isForwarded || 0, isReply || 0]);

            // Update user stats
            await this.updateUserMessageStats(userId, hasMedia);

            return true;
        } catch (error) {
            console.error('Error logging message:', error);
            return false;
        }
    }

    async updateUserMessageStats(userId, hasMedia = false) {
        try {
            // Skip if userId is undefined, null, or invalid
            if (!userId || typeof userId !== 'string' || userId.length < 10) {
                console.error(`updateUserMessageStats called with invalid userId: ${userId}`);
                return false;
            }

            const now = new Date();
            const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            await this.run(`
                INSERT OR REPLACE INTO user_stats
                (userId, totalMessages, totalMediaSent, lastActivityTime, lastActivityType,
                 weeklyMessageCount, monthlyMessageCount, lastWeekReset, lastMonthReset)
                VALUES (?,
                    COALESCE((SELECT totalMessages FROM user_stats WHERE userId = ?), 0) + 1,
                    COALESCE((SELECT totalMediaSent FROM user_stats WHERE userId = ?), 0) + ?,
                    CURRENT_TIMESTAMP,
                    'message',
                    CASE
                        WHEN COALESCE((SELECT lastWeekReset FROM user_stats WHERE userId = ?), '1970-01-01') < ?
                        THEN 1
                        ELSE COALESCE((SELECT weeklyMessageCount FROM user_stats WHERE userId = ?), 0) + 1
                    END,
                    CASE
                        WHEN COALESCE((SELECT lastMonthReset FROM user_stats WHERE userId = ?), '1970-01-01') < ?
                        THEN 1
                        ELSE COALESCE((SELECT monthlyMessageCount FROM user_stats WHERE userId = ?), 0) + 1
                    END,
                    CASE
                        WHEN COALESCE((SELECT lastWeekReset FROM user_stats WHERE userId = ?), '1970-01-01') < ?
                        THEN ?
                        ELSE COALESCE((SELECT lastWeekReset FROM user_stats WHERE userId = ?), ?)
                    END,
                    CASE
                        WHEN COALESCE((SELECT lastMonthReset FROM user_stats WHERE userId = ?), '1970-01-01') < ?
                        THEN ?
                        ELSE COALESCE((SELECT lastMonthReset FROM user_stats WHERE userId = ?), ?)
                    END
                )
            `, [
                userId, userId, userId, hasMedia ? 1 : 0, userId, weekStart.toISOString(),
                userId, userId, monthStart.toISOString(), userId, userId, weekStart.toISOString(),
                weekStart.toISOString(), userId, weekStart.toISOString(), userId, monthStart.toISOString(),
                monthStart.toISOString(), userId, monthStart.toISOString()
            ]);

            return true;
        } catch (error) {
            console.error('Error updating user message stats:', error);
            return false;
        }
    }

    async logGroupActivity(groupId, activityType, userId = null, details = null) {
        try {
            await this.run(`
                INSERT INTO group_activities (groupId, activityType, userId, details)
                VALUES (?, ?, ?, ?)
            `, [groupId, activityType, userId, details]);
            return true;
        } catch (error) {
            console.error('Error logging group activity:', error);
            return false;
        }
    }

    async getUserMessageStats(userId) {
        try {
            return await this.get('SELECT * FROM user_stats WHERE userId = ?', [userId]);
        } catch (error) {
            console.error('Error getting user message stats:', error);
            return null;
        }
    }

    async getGroupMessageStats(groupId, days = 7) {
        try {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

            const stats = await this.get(`
                SELECT
                    COUNT(*) as totalMessages,
                    COUNT(DISTINCT userId) as activeUsers,
                    SUM(CASE WHEN hasMedia = 1 THEN 1 ELSE 0 END) as mediaMessages,
                    SUM(CASE WHEN isForwarded = 1 THEN 1 ELSE 0 END) as forwardedMessages
                FROM messages
                WHERE groupId = ? AND timestamp >= ?
            `, [groupId, since]);

            const topUsers = await this.all(`
                SELECT userId, COUNT(*) as messageCount
                FROM messages
                WHERE groupId = ? AND timestamp >= ?
                GROUP BY userId
                ORDER BY messageCount DESC
                LIMIT 5
            `, [groupId, since]);

            return { ...stats, topUsers };
        } catch (error) {
            console.error('Error getting group message stats:', error);
            return null;
        }
    }

    async getRecentGroupActivities(groupId, limit = 10) {
        try {
            return await this.all(`
                SELECT * FROM group_activities
                WHERE groupId = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `, [groupId, limit]);
        } catch (error) {
            console.error('Error getting recent group activities:', error);
            return [];
        }
    }

    async cleanOldMessages(daysToKeep = 30) {
        try {
            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

            const result = await this.run(`
                DELETE FROM messages WHERE timestamp < ?
            `, [cutoffDate]);

            return result.changes || 0;
        } catch (error) {
            console.error('Error cleaning old messages:', error);
            return 0;
        }
    }

    // Add missing methods that are called from eventHandler
    async updateUserActivity(phoneNumber, userName = null) {
        try {
            // Validate phone number - must be digits only and proper length
            if (!phoneNumber || !/^\d{10,15}$/.test(phoneNumber)) {
                console.error(`Invalid phone number in updateUserActivity: ${phoneNumber}`);
                return false;
            }

            // Use INSERT OR IGNORE and then UPDATE to increment message count
            await this.run(`
                INSERT OR IGNORE INTO users (phoneNumber, name, messageCount, lastSeen)
                VALUES (?, ?, 0, CURRENT_TIMESTAMP)
            `, [phoneNumber, userName || 'Unknown']);

            // Update existing user with incremented message count
            await this.run(`
                UPDATE users 
                SET name = COALESCE(?, name),
                    messageCount = messageCount + 1,
                    lastSeen = CURRENT_TIMESTAMP
                WHERE phoneNumber = ?
            `, [userName, phoneNumber]);

            return true;
        } catch (error) {
            console.error('Error updating user activity:', error);
            return false;
        }
    }

    async updateGroupActivity(groupId, groupName = null, participantCount = 0) {
        try {
            // Validate group ID - must be proper WhatsApp group format
            if (!groupId || !groupId.endsWith('@g.us') || groupId.length < 20) {
                console.error(`Invalid group ID in updateGroupActivity: ${groupId}`);
                return false;
            }

            // Use INSERT OR IGNORE and then UPDATE to increment message count
            await this.run(`
                INSERT OR IGNORE INTO groups (groupId, groupName, memberCount, messageCount, lastActivity)
                VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
            `, [groupId, groupName || 'Unknown Group', participantCount || 0]);

            // Update existing group with incremented message count
            await this.run(`
                UPDATE groups 
                SET groupName = COALESCE(?, groupName),
                    memberCount = ?,
                    messageCount = messageCount + 1,
                    lastActivity = CURRENT_TIMESTAMP
                WHERE groupId = ?
            `, [groupName, participantCount || 0, groupId]);

            console.log(`[SQLite] Group activity updated successfully`);
            return true;
        } catch (error) {
            console.error('Error updating group activity:', error);
            return false;
        }
    }
}

module.exports = new SQLiteDB();