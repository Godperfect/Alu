
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logSuccess, logWarning, getTimestamp, getFormattedDate } = require('../../utils');
const chalk = require('chalk');

// Load group activities data
const groupActivitiesPath = path.join(__dirname, '../../data/groupActivities.json');

function loadGroupActivities() {
    try {
        if (fs.existsSync(groupActivitiesPath)) {
            const data = fs.readFileSync(groupActivitiesPath, 'utf8');
            const parsedData = JSON.parse(data);

            // Ensure all groups have proper structure
            Object.keys(parsedData).forEach(groupId => {
                if (!parsedData[groupId].joins) parsedData[groupId].joins = [];
                if (!parsedData[groupId].leaves) parsedData[groupId].leaves = [];
                if (!parsedData[groupId].promotes) parsedData[groupId].promotes = [];
                if (!parsedData[groupId].demotes) parsedData[groupId].demotes = [];
                if (!parsedData[groupId].customMessages) {
                    parsedData[groupId].customMessages = {
                        welcome: null,
                        leave: null,
                        promote: null,
                        demote: null
                    };
                }
            });

            return parsedData;
        }
    } catch (error) {
        logError(`Failed to load group activities: ${error.message}`);
    }
    return {};
}

function saveGroupActivities(data) {
    try {
        fs.writeFileSync(groupActivitiesPath, JSON.stringify(data, null, 2));
    } catch (error) {
        logError(`Failed to save group activities: ${error.message}`);
    }
}

async function sendCustomMessage(sock, groupId, messageType, userName, groupName, userJid) {
    try {
        const activities = loadGroupActivities();
        const groupSettings = activities[groupId];
        
        if (!groupSettings?.enabled) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[SKIP]')} Group activities disabled for ${groupName}`);
            return;
        }

        const customMessage = groupSettings.customMessages?.[messageType];
        let message = '';
        
        // Default messages
        const defaultMessages = {
            welcome: `🎉 *Welcome to the Group!*\n\n• *New Member:* @${userName}\n• *Group:* ${groupName}\n• *Time:* ${new Date().toLocaleTimeString()}\n\nWelcome to our community! 👋`,
            leave: `👋 *Member Left*\n\n• *Member:* @${userName}\n• *Group:* ${groupName}\n• *Time:* ${new Date().toLocaleTimeString()}\n\nGoodbye! We'll miss you!`,
            promote: `👑 *New Admin!*\n\n• *Promoted Member:* @${userName}\n• *Group:* ${groupName}\n• *Role:* Admin\n• *Time:* ${new Date().toLocaleTimeString()}\n\nCongratulations! 🎉`,
            demote: `📉 *Admin Removed*\n\n• *Member:* @${userName}\n• *Group:* ${groupName}\n• *Previous Role:* Admin\n• *Time:* ${new Date().toLocaleTimeString()}\n\nAdmin privileges removed.`
        };

        // Use custom message if available, otherwise default
        if (customMessage && customMessage.text) {
            message = customMessage.text
                .replace('{user}', `@${userName}`)
                .replace('{group}', groupName)
                .replace('{time}', new Date().toLocaleTimeString());
        } else {
            message = defaultMessages[messageType];
        }

        // Send message with or without attachment
        if (customMessage && customMessage.attachment) {
            // For now, send text message (attachment handling can be enhanced later)
            await sock.sendMessage(groupId, {
                text: message,
                mentions: [userJid]
            });
        } else {
            await sock.sendMessage(groupId, {
                text: message,
                mentions: [userJid]
            });
        }

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_SENT]')} ${messageType} notification sent to ${groupName}`);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} Failed to send ${messageType} message: ${error.message}`);
        logError(`Error sending custom ${messageType} message: ${error.message}`);
    }
}

