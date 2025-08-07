const { logInfo, logError, logSuccess, logWarning, getTimestamp, getFormattedDate } = require('../../utils');
const chalk = require('chalk');

// In-memory storage for messages (no files/DB)
const messageStore = new Map(); // Store recent messages temporarily
const resendSettings = new Map(); // Store per-group resend settings
const MAX_MESSAGES = 1000; // Limit memory usage
const MESSAGE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Check if resend is enabled for a group (defaults to true)
function isResendEnabled(groupId) {
    return resendSettings.get(groupId)?.enabled !== false; // Default to true unless explicitly disabled
}

// Toggle resend setting for a group
function toggleResendSetting(groupId, enabled) {
    resendSettings.set(groupId, { enabled });
    return enabled;
}

// Store message in memory temporarily
function storeMessage(messageKey, messageContent, messageInfo) {
    try {
        const messageId = messageKey.id;
        const groupId = messageKey.remoteJid;

        // Create message data
        const messageData = {
            key: messageKey,
            content: messageContent,
            info: messageInfo,
            timestamp: Date.now(),
            sender: messageKey.participant || messageKey.remoteJid
        };

        // Store with composite key
        const storeKey = `${groupId}_${messageId}`;
        messageStore.set(storeKey, messageData);

        // Clean old messages to prevent memory overflow
        if (messageStore.size > MAX_MESSAGES) {
            const oldestKey = messageStore.keys().next().value;
            messageStore.delete(oldestKey);
        }

        // Clean messages older than TTL
        const now = Date.now();
        for (const [key, data] of messageStore.entries()) {
            if (now - data.timestamp > MESSAGE_TTL) {
                messageStore.delete(key);
            }
        }

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[STORE_ERROR]')} Error storing message: ${error.message}`);
    }
}

// Get stored message content
function getStoredMessage(messageKey) {
    const storeKey = `${messageKey.remoteJid}_${messageKey.id}`;
    return messageStore.get(storeKey);
}

// Extract proper contact name from WhatsApp
async function getContactName(sock, jid) {
    try {
        // Try to get contact info from WhatsApp
        const contact = await sock.onWhatsApp(jid);
        if (contact && contact[0]?.notify) {
            return contact[0].notify;
        }

        // Try from contacts store
        const contactInfo = await sock.contactsStore?.contacts[jid];
        if (contactInfo?.name) {
            return contactInfo.name;
        } else if (contactInfo?.notify) {
            return contactInfo.notify;
        }

        // Fallback to phone number
        const phoneNumber = jid.split('@')[0];
        return phoneNumber;
    } catch (error) {
        // Return phone number as fallback
        const phoneNumber = jid.split('@')[0];
        return phoneNumber;
    }
}

