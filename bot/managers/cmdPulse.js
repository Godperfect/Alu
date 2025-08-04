const fs = require('fs');
const path = require('path');
const { logSuccess, logError, logGoatBotStyle } = require('../../utils/logger');

class CommandManager {
    constructor() {
        this.commands = new Map();
        this.aliases = new Map();
        this.categories = new Map();
        this.cooldowns = new Map();
    }

    loadCommands() {
        const commandDir = path.join(__dirname, '../../scripts/cmds');

        if (!fs.existsSync(commandDir)) {
            logError('Commands directory not found');
            return;
        }

        const commandFiles = fs.readdirSync(commandDir).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            try {
                delete require.cache[require.resolve(path.join(commandDir, file))];
                const command = require(path.join(commandDir, file));

                if (!command.config || !command.config.name) {
                    logError(`Invalid command file: ${file}`);
                    continue;
                }

                // Register command
                this.commands.set(command.config.name, command);
                global.commands.set(command.config.name, command);

                // Register aliases
                if (command.config.aliases) {
                    for (const alias of command.config.aliases) {
                        this.aliases.set(alias, command.config.name);
                        global.aliases.set(alias, command.config.name);
                    }
                }

                // Categorize
                const category = command.config.category || 'general';
                if (!this.categories.has(category)) {
                    this.categories.set(category, []);
                }
                this.categories.get(category).push(command.config.name);

                logGoatBotStyle('command_load', {
                    name: command.config.name,
                    category: category
                });

            } catch (error) {
                logError(`Failed to load command ${file}: ${error.message}`);
            }
        }

        logSuccess(`Loaded ${this.commands.size} commands in ${this.categories.size} categories`);
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
}

module.exports = CommandManager;