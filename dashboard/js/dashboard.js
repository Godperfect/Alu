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
        this.createFallingStars();
        this.loadInitialData();
        this.setupEventListeners();
        this.setupTabs();
        this.startStatsUpdate();
        this.animateElements();
        this.loadCommands();
    }

    createFallingStars() {
        const starsContainer = document.createElement('div');
        starsContainer.className = 'stars';
        document.body.appendChild(starsContainer);

        // Create multiple stars with different sizes and animation durations
        for (let i = 0; i < 15; i++) {
            this.createStar(starsContainer);
        }

        // Continue creating stars at intervals
        setInterval(() => {
            if (document.querySelectorAll('.star').length < 20) {
                this.createStar(starsContainer);
            }
        }, 2000);
    }

    createStar(container) {
        const star = document.createElement('div');
        star.className = 'star';

        // Random properties for each star
        const size = Math.random() * 4 + 2; // 2-6px
        const left = Math.random() * 100; // 0-100%
        const duration = Math.random() * 3 + 4; // 4-7 seconds
        const delay = Math.random() * 2; // 0-2 seconds delay

        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left = `${left}%`;
        star.style.animationDuration = `${duration}s`;
        star.style.animationDelay = `${delay}s`;

        container.appendChild(star);

        // Remove star after animation completes
        setTimeout(() => {
            if (star.parentNode) {
                star.parentNode.removeChild(star);
            }
        }, (duration + delay) * 1000);
    }

    animateElements() {
        // Stagger animation for stat cards
        const statCards = document.querySelectorAll('.stat-card');
        statCards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';

            setTimeout(() => {
                card.style.transition = 'all 0.6s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 150);
        });

        // Animate command items
        const commandItems = document.querySelectorAll('.command-item');
        commandItems.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';

            setTimeout(() => {
                item.style.transition = 'all 0.5s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, 800 + (index * 100));
        });
    }

    async loadInitialData() {
        try {
            const response = await fetch('/api/stats');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data && data.success && data.stats) {
                this.updateStats(data);
                this.updateStatus(data.status || 'offline');
            } else {
                console.error('API returned error:', data?.error || 'Invalid response');
                this.showNotification('Failed to load dashboard data', 'error');
                this.updateStats({ stats: { users: 0, groups: 0, commands: 0, uptime: 0 } });
                this.updateStatus('offline');
            }
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.showNotification('Failed to load dashboard data', 'error');
            // Set default values when API fails
            this.updateStats({ stats: { users: 0, groups: 0, commands: 0, uptime: 0 } });
            this.updateStatus('offline');
        }
    }

    setupEventListeners() {
        // Refresh button with enhanced feedback
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.style.transform = 'scale(0.95)';
                refreshBtn.textContent = 'Refreshing...';

                await this.loadInitialData();
                await this.loadUsersData();
                await this.loadGroupsData();
                await this.loadCommands();

                setTimeout(() => {
                    refreshBtn.style.transform = 'scale(1)';
                    refreshBtn.textContent = 'Refresh';
                    this.showNotification('Dashboard refreshed successfully', 'success');
                }, 500);
            });
        }

        // Add hover effects to command items
        const commandItems = document.querySelectorAll('.command-item');
        commandItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                item.style.transform = 'translateY(-5px) scale(1.02)';
            });

            item.addEventListener('mouseleave', () => {
                item.style.transform = 'translateY(0) scale(1)';
            });
        });
    }

    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');

                // Remove active class from all tabs
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Add active class to clicked tab
                btn.classList.add('active');
                const tabContent = document.getElementById(`${tabName}-tab`);
                if (tabContent) {
                    tabContent.classList.add('active');
                }

                // Load data based on tab
                if (tabName === 'users') {
                    this.loadUsersData();
                } else if (tabName === 'groups') {
                    this.loadGroupsData();
                }
            });
        });

        // Load initial data for users and groups
        this.loadUsersData();
        this.loadGroupsData();
    }

    async loadUsersData() {
        try {
            const response = await fetch('/api/users');
            const data = await response.json();

            if (data.success) {
                this.renderUsersTable(data.users);
            }
        } catch (error) {
            console.error('Failed to load users:', error);
            this.showNotification('Failed to load users data', 'error');
        }
    }

    async loadGroupsData() {
        try {
            const response = await fetch('/api/groups');
            const data = await response.json();

            if (data.success) {
                this.renderGroupsTable(data.groups);
            }
        } catch (error) {
            console.error('Failed to load groups:', error);
            this.showNotification('Failed to load groups data', 'error');
        }
    }

    async loadCommands() {
        try {
            const response = await fetch('/api/commands');
            const data = await response.json();

            if (data.success) {
                this.displayCommands(data.commands);
            } else {
                const commandsGrid = document.getElementById('commands-grid');
                if (commandsGrid) {
                    commandsGrid.innerHTML = '<div class="error">Failed to load commands</div>';
                }
            }
        } catch (error) {
            console.error('Error loading commands:', error);
            const commandsGrid = document.getElementById('commands-grid');
            if (commandsGrid) {
                commandsGrid.innerHTML = '<div class="error">Error loading commands</div>';
            }
        }
    }

    displayCommands(commands) {
        const commandsGrid = document.getElementById('commands-grid');
        if (!commandsGrid) return;

        if (commands.length === 0) {
            commandsGrid.innerHTML = '<div class="no-data">No commands found</div>';
            return;
        }

        commandsGrid.innerHTML = commands.map(cmd => `
            <div class="command-item">
                <h4>${cmd.name}</h4>
                <p>${cmd.description}</p>
                <div class="command-meta">
                    <span class="category">${cmd.category}</span>
                    <span class="role">Role: ${cmd.role}</span>
                </div>
            </div>
        `).join('');
    }

    renderUsersTable(users) {
        const tbody = document.getElementById('users-table-body') || document.getElementById('users-tbody');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const status = user.isBanned ? 'banned' : user.isAdmin ? 'admin' : 'active';
            const statusClass = user.isBanned ? 'status-banned' : user.isAdmin ? 'status-admin' : 'status-active';
            const lastSeen = user.lastSeen ? this.formatDate(user.lastSeen) : 'Never';

            return `
                <tr>
                    <td>${user.phoneNumber || user.userNumber || 'N/A'}</td>
                    <td>${user.name || user.userName || 'Unknown'}</td>
                    <td>${user.commandCount || user.messageCount || 0}</td>
                    <td><span class="status-badge ${statusClass}">${status}</span></td>
                    <td>${lastSeen}</td>
                </tr>
            `;
        }).join('');
    }

    renderGroupsTable(groups) {
        const tbody = document.getElementById('groups-table-body') || document.getElementById('groups-tbody');
        if (!tbody) return;

        if (groups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">No groups found</td></tr>';
            return;
        }

        tbody.innerHTML = groups.map(group => {
            const status = group.isActive ? 'active' : 'inactive';
            const statusClass = group.isActive ? 'status-active' : 'status-banned';
            const lastActivity = group.lastActivity ? this.formatDate(group.lastActivity) : 'Never';

            return `
                <tr>
                    <td>${group.groupName || 'Unknown Group'}</td>
                    <td>${group.groupId}</td>
                    <td>${group.memberCount || group.participantCount || 0}</td>
                    <td><span class="status-badge ${statusClass}">${status}</span></td>
                    <td>${lastActivity}</td>
                </tr>
            `;
        }).join('');
    }

    updateStats(data) {
        if (data && data.stats) {
            this.stats = { ...this.stats, ...data.stats };

            // Animate number changes
            this.animateNumber('user-count', this.stats.users || 0);
            this.animateNumber('group-count', this.stats.groups || 0);
            this.animateNumber('command-count', this.stats.commands || 0);
            this.updateElement('uptime', this.formatUptime(this.stats.uptime || 0));
        }
    }

    animateNumber(elementId, targetValue) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const currentValue = parseInt(element.textContent) || 0;
        const increment = Math.ceil((targetValue - currentValue) / 20);
        let current = currentValue;

        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= targetValue) || (increment < 0 && current <= targetValue)) {
                current = targetValue;
                clearInterval(timer);
            }
            element.textContent = current;
        }, 50);
    }

    updateStatus(status) {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.getElementById('status-text');

        if (statusIndicator && statusText) {
            // Add transition effect
            statusIndicator.style.transition = 'all 0.3s ease';

            if (status === 'online') {
                statusIndicator.className = 'status-indicator status-online';
                statusText.textContent = 'Bot is Online';
                this.isConnected = true;

                // Add success glow effect
                statusIndicator.style.boxShadow = '0 0 30px rgba(0, 255, 136, 0.8)';
            } else {
                statusIndicator.className = 'status-indicator status-offline';
                statusText.textContent = 'Bot is Offline';
                this.isConnected = false;

                // Add error glow effect
                statusIndicator.style.boxShadow = '0 0 30px rgba(255, 71, 87, 0.8)';
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

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    startStatsUpdate() {
        setInterval(() => {
            this.loadInitialData();
            this.loadUsersData();
            this.loadGroupsData();
        }, 30000); // Update every 30 seconds
    }

    // Enhanced notification system
    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => {
            notification.remove();
        });

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Add entrance animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        // Add exit animation
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 400);
        }, 4000);
    }

    // Command execution with enhanced feedback
    async executeCommand(command) {
        try {
            this.showNotification(`Executing command: ${command}`, 'info');

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

    // Add particle effect on click
    createClickEffect(event) {
        const particles = 8;
        for (let i = 0; i < particles; i++) {
            const particle = document.createElement('div');
            particle.style.position = 'absolute';
            particle.style.width = '4px';
            particle.style.height = '4px';
            particle.style.background = 'linear-gradient(45deg, #667eea, #764ba2)';
            particle.style.borderRadius = '50%';
            particle.style.pointerEvents = 'none';
            particle.style.zIndex = '1000';

            const angle = (i * 360) / particles;
            const velocity = 50;
            const x = event.clientX + Math.cos(angle * Math.PI / 180) * velocity;
            const y = event.clientY + Math.sin(angle * Math.PI / 180) * velocity;

            particle.style.left = event.clientX + 'px';
            particle.style.top = event.clientY + 'px';

            document.body.appendChild(particle);

            // Animate particle
            particle.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${x - event.clientX}px, ${y - event.clientY}px) scale(0)`, opacity: 0 }
            ], {
                duration: 600,
                easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            }).onfinish = () => {
                particle.remove();
            };
        }
    }

    updateStats(data) {
        const stats = data?.stats || { users: 0, groups: 0, commands: 0, uptime: 0 };
        this.stats = stats;

        const userCountEl = document.getElementById('user-count');
        const groupCountEl = document.getElementById('group-count');
        const commandCountEl = document.getElementById('command-count');
        const uptimeEl = document.getElementById('uptime');

        if (userCountEl) userCountEl.textContent = stats.users || 0;
        if (groupCountEl) groupCountEl.textContent = stats.groups || 0;
        if (commandCountEl) commandCountEl.textContent = stats.commands || 0;
        if (uptimeEl) uptimeEl.textContent = this.formatUptime(stats.uptime || 0);
    }

    updateStatus(status) {
        const statusEl = document.getElementById('status-text');
        const statusIndicator = document.querySelector('.status-indicator');

        if (statusEl) {
            statusEl.textContent = status === 'online' ? 'Bot is Online' : 'Bot is Offline';
        }

        if (statusIndicator) {
            statusIndicator.className = `status-indicator status-${status || 'offline'}`;
        }

        this.isConnected = status === 'online';
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 400);
        }, 3000);
    }
}

// Dashboard functionality
let statsInterval;

function loadStats() {
    fetch('/api/stats')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.stats) {
                updateStatsDisplay(data.stats);
                updateBotStatus(data.status || 'offline');
            } else {
                console.error('Stats API returned error:', data.error || 'Unknown error');
                // Set default values on error
                updateStatsDisplay({
                    users: 0,
                    groups: 0,
                    messages24h: 0,
                    botStatus: 'offline',
                    uptime: 0
                });
                updateBotStatus('offline');
            }
        })
        .catch(error => {
            console.error('Error loading stats:', error.message);
            // Set default values on error
            updateStatsDisplay({
                users: 0,
                groups: 0,
                messages24h: 0,
                botStatus: 'offline',
                uptime: 0
            });
            updateBotStatus('offline');
        });
}

function updateStatsDisplay(stats) {
    const userCountEl = document.getElementById('user-count');
    const groupCountEl = document.getElementById('group-count');
    const commandCountEl = document.getElementById('command-count');
    const uptimeEl = document.getElementById('uptime');

    if (userCountEl) userCountEl.textContent = stats?.users || 0;
    if (groupCountEl) groupCountEl.textContent = stats?.groups || 0;
    if (commandCountEl) commandCountEl.textContent = stats?.commands || 0;
    if (uptimeEl) uptimeEl.textContent = formatUptime(stats?.uptime || 0);
}

function updateBotStatus(status) {
    const statusElement = document.getElementById('bot-status');
    if (statusElement) {
        statusElement.textContent = status || 'offline';
        statusElement.className = `status ${status || 'offline'}`;
    }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function loadUserAnalytics(userId) {
    fetch(`/api/analytics/user/${userId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.userStats) {
                displayUserAnalytics(data.userStats);
            }
        })
        .catch(error => {
            console.error('Error loading user analytics:', error);
        });
}

