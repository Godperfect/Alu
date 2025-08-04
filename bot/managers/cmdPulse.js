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
const { logSuccess, logCommand } = require('../../utils/logger');
const { config } = require('../../config/globals');

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

                if (command && command.config && command.config.name) {
                    // GoatBot style command structure
                    const cmd = {
                        name: command.config.name,
                        description: command.config.description || "No description available",
                        category: command.config.category || "general",
                        permission: command.config.role || 0,
                        cooldown: command.config.cooldown || 0,
                        aliases: command.config.aliases || [],
                        run: command.onStart,
                        onChat: command.onChat,
                        onReply: command.onReply,
                        onReaction: command.onReaction,
                        onEvent: command.onEvent
                    };

                    global.commands.set(cmd.name, cmd);

                    if (cmd.aliases && Array.isArray(cmd.aliases)) {
                        cmd.aliases.forEach(alias => {
                            global.aliases.set(alias, cmd.name);
                        });
                    }

                    logSuccess(`Loaded GoatBot command: ${cmd.name}`);
                } else if (command && command.name) {
                    // Original Luna style command structure
                    global.commands.set(command.name, command);

                    if (command.aliases && Array.isArray(command.aliases)) {
                        command.aliases.forEach(alias => {
                            global.aliases.set(alias, command.name);
                        });
                    }

                    logSuccess(`Loaded command: ${command.name}`);
                } else {
                    console.warn(`Invalid command structure in ${file}`);
                }

            } catch (err) {
                console.error(`Failed to load command "${file}":`, err);
            }
        });
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