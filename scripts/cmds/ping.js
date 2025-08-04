
module.exports = {
    config: {
        name: "ping",
        aliases: ["p"],
        description: "Check bot response time",
        category: "system",
        role: 0,
        cooldown: 5,
        guide: {
            en: "{p}ping - Check bot latency"
        }
    },

    onStart: async ({ sock, m }) => {
        const startTime = Date.now();
        const sentMsg = await sock.sendMessage(m.key.remoteJid, { 
            text: "🏓 Pinging..." 
        }, { quoted: m });
        
        const pingTime = Date.now() - startTime;
        
        await sock.sendMessage(m.key.remoteJid, { 
            edit: sentMsg.key, 
            text: `🏓 Pong!\n⚡ Response time: ${pingTime}ms\n🤖 Bot is running smoothly!` 
        });
    },

    onChat: async ({ sock, m, messageText, event }) => {
        // Respond to "ping" without prefix
        if (messageText.toLowerCase() === "ping") {
            const startTime = Date.now();
            await sock.sendMessage(event.threadID, {
                text: `🏓 Pong! (Auto-response)\n⚡ ${Date.now() - startTime}ms`
            }, { quoted: m });
            return true;
        }
        return false;
    }
};
