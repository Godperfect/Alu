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
            return JSON.parse(data);
        }
    } catch (error) {
        logError(`Failed to load group activities: ${error.message}`);
    }
    return {};
}

function saveGroupActivities(data) {
    try {
        fs.writeFileSync(groupActivitiesPath, JSON.stringify(data, null, 2));
        logSuccess('Group activities data saved successfully');
    } catch (error) {
        logError(`Failed to save group activities: ${error.message}`);
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
            activities[groupId] = { joins: [], leaves: [], promotes: [], demotes: [] };
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

        // Send notification to group with enhanced logging
        const message = `🎉 *Group Activities Notification*\n\n` +
                       `• *Member joined:* @${userName}\n` +
                       `• *Group:* ${groupName}\n` +
                       `• *Time:* ${new Date().toLocaleTimeString()}\n\n` +
                       `Welcome to the group! 👋`;

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[SENDING_MESSAGE]')} Attempting to send join notification to ${groupId}`);

        await sock.sendMessage(groupId, {
            text: message,
            mentions: [joinedUser]
        });

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_SENT]')} Join notification successfully sent to ${groupName}`);
        logSuccess(`Join notification sent to ${groupName}`);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR_JOIN]')} Failed to send join notification: ${error.message}`);
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
            activities[groupId] = { joins: [], leaves: [], promotes: [], demotes: [] };
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

        // Send notification to group
        const message = `📢 *Group Activities Notification*\n\n` +
                       `• *Member left:* @${userName}\n` +
                       `• *Group:* ${groupName}\n` +
                       `• *Time:* ${new Date().toLocaleTimeString()}\n\n` +
                       `Goodbye! 👋`;

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[SENDING_MESSAGE]')} Attempting to send leave notification to ${groupId}`);

        await sock.sendMessage(groupId, {
            text: message,
            mentions: [leftUser]
        });

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_SENT]')} Leave notification successfully sent to ${groupName}`);
        logSuccess(`Leave notification sent to ${groupName}`);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR_LEAVE]')} Failed to send leave notification: ${error.message}`);
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
            activities[groupId] = { joins: [], leaves: [], promotes: [], demotes: [] };
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

        // Send notification to group
        const message = `👑 *Group Activities Notification*\n\n` +
                       `• *Member promoted:* @${userName}\n` +
                       `• *Group:* ${groupName}\n` +
                       `• *New role:* Admin\n` +
                       `• *Time:* ${new Date().toLocaleTimeString()}\n\n` +
                       `Congratulations on becoming an admin! 🎉`;

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[SENDING_MESSAGE]')} Attempting to send promotion notification to ${groupId}`);

        await sock.sendMessage(groupId, {
            text: message,
            mentions: [promotedUser]
        });

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_SENT]')} Promotion notification successfully sent to ${groupName}`);
        logSuccess(`Promotion notification sent to ${groupName}`);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR_PROMOTE]')} Failed to send promotion notification: ${error.message}`);
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
            activities[groupId] = { joins: [], leaves: [], promotes: [], demotes: [] };
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

        // Send notification to group
        const message = `📉 *Group Activities Notification*\n\n` +
                       `• *Member demoted:* @${userName}\n` +
                       `• *Group:* ${groupName}\n` +
                       `• *Previous role:* Admin\n` +
                       `• *Time:* ${new Date().toLocaleTimeString()}\n\n` +
                       `Admin privileges have been removed.`;

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[SENDING_MESSAGE]')} Attempting to send demotion notification to ${groupId}`);

        await sock.sendMessage(groupId, {
            text: message,
            mentions: [demotedUser]
        });

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[MESSAGE_SENT]')} Demotion notification successfully sent to ${groupName}`);
        logSuccess(`Demotion notification sent to ${groupName}`);

    } catch (error) {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR_DEMOTE]')} Failed to send demotion notification: ${error.message}`);
        logError(`Error handling group demotion: ${error.message}`);
    }
}

module.exports = {
    config: {
        name: 'groupActivities',
        author: 'Luna',
        version: '1.0.0',
        description: 'Monitors and notifies about group activities',
        category: 'events',
        guide: {
            en: 'This event automatically monitors group activities and sends notifications'
        }
    },

    onStart: async ({ sock }) => {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[EVENT_INIT]')} Initializing Group Activities event handlers...`);

        // Register event handlers
        if (!global.Luna.onEvent) {
            global.Luna.onEvent = new Map();
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[INIT]')} Created Luna.onEvent Map`);
        }

        // Register group event handlers with enhanced logging
        global.Luna.onEvent.set('group.join', { callback: (data) => handleGroupJoin(sock, data.eventData) });
        global.Luna.onEvent.set('group.leave', { callback: (data) => handleGroupLeave(sock, data.eventData) });
        global.Luna.onEvent.set('group.promote', { callback: (data) => handleGroupPromote(sock, data.eventData) });
        global.Luna.onEvent.set('group.demote', { callback: (data) => handleGroupDemote(sock, data.eventData) });

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[REGISTERED]')} All group event handlers registered:`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.white('  - group.join')}`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.white('  - group.leave')}`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.white('  - group.promote')}`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.white('  - group.demote')}`);

        logSuccess('Group activities event handlers registered successfully');
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[EVENT]')} Group Activities event is now monitoring all groups 24/7`);
    },

    onLoad: async ({ sock }) => {
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[EVENT_LOAD]')} Loading Group Activities event handlers...`);

        // Also register on load for immediate activation
        if (!global.Luna.onEvent) {
            global.Luna.onEvent = new Map();
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[LOAD_INIT]')} Created Luna.onEvent Map`);
        }

        global.Luna.onEvent.set('group.join', { callback: (data) => handleGroupJoin(sock, data.eventData) });
        global.Luna.onEvent.set('group.leave', { callback: (data) => handleGroupLeave(sock, data.eventData) });
        global.Luna.onEvent.set('group.promote', { callback: (data) => handleGroupPromote(sock, data.eventData) });
        global.Luna.onEvent.set('group.demote', { callback: (data) => handleGroupDemote(sock, data.eventData) });

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[EVENT_LOADED]')} Group Activities monitoring is ACTIVE and ready to send notifications`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[STATUS]')} Bot will now send real-time notifications to WhatsApp groups`);
    }
};