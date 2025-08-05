
const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '..', '..', 'logs');
        this.ensureLogDir();
    }

    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    info(message) {
        const formatted = this.formatMessage('info', message);
        console.log(`\x1b[36m${formatted}\x1b[0m`);
        this.writeToFile('info.log', formatted);
    }

    error(message) {
        const formatted = this.formatMessage('error', message);
        console.error(`\x1b[31m${formatted}\x1b[0m`);
        this.writeToFile('error.log', formatted);
    }

    warn(message) {
        const formatted = this.formatMessage('warn', message);
        console.warn(`\x1b[33m${formatted}\x1b[0m`);
        this.writeToFile('warn.log', formatted);
    }

    success(message) {
        const formatted = this.formatMessage('success', message);
        console.log(`\x1b[32m${formatted}\x1b[0m`);
        this.writeToFile('info.log', formatted);
    }

    writeToFile(filename, message) {
        try {
            const logFile = path.join(this.logDir, filename);
            fs.appendFileSync(logFile, message + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
}

const logger = new Logger();

module.exports = { logger };
