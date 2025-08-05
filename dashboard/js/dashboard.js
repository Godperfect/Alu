// Global variables
let currentTab = 'dashboard';
let sidebarCollapsed = false;
let isAuthenticated = false;
let otpTimer = null;
let otpTimeLeft = 300; // 5 minutes
let currentTheme = localStorage.getItem('theme') || 'auto'; // theme can be 'light', 'dark' or 'auto'

// Authentication functions
function showLogin() {
    document.querySelector('.login-container').style.display = 'flex';
    document.querySelector('.dashboard').style.display = 'none';
}

function showDashboard() {
    document.querySelector('.login-container').style.display = 'none';
    document.querySelector('.dashboard').style.display = 'block';
    isAuthenticated = true;
    loadDashboardData();
}

function showLoginTab(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.login-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all methods
    document.querySelectorAll('.login-method').forEach(method => {
        method.classList.remove('active');
    });

    // Add active class to clicked tab
    event.target.classList.add('active');

    // Show corresponding method
    document.getElementById(tabName + '-login').classList.add('active');
}

// Make function globally available
window.showLoginTab = showLoginTab;

// Also ensure it's available before DOM is ready
if (typeof showLoginTab !== 'undefined') {
    window.showLoginTab = showLoginTab;
}

function passwordLogin() {
    const password = document.getElementById('adminPassword').value;
    const loginBtn = document.getElementById('passwordLoginBtn');

    if (!password) {
        showAlert('Please enter password', 'error');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span>Logging in...';

    fetch('/api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Login failed: HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data && data.success && data.token) {
            localStorage.setItem('authToken', data.token);
            showAlert('Login successful!', 'success');
            setTimeout(() => {
                showDashboard();
            }, 1000);
        } else {
            throw new Error(data.error || data.message || 'Invalid login response');
        }
    })
    .catch(error => {
        console.error('Login error:', error.message);
        showAlert(error.message || 'Login failed. Please check your password.', 'error');
    })
    .finally(() => {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    });
}

// Make sure password login is available globally
window.passwordLogin = passwordLogin;

function requestOTP() {
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>Sending...';

        apiRequest('/api/auth/request-otp', {
            method: 'POST'
        })
        .then(data => {
            if (data.success) {
                showOTPForm();
                startOTPTimer();
                showAlert('OTP sent to all admins successfully!', 'success');
            } else {
                showAlert(data.message || 'Failed to send OTP', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showAlert('Error sending OTP. Please try again.', 'error');
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Request OTP';
        });
    }
}

function verifyOTP() {
    const otpInputs = document.querySelectorAll('.otp-input');
    const otp = Array.from(otpInputs).map(input => input.value).join('');

    if (otp.length !== 6) {
        showAlert('Please enter complete OTP', 'error');
        return;
    }

    const verifyBtn = document.getElementById('verifyBtn');
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<span class="spinner"></span>Verifying...';

    fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ otp: otp })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('authToken', data.token || data.sessionId);
            showDashboard();
            showAlert('Login successful!', 'success');
        } else {
            showAlert(data.message || 'Invalid OTP', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Error verifying OTP. Please try again.', 'error');
    })
    .finally(() => {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = 'Verify OTP';
    });
}

function showOTPForm() {
    document.querySelector('.phone-container').style.display = 'none';
    document.querySelector('.otp-container').style.display = 'block';
}

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    const container = document.querySelector('.login-card');
    const existingAlert = container.querySelector('.alert');
    if (existingAlert) {
        existingAlert.remove();
    }

    container.insertBefore(alertDiv, container.firstChild);

    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

function startOTPTimer() {
    otpTimeLeft = 300;
    const timerElement = document.getElementById('otpTimer');
    const resendBtn = document.getElementById('resendOTP');

    resendBtn.style.display = 'none';

    otpTimer = setInterval(() => {
        const minutes = Math.floor(otpTimeLeft / 60);
        const seconds = otpTimeLeft % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (otpTimeLeft <= 0) {
            clearInterval(otpTimer);
            timerElement.textContent = '';
            resendBtn.style.display = 'inline-block';
        }

        otpTimeLeft--;
    }, 1000);
}

function resendOTP() {
    clearInterval(otpTimer);
    requestOTP();
}

function logout() {
    localStorage.removeItem('authToken');
    isAuthenticated = false;
    showLogin();
    // Clear OTP form
    document.querySelector('.phone-container').style.display = 'block';
    document.querySelector('.otp-container').style.display = 'none';
    document.querySelectorAll('.otp-input').forEach(input => input.value = '');
    clearInterval(otpTimer);
}

