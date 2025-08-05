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
            let displayName = null;
            try {
                // For LID users in groups, try to get name from group metadata
                if (targetJid.includes('@lid')) {
                    const chatId = m?.key?.remoteJid;
                    if (chatId && chatId.includes('@g.us')) {
                        try {
                            const groupMeta = await sock.groupMetadata(chatId);
                            const participant = groupMeta.participants.find(p => p.id === targetJid);
                            if (participant) {
                                // Try multiple name sources
                                displayName = participant.notify || participant.name || participant.verifiedName;
                                if (displayName) {
                                    spyInfo += `👤 *Display Name:* ${displayName}\n`;
                                    accessibleData.push("✅ Display Name");
                                }
                            }
                        } catch (err) {
                            console.log('Group metadata error:', err.message);
                        }
                    }
                } else {
                    // Regular WhatsApp number check
                    try {
                        const contact = await sock.onWhatsApp(targetJid);
                        if (contact && contact.length > 0 && contact[0].exists) {
                            // Try to get push name
                            if (contact[0].notify) {
                                displayName = contact[0].notify;
                                spyInfo += `👤 *Display Name:* ${displayName}\n`;
                                accessibleData.push("✅ Display Name");
                            }
                        }
                    } catch (err) {
                        console.log('Contact check error:', err.message);
                    }
                }

                if (!displayName) {
                    restrictedData.push("❌ Display Name");
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
                // Try to get high quality first, then fallback to preview
                try {
                    profilePicUrl = await sock.profilePictureUrl(targetJid, 'image');
                } catch (err) {
                    // Try preview quality if image fails
                    try {
                        profilePicUrl = await sock.profilePictureUrl(targetJid, 'preview');
                    } catch (err2) {
                        console.log('Profile picture error:', err2.message);
                    }
                }

                if (profilePicUrl) {
                    spyInfo += `🖼️ *Profile Picture:* Available ✅\n`;
                    accessibleData.push("✅ Profile Picture");
                } else {
                    restrictedData.push("❌ Profile Picture");
                }
            } catch (err) {
                console.log('Profile picture outer error:', err.message);
                restrictedData.push("❌ Profile Picture");
            }

            // 5. Basic Number Info (Always show what we extracted)
            spyInfo += `📞 *Extracted Number:* ${targetNumber}\n`;
            if (targetJid.includes('@lid')) {
                spyInfo += `🆔 *Full LID:* ${targetJid}\n`;
            } else {
                spyInfo += `📱 *WhatsApp JID:* ${targetJid}\n`;
            }

            // 6. Business Profile Check
            let hasBusiness = false;
            try {
                const businessProfile = await sock.getBusinessProfile(targetJid);
                if (businessProfile && Object.keys(businessProfile).length > 0) {
                    hasBusiness = true;
                    spyInfo += `\n🏢 *BUSINESS PROFILE DETECTED*\n`;
                    spyInfo += `━━━━━━━━━━━━━━━━━━━━━━━\n`;

                    if (businessProfile.business_name || businessProfile.name) {
                        const businessName = businessProfile.business_name || businessProfile.name;
                        spyInfo += `🏪 *Business Name:* ${businessName}\n`;
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

                    if (businessProfile.category) {
                        spyInfo += `🏷️ *Category:* ${businessProfile.category}\n`;
                        accessibleData.push("✅ Business Category");
                    }
                }
            } catch (err) {
                console.log('Business profile error:', err.message);
                // Not a business profile or restricted
            }

            // 7. Check account existence
            try {
                const exists = await sock.onWhatsApp(targetJid);
                if (exists && exists.length > 0) {
                    if (exists[0].exists) {
                        spyInfo += `✅ *Account Status:* Active WhatsApp Account\n`;
                        accessibleData.push("✅ Account Verification");
                    } else {
                        spyInfo += `❌ *Account Status:* Not on WhatsApp\n`;
                        restrictedData.push("❌ Invalid WhatsApp Number");
                    }
                }
            } catch (err) {
                restrictedData.push("❌ Account Verification");
            }

            // Privacy restricted items
            restrictedData.push("❓ Online Status (Privacy Protected)");
            restrictedData.push("❌ Last Seen (Privacy Protected)");
            restrictedData.push("❌ Story Status (24h Status)");
            restrictedData.push("❌ Read Receipts");

            // End with simple footer
            spyInfo += `\n🤖 *Luna Bot Spy Module*`;

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