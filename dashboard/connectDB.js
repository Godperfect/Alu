
const mongoDB = require('./database/mongodb');
const sqliteDB = require('./database/sqlite');
const { logInfo, logError, logSuccess } = require('../utils');
const config = require('../config.json');

class DatabaseManager {
    constructor() {
        this.mongodb = mongoDB;
        this.sqlite = sqliteDB;
        this.primaryDB = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            // Always connect to SQLite as fallback
            await this.sqlite.connect();
            this.primaryDB = this.sqlite;

            // Try to connect to MongoDB if configured
            if (config.database.type === 'mongodb' && config.database.uriMongodb) {
                const mongoConnected = await this.mongodb.connect();
                if (mongoConnected) {
                    this.primaryDB = this.mongodb;
                }
            }

            this.isConnected = true;
            return true;
        } catch (error) {
            logError(`Database connection failed: ${error.message}`);
            return false;
        }
    }

    async disconnect() {
        if (this.mongodb.isConnected) {
            await this.mongodb.disconnect();
        }
        if (this.sqlite.isConnected) {
            await this.sqlite.close();
        }
        this.isConnected = false;
        logInfo('All database connections closed');
    }

    // Wrapper methods that use the primary database
    async saveUser(userData) {
        if (!this.isConnected) return false;
        return await this.primaryDB.saveUser(userData);
    }

    async getUser(phoneNumber) {
        if (!this.isConnected) return null;
        return await this.primaryDB.getUser(phoneNumber);
    }

    async saveGroup(groupData) {
        if (!this.isConnected) return false;
        return await this.primaryDB.saveGroup(groupData);
    }

    async getGroup(groupId) {
        if (!this.isConnected) return null;
        return await this.primaryDB.getGroup(groupId);
    }

    async logCommand(commandData) {
        if (!this.isConnected) return false;
        return await this.primaryDB.logCommand(commandData);
    }

    async saveBotSetting(key, value) {
        if (!this.isConnected) return false;
        return await this.primaryDB.saveBotSetting(key, value);
    }

    async getBotSetting(key) {
        if (!this.isConnected) return null;
        return await this.primaryDB.getBotSetting(key);
    }

    // Health check
    getStatus() {
        return {
            connected: this.isConnected,
            isConnected: this.isConnected,
            primaryDB: this.primaryDB === this.mongodb ? 'MongoDB' : 'SQLite',
            mongodb: this.mongodb ? this.mongodb.isConnected : false,
            sqlite: this.sqlite ? this.sqlite.isConnected : false
        };
    }

    // Message tracking wrapper methods
    async logMessage(messageData) {
        if (!this.isConnected) return false;
        return await this.primaryDB.logMessage(messageData);
    }

    async updateUserMessageStats(userId, hasMedia = false) {
        if (!this.isConnected) return false;
        return await this.primaryDB.updateUserMessageStats(userId, hasMedia);
    }

    async getUserCount() {
        if (!this.isConnected) return 0;
        return await this.primaryDB.getUserCount();
    }

    async getGroupCount() {
        if (!this.isConnected) return 0;
        return await this.primaryDB.getGroupCount();
    }

    async logGroupActivity(groupId, activityType, userId = null, details = null) {
        if (!this.isConnected) return false;
        return await this.primaryDB.logGroupActivity(groupId, activityType, userId, details);
    }

    async getUserMessageStats(userId) {
        if (!this.isConnected) return null;
        return await this.primaryDB.getUserMessageStats(userId);
    }

    async getGroupMessageStats(groupId, days = 7) {
        if (!this.isConnected) return null;
        return await this.primaryDB.getGroupMessageStats(groupId, days);
    }

    async getRecentGroupActivities(groupId, limit = 10) {
        if (!this.isConnected) return [];
        return await this.primaryDB.getRecentGroupActivities(groupId, limit);
    }

    async cleanOldMessages(daysToKeep = 30) {
        if (!this.isConnected) return 0;
        return await this.primaryDB.cleanOldMessages(daysToKeep);
    }

    async getUserCount() {
        if (!this.isConnected) return 0;
        return await this.primaryDB.getUserCount();
    }

    async getGroupCount() {
        if (!this.isConnected) return 0;
        return await this.primaryDB.getGroupCount();
    }

    async getAllUsers() {
        if (!this.isConnected) return [];
        return await this.primaryDB.getAllUsers();
    }

    async getAllGroups() {
        if (!this.isConnected) return [];
        return await this.primaryDB.getAllGroups();
    }
}

module.exports = new DatabaseManager();