// OTP input handling
function setupOTPInputs() {
    const otpInputs = document.querySelectorAll('.otp-input');

    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1) {
                if (index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value) {
                if (index > 0) {
                    otpInputs[index - 1].focus();
                }
            }
        });
    });
}

// Dashboard functions
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');

    currentTab = tabName;
    loadTabData(tabName);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');

    if (!sidebar || !mainContent) return;

    // Check if we're on mobile (screen width <= 768px)
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        // On mobile, toggle the 'open' class
        sidebar.classList.toggle('open');
        
        // Add or remove overlay
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar.classList.contains('open')) {
            if (overlay) overlay.style.display = 'block';
        } else {
            if (overlay) overlay.style.display = 'none';
        }
    } else {
        // On desktop, use the collapsed state
        sidebarCollapsed = !sidebarCollapsed;

        if (sidebarCollapsed) {
            sidebar.classList.add('collapsed');
            mainContent.classList.add('expanded');
        } else {
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('expanded');
        }
    }
}

// Make functions globally available
window.toggleSidebar = toggleSidebar;

function formatUptime(seconds) {
    const years = Math.floor(seconds / (365.25 * 24 * 3600));
    const months = Math.floor((seconds % (365.25 * 24 * 3600)) / (30.44 * 24 * 3600));
    const days = Math.floor((seconds % (30.44 * 24 * 3600)) / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return { years, months, days, hours, minutes, seconds: secs };
}

function updateUptime() {
    if (!isAuthenticated) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch('/api/system', {
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        signal: controller.signal
    })
    .then(response => {
        clearTimeout(timeoutId);
        if (!response.ok) {
            // Don't log 502 errors as they're common during server restart
            if (response.status !== 502) {
                console.warn(`System API returned ${response.status}: ${response.statusText}`);
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        if (data && data.uptime) {
            const uptime = formatUptime(data.uptime);
            const elements = {
                'uptimeYears': uptime.years,
                'uptimeMonths': uptime.months,
                'uptimeDays': uptime.days,
                'uptimeHours': uptime.hours,
                'uptimeMinutes': uptime.minutes,
                'uptimeSeconds': uptime.seconds
            };

            for (const [id, value] of Object.entries(elements)) {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                }
            }
        }

        if (data && data.memory) {
            const memoryElement = document.getElementById('memoryUsage');
            if (memoryElement && data.memory.used) {
                // Handle different memory units properly
                let memoryUsageMB = data.memory.used;
                
                // If the value seems to be in bytes (> 1000000), convert to MB
                if (memoryUsageMB > 1000000) {
                    memoryUsageMB = Math.round(memoryUsageMB / 1024 / 1024);
                } else {
                    memoryUsageMB = Math.round(memoryUsageMB);
                }
                
                // Cap at reasonable values and handle unit conversion
                if (memoryUsageMB > 8192) {
                    memoryUsageMB = Math.round(memoryUsageMB / 1024);
                    if (memoryUsageMB > 8192) {
                        memoryUsageMB = Math.round(memoryUsageMB / 1024);
                    }
                }
                
                memoryElement.textContent = memoryUsageMB + ' MB';
            }
        }
    })
    .catch(error => {
        clearTimeout(timeoutId);
        
        // Only log errors that aren't 502 (server unavailable) or timeouts
        if (!error.message?.includes('502') && error.name !== 'AbortError') {
            console.error('Error updating uptime:', error.message || error);
        }
        
        // Stop trying to update if there's an authentication error
        if (error.message && error.message.includes('401')) {
            isAuthenticated = false;
        }
    });
}

function loadTabData(tabName) {
    if (!isAuthenticated) return;

    switch(tabName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'bot-info':
            loadBotInfo();
            break;
        case 'commands':
            loadCommands();
            loadEvents();
            break;
        case 'users':
            loadUsers();
            break;
        case 'groups':
            loadGroups();
            break;
        case 'system':
            loadSystemInfo();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'whatsapp-auth':
            loadWhatsAppAuth();
            break;
    }
}

// WhatsApp Authentication functions
function loadWhatsAppAuth() {
    checkWhatsAppStatus();
    // Auto-refresh status every 5 seconds
    setInterval(checkWhatsAppStatus, 5000);
}

function checkWhatsAppStatus() {
    apiRequest('/api/whatsapp/auth/status')
        .then(data => {
            updateAuthStatus(data);
        })
        .catch(error => {
            console.error('Error checking WhatsApp status:', error);
            addAuthLog('Error checking WhatsApp status: ' + error.message);
        });
}

function updateAuthStatus(data) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');

    if (data.connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Connected to WhatsApp';
        addAuthLog('WhatsApp connection established');
    } else {
        statusDot.className = data.connectionStatus === 'connecting' ? 'status-dot connecting' : 'status-dot';
        statusText.textContent = data.connectionStatus === 'connecting' ? 'Connecting to WhatsApp...' : 'Disconnected from WhatsApp';

        if (data.lastError) {
            addAuthLog('Error: ' + data.lastError);
        }
    }

    // Update QR code or pairing code
    if (data.qrCode) {
        showQRCode(data.qrCode);
    } else {
        hideQRCode();
    }

    if (data.pairingCode) {
        showPairingCode(data.pairingCode);
    } else {
        hidePairingCode();
    }
}

function showQRCode(qrCode) {
    const container = document.getElementById('qrCodeContainer');
    const qrElement = document.getElementById('qrCode');

    // Check if it's already a data URL, otherwise treat as raw QR data
    if (qrCode.startsWith('data:image/')) {
        qrElement.innerHTML = `<img src="${qrCode}" alt="WhatsApp QR Code" style="max-width: 100%; height: auto;">`;
    } else {
        // For raw QR data, we'll need to generate it client-side or request it from server
        qrElement.innerHTML = `<div class="qr-placeholder">QR Code Available - Please scan with WhatsApp</div>`;
    }

    container.style.display = 'block';
}

function hideQRCode() {
    document.getElementById('qrCodeContainer').style.display = 'none';
}

function showPairingCode(code) {
    const container = document.getElementById('pairingCodeContainer');
    const codeElement = document.getElementById('pairingCode');

    codeElement.textContent = code;
    container.style.display = 'block';
}

function hidePairingCode() {
    document.getElementById('pairingCodeContainer').style.display = 'none';
}

function addAuthLog(message) {
    const logContainer = document.getElementById('authLogs');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';

    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `
        <span class="log-time">${timestamp}</span>
        <span class="log-message">${message}</span>
    `;

    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Keep only last 50 entries
    const entries = logContainer.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[0].remove();
    }
}

