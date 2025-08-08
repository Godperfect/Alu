const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Safe require with auto-install
function safeRequire(moduleName) {
    try {
        return require(moduleName);
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            console.log(`[AUTO-INSTALL] Module "${moduleName}" not found. Installing...`);
            try {
                execSync(`npm install ${moduleName}`, { stdio: 'inherit' });
                return require(moduleName);
            } catch (installErr) {
                console.error(`Failed to install module "${moduleName}":`, installErr);
                throw installErr;
            }
        } else {
            throw err;
        }
    }
}

// External utilities (assumed to be local files, not external modules)
const { logSuccess, logCommand, logError } = require('../../utils');
const { config } = require('../../config/globals');
const chalk = require('chalk');

/**
 * Get formatted timestamp
 * @returns {string} Formatted timestamp in [HH:mm:ss] format
 */
const getTimestamp = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return chalk.gray(`[${hours}:${minutes}:${seconds}]`);
};

/**
 * Get formatted date
 * @returns {string} Formatted date in [YYYY-MM-DD] format
 */
const getFormattedDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return chalk.gray(`[${year}-${month}-${day}]`);
};

class CommandManager {
    constructor() {
        this.cooldowns = new Map();
        this.commandsFolder = path.resolve(__dirname, '../../scripts/cmds');
        this.cooldownTime = config.antiSpam.cooldownTime || 5; // seconds
    }

    // Load all command files from the commands folder
    loadCommands() {
        if (!global.commands) global.commands = new Map();

        const commandFiles = fs.readdirSync(this.commandsFolder).filter(file => file.endsWith('.js'));
        let totalCommands = 0;
        let failedCommands = 0;

        commandFiles.forEach(file => {
            const commandPath = path.join(this.commandsFolder, file);

            try {
                let command;
                try {
                    command = require(commandPath);
                } catch (err) {
                    if (err.code === 'MODULE_NOT_FOUND') {
                        const missingModule = err.message.match(/'(.+?)'/)?.[1];
                        if (missingModule) {
                            console.log(`[AUTO-INSTALL] Missing dependency "${missingModule}" in ${file}. Installing...`);
                            execSync(`npm install ${missingModule}`, { stdio: 'inherit' });
                            command = require(commandPath);
                        } else {
                            throw err;
                        }
                    } else {
                        throw err;
                    }
                }

                // Skip certain files during development
                if (file === 'example.js' || file === '.DS_Store' || file === 'resend.js') {
                    return;
                }

                // Check for newer Luna command structure (with config object)
                if (command && command.config && command.config.name) {
                    const cmd = {
                        name: command.config.name,
                        description: command.config.description || 'No description provided',
                        usage: command.config.guide?.en || `${global.prefix}${command.config.name}`,
                        category: command.config.category || 'general',
                        role: command.config.role || 0,
                        cooldown: command.config.cooldown || this.cooldownTime,
                        aliases: command.config.aliases || [],
                        run: command.onStart,
                        onChat: command.onChat || null,
                        onReply: command.onReply || null,
                        onReaction: command.onReaction || null
                    };

                    global.commands.set(cmd.name, cmd);

                    if (cmd.aliases && cmd.aliases.length > 0) {
                        cmd.aliases.forEach(alias => {
                            global.aliases.set(alias, cmd.name);
                        });
                    }

                    totalCommands++;
                } else if (command && command.name) {
                    // Original Luna style command structure
                    global.commands.set(command.name, command);

                    if (command.aliases && Array.isArray(command.aliases)) {
                        command.aliases.forEach(alias => {
                            global.aliases.set(alias, command.name);
                        });
                    }

                    totalCommands++;
                } else {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${chalk.red('Invalid command structure in file:')} ${chalk.yellow(file)}`);
                    failedCommands++;
                }

                // Clear the require cache to allow for hot reloading during development
                delete require.cache[require.resolve(commandPath)];

            } catch (err) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${chalk.red('Failed to load command from')} ${chalk.yellow(file)}: ${chalk.red(err.message)}`);
                failedCommands++;
            }
        });

        if (failedCommands > 0) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${chalk.red('Failed to load')} ${chalk.yellow(failedCommands)} ${chalk.red('commands')}`);
        }
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SUCCESS]')} ${chalk.cyan('Successfully loaded')} ${chalk.yellow(totalCommands)} ${chalk.cyan('commands')} ${failedCommands > 0 ? chalk.red(`(${failedCommands} failed)`) : ''}`);
        console.log('─────────────────────────────────────────');
    }

    // Check if the command is on cooldown for the sender
    checkCooldown(command, sender) {
        if (!config.antiSpam.enable) return false;

        const now = Date.now();
        if (!this.cooldowns.has(command)) this.cooldowns.set(command, new Map());

        const timestamps = this.cooldowns.get(command);
        const cmd = global.commands.get(command);
        const cooldownAmount = (cmd.cooldown || this.cooldownTime) * 1000;

        if (timestamps.has(sender)) {
            const expirationTime = timestamps.get(sender) + cooldownAmount;
            if (now < expirationTime) {
                return ((expirationTime - now) / 1000).toFixed(1);
            }
        }

        return false;
    }

    // Apply cooldown to a command for a specific sender
    applyCooldown(command, sender) {
        if (!config.antiSpam.enable) return;

        const now = Date.now();
        if (!this.cooldowns.has(command)) this.cooldowns.set(command, new Map());

        const timestamps = this.cooldowns.get(command);
        const cmd = global.commands.get(command);
        const cooldownAmount = (cmd.cooldown || this.cooldownTime) * 1000;

        timestamps.set(sender, now);
        setTimeout(() => timestamps.delete(sender), cooldownAmount);
    }

    // Check if sender is allowed to execute the command
    canExecuteCommand(sender) {
        const senderId = sender.replace(/[^0-9]/g, '');

        if (config.adminOnly.enable && !global.adminList.includes(senderId)) {
            return false;
        }

        if (config.whiteListMode.enable && !global.whiteList.includes(senderId)) {
            return false;
        }

        return true;
    }
}

module.exports = CommandManager;