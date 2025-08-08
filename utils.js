const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const config = require('./config.json');
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { proto: baileysProto, getContentType, jidDecode } = require("@whiskeysockets/baileys");

// Enhanced Logger functions with timestamps and better formatting
const getTimestamp = () => {
    // Use timezone from global config if available, otherwise use system default
    const timezone = global.config?.timezone || 'America/New_York'; // Default to US Eastern
    const now = new Date();
    
    try {
        // Try to use the configured timezone
        const timeInTimezone = new Date(now.toLocaleString("en-US", {timeZone: timezone}));
        const hours = String(timeInTimezone.getHours()).padStart(2, '0');
        const minutes = String(timeInTimezone.getMinutes()).padStart(2, '0');
        const seconds = String(timeInTimezone.getSeconds()).padStart(2, '0');
        return chalk.gray(`[${hours}:${minutes}:${seconds}]`);
    } catch (error) {
        // Fallback to system timezone if configured timezone is invalid
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return chalk.gray(`[${hours}:${minutes}:${seconds}]`);
    }
};

/**
 * Get formatted date
 * @returns {string} Formatted date in [YYYY-MM-DD] format
 */
const getFormattedDate = () => {
    // Use timezone from global config if available, otherwise use system default
    const timezone = global.config?.timezone || 'America/New_York'; // Default to US Eastern
    const now = new Date();
    
    try {
        // Try to use the configured timezone
        const dateInTimezone = new Date(now.toLocaleString("en-US", {timeZone: timezone}));
        const year = dateInTimezone.getFullYear();
        const month = String(dateInTimezone.getMonth() + 1).padStart(2, '0');
        const day = String(dateInTimezone.getDate()).padStart(2, '0');
        return chalk.gray(`[${year}-${month}-${day}]`);
    } catch (error) {
        // Fallback to system timezone if configured timezone is invalid
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return chalk.gray(`[${year}-${month}-${day}]`);
    }
};

const logInfo = (message) => {
    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[INFO]')} ${message}`);
};

const logSuccess = (message) => {
    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SUCCESS]')} ${message}`);
};

const logError = (message) => {
    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${message}`);
};

const logWarning = (message) => {
    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[WARNING]')} ${message}`);
};

const logMessage = (details) => {
    const { messageType, chatName, senderName, messageText, hasAttachment, attachmentType, isForwarded, isReply, isReaction, reaction, fromMe, timestamp, messageId, remoteJid, sender } = details;

    // Create JSON structure for message log
    const messageLog = {
        timestamp: timestamp || new Date().toISOString(),
        messageId: messageId || 'unknown',
        remoteJid: remoteJid || 'unknown',
        sender: {
            name: senderName || 'Unknown',
            number: sender || 'unknown',
            fromMe: fromMe || false
        },
        chat: {
            name: chatName || 'Unknown',
            type: messageType || 'unknown'
        },
        message: {
            text: messageText || '',
            hasAttachment: hasAttachment || false,
            attachmentType: attachmentType || null,
            isForwarded: isForwarded || false,
            isReply: isReply || false,
            isReaction: isReaction || false,
            reaction: reaction || null
        }
    };

    // Store in global logs array if it exists
    if (global.messageLogs) {
        global.messageLogs.push(messageLog);
        // Keep only last 1000 logs to prevent memory issues
        if (global.messageLogs.length > 1000) {
            global.messageLogs = global.messageLogs.slice(-1000);
        }
    }

    // Log JSON structure with colors
    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[MESSAGE_JSON]')}`);
    console.log(JSON.stringify(messageLog, null, 2));
    
    // Simple one-liner for quick reading (optional, can be disabled)
    if (global.config?.logging?.showSimpleFormat !== false) {
        const typeColor = messageType === 'private' ? chalk.cyan : messageType === 'group' ? chalk.green : chalk.magenta;
        const typeDisplay = typeColor(`[${messageType.toUpperCase()}]`);
        const senderDisplay = fromMe ? chalk.yellow('BOT') : chalk.white(senderName || 'Unknown');
        const chatDisplay = messageType === 'private' ? chalk.cyan(chatName) : chalk.green(chatName);
        
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[MESSAGE]')} ${typeDisplay} ${senderDisplay} ${chalk.gray('→')} ${chatDisplay}`);
        
        if (messageText) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.gray('[CONTENT]')} ${chalk.white(messageText.substring(0, 100))}${messageText.length > 100 ? chalk.gray('...') : ''}`);
        }
    }
};

const logCommand = (command, user, chatType = 'private', executionTime = 0, success = true) => {
    const commandLog = {
        timestamp: new Date().toISOString(),
        command: command,
        user: user,
        chatType: chatType,
        executionTime: executionTime,
        success: success
    };

    // Store in global logs array
    if (global.commandLogs) {
        global.commandLogs.push(commandLog);
        if (global.commandLogs.length > 500) {
            global.commandLogs = global.commandLogs.slice(-500);
        }
    }

    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[COMMAND_JSON]')}`);
    console.log(JSON.stringify(commandLog, null, 2));
    
    if (global.config?.logging?.showSimpleFormat !== false) {
        const typeColor = chatType === 'private' ? chalk.cyan : chalk.green;
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[COMMAND]')} ${chalk.white(command)} ${chalk.gray('by')} ${chalk.white(user)} ${chalk.gray('in')} ${typeColor(chatType)}`);
    }
};

