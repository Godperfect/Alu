const { logInfo, logError, getSenderName } = require('../../utils');
const db = require('../../dashboard/connectDB');
const { config } = require('../../config/globals');

class DataHandler {
    constructor() {
        this.userCache = new Map();
        this.groupCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async checkUserData(sock, m) {
        try {
            const userNumber = m.key.remoteJid.replace('@s.whatsapp.net', '');
            const senderName = getSenderName(m);

            // Check cache first
            if (this.userCache.has(userNumber)) {
                const cachedUser = this.userCache.get(userNumber);
                if (Date.now() - cachedUser.lastAccess < this.cacheTimeout) {
                    return cachedUser.data;
                }
            }

            // Get from database
            let userData = await db.getUser(userNumber);

            if (!userData) {
                // Create new user
                userData = {
                    phoneNumber: userNumber,
                    name: senderName,
                    profilePic: '',
                    isAdmin: config.adminOnly.adminNumbers.includes(userNumber),
                    isBanned: false,
                    commandCount: 0,
                    lastSeen: new Date(),
                    createdAt: new Date()
                };

                await db.saveUser(userData);
                logInfo(`New user registered: ${senderName} (${userNumber})`);
            } else {
                // Update last seen and name if changed
                if (userData.name !== senderName || 
                    new Date() - new Date(userData.lastSeen) > 60000) {
                    userData.name = senderName;
                    userData.lastSeen = new Date();
                    await db.saveUser(userData);
                }
            }

            // Cache the user data
            this.userCache.set(userNumber, {
                data: userData,
                lastAccess: Date.now()
            });

            return userData;
        } catch (error) {
            logError(`Error checking user data: ${error.message}`);
            return null;
        }
    }

    async checkGroupData(sock, m) {
        try {
            if (!m.key.remoteJid.endsWith('@g.us')) {
                return null; // Not a group
            }

            const groupId = m.key.remoteJid;

            // Check cache first
            if (this.groupCache.has(groupId)) {
                const cachedGroup = this.groupCache.get(groupId);
                if (Date.now() - cachedGroup.lastAccess < this.cacheTimeout) {
                    return cachedGroup.data;
                }
            }

            // Get from database
            let groupData = await db.getGroup(groupId);

            if (!groupData) {
                // Get group metadata from WhatsApp
                try {
                    const groupMeta = await sock.groupMetadata(groupId);

                    groupData = {
                        groupId: groupId,
                        groupName: groupMeta.subject || 'Unknown Group',
                        description: groupMeta.desc || '',
                        adminNumbers: groupMeta.participants
                            .filter(p => p.admin)
                            .map(p => p.id.replace('@s.whatsapp.net', '')),
                        memberCount: groupMeta.participants.length,
                        isActive: true,
                        customPrefix: '',
                        settings: {},
                        lastActivity: new Date(),
                        createdAt: new Date()
                    };

                    await db.saveGroup(groupData);
                    logInfo(`New group registered: ${groupData.groupName}`);
                } catch (metaError) {
                    logError(`Failed to get group metadata: ${metaError.message}`);
                    return null;
                }
            } else {
                // Update last activity
                groupData.lastActivity = new Date();
                await db.saveGroup(groupData);
            }

            // Cache the group data
            this.groupCache.set(groupId, {
                data: groupData,
                lastAccess: Date.now()
            });

            return groupData;
        } catch (error) {
            logError(`Error checking group data: ${error.message}`);
            return null;
        }
    }

    async validatePermissions(userNumber, groupId = null, requiredLevel = 0) {
        try {
            const userData = await db.getUser(userNumber);

            if (!userData) {
                return false;
            }

            if (userData.isBanned) {
                return false;
            }

            // Check if user is bot admin
            if (userData.isAdmin || config.adminOnly.adminNumbers.includes(userNumber)) {
                return true;
            }

            // For group-specific permissions
            if (groupId && requiredLevel > 0) {
                const groupData = await db.getGroup(groupId);
                if (groupData && groupData.adminNumbers.includes(userNumber)) {
                    return true;
                }
            }

            return requiredLevel === 0;
        } catch (error) {
            logError(`Error validating permissions: ${error.message}`);
            return false;
        }
    }

    async incrementCommandCount(userNumber) {
        try {
            const userData = await db.getUser(userNumber);
            if (userData) {
                userData.commandCount = (userData.commandCount || 0) + 1;
                await db.saveUser(userData);
            }
        } catch (error) {
            logError(`Error incrementing command count: ${error.message}`);
        }
    }

    async logCommandUsage(commandName, userNumber, groupId = null, success = true, executionTime = 0) {
        try {
            await db.logCommand({
                commandName,
                userId: userNumber,
                groupId,
                success,
                executionTime,
                timestamp: new Date()
            });
        } catch (error) {
            logError(`Error logging command usage: ${error.message}`);
        }
    }

    async logMessage(messageInfo) {
        try {
            // Extract userId properly from different message formats
            let userId = null;

            // Try multiple approaches to extract userId
            if (messageInfo.key) {
                if (messageInfo.key.participant && messageInfo.key.participant.endsWith('@s.whatsapp.net')) {
                    // Group message - participant is the sender
                    userId = messageInfo.key.participant.replace('@s.whatsapp.net', '');
                } else if (messageInfo.key.remoteJid && messageInfo.key.remoteJid.endsWith('@s.whatsapp.net')) {
                    // Private message - remoteJid is the sender
                    userId = messageInfo.key.remoteJid.replace('@s.whatsapp.net', '');
                } else if (messageInfo.key.fromMe && messageInfo.key.remoteJid.endsWith('@g.us')) {
                    // Bot's own message in group - skip logging
                    return false;
                }
            }

            // Validate userId - must be a proper phone number
            if (userId && !/^\d{10,15}$/.test(userId)) {
                console.log(`[WARN] Invalid userId format, skipping message log: ${userId}`);
                return false;
            }

            // Fallback to sender field
            if (!userId && messageInfo.sender) {
                userId = messageInfo.sender.replace(/[^0-9]/g, '');
            }

            // Final validation - userId must be a valid phone number (at least 10 digits)
            if (!userId || userId.length < 10) {
                console.log(`Skipping message log - invalid userId: ${userId}`);
                return false;
            }

            const messageData = {
                messageId: messageInfo.key?.id || messageInfo.id || Date.now().toString(),
                userId: userId,
                groupId: messageInfo.key?.remoteJid?.endsWith('@g.us') ? messageInfo.key.remoteJid : null,
                messageType: this.getMessageType(messageInfo),
                messageLength: this.getMessageLength(messageInfo),
                hasMedia: this.hasMedia(messageInfo),
                isForwarded: messageInfo.message?.contextInfo?.isForwarded || false,
                isReply: !!messageInfo.message?.contextInfo?.quotedMessage
            };

            await db.logMessage(messageData);
            logInfo(`Message logged for user ${messageData.userId}`);
        } catch (error) {
            logError(`Error logging message: ${error.message}`);
        }
    }

    async logGroupActivity(groupId, activityType, userId = null, details = null) {
        try {
            await db.logGroupActivity(groupId, activityType, userId, details);
        } catch (error) {
            logError(`Error logging group activity: ${error.message}`);
        }
    }

    getMessageType(messageInfo) {
        const message = messageInfo.message;
        if (!message) return 'unknown';

        if (message.conversation || message.extendedTextMessage) return 'text';
        if (message.imageMessage) return 'image';
        if (message.videoMessage) return 'video';
        if (message.audioMessage) return 'audio';
        if (message.documentMessage) return 'document';
        if (message.stickerMessage) return 'sticker';
        if (message.locationMessage) return 'location';
        if (message.contactMessage) return 'contact';

        return 'other';
    }

    getMessageLength(messageInfo) {
        const message = messageInfo.message;
        if (message?.conversation) return message.conversation.length;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text.length;
        return 0;
    }

    hasMedia(messageInfo) {
        const message = messageInfo.message;
        return !!(message?.imageMessage || message?.videoMessage || 
                 message?.audioMessage || message?.documentMessage || 
                 message?.stickerMessage);
    }

    async getUserMessageStats(userId) {
        try {
            return await db.getUserMessageStats(userId);
        } catch (error) {
            logError(`Error getting user message stats: ${error.message}`);
            return null;
        }
    }

    async getGroupMessageStats(groupId, days = 7) {
        try {
            return await db.getGroupMessageStats(groupId, days);
        } catch (error) {
            logError(`Error getting group message stats: ${error.message}`);
            return null;
        }
    }

    clearCache() {
        this.userCache.clear();
        this.groupCache.clear();
        logInfo('Data handler cache cleared');
    }

    getCacheStats() {
        return {
            userCacheSize: this.userCache.size,
            groupCacheSize: this.groupCache.size,
            cacheTimeout: this.cacheTimeout
        };
    }
}

module.exports = new DataHandler();