function startWhatsAppAuth() {
    const btn = document.getElementById('startAuthBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Starting...';

    apiRequest('/api/whatsapp/auth/request-code', { method: 'POST' })
        .then(data => {
            if (data.success) {
                addAuthLog('WhatsApp authentication started');
                showAlert('WhatsApp authentication started', 'success');
            } else {
                addAuthLog('Failed to start authentication: ' + data.message);
                showAlert(data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error starting WhatsApp auth:', error);
            addAuthLog('Error starting authentication: ' + error.message);
            showAlert('Error starting authentication', 'error');
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play"></i> Start Authentication';
        });
}

function disconnectWhatsApp() {
    const btn = document.getElementById('disconnectBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Disconnecting...';

    apiRequest('/api/whatsapp/auth/disconnect', { method: 'POST' })
        .then(data => {
            if (data.success) {
                addAuthLog('Disconnected from WhatsApp');
                showAlert('Disconnected from WhatsApp', 'success');
            } else {
                addAuthLog('Failed to disconnect: ' + data.message);
                showAlert(data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error disconnecting from WhatsApp:', error);
            addAuthLog('Error disconnecting: ' + error.message);
            showAlert('Error disconnecting from WhatsApp', 'error');
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-unlink"></i> Disconnect';
        });
}

function restartWhatsAppAuth() {
    const btn = document.getElementById('restartAuthBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Restarting...';

    apiRequest('/api/whatsapp/auth/restart', { method: 'POST' })
        .then(data => {
            if (data.success) {
                addAuthLog('WhatsApp authentication restarted');
                showAlert('WhatsApp authentication restarted', 'success');
            } else {
                addAuthLog('Failed to restart authentication: ' + data.message);
                showAlert(data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error restarting WhatsApp auth:', error);
            addAuthLog('Error restarting authentication: ' + error.message);
            showAlert('Error restarting authentication', 'error');
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-redo"></i> Restart Authentication';
        });
}

function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const defaultOptions = {
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }
    };

    return fetch(endpoint, { ...defaultOptions, ...options })
        .then(response => {
            if (response.status === 401) {
                logout();
                throw new Error('Unauthorized access - please login again');
            }
            if (response.status === 502) {
                throw new Error('Server temporarily unavailable (502 Bad Gateway)');
            }
            if (response.status === 404) {
                throw new Error('API endpoint not found (404)');
            }
            if (response.status === 500) {
                throw new Error('Internal server error (500)');
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            // Check if response has content
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return response.json();
            } else {
                // If no JSON content, return empty object
                return {};
            }
        })
        .catch(error => {
            // Create a more detailed error object
            const errorDetails = {
                message: error.message || 'Unknown error occurred',
                endpoint: endpoint,
                status: error.status || 'Network Error',
                timestamp: new Date().toISOString()
            };
            
            console.error(`API request to ${endpoint} failed:`, errorDetails);
            throw new Error(errorDetails.message);
        });
}

function loadDashboardData() {
    console.log('Loading dashboard data...');
    
    // Create timeout wrapper for API requests with shorter timeout
    const apiRequestWithTimeout = (url, timeout = 5000) => {
        return Promise.race([
            apiRequest(url),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), timeout)
            )
        ]).catch(err => {
            console.warn(`API request to ${url} failed:`, err.message);
            return { error: err.message };
        });
    };

    // Load data with fallbacks
    Promise.all([
        apiRequestWithTimeout('/api/users').catch(() => ({ success: false, total: 0, active: 0, users: [] })),
        apiRequestWithTimeout('/api/groups').catch(() => ({ success: false, total: 0, active: 0, groups: [] })),
        apiRequestWithTimeout('/api/system').catch(() => ({ error: true, uptime: 0, memory: { used: 0, total: 0, free: 0 } })),
        apiRequestWithTimeout('/api/bot/info').catch(() => ({ error: true, name: 'Luna Bot v1', commandsLoaded: 0 })),
        apiRequestWithTimeout('/api/analytics/overview').catch(() => ({ error: true, totalMessages: 0, commandsUsed: 0 }))
    ]).then(([users, groups, system, botInfo, analytics]) => {
        console.log('API responses:', { users, groups, system, botInfo, analytics });
        
        // Update stats with safe fallbacks
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = String(value || 0);
            } else {
                console.warn(`Element not found: ${id}`);
            }
        };

        // Dashboard stats - handle both success and error cases
        setText('totalUsers', users.total || 0);
        setText('totalGroups', groups.total || 0);
        setText('activeUsers', users.active || 0);
        // Note: activeGroups element doesn't exist in HTML, using totalGroups instead
        setText('totalGroups', groups.total || 0);
        setText('botName', botInfo.name || 'Luna Bot v1');
        setText('commandsLoaded', botInfo.commandsLoaded || 0);

        // Update memory usage if available
        const memoryElement = document.getElementById('memoryUsage');
        if (memoryElement) {
            if (system && system.memory && typeof system.memory.used === 'number') {
                let memoryUsageMB = system.memory.used;
                
                // If the value is already in MB (reasonable range)
                if (memoryUsageMB < 10000) {
                    memoryUsageMB = Math.round(memoryUsageMB);
                } else {
                    // Convert from bytes to MB
                    memoryUsageMB = Math.round(memoryUsageMB / 1024 / 1024);
                }
                
                memoryElement.textContent = memoryUsageMB + ' MB';
            } else {
                memoryElement.textContent = '-- MB';
            }
        }

        // Analytics
        if (analytics && !analytics.error) {
            updateAnalyticsDisplay(analytics);
        }

        console.log('Dashboard data loaded successfully');
    }).catch(error => {
        console.error('Error loading dashboard:', error);
        
        // Show minimal working dashboard even on error
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(value || 0);
        };

        setText('totalUsers', 0);
        setText('totalGroups', 0);
        setText('activeUsers', 0);
        setText('activeGroups', 0);
        setText('botName', 'Luna Bot v1');
        setText('commandsLoaded', 0);
        
        const memoryElement = document.getElementById('memoryUsage');
        if (memoryElement) {
            memoryElement.textContent = '-- MB';
        }
    });
}

function loadBotInfo() {
    apiRequest('/api/bot/info')
        .then(data => {
            // Handle empty or malformed response
            if (!data || typeof data !== 'object') {
                console.warn('Bot info returned empty or invalid data:', data);
                data = {}; // Set fallback empty object
            }

            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            };

            setText('botInfoName', data.name || 'Luna Bot v1');
            setText('botVersion', data.version || '1.0.0');
            setText('botStatusText', data.status || 'Offline');
            setText('botUptime', data.uptime || '0 seconds');
            setText('botInfoCommandsLoaded', data.commandsLoaded || 0);
            setText('eventsLoaded', data.eventsLoaded || 0);
            setText('lastRestart', data.lastRestart || 'Never');
            setText('adminUsers', data.adminUsers || 0);
            setText('botPrefix', data.prefix || '+');
            setText('botLanguage', data.language || 'en');
            setText('botTimeZone', data.timeZone || 'UTC');
            setText('botPhoneNumber', data.phoneNumber || 'Not configured');
            setText('botDatabase', data.database || 'sqlite');
            setText('botAutoRestart', data.autoRestart ? 'Enabled' : 'Disabled');
        })
        .catch(error => {
            console.error('Error loading bot info:', error);
            
            // Set fallback values on error
            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            };

            setText('botInfoName', 'Luna Bot v1');
            setText('botVersion', '1.0.0');
            setText('botStatusText', 'Error loading status');
            setText('botUptime', 'N/A');
            setText('botInfoCommandsLoaded', '0');
            setText('eventsLoaded', '0');
            setText('lastRestart', 'N/A');
            setText('adminUsers', '0');
        });
}

