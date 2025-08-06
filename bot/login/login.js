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

/**
 * Display the Luna Bot title and version info
 */
const displayLunaBotTitle = () => {
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

/**
 * Authenticate session using phone number and pairing code
 * @param {object} ptz - WhatsApp socket connection
 * @returns {Promise<void>}
 */
const authenticateSession = async (ptz) => {
    try {
        // Wait for connection to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get line from getAuthState if available
        const line = ptz.line;

        if (!ptz.authState?.creds?.registered) {
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
            // For already registered sessions, we still check auth
            // Get phone number from config or prompt user
            let phoneNumber = config.whatsappAccount.phoneNumber;

            if (!phoneNumber) {
                console.log(`${getTimestamp()} ${getFormattedDate()} ${chalk.yellow('Enter your phone number for verification:')}`);
                phoneNumber = await question('> ');
            }

            // Clean the phone number
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            // Already registered and authorized, show login success message
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
    }
};

module.exports = {
    getAuthState,
    authenticateSession,
    displayLunaBotTitle,
    getTimestamp,
    getFormattedDate
};