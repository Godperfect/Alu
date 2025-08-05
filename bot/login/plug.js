const { DisconnectReason } = require("@whiskeysockets/baileys");
const { Boom } = require('@hapi/boom');
const { logInfo, logSuccess } = require('../../utils');


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
                    logInfo("Connection replaced, another new session opened, please close current session first");
                    process.exit();
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


        }
    });
}

module.exports = { handleConnection };