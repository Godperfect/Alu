
const crypto = require('crypto');

class OTPService {
    constructor() {
        this.otpStore = new Map();
        this.otpExpiry = 5 * 60 * 1000; // 5 minutes
    }

    generateOTP(identifier) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = Date.now() + this.otpExpiry;
        
        this.otpStore.set(identifier, {
            otp: otp,
            expiry: expiry,
            attempts: 0
        });

        // Clean up expired OTPs
        this.cleanupExpiredOTPs();
        
        return otp;
    }

    verifyOTP(identifier, inputOTP) {
        const otpData = this.otpStore.get(identifier);
        
        if (!otpData) {
            return { success: false, message: 'OTP not found or expired' };
        }

        if (Date.now() > otpData.expiry) {
            this.otpStore.delete(identifier);
            return { success: false, message: 'OTP expired' };
        }

        otpData.attempts++;

        if (otpData.attempts > 3) {
            this.otpStore.delete(identifier);
            return { success: false, message: 'Too many attempts' };
        }

        if (otpData.otp === inputOTP) {
            this.otpStore.delete(identifier);
            return { success: true, message: 'OTP verified successfully' };
        }

        return { success: false, message: 'Invalid OTP' };
    }

    cleanupExpiredOTPs() {
        const now = Date.now();
        for (const [identifier, otpData] of this.otpStore.entries()) {
            if (now > otpData.expiry) {
                this.otpStore.delete(identifier);
            }
        }
    }

    isOTPValid(identifier) {
        const otpData = this.otpStore.get(identifier);
        return otpData && Date.now() <= otpData.expiry;
    }

    generateSecureToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    getOTPStatus(identifier) {
        const otpData = this.otpStore.get(identifier);
        if (!otpData) {
            return { exists: false, timeLeft: 0 };
        }
        
        const timeLeft = Math.max(0, otpData.expiry - Date.now());
        return {
            exists: timeLeft > 0,
            timeLeft: timeLeft
        };
    }
}

module.exports = OTPService;
