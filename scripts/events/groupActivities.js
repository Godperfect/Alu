
const fs = require('fs');
const path = require('path');
const { logInfo, logError, getSenderName } = require('../../utils');

module.exports = {
    config: {
        name: "groupActivities",
        version: "1.0.0",
        author: "Luna Bot",
        description: "Handle group activity notifications"
    },

    onStart: async function({ api: sock }) {
        // Register event handlers
        if (!global.Luna.onEvent) {
            global.Luna.onEvent = new Map();
        }

        // Register promote event
        global.Luna.onEvent.set('group.promote', {
            callback: async ({ sock, eventType, eventData }) => {
                await this.handleGroupActivity(sock, 'promote', eventData);
            }
        });

        // Register demote event
        global.Luna.onEvent.set('group.demote', {
            callback: async ({ sock, eventType, eventData }) => {
                await this.handleGroupActivity(sock, 'demote', eventData);
            }
        });

        logInfo('Group activities event handlers registered');
    },

    handleGroupActivity: async function(sock, activityType, eventData) {
        try {
            const { groupId, participants, groupName } = eventData;
            
            // Check if group activities are enabled for this group
            const settingsPath = path.join(__dirname, '../../data/groupActivities.json');
            let settings = {};
            
            if (fs.existsSync(settingsPath)) {
                try {
                    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                } catch (error) {
                    logError(`Error reading group activities settings: ${error.message}`);
                    return;
                }
            }

            // If not enabled for this group, return
            if (!settings[groupId]?.enabled) {
                return;
            }

            const participantName = await getSenderName(sock, participants[0]);
            let message = '';
            let emoji = '';

            switch (activityType) {
                case 'promote':
                    emoji = '🎉';
                    message = `${emoji} *Group Activity Update*\n\n👑 *Member Promoted!*\n\n` +
                             `📱 User: @${participants[0].split('@')[0]}\n` +
                             `👤 Name: ${participantName}\n` +
                             `🏷️ Group: ${groupName}\n` +
                             `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                             `✨ This user has been promoted to admin!`;
                    break;

                case 'demote':
                    emoji = '📉';
                    message = `${emoji} *Group Activity Update*\n\n👤 *Admin Demoted!*\n\n` +
                             `📱 User: @${participants[0].split('@')[0]}\n` +
                             `👤 Name: ${participantName}\n` +
                             `🏷️ Group: ${groupName}\n` +
                             `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                             `⬇️ This user is no longer an admin!`;
                    break;

                default:
                    return; // Unknown activity type
            }

            // Send the notification message
            await sock.sendMessage(groupId, {
                text: message,
                mentions: participants
            });

            logInfo(`Group activity notification sent for ${activityType} in ${groupName}`);

        } catch (error) {
            logError(`Error handling group activity: ${error.message}`);
        }
    }
};
