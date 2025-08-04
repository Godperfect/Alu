
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { proto: baileysProto, getContentType, jidDecode } = require("@whiskeysockets/baileys");
const config = require('./config.json');

// ============================================================================
// LOGGER UTILITIES
// ============================================================================

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const getTimestamp = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

const getDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
};

const writeToFile = (level, message) => {
    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `[${getTimestamp()}] [${getDate()}] [${level}] ${message}\n`;
    fs.appendFileSync(logFile, logEntry);
};

const logInfo = (message) => {
    const timestamp = getTimestamp();
    const date = getDate();
    console.log(chalk.blue(`[ INFO ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('INFO', message);
};

const logSuccess = (message) => {
    const timestamp = getTimestamp();
    const date = getDate();
    console.log(chalk.green(`[ SUCCESS ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('SUCCESS', message);
};

const logError = (message) => {
    const timestamp = getTimestamp();
    const date = getDate();
    console.log(chalk.red(`[ ERROR ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('ERROR', message);
};

const logWarning = (message) => {
    const timestamp = getTimestamp();
    const date = getDate();
    console.log(chalk.yellow(`[ WARNING ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('WARNING', message);
};

const logCommand = (commandName, userId, chatType, groupName = null) => {
    const timestamp = getTimestamp();
    const date = getDate();
    const location = groupName ? `${groupName} (${chatType})` : chatType;
    const message = `Command '${commandName}' executed by ${userId} in ${location}`;
    console.log(chalk.cyan(`[ COMMAND ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('COMMAND', message);
};

const logMessage = (messageData) => {
    const {
        senderName,
        senderId,
        messageText,
        chatType,
        groupName,
        hasAttachment,
        isForwarded,
        replyTo,
        fromMe
    } = messageData;

    const timestamp = getTimestamp();
    const date = getDate();

    console.log(chalk.magenta('━'.repeat(60)));
    console.log(chalk.cyan.bold('📱 MESSAGE EVENT') + chalk.gray(` [${date}, ${timestamp}]`));
    console.log(chalk.white(`👤 Sender: `) + chalk.yellow(senderName) + chalk.gray(` (${senderId})`));
    console.log(chalk.white(`📍 Location: `) + chalk.cyan(groupName || 'Private Chat'));
    console.log(chalk.white(`📝 Type: `) + chalk.green(chatType));
    console.log(chalk.white(`💬 Content: `) + chalk.white(messageText || '[Media/Attachment]'));
    console.log(chalk.white(`📎 Attachment: `) + (hasAttachment ? chalk.green('Yes') : chalk.gray('No')));
    console.log(chalk.white(`🔄 Forwarded: `) + (isForwarded ? chalk.green('Yes') : chalk.gray('No')));
    console.log(chalk.white(`↩️  Reply: `) + chalk.gray(replyTo || 'None'));
    console.log(chalk.white(`🤖 From Bot: `) + (fromMe ? chalk.green('Yes') : chalk.gray('No')));
    console.log(chalk.magenta('━'.repeat(60)));

    writeToFile('MESSAGE', JSON.stringify(messageData));
};

const logGoatBotStyle = (type, data = {}) => {
    const timestamp = getTimestamp();
    const date = getDate();

    switch (type) {
        case 'startup':
            console.clear();
            console.log(chalk.blue.bold('LUNA BOT v1.3'));
            console.log(chalk.gray(`Starting at ${date} ${timestamp}`));
            break;

        case 'ready':
            console.log(chalk.green('✅ BOT ONLINE'));
            console.log(chalk.white(`Connected as: ${data.name || 'Luna'}`));
            break;

        case 'command_load':
            console.log(chalk.blue(`●`) + chalk.white(` Command loaded: `) + chalk.yellow.bold(data.name) + 
                       (data.category ? chalk.gray(` [${data.category}]`) : ''));
            break;

        case 'event_load':
            console.log(chalk.magenta(`●`) + chalk.white(` Event loaded: `) + chalk.cyan.bold(data.name));
            break;

        case 'database':
            if (data.status === 'connected') {
                console.log(chalk.green(`✓`) + chalk.white(` Database connected: `) + chalk.green.bold(data.type.toUpperCase()));
            } else if (data.status === 'error') {
                console.log(chalk.red(`✗`) + chalk.white(` Database error: `) + chalk.red(data.error));
            }
            break;

        case 'connection':
            const statusIcons = {
                'open': chalk.green('●'),
                'close': chalk.red('●'),
                'connecting': chalk.yellow('●'),
                'reconnecting': chalk.blue('●')
            };
            const icon = statusIcons[data.status] || chalk.white('●');
            console.log(icon + chalk.white(` Connection status: `) + chalk.bold(data.status.toUpperCase()));
            break;

        case 'uptime':
            console.log(chalk.cyan(`●`) + chalk.white(` Uptime server: `) + chalk.cyan.bold(`http://localhost:${data.port}`));
            break;
    }
};

// ============================================================================
// MEDIA HANDLER UTILITIES
// ============================================================================

async function downloadMedia(message) {
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const stream = await downloadContentFromMessage(message, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

function initializeMediaHandlers(ptz) {
    ptz.sendText = (jid, text, quoted = '', options) => 
        ptz.sendMessage(jid, { text: text, ...options }, { quoted });

    ptz.downloadMediaMessage = downloadMedia;
}

// ============================================================================
// MESSAGE EDITOR UTILITIES
// ============================================================================

async function editMessage(sock, jid, text, key) {
    try {
        return await sock.sendMessage(jid, {
            text: text,
            edit: {
                key: {
                    remoteJid: jid,
                    id: key.id,
                    fromMe: true
                }
            }
        });
    } catch (error) {
        console.error("Error editing message:", error);
        throw error;
    }
}

async function editMessageFallback(sock, jid, text, key) {
    try {
        return await sock.sendMessage(jid, {
            text: text,
            quoted: { key: key }
        });
    } catch (error) {
        console.error("Error with edit fallback:", error);
        throw error;
    }
}

// ============================================================================
// MESSAGE PARSER UTILITIES
// ============================================================================

/**
 * Extracts text content from a WhatsApp message object
 * @param {Object} message - The message object from WhatsApp
 * @returns {String} - The extracted text content or empty string if no text
 */
function getTextContent(message) {
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
}

/**
 * Gets the name of a message sender
 * @param {Object} sock - The WhatsApp socket connection
 * @param {String} jid - The WhatsApp ID (JID) of the sender
 * @returns {String} - The sender's name or phone number
 */
async function getSenderName(sock, jid) {
    if (!jid) return 'Unknown';

    try {
        // Remove any suffix from JID to get just the phone number
        const number = jid.split('@')[0];

        // Try to get contact info from sock
        const contact = await sock.contactsStore?.contacts[jid];
        if (contact?.name || contact?.notify) {
            return contact.name || contact.notify;
        }

        // If no contact info is available, return the number
        return number;
    } catch (error) {
        console.error(`Error getting sender name: ${error.message}`);
        return jid.split('@')[0]; // Fallback to returning just the number
    }
}

// ============================================================================
// MESSAGE SERIALIZER UTILITIES
// ============================================================================

function smsg(ptz, m, store) {
    if (!m) return m;
    let M = baileysProto.WebMessageInfo;

    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');

        const senderJid = m.fromMe ? ptz.user.id : (m.participant || m.key.participant || m.chat || '');
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

        if (m.msg?.contextInfo?.quotedMessage) {
            m.quoted = m.msg.contextInfo.quotedMessage;
        }
    }

    return m;
}

// ============================================================================
// PERMISSION UTILITIES
// ============================================================================

// Get list of bot admins from config
const botAdmins = config.adminOnly.adminNumbers || [];

/**
 * Check if a user is a bot admin
 * @param {string} userNumber - User's phone number without special characters
 * @returns {boolean} - True if user is a bot admin
 */
const isBotAdmin = (userNumber) => {
    return botAdmins.includes(userNumber);
};

/**
 * Check if user is a group admin
 * @param {string} userNumber - User's phone number without special characters
 * @param {object} groupMetadata - Group metadata containing participants info
 * @returns {boolean} - True if user is a group admin
 */
const isGroupAdmin = (userNumber, groupMetadata) => {
    if (!groupMetadata || !groupMetadata.participants) return false;
    
    // Find admin participants in the group
    const adminParticipants = groupMetadata.participants.filter(
        participant => participant.admin === 'admin' || participant.admin === 'superadmin'
    );
    
    // Check if user is in the admin list
    return adminParticipants.some(admin => {
        const adminNumber = admin.id.split('@')[0];
        return adminNumber === userNumber;
    });
};

/**
 * Get user permission level
 * @param {string} userNumber - User's phone number without special characters
 * @param {object} groupMetadata - Group metadata containing participants info
 * @returns {number} - Permission level (0: all users, 1: group/bot admins, 2: bot admins only)
 */
const getPermissionLevel = (userNumber, groupMetadata = null) => {
    // Level 2: Bot Admin privileges - highest priority
    if (isBotAdmin(userNumber)) return 2;
    
    // Level 1: Group Admin privileges (in groups only)
    if (groupMetadata && isGroupAdmin(userNumber, groupMetadata)) return 1;
    
    // Level 0: Regular user - lowest privilege level
    return 0;
};

/**
 * Check if user has required permission level to use a command
 * @param {string} userNumber - User's phone number without special characters
 * @param {object} groupMetadata - Group metadata for checking group admin status
 * @param {number} requiredLevel - Required permission level for the command
 * @returns {boolean} - True if user has required permission
 */
const hasPermission = (userNumber, groupMetadata, requiredLevel) => {
    const userLevel = getPermissionLevel(userNumber, groupMetadata);
    return userLevel >= requiredLevel;
};

/**
 * Check if user can use the bot based on global settings
 * @param {string} userNumber - User's phone number without special characters
 * @returns {boolean} - True if user can use the bot
 */
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

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Logger functions
    logInfo,
    logSuccess,
    logError,
    logWarning,
    logCommand,
    logMessage,
    logGoatBotStyle,
    
    // Media handler functions
    downloadMedia,
    initializeMediaHandlers,
    
    // Message editor functions
    editMessage,
    editMessageFallback,
    
    // Message parser functions
    getTextContent,
    getSenderName,
    
    // Message serializer functions
    smsg,
    
    // Permission functions
    isBotAdmin,
    isGroupAdmin,
    getPermissionLevel,
    hasPermission,
    canUseBot
};
