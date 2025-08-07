const fs = require('fs');
const path = require('path');
const { logInfo, logError, logSuccess, getTimestamp, getFormattedDate, logWarning } = require('../../utils');
const chalk = require('chalk');

// Path to resend settings
const resendSettingsPath = path.join(__dirname, '../../data/resendSettings.json');

// Load resend settings
function loadResendSettings() {
    try {
        if (fs.existsSync(resendSettingsPath)) {
            const data = fs.readFileSync(resendSettingsPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logError(`Failed to load resend settings: ${error.message}`);
    }
    return {};
}

// Save resend settings
function saveResendSettings(settings) {
    try {
        // Ensure data directory exists
        const dataDir = path.dirname(resendSettingsPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(resendSettingsPath, JSON.stringify(settings, null, 2));
        logSuccess('Resend settings saved successfully');
        return true;
    } catch (error) {
        logError(`Failed to save resend settings: ${error.message}`);
        return false;
    }
}

module.exports = {
    config: {
        name: 'resend',
        author: 'Luna',
        version: '1.0.0',
        description: 'Control real-time delete detection system (no storage)',
        category: 'admin',
        guide: {
            en: `Usage:
• resend on - Enable real-time delete detection
• resend off - Disable delete detection  
• resend status - Check current status
• resend list - List all groups with detection enabled
• resend clear - Clear all detection settings`
        },
        role: 1 // Admin only
    },

    onStart: async ({ sock, mek, args, messageInfo, isGroup }) => {
        try {
            const groupId = mek.key.remoteJid;
            const sender = mek.key.participant || mek.key.remoteJid;
            const senderNumber = sender.split('@')[0];

            // Check if command is used in group
            if (!isGroup) {
                return await sock.sendMessage(mek.key.remoteJid, {
                    text: `❌ *Error*\n\nThis command can only be used in groups.`
                }, { quoted: mek });
            }

            // Check if user is admin (simplified check)
            const isAdmin = messageInfo.groupMetadata &&
                           messageInfo.groupMetadata.participants &&
                           messageInfo.groupMetadata.participants.some(p =>
                               p.id.includes(senderNumber) && (p.admin === 'admin' || p.admin === 'superadmin')
                           );

            if (!isAdmin) {
                return await sock.sendMessage(groupId, {
                    text: `❌ *Access Denied*\n\nOnly group admins can manage anti-delete settings.`,
                    mentions: [sender]
                }, { quoted: mek });
            }

            // Load current settings
            const settings = loadResendSettings();
            const currentStatus = settings[groupId]?.enabled || false;

            // Handle different commands
            const command = args[0]?.toLowerCase();

            switch (command) {
                case 'on':
                case 'enable':
                    settings[groupId] = { enabled: true };
                    if (saveResendSettings(settings)) {
                        await sock.sendMessage(groupId, {
                            text: `✅ *Real-time Delete Detection Enabled*\n\n🛡️ Delete events will be detected instantly in this group.\n\n*Features:*\n• Real-time delete detection\n• Instant notifications\n• No message storage\n• Zero storage usage\n• 24/7 monitoring\n\n_Use \`resend off\` to disable_`,
                            mentions: [sender]
                        }, { quoted: mek });

                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[RESEND_ENABLED]')} Anti-delete enabled for group ${messageInfo.chatName} by admin ${senderNumber}`);
                        logSuccess(`Anti-delete enabled for group ${messageInfo.chatName}`);
                    }
                    break;

                case 'off':
                case 'disable':
                    settings[groupId] = { enabled: false };
                    if (saveResendSettings(settings)) {
                        await sock.sendMessage(groupId, {
                            text: `❌ *Real-time Delete Detection Disabled*\n\n🔕 Delete notifications are now disabled for this group.\n\n_Use \`resend on\` to re-enable_`,
                            mentions: [sender]
                        }, { quoted: mek });

                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RESEND_DISABLED]')} Anti-delete disabled for group ${messageInfo.chatName} by admin ${senderNumber}`);
                        logInfo(`Anti-delete disabled for group ${messageInfo.chatName}`);
                    }
                    break;

                case 'status':
                case 'check':
                    const currentSettings = loadResendSettings();
                    const groupSetting = currentSettings[groupId];
                    const isEnabled = groupSetting?.enabled !== false; // Default to true unless explicitly disabled
                    const status = isEnabled ? '✅ Enabled' : '❌ Disabled';
                    const defaultNote = !groupSetting ? ' (Default)' : '';

                    await sock.sendMessage(groupId, {
                        text: `🔄 *Real-time Delete Detection Status*\n\n*Current Status:* ${status}${defaultNote}\n*System Type:* Real-time (No Storage)\n*Detection:* Instant\n*Storage Usage:* Zero\n\n*Note:* Delete detection is enabled by default for all groups\n\n*Commands:*\n• \`resend on\` - Enable detection\n• \`resend off\` - Disable detection\n• \`resend status\` - Check status`,
                        mentions: [sender]
                    }, { quoted: mek });
                    break;

                case 'list':
                    let enabledGroups = [];
                    for (const [gId, setting] of Object.entries(settings)) {
                        if (setting.enabled) {
                            try {
                                const groupMeta = await sock.groupMetadata(gId);
                                enabledGroups.push(`• ${groupMeta.subject || 'Unknown Group'}`);
                            } catch (error) {
                                enabledGroups.push(`• Group ID: ${gId}`);
                            }
                        }
                    }

                    const listText = enabledGroups.length > 0 
                        ? `🛡️ *Groups with Anti-Delete Enabled:*\n\n${enabledGroups.join('\n')}\n\n*Total:* ${enabledGroups.length} groups`
                        : `🔕 *No groups have anti-delete enabled*\n\nUse \`resend on\` in any group to enable it.`;

                    await sock.sendMessage(groupId, {
                        text: listText,
                        mentions: [sender]
                    }, { quoted: mek });
                    break;

                case 'clear':
                    // Clear all settings (super admin only)
                    const clearedSettings = {};
                    if (saveResendSettings(clearedSettings)) {
                        await sock.sendMessage(groupId, {
                            text: `🗑️ *All Anti-Delete Settings Cleared*\n\nAll groups have been reset to disabled state.\n\n_Use \`resend on\` to re-enable for specific groups_`,
                            mentions: [sender]
                        }, { quoted: mek });

                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[RESEND_CLEARED]')} All anti-delete settings cleared by admin ${senderNumber}`);
                        logWarning(`All anti-delete settings cleared by admin ${senderNumber}`);
                    }
                    break;

                default:
                    const helpText = `🛡️ *Anti-Delete System Commands*\n\n*Usage:* \`resend <action>\`\n\n*Available Actions:*\n• \`on\` - Enable anti-delete\n• \`off\` - Disable anti-delete\n• \`status\` - Check current status\n• \`list\` - List enabled groups\n• \`clear\` - Clear all settings\n\n*Current Status:* ${currentStatus ? '✅ Enabled' : '❌ Disabled'}`;

                    await sock.sendMessage(groupId, {
                        text: helpText,
                        mentions: [sender]
                    }, { quoted: mek });
                    break;
            }

        } catch (error) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[RESEND_CMD_ERROR]')} Error in resend command: ${error.message}`);
            logError(`Error in resend command: ${error.message}`);

            await sock.sendMessage(mek.key.remoteJid, {
                text: `❌ *Command Error*\n\nFailed to execute resend command: ${error.message}`
            }, { quoted: mek });
        }
    }
};