
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
const { logError } = require("../../utils");

module.exports = {
    config: {
        name: "help",
        aliases: ["h", "menu", "commands"],
        description: "View command usage and list all available commands with waifu images",
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
            
            if (args.length === 0) {
                // Fetch waifu image
                const res = await fetch("https://api.waifu.pics/sfw/waifu");
                const { url } = await res.json();
                const squareUrl = `https://images.weserv.nl/?url=${url.replace("https://", "")}&w=512&h=512&fit=cover`;

                let msg = "╔══════════════╗\n";
                msg += "    *LUNA BOT V2* 🌙\n";
                msg += "╚══════════════╝\n\n";
                
                // List all available commands
                if (global.commands && global.commands.size > 0) {
                    msg += "📋 *Available Commands:*\n\n";
                    
                    let categories = {};
                    for (const [name, command] of global.commands.entries()) {
                        const category = command.category || command.config?.category || "General";
                        if (!categories[category]) categories[category] = [];
                        categories[category].push(name);
                    }

                    Object.keys(categories).forEach((category) => {
                        msg += `╭────────────⭓\n`;
                        msg += `│『 *${category.toUpperCase()}* 』\n`;

                        categories[category].sort().forEach((cmd) => {
                            msg += `│✧ ${cmd}\n`;
                        });

                        msg += `╰────────⭓\n\n`;
                    });

                    const totalCommands = global.commands.size;
                    msg += `Currently, I have *${totalCommands}* commands available!\n\n`;
                } else {
                    msg += "📋 *Available Commands:*\n\n";
                    msg += "╭────────────⭓\n";
                    msg += "│『 *INFO* 』\n";
                    msg += "│✧ help\n";
                    msg += "╰────────⭓\n\n";
                    msg += "Currently, I have *1* command available!\n\n";
                }
                
                msg += `_Type *${prefix}help commandName* to view details of a specific command._\n\n`;
                msg += `💫 *LUNA BOT V2* 💫\n`;
                msg += `🤖 Made with ❤️`;

                await sock.sendMessage(m.key.remoteJid, {
                    image: { url: squareUrl },
                    caption: msg
                }, { quoted: m });

            } else {
                const commandName = args[0].toLowerCase();
                const command = global.commands?.get(commandName) || global.commands?.get(global.aliases?.get(commandName));

                if (!command) {
                    // Fetch waifu image for error message too
                    const res = await fetch("https://api.waifu.pics/sfw/waifu");
                    const { url } = await res.json();
                    const squareUrl = `https://images.weserv.nl/?url=${url.replace("https://", "")}&w=512&h=512&fit=cover`;

                    const errorMsg = `╔══════════════╗\n    *LUNA BOT V2* 🌙\n╚══════════════╝\n\n⚠️ Command "*${commandName}*" not found.\n\n_Type *${prefix}help* to see all available commands._`;

                    return await sock.sendMessage(m.key.remoteJid, {
                        image: { url: squareUrl },
                        caption: errorMsg
                    }, { quoted: m });
                }

                // Fetch waifu image for command details
                const res = await fetch("https://api.waifu.pics/sfw/waifu");
                const { url } = await res.json();
                const squareUrl = `https://images.weserv.nl/?url=${url.replace("https://", "")}&w=512&h=512&fit=cover`;

                const permission = command.permission || command.config?.role || 0;
                const roleText = roleToString(permission);
                const description = command.description || command.config?.description || "No description available.";
                const category = command.category || command.config?.category || "General";
                const aliases = command.aliases || command.config?.aliases || [];
                const guide = command.config?.guide?.en || command.usage || `*${prefix}${command.name || commandName}*`;
                const hasOnChat = typeof command.onChat === 'function';

                const response = `╔══════════════╗\n    *LUNA BOT V2* 🌙\n╚══════════════╝\n\n╭── *COMMAND INFO* ────⭓\n│ *Name:* ${command.name || commandName}\n│ *Description:* ${description}\n│ *Category:* ${category}\n│ *Aliases:* ${aliases.length > 0 ? aliases.join(", ") : "None"}\n│ *Role Required:* ${roleText}\n│ *Usage:* ${guide.replace(/{p}/g, prefix)}\n│ *OnChat:* ${hasOnChat ? "✅ Yes" : "❌ No"}\n╰━━━━━━━━━❖`;

                await sock.sendMessage(m.key.remoteJid, {
                    image: { url: squareUrl },
                    caption: response
                }, { quoted: m });
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
