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
        const eventsPath = path.join(__dirname, '../../scripts/events');

        try {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[EVENT_MANAGER]')} Loading events from: ${eventsPath}`);
            logInfo(`Loading events from: ${eventsPath}`);

            if (!fs.existsSync(eventsPath)) {
                logWarning(`Events directory does not exist: ${eventsPath}`);
                return;
            }

            const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

            if (eventFiles.length === 0) {
                logWarning('No event files found in events directory');
                return;
            }

            let loadedCount = 0;

            for (const file of eventFiles) {
                try {
                    const eventPath = path.join(eventsPath, file);

                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('[LOADING_EVENT]')} Processing event file: ${file}`);

                    // Clear require cache to allow reloading
                    delete require.cache[require.resolve(eventPath)];

                    const event = require(eventPath);

                    if (event && event.config && event.config.name) {
                        // Store the event
                        this.events.set(event.config.name, event);

                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[EVENT_STORED]')} Event ${event.config.name} stored in manager`);

                        // Wait for global.sock to be available
                        const waitForSock = () => {
                            if (global.sock) {
                                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[SOCK_AVAILABLE]')} Socket available for event: ${event.config.name}`);

                                // Execute onStart if it exists
                                if (typeof event.onStart === 'function') {
                                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[EXECUTING_ONSTART]')} Running onStart for: ${event.config.name}`);
                                    event.onStart({ sock: global.sock });
                                }

                                // Execute onLoad if it exists
                                if (typeof event.onLoad === 'function') {
                                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.cyan('[EXECUTING_ONLOAD]')} Running onLoad for: ${event.config.name}`);
                                    event.onLoad({ sock: global.sock });
                                }
                            } else {
                                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[WAITING_SOCK]')} Waiting for socket to be available for: ${event.config.name}`);
                                setTimeout(waitForSock, 100);
                            }
                        };

                        waitForSock();

                        logSuccess(`Loaded event: ${event.config.name}`);
                        loadedCount++;
                    } else {
                        logWarning(`Invalid event file: ${file} - Missing config or name`);
                    }
                } catch (error) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[EVENT_LOAD_ERROR]')} Failed to load ${file}: ${error.message}`);
                    logError(`Failed to load event ${file}: ${error.message}`);
                }
            }

            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[EVENTS_LOADED]')} Successfully loaded ${loadedCount} events`);
            logSuccess(`Successfully loaded ${loadedCount} events`);
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('[STATUS]')} Events are now active and listening 24/7`);
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('[NOTIFICATIONS]')} Bot will now send real-time notifications to WhatsApp groups`);
            console.log('─────────────────────────────────────────');

        } catch (error) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.red('[EVENT_MANAGER_ERROR]')} Error loading events: ${error.message}`);
            logError(`Error loading events: ${error.message}`);
        }
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
}

module.exports = EventManager;