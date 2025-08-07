const { logInfo, logError, logSuccess, logWarning, getTimestamp, getFormattedDate } = require('../../utils');
const chalk = require('chalk');

// Real-time message tracking without storage
const activeMessageTracking = new Map(); // Track only active conversations
const resendSettings = new Map(); // Store per-group resend settings
const messageBuffer = new Map(); // Very short-term buffer (30 seconds max)

// Check if resend is enabled for a group (defaults to true)
function isResendEnabled(groupId) {
    return resendSettings.get(groupId)?.enabled !== false;
}

// Toggle resend setting for a group
function toggleResendSetting(groupId, enabled) {
    resendSettings.set(groupId, { enabled });
    return enabled;
}

// Extract sender information from various JID formats
function extractSenderInfo(jid, groupJid = null) {
    let senderName = 'Unknown User';
    let senderNumber = '';
    let properJid = jid;

    try {
        if (jid.includes('@s.whatsapp.net')) {
            // Standard WhatsApp format
            senderNumber = jid.split('@')[0];
            properJid = jid;
            senderName = senderNumber;
        } else if (jid.includes('@lid')) {
            // LinkedIn/Web WhatsApp format
            const numbers = jid.replace(/[^0-9]/g, '');
            if (numbers.length >= 8) {
                senderNumber = numbers;
                properJid = numbers + '@s.whatsapp.net';
                senderName = senderNumber;
            }
        } else if (jid === groupJid) {
            // Group itself (system message)
            senderName = 'Group Admin/Bot';
            senderNumber = 'system';
            properJid = jid;
        } else {
            // Extract numbers from any format
            const numbers = jid.replace(/[^0-9]/g, '');
            if (numbers.length >= 8) {
                senderNumber = numbers;
                properJid = numbers + '@s.whatsapp.net';
                senderName = senderNumber;
            } else {
                senderName = jid;
                senderNumber = jid;
                properJid = jid;
            }
        }
    } catch (error) {
        console.log(`[SENDER_INFO_ERROR] ${error.message}`);
        senderName = 'Unknown User';
        senderNumber = 'unknown';
        properJid = jid;
    }

    return { senderName, senderNumber, properJid };
}

// Get contact name from WhatsApp
async function getContactName(sock, jid) {
    try {
        // Try to get from contacts store
        const contact = sock.authState?.creds?.contacts?.[jid];
        if (contact?.name) return contact.name;
        if (contact?.notify) return contact.notify;

        // Try onWhatsApp method
        const onWa = await sock.onWhatsApp(jid);
        if (onWa?.[0]?.notify) return onWa[0].notify;

        // Fallback to number
        const phoneNumber = jid.split('@')[0];
        return phoneNumber;
    } catch (error) {
        return jid.split('@')[0] || 'Unknown';
    }
}

