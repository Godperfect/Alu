const fs = require('fs');
const path = require('path');
const { logSuccess, logError, logInfo } = require('../../utils');
const { config } = require('../../config/globals');

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
                const event = require(eventPath);

                if (event && event.config && event.config.name) {
                    global.events.set(event.config.name, event);
                    logSuccess(`Loaded event: ${event.config.name}`);
                    totalEvents++;
                } else {
                    logError(`Invalid event structure in file: ${file}`);
                    failedEvents++;
                }

                // Clear the require cache for hot reloading
                delete require.cache[require.resolve(eventPath)];

            } catch (err) {
                logError(`Failed to load event from ${file}: ${err.message}`);
                failedEvents++;
            }
        });

        if (failedEvents > 0) {
            logError(`Failed to load ${failedEvents} events`);
        }
        logSuccess(`Successfully loaded ${totalEvents} events ${failedEvents > 0 ? `(${failedEvents} failed)` : ''}`);
        console.log('─────────────────────────────────────────');
    }

    handleEvents({ sock, m = null, sender }) {
        if (!config.logEvents.enable) return;

        if (!m) {
            logError("handleEvents called but 'm' is undefined or null!");
            return; 
        }

        global.events.forEach(event => {
            try {
                event.event({ sock, m, sender });
            } catch (error) {
                if (config.logEvents.logErrors) {
                    logError(`Error in event ${event.name}: ${error.message}`);
                }
            }
        });
    }
}

module.exports = EventManager;