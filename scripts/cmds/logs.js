
const chalk = require('chalk');
const db = require('../../dashboard/connectDB');
const { getSenderName, getTimestamp, getFormattedDate } = require('../../utils');

module.exports = {
    config: {
        name: "logs",
        aliases: ["messagelogs", "recentlogs"],
        version: "1.0.0",
        author: "Luna Bot",
        countDown: 5,
        role: 2,
        shortDescription: "View recent message logs",
        longDescription: "Display recent message logs with detailed information including sender, content, attachments, etc.",
        category: "admin",
        guide: {
            en: "{pn} [limit] - Show recent messages (default: 10, max: 50)"
        }
    },

    onStart: async function ({ message, args, api, event }) {
        try {
            // Check if user is admin
            const userNumber = event.senderID;
            const config = require('../../config/globals').config;
            
            if (!config.adminOnly.adminNumbers.includes(userNumber) && !event.isGroup) {
                return message.reply("❌ This command is only available for administrators.");
            }

            let limit = parseInt(args[0]) || 10;
            if (limit > 50) limit = 50;
            if (limit < 1) limit = 10;

            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[LOGS COMMAND]')} Fetching ${limit} recent messages`);

            // Get recent messages from database
            const dbStatus = db.getStatus();
            if (!dbStatus.connected) {
                return message.reply("❌ Database is not connected.");
            }

            let recentMessages = [];
            
            if (dbStatus.primaryDB === 'sqlite') {
                recentMessages = await db.sqlite.all(
                    `SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?`,
                    [limit]
                );
            } else if (dbStatus.primaryDB === 'mongodb') {
                recentMessages = await db.mongodb.db.collection('messages')
                    .find({})
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .toArray();
            }

            if (!recentMessages || recentMessages.length === 0) {
                return message.reply("📝 No recent messages found in the database.");
            }

            let logText = `📊 *RECENT MESSAGE LOGS* (${recentMessages.length} messages)\n\n`;

            for (let i = 0; i < recentMessages.length; i++) {
                const msg = recentMessages[i];
                const timestamp = new Date(msg.timestamp).toLocaleString();
                
                logText += `*${i + 1}.* 📱 *Sender:* ${msg.userId}\n`;
                logText += `📅 *Time:* ${timestamp}\n`;
                logText += `💬 *Type:* ${msg.messageType || 'text'}\n`;
                logText += `📄 *ID:* ${msg.messageId}\n`;
                
                if (msg.groupId) {
                    logText += `👥 *Group:* ${msg.groupId}\n`;
                }
                
                if (msg.hasMedia) {
                    logText += `📎 *Has Media:* ✅\n`;
                }
                
                if (msg.isForwarded) {
                    logText += `↪️ *Forwarded:* ✅\n`;
                }
                
                if (msg.isReply) {
                    logText += `💭 *Reply:* ✅\n`;
                }
                
                if (msg.messageLength > 0) {
                    logText += `📏 *Length:* ${msg.messageLength} chars\n`;
                }
                
                logText += `\n`;
            }

            // Console log for detailed view
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[LOGS DISPLAY]')} Showing ${recentMessages.length} recent messages:`);
            
            for (const msg of recentMessages) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('─────────────────────────')}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Message ID:')} ${chalk.white(msg.messageId)}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('User ID:')} ${chalk.white(msg.userId)}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Group ID:')} ${chalk.white(msg.groupId || 'Private Chat')}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Type:')} ${chalk.white(msg.messageType)}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Has Media:')} ${msg.hasMedia ? chalk.green('YES') : chalk.red('NO')}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Forwarded:')} ${msg.isForwarded ? chalk.yellow('YES') : chalk.red('NO')}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Reply:')} ${msg.isReply ? chalk.green('YES') : chalk.red('NO')}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Length:')} ${chalk.white(msg.messageLength || 0)} chars`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Timestamp:')} ${chalk.white(new Date(msg.timestamp).toLocaleString())}`);
            }

            return message.reply(logText);

        } catch (error) {
            console.error(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[LOGS ERROR]')} ${error.message}`);
            return message.reply(`❌ Error retrieving logs: ${error.message}`);
        }
    }
};