// Advanced protocol message handler with better message recovery
async function handleAdvancedProtocolMessage(sock, mek) {
    try {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[ADVANCED_PROTOCOL]')} Processing protocol message type: ${mek.message?.protocolMessage?.type}`);

        // Handle REVOKE (delete) protocol - Type 0
        if (mek.message?.protocolMessage?.type === 0) {
            const deletedKey = mek.message.protocolMessage.key;
            const groupId = mek.key.remoteJid;
            const deleterJid = mek.key.participant || mek.key.remoteJid;

            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[DELETE_DETECTED]')} Message deletion detected!`);
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[DELETE_INFO]')} Group: ${groupId}`);
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[DELETE_INFO]')} Deleted Message ID: ${deletedKey?.id}`);
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[DELETE_INFO]')} Deleter: ${deleterJid}`);

            if (deletedKey && groupId.endsWith('@g.us') && isResendEnabled(groupId)) {
                // Extract information about who actually sent the message (not who deleted it)
                const actualSenderJid = deletedKey.participant || deletedKey.remoteJid;
                const actualSender = extractSenderInfo(actualSenderJid, groupId);

                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[SENDER_INFO]')} Original sender: ${actualSenderJid}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[SENDER_INFO]')} Extracted: ${actualSender.senderName} (${actualSender.senderNumber})`);

                // Try to get the actual contact name
                const contactName = await getContactName(sock, actualSender.properJid);
                const displayName = contactName !== actualSender.senderNumber ? contactName : actualSender.senderName;

                // Check if we have recent message data in buffer
                const bufferKey = `${groupId}_${deletedKey.id}`;
                const bufferedMessage = messageBuffer.get(bufferKey);

                let messageContent = '[Content not recoverable - message deleted too quickly]';
                let recoveryStatus = 'NOT_RECOVERABLE';

                if (bufferedMessage) {
                    messageContent = bufferedMessage.text || '[No text content]';
                    recoveryStatus = 'RECOVERED';
                    messageBuffer.delete(bufferKey); // Clean up
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_RECOVERED]')} Message content recovered from buffer!`);
                } else {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[MESSAGE_NOT_FOUND]')} Message not in buffer, using fallback notification`);
                }

                // Create recovery message
                let recoveryText = '';
                if (recoveryStatus === 'RECOVERED') {
                    recoveryText = `🔄 *MESSAGE DELETED & RECOVERED*\n\n` +
                        `👤 *Original Sender:* @${displayName}\n` +
                        `📱 *Phone:* ${actualSender.senderNumber}\n` +
                        `⏰ *Deleted at:* ${new Date().toLocaleString()}\n\n` +
                        `📝 *Original Message:*\n${messageContent}\n\n` +
                        `🛡️ _Message recovered by Anti-Delete System_`;
                } else {
                    recoveryText = `🗑️ *MESSAGE DELETED*\n\n` +
                        `👤 *By:* @${displayName}\n` +
                        `📱 *Phone:* ${actualSender.senderNumber}\n` +
                        `📝 *Message:* ${messageContent}\n` +
                        `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
                        `🛡️ _Anti-delete is active - some messages may be recoverable_`;
                }

                // Send recovery message with proper mention
                await sock.sendMessage(groupId, {
                    text: recoveryText,
                    mentions: [actualSender.properJid]
                });

                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RECOVERY_SENT]')} Recovery message sent for ${displayName}`);
                logSuccess(`Deleted message ${recoveryStatus.toLowerCase()} for user ${displayName} (${actualSender.senderNumber})`);

            } else {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[DELETE_SKIPPED]')} Delete not processed: Group=${groupId.endsWith('@g.us')}, Enabled=${isResendEnabled(groupId)}`);
            }
        } catch (error) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[PROTOCOL_ERROR]')} Failed to handle protocol message: ${error.message}`);
            logError(`Protocol message handling failed: ${error.message}`);
        }
    }
}

// Brief message buffering for immediate recovery (30 seconds only)
function bufferMessage(messageKey, messageContent) {
    try {
        const bufferKey = `${messageKey.remoteJid}_${messageKey.id}`;

        // Extract text content
        let messageText = '';
        if (messageContent.conversation) {
            messageText = messageContent.conversation;
        } else if (messageContent.extendedTextMessage?.text) {
            messageText = messageContent.extendedTextMessage.text;
        } else if (messageContent.imageMessage?.caption) {
            messageText = `[Image]: ${messageContent.imageMessage.caption}`;
        } else if (messageContent.videoMessage?.caption) {
            messageText = `[Video]: ${messageContent.videoMessage.caption}`;
        } else if (messageContent.imageMessage) {
            messageText = '[Image]';
        } else if (messageContent.videoMessage) {
            messageText = '[Video]';
        } else if (messageContent.audioMessage) {
            messageText = '[Audio]';
        } else if (messageContent.stickerMessage) {
            messageText = '[Sticker]';
        } else if (messageContent.documentMessage) {
            messageText = `[Document: ${messageContent.documentMessage.fileName || 'file'}]`;
        } else {
            messageText = '[Media/Unsupported content]';
        }

        // Store in buffer for 30 seconds
        messageBuffer.set(bufferKey, {
            text: messageText,
            timestamp: Date.now()
        });

        // Auto-cleanup after 30 seconds
        setTimeout(() => {
            messageBuffer.delete(bufferKey);
        }, 30000);

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[BUFFERED]')} Message buffered: "${messageText.substring(0, 30)}..."`);
    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[BUFFER_ERROR]')} Error buffering message: ${error.message}`);
    }
}

