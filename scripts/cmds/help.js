
const { getPermissionLevel, logError } = require("../../utils");
const { commands, aliases } = global; // Ensure global.commands and global.aliases are initialized

module.exports = {
    config: {
        name: "help",
        aliases: ["h", "menu", "commands"],
        description: "View command usage and list all available commands",
        category: "info",
        role: 0,
        cooldown: 3,
        guide: {
            en: "{p}help [command name]\nExample: {p}help ai"
        }
    },

    onStart: async ({ sock, m, args, sender, messageInfo }) => {
        try {
            const prefix = global.prefix;
            const userRole = getPermissionLevel(sender);
            
            if (args.length === 0) {
                let categories = {};
                let msg = "╔══════════════╗\n *LUNA BOT STYLE💐*\n╚══════════════╝\n";

                for (const [name, command] of commands.entries()) {
                    const permission = command.permission || command.config?.role || 0;
                    if (permission > userRole) continue; // Skip commands user cannot access

                    const category = command.category || command.config?.category || "Uncategorized";
                    if (!categories[category]) categories[category] = [];
                    categories[category].push(name);
                }

                Object.keys(categories).forEach((category) => {
                    if (category !== "info") {
                        msg += `\n╭────────────⭓\n│『 *${category.toUpperCase()}* 』`;

                        categories[category].sort().forEach((cmd) => {
                            msg += `\n│✧ ${cmd}`;
                        });

                        msg += `\n╰────────⭓`;
                    }
                });

                const totalCommands = commands.size;
                msg += `\n\nCurrently, I have *${totalCommands}* commands available. More commands will be added soon!\n`;
                msg += `\n_Type *${prefix}help commandName* to view details of a specific command._\n`;
                msg += `\n💫 *LUNA BOT STYLE* 💫\n`;
                msg += `\n🤖 Commands with onChat work without prefix too!`;

                // Random help images/gifs
                const helpListImages = [
                    "https://i.imgur.com/WHRGiPz.gif",
                    "https://i.imgur.com/zM4Hvmn.gif",
                    "https://i.imgur.com/8d6WbRJ.gif",
                    "https://i.imgur.com/aYS6HRa.mp4",
                    "https://i.imgur.com/AIz8ASV.jpeg",
                    "https://i.imgur.com/6vAPXOY.gif",
                ];
                const helpListImage = helpListImages[Math.floor(Math.random() * helpListImages.length)];

                await sock.sendMessage(m.key.remoteJid, {
                    text: msg,
                    image: { url: helpListImage },
                    footer: "Luna Bot Style",
                });

            } else {
                const commandName = args[0].toLowerCase();
                const command = commands.get(commandName) || commands.get(aliases.get(commandName));

                if (!command) {
                    return await sock.sendMessage(
                        m.key.remoteJid,
                        { text: `⚠️ Command "*${commandName}*" not found.` },
                        { quoted: m }
                    );
                }

                const permission = command.permission || command.config?.role || 0;
                const roleText = roleToString(permission);
                const description = command.description || command.config?.description || "No description available.";
                const category = command.category || command.config?.category || "Uncategorized";
                const aliases = command.aliases || command.config?.aliases || [];
                const guide = command.config?.guide?.en || command.usage || `*${prefix}${command.name}*`;
                const hasOnChat = typeof command.onChat === 'function';

                const response = `╭── *COMMAND INFO* ────⭓
│ *Name:* ${command.name}
│ *Description:* ${description}
│ *Category:* ${category}
│ *Aliases:* ${aliases.length > 0 ? aliases.join(", ") : "None"}
│ *Role Required:* ${roleText}
│ *Usage:* ${guide.replace(/{p}/g, prefix)}
│ *OnChat:* ${hasOnChat ? "✅ Yes (works without prefix)" : "❌ No"}
╰━━━━━━━━━❖`;

                await sock.sendMessage(m.key.remoteJid, { text: response }, { quoted: m });
            }
        } catch (err) {
            logError(`Error in help command: ${err.message}`);
            await sock.sendMessage(
                m.key.remoteJid,
                { text: "❌ An error occurred while fetching the help menu." },
                { quoted: m }
            );
        }
    },
};

// Function to convert role numbers to text
function roleToString(role) {
    switch (role) {
        case 0:
            return "All users";
        case 1:
            return "Group Admins";
        case 2:
            return "Bot Admins";
        default:
            return "Unknown Role";
    }
}
