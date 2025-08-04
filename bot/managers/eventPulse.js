const fs = require('fs');
const path = require('path');
const { logSuccess, logError } = require('../../utils/logger');
const { config } = require('../../config/globals');

class EventManager {
    constructor() {
        this.eventsFolder = path.resolve(__dirname, '../../scripts/events');
    }

    loadEvents() {
        if (!config.logEvents.enable) return;

        const eventFiles = fs.readdirSync(this.eventsFolder).filter(file => file.endsWith('.js'));
        eventFiles.forEach(file => {
            const event = require(path.join(this.eventsFolder, file));
            if (event.name && typeof event.event === 'function') {
                global.events.set(event.name, event);
                logSuccess(`Loaded event: ${event.name}`);
            }
        });
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