function loadCommands() {
    apiRequest('/api/commands')
        .then(data => {
            const commandsList = document.getElementById('commandsList');
            commandsList.innerHTML = '';

            // Handle case where data might be empty or malformed
            if (!data || typeof data !== 'object') {
                commandsList.innerHTML = '<div class="text-center text-muted">Failed to load commands data</div>';
                return;
            }

            if (data.commands && data.commands.length > 0) {
                data.commands.forEach(command => {
                    const commandItem = document.createElement('div');
                    commandItem.className = 'list-item';
                    commandItem.innerHTML = `
                        <div class="item-info">
                            <h6>${command.name || 'Unnamed Command'}</h6>
                            <p>${command.description || 'No description available'}</p>
                            <small class="text-muted">Usage: ${command.usage || 'N/A'}</small>
                            ${command.aliases && command.aliases.length > 0 ? `<small class="text-muted">Aliases: ${command.aliases.join(', ')}</small>` : ''}
                        </div>
                        <div class="item-badges">
                            <span class="badge command-category">${command.category || 'General'}</span>
                            ${command.role !== undefined ? `<span class="badge bg-info">Role: ${getRoleText(command.role)}</span>` : ''}
                            ${command.cooldown ? `<span class="badge bg-warning">Cooldown: ${command.cooldown}s</span>` : ''}
                        </div>
                    `;
                    commandsList.appendChild(commandItem);
                });
            } else {
                commandsList.innerHTML = '<div class="text-center text-muted">No commands found</div>';
            }
        })
        .catch(error => {
            console.error('Error loading commands:', error);
            const commandsList = document.getElementById('commandsList');
            if (commandsList) {
                commandsList.innerHTML = '<div class="error-message">Error loading commands: ' + (error.message || 'Unknown error') + '</div>';
            }
        });
}

