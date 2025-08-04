const {
    default: makeWASocket
} = require("@whiskeysockets/baileys");
const main = require('bytenode');
const pino = require('pino');
const fs = require('fs');
const chalk = require('chalk'); 
const { logInfo, logError, logLunaStyle, initializeMediaHandlers } = require('./utils');
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
        loadMessage: async (jid, id) => {
            if (messages[jid] && messages[jid][id]) return messages[jid][id];
            return undefined;
        },
    };
})();

// Function to load modules with detailed feedback
async function loadModulesWithFeedback() {
    try {
        // Check and load commands
        const fs = require('fs');
        const path = require('path');

        const commandsPath = path.join(__dirname, 'scripts', 'cmds');
        const eventsPath = path.join(__dirname, 'scripts', 'events');

        // Load commands
        if (fs.existsSync(commandsPath)) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

            if (commandFiles.length === 0) {
                console.log(chalk.yellow('⚠️ NO COMMAND MODULES FOUND'));
            } else {
                console.log(chalk.cyan(`🔄 LOADING ${commandFiles.length} COMMAND MODULES...`));

                for (const file of commandFiles) {
                    try {
                        // Simulate loading with spinner effect
                        process.stdout.write(chalk.yellow(`⏳ INSTALLING MODULE: ${file.replace('.js', '')} `));
                        await new Promise(resolve => setTimeout(resolve, 100));

                        process.stdout.write(chalk.yellow('█'));
                        await new Promise(resolve => setTimeout(resolve, 50));
                        process.stdout.write(chalk.yellow('█'));
                        await new Promise(resolve => setTimeout(resolve, 50));
                        process.stdout.write(chalk.yellow('█\n'));

                        console.log(chalk.green(`✅ LOADING COMMAND: ${file.replace('.js', '')}`));

                    } catch (error) {
                        console.log(chalk.red(`❌ ERROR LOADING ${file}: ${error.message}`));
                        // Don't stop the bot, just log the error
                    }
                }
            }
        }

        // Load events
        if (fs.existsSync(eventsPath)) {
            const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

            if (eventFiles.length === 0) {
                console.log(chalk.yellow('⚠️ NO EVENT MODULES FOUND'));
            } else {
                console.log(chalk.cyan(`🔄 LOADING ${eventFiles.length} EVENT MODULES...`));

                for (const file of eventFiles) {
                    try {
                        // Simulate loading with spinner effect
                        process.stdout.write(chalk.yellow(`⏳ INSTALLING MODULE: ${file.replace('.js', '')} `));
                        await new Promise(resolve => setTimeout(resolve, 100));

                        process.stdout.write(chalk.yellow('█'));
                        await new Promise(resolve => setTimeout(resolve, 50));
                        process.stdout.write(chalk.yellow('█'));
                        await new Promise(resolve => setTimeout(resolve, 50));
                        process.stdout.write(chalk.yellow('█\n'));

                        console.log(chalk.green(`✅ LOADING EVENT: ${file.replace('.js', '')}`));

                    } catch (error) {
                        console.log(chalk.red(`❌ ERROR LOADING ${file}: ${error.message}`));
                        // Don't stop the bot, just log the error
                    }
                }
            }
        }

        // Actually load the modules after visual feedback
        await commandManager.loadCommands();
        await eventManager.loadEvents();

    } catch (error) {
        console.log(chalk.red(`❌ MODULE LOADING ERROR: ${error.message}`));
        // Don't stop the bot, continue execution
    }
}

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
        logLunaStyle('startup');

        // Show connecting status
        logLunaStyle('connecting');

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
                console.log(chalk.green('✅ CONNECTED SUCCESSFULLY'));

                // Initialize database after successful login
                if (config.database.autoSyncWhenStart) {
                    console.log(chalk.yellow(`🔄 CONNECTING WITH DATABASE: ${config.database.type.toUpperCase()}`));
                    try {
                        await databaseManager.initialize();
                        console.log(chalk.green(`✅ CONNECTED WITH: ${config.database.type.toUpperCase()}`));
                    } catch (error) {
                        console.log(chalk.red(`❌ DATABASE ERROR: ${error.message}`));
                    }
                }

                // Load commands and events with detailed feedback
                await loadModulesWithFeedback();

                // Start uptime server
                if (config.serverUptime && config.serverUptime.enable) {
                    startUptimeServer(config.serverUptime.port || 3001);
                    console.log(chalk.blue(`🌐 UPTIME SERVER RUNNING ON PORT: ${config.serverUptime.port || 3001}`));
                }

                // Show completion message
                console.log(chalk.green.bold('\n🎉 SUCCESSFULLY LOADED ALL MODULES'));
                console.log(chalk.cyan(`🤖 ${config.botSettings.botName} BOT IS NOW READY!`));
            } else if (connection === 'close') {
                console.log(chalk.red('❌ CONNECTION CLOSED'));
            } else if (connection === 'connecting') {
                console.log(chalk.yellow('🔄 CONNECTING...'));
            } else if (connection === 'reconnecting') {
                console.log(chalk.yellow('🔄 RECONNECTING...'));
            }
        });

        await authenticateSession(ptz);

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