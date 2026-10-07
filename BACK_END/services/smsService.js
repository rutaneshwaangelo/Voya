// ============================================================
// SMS SERVICE - RWANDA MOBILE NOTIFICATION SIMULATOR
// Simulates MTN Mobile Money & Airtel SMS dispatch
// Ready for Twilio / Africa's Talking API in production
// ============================================================

export class SMSService {
  /**
   * Generate secure 6-digit verification code
   */
  static generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Get expiration date
   * @param {number} minutes
   */
  static getCodeExpiry(minutes = 10) {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + minutes);
    return expiry;
  }

  /**
   * Check if code is expired
   * @param {Date} expiryTime
   */
  static isCodeExpired(expiryTime) {
    if (!expiryTime) return true;
    return new Date() > new Date(expiryTime);
  }

  /**
   * Send verification code via SMS
   */
  static async sendVerificationCode(phoneNumber, code, type = 'verification') {
    let message = '';
    switch (type) {
      case 'password_reset':
        message = `VOYA: Your password recovery code is ${code}. Valid for 10 mins. Do not share.`;
        break;
      case 'payment_verification':
        message = `VOYA MoMo: Use code ${code} to authorize payment. Valid for 5 mins.`;
        break;
      case 'driver_activation':
        message = `VOYA: Congratulations! Your driver account has been approved by admin. You can now go online.`;
        break;
      default:
        message = `VOYA: Your verification code is ${code}. Valid for 10 minutes.`;
    }

    console.log(`
    ╔════════════════════════════════════════════════════════════╗
    ║ 📱 VOYA SMS NOTIFICATION (SIMULATED RWANDA GATEWAY)        ║
    ╠════════════════════════════════════════════════════════════╣
    ║ To:      ${phoneNumber.padEnd(49)} ║
    ║ Type:    ${type.padEnd(49)} ║
    ║ Time:    ${new Date().toLocaleTimeString().padEnd(49)} ║
    ╠════════════════════════════════════════════════════════════╣
    ║ CODE:    ${code.padEnd(49)} ║
    ║ Message: ${message.padEnd(49)} ║
    ╚════════════════════════════════════════════════════════════╝
    `);

    return {
      success: true,
      phoneNumber,
      code,
      message,
      sentAt: new Date(),
    };
  }

  /**
   * Send payment receipt SMS
   */
  static async sendPaymentReceipt(phoneNumber, { amount, method, transactionRef, driverEarnings, commission }) {
    const message = `VOYA: Payment of ${amount} RWF via ${method.toUpperCase()} confirmed! Ref: ${transactionRef}. Thank you for riding with VOYA.`;
    
    console.log(`
    ╔════════════════════════════════════════════════════════════╗
    ║ 💳 VOYA PAYMENT RECEIPT SMS (SIMULATED)                   ║
    ╠════════════════════════════════════════════════════════════╣
    ║ Recipient:  ${phoneNumber.padEnd(46)} ║
    ║ Total Fare: ${(amount + ' RWF').padEnd(46)} ║
    ║ Driver Net: ${(driverEarnings + ' RWF (80%)').padEnd(46)} ║
    ║ VOYA Fee:   ${(commission + ' RWF (20%)').padEnd(46)} ║
    ║ Reference:  ${transactionRef.padEnd(46)} ║
    ╚════════════════════════════════════════════════════════════╝
    `);

    return { success: true, transactionRef };
  }
}

export default SMSService;
