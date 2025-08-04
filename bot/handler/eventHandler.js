const fs = require('fs');
const { logError, logMessage, logInfo } = require('../../utils/logger');
const { config } = require('../../config/globals');
const { getTextContent, getSenderName } = require('../../utils/messageParser');
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

                await this.handleMessage(sock, mek, store);
            } catch (err) {
                logError(lang.get('eventHandler.error.messageListener', err.message));
                console.error(err); 
            }
        });

        
        sock.ev.on('group-participants.update', async (update) => {
            await this.handleGroupUpdate(sock, update);
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

            
            const sender = mek.key.fromMe
                ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
                : mek.key.participant || mek.key.remoteJid;

            const senderNumber = sender.replace(/[^0-9]/g, '');

            
            let messageType = 'unknown';
            let chatName = '';

            
            const isGroup = mek.key.remoteJid.endsWith('@g.us');
            
            const isCommunity = isGroup && mek.message?.senderKeyDistributionMessage?.groupId;
            
            const isChannel = mek.key.remoteJid.endsWith('@newsletter');
            
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

const eventHandler = new EventHandler();
module.exports = eventHandler;