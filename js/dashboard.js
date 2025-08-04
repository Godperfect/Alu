
class LunaDashboard {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.stats = {
            users: 0,
            groups: 0,
            commands: 0,
            uptime: 0
        };
        this.init();
    }

    init() {
        this.loadInitialData();
        this.setupEventListeners();
        this.startStatsUpdate();
    }

    async loadInitialData() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            this.updateStats(data);
            this.updateStatus(data.status);
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    }

    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadInitialData());
        }

        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    updateStats(data) {
        if (data.stats) {
            this.stats = { ...this.stats, ...data.stats };
            
            // Update DOM elements
            this.updateElement('user-count', this.stats.users);
            this.updateElement('group-count', this.stats.groups);
            this.updateElement('command-count', this.stats.commands);
            this.updateElement('uptime', this.formatUptime(this.stats.uptime));
        }
    }

    updateStatus(status) {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.getElementById('status-text');
        
        if (statusIndicator && statusText) {
            if (status === 'online') {
                statusIndicator.className = 'status-indicator status-online';
                statusText.textContent = 'Bot is Online';
                this.isConnected = true;
            } else {
                statusIndicator.className = 'status-indicator status-offline';
                statusText.textContent = 'Bot is Offline';
                this.isConnected = false;
            }
        }
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${mins}m`;
        } else if (hours > 0) {
            return `${hours}h ${mins}m`;
        } else {
            return `${mins}m`;
        }
    }

    startStatsUpdate() {
        setInterval(() => {
            this.loadInitialData();
        }, 30000); // Update every 30 seconds
    }

    toggleTheme() {
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    }

    // Real-time notifications
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Command execution from dashboard
    async executeCommand(command) {
        try {
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ command })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Command executed successfully', 'success');
            } else {
                this.showNotification('Command execution failed', 'error');
            }
        } catch (error) {
            this.showNotification('Failed to execute command', 'error');
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.lunaDashboard = new LunaDashboard();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LunaDashboard;
}
