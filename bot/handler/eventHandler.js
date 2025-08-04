const fs = require('fs');
const { logError, logMessage, logInfo, logCommand } = require('../../utils/logger');
const { config } = require('../../config/globals');
const { getTextContent, getSenderName } = require('../../utils/messageParser');
const handlerAction = require('./handlerAction');
const DatabaseManager = require('../managers/databaseManager');

let db = null;

const initializeMessageListener = (sock, store) => {
    // Initialize database
    if (!db) {
        db = new DatabaseManager();
        db.initialize();
    }

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const message = m.messages[0];
            if (!message.message) return;

            const messageText = getTextContent(message);
            const senderName = getSenderName(message);
            const senderId = message.key.participant || message.key.remoteJid.replace('@s.whatsapp.net', '');
            const isGroup = message.key.remoteJid.includes('@g.us');
            const groupName = isGroup ? await getGroupName(sock, message.key.remoteJid) : null;
            const fromMe = message.key.fromMe;

            // Create structured message data
            const messageData = {
                messageId: message.key.id,
                senderId: senderId,
                senderName: senderName,
                chatId: message.key.remoteJid,
                chatType: isGroup ? 'Group Chat' : 'Private Chat',
                groupName: groupName,
                messageText: messageText,
                hasAttachment: hasMediaAttachment(message),
                isForwarded: message.message.extendedTextMessage?.contextInfo?.forwardingScore > 0,
                replyTo: getReplyInfo(message),
                reactions: message.reactions || [],
                fromMe: fromMe,
                timestamp: new Date(message.messageTimestamp * 1000),
                raw: message
            };

            // Log message with beautiful structure
            logMessage(messageData);

            // Save user data to database
            if (!fromMe && db) {
                await saveUserData(senderId, senderName);
            }

            // Skip processing bot's own messages unless selflisten is enabled
            if (fromMe && !config.messageHandling.selflisten) return;

            // Process command or onChat
            await handlerAction.handleMessage(sock, message, messageData);

        } catch (error) {
            logError('Error in message handler: ' + error.message);
        }
    });
};

const getGroupName = async (sock, groupId) => {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        return groupMetadata.subject;
    } catch {
        return 'Unknown Group';
    }
};

const hasMediaAttachment = (message) => {
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    return mediaTypes.some(type => message.message[type]);
};

const getReplyInfo = (message) => {
    const contextInfo = message.message.extendedTextMessage?.contextInfo || 
                       message.message.imageMessage?.contextInfo ||
                       message.message.videoMessage?.contextInfo;

    if (contextInfo?.quotedMessage) {
        return `@${contextInfo.participant?.replace('@s.whatsapp.net', '') || 'Unknown'} - "${getQuotedText(contextInfo.quotedMessage)}"`;
    }
    return null;
};

const getQuotedText = (quotedMessage) => {
    if (quotedMessage.conversation) return quotedMessage.conversation;
    if (quotedMessage.extendedTextMessage?.text) return quotedMessage.extendedTextMessage.text;
    return '[Media]';
};

const saveUserData = async (userId, userName) => {
    try {
        let userData = await db.getUser(userId);
        if (!userData) {
            await db.setUser(userId, {
                name: userName,
                exp: 0,
                money: 1000,
                banned: 0,
                userData: {}
            });
        }
    } catch (error) {
        logError(`Failed to save user data: ${error.message}`);
    }
};

module.exports = { initializeMessageListener };