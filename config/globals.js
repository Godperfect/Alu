
const config = require('../config.json');

const initializeGlobals = () => {
    // Make config globally available
    global.config = config;
    global.owner = config.botSettings.ownerNumber ? [config.botSettings.ownerNumber] : [];
    global.prefix = config.botSettings.prefix || '+';
    global.botName = config.botSettings.botName || 'Luna v1';
    global.commands = new Map();
    global.aliases = new Map();
    global.events = new Map();
    global.cc = {};
    global.adminList = config.adminOnly.adminNumbers || [];
    global.whiteList = config.whiteListMode.allowedNumbers || [];
};

module.exports = { initializeGlobals, config };

