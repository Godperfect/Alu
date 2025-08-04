module.exports = {
    config: {
        name: "help",
        aliases: ["h", "commands", "menu"],
        description: "Display all available commands",
        category: "system",
        role: 0,
        cooldown: 5,
        guide: {
            en: "{p}help [command_name] - Show help for specific command\n{p}help - Show all commands"
        }
    },

    onStart: async ({ sock, m, args, commandManager }) => {
        try {
            if (args[0]) {
                // Show specific command info
                const command = commandManager.getCommand(args[0]);
                if (!command) {
                    return await sock.sendMessage(m.key.remoteJid, {
                        text: `❌ Command "${args[0]}" not found.`
                    }, { quoted: m });
                }

                const guide = command.config.guide?.en || 'No guide available';
                const helpText = `
╭─────────────────────╮
│     📚 COMMAND HELP      │
╰─────────────────────╯

🏷️ Name: ${command.config.name}
📝 Description: ${command.config.description}
📂 Category: ${command.config.category}
👥 Role: ${['Everyone', 'Group Admin', 'Bot Admin'][command.config.role]}
⏱️ Cooldown: ${command.config.cooldown}s
🔗 Aliases: ${command.config.aliases?.join(', ') || 'None'}

📖 Usage:
${guide.replace(/{p}/g, global.prefix)}
                `.trim();

                await sock.sendMessage(m.key.remoteJid, { text: helpText }, { quoted: m });
            } else {
                // Show all commands by category
                const categories = commandManager.getCategories();
                let helpText = `
╭─────────────────────╮
│     🤖 ${global.botName.toUpperCase()} COMMANDS     │
╰─────────────────────╯

`;

                for (const category of categories) {
                    const commands = commandManager.getCommandsByCategory(category);
                    helpText += `\n📂 ${category.toUpperCase()}\n`;

                    for (const cmd of commands) {
                        helpText += `├ ${global.prefix}${cmd.config.name} - ${cmd.config.description}\n`;
                    }
                }

                helpText += `\n💡 Use ${global.prefix}help <command> for detailed info about a command.`;
                helpText += `\n👑 Total Commands: ${commandManager.commands.size}`;

                await sock.sendMessage(m.key.remoteJid, { text: helpText }, { quoted: m });
            }
        } catch (error) {
            await sock.sendMessage(m.key.remoteJid, {
                text: "❌ Error occurred while showing help."
            }, { quoted: m });
        }
    },

    onChat: async ({ sock, m, messageText, event }) => {
        const lowerText = messageText.toLowerCase();
        if (lowerText === "help" || lowerText === "commands" || lowerText === "menu") {
            // Quick help without prefix
            await sock.sendMessage(event.threadID, {
                text: `🤖 Type ${global.prefix}help to see all commands!`
            }, { quoted: m });
            return true;
        }
        return false;
    }
};