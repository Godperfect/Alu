
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

    run: async ({ sock, mek, args, sender, messageInfo }) => {
        // Use mek instead of m for consistency
        const m = mek;
        try {
            const prefix = global.prefix;
            
            if (args.length === 0) {
                // Fetch waifu image with Luna Bot overlay
                const res = await fetch("https://api.waifu.pics/sfw/waifu");
                const { url } = await res.json();
                const baseImageUrl = url.replace("https://", "");
                // Add Luna Bot text overlay with purple gradient and glow effect
                const overlayText = encodeURIComponent("LUNA BOT");
                const squareUrl = `https://images.weserv.nl/?url=${baseImageUrl}&w=512&h=512&fit=cover&overlay=text&otxt=${overlayText}&ox=center&oy=bottom&oh=60&oc=white&os=2&bg=7b2cbf&bgo=80`;

                let msg = "╔══════════════╗\n";
                msg += "    *LUNA BOT V1* 🌙\n";
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

                const chatId = m?.key?.remoteJid || messageInfo?.threadID;
                if (chatId) {
                    await sock.sendMessage(chatId, {
                        image: { url: squareUrl },
                        caption: msg
                    }, m ? { quoted: m } : {});
                }

            } else {
                const commandName = args[0].toLowerCase();
                const command = global.commands?.get(commandName) || global.commands?.get(global.aliases?.get(commandName));

                if (!command) {
                    // Fetch waifu image for error message with Luna Bot overlay
                    const res = await fetch("https://api.waifu.pics/sfw/waifu");
                    const { url } = await res.json();
                    const baseImageUrl = url.replace("https://", "");
                    const overlayText = encodeURIComponent("LUNA BOT");
                    const squareUrl = `https://images.weserv.nl/?url=${baseImageUrl}&w=512&h=512&fit=cover&overlay=text&otxt=${overlayText}&ox=center&oy=bottom&oh=60&oc=white&os=2&bg=7b2cbf&bgo=80`;

                    const errorMsg = `╔══════════════╗\n    *LUNA BOT V2* 🌙\n╚══════════════╝\n\n⚠️ Command "*${commandName}*" not found.\n\n_Type *${prefix}help* to see all available commands._`;

                    const chatId = m?.key?.remoteJid || messageInfo?.threadID;
                    if (chatId) {
                        return await sock.sendMessage(chatId, {
                            image: { url: squareUrl },
                            caption: errorMsg
                        }, m ? { quoted: m } : {});
                    }
                }

                // Fetch waifu image for command details with Luna Bot overlay
                const res = await fetch("https://api.waifu.pics/sfw/waifu");
                const { url } = await res.json();
                const baseImageUrl = url.replace("https://", "");
                const overlayText = encodeURIComponent("LUNA BOT");
                const squareUrl = `https://images.weserv.nl/?url=${baseImageUrl}&w=512&h=512&fit=cover&overlay=text&otxt=${overlayText}&ox=center&oy=bottom&oh=60&oc=white&os=2&bg=7b2cbf&bgo=80`;

                const permission = command.permission || command.config?.role || 0;
                const roleText = roleToString(permission);
                const description = command.description || command.config?.description || "No description available.";
                const category = command.category || command.config?.category || "General";
                const aliases = command.aliases || command.config?.aliases || [];
                const guide = command.config?.guide?.en || command.usage || `*${prefix}${command.name || commandName}*`;
                const hasOnChat = typeof command.onChat === 'function';

                const response = `╔══════════════╗\n    *LUNA BOT V2* 🌙\n╚══════════════╝\n\n╭── *COMMAND INFO* ────⭓\n│ *Name:* ${command.name || commandName}\n│ *Description:* ${description}\n│ *Category:* ${category}\n│ *Aliases:* ${aliases.length > 0 ? aliases.join(", ") : "None"}\n│ *Role Required:* ${roleText}\n│ *Usage:* ${guide.replace(/{p}/g, prefix)}\n│ *OnChat:* ${hasOnChat ? "✅ Yes" : "❌ No"}\n╰━━━━━━━━━❖`;

                const chatId = m?.key?.remoteJid || messageInfo?.threadID;
                if (chatId) {
                    await sock.sendMessage(chatId, {
                        image: { url: squareUrl },
                        caption: response
                    }, m ? { quoted: m } : {});
                }
            }
        } catch (err) {
            logError(`Error in help command: ${err.message}`);
            const chatId = m?.key?.remoteJid || messageInfo?.threadID;
            if (chatId) {
                await sock.sendMessage(
                    chatId,
                    { text: "❌ An error occurred while fetching the help menu." },
                    m ? { quoted: m } : {}
                );
            }
        }
    },

    // Add onStart for compatibility with the command manager
    onStart: async function(params) {
        return module.exports.run(params);
    }
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
