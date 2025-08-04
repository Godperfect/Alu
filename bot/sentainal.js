
const http = require('http');
const { logSuccess, logError, logInfo } = require('../utils');
const config = require('../config.json');

function startUptimeServer() {
    if (!config.serverUptime.enable) return;

    const startServer = (port) => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end('Bot is running!\n');
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logError(`Port ${port} is busy, trying port ${port + 1}`);
                startServer(port + 1);
            } else {
                logError(`Server error: ${err.message}`);
            }
        });

        server.listen(port, () => {
            logSuccess(`Uptime server running on port ${port}`);
        });
    };


    const initialPort = config.serverUptime.port || 3001;
    startServer(initialPort);
}

module.exports = { startUptimeServer };
