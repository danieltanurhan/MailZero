import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

/**
 * Get encryption key from environment variable
 * @returns {Buffer} - The encryption key
 */
const getEncryptionKey = () => {
  const key = process.env.EMAIL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('EMAIL_ENCRYPTION_KEY environment variable is not set');
  }
  
  // Create a consistent key from the environment variable
  return crypto.createHash('sha256').update(key).digest();
};

/**
 * Encrypt a password
 * @param {string} password - The password to encrypt
 * @returns {string} - The encrypted password (base64 encoded)
 */
export const encryptPassword = (password) => {
  if (!password) return null;
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine IV and encrypted password
    const combined = iv.toString('hex') + ':' + encrypted;
    
    // Return base64 encoded result
    return Buffer.from(combined).toString('base64');
  } catch (error) {
    console.error('Error encrypting password:', error);
    throw new Error('Failed to encrypt password');
  }
};

/**
 * Decrypt a password
 * @param {string} encryptedPassword - The encrypted password (base64 encoded)
 * @returns {string} - The decrypted password
 */
export const decryptPassword = (encryptedPassword) => {
  if (!encryptedPassword) return null;
  
  try {
    const key = getEncryptionKey();
    
    // Decode from base64
    const combined = Buffer.from(encryptedPassword, 'base64').toString('utf8');
    
    // Split IV and encrypted password
    const [ivHex, encrypted] = combined.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting password:', error);
    throw new Error('Failed to decrypt password');
  }
};

/**
 * Generate a secure random key for EMAIL_ENCRYPTION_KEY
 * @returns {string} - A secure random key
 */
export const generateEncryptionKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Validate that encryption is working correctly
 * @returns {boolean} - True if encryption is working
 */
export const validateEncryption = () => {
  try {
    const testPassword = 'test-password-123';
    const encrypted = encryptPassword(testPassword);
    const decrypted = decryptPassword(encrypted);
    
    return decrypted === testPassword;
  } catch (error) {
    console.error('Encryption validation failed:', error);
    return false;
  }
}; 