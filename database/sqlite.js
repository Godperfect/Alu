const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { logInfo, logError, logSuccess } = require('../utils');

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

    async initializeTables() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phoneNumber TEXT UNIQUE NOT NULL,
                name TEXT,
                profilePic TEXT,
                isAdmin BOOLEAN DEFAULT 0,
                isBanned BOOLEAN DEFAULT 0,
                commandCount INTEGER DEFAULT 0,
                lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                groupId TEXT UNIQUE NOT NULL,
                groupName TEXT,
                description TEXT,
                adminNumbers TEXT,
                memberCount INTEGER DEFAULT 0,
                isActive BOOLEAN DEFAULT 1,
                customPrefix TEXT,
                settings TEXT,
                lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS commandLogs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                commandName TEXT NOT NULL,
                userId TEXT NOT NULL,
                groupId TEXT,
                success BOOLEAN DEFAULT 1,
                executionTime INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS botSettings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS cooldowns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                commandName TEXT NOT NULL,
                expiresAt DATETIME NOT NULL,
                UNIQUE(userId, commandName)
            )`
        ];

        for (const table of tables) {
            await this.run(table);
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
                (phoneNumber, name, profilePic, isAdmin, isBanned, commandCount, lastSeen) 
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
            await this.run(sql, [
                userData.phoneNumber,
                userData.name || '',
                userData.profilePic || '',
                userData.isAdmin || 0,
                userData.isBanned || 0,
                userData.commandCount || 0
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
                (groupId, groupName, description, adminNumbers, memberCount, customPrefix, settings, lastActivity) 
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
            await this.run(sql, [
                groupData.groupId,
                groupData.groupName || '',
                groupData.description || '',
                JSON.stringify(groupData.adminNumbers || []),
                groupData.memberCount || 0,
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
            const result = await this.db.get('SELECT COUNT(*) as count FROM users');
            return result.count || 0;
        } catch (error) {
            console.error('Error getting user count:', error);
            return 0;
        }
    }

    async getGroupCount() {
        try {
            const result = await this.db.get('SELECT COUNT(*) as count FROM groups');
            return result.count || 0;
        } catch (error) {
            console.error('Error getting group count:', error);
            return 0;
        }
    }

    async getAllUsers() {
        try {
            const users = await this.db.all('SELECT * FROM users ORDER BY lastSeen DESC');
            return users || [];
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }

    async getAllGroups() {
        try {
            const groups = await this.db.all('SELECT * FROM groups ORDER BY lastActivity DESC');
            return groups || [];
        } catch (error) {
            console.error('Error getting all groups:', error);
            return [];
        }
    }

    async updateUserActivity(userNumber, userName = null) {
        try {
            const now = new Date().toISOString();
            await this.db.run(`
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
            await this.db.run(`
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
}

module.exports = new SQLiteDB();