// Format message content for resending
async function formatMessageContent(originalMessage, sock) {
    const content = originalMessage.content;
    const sender = originalMessage.sender;

    // Get sender info (name and number)
    let senderName = 'Unknown User';
    let senderNumber = '';
    let displayInfo = '';

    try {
        // Extract phone number from different JID formats
        if (sender.includes('@lid')) {
            // LinkedIn ID format
            senderNumber = sender.replace(/[^0-9]/g, '');
            displayInfo = senderNumber;
        } else if (sender.includes('@s.whatsapp.net')) {
            // Standard WhatsApp format
            senderNumber = sender.split('@')[0];
            displayInfo = senderNumber;
        } else {
            // Other formats
            senderNumber = sender.replace(/[^0-9]/g, '');
            displayInfo = senderNumber || sender;
        }

        // Try to get contact name
        try {
            const contact = await sock.contactsStore?.contacts[sender];
            if (contact?.name) {
                senderName = contact.name;
            } else if (contact?.notify) {
                senderName = contact.notify;
            } else if (senderNumber) {
                senderName = senderNumber;
            }
        } catch (contactError) {
            senderName = displayInfo || 'Unknown User';
        }
    } catch (error) {
        console.log(`Error processing sender info: ${error.message}`);
        senderName = 'Unknown User';
        displayInfo = sender;
    }

    let messageText = '';
    let messageType = '';

    // Handle different message types with better text extraction
    if (content.conversation) {
        messageText = content.conversation;
        messageType = 'Text';
    } else if (content.extendedTextMessage?.text) {
        messageText = content.extendedTextMessage.text;
        messageType = 'Text';
    } else if (content.imageMessage?.caption) {
        messageText = content.imageMessage.caption;
        messageType = 'Image with caption';
    } else if (content.videoMessage?.caption) {
        messageText = content.videoMessage.caption;
        messageType = 'Video with caption';
    } else if (content.documentMessage?.caption) {
        messageText = content.documentMessage.caption;
        messageType = 'Document with caption';
    } else if (content.imageMessage) {
        messageText = '[Image without caption]';
        messageType = 'Image';
    } else if (content.videoMessage) {
        messageText = '[Video without caption]';
        messageType = 'Video';
    } else if (content.audioMessage) {
        messageText = '[Audio message]';
        messageType = 'Audio';
    } else if (content.documentMessage) {
        messageText = `[Document: ${content.documentMessage.fileName || 'Unknown'}]`;
        messageType = 'Document';
    } else if (content.stickerMessage) {
        messageText = '[Sticker]';
        messageType = 'Sticker';
    } else if (content.locationMessage) {
        messageText = `[Location: ${content.locationMessage.name || 'Shared location'}]`;
        messageType = 'Location';
    } else if (content.contactMessage) {
        messageText = `[Contact: ${content.contactMessage.displayName || 'Shared contact'}]`;
        messageType = 'Contact';
    } else {
        messageText = '[Unsupported message type]';
        messageType = 'Unknown';
    }

    // Truncate very long messages
    if (messageText.length > 500) {
        messageText = messageText.substring(0, 497) + '...';
    }

    return {
        text: `🔄 *DELETED MESSAGE RECOVERED*\n\n👤 *Original Sender:* ${senderName} (${displayInfo})\n📱 *Message Type:* ${messageType}\n⏰ *Deleted at:* ${new Date().toLocaleString()}\n\n📝 *Original Content:*\n${messageText}\n\n🛡️ _This message was deleted but recovered by Anti-Delete System_`,
        mentions: [sender]
    };
}

