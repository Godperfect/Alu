const { DisconnectReason } = require("@whiskeysockets/baileys");
const { Boom } = require('@hapi/boom');
const { logInfo, logError } = require('../../utils');


function handleConnection(ptz, startBotz) {
    ptz.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;

            const disconnectActions = {
                [DisconnectReason.loggedOut]: () => {
                    logInfo("Device logged out, please delete session and scan again.");
                    process.exit();
                },
                [DisconnectReason.connectionClosed]: () => {
                    logInfo("Connection closed, reconnecting....");
                    startBotz();
                },
                [DisconnectReason.connectionLost]: () => {
                    logInfo("Connection lost, reconnecting....");
                    startBotz();
                },
                [DisconnectReason.connectionReplaced]: () => {
                    logInfo("Connection replaced, handling session cleanup...");
                    const config = require('../../config.json');
                    
                    if (!config.whatsappAccount?.preserveSessionOnReplace) {
                        // Clean up session files only if config allows
                        const fs = require('fs');
                        const path = require('path');
                        const sessionPath = path.join(__dirname, '../../session');
                        if (fs.existsSync(sessionPath)) {
                            fs.rmSync(sessionPath, { recursive: true, force: true });
                            logInfo("Session files cleaned up due to configuration");
                        }
                    } else {
                        logInfo("Preserving session files per configuration");
                    }
                    
                    // Restart the bot after handling session
                    setTimeout(() => {
                        startBotz();
                    }, 2000);
                },
                [DisconnectReason.restartRequired]: () => {
                    logInfo("Restart required, restarting...");
                    startBotz();
                },
                [DisconnectReason.timedOut]: () => {
                    logInfo("Connection timed out, reconnecting...");
                    startBotz();
                }
            };

            const action = disconnectActions[reason];
            if (action) {
                action();
            } else {
                ptz.end(`Unknown DisconnectReason: ${reason}|${connection}`);
            }
        } else if (connection === 'open') {
            // Connection opened - handled in bot.js
        }
    });
}

module.exports = { handleConnection };