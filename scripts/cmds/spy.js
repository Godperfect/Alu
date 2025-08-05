
const { logError } = require("../../utils");

module.exports = {
    config: {
        name: "spy",
        aliases: ["profile", "info", "whois"],
        description: "Get detailed information about a WhatsApp user",
        category: "utility",
        role: 0,
        cooldown: 5,
        guide: {
            en: "{p}spy [reply to user]\n{p}spy <phone_number>\nExample: {p}spy 919876543210"
        }
    },

    run: async ({ sock, mek, args, sender, messageInfo }) => {
        try {
            const m = mek;
            let targetJid = null;
            let targetNumber = null;

            // Check if replying to a message
            if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                const quotedSender = m.message.extendedTextMessage.contextInfo.participant;
                if (quotedSender) {
                    targetJid = quotedSender;
                    targetNumber = quotedSender.split('@')[0];
                }
            }
            // Check if phone number provided as argument or mention
            else if (args.length > 0) {
                let phoneNumber = args[0];
                
                // Handle WhatsApp mentions (e.g., @77210878738630)
                if (phoneNumber.startsWith('@')) {
                    phoneNumber = phoneNumber.substring(1);
                }
                
                // Remove all non-numeric characters
                phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
                
                // Add country code if missing (assuming India +91 as default)
                if (phoneNumber.length === 10) {
                    phoneNumber = '91' + phoneNumber;
                }
                
                targetJid = phoneNumber + '@s.whatsapp.net';
                targetNumber = phoneNumber;
            }
            // If no target specified
            else {
                const chatId = m?.key?.remoteJid;
                return await sock.sendMessage(chatId, {
                    text: `❌ *Usage Error*\n\n*How to use:*\n• Reply to a user's message with \`+spy\`\n• Or use \`+spy <phone_number>\`\n\n*Example:* \`+spy 919876543210\``
                }, { quoted: m });
            }

            if (!targetJid || !targetNumber) {
                const chatId = m?.key?.remoteJid;
                return await sock.sendMessage(chatId, {
                    text: "❌ Could not identify target user. Please reply to a message or provide a valid phone number."
                }, { quoted: m });
            }

            const chatId = m?.key?.remoteJid;
            
            // Send loading message
            await sock.sendMessage(chatId, {
                text: "🔍 *Gathering intelligence...*\n\n⏳ Please wait while I collect available information..."
            }, { quoted: m });

            let spyInfo = `🕵️ *SPY REPORT* 🕵️\n`;
            spyInfo += `═══════════════════════\n\n`;
            // Detect if target is using LID system
            const isLidUser = targetJid.includes('@lid');
            
            if (isLidUser) {
                spyInfo += `📱 *Target:* ${targetNumber} (LID User)\n`;
                spyInfo += `🆔 *LID:* ${targetJid}\n\n`;
            } else {
                spyInfo += `📱 *Target:* +${targetNumber}\n\n`;
            }
            
            let accessibleData = [];
            let restrictedData = [];

            // 1. Phone Number / LID (Always available)
            if (isLidUser) {
                accessibleData.push("✅ LID Number");
            } else {
                accessibleData.push("✅ Phone Number");
            }

            // 2. Push Name / Display Name
            try {
                // For LID users in groups, try to get name from group metadata
                if (targetJid.includes('@lid')) {
                    const chatId = m?.key?.remoteJid;
                    if (chatId && chatId.includes('@g.us')) {
                        try {
                            const groupMeta = await sock.groupMetadata(chatId);
                            const participant = groupMeta.participants.find(p => p.id === targetJid);
                            if (participant && participant.notify) {
                                spyInfo += `👤 *Display Name:* ${participant.notify}\n`;
                                accessibleData.push("✅ Display Name");
                            } else {
                                restrictedData.push("❌ Display Name");
                            }
                        } catch (err) {
                            restrictedData.push("❌ Display Name");
                        }
                    } else {
                        restrictedData.push("❌ Display Name");
                    }
                } else {
                    // Regular WhatsApp number check
                    const contact = await sock.onWhatsApp(targetJid);
                    if (contact && contact.length > 0) {
                        const pushName = contact[0].notify || "Not Set";
                        spyInfo += `👤 *Display Name:* ${pushName}\n`;
                        accessibleData.push("✅ Display Name");
                    } else {
                        restrictedData.push("❌ Display Name");
                    }
                }
            } catch (err) {
                restrictedData.push("❌ Display Name");
            }

            // 3. About / Status Text
            try {
                const statusInfo = await sock.fetchStatus(targetJid);
                if (statusInfo && statusInfo.status) {
                    spyInfo += `📝 *About:* ${statusInfo.status}\n`;
                    if (statusInfo.setAt) {
                        const setDate = new Date(statusInfo.setAt * 1000).toLocaleDateString();
                        spyInfo += `📅 *Status Set:* ${setDate}\n`;
                    }
                    accessibleData.push("✅ About/Status");
                } else {
                    restrictedData.push("❌ About/Status");
                }
            } catch (err) {
                restrictedData.push("❌ About/Status");
            }

            // 4. Profile Picture
            let profilePicUrl = null;
            try {
                profilePicUrl = await sock.profilePictureUrl(targetJid, 'image');
                if (profilePicUrl) {
                    spyInfo += `🖼️ *Profile Picture:* Available\n`;
                    accessibleData.push("✅ Profile Picture");
                } else {
                    restrictedData.push("❌ Profile Picture");
                }
            } catch (err) {
                restrictedData.push("❌ Profile Picture");
            }

            // 5. Business Profile Check
            try {
                const businessProfile = await sock.getBusinessProfile(targetJid);
                if (businessProfile) {
                    spyInfo += `\n🏢 *BUSINESS PROFILE DETECTED*\n`;
                    spyInfo += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    
                    if (businessProfile.business_name) {
                        spyInfo += `🏪 *Business Name:* ${businessProfile.business_name}\n`;
                        accessibleData.push("✅ Business Name");
                    }
                    
                    if (businessProfile.description) {
                        spyInfo += `📋 *Description:* ${businessProfile.description}\n`;
                        accessibleData.push("✅ Business Description");
                    }
                    
                    if (businessProfile.website && businessProfile.website.length > 0) {
                        spyInfo += `🌐 *Website:* ${businessProfile.website[0]}\n`;
                        accessibleData.push("✅ Business Website");
                    }
                    
                    if (businessProfile.email) {
                        spyInfo += `📧 *Email:* ${businessProfile.email}\n`;
                        accessibleData.push("✅ Business Email");
                    }
                    
                    if (businessProfile.address) {
                        spyInfo += `📍 *Address:* ${businessProfile.address}\n`;
                        accessibleData.push("✅ Business Address");
                    }
                }
            } catch (err) {
                // Not a business profile or restricted
            }

            // 6. Check if user is online (if available)
            try {
                const presence = await sock.presenceSubscribe(targetJid);
                // Note: This might not always work due to privacy settings
                restrictedData.push("❓ Online Status (Privacy Protected)");
            } catch (err) {
                restrictedData.push("❌ Online Status");
            }

            // Add privacy restrictions
            restrictedData.push("❌ Last Seen (Privacy Protected)");
            restrictedData.push("❌ Story Status (24h Status)");
            restrictedData.push("❌ Read Receipts");

            // Summary section
            spyInfo += `\n🔍 *INTELLIGENCE SUMMARY*\n`;
            spyInfo += `═══════════════════════\n\n`;
            
            spyInfo += `📊 *Data Accessibility Report:*\n\n`;
            
            if (accessibleData.length > 0) {
                spyInfo += `✅ *ACCESSIBLE DATA (${accessibleData.length}):*\n`;
                accessibleData.forEach(item => {
                    spyInfo += `   ${item}\n`;
                });
                spyInfo += `\n`;
            }
            
            spyInfo += `❌ *RESTRICTED/UNAVAILABLE (${restrictedData.length}):*\n`;
            restrictedData.forEach(item => {
                spyInfo += `   ${item}\n`;
            });

            spyInfo += `\n📋 *PRIVACY NOTES:*\n`;
            spyInfo += `• Most data depends on user's privacy settings\n`;
            spyInfo += `• Business profiles reveal more information\n`;
            spyInfo += `• WhatsApp protects user privacy by default\n`;
            if (isLidUser) {
                spyInfo += `• LID users have enhanced privacy protection\n`;
                spyInfo += `• Limited data available for non-contact LID users\n`;
            }
            spyInfo += `• Some data may be cached or outdated\n\n`;
            
            spyInfo += `🤖 *Luna Bot Spy Module v1.0*\n`;
            spyInfo += `⚡ *Report generated in real-time*`;

            // Send the spy report
            if (profilePicUrl) {
                try {
                    await sock.sendMessage(chatId, {
                        image: { url: profilePicUrl },
                        caption: spyInfo
                    }, { quoted: m });
                } catch (err) {
                    // Fallback to text if image fails
                    await sock.sendMessage(chatId, {
                        text: spyInfo
                    }, { quoted: m });
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: spyInfo
                }, { quoted: m });
            }

        } catch (err) {
            logError(`Error in spy command: ${err.message}`);
            const chatId = mek?.key?.remoteJid;
            if (chatId) {
                await sock.sendMessage(chatId, {
                    text: `❌ *Spy Mission Failed*\n\nError: ${err.message}\n\nPlease try again with a valid phone number or by replying to a user's message.`
                }, { quoted: mek });
            }
        }
    },

    // Add onStart for compatibility
    onStart: async function(params) {
        return module.exports.run(params);
    }
};
