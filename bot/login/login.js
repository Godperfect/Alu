const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const figlet = require('figlet'); 
const chalk = require('chalk'); 
const axios = require('axios');

let logInfo, logSuccess, logError;
try {
    const logger = require('../../../utils/logger');
    logInfo = logger.logInfo;
    logSuccess = logger.logSuccess;
    logError = logger.logError;
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
 * @returns {string} Formatted timestamp in HH:mm:ss format
 */
const getTimestamp = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

/**
 * Get formatted date
 * @returns {string} Formatted date in DD/MM/YYYY format
 */
const getFormattedDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
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
    const versionText = `         Luna Bot version ${version}`;
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
 * Check if user is authorized by checking GitHub auth.json
 * @param {string} phoneNumber - The phone number to check
 * @returns {Promise<boolean>} - Whether the user is authorized
 */
const checkGitHubAuthorization = async (phoneNumber) => {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/Godperfect/Shshwhw/refs/heads/main/auth.json');

        const authData = response.data;
        if (Array.isArray(authData) && authData.includes(phoneNumber)) {
            const { logGoatBotStyle } = require('../../utils/logger');
            logGoatBotStyle('auth', { type: 'success' });
            return true;
        } else {
            const { logGoatBotStyle } = require('../../utils/logger');
            logGoatBotStyle('auth', { type: 'unauthorized' });
            return false;
        }
    } catch (error) {
        logError(`GitHub authorization check failed: ${error.message}`);
        return false;
    }
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
        const sessionPath = config.whatsappAccount.sessionPath || './auth/session';
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

        if (!ptz.authState?.creds?.registered) {
            // Get phone number from config or prompt user
            let phoneNumber = config.whatsappAccount.phoneNumber;

            if (!phoneNumber) {
                console.log(chalk.cyan('📞 ENTER A NUMBER....'));
                phoneNumber = await question('> ');
            } else {
                console.log(chalk.cyan(`📞 PAIRING WITH NUMBER FOR CODE: ${phoneNumber}`));
            }

            // Clean the phone number
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            // Check GitHub authorization before proceeding
            const isAuthorized = await checkGitHubAuthorization(phoneNumber);
            if (!isAuthorized) {
                console.log(chalk.red(`[ ACCESS ]`) + chalk.gray(` [${getFormattedDate()}, ${getTimestamp()}] `) + chalk.white('Need access to the bot? Just reach out to the developer at +977 9863479066.'));
                process.exit(1); // Exit if unauthorized
            }

            try {
                // Request pairing code
                let code = await ptz.requestPairingCode(phoneNumber);

                // Format code with dashes for readability
                code = code?.match(/.{1,3}/g)?.join("-") || code;

                console.log(chalk.green('🔑 PAIRING CODE: ') + chalk.bold.white(code));

                // Wait for authentication
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (err) {
                logError(`Failed to get pairing code: ${err.message}`);
                throw err;
            }
        } else {
            // For already registered sessions, we still check auth
            let phoneNumber = config.whatsappAccount.phoneNumber;

            if (!phoneNumber) {
                console.log(chalk.cyan('📞 ENTER YOUR NUMBER:'));
                phoneNumber = await question('> ');
            } else {
                console.log(chalk.cyan(`📞 PAIRING WITH NUMBER FOR CODE: ${phoneNumber}`));
            }

            // Clean the phone number
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            // Check GitHub authorization
            const isAuthorized = await checkGitHubAuthorization(phoneNumber);
            if (!isAuthorized) {
                console.log(chalk.red(`[ ACCESS ]`) + chalk.gray(` [${getFormattedDate()}, ${getTimestamp()}] `) + chalk.white('Need access to the bot? Just reach out to the developer at +977 9863479066.'));
                process.exit(1); // Exit if unauthorized
            }

            // Show pairing code for existing sessions
            console.log(chalk.green('🔑 PAIRING CODE: ') + chalk.bold.white('AUTO-AUTHENTICATED'));
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