const fs = require('fs');
const path = require('path');
const { logInfo, logError, logSuccess, logWarning, getTimestamp, getFormattedDate } = require('../../utils');
const chalk = require('chalk');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys'); // Import the function

// Store original messages temporarily
const messageStore = new Map();
const resendSettings = new Map(); // Store per-group resend settings

// Load resend settings
const resendSettingsPath = path.join(__dirname, '../../data/resendSettings.json');

function loadResendSettings() {
    try {
        if (fs.existsSync(resendSettingsPath)) {
            const data = fs.readFileSync(resendSettingsPath, 'utf8');
            const settings = JSON.parse(data);

            // Load settings into memory
            Object.entries(settings).forEach(([groupId, setting]) => {
                resendSettings.set(groupId, setting);
            });

            return settings;
        }
    } catch (error) {
        logError(`Failed to load resend settings: ${error.message}`);
    }
    return {};
}

function saveResendSettings() {
    try {
        const settings = {};
        resendSettings.forEach((setting, groupId) => {
            settings[groupId] = setting;
        });

        // Ensure data directory exists
        const dataDir = path.dirname(resendSettingsPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(resendSettingsPath, JSON.stringify(settings, null, 2));
        logSuccess('Resend settings saved successfully');
    } catch (error) {
        logError(`Failed to save resend settings: ${error.message}`);
    }
}

// Check if resend is enabled for a group
function isResendEnabled(groupId) {
    return resendSettings.get(groupId)?.enabled || false;
}

// Toggle resend setting for a group
function toggleResendSetting(groupId, enabled) {
    resendSettings.set(groupId, { enabled });
    saveResendSettings();
    return enabled;
}

// Store message for potential resend
function storeMessage(messageId, messageData) {
    messageStore.set(messageId, {
        ...messageData,
        timestamp: Date.now()
    });

    // Clean old messages (older than 24 hours)
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const [id, data] of messageStore.entries()) {
        if (now - data.timestamp > twentyFourHours) {
            messageStore.delete(id);
        }
    }
}

// Handle message deletion
async function handleMessageDeletion(sock, messageId, groupId) {
    try {
        if (!isResendEnabled(groupId)) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RESEND_DISABLED]')} Resend is disabled for group ${groupId}`);
            return;
        }

        const originalMessage = messageStore.get(messageId);
        if (!originalMessage) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[MESSAGE_NOT_FOUND]')} Original message not found for ID: ${messageId}`);
            return;
        }

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[MESSAGE_DELETED]')} Detected deleted message from ${originalMessage.senderName} in ${originalMessage.groupName}`);

        // Create resend notification
        let resendText = `🗑️ *Message Deleted Alert*\n\n`;
        resendText += `• *User:* @${originalMessage.senderNumber}\n`;
        resendText += `• *Original Time:* ${new Date(originalMessage.timestamp).toLocaleTimeString()}\n`;
        resendText += `• *Deleted At:* ${new Date().toLocaleTimeString()}\n\n`;

        if (originalMessage.messageText) {
            resendText += `*Original Message:*\n"${originalMessage.messageText}"\n\n`;
        }

        if (originalMessage.hasMedia) {
            resendText += `*Media Type:* ${originalMessage.mediaType}\n`;
            if (originalMessage.caption) {
                resendText += `*Caption:* "${originalMessage.caption}"\n`;
            }
        }

        resendText += `_🔄 This message was automatically restored because the user deleted it_`;

        // Send the resend notification
        await sock.sendMessage(groupId, {
            text: resendText,
            mentions: [originalMessage.sender]
        });

        // If there was media, try to resend it too
        if (originalMessage.hasMedia && originalMessage.mediaBuffer) {
            try {
                const mediaMessage = {
                    caption: `🗑️ *Deleted ${originalMessage.mediaType}* from @${originalMessage.senderNumber}\n_Restored by Anti-Delete System_`,
                    mentions: [originalMessage.sender]
                };

                if (originalMessage.mediaType === 'image') {
                    mediaMessage.image = originalMessage.mediaBuffer;
                } else if (originalMessage.mediaType === 'video') {
                    mediaMessage.video = originalMessage.mediaBuffer;
                } else if (originalMessage.mediaType === 'audio') {
                    mediaMessage.audio = originalMessage.mediaBuffer;
                } else if (originalMessage.mediaType === 'document') {
                    mediaMessage.document = originalMessage.mediaBuffer;
                    mediaMessage.fileName = originalMessage.fileName || 'deleted_file';
                }

                await sock.sendMessage(groupId, mediaMessage);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MEDIA_RESENT]')} Deleted media restored for group ${originalMessage.groupName}`);
            } catch (mediaError) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[MEDIA_RESEND_FAILED]')} Failed to resend media: ${mediaError.message}`);
            }
        }

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_RESENT]')} Deleted message notification sent to ${originalMessage.groupName}`);
        logSuccess(`Deleted message restored in ${originalMessage.groupName}`);

        // Remove from store after resending
        messageStore.delete(messageId);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[RESEND_ERROR]')} Failed to handle message deletion: ${error.message}`);
        logError(`Error handling message deletion: ${error.message}`);
    }
}