const logEvent = (eventType, details, metadata = {}) => {
    const eventLog = {
        timestamp: new Date().toISOString(),
        eventType: eventType,
        details: details,
        metadata: metadata
    };

    // Store in global logs array
    if (global.eventLogs) {
        global.eventLogs.push(eventLog);
        if (global.eventLogs.length > 500) {
            global.eventLogs = global.eventLogs.slice(-500);
        }
    }

    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.magenta('[EVENT_JSON]')}`);
    console.log(JSON.stringify(eventLog, null, 2));
    
    if (global.config?.logging?.showSimpleFormat !== false) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.magenta('[EVENT]')} ${chalk.white(eventType)} ${chalk.gray('-')} ${details}`);
    }
};

const logConnection = (status, details = '') => {
    const statusColor = status === 'connected' ? chalk.green : status === 'connecting' ? chalk.yellow : chalk.red;
    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[CONNECTION]')} ${statusColor(status.toUpperCase())} ${details}`);
};

const logDatabase = (operation, status, details = '', queryTime = 0) => {
    const dbLog = {
        timestamp: new Date().toISOString(),
        operation: operation,
        status: status,
        details: details,
        queryTime: queryTime
    };

    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[DATABASE_JSON]')}`);
    console.log(JSON.stringify(dbLog, null, 2));
    
    const statusColor = status === 'success' ? chalk.green : chalk.red;
    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[DATABASE]')} ${chalk.white(operation)} ${statusColor(status.toUpperCase())} ${details}`);
};

