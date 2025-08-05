
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logSuccess } = require('../../utils');

module.exports = {
    config: {
        name: "groupactivities",
        aliases: ["ga", "groupactivity"],
        version: "1.0.0",
        author: "Luna Bot",
        countDown: 3,
        role: "admin",
        shortDescription: "Toggle group activities notifications",
        longDescription: "Enable or disable group activities notifications (promote, demote, etc.)",
        category: "group",
        guide: {
            en: "{prefix}groupactivities on/off"
        }
    },

    run: async function({ sock, mek, args, event }) {
        try {
            const isGroup = mek.key.remoteJid.endsWith('@g.us');
            
            if (!isGroup) {
                return await sock.sendMessage(mek.key.remoteJid, {
                    text: "❌ This command can only be used in groups!"
                }, { quoted: mek });
            }

            const groupId = mek.key.remoteJid;
            const settingsPath = path.join(__dirname, '../../data/groupActivities.json');
            
            // Ensure data directory exists
            const dataDir = path.dirname(settingsPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Load existing settings
            let settings = {};
            if (fs.existsSync(settingsPath)) {
                try {
                    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                } catch (error) {
                    settings = {};
                }
            }

            if (!args[0]) {
                const currentStatus = settings[groupId]?.enabled ? "ON" : "OFF";
                return await sock.sendMessage(mek.key.remoteJid, {
                    text: `📊 Group Activities Status: ${currentStatus}\n\nUsage: +groupactivities on/off`
                }, { quoted: mek });
            }

            const action = args[0].toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                settings[groupId] = { enabled: true };
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
                
                await sock.sendMessage(mek.key.remoteJid, {
                    text: "✅ Group activities notifications have been ENABLED!\n\n📢 I will now notify about:\n• Member promotions\n• Member demotions\n• Group setting changes\n• Admin actions"
                }, { quoted: mek });
                
                logSuccess(`Group activities enabled for ${groupId}`);
                
            } else if (action === 'off' || action === 'disable') {
                settings[groupId] = { enabled: false };
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
                
                await sock.sendMessage(mek.key.remoteJid, {
                    text: "❌ Group activities notifications have been DISABLED!\n\n🔇 I will no longer notify about group activities."
                }, { quoted: mek });
                
                logInfo(`Group activities disabled for ${groupId}`);
                
            } else {
                await sock.sendMessage(mek.key.remoteJid, {
                    text: "❌ Invalid option!\n\nUsage: +groupactivities on/off"
                }, { quoted: mek });
            }

        } catch (error) {
            logError(`Error in groupactivities command: ${error.message}`);
            await sock.sendMessage(mek.key.remoteJid, {
                text: "❌ An error occurred while processing the command."
            }, { quoted: mek });
        }
    },

    // Add onStart for compatibility with the command manager
    onStart: async function(params) {
        return this.run(params);
    }
};
