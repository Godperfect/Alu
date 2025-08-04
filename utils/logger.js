
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const getTimestamp = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

const getDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
};

const writeToFile = (level, message) => {
    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `[${getTimestamp()}] [${getDate()}] [${level}] ${message}\n`;
    fs.appendFileSync(logFile, logEntry);
};

const logInfo = (message) => {
    const timestamp = getTimestamp();
    const date = getDate();
    console.log(chalk.blue(`[ INFO ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('INFO', message);
};

const logSuccess = (message) => {
    const timestamp = getTimestamp();
    const date = getDate();
    console.log(chalk.green(`[ SUCCESS ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('SUCCESS', message);
};

const logError = (message) => {
    const timestamp = getTimestamp();
    const date = getDate();
    console.log(chalk.red(`[ ERROR ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('ERROR', message);
};

const logWarning = (message) => {
    const timestamp = getTimestamp();
    const date = getDate();
    console.log(chalk.yellow(`[ WARNING ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
    writeToFile('WARNING', message);
};

const logCommand = (commandName, userId, chatType, groupName = null) => {
    const timestamp = getTimestamp();
    const date = getDate();
    const location = groupName ? `${groupName} (${chatType})` : chatType;
    const message = `Command '${commandName}' executed by ${userId} in ${location}`;
    console.log(chalk.cyan(`[ COMMAND ]`) + chalk.gray(` [${date}, ${timestamp}] `) + chalk.white(message));
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

    const timestamp = getTimestamp();
    const date = getDate();

    console.log(chalk.magenta('━'.repeat(60)));
    console.log(chalk.cyan.bold('📱 MESSAGE EVENT') + chalk.gray(` [${date}, ${timestamp}]`));
    console.log(chalk.white(`👤 Sender: `) + chalk.yellow(senderName) + chalk.gray(` (${senderId})`));
    console.log(chalk.white(`📍 Location: `) + chalk.cyan(groupName || 'Private Chat'));
    console.log(chalk.white(`📝 Type: `) + chalk.green(chatType));
    console.log(chalk.white(`💬 Content: `) + chalk.white(messageText || '[Media/Attachment]'));
    console.log(chalk.white(`📎 Attachment: `) + (hasAttachment ? chalk.green('Yes') : chalk.gray('No')));
    console.log(chalk.white(`🔄 Forwarded: `) + (isForwarded ? chalk.green('Yes') : chalk.gray('No')));
    console.log(chalk.white(`↩️  Reply: `) + chalk.gray(replyTo || 'None'));
    console.log(chalk.white(`🤖 From Bot: `) + (fromMe ? chalk.green('Yes') : chalk.gray('No')));
    console.log(chalk.magenta('━'.repeat(60)));

    writeToFile('MESSAGE', JSON.stringify(messageData));
};

const logGoatBotStyle = (type, data = {}) => {
    const timestamp = getTimestamp();
    const date = getDate();

    switch (type) {
        case 'startup':
            console.log(chalk.cyan('┌' + '─'.repeat(58) + '┐'));
            console.log(chalk.cyan('│') + chalk.white.bold('                    🚀 LUNA BOT STARTING                    ') + chalk.cyan('│'));
            console.log(chalk.cyan('│') + chalk.gray(`                    ${date}, ${timestamp}                    `) + chalk.cyan('│'));
            console.log(chalk.cyan('└' + '─'.repeat(58) + '┘'));
            break;

        case 'ready':
            console.log(chalk.green('┌' + '─'.repeat(58) + '┐'));
            console.log(chalk.green('│') + chalk.white.bold('                     ✅ BOT READY!                         ') + chalk.green('│'));
            console.log(chalk.green('│') + chalk.white(`                Connected as: ${data.name || 'Luna'}                 `) + chalk.green('│'));
            console.log(chalk.green('│') + chalk.gray(`                    ${date}, ${timestamp}                    `) + chalk.green('│'));
            console.log(chalk.green('└' + '─'.repeat(58) + '┘'));
            break;

        case 'command_load':
            console.log(chalk.blue(`[ LOAD ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                       chalk.white(`Command: `) + chalk.yellow(data.name) + 
                       chalk.gray(` (${data.category || 'general'})`));
            break;

        case 'event_load':
            console.log(chalk.blue(`[ LOAD ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                       chalk.white(`Event: `) + chalk.yellow(data.name));
            break;

        case 'connection':
            if (data.status === 'connecting') {
                console.log(chalk.yellow(`[ CONNECT ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white('Connecting to WhatsApp...'));
            } else if (data.status === 'open') {
                console.log(chalk.green(`[ CONNECT ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white('Successfully connected to WhatsApp!'));
            } else if (data.status === 'close') {
                console.log(chalk.red(`[ CONNECT ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white('Connection closed'));
            } else if (data.status === 'reconnecting') {
                console.log(chalk.yellow(`[ CONNECT ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white('Reconnecting to WhatsApp...'));
            }
            break;

        case 'auth':
            if (data.type === 'pairing') {
                console.log(chalk.magenta(`[ AUTH ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white(`Pairing code: `) + chalk.green.bold(data.code));
            } else if (data.type === 'success') {
                console.log(chalk.green(`[ AUTH ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white('Authentication successful!'));
            } else if (data.type === 'unauthorized') {
                console.log(chalk.red(`[ AUTH ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white('Unauthorized access attempt!'));
            }
            break;

        case 'database':
            if (data.status === 'connected') {
                console.log(chalk.green(`[ DATABASE ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white(`Database (${data.type}) initialized successfully`));
            } else if (data.status === 'error') {
                console.log(chalk.red(`[ DATABASE ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                           chalk.white(`Database error: ${data.error}`));
            }
            break;

        case 'uptime':
            console.log(chalk.blue(`[ UPTIME ]`) + chalk.gray(` [${date}, ${timestamp}] `) + 
                       chalk.white(`Server started on port ${data.port}`));
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
