
module.exports = {
    config: {
        name: "ai",
        aliases: ["gpt", "chat"],
        description: "Chat with AI assistant",
        category: "ai",
        role: 0, // 0 = all users, 1 = group admin, 2 = bot admin
        cooldown: 5,
        guide: {
            en: "{p}ai <question>\nOr just type naturally and AI will respond"
        }
    },

    onStart: async ({ sock, m, args }) => {
        const query = args.join(" ");
        if (!query) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: "❓ Please provide a question.\nExample: ai What is JavaScript?"
            }, { quoted: m });
        }

        try {
            await sock.sendMessage(m.key.remoteJid, {
                text: "🤖 Thinking..."
            }, { quoted: m });

            // Simple AI response (you can integrate with actual AI service)
            const response = `🤖 AI Response:\n\nYou asked: "${query}"\n\nThis is a sample AI response. You can integrate this with OpenAI, Gemini, or other AI services for actual intelligent responses.`;

            await sock.sendMessage(m.key.remoteJid, {
                text: response
            }, { quoted: m });

        } catch (error) {
            await sock.sendMessage(m.key.remoteJid, {
                text: "❌ Error occurred while processing your request."
            }, { quoted: m });
        }
    },

    onChat: async ({ sock, m, messageText, event }) => {
        // Check if message looks like a question to AI (without prefix)
        const aiTriggers = [
            /^(what|how|why|when|where|who|can you|tell me|explain)/i,
            /\?$/,
            /(ai|assistant|bot).*\?/i
        ];

        const isQuestion = aiTriggers.some(trigger => trigger.test(messageText));
        
        if (isQuestion && messageText.length > 10) {
            try {
                const response = `🤖 Auto AI Response:\n\nI detected a question: "${messageText}"\n\nThis is an automatic response. Use the ai command for better responses!`;
                
                await sock.sendMessage(event.threadID, {
                    text: response
                }, { quoted: m });

                return true; // Return true to indicate this message was handled
            } catch (error) {
                console.error("Error in AI onChat:", error);
            }
        }

        return false; // Return false to allow other handlers to process this message
    }
};
