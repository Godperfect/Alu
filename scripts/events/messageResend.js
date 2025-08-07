const fs = require('fs');
const path = require('path');
const { logInfo, logError, logSuccess, logWarning, getTimestamp, getFormattedDate } = require('../../utils');
const chalk = require('chalk');

const resendSettings = new Map(); // Store per-group resend settings only

// Load resend settings
const resendSettingsPath = path.join(__dirname, '../../data/resendSettings.json');

function loadResendSettings() {
    try {
        if (fs.existsSync(resendSettingsPath)) {
            const data = fs.readFileSync(resendSettingsPath, 'utf8');
            const settings = JSON.parse(data);

            // Clear existing settings and reload
            resendSettings.clear();

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

// Check if resend is enabled for a group (defaults to true)
function isResendEnabled(groupId) {
    return resendSettings.get(groupId)?.enabled !== false; // Default to true unless explicitly disabled
}

// Toggle resend setting for a group
function toggleResendSetting(groupId, enabled) {
    resendSettings.set(groupId, { enabled });
    saveResendSettings();
    return enabled;
}

// Handle protocol messages (deletions) - Real-time detection and resend
async function handleProtocolMessage(sock, mek) {
    try {
        // Check for delete protocol message
        if (mek.message?.protocolMessage?.type === 0) { // REVOKE type
            const deletedMessageKey = mek.message.protocolMessage.key;
            const groupId = mek.key.remoteJid;

            if (deletedMessageKey && groupId.endsWith('@g.us') && isResendEnabled(groupId)) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[DELETE_DETECTED]')} Delete protocol detected for message ${deletedMessageKey.id} in group ${groupId}`);

                // Get the original message that was deleted by using the key
                try {
                    const deletedSender = deletedMessageKey.participant || deletedMessageKey.remoteJid;
                    const senderNumber = deletedSender.split('@')[0];

                    // Get sender name
                    let senderName = senderNumber;
                    try {
                        const contact = await sock.onWhatsApp(deletedSender);
                        if (contact && contact[0] && contact[0].name) {
                            senderName = contact[0].name;
                        }
                    } catch (nameError) {
                        // Use number if name fetch fails
                    }

                    // Create anti-delete notification
                    const deleteNotification = `🗑️ *Message Deleted Alert*\n\n` +
                        `• *User:* @${senderNumber}\n` +
                        `• *Time:* ${new Date().toLocaleTimeString()}\n` +
                        `• *Action:* Message was deleted\n\n` +
                        `⚠️ *Original message content was removed by sender*\n\n` +
                        `_🔄 This notification was sent because anti-delete is enabled_`;

                    // Send the delete notification immediately
                    await sock.sendMessage(groupId, {
                        text: deleteNotification,
                        mentions: [deletedSender]
                    });

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[DELETE_NOTIFIED]')} Delete notification sent for message from ${senderName}`);
                    logSuccess(`Delete event detected and notification sent`);

                } catch (error) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[DELETE_HANDLE_ERROR]')} Error handling delete: ${error.message}`);
                }
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
        version: '2.0.0',
        description: 'Real-time delete detection without message storage',
        category: 'events',
        guide: {
            en: 'This event monitors deleted messages and sends notifications without storing any messages'
        }
    },

    // Export functions for external use
    isResendEnabled,
    toggleResendSetting,

    onStart: async ({ sock }) => {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[RESEND_INIT]')} Initializing Real-time Delete Detection...`);

        // Load existing settings
        loadResendSettings();

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_REGISTERED]')} Real-time delete detection registered`);
        logSuccess('Anti-delete system initialized without storage');
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ACTIVE]')} Real-time delete detection is now active 24/7 (NO STORAGE - DEFAULT: ENABLED)`);
    },

    onChat: async ({ sock, m, messageInfo, isGroup, messageText }) => {
        try {
            // Only handle protocol messages (deletions) - this is the core functionality
            if (m.message?.protocolMessage?.type === 0) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[DELETE_PROTOCOL_DETECTED]')} Delete protocol detected in real-time`);
                await handleProtocolMessage(sock, m);
                return;
            }

            // Handle resend on/off commands only for normal text messages
            if (!isGroup || !messageText) return;

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
                toggleResendSetting(groupId, true);
                await sock.sendMessage(groupId, {
                    text: `✅ *Real-time Delete Detection Enabled*\n\nDeleted messages will be detected and notifications sent instantly.\n\n*Features:*\n• Real-time delete detection\n• No message storage\n• Instant notifications\n• Zero storage usage`,
                    mentions: [sender]
                });
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ENABLED]')} Real-time delete detection enabled for group ${messageInfo.chatName}`);
                return true;
            }

            if (messageText.toLowerCase() === 'resend off' && isAdmin) {
                toggleResendSetting(groupId, false);
                await sock.sendMessage(groupId, {
                    text: `❌ *Real-time Delete Detection Disabled*\n\nDelete notifications are now disabled for this group.`,
                    mentions: [sender]
                });
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RESEND_DISABLED]')} Real-time delete detection disabled for group ${messageInfo.chatName}`);
                return true;
            }

            if (messageText.toLowerCase() === 'resend status' && isAdmin) {
                const isEnabled = isResendEnabled(groupId);
                const status = isEnabled ? '✅ Enabled' : '❌ Disabled';
                await sock.sendMessage(groupId, {
                    text: `🔄 *Real-time Delete Detection Status*\n\n*Current Status:* ${status}\n\n*System Type:* Real-time (No Storage)\n*Detection:* Instant\n*Storage Usage:* Zero\n\n*Commands:*\n• \`resend on\` - Enable detection\n• \`resend off\` - Disable detection\n• \`resend status\` - Check status`,
                    mentions: [sender]
                });
                return true;
            }

        } catch (error) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[RESEND_CHAT_ERROR]')} Error in delete detection handler: ${error.message}`);
        }
    }
};