function loadEvents() {
    apiRequest('/api/events')
        .then(data => {
            const eventsList = document.getElementById('eventsList');
            eventsList.innerHTML = '';

            if (data && data.length > 0) {
                data.forEach(event => {
                    const eventItem = document.createElement('div');
                    eventItem.className = 'list-item';
                    eventItem.innerHTML = `
                        <div class="item-info">
                            <h6>${event.name}</h6>
                            <p>${event.description || 'No description available'}</p>
                            <small class="text-muted">Type: ${event.type || 'Unknown'}</small>
                        </div>
                        <div class="item-badges">
                            <span class="badge bg-success">Active</span>
                            <span class="badge bg-info">${event.type || 'Event'}</span>
                        </div>
                    `;
                    eventsList.appendChild(eventItem);
                });
            } else {
                eventsList.innerHTML = '<div class="text-center text-muted">No events found</div>';
            }
        })
        .catch(error => {
            console.error('Error loading events:', error);
            document.getElementById('eventsList').innerHTML = '<div class="error-message">Error loading events</div>';
        });
}

function showCommandsEventsTab(tabName) {
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Remove active class from all content areas
    document.querySelectorAll('.commands-events-content').forEach(content => {
        content.classList.remove('active');
    });

    // Add active class to clicked tab button
    event.target.classList.add('active');

    // Show corresponding content
    document.getElementById(tabName + '-list-tab').classList.add('active');

    // Load data for the selected tab
    if (tabName === 'commands') {
        loadCommands();
    } else if (tabName === 'events') {
        loadEvents();
    }
}

function getRoleText(role) {
    switch (role) {
        case 0:
            return 'Everyone';
        case 1:
            return 'Group Admin';
        case 2:
            return 'Bot Admin';
        default:
            return 'Unknown';
    }
}

