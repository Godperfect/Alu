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

const logLunaStyle = (type, data = {}) => {
    const timestamp = getTimestamp();
    const date = getDate();

    switch (type) {
        case 'startup':
            console.clear();
            console.log(chalk.blue.bold('\n╔══════════════════════════════════════════════════════════╗'));
            console.log(chalk.blue.bold('║') + chalk.white.bold('                      LUNA BOT v1.3                      ') + chalk.blue.bold('║'));
            console.log(chalk.blue.bold('║') + chalk.cyan('                   Professional WhatsApp Bot              ') + chalk.blue.bold('║'));
            console.log(chalk.blue.bold('║') + chalk.gray(`                     ${date} ${timestamp}                     `) + chalk.blue.bold('║'));
            console.log(chalk.blue.bold('╚══════════════════════════════════════════════════════════╝\n'));
            break;

        case 'ready':
            console.log(chalk.green.bold('\n╔══════════════════════════════════════════════════════════╗'));
            console.log(chalk.green.bold('║') + chalk.white.bold('                    ✅ BOT ONLINE                        ') + chalk.green.bold('║'));
            console.log(chalk.green.bold('║') + chalk.white(`                   Connected as: ${data.name || 'Luna'}                   `) + chalk.green.bold('║'));
            console.log(chalk.green.bold('║') + chalk.gray(`                     ${date} ${timestamp}                     `) + chalk.green.bold('║'));
            console.log(chalk.green.bold('╚══════════════════════════════════════════════════════════╝\n'));
            break;

        case 'command_load':
            console.log(chalk.blue(`●`) + chalk.white(` Command loaded: `) + chalk.yellow.bold(data.name) + 
                       (data.category ? chalk.gray(` [${data.category}]`) : ''));
            break;

        case 'event_load':
            console.log(chalk.magenta(`●`) + chalk.white(` Event loaded: `) + chalk.cyan.bold(data.name));
            break;

        case 'database':
            if (data.status === 'connected') {
                console.log(chalk.green(`✓`) + chalk.white(` Database connected: `) + chalk.green.bold(data.type.toUpperCase()));
            } else if (data.status === 'error') {
                console.log(chalk.red(`✗`) + chalk.white(` Database error: `) + chalk.red(data.error));
            }
            break;

        case 'connection':
            const statusIcons = {
                'open': chalk.green('●'),
                'close': chalk.red('●'),
                'connecting': chalk.yellow('●'),
                'reconnecting': chalk.blue('●')
            };
            const icon = statusIcons[data.status] || chalk.white('●');
            console.log(icon + chalk.white(` Connection status: `) + chalk.bold(data.status.toUpperCase()));
            break;

        case 'uptime':
            console.log(chalk.cyan(`●`) + chalk.white(` Uptime server: `) + chalk.cyan.bold(`http://localhost:${data.port}`));
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