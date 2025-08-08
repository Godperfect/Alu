
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logSuccess } = require('../../utils');

module.exports = {
    config: {
        name: "groupactivities",
        aliases: ["ga", "groupactivity"],
        version: "2.0.0",
        author: "Luna Bot",
        countDown: 3,
        role: "admin",
        shortDescription: "Manage group activities notifications",
        longDescription: "Enable/disable group activities and customize welcome/leave/promote/demote messages with attachments",
        category: "group",
        guide: {
            en: "{prefix}groupactivities on/off\n{prefix}groupactivities add welcome (with attachment)\n{prefix}groupactivities add leave (with attachment)\n{prefix}groupactivities add promote (with attachment)\n{prefix}groupactivities add demote (with attachment)"
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
            const assetsDir = path.join(__dirname, 'assets');
            
            // Ensure directories exist
            const dataDir = path.dirname(settingsPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            if (!fs.existsSync(assetsDir)) {
                fs.mkdirSync(assetsDir, { recursive: true });
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

            // Initialize group settings if not exist
            if (!settings[groupId]) {
                settings[groupId] = {
                    enabled: false,
                    joins: [],
                    leaves: [],
                    promotes: [],
                    demotes: [],
                    customMessages: {
                        welcome: null,
                        leave: null,
                        promote: null,
                        demote: null
                    }
                };
            }

            if (!args[0]) {
                const currentStatus = settings[groupId]?.enabled ? "ON" : "OFF";
                const customCount = Object.values(settings[groupId]?.customMessages || {}).filter(v => v !== null).length;
                return await sock.sendMessage(mek.key.remoteJid, {
                    text: `📊 *Group Activities Status*\n\n` +
                          `• Status: ${currentStatus}\n` +
                          `• Custom Messages: ${customCount}/4 configured\n\n` +
                          `*Commands:*\n` +
                          `• \`+groupactivities on/off\`\n` +
                          `• \`+groupactivities add welcome\` (with attachment)\n` +
                          `• \`+groupactivities add leave\` (with attachment)\n` +
                          `• \`+groupactivities add promote\` (with attachment)\n` +
                          `• \`+groupactivities add demote\` (with attachment)`
                }, { quoted: mek });
            }

            const action = args[0].toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                settings[groupId].enabled = true;
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
                
                await sock.sendMessage(mek.key.remoteJid, {
                    text: "✅ *Group Activities Enabled!*\n\n📢 I will now notify about:\n• Member joins/leaves\n• Member promotions/demotions\n• Custom messages (if configured)"
                }, { quoted: mek });
                
                logSuccess(`Group activities enabled for ${groupId}`);
                
            } else if (action === 'off' || action === 'disable') {
                settings[groupId].enabled = false;
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
                
                await sock.sendMessage(mek.key.remoteJid, {
                    text: "❌ *Group Activities Disabled!*\n\n🔇 I will no longer notify about group activities."
                }, { quoted: mek });
                
                logInfo(`Group activities disabled for ${groupId}`);
                
            } else if (action === 'add' && args[1]) {
                const messageType = args[1].toLowerCase();
                const validTypes = ['welcome', 'leave', 'promote', 'demote'];
                
                if (!validTypes.includes(messageType)) {
                    return await sock.sendMessage(mek.key.remoteJid, {
                        text: `❌ Invalid type! Use: ${validTypes.join(', ')}`
                    }, { quoted: mek });
                }

                // Check if message has attachment or is replying to a message with attachment
                let attachmentData = null;
                let customText = args.slice(2).join(' ');

                // Check for quoted message with attachment
                if (mek.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                    const quotedMsg = mek.message.extendedTextMessage.contextInfo.quotedMessage;
                    if (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.documentMessage) {
                        attachmentData = {
                            type: quotedMsg.imageMessage ? 'image' : quotedMsg.videoMessage ? 'video' : 'document',
                            quoted: true
                        };
                    }
                }

                // Check for direct attachment
                if (mek.message?.imageMessage || mek.message?.videoMessage || mek.message?.documentMessage) {
                    attachmentData = {
                        type: mek.message.imageMessage ? 'image' : mek.message.videoMessage ? 'video' : 'document',
                        quoted: false
                    };
                }

                // Save custom message configuration
                if (!settings[groupId].customMessages) {
                    settings[groupId].customMessages = {};
                }

                settings[groupId].customMessages[messageType] = {
                    text: customText || null,
                    attachment: attachmentData,
                    timestamp: Date.now()
                };

                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

                const typeEmojis = {
                    welcome: '🎉',
                    leave: '👋',
                    promote: '👑',
                    demote: '📉'
                };

                await sock.sendMessage(mek.key.remoteJid, {
                    text: `✅ ${typeEmojis[messageType]} *${messageType.charAt(0).toUpperCase() + messageType.slice(1)} Message Configured!*\n\n` +
                          `• Text: ${customText || 'Default message will be used'}\n` +
                          `• Attachment: ${attachmentData ? `✅ ${attachmentData.type}` : '❌ None'}\n\n` +
                          `This will be used when members ${messageType === 'welcome' ? 'join' : messageType === 'leave' ? 'leave' : messageType} the group.`
                }, { quoted: mek });

                logSuccess(`Custom ${messageType} message configured for ${groupId}`);
                
            } else {
                await sock.sendMessage(mek.key.remoteJid, {
                    text: "❌ Invalid command!\n\n*Usage:*\n• `+groupactivities on/off`\n• `+groupactivities add welcome` (with attachment)\n• `+groupactivities add leave` (with attachment)\n• `+groupactivities add promote` (with attachment)\n• `+groupactivities add demote` (with attachment)"
                }, { quoted: mek });
            }

        } catch (error) {
            logError(`Error in groupactivities command: ${error.message}`);
            await sock.sendMessage(mek.key.remoteJid, {
                text: "❌ An error occurred while processing the command."
            }, { quoted: mek });
        }
    },

    onStart: async function(params) {
        return module.exports.run(params);
    }
};
