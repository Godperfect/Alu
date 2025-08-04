const fs = require('fs');
const path = require('path');
const { logSuccess, logError } = require('../../utils/logger');
const { config } = require('../../config/globals');

class EventManager {
    constructor() {
        this.eventsFolder = path.resolve(__dirname, '../../scripts/events');
    }

    async loadEvents() {
        const eventsPath = path.join(__dirname, '../../scripts/events');

        if (!fs.existsSync(eventsPath)) {
            logError('Events directory not found');
            return;
        }

        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
        let loadedCount = 0;
        const failedEvents = [];

        for (const file of eventFiles) {
            try {
                delete require.cache[require.resolve(path.join(eventsPath, file))];
                const event = require(path.join(eventsPath, file));

                if (this.validateEvent(event)) {
                    this.events.set(event.config.name, event);
                    loadedCount++;

                    logGoatBotStyle('event_load', {
                        name: event.config.name
                    });
                } else {
                    logError(`Invalid event file: ${file}`);
                    failedEvents.push(file);
                }
            } catch (error) {
                if (error.code === 'MODULE_NOT_FOUND') {
                    const missingModule = error.message.match(/Cannot find module '([^']+)'/)?.[1];
                    if (missingModule && !missingModule.startsWith('.')) {
                        logInfo(`Installing missing dependency for event: ${missingModule}`);
                        try {
                            const { execSync } = require('child_process');
                            execSync(`npm install ${missingModule}`, { stdio: 'inherit' });

                            // Retry loading the event
                            delete require.cache[require.resolve(path.join(eventsPath, file))];
                            const event = require(path.join(eventsPath, file));

                            if (this.validateEvent(event)) {
                                this.events.set(event.config.name, event);
                                loadedCount++;

                                logGoatBotStyle('event_load', {
                                    name: event.config.name
                                });
                            }
                        } catch (installError) {
                            logError(`Failed to install ${missingModule}: ${installError.message}`);
                            failedEvents.push(file);
                        }
                    } else {
                        logError(`Error loading event ${file}: ${error.message}`);
                        failedEvents.push(file);
                    }
                } else {
                    logError(`Error loading event ${file}: ${error.message}`);
                    failedEvents.push(file);
                }
            }
        }

        logSuccess(`Loaded ${loadedCount} events`);
        if (failedEvents.length > 0) {
            logWarning(`Failed to load ${failedEvents.length} events: ${failedEvents.join(', ')}`);
        }
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