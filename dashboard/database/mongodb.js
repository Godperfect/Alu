
const { MongoClient } = require('mongodb');
const { logInfo, logError, logSuccess } = require('../../utils');
const config = require('../../config.json');

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

    // Message tracking methods for MongoDB
    async logMessage(messageData) {
        try {
            const messages = this.db.collection('messages');
            await messages.insertOne({
                ...messageData,
                timestamp: new Date()
            });

            // Update user stats
            await this.updateUserMessageStats(messageData.userId, messageData.hasMedia);
            
            return true;
        } catch (error) {
            logError(`Failed to log message: ${error.message}`);
            return false;
        }
    }

    async updateUserMessageStats(userId, hasMedia = false) {
        try {
            const userStats = this.db.collection('userStats');
            const now = new Date();
            const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            await userStats.updateOne(
                { userId },
                {
                    $inc: {
                        totalMessages: 1,
                        totalMediaSent: hasMedia ? 1 : 0,
                        weeklyMessageCount: 1,
                        monthlyMessageCount: 1
                    },
                    $set: {
                        lastActivityTime: now,
                        lastActivityType: 'message'
                    },
                    $setOnInsert: {
                        lastWeekReset: weekStart,
                        lastMonthReset: monthStart
                    }
                },
                { upsert: true }
            );

            return true;
        } catch (error) {
            logError(`Failed to update user message stats: ${error.message}`);
            return false;
        }
    }

    async logGroupActivity(groupId, activityType, userId = null, details = null) {
        try {
            const groupActivities = this.db.collection('groupActivities');
            await groupActivities.insertOne({
                groupId,
                activityType,
                userId,
                details,
                timestamp: new Date()
            });
            return true;
        } catch (error) {
            logError(`Failed to log group activity: ${error.message}`);
            return false;
        }
    }

    async getUserMessageStats(userId) {
        try {
            const userStats = this.db.collection('userStats');
            return await userStats.findOne({ userId });
        } catch (error) {
            logError(`Failed to get user message stats: ${error.message}`);
            return null;
        }
    }

    async getGroupMessageStats(groupId, days = 7) {
        try {
            const messages = this.db.collection('messages');
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            
            const pipeline = [
                { $match: { groupId, timestamp: { $gte: since } } },
                {
                    $group: {
                        _id: null,
                        totalMessages: { $sum: 1 },
                        activeUsers: { $addToSet: '$userId' },
                        mediaMessages: { $sum: { $cond: ['$hasMedia', 1, 0] } },
                        forwardedMessages: { $sum: { $cond: ['$isForwarded', 1, 0] } }
                    }
                }
            ];

            const stats = await messages.aggregate(pipeline).toArray();
            const topUsers = await messages.aggregate([
                { $match: { groupId, timestamp: { $gte: since } } },
                { $group: { _id: '$userId', messageCount: { $sum: 1 } } },
                { $sort: { messageCount: -1 } },
                { $limit: 5 }
            ]).toArray();

            return {
                ...stats[0],
                activeUsers: stats[0]?.activeUsers?.length || 0,
                topUsers
            };
        } catch (error) {
            logError(`Failed to get group message stats: ${error.message}`);
            return null;
        }
    }

    async cleanOldMessages(daysToKeep = 30) {
        try {
            const messages = this.db.collection('messages');
            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
            
            const result = await messages.deleteMany({
                timestamp: { $lt: cutoffDate }
            });

            return result.deletedCount || 0;
        } catch (error) {
            logError(`Failed to clean old messages: ${error.message}`);
            return 0;
        }
    }

    // Add missing methods that are called from eventHandler
    async updateUserActivity(phoneNumber, userName = null) {
        try {
            if (!phoneNumber || phoneNumber.length < 10) {
                console.error(`Invalid phone number in updateUserActivity: ${phoneNumber}`);
                return false;
            }

            console.log(`[MongoDB] Updating user activity for: ${phoneNumber}`);

            const userData = {
                phoneNumber: phoneNumber,
                name: userName || 'Unknown',
                profilePic: '',
                isAdmin: false,
                isBanned: false,
                commandCount: 0
            };

            const result = await this.saveUser(userData);
            console.log(`[MongoDB] User activity update result: ${result}`);
            return result;
        } catch (error) {
            logError(`Failed to update user activity: ${error.message}`);
            return false;
        }
    }

    async updateGroupActivity(groupId, groupName = null, participantCount = 0) {
        try {
            if (!groupId) {
                console.error('Invalid group ID in updateGroupActivity');
                return false;
            }

            console.log(`[MongoDB] Updating group activity for: ${groupId} - ${groupName}`);

            const groupData = {
                groupId: groupId,
                groupName: groupName || 'Unknown Group',
                description: '',
                adminNumbers: [],
                memberCount: participantCount || 0,
                isActive: true,
                customPrefix: '',
                settings: {}
            };

            const result = await this.saveGroup(groupData);
            console.log(`[MongoDB] Group activity update result: ${result}`);
            return result;
        } catch (error) {
            logError(`Failed to update group activity: ${error.message}`);
            return false;
        }
    }

    // Add missing getUserCount and getGroupCount methods
    async getUserCount() {
        try {
            const users = this.db.collection('users');
            return await users.countDocuments();
        } catch (error) {
            logError(`Failed to get user count: ${error.message}`);
            return 0;
        }
    }

    async getGroupCount() {
        try {
            const groups = this.db.collection('groups');
            return await groups.countDocuments();
        } catch (error) {
            logError(`Failed to get group count: ${error.message}`);
            return 0;
        }
    }

    async getAllUsers() {
        try {
            const users = this.db.collection('users');
            return await users.find({}).sort({ lastSeen: -1 }).toArray();
        } catch (error) {
            logError(`Failed to get all users: ${error.message}`);
            return [];
        }
    }

    async getAllGroups() {
        try {
            const groups = this.db.collection('groups');
            return await groups.find({}).sort({ lastActivity: -1 }).toArray();
        } catch (error) {
            logError(`Failed to get all groups: ${error.message}`);
            return [];
        }
    }

    // Add raw database query methods for compatibility
    async all(sql, params = []) {
        // MongoDB doesn't use SQL, but we need this for compatibility
        // This method should be implemented based on the specific query
        logError('SQL queries not supported in MongoDB. Use specific methods instead.');
        return [];
    }

    async get(sql, params = []) {
        // MongoDB doesn't use SQL, but we need this for compatibility
        logError('SQL queries not supported in MongoDB. Use specific methods instead.');
        return null;
    }

    async run(sql, params = []) {
        // MongoDB doesn't use SQL, but we need this for compatibility
        logError('SQL queries not supported in MongoDB. Use specific methods instead.');
        return { changes: 0 };
    }
}

module.exports = new MongoDB();
