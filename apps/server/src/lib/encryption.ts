import { env } from 'cloudflare:workers';

/**
 * Encryption utilities for email passwords
 * Based on the working JavaScript implementation using AES-256-CBC
 */

const ALGORITHM = 'AES-CBC'; // Web Crypto API format
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

/**
 * Get encryption key from environment variable
 * @returns {Promise<ArrayBuffer>} - The encryption key
 */
const getEncryptionKey = async (): Promise<ArrayBuffer> => {
  const key = (env as any).EMAIL_ENCRYPTION_KEY || (env as any).ENCRYPTION_KEY || 'bartalogistics-encryption-key-2025';
  console.log('[ENCRYPT] Using encryption key source:', key ? 'present' : 'missing');
  
  // Create a consistent key from the environment variable using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  return await crypto.subtle.digest('SHA-256', data);
};

/**
 * Simple encryption function (compatible with original JS system)
 * @param text - Plain text to encrypt
 * @returns Encrypted hex string
 */
export const encryptPassword = async (text: string): Promise<string> => {
  try {
    const keyBuffer = await getEncryptionKey();
    const key = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: ALGORITHM, length: 256 },
      false,
      ['encrypt']
    );
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Encrypt the text
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const encrypted = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );
    
    // Combine IV and encrypted data
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
    const combined = ivHex + ':' + encryptedHex;
    
    // Return base64 encoded result
    const encoder2 = new TextEncoder();
    const combinedBytes = encoder2.encode(combined);
    const base64 = btoa(String.fromCharCode(...combinedBytes));
    
    return base64;
  } catch (error) {
    console.error('[ENCRYPT] Error encrypting password:', error);
    return text; // Fallback to plain text
  }
};

/**
 * Simple decryption function (compatible with original JS system)
 * @param encryptedPassword - Encrypted password (base64 encoded)
 * @returns Decrypted plain text
 */
export const decryptPassword = async (encryptedPassword: string): Promise<string> => {
  try {
    console.log('[DECRYPT-AES] Decrypting password...');
    const keyBuffer = await getEncryptionKey();
    const key = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: ALGORITHM, length: 256 },
      false,
      ['decrypt']
    );
    
    // Decode from base64
    const combined = atob(encryptedPassword);
    console.log('[DECRYPT-AES] Combined after base64 decode:', combined.substring(0, 50) + '...');
    
    // Split IV and encrypted password
    const [ivHex, encryptedHex] = combined.split(':');
    console.log('[DECRYPT-AES] IV hex:', ivHex);
    console.log('[DECRYPT-AES] Encrypted hex length:', encryptedHex?.length);
    
    if (!ivHex || !encryptedHex) {
      throw new Error('Invalid encrypted password format');
    }
    
    // Convert hex strings back to bytes
    const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    const encryptedBytes = new Uint8Array(encryptedHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    
    console.log('[DECRYPT-AES] IV bytes length:', iv.length);
    console.log('[DECRYPT-AES] Encrypted bytes length:', encryptedBytes.length);
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      encryptedBytes
    );
    
    // Convert back to string
    const decoder = new TextDecoder();
    const result = decoder.decode(decrypted);
    console.log('[DECRYPT-AES] Successfully decrypted password length:', result.length);
    console.log('[DECRYPT-AES] Decrypted preview:', result.substring(0, 5) + '***');
    
    return result;
  } catch (error) {
    console.error('[DECRYPT-AES] Error decrypting password:', error);
    return encryptedPassword; // Fallback to original
  }
};

/**
 * Decrypt password from the format stored in Firestore
 * Handles the double encoding: base64(iv_hex:encrypted_hex) - this is AES-256-CBC format
 * @param storedPassword - Password as stored in Firestore (base64 encoded)
 * @returns Decrypted password
 */
export const decryptStoredPassword = async (storedPassword: string): Promise<string> => {
  try {
    console.log('[DECRYPT] Input (base64):', storedPassword.substring(0, 20) + '...');
    
    // The stored password is in the format: base64(iv_hex:encrypted_hex)
    // This is the standard AES-256-CBC format that our decryptPassword function handles
    
    // Try AES decryption first - this is the correct method
    console.log('[DECRYPT] Attempting AES decryption (primary method)...');
    const decrypted = await decryptPassword(storedPassword);
    
    // Check if decryption was successful (not just returning the original)
    if (decrypted !== storedPassword && decrypted.length > 0) {
      console.log('[DECRYPT] AES decryption successful!');
      console.log('[DECRYPT] Decrypted password length:', decrypted.length);
      console.log('[DECRYPT] Decrypted password preview:', decrypted.substring(0, 5) + '***');
      return decrypted;
    }
    
    console.log('[DECRYPT] AES decryption failed, trying fallback methods...');
    
    // Fallback: Base64 decode to see the raw format
    let combinedString: string;
    try {
      combinedString = Buffer.from(storedPassword, 'base64').toString('utf-8');
      console.log('[DECRYPT] After base64 decode:', combinedString.substring(0, 50) + '...');
    } catch (e) {
      console.log('[DECRYPT] Not base64 encoded, using as-is');
      combinedString = storedPassword;
    }
    
    // If we have colon-separated parts and AES failed, try other methods
    if (combinedString.includes(':')) {
      const parts = combinedString.split(':');
      console.log('[DECRYPT] Found', parts.length, 'colon-separated parts');
      
      if (parts.length === 2) {
        // This might be user:pass format or some other encryption
        const [part1, part2] = parts;
        console.log('[DECRYPT] Part 1 length:', part1.length);
        console.log('[DECRYPT] Part 2 length:', part2.length);
        
        // Try XOR as last resort
        try {
          const passBytes = new Uint8Array(part2.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
          const key = 'bartalogistics-encryption-key-2025';
          let decrypted = '';
          
          for (let i = 0; i < passBytes.length; i++) {
            const keyChar = key.charCodeAt(i % key.length);
            const decryptedChar = passBytes[i] ^ keyChar;
            decrypted += String.fromCharCode(decryptedChar);
          }
          
          console.log('[DECRYPT] XOR fallback result:', decrypted.substring(0, 5) + '***');
          return decrypted;
        } catch (error) {
          console.error('[DECRYPT] XOR fallback failed:', error);
          return part2; // Return the second part as-is
        }
      }
    }
    
    // Final fallback - return original
    console.log('[DECRYPT] All decryption methods failed, returning original');
    return storedPassword;
    
  } catch (error) {
    console.error('[DECRYPT] Error in decryptStoredPassword:', error);
    return storedPassword; // Fallback
  }
};

/**
 * Test decryption with different possible formats (for debugging)
 * @param storedPassword - Password as stored in Firestore
 * @returns Object with different decryption attempts
 */
export const testDecryption = async (storedPassword: string) => {
  console.log('[DECRYPT-TEST] Testing decryption methods...');
  
  const results = {
    original: storedPassword,
    asAESDecrypt: '',
    asBase64Decode: '',
  };
  
  try {
    // Try AES decryption
    results.asAESDecrypt = await decryptPassword(storedPassword);
    
    // Try base64 decode (in case it's double-encoded)
    try {
      results.asBase64Decode = Buffer.from(storedPassword, 'base64').toString('utf-8');
    } catch (e) {
      results.asBase64Decode = 'Not base64';
    }
    
  } catch (error) {
    console.error('[DECRYPT-TEST] Error:', error);
  }
  
  console.log('[DECRYPT-TEST] AES result length:', results.asAESDecrypt.length);
  return results;
}; 