// Handle protocol messages (deletions) - Real-time detection and resend
async function handleProtocolMessage(sock, mek) {
    try {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[PROTOCOL_CHECK]')} Checking protocol message:`, mek.message?.protocolMessage?.type);

        // Check for delete protocol message (REVOKE type = 0)
        if (mek.message?.protocolMessage?.type === 0) {
            const deletedMessageKey = mek.message.protocolMessage.key;
            const groupId = mek.key.remoteJid;

            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[DELETE_DETECTED]')} Delete protocol detected!`);
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[DELETE_INFO]')} Group: ${groupId}`);
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[DELETE_INFO]')} Message ID: ${deletedMessageKey?.id}`);

            if (deletedMessageKey && groupId.endsWith('@g.us') && isResendEnabled(groupId)) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[DELETE_PROCESSING]')} Processing delete for enabled group`);

                // Try to get the original message from memory
                const originalMessage = getStoredMessage(deletedMessageKey);

                if (originalMessage) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_FOUND]')} Original message found in memory, resending...`);

                    // Format and resend the original message
                    const resendContent = await formatMessageContent(originalMessage, sock);

                    await sock.sendMessage(groupId, {
                        text: resendContent.text,
                        mentions: resendContent.mentions
                    });

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_RESENT]')} ✅ Deleted message successfully resent!`);
                    logSuccess(`Deleted message resent for user ${originalMessage.sender.split('@')[0]}`);

                    // Remove from memory after resending
                    const storeKey = `${deletedMessageKey.remoteJid}_${deletedMessageKey.id}`;
                    messageStore.delete(storeKey);

                } else {
                    // Send notification that message was deleted but not recoverable
                    const deletedSender = deletedMessageKey.participant || deletedMessageKey.remoteJid;

                    // Get sender name and proper JID
                    let senderName = 'Unknown User';
                    let properSenderJid = deletedSender;
                    let displayName = '';

                    try {
                        // Handle different sender formats
                        if (deletedSender) {
                            if (deletedSender.includes('@lid')) {
                                // LinkedIn ID format - this is actually the group JID format
                                const groupNumber = deletedSender.replace(/[^0-9]/g, '');
                                displayName = groupNumber;
                                properSenderJid = deletedSender; // Keep original format for group context
                                senderName = groupNumber;
                            } else if (deletedSender.includes('@s.whatsapp.net')) {
                                // Standard WhatsApp user format
                                const phoneNumber = deletedSender.split('@')[0];
                                properSenderJid = deletedSender;
                                displayName = phoneNumber;
                                senderName = phoneNumber;
                            } else {
                                // Other formats - try to extract phone number
                                const phoneNumber = deletedSender.replace(/[^0-9]/g, '');
                                if (phoneNumber.length >= 8) {
                                    properSenderJid = phoneNumber + '@s.whatsapp.net';
                                    displayName = phoneNumber;
                                    senderName = phoneNumber;
                                } else {
                                    // Use raw sender if no phone number found
                                    displayName = deletedSender;
                                    senderName = deletedSender;
                                    properSenderJid = deletedSender;
                                }
                            }

                            // For LID format (group context), we need to find who actually sent the message
                            // Check if this is the group itself or a participant
                            if (deletedSender === groupId) {
                                // This means the group itself sent the message (could be bot or group action)
                                senderName = 'Group Admin/Bot';
                                displayName = 'Group Message';
                            } else {
                                // Try to get actual contact name from WhatsApp for individual users
                                try {
                                    const actualSenderName = await getContactName(sock, properSenderJid);
                                    if (actualSenderName && actualSenderName !== displayName) {
                                        senderName = actualSenderName;
                                    }
                                } catch (contactError) {
                                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[CONTACT_LOOKUP_FAILED]')} Could not get contact info for ${properSenderJid}`);
                                }
                            }
                        }
                    } catch (processingError) {
                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[SENDER_PROCESSING_ERROR]')} Error processing sender info: ${processingError.message}`);
                    }

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[USER_TAG_DEBUG]')} Original sender: ${deletedSender}`);
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[USER_TAG_DEBUG]')} Proper JID: ${properSenderJid}`);
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[USER_TAG_DEBUG]')} Display name: ${displayName}`);
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[USER_TAG_DEBUG]')} Sender name: ${senderName}`);

                    const deleteNotification = `🗑️ *MESSAGE DELETED*\n\n` +
                        `👤 *By:* @${senderName}\n` +
                        `📱 *ID:* ${displayName}\n` +
                        `📝 *Message:* [Content not recoverable - message was deleted too quickly]\n` +
                        `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
                        `🛡️ _Anti-delete is active - recent messages will be recovered if stored in memory_`;

                    await sock.sendMessage(groupId, {
                        text: deleteNotification,
                        mentions: [properSenderJid]
                    });

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[DELETE_NOTIFIED]')} Delete notification sent (message not recoverable)`);
                }

            } else {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[DELETE_SKIPPED]')} Delete not processed: Group=${groupId.endsWith('@g.us')}, Enabled=${isResendEnabled(groupId)}`);
            }
        }
    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[PROTOCOL_ERROR]')} Failed to handle protocol message: ${error.message}`);
    }
}

// Helper to get text content from various message types
function getTextContent(message) {
    if (message.conversation) {
        return message.conversation;
    } else if (message.extendedTextMessage?.text) {
        return message.extendedTextMessage.text;
    } else if (message.imageMessage?.caption) {
        return message.imageMessage.caption;
    } else if (message.videoMessage?.caption) {
        return message.videoMessage.caption;
    } else if (message.documentMessage?.caption) {
        return message.documentMessage.caption;
    }
    return ''; // Return empty string if no text content found
}

// Helper to get sender name, prioritizing specific JIDs and falling back to pushName or number
async function getSenderName(sock, jid) {
    try {
        const contact = await sock.onWhatsApp(jid);
        if (contact && contact[0]?.notify) {
            return contact[0].notify;
        }

        const contactInfo = await sock.contactsStore?.contacts[jid];
        if (contactInfo?.name) {
            return contactInfo.name;
        } else if (contactInfo?.notify) {
            return contactInfo.notify;
        }

        // Fallback for non-contact JIDs or if other methods fail
        if (jid.includes('@s.whatsapp.net')) {
            return jid.split('@')[0]; // Return phone number
        } else if (jid.includes('@lid')) {
            return jid.split('@')[0]; // Return group ID part
        }

        return 'Unknown'; // Default fallback
    } catch (error) {
        console.log(`[GET_SENDER_NAME_ERROR] ${error.message}`);
        return 'Unknown';
    }
}


