const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const figlet = require('figlet'); 
const chalk = require('chalk'); 


let logInfo, logSuccess, logError;
try {
    const utils = require('../../utils');
    logInfo = utils.logInfo;
    logSuccess = utils.logSuccess;
    logError = utils.logError;
} catch (error) { 
    logInfo = (msg) => console.log(chalk.blue(`[INFO] ${msg}`)); 
    logSuccess = (msg) => console.log(chalk.green(`[SUCCESS] ${msg}`));
    logError = (msg) => console.log(chalk.red(`[ERROR] ${msg}`));
}

let config;
try {
    config = require('../../config.json');
} catch (error) {
    config = {
        whatsappAccount: {
            phoneNumber: ''
        }
    };
    logInfo('No config.json found, will prompt for phone number');
}

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

// Generate ASCII art for "LUNA V 1" using figlet
const lunaAsciiArt = figlet.textSync('LUNA V 1', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default'
});

// Function to get version from package.json
function getVersion() {
    try {
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version || '1.0.0';
    } catch (error) {
        logInfo('Warning: Could not read package.json');
        return '1.0.0';
    }
}

// Track if title has been displayed to prevent duplicates
let titleDisplayed = false;

/**
 * Display the Luna Bot title and version info
 */
const displayLunaBotTitle = () => {
    // Only display once per session
    if (titleDisplayed) {
        return "─".repeat(42);
    }
    
    // Clear the console
    console.clear();

    // Print colorful title using chalk
    console.log(chalk.bold.magenta(lunaAsciiArt));

    // Print version and credit centered
    const version = getVersion();
    const versionText = `         Luna Bot v1 (${version})`;
    const creditText = "       Created by Mr perfect with 💗";

    console.log(chalk.cyan(versionText));
    console.log(chalk.blue(creditText));

    // Horizontal line
    const line = "─".repeat(42);
    console.log(chalk.yellow(line));

    titleDisplayed = true;
    return line;
};

// Ensure auth directory exists
const ensureAuthDirectory = () => {
    const sessionPath = config.whatsappAccount?.sessionPath || 'session';
    const authFilePath = config.whatsappAccount?.authFilePath || './session';
    
    if (!fs.existsSync(authFilePath)) {
        fs.mkdirSync(authFilePath, { recursive: true });
    }
    
    // Also ensure the old auth directory exists for compatibility
    const authDir = './auth';
    const sessionDir = './auth/session';
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir);
    }
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir);
    }
};

// Create readline interface for user input
const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};



/**
 * Get authentication state with error handling
 * @returns {Promise<{state: *, saveCreds: Function}>}
 */
const getAuthState = async () => {
    try {
        // Display Luna Bot title
        const line = displayLunaBotTitle();

        // Log phone number from config
        const phoneNumber = config.whatsappAccount?.phoneNumber;
        if (phoneNumber) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('LOGGING IN:')} ${chalk.green(phoneNumber)}`);
        }

        // Log session checking
        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('CHECKING SESSIONS................')}`);

        ensureAuthDirectory();
        
        // Use session path from config
        const sessionPath = config.whatsappAccount?.authFilePath || './session';
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        return { state, saveCreds, line };
    } catch (err) {
        logError(`Error getting auth state: ${err.message}`);
        throw new Error(`Authentication state error: ${err.message}`);
    }
};

// Track if session check has been performed to prevent duplicates
let sessionChecked = false;

/**
 * Check if session files exist and are valid
 * @returns {boolean} True if session files exist and are valid
 */
const checkSessionExists = () => {
    try {
        const sessionPath = config.whatsappAccount?.authFilePath || './session';
        const credsPath = path.join(sessionPath, 'creds.json');
        
        // Check if creds.json exists and is valid
        if (fs.existsSync(credsPath)) {
            const stats = fs.statSync(credsPath);
            if (stats.size > 0) {
                try {
                    // Try to parse the JSON to verify it's valid
                    const credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                    
                    // Check if it has essential properties (basic validation)
                    if (credsData && typeof credsData === 'object' && Object.keys(credsData).length > 0) {
                        if (!sessionChecked) {
                            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('Valid session found, using existing credentials...')}`);
                            sessionChecked = true;
                        }
                        return true;
                    } else {
                        if (!sessionChecked) {
                            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('Invalid session data found, proceeding with new login...')}`);
                            sessionChecked = true;
                        }
                        return false;
                    }
                } catch (parseError) {
                    if (!sessionChecked) {
                        console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('Corrupted session file found, proceeding with new login...')}`);
                        sessionChecked = true;
                    }
                    return false;
                }
            } else {
                if (!sessionChecked) {
                    console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('Empty session file found, proceeding with new login...')}`);
                    sessionChecked = true;
                }
                return false;
            }
        }
        
        if (!sessionChecked) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('No session files found, proceeding with new login...')}`);
            sessionChecked = true;
        }
        return false;
    } catch (error) {
        if (!sessionChecked) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('Session check failed, will try to create new session...')}`);
            sessionChecked = true;
        }
        return false;
    }
};

// Track if authentication is in progress
let authInProgress = false;

/**
 * Authenticate session using phone number and pairing code
 * @param {object} ptz - WhatsApp socket connection
 * @returns {Promise<void>}
 */
const authenticateSession = async (ptz) => {
    try {
        // Prevent multiple authentication attempts
        if (authInProgress) {
            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('Authentication already in progress, skipping...')}`);
            return;
        }

        authInProgress = true;

        // Wait for connection to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get line from getAuthState if available
        const line = ptz.line;

        // Check if session exists first
        const sessionExists = checkSessionExists();

        // Only request pairing code if no valid session exists and auto auth is not prevented
        if (!sessionExists && !config.whatsappAccount?.preventAutoAuth) {
            // Get phone number from config or prompt user
            let phoneNumber = config.whatsappAccount.phoneNumber;

            if (!phoneNumber) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('Enter your phone number:')}`);
                phoneNumber = await question('> ');
            } else {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('PHONE NUMBER:')} ${chalk.green(phoneNumber)}`);
            }

            // Clean the phone number
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            try {
                // Request pairing code
                let code = await ptz.requestPairingCode(phoneNumber);

                // Format code with dashes for readability
                code = code?.match(/.{1,3}/g)?.join("-") || code;

                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('PAIRING CODE:')} ${chalk.green(code)}`);
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.blue('Please enter this code in your WhatsApp mobile app')}`);

                // Set up connection update listener to detect when user is linked
                ptz.ev.on('connection.update', (update) => {
                    const { connection, lastDisconnect } = update;
                    if (connection === 'open') {
                        // Print login success message when connected
                        if (line) {
                            console.log(chalk.yellow(line));
                            console.log(chalk.green('              LOGIN SUCCESSFUL'));
                            console.log(chalk.yellow(line));
                        } else {
                            console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('LOGIN SUCCESSFUL')}`);
                        }
                    }
                });

                // Wait for authentication
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (err) {
                logError(`Failed to get pairing code: ${err.message}`);
                throw err;
            }
        } else {
            
            
            if (line) {
                console.log(chalk.yellow(line));
                console.log(chalk.green('              LOGIN SUCCESSFUL'));
                console.log(chalk.yellow(line));
            } else {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.green('LOGIN SUCCESSFUL')}`);
            }
        }
    } catch (err) {
        logError(`Authentication error: ${err.message}`);
        throw err;
    } finally {
        // Reset authentication progress flag
        authInProgress = false;
    }
};

module.exports = {
    getAuthState,
    authenticateSession,
    displayLunaBotTitle,
    getTimestamp,
    getFormattedDate,
    checkSessionExists
};