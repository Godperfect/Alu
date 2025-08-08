const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { logInfo, logError, logSuccess, logWarning, getTimestamp, getFormattedDate } = require('../../utils');

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
        const eventsPath = path.join(__dirname, '../../scripts/events');

        if (!fs.existsSync(eventsPath)) {
            logError('Events directory not found: ' + eventsPath);
            return;
        }

        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[EVENTS]')} Loading ${eventFiles.length} event files...`);

        let loadedCount = 0;

        for (const file of eventFiles) {
            try {
                const filePath = path.join(eventsPath, file);

                // Clear require cache to allow reloading
                delete require.cache[require.resolve(filePath)];

                const event = require(filePath);

                if (event && event.config) {
                    const eventName = event.config.name;

                    if (eventName) {
                        global.events.set(eventName, event);

                        // Execute onStart if it exists
                        if (typeof event.onStart === 'function') {
                            try {
                                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[STARTING]')} Initializing event: ${chalk.cyan(eventName)}`);
                                await event.onStart({ sock: global.sock });
                            } catch (startError) {
                                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('✗')} Error starting event ${eventName}: ${startError.message}`);
                                logError(`Error starting event ${eventName}: ${startError.message}`);
                            }
                        }

                        // Execute onLoad if it exists
                        if (typeof event.onLoad === 'function') {
                            try {
                                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[LOADING]')} Loading event: ${chalk.cyan(eventName)}`);
                                await event.onLoad({ sock: global.sock });
                            } catch (loadError) {
                                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('✗')} Error loading event ${eventName}: ${loadError.message}`);
                                logError(`Error loading event ${eventName}: ${loadError.message}`);
                            }
                        }

                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('✓')} Loaded event: ${chalk.cyan(eventName)}`);
                        loadedCount++;
                    } else {
                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('⚠')} Event ${file} missing name in config`);
                    }
                } else {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('⚠')} Event ${file} missing config object`);
                }
            } catch (error) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('✗')} Failed to load event ${file}: ${error.message}`);
                logError(`Failed to load event ${file}: ${error.message}`);
            }
        }

        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SUCCESS]')} Successfully loaded ${loadedCount}/${eventFiles.length} events`);
        logSuccess(`Successfully loaded ${global.events.size} events`);
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