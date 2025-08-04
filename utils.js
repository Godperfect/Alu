
const moment = require('moment-timezone');
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { proto: baileysProto, getContentType, jidDecode } = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

// Logger utilities
let gradients = {};
let gradient;

(async () => {
    gradient = (await import('gradient-string')).default;

    gradients = {
        lime: gradient('#32CD32', '#ADFF2F'),
        cyan: gradient('#00FFFF', '#00BFFF'),
        instagram: gradient(['#F58529', '#DD2A7B', '#8134AF', '#515BD4']),
        purple: gradient('#9B59B6', '#8E44AD'),
        blue: gradient('#2980B9', '#3498DB'),
        red: gradient('#FF6347', '#FF4500'),
        yellow: gradient('#FFDD00', '#FF6347'),
        rainbow: gradient.rainbow
    };
})();

const getNepalTime = () => {
    return moment().tz('Asia/Kathmandu').format('YYYY-MM-DD HH:mm:ss');
};

const waitForGradient = async () => {
    while (!gradient) await new Promise(r => setTimeout(r, 10));
};

const logInfo = async (message) => {
    await waitForGradient();
    console.log(gradients.lime(`[INFO] ${message}`));
};

const logSuccess = async (message) => {
    await waitForGradient();
    console.log(gradients.cyan(`[SUCCESS] ${message}`));
};

const logError = async (message) => {
    await waitForGradient();
    console.log(gradients.instagram(`[ERROR] ${message}`));
};

const logMessage = async (messageData) => {
    await waitForGradient();
    const {
        messageType,
        chatName,
        senderName,
        messageText,
        hasAttachment,
        attachmentType,
        isForwarded,
        repliedTo,
        isReaction,
        reaction,
        timestamp,
        fromMe
    } = messageData;

    console.log(gradient.rainbow("-".repeat(37)));

    const icon = messageType === 'group' || messageType === 'community' ? '👥' :
        messageType === 'channel' ? '📢' : '📩';
    const messageStatus = fromMe ? 'Sent' : 'Received';
    const typeName = messageType === 'private' ? 'Private' :
        messageType === 'group' ? 'Group' :
        messageType === 'community' ? 'Community' : 'Channel';

    console.log(`\n${icon} ${typeName} Message ${messageStatus}`);
    if (chatName) {
        const nameLabel = messageType === 'group' || messageType === 'community' ? '👥 Group Name' :
            messageType === 'channel' ? '📢 Channel Name' : '👤 Sender';
        console.log(`${nameLabel}: ${gradients.cyan(chatName)}`);
    }

    if (!fromMe) {
        console.log(`👤 Sender: ${gradients.purple(senderName)}`);
    }

    const chatTypeFullName = messageType === 'private' ? 'Private Chat' :
        messageType === 'group' ? 'Group Chat' :
        messageType === 'community' ? 'Community Group' : 'Channel';
    console.log(`📌 Chat Type: ${gradients.blue(chatTypeFullName)}`);

    if (!isReaction || messageText) {
        console.log(`💬 Message: ${gradients.yellow(messageText || '[No text content]')}`);
    }

    console.log(`📎 Attachment: ${gradients.purple(hasAttachment ? attachmentType : 'None')}`);
    console.log(`🔁 Forwarded: ${gradients.blue(isForwarded ? 'Yes' : 'No')}`);
    console.log(`↩️ Replied To: ${gradients.yellow(repliedTo || 'None')}`);
    console.log(`👍 Reaction: ${gradients.purple(reaction ? `"${reaction}"` : 'None')}`);

    if (isReaction) {
        console.log(`👍 Message Type: ${gradients.red('Reaction Message')}`);
    }

    console.log(`📨 From Me: ${gradients.blue(fromMe ? 'True' : 'False')}`);
    console.log(`🕒 Timestamp: ${gradients.yellow(timestamp)}`);

    console.log(gradient.rainbow("-".repeat(37) + "\n"));
};

const logCommand = async (command, sender, success = true) => {
    await waitForGradient();
    const time = getNepalTime();
    if (success) {
        console.log(gradients.cyan(`[COMMAND] ${sender} executed: ${command} at ${time}`));
    } else {
        console.log(gradients.red(`[COMMAND FAILED] ${sender} failed to execute: ${command} at ${time}`));
    }
};

const logMessageDetails = async ({ ownerId, sender, groupName, message, reactions = null, timezone }) => {
    await waitForGradient();
    const time = getNepalTime();

    console.log(gradient.rainbow("-".repeat(37) + "\n"));
    console.log(gradients.rainbow("[INFO]"));
    console.log(`    ${gradients.yellow('Owner ID:')} ${gradients.purple(ownerId.join(', '))}`);
    console.log(`    ${gradients.blue('Sender:')} ${gradients.purple(sender)}`);
    console.log(`    ${gradients.yellow('Group Name:')} ${gradients.purple(groupName || 'Unknown Group')}`);
    console.log(`    ${gradients.blue('Message:')} ${gradients.purple(message || '[No Message]')}`);

    if (reactions) {
        console.log(`    ${gradients.blue('Reactions:')}`);
        console.log(`        ${gradients.green('User:')} ${gradients.purple(reactions.user)}`);
        console.log(`        ${gradients.yellow('Emoji:')} ${gradients.red(reactions.emoji)}`);
    } else {
        console.log(`    ${gradients.blue('Reactions:')} ${gradients.red('None')}`);
    }

    console.log(`    ${gradients.yellow('Timezone:')} ${gradients.red(timezone)}`);
    console.log(`    ${gradients.yellow('Logged At:')} ${gradients.red(time)}`);
    console.log(gradient.rainbow("-".repeat(37) + "\n"));
    console.log(gradient.rainbow('\n======= Thanks to Mr perfect ========\n'));
};

// Media handler utilities
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

// Message editor utilities
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

// Message parser utilities
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

// Message serializer utilities
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

// Permission utilities
const botAdmins = config.adminOnly.adminNumbers || [];

const isBotAdmin = (userNumber) => {
    return botAdmins.includes(userNumber);
};

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

const getPermissionLevel = (userNumber, groupMetadata = null) => {
    // Level 2: Bot Admin privileges - highest priority
    if (isBotAdmin(userNumber)) return 2;
    
    // Level 1: Group Admin privileges (in groups only)
    if (groupMetadata && isGroupAdmin(userNumber, groupMetadata)) return 1;
    
    // Level 0: Regular user - lowest privilege level
    return 0;
};

const hasPermission = (userNumber, groupMetadata, requiredLevel) => {
    const userLevel = getPermissionLevel(userNumber, groupMetadata);
    return userLevel >= requiredLevel;
};

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

module.exports = {
    // Logger functions
    logInfo,
    logSuccess,
    logError,
    logMessage,
    logCommand,
    logMessageDetails,
    
    // Media handler functions
    initializeMediaHandlers,
    downloadMedia,
    
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
