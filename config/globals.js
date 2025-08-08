const config = require('../config.json');

const initializeGlobals = () => {
    // Initialize configuration from config.json
    const config = require('../config.json');
    global.config = config;

    // Initialize other global variables here
    global.stats = {
        totalMessages: 0,
        commandsExecuted: 0,
        errors: 0,
        startTime: Date.now()
    };

    global.cache = {
        users: new Map(),
        groups: new Map(),
        commands: new Map()
    };

    // Initialize command and event handlers
    global.commands = new Map();
    global.events = new Map();

    // Bot status
    global.botConnected = false;

    // Initialize global logs arrays
    global.messageLogs = [];
    global.commandLogs = [];
    global.eventLogs = [];
    global.databaseLogs = [];

    console.log('[GLOBALS] All global variables initialized successfully');
};

module.exports = { initializeGlobals, config };