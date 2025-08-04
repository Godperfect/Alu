const {
    default: makeWASocket
} = require("@whiskeysockets/baileys");
const main = require('bytenode');
const pino = require('pino');
const fs = require('fs');
const chalk = require('chalk'); 
const { logInfo, logError, logSuccess } = require('./utils');
const config = require('./config.json');
const { authenticateSession, getAuthState } = require('./bot/login/login.obf.jsc');
const eventHandler = require('./bot/handler/eventHandler');
const { handleConnection } = require('./bot/login/plug');
const { initializeMediaHandlers } = require('./utils');
const { startUptimeServer } = require('./bot/sentainal');
const { initializeGlobals, config: globalConfig } = require('./config/globals');
const CommandManager = require('./bot/managers/cmdPulse');
const EventManager = require('./bot/managers/eventPulse');
const db = require('./connectDB');
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

async function startBotz() {
    try {
        // Initialize globals first
        initializeGlobals();

        // Initialize language manager with config
        languageManager.initialize(config);

        process.on('unhandledRejection', (reason, promise) => {
            logError(languageManager.get('error.unexpected', reason));
        });

        
        
        const { state, saveCreds } = await getAuthState();

        // Step 3: Database connection
        logInfo('Connecting to database: ' + (config.database.type || 'sqlite'));
        const dbConnected = await db.connect();
        
        if (dbConnected) {
            const dbType = db.getStatus().primaryDB;
            logSuccess(`Successfully connected to: ${dbType}`);
        } else {
            logError('Can\'t connect to database sqlite or mongodb');
            return;
        }

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

        ptz.ev.on('connection.update', ({ connection }) => {
            if (connection === 'open' && !isLoggedIn) {
                isLoggedIn = true;
                
                console.log(chalk.red('─────────────────────────────────────────'));
                logSuccess('BOT IS SUCCESSFULLY CONNECTED');
                
                // Step 4: Load commands and events
                logInfo('Loading commands and events...');
                commandManager.loadCommands();
                eventManager.loadEvents();

                if (config.serverUptime && config.serverUptime.enable) {
                    logInfo('Starting uptime server...');
                    const server = startUptimeServer(config.serverUptime.port || 3001);
                    logSuccess(`Uptime server running on port ${config.serverUptime.port || 3001}`);
                }
            } else if (connection === 'close') {
                logInfo('Bot disconnected');
            } else if (connection === 'connecting') {
                logInfo('Connecting to WhatsApp...');
            } else if (connection === 'reconnecting') {
                logInfo('Reconnecting to WhatsApp...');
            }
        });

        await authenticateSession(ptz);

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

startBotz();
