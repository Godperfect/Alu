const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
};

const writeToFile = (level, message) => {
    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `[${getTimestamp()}] [${level}] ${message}\n`;
    fs.appendFileSync(logFile, logEntry);
};

const logInfo = (message) => {
    const timestamp = getTimestamp();
    console.log(chalk.blue(`[ INFO ]`) + chalk.gray(` [${timestamp}] `) + chalk.white(message));
    writeToFile('INFO', message);
};

const logSuccess = (message) => {
    const timestamp = getTimestamp();
    console.log(chalk.green(`[ SUCCESS ]`) + chalk.gray(` [${timestamp}] `) + chalk.white(message));
    writeToFile('SUCCESS', message);
};

const logError = (message) => {
    const timestamp = getTimestamp();
    console.log(chalk.red(`[ ERROR ]`) + chalk.gray(` [${timestamp}] `) + chalk.white(message));
    writeToFile('ERROR', message);
};

const logWarning = (message) => {
    const timestamp = getTimestamp();
    console.log(chalk.yellow(`[ WARNING ]`) + chalk.gray(` [${timestamp}] `) + chalk.white(message));
    writeToFile('WARNING', message);
};

const logCommand = (commandName, userId, chatType, groupName = null) => {
    const timestamp = getTimestamp();
    const location = groupName ? `${groupName} (${chatType})` : chatType;
    const message = `Command '${commandName}' executed by ${userId} in ${location}`;
    console.log(chalk.cyan(`[ COMMAND ]`) + chalk.gray(` [${timestamp}] `) + chalk.white(message));
    writeToFile('COMMAND', message);
};

const logMessage = (messageData) => {
    const {
        senderName,
        senderId,
        messageText,
        chatType,
        groupName,
        hasAttachment,
        isForwarded,
        replyTo,
        fromMe
    } = messageData;

    console.log(chalk.magenta('═'.repeat(50)));
    console.log(chalk.cyan('📱 Message Event'));
    console.log(chalk.white(`👤 Sender: ${senderName} (${senderId})`));
    console.log(chalk.white(`📍 Location: ${groupName || 'Private Chat'}`));
    console.log(chalk.white(`📝 Type: ${chatType}`));
    console.log(chalk.white(`💬 Content: ${messageText || '[Media/Attachment]'}`));
    console.log(chalk.white(`📎 Has Attachment: ${hasAttachment ? 'Yes' : 'No'}`));
    console.log(chalk.white(`🔄 Forwarded: ${isForwarded ? 'Yes' : 'No'}`));
    console.log(chalk.white(`↩️  Reply To: ${replyTo || 'None'}`));
    console.log(chalk.white(`🤖 From Bot: ${fromMe ? 'Yes' : 'No'}`));
    console.log(chalk.white(`🕒 Time: ${getTimestamp()}`));
    console.log(chalk.magenta('═'.repeat(50)));

    writeToFile('MESSAGE', JSON.stringify(messageData));
};

const logGoatBotStyle = (type, data) => {
    const timestamp = getTimestamp();

    switch (type) {
        case 'startup':
            console.log(chalk.cyan('┌─────────────────────────────────────┐'));
            console.log(chalk.cyan('│') + chalk.white('         🤖 LUNA BOT STARTING        ') + chalk.cyan('│'));
            console.log(chalk.cyan('│') + chalk.gray(`      ${timestamp}       `) + chalk.cyan('│'));
            console.log(chalk.cyan('└─────────────────────────────────────┘'));
            break;

        case 'ready':
            console.log(chalk.green('┌─────────────────────────────────────┐'));
            console.log(chalk.green('│') + chalk.white('         ✅ BOT READY!              ') + chalk.green('│'));
            console.log(chalk.green('│') + chalk.white(`    Connected as: ${data.name}       `) + chalk.green('│'));
            console.log(chalk.green('│') + chalk.gray(`      ${timestamp}       `) + chalk.green('│'));
            console.log(chalk.green('└─────────────────────────────────────┘'));
            break;

        case 'command_load':
            console.log(chalk.blue(`[ LOAD ]`) + chalk.gray(` [${timestamp}] `) + 
                       chalk.white(`Command: `) + chalk.yellow(data.name) + 
                       chalk.gray(` (${data.category})`));
            break;

        case 'event_load':
            console.log(chalk.blue(`[ LOAD ]`) + chalk.gray(` [${timestamp}] `) + 
                       chalk.white(`Event: `) + chalk.yellow(data.name));
            break;
    }
};

module.exports = {
    logInfo,
    logSuccess,
    logError,
    logWarning,
    logCommand,
    logMessage,
    logGoatBotStyle
};