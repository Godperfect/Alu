
const sqlite3 = require('sqlite3').verbose();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logSuccess } = require('../../utils/logger');
const config = require('../../config.json');

class DatabaseManager {
    constructor() {
        this.sqlite = null;
        this.mongodb = null;
        this.type = config.database.type;
    }

    async initialize() {
        try {
            if (this.type === 'sqlite') {
                await this.initSQLite();
            } else if (this.type === 'mongodb') {
                await this.initMongoDB();
            }
            logSuccess(`Database (${this.type}) initialized successfully`);
        } catch (error) {
            logError(`Failed to initialize database: ${error.message}`);
        }
    }

    async initSQLite() {
        const dbPath = config.database.sqlite.path;
        const dbDir = path.dirname(dbPath);
        
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.sqlite = new sqlite3.Database(dbPath);
        
        // Create tables
        await this.createTables();
    }

    async initMongoDB() {
        if (!config.database.mongodb.uri) {
            throw new Error('MongoDB URI not provided');
        }

        this.mongodb = new MongoClient(config.database.mongodb.uri);
        await this.mongodb.connect();
        logInfo('Connected to MongoDB');
    }

    async createTables() {
        return new Promise((resolve, reject) => {
            const queries = [
                `CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    exp INTEGER DEFAULT 0,
                    money INTEGER DEFAULT 0,
                    banned INTEGER DEFAULT 0,
                    data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                `CREATE TABLE IF NOT EXISTS groups (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                `CREATE TABLE IF NOT EXISTS global_data (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`
            ];

            let completed = 0;
            queries.forEach(query => {
                this.sqlite.run(query, (err) => {
                    if (err) reject(err);
                    completed++;
                    if (completed === queries.length) resolve();
                });
            });
        });
    }

    async getUser(userId) {
        if (this.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.sqlite.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                    if (err) reject(err);
                    resolve(row || null);
                });
            });
        }
    }

    async setUser(userId, data) {
        if (this.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                const { name, exp = 0, money = 0, banned = 0, userData = '{}' } = data;
                this.sqlite.run(
                    'INSERT OR REPLACE INTO users (id, name, exp, money, banned, data) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, name, exp, money, banned, JSON.stringify(userData)],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    }
                );
            });
        }
    }

    async getGlobal(key) {
        if (this.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.sqlite.get('SELECT value FROM global_data WHERE key = ?', [key], (err, row) => {
                    if (err) reject(err);
                    resolve(row ? JSON.parse(row.value) : null);
                });
            });
        }
    }

    async setGlobal(key, value) {
        if (this.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.sqlite.run(
                    'INSERT OR REPLACE INTO global_data (key, value) VALUES (?, ?)',
                    [key, JSON.stringify(value)],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    }
                );
            });
        }
    }
}

module.exports = DatabaseManager;