function loadUsers() {
    console.log('Loading users...');
    
    apiRequest('/api/users')
        .then(data => {
            console.log('Users data received:', data);
            
            const usersList = document.getElementById('usersList');
            if (!usersList) {
                console.error('Users list element not found');
                return;
            }
            
            usersList.innerHTML = '';

            if (data && data.users && Array.isArray(data.users) && data.users.length > 0) {
                data.users.forEach(user => {
                    if (!user) return;
                    
                    const userItem = document.createElement('div');
                    userItem.className = 'list-item';
                    userItem.innerHTML = `
                        <div class="item-info">
                            <h6>${user.name || 'Unknown'}</h6>
                            <p>${user.id || 'No ID'}</p>
                            <small class="text-muted">Exp: ${user.exp || 0} | Messages: ${user.messageCount || 0}</small>
                        </div>
                        <div class="item-badges">
                            <span class="badge bg-warning">Level ${user.level || 1}</span>
                            <span class="badge ${user.banned ? 'bg-danger' : 'bg-success'}">${user.banned ? 'Banned' : 'Active'}</span>
                            ${user.role > 0 ? `<span class="badge bg-info">Role: ${user.role}</span>` : ''}
                            ${user.isAdmin ? `<span class="badge bg-primary">Admin</span>` : ''}
                        </div>
                    `;
                    usersList.appendChild(userItem);
                });
                console.log(`Loaded ${data.users.length} users`);
            } else {
                usersList.innerHTML = '<div class="text-center text-muted">No users found</div>';
                console.log('No users data available');
            }
        })
        .catch(error => {
            console.error('Error loading users:', error);
            const usersList = document.getElementById('usersList');
            if (usersList) {
                usersList.innerHTML = `
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Error loading users:</strong> ${error.message || 'Unable to connect to database or fetch user data'}
                        <br><small>Please check if the database is properly connected and has user data.</small>
                    </div>
                `;
            } else {
                // Create the usersList container if it doesn't exist
                const usersTab = document.getElementById('users-tab');
                if (usersTab) {
                    usersTab.innerHTML = `
                        <div class="search-container">
                            <input type="text" id="userSearch" class="search-input" placeholder="Search users...">
                            <i class="fas fa-search search-icon"></i>
                        </div>
                        <div class="list-container" id="usersList">
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle"></i>
                                <strong>Error loading users:</strong> ${error.message || 'Unable to connect to database'}
                            </div>
                        </div>
                    `;
                }
            }
        });
}

function loadGroups() {
    console.log('Loading groups...');
    
    apiRequest('/api/groups')
        .then(data => {
            console.log('Groups data received:', data);
            
            const groupsList = document.getElementById('groupsList');
            if (!groupsList) {
                console.error('Groups list element not found');
                return;
            }
            
            groupsList.innerHTML = '';

            if (data && data.groups && Array.isArray(data.groups) && data.groups.length > 0) {
                data.groups.forEach(group => {
                    if (!group) return;
                    
                    const groupItem = document.createElement('div');
                    groupItem.className = 'list-item';
                    groupItem.innerHTML = `
                        <div class="item-info">
                            <h6>${group.name || 'Unknown Group'}</h6>
                            <p>${group.id || group.groupId || 'No ID'}</p>
                            <small class="text-muted">Messages: ${group.messageCount || 0}</small>
                            ${group.description ? `<small class="text-muted">Description: ${group.description}</small>` : ''}
                        </div>
                        <div class="item-badges">
                            <span class="badge bg-info">${group.memberCount || 0} members</span>
                            <span class="badge ${group.isActive ? 'bg-success' : 'bg-secondary'}">${group.isActive ? 'Active' : 'Inactive'}</span>
                            ${group.customPrefix ? `<span class="badge bg-warning">Prefix: ${group.customPrefix}</span>` : ''}
                        </div>
                    `;
                    groupsList.appendChild(groupItem);
                });
                console.log(`Loaded ${data.groups.length} groups`);
            } else {
                groupsList.innerHTML = '<div class="text-center text-muted">No groups found</div>';
                console.log('No groups data available');
            }
        })
        .catch(error => {
            console.error('Error loading groups:', error);
            const groupsList = document.getElementById('groupsList');
            if (groupsList) {
                groupsList.innerHTML = `
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Error loading groups:</strong> ${error.message || 'Unable to connect to database or fetch group data'}
                        <br><small>Please check if the database is properly connected and has group data.</small>
                    </div>
                `;
            } else {
                // Create the groupsList container if it doesn't exist
                const groupsTab = document.getElementById('groups-tab');
                if (groupsTab) {
                    groupsTab.innerHTML = `
                        <div class="search-container">
                            <input type="text" id="groupSearch" class="search-input" placeholder="Search groups...">
                            <i class="fas fa-search search-icon"></i>
                        </div>
                        <div class="list-container" id="groupsList">
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle"></i>
                                <strong>Error loading groups:</strong> ${error.message || 'Unable to connect to database'}
                            </div>
                        </div>
                    `;
                }
            }
        });
}

