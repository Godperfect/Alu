const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logInfo, logError, logSuccess } = require('../../utils');
const { config } = require('../../config/globals');
const chalk = require('chalk');

/**
 * Get formatted timestamp
 * @returns {string} Formatted timestamp in [HH:mm:ss] format
 */
const getTimestamp = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return chalk.gray(`[${hours}:${minutes}:${seconds}]`);
};

/**
 * Get formatted date
 * @returns {string} Formatted date in [YYYY-MM-DD] format
 */
const getFormattedDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return chalk.gray(`[${year}-${month}-${day}]`);
};

class EventManager {
    constructor() {
        this.eventsFolder = path.resolve(__dirname, '../../scripts/events');
    }

    loadEvents() {
        if (!fs.existsSync(this.eventsFolder)) {
            logError(`Events folder not found: ${this.eventsFolder}`);
            return;
        }

        const eventFiles = fs.readdirSync(this.eventsFolder).filter(file => file.endsWith('.js'));
        let totalEvents = 0;
        let failedEvents = 0;

        if (eventFiles.length === 0) {
            logInfo('No event files found');
            return;
        }

        eventFiles.forEach(file => {
            const eventPath = path.join(this.eventsFolder, file);

            try {
                let event;
                try {
                    event = require(eventPath);
                } catch (err) {
                    if (err.code === 'MODULE_NOT_FOUND') {
                        const missingModule = err.message.match(/'(.+?)'/)?.[1];
                        if (missingModule) {
                            console.log(`[AUTO-INSTALL] Missing dependency "${missingModule}" in ${file}. Installing...`);
                            execSync(`npm install ${missingModule}`, { stdio: 'inherit' });
                            event = require(eventPath);
                        } else {
                            throw err;
                        }
                    } else {
                        throw err;
                    }
                }

                if (event && event.config && event.config.name) {
                    global.events.set(event.config.name, event);
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SUCCESS]')} ${chalk.cyan('Loaded event:')} ${chalk.yellow(event.config.name)}`);
                    totalEvents++;
                } else {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${chalk.red('Invalid event structure in file:')} ${chalk.yellow(file)}`);
                    failedEvents++;
                }

                // Clear the require cache for hot reloading
                delete require.cache[require.resolve(eventPath)];

            } catch (err) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${chalk.red('Failed to load event from')} ${chalk.yellow(file)}: ${chalk.red(err.message)}`);
                failedEvents++;
            }
        });

        if (failedEvents > 0) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${chalk.red('Failed to load')} ${chalk.yellow(failedEvents)} ${chalk.red('events')}`);
        }
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SUCCESS]')} ${chalk.cyan('Successfully loaded')} ${chalk.yellow(totalEvents)} ${chalk.cyan('events')} ${failedEvents > 0 ? chalk.red(`(${failedEvents} failed)`) : ''}`);
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[STATUS]')} ${chalk.cyan('Events are now active and listening 24/7')}`);
        console.log('─────────────────────────────────────────');
        
        // Start monitoring event health
        this.monitorEventHealth();
    }

    handleEvents({ sock, m = null, sender }) {
        if (!config.logEvents?.enable) return;

        if (!m) {
            logError("handleEvents called but 'm' is undefined or null!");
            return;
        }

        let processedEvents = 0;
        let failedEvents = 0;

        global.events.forEach((event, eventName) => {
            try {
                event.event({ sock, m, sender });
                processedEvents++;
                
                if (config.logEvents?.verbose) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[EVENT_EXEC]')} ${chalk.white(eventName)} ${chalk.green('✓')}`);
                }
            } catch (error) {
                failedEvents++;
                if (config.logEvents?.logErrors) {
                    logError(`Event execution failed [${eventName}]: ${error.message}`);
                }
            }
        });

        if (config.logEvents?.verbose && processedEvents > 0) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[EVENT_SUMMARY]')} Processed: ${chalk.green(processedEvents)} | Failed: ${chalk.red(failedEvents)}`);
        }
    }

    // Add method to monitor event health
    monitorEventHealth() {
        setInterval(() => {
            const activeEvents = global.events.size;
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[EVENT_STATUS]')} ${chalk.cyan('Active Events:')} ${chalk.yellow(activeEvents)} ${chalk.gray('- Listening 24/7')}`);
        }, 600000); // Every 10 minutes
    }
}

module.exports = EventManager;