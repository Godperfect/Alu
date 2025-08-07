
const { logInfo, logError, logSuccess, getTimestamp, getFormattedDate, logWarning } = require('../../utils');
const chalk = require('chalk');

module.exports = {
    config: {
        name: 'resend',
        author: 'Luna',
        version: '2.0.0',
        description: 'Control real-time message recovery system (memory-based)',
        category: 'admin',
        guide: {
            en: `Usage:
• resend on - Enable message recovery system
• resend off - Disable message recovery system  
• resend status - Check current status and memory stats
• resend clear - Clear memory buffer
• resend info - Show system information`
        },
        role: 1 // Admin only
    },

    onStart: async ({ sock, mek, args, messageInfo, isGroup }) => {
        try {
            if (!isGroup) {
                await sock.sendMessage(mek.key.remoteJid, {
                    text: `❌ *Group Only Command*\n\nThis command can only be used in groups.`
                }, { quoted: mek });
                return;
            }

            const groupId = mek.key.remoteJid;
            const sender = mek.key.participant || mek.key.remoteJid;
            const senderNumber = sender.split('@')[0];

            // Check if user is admin
            const isAdmin = messageInfo.groupMetadata &&
                           messageInfo.groupMetadata.participants &&
                           messageInfo.groupMetadata.participants.some(p =>
                               p.id.includes(senderNumber) && (p.admin === 'admin' || p.admin === 'superadmin')
                           );

            if (!isAdmin) {
                await sock.sendMessage(groupId, {
                    text: `❌ *Admin Only Command*\n\nOnly group administrators can control the message recovery system.`,
                    mentions: [sender]
                }, { quoted: mek });
                return;
            }

            const command = args[0] ? args[0].toLowerCase() : 'help';

            // Import the messageResend event functions
            const messageResendEvent = require('../events/messageResend');
            const { isResendEnabled, toggleResendSetting } = messageResendEvent;

            switch (command) {
                case 'on':
                case 'enable':
                    toggleResendSetting(groupId, true);
                    await sock.sendMessage(groupId, {
                        text: `✅ *Message Recovery System Enabled*\n\n🛡️ Deleted messages will be automatically recovered and resent.\n\n*Features:*\n• Real-time delete detection\n• Automatic message recovery\n• In-memory storage (no files/database)\n• Smart memory management\n• Support for text, images, videos, documents\n\n_Use \`resend off\` to disable_`,
                        mentions: [sender]
                    }, { quoted: mek });

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ENABLED]')} Message recovery enabled for group ${messageInfo.chatName} by admin ${senderNumber}`);
                    logSuccess(`Message recovery enabled for group ${messageInfo.chatName}`);
                    break;

                case 'off':
                case 'disable':
                    toggleResendSetting(groupId, false);
                    await sock.sendMessage(groupId, {
                        text: `❌ *Message Recovery System Disabled*\n\n🔕 Deleted messages will no longer be recovered in this group.\n\n_Use \`resend on\` to re-enable_`,
                        mentions: [sender]
                    }, { quoted: mek });

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RESEND_DISABLED]')} Message recovery disabled for group ${messageInfo.chatName} by admin ${senderNumber}`);
                    logInfo(`Message recovery disabled for group ${messageInfo.chatName}`);
                    break;

                case 'status':
                case 'check':
                    const isEnabled = isResendEnabled(groupId);
                    const status = isEnabled ? '✅ Enabled' : '❌ Disabled';
                    const defaultNote = !isEnabled ? '' : ' (Active)';

                    await sock.sendMessage(groupId, {
                        text: `🔄 *Message Recovery System Status*\n\n*Current Status:* ${status}${defaultNote}\n*System Type:* In-Memory Recovery\n*Detection:* Real-time\n*Storage:* Temporary (RAM only)\n*Recovery:* Automatic resending\n\n*Note:* Recent messages are stored temporarily in memory for recovery\n\n*Commands:*\n• \`resend on\` - Enable recovery\n• \`resend off\` - Disable recovery\n• \`resend status\` - Check status\n• \`resend info\` - System details`,
                        mentions: [sender]
                    }, { quoted: mek });
                    break;

                case 'info':
                case 'details':
                    await sock.sendMessage(groupId, {
                        text: `📋 *Message Recovery System Information*\n\n*How it works:*\n• Messages are temporarily stored in memory\n• When a delete is detected, original message is resent\n• No files or databases are used\n• Memory is automatically cleaned\n\n*Supported message types:*\n• Text messages\n• Images (with captions)\n• Videos (with captions) \n• Documents (with captions)\n• Audio messages\n• Stickers\n\n*Memory management:*\n• Smart cleanup of old messages\n• Automatic memory optimization\n• No permanent storage\n\n*Privacy:* Messages are only stored temporarily for recovery purposes`,
                        mentions: [sender]
                    }, { quoted: mek });
                    break;

                case 'clear':
                    // This would clear the memory buffer - we can implement this if needed
                    await sock.sendMessage(groupId, {
                        text: `🗑️ *Memory Buffer Management*\n\nMemory buffer is automatically managed and cleaned.\n\n*Auto-cleanup features:*\n• Old messages are removed automatically\n• Memory usage is optimized\n• No manual clearing needed\n\n_The system manages memory efficiently without manual intervention_`,
                        mentions: [sender]
                    }, { quoted: mek });
                    break;

                default:
                    const currentStatus = isResendEnabled(groupId) ? '✅ Enabled' : '❌ Disabled';
                    const helpText = `🛡️ *Message Recovery System Commands*\n\n*Usage:* \`resend <action>\`\n\n*Available Actions:*\n• \`on\` - Enable message recovery\n• \`off\` - Disable message recovery\n• \`status\` - Check current status\n• \`info\` - Show system information\n• \`clear\` - Memory info\n\n*Current Status:* ${currentStatus}\n\n*Note:* This system automatically recovers deleted messages by storing them temporarily in memory.`;

                    await sock.sendMessage(groupId, {
                        text: helpText,
                        mentions: [sender]
                    }, { quoted: mek });
                    break;
            }

        } catch (error) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[RESEND_CMD_ERROR]')} Error in resend command: ${error.message}`);
            logError(`Error in resend command: ${error.message}`);

            await sock.sendMessage(mek.key.remoteJid, {
                text: `❌ *Command Error*\n\nFailed to execute resend command. Please try again.`,
                mentions: [mek.key.participant || mek.key.remoteJid]
            }, { quoted: mek });
        }
    }
};