function loadSystemInfo() {
    console.log('Loading system info...');
    
    apiRequest('/api/system')
        .then(data => {
            console.log('System info data received:', data);
            
            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                } else {
                    console.warn(`System info element not found: ${id}`);
                }
            };
            
            if (data && !data.error) {
                setText('platform', data.platform || 'Unknown');
                setText('architecture', data.architecture || 'Unknown');
                setText('nodeVersion', data.nodeVersion || 'Unknown');
                setText('memoryTotal', (data.memory?.total || 0) + ' MB');
                setText('systemMemoryUsage', (data.memory?.used || 0) + ' MB');
                setText('loadAverage', data.loadAverage?.join(', ') || 'N/A');
                setText('freeMemory', (data.memory?.free || 0) + ' MB');
            } else {
                // Set fallback values
                setText('platform', 'Unknown');
                setText('architecture', 'Unknown');
                setText('nodeVersion', 'Unknown');
                setText('memoryTotal', '0 MB');
                setText('systemMemoryUsage', '0 MB');
                setText('loadAverage', 'N/A');
                setText('freeMemory', '0 MB');
            }
        })
        .catch(error => {
            console.error('Error loading system info:', error.message || error);
            
            // Set fallback values on error with better error messages
            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            };
            
            const errorMsg = 'Unable to load';
            setText('platform', errorMsg);
            setText('architecture', errorMsg);
            setText('nodeVersion', errorMsg);
            setText('memoryTotal', errorMsg);
            setText('systemMemoryUsage', errorMsg);
            setText('loadAverage', errorMsg);
            setText('freeMemory', errorMsg);
            
            if (typeof showAlert === 'function') {
                showAlert('Error loading system information: ' + (error.message || 'Unknown error'), 'error');
            }
        });
}

function loadAnalytics() {
    apiRequest('/api/analytics')
        .then(data => {
            // Update analytics display
            updateAnalyticsDisplay(data);
        })
        .catch(error => {
            console.error('Error loading analytics:', error);
            showAlert('Error loading analytics: ' + error.message, 'error');
        });
}

function loadSettings() {
    apiRequest('/api/settings')
        .then(data => {
            // Update settings display
            updateSettingsDisplay(data);
        })
        .catch(error => {
            console.error('Error loading settings:', error);
            showAlert('Error loading settings: ' + error.message, 'error');
        });
}

function updateAnalyticsDisplay(data) {
    if (!data) return;

    // Update charts and analytics displays
    const analyticsContainer = document.getElementById('analyticsContainer');
    if (analyticsContainer) {
        analyticsContainer.innerHTML = `
            <div class="row">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h6>Messages Today</h6>
                            <h3 class="text-primary">${data.messagesToday || 0}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h6>Commands Used</h6>
                            <h3 class="text-success">${data.commandsUsed || 0}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h6>Active Sessions</h6>
                            <h3 class="text-info">${data.activeSessions || 0}</h3>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

function updateSettingsDisplay(data) {
    if (!data) return;

    const settingsContainer = document.getElementById('settingsContainer');
    if (settingsContainer) {
        settingsContainer.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h6>Bot Configuration</h6>
                    <div class="system-metric">
                        <span class="metric-label">Prefix</span>
                        <span class="metric-value">${data.prefix || '.'}</span>
                    </div>
                    <div class="system-metric">
                        <span class="metric-label">Admin Only</span>
                        <span class="metric-value">${data.adminOnly ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="system-metric">
                        <span class="metric-label">Auto Restart</span>
                        <span class="metric-value">${data.autoRestart ? 'Enabled' : 'Disabled'}</span>
                    </div>
                </div>
            </div>
        `;
    }
}

// Search functionality
function setupSearch() {
    const searchInputs = [
        { input: 'commandSearch', container: '#commandsList .list-item, #eventsList .list-item' },
        { input: 'userSearch', container: '#usersList .list-item' },
        { input: 'groupSearch', container: '#groupsList .list-item' }
    ];

    searchInputs.forEach(({ input, container }) => {
        const searchInput = document.getElementById(input);
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const search = this.value.toLowerCase();
                document.querySelectorAll(container).forEach(item => {
                    const text = item.textContent.toLowerCase();
                    item.style.display = text.includes(search) ? 'flex' : 'none';
                });
            });
        }
    });
}

// Authentication check
function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (token) {
        fetch('/api/auth/verify', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data && data.valid) {
                showDashboard();
            } else {
                console.warn('Token validation failed:', data);
                localStorage.removeItem('authToken');
                showLogin();
            }
        })
        .catch(error => {
            console.error('Auth verification failed:', error.message);
            localStorage.removeItem('authToken');
            showLogin();
        });
    } else {
        showLogin();
    }
}

