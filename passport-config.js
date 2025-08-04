
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { logInfo, logError } = require('./utils');
const db = require('./connectDB');

function initialize(passport) {
    const authenticateUser = async (username, password, done) => {
        try {
            // For bot admin authentication
            const adminUser = await db.getBotSetting('admin_credentials');
            
            if (adminUser) {
                const credentials = JSON.parse(adminUser);
                
                if (username === credentials.username) {
                    const isValid = await bcrypt.compare(password, credentials.password);
                    
                    if (isValid) {
                        logInfo(`Admin login successful: ${username}`);
                        return done(null, {
                            id: 1,
                            username: credentials.username,
                            role: 'admin',
                            loginTime: new Date()
                        });
                    }
                }
            }
            
            logError(`Failed login attempt: ${username}`);
            return done(null, false, { message: 'Invalid credentials' });
        } catch (error) {
            logError(`Authentication error: ${error.message}`);
            return done(error);
        }
    };

    const getUserById = async (id, done) => {
        try {
            if (id === 1) {
                const adminUser = await db.getBotSetting('admin_credentials');
                if (adminUser) {
                    const credentials = JSON.parse(adminUser);
                    return done(null, {
                        id: 1,
                        username: credentials.username,
                        role: 'admin'
                    });
                }
            }
            return done(null, false);
        } catch (error) {
            logError(`Get user by ID error: ${error.message}`);
            return done(error);
        }
    };

    passport.use(new LocalStrategy({
        usernameField: 'username',
        passwordField: 'password'
    }, authenticateUser));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser((id, done) => {
        getUserById(id, done);
    });
}

// Helper function to create admin credentials
async function createAdminCredentials(username, password) {
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const credentials = {
            username,
            password: hashedPassword,
            createdAt: new Date(),
            role: 'admin'
        };
        
        await db.saveBotSetting('admin_credentials', JSON.stringify(credentials));
        logInfo(`Admin credentials created for: ${username}`);
        return true;
    } catch (error) {
        logError(`Failed to create admin credentials: ${error.message}`);
        return false;
    }
}

// Middleware to check if user is authenticated
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Middleware to check if user is not authenticated
function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    next();
}

// Middleware to check admin role
function checkAdminRole(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    res.status(403).json({
        success: false,
        error: 'Admin access required'
    });
}

module.exports = {
    initialize,
    createAdminCredentials,
    checkAuthenticated,
    checkNotAuthenticated,
    checkAdminRole
};
