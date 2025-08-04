const moment = require('moment-timezone');

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

module.exports = {
    logInfo,
    logSuccess,
    logError,
    logMessage,
    logCommand,
    logMessageDetails
};