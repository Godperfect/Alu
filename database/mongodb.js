
const { MongoClient } = require('mongodb');
const { logInfo, logError, logSuccess } = require('../utils');
const config = require('../config.json');

class MongoDB {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            if (!config.database.uriMongodb) {
                logError('MongoDB URI not configured');
                return false;
            }

            this.client = new MongoClient(config.database.uriMongodb);
            await this.client.connect();
            this.db = this.client.db('lunabot');
            this.isConnected = true;
            
            logSuccess('Connected to MongoDB successfully');
            return true;
        } catch (error) {
            logError(`MongoDB connection failed: ${error.message}`);
            return false;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.isConnected = false;
            logInfo('Disconnected from MongoDB');
        }
    }

    // User data operations
    async saveUser(userData) {
        try {
            const users = this.db.collection('users');
            await users.updateOne(
                { phoneNumber: userData.phoneNumber },
                { $set: { ...userData, lastSeen: new Date() } },
                { upsert: true }
            );
            return true;
        } catch (error) {
            logError(`Failed to save user: ${error.message}`);
            return false;
        }
    }

    async getUser(phoneNumber) {
        try {
            const users = this.db.collection('users');
            return await users.findOne({ phoneNumber });
        } catch (error) {
            logError(`Failed to get user: ${error.message}`);
            return null;
        }
    }

    // Group data operations
    async saveGroup(groupData) {
        try {
            const groups = this.db.collection('groups');
            await groups.updateOne(
                { groupId: groupData.groupId },
                { $set: { ...groupData, lastActivity: new Date() } },
                { upsert: true }
            );
            return true;
        } catch (error) {
            logError(`Failed to save group: ${error.message}`);
            return false;
        }
    }

    async getGroup(groupId) {
        try {
            const groups = this.db.collection('groups');
            return await groups.findOne({ groupId });
        } catch (error) {
            logError(`Failed to get group: ${error.message}`);
            return null;
        }
    }

    // Command usage tracking
    async logCommand(commandData) {
        try {
            const commands = this.db.collection('commandLogs');
            await commands.insertOne({
                ...commandData,
                timestamp: new Date()
            });
            return true;
        } catch (error) {
            logError(`Failed to log command: ${error.message}`);
            return false;
        }
    }

    // Bot settings and configurations
    async saveBotSetting(key, value) {
        try {
            const settings = this.db.collection('botSettings');
            await settings.updateOne(
                { key },
                { $set: { key, value, updatedAt: new Date() } },
                { upsert: true }
            );
            return true;
        } catch (error) {
            logError(`Failed to save setting: ${error.message}`);
            return false;
        }
    }

    async getBotSetting(key) {
        try {
            const settings = this.db.collection('botSettings');
            const result = await settings.findOne({ key });
            return result ? result.value : null;
        } catch (error) {
            logError(`Failed to get setting: ${error.message}`);
            return null;
        }
    }
}

module.exports = new MongoDB();
