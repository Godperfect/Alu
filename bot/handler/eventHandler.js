const fs = require('fs');
const { logError, logInfo, getSenderName, logMessage, getTextContent, getMessageType, hasMedia, getMediaInfo } = require('../../utils');
const { config } = require('../../config/globals');
const { parsePhoneNumber, isValidPhoneNumber } = require('libphonenumber-js');
const handlerAction = require('./handlerAction');
const lang = require('../../language/language');

global.Luna = global.Luna || {
    onReply: new Map(),
    onReaction: new Map(),
    onChat: new Map(),
    onEvent: new Map(),
    activeEvents: new Map()
};

class EventHandler {
    constructor() {
        this.initializeMessageListener = this.initializeMessageListener.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleGroupUpdate = this.handleGroupUpdate.bind(this);
        this.handleCall = this.handleCall.bind(this);
        this.handleContactsUpdate = this.handleContactsUpdate.bind(this);
        this.handleGroupInvite = this.handleGroupInvite.bind(this);
    }

    initializeMessageListener(sock, store) {

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                if (!chatUpdate || !chatUpdate.messages || chatUpdate.messages.length === 0) return;

                let mek = chatUpdate.messages[0];
                if (!mek.message) return;

                // Log message to database - skip for now to avoid userId issues
                // const dataHandler = require('./handlerCheckdata');
                // await dataHandler.logMessage(mek);

                await this.handleMessage(sock, mek, store);
            } catch (err) {
                logError(lang.get('eventHandler.error.messageListener', err.message));
                console.error(err);
            }
        });


        sock.ev.on('group-participants.update', async (update) => {
            try {
                // Log group activity
                try {
                    const db = require('../../dashboard/connectDB');
                    if (db.getStatus().connected) {
                        await db.logGroupActivity(
                            update.id,
                            update.action,
                            update.participants?.[0],
                            JSON.stringify({ participants: update.participants, action: update.action })
                        );
                    }
                } catch (dbError) {
                    console.error('Group activity logging error:', dbError.message);
                }

                await this.handleGroupUpdate(sock, update);
            } catch (error) {
                logError(`Error handling group update: ${error.message}`);
            }
        });

        sock.ev.on('call', async (callUpdate) => {
            await this.handleCall(sock, callUpdate);
        });


        sock.ev.on('contacts.update', async (contacts) => {
            await this.handleContactsUpdate(sock, contacts);
        });

        // Listen for group invitations
        sock.ev.on('groups.invite', async (invite) => {
            await this.handleGroupInvite(sock, invite);
        });
    }

    async handleMessage(sock, mek, store) {
        try {

            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage')
                ? mek.message.ephemeralMessage.message
                : mek.message;


            if (mek.key && mek.key.remoteJid === 'status@broadcast') return;


            // Determine message context with improved channel/community support
            let sender, senderNumber;

            if (mek.key.fromMe) {
                sender = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                senderNumber = sock.user.id.split(':')[0];
            } else {
                // Handle different message types
                if (mek.key.remoteJid.endsWith('@newsletter')) {
                    // Channel message - sender info might be in different places
                    sender = mek.key.participant || 
                             mek.message?.contextInfo?.participant ||
                             mek.pushName || 
                             'channel_user';
                } else if (mek.key.remoteJid.endsWith('@g.us')) {
                    // Group message (including community)
                    sender = mek.key.participant || mek.key.remoteJid;
                } else {
                    // Private message
                    sender = mek.key.remoteJid;
                }

                // Extract phone number more robustly
                if (typeof sender === 'string' && sender !== 'channel_user') {
                    // Handle different ID formats
                    if (sender.includes('@lid')) {
                        // LinkedIn ID format - extract numbers only
                        senderNumber = sender.replace(/[^0-9]/g, '');
                    } else if (sender.includes('@s.whatsapp.net') || sender.includes('@c.us')) {
                        // Standard WhatsApp format
                        senderNumber = sender.split('@')[0];
                    } else if (sender.includes('@g.us')) {
                        // Group ID - extract from participant if available
                        senderNumber = '';
                    } else {
                        // Other formats - try to extract numbers
                        senderNumber = sender.replace(/[^0-9]/g, '');
                    }

                    // Ensure sender has proper format for WhatsApp
                    if (sender && !sender.includes('@') && senderNumber.length > 0) {
                        sender = senderNumber + '@s.whatsapp.net';
                    }
                } else {
                    senderNumber = '';
                }
            }

            // Initialize variables
            let messageType = 'unknown';
            let chatName = '';

            // Determine context type with better detection
            const isGroup = mek.key.remoteJid.endsWith('@g.us');
            const isChannel = mek.key.remoteJid.endsWith('@newsletter');
            const isCommunity = isGroup && (
                mek.message?.senderKeyDistributionMessage?.groupId ||
                mek.message?.contextInfo?.groupMentionedJid ||
                mek.key.remoteJid.includes('community')
            );
            const isPrivate = !isGroup && !isChannel;


            let groupMetadata = null;
            if (isGroup) {
                try {
                    groupMetadata = await this.safelyGetGroupMetadata(sock, mek.key.remoteJid);
                    chatName = groupMetadata.subject || lang.get('eventHandler.unknownGroup');
                } catch (err) {
                    logError(lang.get('eventHandler.error.fetchGroupMetadata', err.message));
                    groupMetadata = { subject: lang.get('eventHandler.unknownGroup'), participants: [] };
                    chatName = lang.get('eventHandler.unknownGroup');
                }
            }

            if (isPrivate) {
                messageType = 'private';

                try {
                    const contact = await sock.contactsStore?.contacts[sender];
                    chatName = contact?.name || contact?.notify || senderNumber;
                } catch (err) {
                    chatName = senderNumber;
                }
            } else if (isChannel) {
                messageType = 'channel';
                try {
                    const channelInfo = await sock.channelMetadata(mek.key.remoteJid);
                    chatName = channelInfo.subject;
                } catch (err) {
                    chatName = lang.get('eventHandler.unknownChannel');
                }
            } else if (isGroup) {
                messageType = 'group';

            }


            const contentType = Object.keys(mek.message)[0];


            let hasAttachment = false;
            let attachmentType = null;


            if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(contentType)) {
                hasAttachment = true;
                attachmentType = contentType.replace('Message', '');
            } else {

                const contentObj = mek.message[contentType];
                if (contentObj?.contextInfo?.quotedMessage) {
                    const quotedType = Object.keys(contentObj.contextInfo.quotedMessage)[0];
                    if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(quotedType)) {

                        hasAttachment = true;
                        attachmentType = `quoted-${quotedType.replace('Message', '')}`;
                    }
                }
            }


            const isReaction = contentType === 'reactionMessage' ||
                            (mek.message[contentType]?.contextInfo?.hasOwnProperty('reactionMessage'));

            let reaction = null;


            if (isReaction) {
                if (contentType === 'reactionMessage') {

                    reaction = mek.message.reactionMessage.text;
                } else if (mek.message[contentType]?.contextInfo?.reactionMessage) {

                    reaction = mek.message[contentType].contextInfo.reactionMessage.text;
                }
            }


            const isForwarded = mek.message[contentType]?.contextInfo?.isForwarded || false;


            const isReply = mek.message[contentType]?.contextInfo?.quotedMessage ? true : false;
            let repliedTo = null;
            let quotedMessageId = null;

            if (isReply) {
                const quotedSender = mek.message[contentType].contextInfo.participant;
                const quotedSenderName = quotedSender ? await getSenderName(sock, quotedSender) : lang.get('eventHandler.unknown');
                const quotedMsgType = Object.keys(mek.message[contentType].contextInfo.quotedMessage)[0];
                const quotedMsg = getTextContent(mek.message[contentType].contextInfo.quotedMessage);
                repliedTo = `@${quotedSenderName} - "${quotedMsg?.substring(0, 20)}${quotedMsg?.length > 20 ? '...' : ''}"`;
                quotedMessageId = mek.message[contentType].contextInfo.stanzaId;
            }


            const timestamp = new Date(mek.messageTimestamp * 1000).toLocaleTimeString();


            const messageText = getTextContent(mek.message);

            // Function to extract sender information, handling various formats including LID
            const getSenderInfo = (msg) => {
                try {
                    let phoneNumber = null;
                    let senderName = 'Unknown';

                    if (msg.key?.participant) {
                        // Group message - extract from participant
                        const participant = msg.key.participant;
                        if (participant.includes('@lid')) {
                            phoneNumber = participant.replace('@lid', '');
                        } else if (participant.includes('@s.whatsapp.net')) {
                            phoneNumber = participant.replace('@s.whatsapp.net', '');
                        } else {
                            phoneNumber = participant.split('@')[0];
                        }
                    } else if (msg.key?.remoteJid) {
                        // Private message or other formats
                        const remoteJid = msg.key.remoteJid;
                        if (remoteJid.includes('@lid')) {
                            phoneNumber = remoteJid.replace('@lid', '');
                        } else if (remoteJid.includes('@s.whatsapp.net')) {
                            phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
                        } else if (remoteJid.includes('@g.us')) {
                            // This is a group JID, not a user phone number
                            phoneNumber = null;
                        } else {
                            phoneNumber = remoteJid.split('@')[0];
                        }
                    }

                    // Get sender name from various sources
                    if (msg.pushName && msg.pushName.trim()) {
                        senderName = msg.pushName.trim();
                    } else if (msg.verifiedBizName && msg.verifiedBizName.trim()) {
                        senderName = msg.verifiedBizName.trim();
                    } else if (msg.notify && msg.notify.trim()) {
                        senderName = msg.notify.trim();
                    }

                    // Validate and normalize phone number
                    if (phoneNumber && /^\d{10,15}$/.test(phoneNumber)) {
                        try {
                            // Try to parse and validate the phone number
                            const parsed = parsePhoneNumber('+' + phoneNumber);
                            if (parsed && parsed.isValid()) {
                                phoneNumber = parsed.number.replace('+', '');
                            }
                        } catch (error) {
                            // Keep original if parsing fails
                        }
                    } else if (phoneNumber && !phoneNumber.includes('lid')) {
                        // Invalid format that's not LID
                        phoneNumber = null;
                    }

                    return { phoneNumber, senderName };
                } catch (error) {
                    console.error('Error extracting sender info:', error);
                    return { phoneNumber: null, senderName: 'Unknown' };
                }
            };

            const messageInfo = {
                messageType,
                chatName,
                hasAttachment,
                attachmentType,
                isForwarded,
                isReply,
                repliedTo,
                quotedMessageId,
                isReaction,
                reaction,
                timestamp,
                groupMetadata,
                messageText: messageText,
                isGroup,
                isChannel,
                isCommunity,
                isPrivate
            };

            const { phoneNumber: extractedPhoneNumber, senderName } = getSenderInfo(mek);

            // Create a unique user identifier for both regular and LID format
            let userId = extractedPhoneNumber;
            if (!userId && mek.key?.participant) {
                // Use the full participant ID as fallback for LID users
                userId = mek.key.participant;
            }

            // Skip only if we absolutely can't identify the user
            if (!userId) {
                console.log('Skipping message log - no user identifier found');
                return;
            }


            // Log message details
            logMessage({
                messageType,
                chatName,
                sender: extractedPhoneNumber || userId, // Use clean phone number for sender
                senderName: senderName,
                messageText,
                hasAttachment,
                attachmentType,
                isForwarded,
                isReply,
                repliedTo,
                isReaction,
                reaction,
                timestamp,
                fromMe: mek.key.fromMe
            });

            // Update database with user/group activity
            try {
                const db = require('../../dashboard/connectDB');
                const dataHandler = require('./handlerCheckdata');
                
                if (db.getStatus().connected) {

                    // Update user activity - use the extracted phone number directly
                    if (extractedPhoneNumber) {
                        logInfo(`Updating user activity for: ${extractedPhoneNumber}`);
                        await db.updateUserActivity(extractedPhoneNumber, senderName);
                    } else {
                        console.log(`No valid phone number extracted for user: ${userId}`);
                    }

                    // Update group activity if in group
                    if (isGroup && groupMetadata && mek.key.remoteJid.endsWith('@g.us')) {
                        console.log(`[INFO] Updating group activity for: ${groupMetadata.subject}`);
                        await db.updateGroupActivity(
                            mek.key.remoteJid,
                            groupMetadata.subject,
                            groupMetadata.participants ? groupMetadata.participants.length : 0
                        );
                    }

                    // Log channel activity
                    if (isChannel) {
                        console.log(`[INFO] Channel message processed in: ${messageInfo.chatName}`);
                    }
                }
            } catch (dbError) {
                // Don't let database errors stop message processing
                console.error('Database update error:', dbError.message);
            }


            // Use phone number for admin/whitelist checks
            const checkNumber = extractedPhoneNumber || userId;
            
            if (config.adminOnly?.enable &&
                !config.adminOnly.adminNumbers.includes(checkNumber) &&
                !mek.key.fromMe) {
                console.log(lang.get('luna.system.messageBlockedAdminOnly'));
                return;
            }

            if (config.whiteListMode?.enable &&
                !config.whiteListMode.allowedNumbers.includes(checkNumber) &&
                !mek.key.fromMe) {
                console.log(lang.get('luna.system.messageBlockedWhitelist'));
                return;
            }


            // Handle commands
            if (messageInfo.messageText?.startsWith(prefix)) {
                const command = messageInfo.messageText.slice(prefix.length).split(' ')[0].toLowerCase();
                const args = messageInfo.messageText.slice(prefix.length + command.length).trim().split(' ').filter(arg => arg);

                if (global.commands && global.commands.has(command)) {
                    const userForLog = extractedPhoneNumber || userId;
                    logInfo(`Command '${prefix}${command}' executed by ${userForLog} in ${messageInfo.isGroup ? 'group' : 'private'}: ${messageInfo.chatName || 'Unknown'}`);

                    try {
                        const commandModule = global.commands.get(command);
                        if (commandModule && typeof commandModule.onStart === 'function') {
                            // Use phone number for database operations
                            const dbUserId = extractedPhoneNumber || userId;

                            await commandModule.onStart({
                                api: {
                                    sendMessage: sock.sendMessage.bind(sock),
                                    getUserID: () => dbUserId,
                                    getThreadID: () => mek.key.remoteJid // Use the actual chat ID (group or private)
                                },
                                event: {
                                    ...mek,
                                    senderID: dbUserId,
                                    threadID: mek.key.remoteJid, // Group ID for groups, user ID for private
                                    isGroup: messageInfo.isGroup,
                                    body: messageInfo.messageText
                                },
                                args,
                                Users: {
                                    getData: async (uid) => await db.getUser(uid || dbUserId),
                                    setData: async (uid, data) => await db.updateUser(uid || dbUserId, data)
                                },
                                Threads: {
                                    getData: async (tid) => await db.getThread(tid || mek.key.remoteJid),
                                    setData: async (tid, data) => await db.updateThread(tid || mek.key.remoteJid, data)
                                }
                            });
                        }
                    } catch (error) {
                        logError(`Error executing command ${command}:`, error);
                    }
                }
            } else {
                await handlerAction.handleChat({
                    sock,
                    mek,
                    sender: extractedPhoneNumber || userId, // Use phone number for sender
                    messageText: messageText,
                    messageInfo,
                    isGroup
                });
            }

            await handlerAction.processEvents({
                sock,
                mek,
                sender: extractedPhoneNumber || userId, // Use phone number for sender
                messageInfo,
                isGroup
            });

        } catch (err) {
            logError(lang.get('eventHandler.error.handleMessage', err.message));
            console.error(err);
        }
    }

    async handleGroupUpdate(sock, update) {
        try {
            const { id, participants, action } = update;
            if (!id || !participants || !action) return;

            let groupName = lang.get('eventHandler.unknownGroup');
            let groupMetadata = null;
            try {
                groupMetadata = await this.safelyGetGroupMetadata(sock, id);
                groupName = groupMetadata.subject;
            } catch (err) {
                logError(lang.get('eventHandler.error.fetchGroupMetadata', err.message));
            }

            const eventData = {
                eventType: action,
                groupId: id,
                groupName,
                participants,
                groupMetadata
            };

            if (action === 'remove') {
                console.log(lang.get('luna.system.userLeft', participants[0], groupName, id));
                await handlerAction.handleGroupEvent(sock, 'leave', eventData);
            } else if (action === 'add') {
                console.log(lang.get('luna.system.userAdded', participants[0], groupName, id));
                await handlerAction.handleGroupEvent(sock, 'join', eventData);
            } else if (action === 'promote') {
                console.log(lang.get('luna.system.userPromoted', participants[0], groupName, id));
                await handlerAction.handleGroupEvent(sock, 'promote', eventData);
            } else if (action === 'demote') {
                console.log(lang.get('luna.system.userDemoted', participants[0], groupName, id));
                await handlerAction.handleGroupEvent(sock, 'demote', eventData);
            }
        } catch (err) {
            logError(lang.get('eventHandler.error.groupUpdateListener', err.message));
            console.error(err);
        }
    }

    async handleCall(sock, callUpdate) {
        try {
            for (const call of callUpdate) {
                const callData = {
                    from: call.from,
                    callerId: call.from,
                    callerName: await getSenderName(sock, call.from),
                    isVideo: call.isVideo,
                    status: call.status,
                    timestamp: call.timestamp
                };

                if (call.status === "MISSED") {
                    console.log(lang.get('luna.system.missedCallNotification'));
                    console.log(lang.get('luna.system.caller', call.from));
                    console.log(lang.get('luna.system.callType', call.isVideo ? lang.get('eventHandler.videoCall') : lang.get('eventHandler.voiceCall')));
                    console.log(lang.get('luna.system.missedCallAt', new Date(call.timestamp * 1000).toLocaleTimeString()));

                    await handlerAction.handleCallEvent(sock, 'missed', callData);
                } else if (call.status === "INCOMING") {
                    console.log(lang.get('luna.system.incomingCall', call.isVideo ? lang.get('eventHandler.video') : lang.get('eventHandler.voice')));
                    console.log(lang.get('luna.system.caller', await getSenderName(sock, call.from)));
                    console.log(lang.get('luna.system.callType', call.isVideo ? lang.get('eventHandler.videoCall') : lang.get('eventHandler.voiceCall')));
                    console.log(lang.get('luna.system.incomingCallAt', new Date(call.timestamp * 1000).toLocaleTimeString()));

                    await handlerAction.handleCallEvent(sock, 'incoming', callData);
                }
            }
        } catch (err) {
            logError(lang.get('eventHandler.error.callListener', err.message));
            console.error(err);
        }
    }

    async handleContactsUpdate(sock, contacts) {
        try {
            for (const contact of contacts) {
                if (contact.notify && contact.status === 200) {
                    console.log(lang.get('luna.system.contactJoinedWhatsApp'));
                    console.log(lang.get('luna.system.newContact', contact.notify, contact.id));

                    const contactData = {
                        contactId: contact.id,
                        contactName: contact.notify,
                        status: contact.status
                    };

                    await handlerAction.handleContactEvent(sock, 'joined', contactData);
                }
            }
        } catch (err) {
            logError(lang.get('eventHandler.error.contactsUpdateListener', err.message));
            console.error(err);
        }
    }

    async handleGroupInvite(sock, invite) {
        try {
            console.log(lang.get('luna.system.groupInvitationReceived'));
            console.log(lang.get('luna.system.invitationToJoin', invite.subject || lang.get('eventHandler.unknownGroup')));
            console.log(lang.get('luna.system.invitedBy', await getSenderName(sock, invite.creator)));

            const inviteData = {
                groupName: invite.subject || lang.get('eventHandler.unknownGroup'),
                inviter: invite.creator,
                inviterName: await getSenderName(sock, invite.creator),
                groupId: invite.id
            };

            await handlerAction.handleInviteEvent(sock, inviteData);
        } catch (err) {
            logError(lang.get('eventHandler.error.groupInvitationListener', err.message));
            console.error(err);
        }
    }

    async safelyGetGroupMetadata(sock, jid, maxRetries = 3) {
        let retries = maxRetries;
        let backoffTime = 1000;

        while (retries > 0) {
            try {
                const metadata = await sock.groupMetadata(jid);
                return metadata;
            } catch (err) {
                retries--;
                if (retries > 0) {
                    logInfo(lang.get('luna.system.retryingGroupMetadata', retries));
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                    backoffTime *= 2;
                } else {
                    logError(lang.get('eventHandler.error.failedGroupMetadataRetries', maxRetries, err.message));
                    return { subject: lang.get('eventHandler.unknownGroup'), participants: [] };
                }
            }
        }
    }
}

// Helper function to extract message information (replace with actual implementation if needed)
function extractMessageInfo(msg) {
    // Placeholder for message info extraction logic
    // This function should return an object containing relevant message details
    // e.g., { chatId: msg.key.remoteJid, messageText: getTextContent(msg.message) }
    // For now, returning a basic structure
    return {
        chatId: msg.key.remoteJid,
        messageText: getTextContent(msg.message),
        isGroup: msg.key.remoteJid.endsWith('@g.us'),
        isChannel: msg.key.remoteJid.endsWith('@newsletter'),
        isCommunity: msg.key.remoteJid.includes('community') // Basic check, might need refinement
    };
}

// Removed the old extractPhoneNumber function as its logic is now within getSenderInfo


const eventHandler = new EventHandler();
module.exports = eventHandler;