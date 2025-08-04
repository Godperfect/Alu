
const fs = require('fs');
const { logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');
const { config } = require('../../config/globals');
const { hasPermission, getPermissionLevel } = require('../../utils/permission');
const languageManager = require('../../language/language');
const lang =languageManager.initialize(config);


if (!global.cooldowns) {
    global.cooldowns = new Map();
}

if (!global.bannedUsers) {
    global.bannedUsers = [];
}


const handlerAction = {
    
    handleCommand: async function({ sock, mek, args, command, sender, botNumber, messageInfo, isGroup }) {
        try {
            const threadID = mek.key.remoteJid;

             if (!command) {
                return sock.sendMessage(threadID, { 
                    text: lang.get('handler.noCommandProvided', global.prefix) 
                }, { quoted: mek });
            }  const cmd = global.commands.get(command) || [...global.commands.values()].find(cmd => cmd.alias && cmd.alias.includes(command));
  if (!cmd) {

 return sock.sendMessage(threadID, { 
 text:
     lang.get('handler.unknownCommand', command, global.prefix)
                }, { quoted: mek });
            }

            
            if (typeof cmd.run === 'function') {
                const userNumber = sender.replace(/[^0-9]/g, '');


                if (Array.isArray(global.bannedUsers) && global.bannedUsers.includes(userNumber)) {
                    logWarning(lang.get('log.bannedUserAttempt', userNumber));
                    return sock.sendMessage(threadID, { 
                        text: lang.get('handler.userBanned')
                    }, { quoted: mek });
                }


                if (config.adminOnly?.enable && 
                    !config.adminOnly.adminNumbers.includes(userNumber) && 
                    !mek.key.fromMe) {
                    logWarning(lang.get('log.commandBlocked', userNumber));
                    return sock.sendMessage(threadID, { 
                        text: lang.get('handler.adminOnlyMode', command, global.prefix)
                    }, { quoted: mek });
                }

            
                if (cmd.permission !== undefined) {
                    const userPermission = getPermissionLevel(userNumber, isGroup ? threadID : null);

                    if (userPermission < cmd.permission) {
                        logWarning(lang.get('log.permissionDenied', command, cmd.permission, userPermission));
                        return sock.sendMessage(threadID, { 
                            text: lang.get('handler.permissionDenied', cmd.permission)
                        }, { quoted: mek });
                    }
                }

                
                if (cmd.cooldown) {
                    const cooldownKey = `${command}_${userNumber}`;
                    const now = Date.now();

                    
                    if (global.cooldowns instanceof Map && global.cooldowns.has(cooldownKey)) {
                        const cooldownTime = global.cooldowns.get(cooldownKey);
                        const timeLeft = ((cooldownTime + (cmd.cooldown * 1000)) - now) / 1000;

                        if (timeLeft > 0) {
                            return sock.sendMessage(threadID, { 
                                text: lang.get('handler.cooldownActive', timeLeft.toFixed(1))
                            }, { quoted: mek });
                        }
                    }

                    
                    if (global.cooldowns instanceof Map) {
                    
                        global.cooldowns.set(cooldownKey, now);
                        
                        setTimeout(() => {
                            global.cooldowns.delete(cooldownKey);
                        }, cmd.cooldown * 1000);
                    }
                }

                
                logInfo(lang.get('system.commandExecuted', global.prefix, command, userNumber, isGroup ? 'group: ' + messageInfo.chatName : 'private chat'));

                
                await cmd.run({
                    sock,
                    m: mek,
                    args,
                    command,
                    sender,
                    botNumber,
                    messageInfo,
                    isGroup
                });
            }
        } catch (err) {
            logError(lang.get('error.handleCommand', err.message));
            console.error(err);
        }
    },

     
    handleChat: async function({ sock, mek, sender, messageText, messageInfo, isGroup }) {
        try {
            const userNumber = sender.replace(/[^0-9]/g, '');
            const threadID = mek.key.remoteJid;

            
            if (Array.isArray(global.bannedUsers) && global.bannedUsers.includes(userNumber)) {
                return; 
            }

            
            if (config.adminOnly?.enable && 
                !config.adminOnly.adminNumbers.includes(userNumber) && 
                !mek.key.fromMe) {
                return; // Silently ignore non-admins in admin-only mode
            }

            // Get custom prefix for group if it exists
            const currentPrefix = isGroup && global.groupPrefix && global.groupPrefix[threadID] 
                ? global.groupPrefix[threadID] 
                : global.prefix;

            
            if (!global.Luna.onChat) {
                global.Luna.onChat = new Map();
            }

            
            for (const [pattern, handler] of global.Luna.onChat.entries()) {
                
                if (pattern instanceof RegExp) {
                    const match = messageText.match(pattern);
                    if (match) {
                        logInfo(lang.get('system.chatPatternMatched', pattern));
                        await handler.callback({
                            sock, 
                            m: mek, 
                            match, 
                            messageInfo,
                            sender, 
                            isGroup
                        });
                    }
                } 
                
                else if (typeof pattern === 'string' && messageText.toLowerCase() === pattern.toLowerCase()) {
                    logInfo(lang.get('system.chatMessageMatched', pattern));
                    await handler.callback({
                        sock, 
                        m: mek, 
                        messageInfo,
                        sender, 
                        isGroup
                    });
                }
            }
        } catch (err) {
            logError(lang.get('error.handleChat', err.message));
            console.error(err);
        }
    },

    
    handleReaction: async function({ sock, mek, sender, botNumber, messageInfo }) {
        try {
            
            if (!global.Luna.onReaction) {
                global.Luna.onReaction = new Map();
            }

            const reaction = messageInfo.reaction;
            const threadID = mek.key.remoteJid;
            const targetMessageID = mek.message.reactionMessage?.key?.id;

            if (!targetMessageID) return;

            
            const specificHandlerKey = `${targetMessageID}:${reaction}`;
            const anyReactionHandlerKey = `${targetMessageID}:*`;

            
            if (global.Luna.onReaction.has(specificHandlerKey)) {
                const handler = global.Luna.onReaction.get(specificHandlerKey);
                logInfo(lang.get('system.processingReaction', targetMessageID, reaction));

                await handler.callback({
                    sock,
                    m: mek,
                    sender,
                    reaction,
                    messageInfo
                });

                
                if (handler.oneTime) {
                    global.Luna.onReaction.delete(specificHandlerKey);
                }

                return;
            }

            
            if (global.Luna.onReaction.has(anyReactionHandlerKey)) {
                const handler = global.Luna.onReaction.get(anyReactionHandlerKey);
                logInfo(lang.get('system.processingAnyReaction', targetMessageID));

                await handler.callback({
                    sock,
                    m: mek,
                    sender,
                    reaction,
                    messageInfo
                });

                
                if (handler.oneTime) {
                    global.Luna.onReaction.delete(anyReactionHandlerKey);
                }

                return;
            }

            
            for (const [pattern, handler] of global.Luna.onReaction.entries()) {
                
                if (pattern.includes(':')) continue;

                if (pattern === '*' || pattern === reaction) {
                    logInfo(lang.get('system.processingGeneralReaction', reaction));

                    await handler.callback({
                        sock,
                        m: mek,
                        sender,
                        reaction,
                        messageInfo
                    });
                }
            }

        } catch (err) {
            logError(lang.get('error.handleReaction', err.message));
            console.error(err);
        }
    },

    
    handleReply: async function({ sock, mek, sender, botNumber, messageInfo }) {
        try {
            
            if (!global.Luna.onReply) {
                global.Luna.onReply = new Map();
            }

            const threadID = mek.key.remoteJid;
            const quotedMessageId = messageInfo.quotedMessageId;

            if (!quotedMessageId) return;

            
            if (global.Luna.onReply.has(quotedMessageId)) {
                const handler = global.Luna.onReply.get(quotedMessageId);
                logInfo(lang.get('system.processingReply', quotedMessageId));

                await handler.callback({
                    sock,
                    m: mek,
                    sender,
                    messageInfo
                });

                
                if (handler.oneTime) {
                    global.Luna.onReply.delete(quotedMessageId);
                }
            }

        } catch (err) {
            logError(lang.get('error.handleReply', err.message));
            console.error(err);
        }
    },


    processEvents: async function({ sock, mek, sender, messageInfo, isGroup }) {
        try {
            
            if (!global.Luna.onEvent) {
                global.Luna.onEvent = new Map();
            }

            if (!global.Luna.activeEvents) {
                global.Luna.activeEvents = new Map();
            }

            const threadID = mek.key.remoteJid;

            
            for (const [eventName, handler] of global.Luna.onEvent.entries()) {
                
                if (global.Luna.activeEvents.has(eventName)) {
                    const eventConfig = global.Luna.activeEvents.get(eventName);

                    
                    if (eventConfig.threadIDs === '*' || 
                        (Array.isArray(eventConfig.threadIDs) && eventConfig.threadIDs.includes(threadID)) ||
                        eventConfig.threadIDs === threadID) {

                        logInfo(lang.get('system.processingEvent', eventName));

                        await handler.callback({
                            sock,
                            m: mek,
                            sender,
                            messageInfo,
                            isGroup,
                            eventConfig
                        });
                    }
                }
            }

        } catch (err) {
            logError(lang.get('error.processEvents', err.message));
            console.error(err);
        }
    },

    
    handleGroupEvent: async function(sock, eventType, eventData) {
        try {
            
            if (!global.Luna.onEvent) {
                global.Luna.onEvent = new Map();
            }

            const { groupId, participants, groupName } = eventData;

            
            if (global.Luna.onEvent.has(`group.${eventType}`)) {
                const handler = global.Luna.onEvent.get(`group.${eventType}`);

                logInfo(lang.get('system.processingGroupEvent', eventType, groupName));

                await handler.callback({
                    sock,
                    eventType,
                    eventData
                });
            }

            // Handle welcome message for joins
            if (eventType === 'join' && config.welcomeMessage?.enable) {
                try {
                    let welcomeMsg = config.welcomeMessage.message || lang.get('group.welcomeMessage');

                    // Replace placeholders
                    welcomeMsg = welcomeMsg
                        .replace('{user}', `@${participants[0].split('@')[0]}`)
                        .replace('{group}', groupName);

                    await sock.sendMessage(groupId, {
                        text: welcomeMsg,
                        mentions: participants
                    });

                    logInfo(lang.get('system.sentWelcomeMessage', groupName));
                } catch (err) {
                    logError(lang.get('error.sendWelcomeMessage', err.message));
                }
            }

            
            if (eventType === 'leave' && config.leaveMessage?.enable) {
                try {
                    let leaveMsg = config.leaveMessage.message || lang.get('group.leaveMessage');

                    
                    leaveMsg = leaveMsg
                        .replace('{user}', `@${participants[0].split('@')[0]}`)
                        .replace('{group}', groupName);

                    await sock.sendMessage(groupId, {
                        text: leaveMsg,
                        mentions: participants
                    });

                    logInfo(lang.get('system.sentLeaveMessage', groupName));
                } catch (err) {
                    logError(lang.get('error.sendLeaveMessage', err.message));
                }
            }

        } catch (err) {
            logError(lang.get('error.handleGroupEvent', err.message));
            console.error(err);
        }
    },

    
    handleCallEvent: async function(sock, callType, callData) {
        try {
            
            if (!global.Luna.onEvent) {
                global.Luna.onEvent = new Map();
            }

            const { callerId, callerName, isVideo } = callData;

            
            if (global.Luna.onEvent.has(`call.${callType}`)) {
                const handler = global.Luna.onEvent.get(`call.${callType}`);

                logInfo(lang.get('system.processingCallEvent', callType, callerName));

                await handler.callback({
                    sock,
                    callType,
                    callData
                });
            }

            
            if (callType === 'incoming' && config.rejectCalls) {
                try {
                    await sock.rejectCall(callData.callId, callData.callFrom);
                    logInfo(lang.get('system.autoRejectedCall', isVideo ? 'video' : 'voice', callerName));

                    
                    if (config.callRejectMessage) {
                        let rejectMessage = config.callRejectMessage || lang.get('call.rejectMessage');

                        await sock.sendMessage(callerId, {
                            text: rejectMessage
                        });
                        logInfo(lang.get('system.sentCallRejectionMessage', callerName));
                    }
                } catch (err) {
                    logError(lang.get('error.rejectCall', err.message));
                }
            }

        } catch (err) {
            logError(lang.get('error.handleCallEvent', err.message));
            console.error(err);
        }
    },

    
    handleContactEvent: async function(sock, eventType, contactData) {
        try {
            
            if (!global.Luna.onEvent) {
                global.Luna.onEvent = new Map();
            }

            
            if (global.Luna.onEvent.has(`contact.${eventType}`)) {
                const handler = global.Luna.onEvent.get(`contact.${eventType}`);

                logInfo(lang.get('system.processingContactEvent', eventType, contactData.contactName));

                await handler.callback({
                    sock,
                    eventType,
                    contactData
                });
            }
        } catch (err) {
            logError(lang.get('error.handleContactEvent', err.message));
            console.error(err);
        }
    },

    
    handleInviteEvent: async function(sock, inviteData) {
        try {
            
            if (!global.Luna.onEvent) {
                global.Luna.onEvent = new Map();
            }

            
            if (global.Luna.onEvent.has('group.invite')) {
                const handler = global.Luna.onEvent.get('group.invite');

                logInfo(lang.get('system.processingGroupInvite', inviteData.inviterName));

                await handler.callback({
                    sock,
                    inviteData
                });
            }

            if (config.autoAcceptInvites?.enable) {
                const inviterNumber = inviteData.inviter.replace(/[^0-9]/g, '');

                if (config.autoAcceptInvites.fromAdminsOnly) {
                    if (config.adminOnly?.adminNumbers.includes(inviterNumber)) {
                        try {
                            await sock.groupAcceptInvite(inviteData.groupId);
                            logSuccess(lang.get('system.autoAcceptedGroupInvite', inviteData.inviterName + ' (admin)'));
                        } catch (err) {
                            logError(lang.get('error.acceptGroupInvite', err.message));
                        }
                    }
                } else {
                    try {
                        await sock.groupAcceptInvite(inviteData.groupId);
                        logSuccess(lang.get('system.autoAcceptedGroupInvite', inviteData.inviterName));
                    } catch (err) {
                        logError(lang.get('error.acceptGroupInvite', err.message));
                    }
                }
            }

        } catch (err) {
            logError(lang.get('error.handleInviteEvent', err.message));
            console.error(err);
        }
    }
};


if (!global.Luna) {
    global.Luna = {
        onChat: new Map(),
        onReply: new Map(),
        onReaction: new Map(),
        onEvent: new Map(),
        activeEvents: new Map()
    };
}

module.exports = handlerAction;