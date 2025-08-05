const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs-extra");
const os = require("os");
const { logInfo, logWarn, logError } = require("../utils");
const config = require("../config.json");
const db = require("./connectDB");
const OTPService = require('../libs/otpService');
// Auth middleware
const requireAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const authTokens = global.GoatBot.authTokens || new Map();
    const tokenData = authTokens.get(token);

    if (!tokenData) {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (Date.now() > tokenData.expiryTime) {
      authTokens.delete(token);
      return res.status(401).json({ error: "Token expired" });
    }

    // Token is valid, proceed
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: "Authentication error" });
  }
};

let app;
let server;

function invalidateSessionAndRestart() {
  global.GoatBot.sessionValid = false;
  global.GoatBot.authMethod = null;
  global.GoatBot.connectionStatus = "awaiting-login";
  logWarn("🔄 Session invalidated by request – restarting auth flow…");
  process.exit(2);
}

function initializeApp() {
  if (app) return app;
  app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(__dirname));

  // Request OTP endpoint
  app.post("/api/auth/request-otp", async (req, res) => {
    try {
      if (!global.sock || !global.botConnected) {
        return res
          .status(503)
          .json({ error: "Bot is not connected to WhatsApp" });
      }

      const otpService = new OTPService();
      const otp = otpService.generateOTP("dashboard_login");

      const adminIds = config.adminOnly?.adminNumbers || [];
      const sendResults = [];
      const message = `🔐 Dashboard Login Request\n\nOTP: ${otp}\n\nThis OTP will expire in 5 minutes.\n\nSomeone is trying to access the dashboard. If this wasn't you, please ignore this message.`;

      for (const adminId of adminIds) {
        try {
          await global.sock.sendMessage(adminId + "@s.whatsapp.net", { text: message });
          sendResults.push({ id: adminId, success: true });
        } catch (sendError) {
          console.error(`Error sending OTP to ${adminId}:`, sendError);
          sendResults.push({ id: adminId, success: false, error: sendError.message });
        }
      }

      const result = {
        expiryTime: Date.now() + 5 * 60 * 1000,
        sendResults: sendResults
      };

      res.json({
        success: true,
        message: "OTP sent to admin(s)",
        expiryTime: result.expiryTime,
        sendResults: result.sendResults,
      });
    } catch (error) {
      console.error("Error generating OTP:", error);
      res.status(500).json({ error: "Failed to generate OTP" });
    }
  });

  // Verify OTP and login endpoint
  app.post("/api/auth/verify-otp", (req, res) => {
    try {
      const { otp } = req.body;

      if (!otp) {
        return res.status(400).json({ error: "OTP is required" });
      }

      const otpService = new OTPService();
      const verification = otpService.verifyOTP("dashboard_login", otp);

      if (verification.success) {
        // Create a proper auth token for consistent authentication
        const token = require("crypto").randomBytes(32).toString("hex");
        const expiryTime = Date.now() + 24 * 60 * 60 * 1000;

        global.GoatBot.authTokens = global.GoatBot.authTokens || new Map();
        global.GoatBot.authTokens.set(token, {
          createdAt: Date.now(),
          expiryTime,
          method: "otp"
        });

        res.json({
          success: true,
          token,
          expiryTime,
          message: "Login successful",
        });
      } else {
        res.status(401).json({ error: verification.error });
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });

  // Legacy password login endpoint
  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;

    if (password === (config.dashboard?.adminPassword || "lunabot")) {
      const token = require("crypto").randomBytes(32).toString("hex");
      const expiryTime = Date.now() + 24 * 60 * 60 * 1000;

      global.GoatBot.authTokens = global.GoatBot.authTokens || new Map();
      global.GoatBot.authTokens.set(token, {
        createdAt: Date.now(),
        expiryTime,
        method: "password"
      });

      res.json({
        success: true,
        token,
        expiryTime,
        message: "Login successful"
      });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });

  // Get OTP status endpoint
  app.get("/api/auth/otp-status", (req, res) => {
    try {
      const otpService = new OTPService();
      const status = {
        exists: otpService.isOTPValid("dashboard_login"),
        timeLeft: otpService.otpStore.get("dashboard_login")?.expiry ?
          Math.max(0, otpService.otpStore.get("dashboard_login").expiry - Date.now()) : 0
      };
      res.json(status);
    } catch (error) {
      console.error("Error getting OTP status:", error);
      res.status(500).json({ error: "Failed to get OTP status" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    const sessionId = req.headers["x-session-id"] || req.query.sessionId;
    if (sessionId) {
      dashboardSessions.delete(sessionId);
    }
    res.json({ success: true });
  });

  // Check session endpoint
  app.get("/api/auth/check", (req, res) => {
    const sessionId = req.headers["x-session-id"] || req.query.sessionId;
    const valid = sessionId && isValidSession(sessionId);
    res.json({ valid });
  });

  // Token-based authentication endpoints
  app.post("/api/auth/request-otp", async (req, res) => {
    try {
      if (!global.sock || !global.botConnected) {
        return res.status(503).json({
          success: false,
          message: "Bot is not connected to WhatsApp",
        });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiryTime = Date.now() + 5 * 60 * 1000;

      global.GoatBot.dashboardOTP = { otp, expiryTime, attempts: 0 };

      const adminIds = config.admins || [];
      const sendResults = [];

      const message = `🔐 Dashboard Login Request\n\nOTP: ${otp}\n\nThis OTP will expire in 5 minutes.\n\nSomeone is trying to access the dashboard. If this wasn't you, please ignore this message.`;

      for (const adminId of adminIds) {
        try {
          await global.sock.sendMessage(adminId, { text: message });
          sendResults.push({ id: adminId, success: true });
        } catch (sendError) {
          console.error(`Error sending OTP to ${adminId}:`, sendError);
          sendResults.push({
            id: adminId,
            success: false,
            error: sendError.message,
          });
        }
      }

      const successCount = sendResults.filter((r) => r.success).length;

      if (successCount > 0) {
        res.json({
          success: true,
          message: `OTP sent to ${successCount} admin(s)`,
          expiryTime,
          sendResults,
        });
      } else {
        res
          .status(500)
          .json({ success: false, message: "Failed to send OTP to any admin" });
      }
    } catch (error) {
      console.error("Error in request-otp:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  });

  // Password login endpoint
  app.post("/api/auth/login-password", (req, res) => {
    try {
      const { password } = req.body;

      if (!password) {
        return res
          .status(400)
          .json({ success: false, message: "Password is required" });
      }

      if (password !== (config.dashboard?.adminPassword || "lunabot")) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid password" });
      }

      const token = require("crypto").randomBytes(32).toString("hex");
      const expiryTime = Date.now() + 24 * 60 * 60 * 1000;

      global.GoatBot.authTokens = global.GoatBot.authTokens || new Map();
      global.GoatBot.authTokens.set(token, {
        createdAt: Date.now(),
        expiryTime,
        method: "password",
      });

      res.json({
        success: true,
        token,
        expiryTime,
        message: "Login successful",
      });
    } catch (error) {
      console.error("Error in login-password:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  });

  // The first OTP verification handler is used instead

  app.get("/api/auth/verify", (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");

      if (!token) return res.json({ valid: false });

      const authTokens = global.GoatBot.authTokens || new Map();
      const tokenData = authTokens.get(token);
      if (!tokenData) return res.json({ valid: false });

      if (Date.now() > tokenData.expiryTime) {
        authTokens.delete(token);
        return res.json({ valid: false });
      }

      res.json({ valid: true });
    } catch (error) {
      console.error("Error in verify token:", error);
      res.json({ valid: false });
    }
  });

  app.post("/api/whatsapp/auth/request-code", requireAuth, async (req, res) => {
    try {
      if (global.GoatBot.isConnected) {
        return res.json({
          success: false,
          message: "Bot is already connected to WhatsApp",
        });
      }

      await global.GoatBot.startAuthentication();

      res.json({
        success: true,
        message:
          "WhatsApp authentication started. Please scan the QR code or enter the pairing code.",
        qrCode: global.GoatBot.qrCode || null,
        pairingCode: global.GoatBot.pairingCode || null,
      });
    } catch (error) {
      console.error("Error starting WhatsApp auth:", error);
      res.status(500).json({
        success: false,
        message: "Failed to start WhatsApp authentication",
      });
    }
  });

  app.get("/api/whatsapp/auth/status", requireAuth, (req, res) => {
    try {
      res.json({
        connected: global.GoatBot.isConnected || false,
        connectionStatus: global.GoatBot.connectionStatus || "disconnected",
        qrCode: global.GoatBot.qrCode || null,
        pairingCode: global.GoatBot.pairingCode || null,
        lastError: global.GoatBot.lastError || null,
      });
    } catch (error) {
      console.error("Error getting WhatsApp auth status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get WhatsApp authentication status",
      });
    }
  });

  app.post("/api/whatsapp/auth/disconnect", requireAuth, async (req, res) => {
    try {
      if (global.GoatBot.sock) {
        await global.GoatBot.sock.logout();
      }

      global.GoatBot.isConnected = false;
      global.GoatBot.connectionStatus = "disconnected";

      res.json({ success: true, message: "Disconnected from WhatsApp" });
    } catch (error) {
      console.error("Error disconnecting from WhatsApp:", error);
      res.status(500).json({
        success: false,
        message: "Failed to disconnect from WhatsApp",
      });
    }
  });

  app.post("/api/whatsapp/auth/restart", requireAuth, async (req, res) => {
    try {
      logInfo("🔄 Restarting WhatsApp authentication...");

      const sessionPath = path.join(__dirname, "..", "session");
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      if (global.GoatBot.sock) {
        global.GoatBot.sock.end();
      }

      global.GoatBot.isConnected = false;
      global.GoatBot.connectionStatus = "disconnected";
      global.GoatBot.qrCode = null;
      global.GoatBot.waitingForAuth = true;

      setTimeout(async () => {
        try {
          await connect.connect({ method: "qr" });
        } catch (error) {
          logError("Error starting new authentication:", error);
        }
      }, 2000);

      res.json({
        success: true,
        message:
          "WhatsApp authentication restarted. Please check the authentication tab for QR code.",
      });
    } catch (error) {
      console.error("Error restarting WhatsApp auth:", error);
      res.status(500).json({
        success: false,
        message: "Failed to restart WhatsApp authentication",
      });
    }
  });

  app.get("/api/status/basic", (req, res) => {
    try {
      res.json({
        status: global.GoatBot.connectionStatus,
        isConnected: global.GoatBot.isConnected,
        uptime: Date.now() - global.GoatBot.startTime,
        initialized: global.GoatBot.initialized,
        botName: global.GoatBot.user?.name || config.botName || "GoatBot",
        authRequired: true,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/status", requireAuth, async (req, res) => {
    try {
      const dbStats = await db.getStats();
      const uptime = Date.now() - global.GoatBot.startTime;

      res.json({
        status: global.GoatBot.connectionStatus,
        isConnected: global.GoatBot.isConnected,
        uptime,
        uptimeFormatted: formatUptime(uptime),
        stats: global.GoatBot.stats,
        commands: Array.from(global.GoatBot.commands.keys()),
        events: Array.from(global.GoatBot.events.keys()),
        authMethod: global.GoatBot.authMethod,
        sessionValid: global.GoatBot.sessionValid,
        initialized: global.GoatBot.initialized,
        botInfo: {
          name: global.GoatBot.user?.name || config.botName || "Luna Bot v1",
          number: global.GoatBot.user?.id?.split(":")[0] || "Not available",
          prefix: config.prefix,
          version: require("../package.json").version,
        },
        database: { type: config.database.type, stats: dbStats },
        system: {
          platform: process.platform,
          nodeVersion: process.version,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/commands", requireAuth, (req, res) => {
    try {
      let commands = [];

      if (global.commands && global.commands.size > 0) {
        commands = Array.from(global.commands.entries()).map(
          ([name, cmd]) => ({
            name,
            description:
              cmd.config?.description ||
              cmd.description ||
              "No description available",
            aliases: cmd.config?.aliases || cmd.aliases || [],
            category: cmd.config?.category || cmd.category || "general",
            permissions: cmd.config?.permissions || cmd.permissions || [],
            cooldown: cmd.config?.cooldown || cmd.cooldown || 0,
            usage: cmd.config?.usage || cmd.usage || `${global.prefix || '+'}${name}`,
            guide: cmd.config?.guide || cmd.guide || "No guide available",
            role: cmd.config?.role || cmd.role || 0,
          })
        );
      } else {
        // Fallback to reading from file system
        const commandFiles = fs
          .readdirSync(path.join("scripts", "cmds"))
          .filter((f) => f.endsWith(".js"));
        for (const file of commandFiles) {
          try {
            const command = require(path.join(
              "..",
              "scripts",
              "cmds",
              file
            ));
            commands.push({
              name: command.config?.name || file.replace(".js", ""),
              description:
                command.config?.description || "No description available",
              aliases: command.config?.aliases || [],
              category: command.config?.category || "General",
              role: command.config?.role || 0,
              usage: command.config?.usage || `${global.prefix || '+'}${command.config?.name || file.replace(".js", "")}`,
              guide: command.config?.guide || "No guide available",
              cooldown: command.config?.cooldown || 0,
            });
          } catch (error) {
            logError(`Error loading command ${file}:`, error);
          }
        }
      }

      res.json({ total: commands.length, commands });
    } catch (error) {
      logError("Error fetching commands:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events", requireAuth, (req, res) => {
    try {
      let events = [];

      if (global.GoatBot?.events) {
        events = Array.from(global.GoatBot.events.entries()).map(
          ([name, event]) => ({
            name,
            description:
              event.config?.description ||
              event.description ||
              "No description available",
            type: event.config?.type || event.type || "message",
          })
        );
      } else {
        // Fallback to reading from file system
        const eventFiles = fs
          .readdirSync(path.join("scripts", "events"))
          .filter((f) => f.endsWith(".js"));
        for (const file of eventFiles) {
          try {
            const event = require(path.join(
              "..",
              "scripts",
              "events",
              file
            ));
            events.push({
              name: event.config?.name || file.replace(".js", ""),
              description:
                event.config?.description || "No description available",
              type: event.config?.type || "message",
            });
          } catch (error) {
            logError(`Error loading event ${file}:`, error);
          }
        }
      }

      res.json(events);
    } catch (error) {
      logError("Error fetching events:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/logs", requireAuth, (req, res) => {
    try {
      const logs = global.GoatBot.logs || [];
      const recentLogs = logs.slice(-100);
      res.json({ logs: recentLogs });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users", requireAuth, async (req, res) => {
    try {
        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 5000)
        );

        const getUsersPromise = (async () => {
            const users = await db.getAllUsers();
            const userCount = await db.getUserCount();

            // Filter and validate users
            const validUsers = users ? users.filter(u => {
                // Check if phoneNumber exists and is valid
                if (!u.phoneNumber) return false;

                // Allow both numeric phone numbers and lid format
                const phoneStr = String(u.phoneNumber);
                return /^\d{10,15}$/.test(phoneStr) || phoneStr.includes('lid');
            }).map(u => ({
                ...u,
                id: u.phoneNumber,
                name: u.name || u.userName || 'Unknown',
                exp: u.exp || 0,
                level: u.level || 1,
                banned: u.isBanned || false,
                role: u.isAdmin ? 2 : 0,
                messageCount: u.messageCount || 0,
                lastSeen: u.lastSeen || new Date().toISOString()
            })) : [];

            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            return {
                success: true,
                users: validUsers.slice(0, 50), // Limit to 50 users for performance
                total: userCount || validUsers.length,
                active: validUsers.filter(u => {
                    try {
                        return new Date(u.lastSeen) > oneDayAgo;
                    } catch {
                        return false;
                    }
                }).length
            };
        })();

        const result = await Promise.race([getUsersPromise, timeoutPromise]);
        res.json(result);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.json({ 
            success: false, 
            error: 'Failed to fetch users',
            users: [],
            total: 0,
            active: 0
        });
    }
});

  app.get("/api/groups", requireAuth, async (req, res) => {
    try {
        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 5000)
        );

        const getGroupsPromise = (async () => {
            const groups = await db.getAllGroups();
            const groupCount = await db.getGroupCount();

            // Filter and validate groups
            const validGroups = groups ? groups.filter(g => 
                g.groupId && g.groupId.endsWith('@g.us')
            ).map(g => ({
                ...g,
                id: g.groupId,
                name: g.groupName || g.name || 'Unknown Group',
                memberCount: g.memberCount || g.participantCount || 0,
                messageCount: g.messageCount || 0,
                isActive: g.isActive !== false, // Default to true if not specified
                lastActivity: g.lastActivity || new Date().toISOString()
            })) : [];

            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            return {
                success: true,
                groups: validGroups.slice(0, 50), // Limit to 50 groups for performance
                total: groupCount || validGroups.length,
                active: validGroups.filter(g => {
                    try {
                        return new Date(g.lastActivity) > oneWeekAgo;
                    } catch {
                        return false;
                    }
                }).length
            };
        })();

        const result = await Promise.race([getGroupsPromise, timeoutPromise]);
        res.json(result);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.json({ 
            success: false, 
            error: 'Failed to fetch groups',
            groups: [],
            total: 0,
            active: 0
        });
    }
});

  app.get("/api/system", (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const authTokens = global.GoatBot.authTokens || new Map();
      const tokenData = authTokens.get(token);

      if (!tokenData || Date.now() > tokenData.expiryTime) {
        if (tokenData) authTokens.delete(token);
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      res.json({
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
        },
        cpu: { user: cpuUsage.user, system: cpuUsage.system },
        uptime: process.uptime(),
        platform: process.platform,
        architecture: os.arch(),
        nodeVersion: process.version,
        pid: process.pid,
        loadAverage: os.loadavg(),
      });
    } catch (error) {
      console.error('System endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/bot/info", requireAuth, async (req, res) => {
    try {
      // Read package.json for real version and name info
      const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
      
      const formatUptime = (seconds) => {
        const days = Math.floor(seconds / (24 * 3600));
        const hours = Math.floor((seconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
        if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
      };

      const getCommandCount = () => {
        try {
          const commandFiles = fs
            .readdirSync(path.join(__dirname, '..', 'scripts', 'cmds'))
            .filter((f) => f.endsWith('.js'));
          return commandFiles.length;
        } catch (error) {
          return 0;
        }
      };

      const getEventCount = () => {
        try {
          const eventFiles = fs
            .readdirSync(path.join(__dirname, '..', 'scripts', 'events'))
            .filter((f) => f.endsWith('.js'));
          return eventFiles.length;
        } catch (error) {
          return 0;
        }
      };

      const getAdminCount = async () => {
        try {
          const adminNumbers = config.adminOnly?.adminNumbers || [];
          return adminNumbers.length;
        } catch (error) {
          return 0;
        }
      };

      const botInfo = {
        name: config.botSettings?.botName || packageJson.name || 'Luna Bot v1',
        version: packageJson.version || '1.0.0',
        status: global.botConnected ? 'Online' : 'Offline',
        uptime: formatUptime(process.uptime()),
        commandsLoaded: getCommandCount(),
        eventsLoaded: getEventCount(),
        lastRestart: new Date(global.GoatBot?.startTime || Date.now()).toLocaleString(),
        adminUsers: await getAdminCount(),
        prefix: config.botSettings?.prefix || '+',
        language: config.botSettings?.language || 'en',
        timeZone: config.botSettings?.timeZone || 'UTC',
        phoneNumber: config.whatsappAccount?.phoneNumber || 'Not configured',
        database: config.database?.type || 'sqlite',
        autoRestart: config.autoRestart?.enable || falseecs}s`;
      };

      const getCommandCount = () => {
        try {
          const commandFiles = fs
            .readdirSync(path.join("plugins", "commands"))
            .filter((f) => f.endsWith(".js"));
          return commandFiles.length;
        } catch (error) {
          return 0;
        }
      };

      const getEventCount = () => {
        try {
          const eventFiles = fs
            .readdirSync(path.join("plugins", "events"))
            .filter((f) => f.endsWith(".js"));
          return eventFiles.length;
        } catch (error) {
          return 0;
        }
      };

      const getAdminCount = async () => {
        try {
          const users = await db.getAllUsers();
          const userArray = Array.isArray(users)
            ? users
            : Object.values(users || {});
          return userArray.filter((user) => user && user.role >= 2).length;
        } catch (error) {
          return 0;
        }
      };

      const botInfo = {
        name: "Luna Bot v1",
        version: "1.0.0",
        status: "Online",
        uptime: formatUptime(process.uptime()),
        commandsLoaded: global.commands?.size || 0,
        eventsLoaded: getEventCount(),
        lastRestart: global.GoatBot?.startTime || new Date().toISOString(),
        adminUsers: await getAdminCount(),
      };
      res.json(botInfo);
    } catch (error) {
      console.error("Error fetching bot info:", error);
      res.status(500).json({ error: error.message });
    }
  }); });
    }
  });

  app.get("/api/analytics", requireAuth, async (req, res) => {
    try {
      const stats = global.GoatBot?.stats || {};
      const uptime = Date.now() - (global.GoatBot?.startTime || Date.now());

      // Initialize default values
      let userArray = [];
      let threadArray = [];

      try {
        const users = await db.getAllUsers();
        userArray = Array.isArray(users) ? users : Object.values(users || {});
      } catch (dbError) {
        console.error("Error fetching users for analytics:", dbError);
      }

      try {
        const threads = await db.getAllThreads();
        threadArray = Array.isArray(threads) ? threads : Object.values(threads || {});
      } catch (dbError) {
        console.error("Error fetching threads for analytics:", dbError);
      }

      const analytics = {
        overview: {
          totalUsers: userArray.length,
          activeUsers: userArray.filter(
            (user) =>
              user &&
              user.lastActive &&
              Date.now() - user.lastActive < 7 * 24 * 60 * 60 * 1000
          ).length,
          totalGroups: threadArray.length,
          activeGroups: threadArray.filter(
            (thread) =>
              thread &&
              thread.lastActive &&
              Date.now() - thread.lastActive < 7 * 24 * 60 * 60 * 1000
          ).length,
          totalMessages: stats.totalMessages || 0,
          commandsExecuted: stats.commandsExecuted || 0,
          uptime,
        },
        messagesToday: stats.messagesToday || 0,
        commandsUsed: stats.commandsUsed || 0,
        activeSessions: (global.GoatBot?.authTokens?.size || 0),
        topCommands: stats.topCommands || [],
        userGrowth: {
          daily: stats.dailyUserGrowth || 0,
          weekly: stats.weeklyUserGrowth || 0,
          monthly: stats.monthlyUserGrowth || 0,
        },
        messageStats: {
          textMessages: stats.textMessages || 0,
          mediaMessages: stats.mediaMessages || 0,
          stickerMessages: stats.stickerMessages || 0,
        },
      };
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: error.message || "Failed to fetch analytics" });
    }
  });

  app.get("/api/settings", requireAuth, (req, res) => {
    try {
      const settings = {
        botName: config.botName || "Goat Bot",
        prefix: config.prefix || ".",
        adminOnly: config.adminOnly || false,
        autoRestart: config.autoRestart || false,
        logLevel: config.logLevel || "info",
        database: {
          type: config.database.type || "json",
          connected: global.GoatBot.databaseConnected || false,
        },
        dashboard: {
          enabled: config.dashboard.enabled || true,
          port: config.dashboard.port || 3000,
          sessionTimeout: config.dashboard.sessionTimeout || 1800000,
        },
        features: {
          antiSpam: config.features?.antiSpam || false,
          autoReply: config.features?.autoReply || false,
          welcome: config.features?.welcome || true,
          antiLink: config.features?.antiLink || false,
        },
        permissions: {
          adminNumbers: config.dashboard.adminNumbers || [],
          allowedGroups: config.allowedGroups || [],
          bannedUsers: config.bannedUsers || [],
        },
      };
      res.json(settings);
    } catch (error) {
      logError("Error fetching settings:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/overview", requireAuth, async (req, res) => {
    try {
      const stats = global.GoatBot?.stats || {};
      const uptime = Date.now() - (global.GoatBot?.startTime || Date.now());

      // Initialize stats if they don't exist
      if (!global.GoatBot.stats) {
        global.GoatBot.stats = {
          totalMessages: 0,
          messagesToday: 0,
          commandsUsed: 0,
          commandsExecuted: 0,
          errors: 0,
          successRate: 100,
          topCommands: [],
          daily: 0
        };
      }

      const overview = {
        totalMessages: stats.totalMessages || 0,
        messagesToday: stats.messagesToday || 0,
        commandsUsed: stats.commandsUsed || 0,
        activeSessions: (global.GoatBot?.authTokens?.size || 0),
        uptime,
        errorCount: stats.errors || 0,
        successRate: stats.successRate || 100,
      };
      res.json(overview);
    } catch (error) {
      console.error("Error fetching analytics overview:", error);
      res.status(500).json({ error: error.message || "Failed to fetch analytics overview" });
    }
  });

  app.get("/api/auth/restart", requireAuth, (_, res) => {
    res.json({ message: "Forcing auth re-initialisation…" });
    invalidateSessionAndRestart();
  });

  // Token verification endpoint
  app.post("/api/auth/verify", (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader ? authHeader.split(" ")[1] : req.body.token;

      if (!token) {
        return res.status(401).json({ 
          valid: false, 
          error: "No token provided",
          success: false 
        });
      }

      // Initialize authTokens if not exists
      if (!global.GoatBot) {
        global.GoatBot = { authTokens: new Map() };
      }
      if (!global.GoatBot.authTokens) {
        global.GoatBot.authTokens = new Map();
      }

      const tokenData = global.GoatBot.authTokens.get(token);
      const valid = tokenData && tokenData.expiryTime > Date.now();

      res.json({ 
        valid,
        success: valid,
        error: valid ? null : "Token expired or invalid"
      });
    } catch (error) {
      console.error("Auth verify error:", error);
      res.status(500).json({ 
        valid: false, 
        success: false,
        error: "Internal server error during token verification" 
      });
    }
  });

  app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
  return app;
}

function formatUptime(uptime) {
  const seconds = Math.floor(uptime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function startServer() {
  if (server) return;
  const PORT = process.env.PORT || config.dashboard?.port || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  const appInstance = initializeApp();
  server = appInstance.listen(PORT, HOST, () =>
    logInfo(`📊 Dashboard available at http://${HOST}:${PORT}`)
  );
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      logError(`❌ Port ${PORT} is already in use.`);
      process.exit(1);
    }
    logError("❌ Server error:", error);
  });
}

function stopServer(callback) {
  if (server) {
    server.close(callback);
    server = undefined;
  } else if (callback) {
    callback();
  }
}

function getServer() {
  return server;
}

module.exports = { initializeApp, startServer, stopServer, getServer };