const logMessageDetails = (details) => {
    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.magenta('[MESSAGE_DETAILS]')}`, details);
};

// Media handler functions
const initializeMediaHandlers = (sock) => {
    // Initialize media download handlers
    global.downloadM = async (messageContent) => {
        return await downloadMedia(messageContent);
    };
};

const downloadMedia = async (messageContent) => {
    try {
        let mime = (messageContent.msg || messageContent).mimetype || '';
        let messageType = messageContent.mtype ? messageContent.mtype.replace(/Message/gi, '') : mime.split('/')[0];
        const stream = await downloadContentFromMessage(messageContent, messageType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    } catch (error) {
        logError(`Failed to download media: ${error.message}`);
        return null;
    }
};

// Message editor functions
const editMessage = async (sock, key, text) => {
    try {
        await sock.sendMessage(key.remoteJid, { 
            text: text,
            edit: key 
        });
        return true;
    } catch (error) {
        return await editMessageFallback(sock, key, text);
    }
};

const editMessageFallback = async (sock, key, text) => {
    try {
        await sock.sendMessage(key.remoteJid, { 
            text: `${text}\n\n_Message edited_`,
            quoted: { key }
        });
        return true;
    } catch (error) {
        logError(`Failed to edit message: ${error.message}`);
        return false;
    }
};

// Message parser functions
const getTextContent = (message) => {
    if (!message) return '';

    try {
        // Extract text based on message type
        if (message.conversation) return message.conversation;
        if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message.imageMessage?.caption) return message.imageMessage.caption;
        if (message.videoMessage?.caption) return message.videoMessage.caption;
        if (message.documentMessage?.caption) return message.documentMessage.caption;
        if (message.documentWithCaptionMessage?.message?.documentMessage?.caption) 
            return message.documentWithCaptionMessage.message.documentMessage.caption;
        if (message.viewOnceMessage?.message) 
            return getTextContent(message.viewOnceMessage.message);
        if (message.viewOnceMessageV2?.message) 
            return getTextContent(message.viewOnceMessageV2.message);
        if (message.templateButtonReplyMessage?.selectedDisplayText) 
            return message.templateButtonReplyMessage.selectedDisplayText;
        if (message.buttonsResponseMessage?.selectedDisplayText) 
            return message.buttonsResponseMessage.selectedDisplayText;
        if (message.listResponseMessage?.title) 
            return message.listResponseMessage.title;
    } catch (error) {
        console.error(`Error extracting text content: ${error.message}`);
    }

    return '';
};

const getSenderName = (m) => {
    return m.pushName || m.verifiedBizName || 'Unknown';
};

const getMessageType = (message) => {
    if (!message) return 'unknown';

    const messageTypes = Object.keys(message);
    if (messageTypes.length === 0) return 'unknown';

    return messageTypes[0];
};

const hasMedia = (message) => {
    if (!message) return false;

    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    return mediaTypes.some(type => message[type]);
};

const getMediaInfo = (message) => {
    if (!message) return null;

    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];

    for (const type of mediaTypes) {
        if (message[type]) {
            return {
                type: type.replace('Message', ''),
                mimetype: message[type].mimetype,
                fileLength: message[type].fileLength,
                fileName: message[type].fileName || null,
                caption: message[type].caption || null
            };
        }
    }

    return null;
};

// Message serializer functions
const smsg = (sock, m, store) => {
    if (!m) return m;
    let M = baileysProto.WebMessageInfo;

    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');

        const senderJid = m.fromMe ? sock.user.id : (m.participant || m.key.participant || m.chat || '');
        m.sender = jidDecode(senderJid)?.user || senderJid;

        if (m.isGroup) {
            m.participant = jidDecode(m.key.participant)?.user || m.key.participant || '';
        }
    }

    if (m.message) {
        m.mtype = getContentType(m.message);
        m.msg = (m.mtype == 'viewOnceMessage') 
            ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)]
            : m.message[m.mtype];

        m.body = m.message.conversation || m.msg?.caption || m.msg?.text 
            || (m.mtype == 'listResponseMessage' && m.msg?.singleSelectReply?.selectedRowId)
            || (m.mtype == 'buttonsResponseMessage' && m.msg?.selectedButtonId)
            || (m.mtype == 'viewOnceMessage' && m.msg?.caption) 
            || m.text;

        m.text = getTextContent(m.message); // Use the helper function to get text content
        m.quoted = m.msg?.contextInfo ? m.msg.contextInfo.quotedMessage : null;

        if (m.quoted) {
            let type = getContentType(m.quoted);
            m.quoted = m.quoted[type];
            if (['productMessage'].includes(type)) {
                type = getContentType(m.quoted);
                m.quoted = m.quoted[type];
            }
            if (typeof m.quoted === 'string') m.quoted = {
                text: m.quoted
            };
            m.quoted.mtype = type;
            m.quoted.id = m.msg.contextInfo.stanzaId;
            m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat;
            m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false;
            m.quoted.sender = jidDecode(m.msg.contextInfo.participant);
            m.quoted.fromMe = m.quoted.sender === sock.decodeJid(sock.user.id);
            m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || '';
        }
    }

    return m;
};

// Permission functions
const isBotAdmin = (userNumber) => {
    return config.adminOnly.adminNumbers.includes(userNumber);
};

const isGroupAdmin = async (sock, groupId, userNumber) => {
    try {
        const groupMeta = await sock.groupMetadata(groupId);
        const participant = groupMeta.participants.find(p => p.id === userNumber + '@s.whatsapp.net');
        return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
    } catch (error) {
        logError(`Failed to check group admin status: ${error.message}`);
        return false;
    }
};

const getPermissionLevel = (userNumber, groupId = null, sock = null) => {
    if (isBotAdmin(userNumber)) return 3; // Bot admin (level 3)
    if (groupId && sock) {
        // Use await for async operation
        if (isGroupAdmin(sock, groupId, userNumber)) return 2; // Group admin (level 2)
    }
    return 1; // Regular user (level 1)
};

const hasPermission = (userNumber, requiredLevel, groupData = null, sock = null) => {
    const userLevel = getPermissionLevel(userNumber, groupData ? groupData.id : null, sock);
    return userLevel >= requiredLevel;
};

const canUseBot = (userNumber) => {
    // If admin-only mode is enabled, only bot admins can use it
    if (config.adminOnly.enable) {
        return isBotAdmin(userNumber);
    }

    // If whitelist mode is enabled, only whitelisted users can use it
    if (config.whiteListMode.enable) {
        return config.whiteListMode.allowedNumbers.includes(userNumber);
    }

    // Otherwise anyone can use the bot
    return true;
};

module.exports = {
    // Logger functions
    logInfo,
    logSuccess,
    logError,
    logWarning,
    logMessage,
    logCommand,
    logEvent,
    logConnection,
    logDatabase,
    logMessageDetails,
    getTimestamp,
    getFormattedDate,

    // Media handler functions
    initializeMediaHandlers,
    downloadMedia,

    // Message editor functions
    editMessage,
    editMessageFallback,

    // Message parser functions
    getTextContent,
    getSenderName,
    getMessageType,
    hasMedia,
    getMediaInfo,

    // Message serializer functions
    smsg,

    // Permission functions
    isBotAdmin,
    isGroupAdmin,
    getPermissionLevel,
    hasPermission,
    canUseBot
};