const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logInfo, logError, logSuccess, logWarning } = require('../../utils');
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
        this.events = new Map(); // Initialize events Map
        this.eventsFolder = path.resolve(__dirname, '../../scripts/events');
    }

    loadEvents() {
        const eventFiles = fs.readdirSync(this.eventsFolder).filter(file => file.endsWith('.js'));
        let loadedCount = 0;
        let failedCount = 0;

        eventFiles.forEach(async (file) => {
            const eventPath = path.join(this.eventsFolder, file);

            try {
                delete require.cache[require.resolve(eventPath)];
                const eventModule = require(eventPath);

                if (eventModule && eventModule.config && eventModule.config.name) {
                    const eventName = eventModule.config.name;
                    this.events.set(eventName, eventModule);

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SUCCESS]')} ${chalk.cyan('Loaded event:')} ${chalk.yellow(eventName)}`);

                    // Execute onStart and onLoad silently
                    if (global.sock) {
                        if (eventModule.onStart && typeof eventModule.onStart === 'function') {
                            await eventModule.onStart({ sock: global.sock });
                        }

                        if (eventModule.onLoad && typeof eventModule.onLoad === 'function') {
                            await eventModule.onLoad({ sock: global.sock });
                        }
                    }

                    loadedCount++;
                } else {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${chalk.red('Invalid event structure in file:')} ${chalk.yellow(file)} ${chalk.gray('- Missing config.name')}`);
                    failedCount++;
                }
            } catch (error) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[ERROR]')} ${chalk.red('Failed to load event from')} ${chalk.yellow(file)}: ${chalk.red(error.message)}`);
                failedCount++;
            }
        });

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SUCCESS]')} ${chalk.cyan('Successfully loaded')} ${chalk.yellow(loadedCount)} ${chalk.cyan('events')} ${failedCount > 0 ? chalk.red(`(${failedCount} failed)`) : ''}`);
        console.log('─────────────────────────────────────────');
    }

    handleEvents({ sock, m = null, sender }) {
        if (!config.logEvents?.enable) return;

        if (!m) {
            logError("handleEvents called but 'm' is undefined or null!");
            return;
        }

        let processedEvents = 0;
        let failedEvents = 0;

        this.events.forEach((event, eventName) => {
            try {
                // Ensure the event function exists before calling
                if (typeof event.event === 'function') {
                    event.event({ sock, m, sender });
                    processedEvents++;

                    if (config.logEvents?.verbose) {
                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[EVENT_EXEC]')} ${chalk.white(eventName)} ${chalk.green('✓')}`);
                    }
                } else {
                    failedEvents++;
                    if (config.logEvents?.logErrors) {
                        logError(`Event '${eventName}' does not have an 'event' function.`);
                    }
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
            const activeEvents = this.events.size;
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[EVENT_STATUS]')} ${chalk.cyan('Active Events:')} ${chalk.yellow(activeEvents)} ${chalk.gray('- Listening 24/7')}`);
        }, 600000); // Every 10 minutes
    }

    // Get event by name
    getEvent(eventName) {
        return this.events.get(eventName);
    }

    // Get total number of loaded events
    getEventCount() {
        return this.events.size;
    }
}

module.exports = EventManager;