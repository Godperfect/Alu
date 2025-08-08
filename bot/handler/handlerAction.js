const fs = require('fs');
const chalk = require('chalk');
const { logError, logInfo, logWarning, logSuccess, logEvent, logConnection, getSenderName, logMessage, getTextContent, getMessageType, hasMedia, getMediaInfo, getTimestamp, getFormattedDate, getPermissionLevel } = require('../../utils');
const { config } = require('../../config/globals');
const languageManager = require('../../language/language');
const dataHandler = require('./handlerCheckdata');


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
            const isChannel = threadID.endsWith('@newsletter');
            const isCommunity = messageInfo.messageType === 'community';

            // Check if user sent prefix only (no command)
            const messageText = mek.message ? getTextContent(mek.message) : '';
            const currentPrefix = isGroup && global.groupPrefix && global.groupPrefix[threadID] 
                ? global.groupPrefix[threadID] 
                : global.prefix;

            // If message is exactly the prefix or prefix + whitespace, show error
            if (messageText && messageText.trim() === currentPrefix.trim()) {
                return sock.sendMessage(threadID, { 
                    text: `❌ Prefix detected but no command provided. Please type a valid command after the prefix. Example: ${currentPrefix}help`
                }, { quoted: mek });
            }

            // Only show "no command provided" if there was actually a prefix detected
            if (!command) {
                return; // Silently return if no command (prefix wasn't detected)
            }

            // First try to get command directly, then check aliases
            let cmd = global.commands.get(command);

            if (!cmd && global.aliases && global.aliases.has(command)) {
                const actualCommandName = global.aliases.get(command);
                cmd = global.commands.get(actualCommandName);
            }

            // Fallback: search through command aliases (for backwards compatibility)
            if (!cmd) {
                cmd = [...global.commands.values()].find(cmd => 
                    cmd.aliases && cmd.aliases.includes(command)
                );
            }
  if (!cmd) {
                return sock.sendMessage(threadID, { 
                    text: `❌ Unknown command: *${command}*\n\nType *${global.prefix}help* to see available commands.`
                }, { quoted: mek });
            }


            // Try to execute the command using run or onStart method
            const executeMethod = cmd.run || cmd.onStart;
            if (typeof executeMethod === 'function') {
                // Extract user number using correct method for groups
                let userNumber = '';
                if (sender && typeof sender === 'string') {
                    if (isGroup) {
                        // For group messages, use participant JID (works for both @g.us and @lid groups)
                        const senderJid = mek.key.participant || sender; // 'XXXXXXXXXXXX@s.whatsapp.net'
                        userNumber = senderJid ? senderJid.split('@')[0] : ''; // Extract 'XXXXXXXXXXXX'
                    } else {
                        // Handle different ID formats for private messages
                        if (sender.includes('@lid')) {
                            // LinkedIn ID format
                            userNumber = sender.replace(/[^0-9]/g, '');
                        } else if (sender.includes('@s.whatsapp.net') || sender.includes('@c.us')) {
                            // Standard WhatsApp format
                            userNumber = sender.split('@')[0];
                        } else {
                            // Other formats
                            userNumber = sender.replace(/[^0-9]/g, '');
                        }

                        // For channels, if we can't extract a valid number, check other sources
                        if (isChannel && (!userNumber || userNumber.length < 8)) {
                            // Try to get from push name or context
                            const altSender = mek.pushName || mek.message?.contextInfo?.participant;
                            if (altSender) {
                                userNumber = altSender.replace(/[^0-9]/g, '');
                            }

                            // For channels, we might use a generic identifier
                            if (!userNumber || userNumber.length < 8) {
                                userNumber = 'channel_user_' + Math.random().toString(36).substr(2, 9);
                                logWarning(`Channel message from unidentified user in ${messageInfo.chatName}, using temp ID: ${userNumber}`);
                            }
                        }

                        // Validate phone number format (more lenient for channels)
                        if (!userNumber || (userNumber.length < 8 && !userNumber.startsWith('channel_user_'))) {
                            if (isChannel || isCommunity) {
                                // For channels/communities, use a fallback identifier
                                userNumber = 'community_user_' + Date.now();
                                logWarning(`Using fallback identifier for channel/community user: ${userNumber}`);
                            } else {
                                userNumber = '';
                            }
                        }
                    }
                } else {
                    userNumber = '';
                }


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
                    const userPermission = getPermissionLevel(userNumber, isGroup ? messageInfo.groupMetadata : null);

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


                await executeMethod({
                    sock,
                    mek,
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
            // Extract user number with proper group handling
            let userNumber = '';
            if (sender && typeof sender === 'string') {
                if (isGroup) {
                    // For group messages, use participant JID (works for both @g.us and @lid groups)
                    const senderJid = mek.key.participant || sender; // 'XXXXXXXXXXXX@s.whatsapp.net'
                    userNumber = senderJid ? senderJid.split('@')[0] : ''; // Extract 'XXXXXXXXXXXX'
                } else {
                    // For private messages, handle different formats
                    if (sender.includes('@lid')) {
                        // Handle @lid format (WhatsApp Web users)
                        userNumber = sender.replace('@lid', '');
                    } else if (sender.includes('@s.whatsapp.net')) {
                        userNumber = sender.replace('@s.whatsapp.net', '');
                    } else if (sender.includes('@c.us')) {
                        userNumber = sender.replace('@c.us', '');
                    } else if (sender.includes('@')) {
                        // Generic @ format handling
                        userNumber = sender.split('@')[0];
                    } else {
                        userNumber = sender.replace(/[^0-9]/g, '');
                    }

                    // Clean any remaining non-numeric characters
                    userNumber = userNumber.replace(/[^0-9]/g, '');
                }
            }

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

            // Check if message starts with prefix
            const hasPrefix = messageText.startsWith(currentPrefix);
            
            // Process onChat for ALL commands that have it, not just specific ones
            for (const [commandName, command] of global.commands.entries()) {
                if (typeof command.onChat === 'function') {
                    try {

                        // Check permission for onChat commands
                        if (command.permission !== undefined) {
                            const userPermission = getPermissionLevel(userNumber, isGroup ? messageInfo.groupMetadata : null);
                            if (userPermission < command.permission) {
                                continue; // Skip this command if user doesn't have permission
                            }
                        }

                        // Execute onChat function for event-based commands
                        const result = await command.onChat({
                            sock,
                            m: mek,
                            args: messageText.trim().split(/\s+/),
                            sender,
                            messageInfo,
                            isGroup,
                            messageText,
                            event: {
                                body: messageText,
                                senderID: userNumber,
                                threadID: threadID,
                                isGroup: isGroup
                            }
                        });

                        // If onChat returns true, stop processing other commands
                        if (result === true) {
                            logInfo(`OnChat event command executed: ${commandName} by ${userNumber}`);
                            return;
                        }
                    } catch (err) {
                        logError(`Error in onChat for ${commandName}: ${err.message}`);
                    }
                }
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

            // Handle message resend events (store incoming messages and detect deletions)
            if (global.Luna.onEvent.has('message.incoming')) {
                const handler = global.Luna.onEvent.get('message.incoming');
                await handler.callback({ sock, m: mek, messageInfo, isGroup });
            }

            // Handle protocol messages (deletions)
            if (mek.message?.protocolMessage && global.Luna.onEvent.has('message.protocol')) {
                const handler = global.Luna.onEvent.get('message.protocol');
                await handler.callback({ sock, m: mek, messageInfo, isGroup });
            }

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
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[GROUP_EVENT_HANDLER]')} Processing ${eventType} event for group ${eventData.groupName}`);

            if (!global.Luna.onEvent) {
                global.Luna.onEvent = new Map();
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[WARNING]')} Luna.onEvent was not initialized, creating new Map`);
            }

            const { groupId, participants, groupName } = eventData;

            // Process registered event handlers first with enhanced logging
            const eventKey = `group.${eventType}`;
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[CHECKING_HANDLER]')} Looking for handler: ${eventKey}`);

            if (global.Luna.onEvent.has(eventKey)) {
                const handler = global.Luna.onEvent.get(eventKey);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[HANDLER_FOUND]')} Found registered handler for: ${eventKey}`);

                logInfo(`Processing registered event handler for: ${eventKey}`);

                try {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[CALLING_HANDLER]')} Executing handler with data:`, {
                        eventType,
                        groupId,
                        groupName,
                        participants: participants?.length || 0
                    });

                    await handler.callback({
                        sock,
                        eventType,
                        eventData
                    });

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[HANDLER_SUCCESS]')} Event handler executed successfully for ${eventKey}`);
                } catch (error) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[HANDLER_ERROR]')} Error in registered event handler: ${error.message}`);
                    logError(`Error in registered event handler: ${error.message}`);
                }
            } else {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[NO_HANDLER]')} No registered handler found for: ${eventKey}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[AVAILABLE_HANDLERS]')} Available handlers:`, Array.from(global.Luna.onEvent.keys()));
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

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[WELCOME_SENT]')} Welcome message sent to ${groupName}`);
                    logInfo(lang.get('system.sentWelcomeMessage', groupName));
                } catch (err) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[WELCOME_ERROR]')} Failed to send welcome message: ${err.message}`);
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

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[LEAVE_SENT]')} Leave message sent to ${groupName}`);
                    logInfo(lang.get('system.sentLeaveMessage', groupName));
                } catch (err) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[LEAVE_ERROR]')} Failed to send leave message: ${err.message}`);
                    logError(lang.get('error.sendLeaveMessage', err.message));
                }
            }

        } catch (err) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[GROUP_EVENT_ERROR]')} Error in handleGroupEvent: ${err.message}`);
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