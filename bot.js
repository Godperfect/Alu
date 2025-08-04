const {
    default: makeWASocket
} = require("@whiskeysockets/baileys");
const main = require('bytenode');
const pino = require('pino');
const fs = require('fs');
const chalk = require('chalk'); 
const { logInfo, logError, logGoatBotStyle, initializeMediaHandlers } = require('./utils');
const config = require('./config.json');
const { authenticateSession, getAuthState } = require('./bot/login/login.js');
const eventHandler = require('./bot/handler/eventHandler');
const { handleConnection } = require('./bot/login/plug');
const { startUptimeServer } = require('./bot/sentainal');
const { initializeGlobals, config: globalConfig } = require('./config/globals');
const CommandManager = require('./bot/managers/cmdPulse');
const EventManager = require('./bot/managers/eventPulse');
const DatabaseManager = require('./bot/managers/databaseManager');

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
const databaseManager = new DatabaseManager();

let isLoggedIn = false;

async function startBotz() {
    try {
        // Initialize globals and systems
        initializeGlobals();
        languageManager.initialize(config);
        
        // Clean startup display
        logGoatBotStyle('startup');
        
        

        

        process.on('unhandledRejection', (reason, promise) => {
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

        ptz.ev.on('connection.update', async ({ connection }) => {
            
            if (connection === 'open' && !isLoggedIn) {
                isLoggedIn = true;
                
                // Log successful connection
                logGoatBotStyle('ready', { name: config.botSettings.botName });
                logGoatBotStyle('connection', { status: 'open' });
                
                // Initialize database after successful login
                if (config.database.autoSyncWhenStart) {
                    try {
                        await databaseManager.initialize();
                        logGoatBotStyle('database', { 
                            status: 'connected', 
                            type: config.database.type 
                        });
                    } catch (error) {
                        logGoatBotStyle('database', { 
                            status: 'error', 
                            error: error.message 
                        });
                    }
                }
                
                logInfo('Loading commands and events...');
                commandManager.loadCommands();
                eventManager.loadEvents();

                if (config.serverUptime && config.serverUptime.enable) {
                    logInfo(languageManager.get('bot.startingUptimeServer'));
                    startUptimeServer(config.serverUptime.port || 3001);
                    logGoatBotStyle('uptime', { port: config.serverUptime.port || 3001 });
                }
            } else if (connection === 'close') {
                logGoatBotStyle('connection', { status: 'close' });
            } else if (connection === 'connecting') {
                logGoatBotStyle('connection', { status: 'connecting' });
            } else if (connection === 'reconnecting') {
                logGoatBotStyle('connection', { status: 'reconnecting' });
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
        logError(languageManager.get('error.unexpected', err));
    }
}

startBotz();
