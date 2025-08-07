const fs = require('fs');
const { logError, logInfo, logWarning, logSuccess, logEvent, logConnection, getSenderName, logMessage, getTextContent, getMessageType, hasMedia, getMediaInfo, getTimestamp, getFormattedDate } = require('../../utils');
const { config } = require('../../config/globals');
const chalk = require('chalk');

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
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SYSTEM]')} ${chalk.cyan('Event Handler initialized - Bot is now actively listening for messages 24/7')}`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SYSTEM]')} ${chalk.yellow('Ready to process:')} ${chalk.white('Messages, Commands, Reactions, Group Events, Calls')}`);
        console.log('─────────────────────────────────────────');

        // Enhanced message listener with better error handling
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                if (!chatUpdate || !chatUpdate.messages || chatUpdate.messages.length === 0) {
                    return;
                }

                let mek = chatUpdate.messages[0];
                if (!mek.message) {
                    return;
                }

                // Log message to database
                try {
                    const dataHandler = require('./handlerCheckdata');
                    await dataHandler.logMessage(mek);
                    logInfo(`Message logged for user ${mek.key.participant?.split('@')[0] || mek.key.remoteJid?.split('@')[0] || 'unknown'}`);
                } catch (dbError) {
                    logError(`Database logging failed: ${dbError.message}`);
                }

                await this.handleMessage(sock, mek, store);
            } catch (err) {
                logError(`Message listener error: ${err.message}`);
                logError(`Stack trace: ${err.stack}`);
                // Don't crash the bot, continue listening
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RECOVERY]')} ${chalk.white('Bot continues listening despite error...')}`);
            }
        });


        sock.ev.on('group-participants.update', async (update) => {
            try {
                logEvent('GROUP_UPDATE', `Action: ${update.action} | Group: ${update.id} | Participants: ${update.participants?.length || 0}`);

                // Log group activity
                const dataHandler = require('./handlerCheckdata');
                await dataHandler.logGroupActivity(
                    update.id,
                    update.action,
                    update.participants?.[0],
                    JSON.stringify({ participants: update.participants, action: update.action })
                );

                await this.handleGroupUpdate(sock, update);
            } catch (error) {
                logError(`Group update handler error: ${error.message}`);
                logError(`Stack trace: ${error.stack}`);
            }
        });

        sock.ev.on('call', async (callUpdate) => {
            try {
                for (const call of callUpdate) {
                    logEvent('CALL', `${call.isVideo ? 'Video' : 'Voice'} call ${call.status} from ${call.from}`);
                }
                await this.handleCall(sock, callUpdate);
            } catch (error) {
                logError(`Call handler error: ${error.message}`);
            }
        });


        sock.ev.on('contacts.update', async (contacts) => {
            try {
                logEvent('CONTACTS_UPDATE', `${contacts.length} contacts updated`);
                await this.handleContactsUpdate(sock, contacts);
            } catch (error) {
                logError(`Contacts update handler error: ${error.message}`);
            }
        });

        // Listen for group invitations
        sock.ev.on('groups.invite', async (invite) => {
            try {
                logEvent('GROUP_INVITE', `Invited to ${invite.subject || 'Unknown Group'} by ${invite.creator}`);
                await this.handleGroupInvite(sock, invite);
            } catch (error) {
                logError(`Group invite handler error: ${error.message}`);
            }
        });

        // Add connection state monitoring
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'connecting') {
                logConnection('connecting', 'Establishing WhatsApp connection...');
            } else if (connection === 'open') {
                logConnection('connected', 'WhatsApp connection established - Bot active 24/7');
                logSuccess('Event handlers are now actively listening for all activities');
            } else if (connection === 'close') {
                logConnection('disconnected', 'WhatsApp connection lost');
                logWarning('Event handlers temporarily inactive - Attempting reconnection...');
            }
        });

        // Monitor bot health
        setInterval(() => {
            if (global.botConnected) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[HEARTBEAT]')} ${chalk.cyan('Bot is alive and actively listening...')}`);
            }
        }, 300000); // Every 5 minutes
    }

    async handleMessage(sock, mek, store) {
        try {

            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage')
                ? mek.message.ephemeralMessage.message
                : mek.message;


            if (mek.key && mek.key.remoteJid === 'status@broadcast') return;


            // Determine message context with proper sender identification
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
                    // Group message - use participant (this is the correct approach for groups)
                    const senderJid = mek.key.participant; // 'XXXXXXXXXXXX@s.whatsapp.net'
                    sender = senderJid;
                    senderNumber = senderJid ? senderJid.split('@')[0] : ''; // 'XXXXXXXXXXXX'
                } else {
                    // Private message
                    sender = mek.key.remoteJid;
                    senderNumber = mek.key.remoteJid ? mek.key.remoteJid.split('@')[0] : '';
                }

                // For non-group messages, extract phone number
                if (!mek.key.remoteJid.endsWith('@g.us') && typeof sender === 'string' && sender !== 'channel_user') {
                    // Handle different ID formats for private messages
                    if (sender.includes('@lid')) {
                        // LinkedIn ID format - extract numbers only
                        senderNumber = sender.replace(/[^0-9]/g, '');
                    } else if (sender.includes('@s.whatsapp.net') || sender.includes('@c.us')) {
                        // Standard WhatsApp format
                        senderNumber = sender.split('@')[0];
                    } else {
                        // Other formats - try to extract numbers
                        senderNumber = sender.replace(/[^0-9]/g, '');
                    }

                    // Ensure sender has proper format for WhatsApp
                    if (sender && !sender.includes('@') && senderNumber.length > 0) {
                        sender = senderNumber + '@s.whatsapp.net';
                    }
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


            // Log message details
            logMessage({
                messageType,
                chatName,
                sender,
                senderName: await getSenderName(sock, sender),
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
                if (db.getStatus().connected) {
                    const senderName = await getSenderName(sock, sender);

                    // Extract phone number for database operations
                    const phoneNumber = extractPhoneNumber(sender, senderNumber);
                    if (!phoneNumber || phoneNumber.length < 8) {
                        console.log('Skipping message log - invalid or short userId:', phoneNumber, 'from sender:', sender);
                        // Don't return here for channels/communities - continue processing
                        if (!isChannel && !isCommunity) {
                            return;
                        }
                    }

                    // Additional validation for phone numbers (more lenient for channels)
                    if (phoneNumber && !/^\d{8,15}$/.test(phoneNumber)) {
                        console.log('Skipping message log - invalid phone number format:', phoneNumber, 'from sender:', sender);
                        // Don't return here for channels/communities - continue processing
                        if (!isChannel && !isCommunity) {
                            return;
                        }
                    }

                    if (phoneNumber && phoneNumber.length >= 8) {
                        // Update user activity
                        await db.updateUserActivity(phoneNumber, senderName);
                    }

                    // Update group activity if in group
                    if (isGroup && groupMetadata && mek.key.remoteJid.endsWith('@g.us')) {
                        await db.updateGroupActivity(
                            mek.key.remoteJid,
                            groupMetadata.subject,
                            groupMetadata.participants ? groupMetadata.participants.length : 0
                        );
                    }

                    // Log channel activity
                    if (isChannel) {
                        console.log(`[INFO] Channel message processed in: ${chatName}`);
                    }
                }
            } catch (dbError) {
                // Don't let database errors stop message processing
                console.error('Database update error:', dbError.message);
            }


            if (config.adminOnly?.enable &&
                !config.adminOnly.adminNumbers.includes(senderNumber) &&
                !mek.key.fromMe) {
                console.log(lang.get('luna.system.messageBlockedAdminOnly'));
                return;
            }


            if (config.whiteListMode?.enable &&
                !config.whiteListMode.allowedNumbers.includes(senderNumber) &&
                !mek.key.fromMe) {
                console.log(lang.get('luna.system.messageBlockedWhitelist'));
                return;
            }


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
                groupMetadata
            };

            // Handle different message types
            if (messageType === 'notify') {
                // Handle group notifications (joins, leaves, etc.)
                const notificationType = mek.messageStubType;

                if (notificationType) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[GROUP_NOTIFICATION]')} Type: ${notificationType} in ${chatName}`);

                    // Handle group member changes
                    if ([27, 28, 29, 30, 31, 32].includes(notificationType)) {
                        await handleGroupNotification(sock, mek, messageInfo, notificationType);
                    }
                }
            }

            // Also check for group events in message stub parameters
            if (mek.messageStubType && mek.messageStubParameters) {
                const stubType = mek.messageStubType;
                const participants = mek.messageStubParameters;
                const groupId = mek.key.remoteJid;

                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[STUB_EVENT]')} Processing stub type ${stubType} with participants:`, participants);

                let eventType = null;
                switch (stubType) {
                    case 27: // User added
                    case 31: // User joined via invite link
                        eventType = 'join';
                        break;
                    case 28: // User removed
                    case 32: // User left
                        eventType = 'leave';
                        break;
                    case 29: // User promoted to admin
                        eventType = 'promote';
                        break;
                    case 30: // User demoted from admin
                        eventType = 'demote';
                        break;
                }

                if (eventType && participants && participants.length > 0) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[TRIGGERING_EVENT]')} Triggering ${eventType} event for group ${chatName}`);

                    const eventData = {
                        groupId,
                        groupName: chatName || 'Unknown Group',
                        participants,
                        eventType
                    };

                    // Trigger the group event handler
                    try {
                        const handlerAction = require('./handlerAction');
                        await handlerAction.handleGroupEvent(sock, eventType, eventData);
                    } catch (error) {
                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[EVENT_TRIGGER_ERROR]')} Failed to trigger event: ${error.message}`);
                    }
                }
            }


            if (isReaction && reaction) {
                await handlerAction.handleReaction({
                    sock,
                    mek,
                    sender,
                    botNumber: sock.user.id.split(':')[0] + '@s.whatsapp.net',
                    messageInfo
                });
            } else if (isReply && quotedMessageId) {

                await handlerAction.handleReply({
                    sock,
                    mek,
                    sender,
                    botNumber: sock.user.id.split(':')[0] + '@s.whatsapp.net',
                    messageInfo
                });
            } else {

                const body = messageText || '';
                const isCmd = body.startsWith(global.prefix);
                const command = isCmd ? body.slice(global.prefix.length).trim().split(' ').shift().toLowerCase() : '';
                const args = body.trim().split(/ +/).slice(1);

                if (isCmd) {
                    await handlerAction.handleCommand({
                        sock,
                        mek,
                        args,
                        command,
                        sender,
                        botNumber: sock.user.id.split(':')[0] + '@s.whatsapp.net',
                        messageInfo,
                        isGroup
                    });
                } else {
                    await handlerAction.handleChat({
                        sock,
                        mek,
                        sender,
                        messageText: body,
                        messageInfo,
                        isGroup
                    });
                }
            }

            await handlerAction.processEvents({
                sock,
                mek,
                sender,
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

async function handleGroupNotification(sock, mek, messageInfo, notificationType) {
    try {
        const groupId = mek.key.remoteJid;
        const participants = mek.messageStubParameters || [];

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[GROUP_EVENT]')} Processing notification type ${notificationType} in ${messageInfo.chatName}`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[PARTICIPANTS]')} Participants:`, participants);

        let eventType = null;
        switch (notificationType) {
            case 27: // User added to group
            case 31: // User joined via invite link
                eventType = 'join';
                break;
            case 28: // User removed from group
            case 32: // User left group
                eventType = 'leave';
                break;
            case 29: // User promoted to admin
                eventType = 'promote';
                break;
            case 30: // User demoted from admin
                eventType = 'demote';
                break;
        }

        if (eventType && participants.length > 0) {
            const eventData = {
                groupId,
                groupName: messageInfo.chatName || 'Unknown Group',
                participants,
                eventType
            };

            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[CALLING_GROUP_HANDLER]')} Calling group event handler for ${eventType}`);
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[EVENT_DATA]')} Event data:`, eventData);

            // Call the group event handler
            const handlerAction = require('./handlerAction');
            await handlerAction.handleGroupEvent(sock, eventType, eventData);
        } else {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[NO_EVENT]')} No event type determined or no participants for notification ${notificationType}`);
        }
    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[GROUP_NOTIFICATION_ERROR]')} Error: ${error.message}`);
        logError(`Error handling group notification: ${error.message}`);
    }
}

// Helper function to extract phone number from sender JID
function extractPhoneNumber(senderJid, fallbackNumber = null) {
    if (!senderJid) return fallbackNumber;

    // Handle standard WhatsApp format
    if (senderJid.endsWith('@s.whatsapp.net') || senderJid.endsWith('@c.us')) {
        const phoneNumber = senderJid.split('@')[0];
        if (/^\d{8,15}$/.test(phoneNumber)) {
            return phoneNumber;
        }
    }

    // Handle LinkedIn ID format (@lid)
    if (senderJid.includes('@lid')) {
        const phoneNumber = senderJid.replace(/[^0-9]/g, '');
        if (/^\d{8,15}$/.test(phoneNumber)) {
            return phoneNumber;
        }
    }

    // Handle other formats - extract numbers only
    if (typeof senderJid === 'string') {
        const phoneNumber = senderJid.replace(/[^0-9]/g, '');
        if (/^\d{8,15}$/.test(phoneNumber)) {
            return phoneNumber;
        }
    }

    // Use fallback if available
    if (fallbackNumber && /^\d{8,15}$/.test(fallbackNumber)) {
        return fallbackNumber;
    }

    return null;
}


const eventHandler = new EventHandler();
module.exports = eventHandler;