function loadGroupAnalytics(groupId, days = 7) {
    fetch(`/api/analytics/group/${groupId}?days=${days}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayGroupAnalytics(data.groupStats, data.recentActivities);
            }
        })
        .catch(error => {
            console.error('Error loading group analytics:', error);
        });
}

function displayUserAnalytics(stats) {
    const analyticsDiv = document.getElementById('user-analytics');
    if (analyticsDiv) {
        analyticsDiv.innerHTML = `
            <h3>User Analytics</h3>
            <p>Total Messages: ${stats.totalMessages || 0}</p>
            <p>Media Sent: ${stats.totalMediaSent || 0}</p>
            <p>Weekly Messages: ${stats.weeklyMessageCount || 0}</p>
            <p>Monthly Messages: ${stats.monthlyMessageCount || 0}</p>
            <p>Last Activity: ${stats.lastActivityType || 'N/A'}</p>
        `;
    }
}

function displayGroupAnalytics(stats, activities) {
    const analyticsDiv = document.getElementById('group-analytics');
    if (analyticsDiv && stats) {
        let html = `
            <h3>Group Analytics</h3>
            <p>Total Messages: ${stats.totalMessages || 0}</p>
            <p>Active Users: ${stats.activeUsers || 0}</p>
            <p>Media Messages: ${stats.mediaMessages || 0}</p>
            <p>Forwarded Messages: ${stats.forwardedMessages || 0}</p>
        `;

        if (stats.topUsers && stats.topUsers.length > 0) {
            html += '<h4>Top Users:</h4><ul>';
            stats.topUsers.forEach(user => {
                html += `<li>${user.userId || user._id}: ${user.messageCount} messages</li>`;
            });
            html += '</ul>';
        }

        if (activities && activities.length > 0) {
            html += '<h4>Recent Activities:</h4><ul>';
            activities.slice(0, 5).forEach(activity => {
                html += `<li>${activity.activityType} - ${new Date(activity.timestamp).toLocaleString()}</li>`;
            });
            html += '</ul>';
        }

        analyticsDiv.innerHTML = html;
    }
}

function cleanupMessages() {
    const days = prompt('Enter number of days to keep messages (default: 30):') || 30;

    fetch('/api/maintenance/cleanup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ daysToKeep: parseInt(days) })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`Successfully cleaned ${data.deletedCount} old messages`);
        } else {
            alert('Failed to cleanup messages: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error cleaning messages:', error);
        alert('Error cleaning messages');
    });
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    const dashboard = new LunaDashboard();
    loadStats();
    statsInterval = setInterval(loadStats, 30000); // Refresh every 30 seconds
});

// Stop interval when page is unloaded
window.addEventListener('beforeunload', function() {
    if (statsInterval) {
        clearInterval(statsInterval);
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LunaDashboard;
}