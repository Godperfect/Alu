// utils/permission.js - Updated implementation
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

// Get list of bot admins from config
const botAdmins = config.adminOnly.adminNumbers || [];

/**
 * Check if a user is a bot admin
 * @param {string} userNumber - User's phone number without special characters
 * @returns {boolean} - True if user is a bot admin
 */
const isBotAdmin = (userNumber) => {
    return botAdmins.includes(userNumber);
};

/**
 * Check if user is a group admin
 * @param {string} userNumber - User's phone number without special characters
 * @param {object} groupMetadata - Group metadata containing participants info
 * @returns {boolean} - True if user is a group admin
 */
const isGroupAdmin = (userNumber, groupMetadata) => {
    if (!groupMetadata || !groupMetadata.participants) return false;
    
    // Find admin participants in the group
    const adminParticipants = groupMetadata.participants.filter(
        participant => participant.admin === 'admin' || participant.admin === 'superadmin'
    );
    
    // Check if user is in the admin list
    return adminParticipants.some(admin => {
        const adminNumber = admin.id.split('@')[0];
        return adminNumber === userNumber;
    });
};

/**
 * Get user permission level
 * @param {string} userNumber - User's phone number without special characters
 * @param {object} groupMetadata - Group metadata containing participants info
 * @returns {number} - Permission level (0: all users, 1: group/bot admins, 2: bot admins only)
 */
const getPermissionLevel = (userNumber, groupMetadata = null) => {
    // Level 2: Bot Admin privileges - highest priority
    if (isBotAdmin(userNumber)) return 2;
    
    // Level 1: Group Admin privileges (in groups only)
    if (groupMetadata && isGroupAdmin(userNumber, groupMetadata)) return 1;
    
    // Level 0: Regular user - lowest privilege level
    return 0;
};

/**
 * Check if user has required permission level to use a command
 * @param {string} userNumber - User's phone number without special characters
 * @param {object} groupMetadata - Group metadata for checking group admin status
 * @param {number} requiredLevel - Required permission level for the command
 * @returns {boolean} - True if user has required permission
 */
const hasPermission = (userNumber, groupMetadata, requiredLevel) => {
    const userLevel = getPermissionLevel(userNumber, groupMetadata);
    return userLevel >= requiredLevel;
};

/**
 * Check if user can use the bot based on global settings
 * @param {string} userNumber - User's phone number without special characters
 * @returns {boolean} - True if user can use the bot
 */
const canUseBot = (userNumber) => {
    // If admin-only mode is enabled, only bot admins can use it
    if (config.adminOnly.enable) {
        return isBotAdmin(userNumber);
    }
    
    // If whitelist mode is enabled, only whitelisted users can use it
    if (config.whiteListMode.enable) {
        return config.whiteListMode.allowedNumbers.includes(userNumber);
    }
    
    // Otherwise anyone can use the bot
    return true;
};

module.exports = {
    isBotAdmin,
    isGroupAdmin,
    getPermissionLevel,
    hasPermission,
    canUseBot
};