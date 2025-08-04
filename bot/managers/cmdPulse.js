const fs = require('fs');
const path = require('path');
const { logSuccess, logError, logGoatBotStyle, logInfo, logWarning } = require('../../utils/logger');

class CommandManager {
    constructor() {
        this.commands = new Map();
        this.aliases = new Map();
        this.categories = new Map();
        this.cooldowns = new Map();
    }

    async loadCommands() {
        const commandsPath = path.join(__dirname, '../../scripts/cmds');

        if (!fs.existsSync(commandsPath)) {
            logError('Commands directory not found');
            return;
        }

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        let loadedCount = 0;
        const categories = new Set();
        const failedCommands = [];

        for (const file of commandFiles) {
            try {
                delete require.cache[require.resolve(path.join(commandsPath, file))];
                const command = require(path.join(commandsPath, file));

                if (this.validateCommand(command)) {
                    this.commands.set(command.config.name, command);

                    if (command.config.aliases) {
                        command.config.aliases.forEach(alias => {
                            this.aliases.set(alias, command.config.name);
                        });
                    }

                    categories.add(command.config.category || 'uncategorized');
                    loadedCount++;

                    logGoatBotStyle('command_load', {
                        name: command.config.name,
                        category: command.config.category
                    });
                } else {
                    logError(`Invalid command file: ${file}`);
                    failedCommands.push(file);
                }
            } catch (error) {
                if (error.code === 'MODULE_NOT_FOUND') {
                    const missingModule = error.message.match(/Cannot find module '([^']+)'/)?.[1];
                    if (missingModule && !missingModule.startsWith('.')) {
                        logInfo(`Installing missing dependency: ${missingModule}`);
                        try {
                            const { execSync } = require('child_process');
                            execSync(`npm install ${missingModule}`, { stdio: 'inherit' });

                            // Retry loading the command
                            delete require.cache[require.resolve(path.join(commandsPath, file))];
                            const command = require(path.join(commandsPath, file));

                            if (this.validateCommand(command)) {
                                this.commands.set(command.config.name, command);

                                if (command.config.aliases) {
                                    command.config.aliases.forEach(alias => {
                                        this.aliases.set(alias, command.config.name);
                                    });
                                }

                                categories.add(command.config.category || 'uncategorized');
                                loadedCount++;

                                logGoatBotStyle('command_load', {
                                    name: command.config.name,
                                    category: command.config.category
                                });
                            }
                        } catch (installError) {
                            logError(`Failed to install ${missingModule}: ${installError.message}`);
                            failedCommands.push(file);
                        }
                    } else {
                        logError(`Error loading command ${file}: ${error.message}`);
                        failedCommands.push(file);
                    }
                } else {
                    logError(`Error loading command ${file}: ${error.message}`);
                    failedCommands.push(file);
                }
            }
        }

        logSuccess(`Loaded ${loadedCount} commands in ${categories.size} categories`);
        if (failedCommands.length > 0) {
            logWarning(`Failed to load ${failedCommands.length} commands: ${failedCommands.join(', ')}`);
        }
    }

    getCommand(name) {
        return this.commands.get(name) || this.commands.get(this.aliases.get(name));
    }

    getAllCommands() {
        return Array.from(this.commands.values());
    }

    getCommandsByCategory(category) {
        const commands = this.categories.get(category) || [];
        return commands.map(name => this.commands.get(name));
    }

    getCategories() {
        return Array.from(this.categories.keys());
    }

    checkCooldown(userId, commandName, cooldownTime) {
        const key = `${userId}-${commandName}`;
        const now = Date.now();

        if (this.cooldowns.has(key)) {
            const expirationTime = this.cooldowns.get(key) + (cooldownTime * 1000);
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return Math.ceil(timeLeft);
            }
        }

        this.cooldowns.set(key, now);
        return 0;
    }

    hasPermission(userId, requiredRole) {
        const userRole = this.getUserRole(userId);
        return userRole >= requiredRole;
    }

    getUserRole(userId) {
        if (global.owner.includes(userId)) return 2;
        if (global.adminList.includes(userId)) return 1;
        return 0;
    }

    validateCommand(command) {
        if (!command || !command.config || !command.run) {
            return false;
        }

        if (typeof command.config.name !== 'string' || command.config.name.trim() === '') {
            return false;
        }

        if (command.config.aliases && (!Array.isArray(command.config.aliases) || command.config.aliases.some(alias => typeof alias !== 'string'))) {
            return false;
        }

        if (command.config.category && typeof command.config.category !== 'string') {
            return false;
        }

        return true;
    }
}

module.exports = CommandManager;