module.exports = {
    config: {
        name: 'messageResend',
        author: 'Luna',
        version: '3.0.0',
        description: 'Real-time message recovery and resending (memory-based)',
        category: 'events',
        guide: {
            en: 'This event stores recent messages in memory and resends them when deleted'
        }
    },

    // Export functions for external use
    isResendEnabled,
    toggleResendSetting,

    onStart: async ({ sock }) => {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[RESEND_INIT]')} Initializing Real-time Message Recovery System...`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MEMORY_STORE]')} In-memory message storage initialized`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[MEMORY_LIMIT]')} Max messages: ${MAX_MESSAGES}, TTL: ${MESSAGE_TTL/1000/60/60}h`);

        logSuccess('Anti-delete system with message recovery initialized');
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ACTIVE]')} Real-time message recovery is now active 24/7`);
    },

    onChat: async ({ sock, m, messageInfo, isGroup, messageText }) => {
        try {
            // PRIORITY 1: Handle protocol messages (deletions)
            if (m.message?.protocolMessage) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[DELETE_PROTOCOL_DETECTED]')} ⚠️  DELETION DETECTED!`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[PROTOCOL_TYPE]')} Type: ${m.message.protocolMessage.type}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[GROUP_ID]')} ${m.key.remoteJid}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.magenta('[DELETED_MSG_ID]')} ${m.message.protocolMessage.key?.id}`);

                await handleProtocolMessage(sock, m);
                return true; // Stop processing other onChat handlers
            }

            // PRIORITY 2: Store regular messages in memory for potential recovery
            if (isGroup && m.message && isResendEnabled(m.key.remoteJid)) {
                // Enhance message info with actual text content for better recovery
                const enhancedMessageInfo = {
                    ...messageInfo,
                    messageText: messageText || '[No text content]',
                    contentType: Object.keys(m.message)[0],
                    sender: m.key.participant || m.key.remoteJid,
                    timestamp: Date.now()
                };

                // Store the message in memory (excluding protocol messages)
                storeMessage(m.key, m.message, enhancedMessageInfo);

                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[MESSAGE_STORED]')} Message stored: ${m.key.id} - Content: ${messageText?.substring(0, 30) || 'No text'}...`);
            }

            // PRIORITY 3: Handle resend commands
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
                    text: `✅ *Message Recovery System Enabled*\n\n🛡️ Recent messages will be automatically resent if deleted.\n\n*Features:*\n• Real-time delete detection\n• Automatic message recovery\n• In-memory storage (no files)\n• ${MAX_MESSAGES} message buffer\n• ${MESSAGE_TTL/1000/60/60}h message retention`,
                    mentions: [sender]
                });
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ENABLED]')} Message recovery enabled for group ${messageInfo.chatName}`);
                return true;
            }

            if (messageText.toLowerCase() === 'resend off' && isAdmin) {
                toggleResendSetting(groupId, false);
                await sock.sendMessage(groupId, {
                    text: `❌ *Message Recovery System Disabled*\n\nDeleted messages will no longer be recovered in this group.`,
                    mentions: [sender]
                });
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RESEND_DISABLED]')} Message recovery disabled for group ${messageInfo.chatName}`);
                return true;
            }

            if (messageText.toLowerCase() === 'resend status' && isAdmin) {
                const isEnabled = isResendEnabled(groupId);
                const status = isEnabled ? '✅ Enabled' : '❌ Disabled';
                const memoryStats = `📊 *Memory Stats:* ${messageStore.size}/${MAX_MESSAGES} messages stored`;

                await sock.sendMessage(groupId, {
                    text: `🔄 *Message Recovery System Status*\n\n*Current Status:* ${status}\n*System Type:* In-Memory Recovery\n*Detection:* Real-time\n${memoryStats}\n*Retention:* ${MESSAGE_TTL/1000/60/60} hours\n\n*Commands:*\n• \`resend on\` - Enable recovery\n• \`resend off\` - Disable recovery\n• \`resend status\` - Check status`,
                    mentions: [sender]
                });
                return true;
            }

        } catch (error) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[RESEND_CHAT_ERROR]')} Error in message recovery handler: ${error.message}`);
        }
    }
};