// Theme Functions
function detectSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
    // If theme is auto, detect system preference
    const appliedTheme = theme === 'auto' ? detectSystemTheme() : theme;

    // Apply theme to document
    document.documentElement.setAttribute('data-theme', appliedTheme);

    // Update icon
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = appliedTheme === 'dark'
            ? '<i class="fas fa-sun"></i>'
            : '<i class="fas fa-moon"></i>';
    }

    // Save preference
    currentTheme = theme;
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    // If current theme is auto, switch to specific theme based on current applied theme
    if (currentTheme === 'auto') {
        const systemTheme = detectSystemTheme();
        setTheme(systemTheme === 'dark' ? 'light' : 'dark');
    }
    // If light, switch to dark
    else if (currentTheme === 'light') {
        setTheme('dark');
    }
    // If dark, switch to light
    else {
        setTheme('light');
    }
}

// System theme change detection
function setupThemeListener() {
    if (window.matchMedia) {
        const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

        // Add change listener
        try {
            // Chrome & Firefox
            colorSchemeQuery.addEventListener('change', (e) => {
                if (currentTheme === 'auto') {
                    setTheme('auto');
                }
            });
        } catch (e1) {
            try {
                // Safari
                colorSchemeQuery.addListener((e) => {
                    if (currentTheme === 'auto') {
                        setTheme('auto');
                    }
                });
            } catch (e2) {
                console.error("Could not add theme change listener");
            }
        }
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    // Check if already authenticated
    const token = localStorage.getItem('authToken');
    if (token) {
        // Verify token is still valid
        fetch('/api/auth/verify', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Token verification failed');
        })
        .then(data => {
            if (data && data.valid) {
                showDashboard();
                return;
            }
            throw new Error('Invalid token');
        })
        .catch(error => {
            console.warn('Token verification failed:', error.message);
            localStorage.removeItem('authToken');
            showLogin();
        });
    } else {
        showLogin();
    }

    // Setup OTP inputs
    setupOTPInputs();

    // Setup event listeners
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', requestOTP);
    }

    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', verifyOTP);
    }

    const resendBtn = document.getElementById('resendOTP');
    if (resendBtn) {
        resendBtn.addEventListener('click', requestOTP);
    }

    // Add password login event listener
    const passwordLoginBtn = document.getElementById('passwordLoginBtn');
    if (passwordLoginBtn) {
        passwordLoginBtn.addEventListener('click', passwordLogin);
    }

    // Add enter key support for password input
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                passwordLogin();
            }
        });
    }

    // Update uptime every second
    setInterval(updateUptime, 1000);

    // Auto-refresh dashboard data every 30 seconds
    setInterval(() => {
        if (isAuthenticated) {
            loadDashboardData();
        }
    }, 30000);
});

// Event listeners
document.getElementById('submitBtn')?.addEventListener('click', requestOTP);
document.getElementById('verifyBtn')?.addEventListener('click', verifyOTP);
document.getElementById('resendOTP')?.addEventListener('click', resendOTP);
document.getElementById('passwordLoginBtn')?.addEventListener('click', passwordLogin);
document.getElementById('logoutBtn')?.addEventListener('click', logout);
document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

// Mobile hamburger menu event listeners
document.addEventListener('DOMContentLoaded', function() {
    const mobileToggle = document.getElementById('sidebar-toggle-mobile');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', toggleSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            if (sidebar) {
                sidebar.classList.remove('open');
                sidebarOverlay.style.display = 'none';
            }
        });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        const isMobile = window.innerWidth <= 768;
        if (isMobile && sidebar && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && !mobileToggle?.contains(e.target)) {
                sidebar.classList.remove('open');
                if (sidebarOverlay) sidebarOverlay.style.display = 'none';
            }
        }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        if (window.innerWidth > 768) {
            // Reset mobile classes when switching to desktop
            if (sidebar) sidebar.classList.remove('open');
            if (overlay) overlay.style.display = 'none';
        }
    });
});

// Handle Enter key for password login
document.getElementById('adminPassword')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        passwordLogin();
    }
});

// OTP inputs - prevent non-digit input
document.querySelectorAll('.otp-input').forEach(input => {
    input.addEventListener('input', function(e) {
        this.value = this.value.replace(/\D/g, '');
    });
});

// Export functions for global access
window.showTab = showTab;
window.toggleSidebar = toggleSidebar;
window.logout = logout;
window.showLoginTab = showLoginTab;
window.startWhatsAppAuth = startWhatsAppAuth;
window.disconnectWhatsApp = disconnectWhatsApp;
window.restartWhatsAppAuth = restartWhatsAppAuth;
window.toggleTheme = toggleTheme;
window.showCommandsEventsTab = showCommandsEventsTab;