// Handle incoming messages (store them)
async function handleIncomingMessage(sock, mek, messageInfo) {
    try {
        const messageId = mek.key.id;
        const groupId = mek.key.remoteJid;
        const sender = mek.key.participant || mek.key.remoteJid;

        // Only store messages from groups where resend is enabled
        if (!groupId.endsWith('@g.us') || !isResendEnabled(groupId)) {
            return;
        }

        const messageText = require('../../utils').getTextContent(mek.message);
        const senderNumber = sender.split('@')[0];
        const senderName = await require('../../utils').getSenderName(sock, sender);

        // Check for media
        let hasMedia = false;
        let mediaType = null;
        let mediaBuffer = null;
        let caption = null;
        let fileName = null;

        const contentType = Object.keys(mek.message)[0];
        if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(contentType)) {
            hasMedia = true;
            mediaType = contentType.replace('Message', '');

            try {
                // Download media for potential resend
                const quoted = mek.message[contentType];
                if (quoted) {
                    // Try to download media using baileys built-in method
                    const stream = await downloadContentFromMessage(quoted, mediaType);
                    const chunks = [];
                    for await (const chunk of stream) {
                        chunks.push(chunk);
                    }
                    mediaBuffer = Buffer.concat(chunks);
                    caption = quoted.caption;
                    fileName = quoted.fileName;
                }
            } catch (downloadError) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[MEDIA_DOWNLOAD_FAILED]')} Could not download media: ${downloadError.message}`);
            }
        }

        // Store message data
        const messageData = {
            messageId,
            groupId,
            groupName: messageInfo.chatName,
            sender,
            senderNumber,
            senderName,
            messageText,
            hasMedia,
            mediaType,
            mediaBuffer,
            caption,
            fileName,
            timestamp: Date.now()
        };

        storeMessage(messageId, messageData);

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[MESSAGE_STORED]')} Stored message ${messageId} from ${senderName} for potential resend`);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[STORE_ERROR]')} Failed to store message: ${error.message}`);
    }
}

// Handle protocol messages (deletions)
async function handleProtocolMessage(sock, mek) {
    try {
        // Check for delete protocol message
        if (mek.message?.protocolMessage?.type === 0) { // REVOKE type
            const deletedMessageId = mek.message.protocolMessage.key?.id;
            const groupId = mek.key.remoteJid;

            if (deletedMessageId && groupId.endsWith('@g.us')) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[DELETE_DETECTED]')} Delete protocol detected for message ${deletedMessageId} in group ${groupId}`);
                await handleMessageDeletion(sock, deletedMessageId, groupId);
            }
        }
    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[PROTOCOL_ERROR]')} Failed to handle protocol message: ${error.message}`);
    }
}

module.exports = {
    config: {
        name: 'messageResend',
        author: 'Luna',
        version: '1.0.0',
        description: 'Automatically resends deleted messages with notification',
        category: 'events',
        guide: {
            en: 'This event monitors deleted messages and resends them automatically'
        }
    },

    onStart: async ({ sock }) => {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[RESEND_INIT]')} Initializing Message Resend event handlers...`);

        // Load existing settings
        loadResendSettings();

        // Register event handlers
        if (!global.Luna.onEvent) {
            global.Luna.onEvent = new Map();
        }

        // Register message handlers
        global.Luna.onEvent.set('message.incoming', {
            callback: (data) => handleIncomingMessage(sock, data.m, data.messageInfo)
        });

        global.Luna.onEvent.set('message.protocol', {
            callback: (data) => handleProtocolMessage(sock, data.m)
        });

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_REGISTERED]')} Message resend handlers registered`);
        logSuccess('Message resend event handlers registered successfully');
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ACTIVE]')} Anti-delete system is now monitoring messages 24/7`);
    },

    onChat: async ({ sock, m, messageInfo, isGroup, messageText }) => {
        try {
            // Handle resend on/off commands
            if (!isGroup) return;

            const groupId = m.key.remoteJid;
            const sender = m.key.participant || m.key.remoteJid;
            const senderNumber = sender.split('@')[0];

            // Check if user is admin
            const isAdmin = messageInfo.groupMetadata &&
                           messageInfo.groupMetadata.participants &&
                           messageInfo.groupMetadata.participants.some(p =>
                               p.id.includes(senderNumber) && (p.admin === 'admin' || p.admin === 'superadmin')
                           );

            if (messageText.toLowerCase() === 'resend on' && isAdmin) {
                const enabled = toggleResendSetting(groupId, true);
                await sock.sendMessage(groupId, {
                    text: `✅ *Anti-Delete System Enabled*\n\nDeleted messages will now be automatically restored in this group.`,
                    mentions: [sender]
                });
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ENABLED]')} Anti-delete enabled for group ${messageInfo.chatName}`);
                return true;
            }

            if (messageText.toLowerCase() === 'resend off' && isAdmin) {
                const enabled = toggleResendSetting(groupId, false);
                await sock.sendMessage(groupId, {
                    text: `❌ *Anti-Delete System Disabled*\n\nDeleted messages will no longer be restored in this group.`,
                    mentions: [sender]
                });
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RESEND_DISABLED]')} Anti-delete disabled for group ${messageInfo.chatName}`);
                return true;
            }

            if (messageText.toLowerCase() === 'resend status' && isAdmin) {
                const isEnabled = isResendEnabled(groupId);
                const status = isEnabled ? '✅ Enabled' : '❌ Disabled';
                await sock.sendMessage(groupId, {
                    text: `🔄 *Anti-Delete System Status*\n\n*Current Status:* ${status}\n\n*Commands:*\n• \`resend on\` - Enable anti-delete\n• \`resend off\` - Disable anti-delete\n• \`resend status\` - Check status`,
                    mentions: [sender]
                });
                return true;
            }

            // Store incoming messages
            await handleIncomingMessage(sock, m, messageInfo);

            // Check for protocol messages (deletions)
            if (m.message?.protocolMessage) {
                await handleProtocolMessage(sock, m);
            }

        } catch (error) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[RESEND_CHAT_ERROR]')} Error in resend chat handler: ${error.message}`);
        }
    }
};