async function handleGroupJoin(sock, eventData) {
    try {
        const { groupId, groupName, participants } = eventData;
        const joinedUser = participants[0];
        const userName = joinedUser.split('@')[0];

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[PROCESSING_JOIN]')} Handling join for ${userName} in ${groupName}`);

        // Load current activities
        let activities = loadGroupActivities();
        if (!activities[groupId]) {
            activities[groupId] = { 
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

        // Add join activity
        const joinActivity = {
            userId: userName,
            timestamp: Date.now(),
            action: 'join',
            groupName: groupName
        };
        activities[groupId].joins.push(joinActivity);

        // Save activities
        saveGroupActivities(activities);

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[GROUP_JOIN]')} User ${userName} joined ${groupName}`);

        // Send custom welcome message
        await sendCustomMessage(sock, groupId, 'welcome', userName, groupName, joinedUser);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR_JOIN]')} Failed to handle join: ${error.message}`);
        logError(`Error handling group join: ${error.message}`);
    }
}

async function handleGroupLeave(sock, eventData) {
    try {
        const { groupId, groupName, participants } = eventData;
        const leftUser = participants[0];
        const userName = leftUser.split('@')[0];

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[PROCESSING_LEAVE]')} Handling leave for ${userName} in ${groupName}`);

        // Load current activities
        let activities = loadGroupActivities();
        if (!activities[groupId]) {
            activities[groupId] = { 
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

        // Add leave activity
        const leaveActivity = {
            userId: userName,
            timestamp: Date.now(),
            action: 'leave',
            groupName: groupName
        };
        activities[groupId].leaves.push(leaveActivity);

        // Save activities
        saveGroupActivities(activities);

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[GROUP_LEAVE]')} User ${userName} left ${groupName}`);

        // Send custom leave message
        await sendCustomMessage(sock, groupId, 'leave', userName, groupName, leftUser);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR_LEAVE]')} Failed to handle leave: ${error.message}`);
        logError(`Error handling group leave: ${error.message}`);
    }
}

async function handleGroupPromote(sock, eventData) {
    try {
        const { groupId, groupName, participants } = eventData;
        const promotedUser = participants[0];
        const userName = promotedUser.split('@')[0];

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[PROCESSING_PROMOTE]')} Handling promotion for ${userName} in ${groupName}`);

        // Load current activities
        let activities = loadGroupActivities();
        if (!activities[groupId]) {
            activities[groupId] = { 
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

        // Add promote activity
        const promoteActivity = {
            userId: userName,
            timestamp: Date.now(),
            action: 'promote',
            groupName: groupName
        };
        activities[groupId].promotes.push(promoteActivity);

        // Save activities
        saveGroupActivities(activities);

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[GROUP_PROMOTE]')} User ${userName} promoted in ${groupName}`);

        // Send custom promote message
        await sendCustomMessage(sock, groupId, 'promote', userName, groupName, promotedUser);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR_PROMOTE]')} Failed to handle promotion: ${error.message}`);
        logError(`Error handling group promotion: ${error.message}`);
    }
}

async function handleGroupDemote(sock, eventData) {
    try {
        const { groupId, groupName, participants } = eventData;
        const demotedUser = participants[0];
        const userName = demotedUser.split('@')[0];

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[PROCESSING_DEMOTE]')} Handling demotion for ${userName} in ${groupName}`);

        // Load current activities
        let activities = loadGroupActivities();
        if (!activities[groupId]) {
            activities[groupId] = { 
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

        // Add demote activity
        const demoteActivity = {
            userId: userName,
            timestamp: Date.now(),
            action: 'demote',
            groupName: groupName
        };
        activities[groupId].demotes.push(demoteActivity);

        // Save activities
        saveGroupActivities(activities);

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[GROUP_DEMOTE]')} User ${userName} demoted in ${groupName}`);

        // Send custom demote message
        await sendCustomMessage(sock, groupId, 'demote', userName, groupName, demotedUser);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR_DEMOTE]')} Failed to handle demotion: ${error.message}`);
        logError(`Error handling group demotion: ${error.message}`);
    }
}

module.exports = {
    config: {
        name: 'groupActivities',
        author: 'Luna',
        version: '2.0.0',
        description: 'Monitors and notifies about group activities with custom messages',
        category: 'events',
        guide: {
            en: 'This event automatically monitors group activities and sends custom notifications'
        }
    },

    onStart: async ({ sock }) => {
        // Register event handlers
        if (!global.Luna.onEvent) {
            global.Luna.onEvent = new Map();
        }

        global.Luna.onEvent.set('group.join', { callback: (data) => handleGroupJoin(sock, data.eventData) });
        global.Luna.onEvent.set('group.leave', { callback: (data) => handleGroupLeave(sock, data.eventData) });
        global.Luna.onEvent.set('group.promote', { callback: (data) => handleGroupPromote(sock, data.eventData) });
        global.Luna.onEvent.set('group.demote', { callback: (data) => handleGroupDemote(sock, data.eventData) });
    },

    onLoad: async ({ sock }) => {
        // Register on load for immediate activation
        if (!global.Luna.onEvent) {
            global.Luna.onEvent = new Map();
        }

        global.Luna.onEvent.set('group.join', { callback: (data) => handleGroupJoin(sock, data.eventData) });
        global.Luna.onEvent.set('group.leave', { callback: (data) => handleGroupLeave(sock, data.eventData) });
        global.Luna.onEvent.set('group.promote', { callback: (data) => handleGroupPromote(sock, data.eventData) });
        global.Luna.onEvent.set('group.demote', { callback: (data) => handleGroupDemote(sock, data.eventData) });
    }
};