module.exports = {
    config: {
        name: 'messageResend',
        author: 'Luna',
        version: '4.0.0',
        description: 'Advanced real-time message recovery without persistent storage',
        category: 'events',
        guide: {
            en: 'This event uses advanced WhatsApp protocol handling for message recovery'
        }
    },

    // Export functions for external use
    isResendEnabled,
    toggleResendSetting,

    onStart: async ({ sock }) => {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[ADVANCED_RESEND_INIT]')} Initializing Advanced Message Recovery System...`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[NO_STORAGE]')} No persistent storage - using real-time protocol detection`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[BUFFER_MODE]')} 30-second message buffer for immediate recovery`);

        logSuccess('Advanced anti-delete system initialized');
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ACTIVE]')} Advanced message recovery is now active 24/7`);
    },

    onChat: async ({ sock, m, messageInfo, isGroup, messageText }) => {
        try {
            // PRIORITY 1: Handle protocol messages (deletions) FIRST
            if (m.message?.protocolMessage) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[PROTOCOL_DETECTED]')} ⚠️ PROTOCOL MESSAGE DETECTED!`);
                await handleAdvancedProtocolMessage(sock, m);
                return true; // Stop processing other handlers
            }

            // PRIORITY 2: Buffer recent messages (only for 30 seconds)
            if (isGroup && m.message && isResendEnabled(m.key.remoteJid)) {
                // Only buffer if not a protocol message
                if (!m.message.protocolMessage) {
                    bufferMessage(m.key, m.message);
                }
            }

            // PRIORITY 3: Handle resend commands (ONLY with prefix)
            if (!isGroup || !messageText || !messageText.startsWith(global.prefix)) return;

            const body = messageText.slice(global.prefix.length).trim().toLowerCase();
            if (!body.startsWith('resend')) return;

            const groupId = m.key.remoteJid;
            const sender = m.key.participant || m.key.remoteJid;
            const senderNumber = sender.split('@')[0];

            // Check if user is admin
            const isAdmin = messageInfo.groupMetadata &&
                           messageInfo.groupMetadata.participants &&
                           messageInfo.groupMetadata.participants.some(p =>
                               p.id.includes(senderNumber) && (p.admin === 'admin' || p.admin === 'superadmin')
                           );

            if (body === 'resend on' && isAdmin) {
                toggleResendSetting(groupId, true);
                await sock.sendMessage(groupId, {
                    text: `✅ *Advanced Message Recovery Enabled*\n\n🛡️ Real-time delete detection active\n🔄 Protocol-based message recovery\n⚡ No persistent storage required\n\n*Features:*\n• Instant deletion detection\n• 30-second recovery buffer\n• Advanced WhatsApp protocol handling\n• Contact name resolution`,
                    mentions: [sender]
                });
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ENABLED]')} Advanced recovery enabled for group ${messageInfo.chatName}`);
                return true;
            }

            if (body === 'resend off' && isAdmin) {
                toggleResendSetting(groupId, false);
                await sock.sendMessage(groupId, {
                    text: `❌ *Message Recovery System Disabled*\n\nDeleted messages will no longer be recovered in this group.`,
                    mentions: [sender]
                });
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RESEND_DISABLED]')} Message recovery disabled for group ${messageInfo.chatName}`);
                return true;
            }

            if (body === 'resend status' && isAdmin) {
                const isEnabled = isResendEnabled(groupId);
                const status = isEnabled ? '✅ Enabled' : '❌ Disabled';
                const bufferStats = `📊 *Buffer:* ${messageBuffer.size} active messages`;

                await sock.sendMessage(groupId, {
                    text: `🔄 *Advanced Message Recovery Status*\n\n*Status:* ${status}\n*Type:* Protocol-based recovery\n*Storage:* No persistent storage\n${bufferStats}\n*Buffer TTL:* 30 seconds\n\n*Commands:*\n• \`${global.prefix}resend on\` - Enable recovery\n• \`${global.prefix}resend off\` - Disable recovery\n• \`${global.prefix}resend status\` - Check status`,
                    mentions: [sender]
                });
                return true;
            }

        } catch (error) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[RESEND_ERROR]')} Error in advanced message recovery: ${error.message}`);
            logError(`Advanced message recovery error: ${error.message}`);
        }
    }
};