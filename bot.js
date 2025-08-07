const { DisconnectReason } = require('@whiskeysockets/baileys');

const {
    default: makeWASocket
} = require("@whiskeysockets/baileys");
const main = require('bytenode');
const pino = require('pino');
const fs = require('fs');
const chalk = require('chalk'); 
const { logInfo, logError, logSuccess } = require('./utils');
const config = require('./config.json');
const { authenticateSession, getAuthState, getTimestamp, getFormattedDate } = require('./bot/login/login.js');
const eventHandler = require('./bot/handler/eventHandler');
const { handleConnection } = require('./bot/login/plug');
const { initializeMediaHandlers } = require('./utils');
const { startUptimeServer } = require('./bot/sentainal');
const { initializeGlobals, config: globalConfig } = require('./config/globals');
const CommandManager = require('./bot/managers/cmdPulse');
const EventManager = require('./bot/managers/eventPulse');
const db = require('./dashboard/connectDB');
const dataHandler = require('./bot/handler/handlerCheckdata');

// Import the language manager
const languageManager = require('./language/language.js');

const store = (() => {
    const messages = {};
    return {
        bind: (sock) => {
            // You can implement message binding here if needed
        },
        loadMessage: async (jid, id) => {
            if (messages[jid] && messages[jid][id]) return messages[jid][id];
            return undefined;
        },
        writeToFile: (path) => {
            // Implement if needed
        },
        readFromFile: (path) => {
            // Implement if needed
        }
    };
})();

const commandManager = new CommandManager();
const eventManager = new EventManager();

let isLoggedIn = false;

// Initialize bot status global
global.botConnected = false;

// Initialize global GoatBot object for dashboard
global.GoatBot = {
    stats: {
        totalMessages: 0,
        messagesToday: 0,
        commandsUsed: 0,
        commandsExecuted: 0,
        errors: 0,
        successRate: 100,
        topCommands: [],
        daily: 0
    },
    startTime: Date.now(),
    authTokens: new Map()
};

async function startBotz() {
    try {
        // Initialize globals first
        initializeGlobals();

        // Initialize language manager with config
        languageManager.initialize(config);

        process.on('unhandledRejection', (reason, promise) => {
            // Handle unhandled rejections silently for session-related errors
            if (reason && reason.message && reason.message.includes('ENOENT') && reason.message.includes('session')) {
                // Session file missing is normal, don't log as unexpected error
                return;
            }
            logError(languageManager.get('error.unexpected', reason));
        });



        const { state, saveCreds } = await getAuthState();

        const ptz = makeWASocket({
            logger: pino({ level: config.waSocket.logLevel || "silent" }),
            printQRInTerminal: config.whatsappAccount.printQRInTerminal,
            auth: state,
            browser: config.waSocket.browser,
            connectTimeoutMs: config.whatsappAccount.qrTimeout * 1000,
            defaultQueryTimeoutMs: config.waSocket.defaultQueryTimeoutMs,
            keepAliveIntervalMs: config.waSocket.keepAliveIntervalMs,
            emitOwnEvents: config.waSocket.emitOwnEvents,
            fireInitQueries: config.waSocket.fireInitQueries,
            generateHighQualityLinkPreview: config.waSocket.generateHighQualityLinkPreview,
            syncFullHistory: config.waSocket.syncFullHistory,
            markOnlineOnConnect: config.waSocket.markOnlineOnConnect,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                }
                return undefined;
            }
        });

        ptz.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                global.botConnected = false;
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    logInfo('Reconnecting...');
                    startBotz();
                } else {
                    logError('Connection closed permanently');
                }
            } else if (connection === 'open') {
                global.botConnected = true;
                global.sock = ptz; // Make sock available globally for events
                console.log('─────────────────────────────────────────');

                // Initialize database connection after successful WhatsApp connection
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('CONNECTING TO DATABASE:')} ${chalk.green(config.database.type?.toUpperCase() || 'SQLITE')}`);
                const dbConnected = await db.connect();

                if (dbConnected) {
                    const dbType = db.getStatus().primaryDB;
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('SUCCESSFULLY CONNECTED TO')} ${chalk.green(dbType.toUpperCase())}`);
                } else {
                    logError('Can\'t connect to database sqlite or mongodb');
                    return;
                }

                // Start web dashboard after database is connected
                try {
                    const { startServer } = require('./dashboard/app');
                    startServer();
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('DASHBOARD AVAILABLE AT')} ${chalk.cyan('http://0.0.0.0:3000')}`);
                } catch (error) {
                    logError(`Dashboard startup failed: ${error.message}`);
                }

                // Load commands and events after successful connection
                setTimeout(() => {
                    console.log('─────────────────────────────────────────');
                    commandManager.loadCommands();
                    eventManager.loadEvents();
                }, 100);
            }
        });

        // Only authenticate if no valid session exists
        const { checkSessionExists } = require('./bot/login/login.js');
        if (!checkSessionExists()) {
            await authenticateSession(ptz);
        } else {
            
        }

        store.bind(ptz.ev);
        eventHandler.initializeMessageListener(ptz, store);

        handleConnection(ptz, startBotz);

        initializeMediaHandlers(ptz);

        ptz.ev.on('creds.update', saveCreds);

        if (config.autoRestart && config.autoRestart.enable && config.autoRestart.time) {
            setInterval(() => {
                logInfo(languageManager.get('bot.restartScheduled', config.autoRestart.time));
                process.exit();
            }, config.autoRestart.time * 1000 * 60);
        }

        return ptz;
    } catch (err) {
        logError('Bot startup failed: ' + err.message);
    }
}

module.exports = startBotz;