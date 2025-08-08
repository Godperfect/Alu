
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
                text: "🏓 Pinging..."
            }, { quoted: mek });
            
            const latency = Date.now() - start;
            
            await sock.sendMessage(chatId, {
                text: `🏓 *Pong!*\n⚡ *Latency:* ${latency}ms\n🤖 *Bot Status:* Online`
            }, { quoted: mek });
            
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
                await sock.sendMessage(chatId, {
                    text: "🏓 Pinging..."
                }, { quoted: m });
                
                const latency = Date.now() - start;
                
                await sock.sendMessage(chatId, {
                    text: `🏓 *Pong!*\n⚡ *Latency:* ${latency}ms\n🤖 *Bot Status:* Online\n\n_You can also use ${global.prefix}ping_`
                }, { quoted: m });
                
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
