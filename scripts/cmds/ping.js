
const { logInfo } = require("../../utils");

module.exports = {
    config: {
        name: "ping",
        aliases: ["p"],
        description: "Check bot latency and response time",
        category: "utility",
        role: 0,
        cooldown: 3,
        guide: {
            en: "Just type 'ping' anywhere in chat (no prefix needed)"
        }
    },

    run: async ({ sock, mek, messageInfo }) => {
        const start = Date.now();
        const chatId = mek.key.remoteJid;
        
        try {
            const sent = await sock.sendMessage(chatId, {
                text: "⚡ Checking connection speed..."
            }, { quoted: mek });
            
            const latency = Date.now() - start;
            
            // Edit the original message instead of sending a new one
            await sock.sendMessage(chatId, {
                text: `🚀 *Lightning Fast!*\n⚡ *Response Time:* ${latency}ms\n🤖 *Bot Status:* Active & Ready\n🌐 *Connection:* Stable`,
                edit: sent.key
            });
            
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: "❌ Failed to ping"
            }, { quoted: mek });
        }
    },

    onChat: async ({ sock, m, messageText, messageInfo }) => {
        const chatId = m.key.remoteJid;
        
        // Check if message is just "ping" (case insensitive)
        if (messageText.toLowerCase().trim() === 'ping') {
            const start = Date.now();
            
            try {
                const sent = await sock.sendMessage(chatId, {
                    text: "⚡ Checking connection speed..."
                }, { quoted: m });
                
                const latency = Date.now() - start;
                
                // Edit the original message instead of sending a new one
                await sock.sendMessage(chatId, {
                    text: `🚀 *Lightning Fast!*\n⚡ *Response Time:* ${latency}ms\n🤖 *Bot Status:* Active & Ready\n🌐 *Connection:* Stable\n\n_You can also use ${global.prefix}ping_`,
                    edit: sent.key
                });
                
                logInfo(`Ping command executed via onChat by user`);
                return true; // Stop processing other onChat handlers
            } catch (error) {
                await sock.sendMessage(chatId, {
                    text: "❌ Failed to ping"
                }, { quoted: m });
            }
        }
        
        return false; // Continue processing other onChat handlers
    },

    onStart: async function(params) {
        return module.exports.run(params);
    }
};
