/**
 * Secure Storage Service
 * Provides encrypted storage for sensitive data like API keys
 */

import { logger } from '../core/config.js';

export class SecureStorageService {
    constructor() {
        this.keyPrefix = 'secure_';
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.isSupported = this.constructor.isSupported();
        
        // Only initialize encryption if Web Crypto API is supported
        if (this.isSupported) {
            this.initializeMasterKey().catch(error => {
                logger.error('Failed to initialize secure storage:', error);
                this.isSupported = false;
            });
        } else {
            logger.warn('Web Crypto API not supported - API keys will not be encrypted');
        }
    }

    /**
     * Initialize master encryption key
     */
    async initializeMasterKey() {
        try {
            // Check if master key exists
            const existingKey = localStorage.getItem('secure_master_key');
            
            if (existingKey) {
                // Import existing key
                const keyData = JSON.parse(existingKey);
                this.masterKey = await window.crypto.subtle.importKey(
                    'jwk',
                    keyData,
                    { name: this.algorithm },
                    false,
                    ['encrypt', 'decrypt']
                );
                logger.debug('Master encryption key imported successfully');
            } else {
                // Generate new master key
                this.masterKey = await window.crypto.subtle.generateKey(
                    { name: this.algorithm, length: this.keyLength },
                    true,
                    ['encrypt', 'decrypt']
                );
                
                // Export and store the key
                const exportedKey = await window.crypto.subtle.exportKey('jwk', this.masterKey);
                localStorage.setItem('secure_master_key', JSON.stringify(exportedKey));
                logger.debug('New master encryption key generated and stored');
            }
        } catch (error) {
            logger.error('Failed to initialize master key:', error);
            throw new Error('Encryption initialization failed');
        }
    }

    /**
     * Encrypt and store sensitive data
     * @param {string} key - Storage key
     * @param {string} data - Data to encrypt
     */
    async setSecureItem(key, data) {
        try {
            // If encryption is not supported, store as plaintext with warning
            if (!this.isSupported) {
                logger.warn(`Storing API key as plaintext (encryption not supported): ${key}`);
                localStorage.setItem(this.keyPrefix + key + '_plaintext', data);
                return true;
            }

            if (!this.masterKey) {
                await this.initializeMasterKey();
            }

            // Convert data to bytes
            const encoder = new TextEncoder();
            const dataBytes = encoder.encode(data);

            // Generate random IV
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            // Encrypt data
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: this.algorithm, iv: iv },
                this.masterKey,
                dataBytes
            );

            // Store encrypted data with IV
            const storageObject = {
                iv: Array.from(iv),
                data: Array.from(new Uint8Array(encryptedData)),
                timestamp: Date.now()
            };

            localStorage.setItem(this.keyPrefix + key, JSON.stringify(storageObject));
            logger.debug(`Secure item stored: ${key}`);
            return true;
        } catch (error) {
            logger.error('Failed to store secure item:', error);
            return false;
        }
    }

    /**
     * Decrypt and retrieve sensitive data
     * @param {string} key - Storage key
     * @returns {string|null} - Decrypted data or null if not found/error
     */
    async getSecureItem(key) {
        try {
            // If encryption is not supported, try to get plaintext version
            if (!this.isSupported) {
                const plaintextData = localStorage.getItem(this.keyPrefix + key + '_plaintext');
                if (plaintextData) {
                    logger.debug(`Retrieved plaintext item: ${key}`);
                    return plaintextData;
                }
                return null;
            }

            if (!this.masterKey) {
                await this.initializeMasterKey();
            }

            const storedData = localStorage.getItem(this.keyPrefix + key);
            if (!storedData) {
                // SECURITY: Removed plaintext fallback - fail securely instead
                // If encrypted version doesn't exist, return null
                return null;
            }

            const storageObject = JSON.parse(storedData);
            
            // Reconstruct IV and encrypted data
            const iv = new Uint8Array(storageObject.iv);
            const encryptedData = new Uint8Array(storageObject.data);

            // Decrypt data
            const decryptedData = await window.crypto.subtle.decrypt(
                { name: this.algorithm, iv: iv },
                this.masterKey,
                encryptedData
            );

            // Convert back to string
            const decoder = new TextDecoder();
            const result = decoder.decode(decryptedData);
            
            logger.debug(`Secure item retrieved: ${key}`);
            return result;
        } catch (error) {
            logger.error('Failed to retrieve secure item:', error);
            // SECURITY: Removed plaintext fallback - fail securely instead
            // Decryption errors should not silently fall back to unencrypted data
            return null;
        }
    }

    /**
     * Remove secure item
     * @param {string} key - Storage key
     */
    removeSecureItem(key) {
        try {
            localStorage.removeItem(this.keyPrefix + key);
            // Also remove any legacy plaintext version for cleanup
            localStorage.removeItem(this.keyPrefix + key + '_plaintext');
            logger.debug(`Secure item removed: ${key}`);
            return true;
        } catch (error) {
            logger.error('Failed to remove secure item:', error);
            return false;
        }
    }

    /**
     * Check if secure item exists
     * @param {string} key - Storage key
     */
    hasSecureItem(key) {
        return localStorage.getItem(this.keyPrefix + key) !== null;
    }

    /**
     * Migrate existing API keys to secure storage
     */
    async migrateApiKeys() {
        logger.debug('Starting API key migration to secure storage');
        
        const providers = ['openai', 'claude', 'huggingface'];
        let migratedCount = 0;

        for (const provider of providers) {
            const oldKey = `ai_api_key_${provider}`;
            const newKey = `api_key_${provider}`;
            
            try {
                const existingKey = localStorage.getItem(oldKey);
                if (existingKey && !this.hasSecureItem(newKey)) {
                    // Migrate to secure storage
                    const success = await this.setSecureItem(newKey, existingKey);
                    if (success) {
                        // Remove old unencrypted key
                        localStorage.removeItem(oldKey);
                        migratedCount++;
                        logger.debug(`Migrated API key for provider: ${provider}`);
                    }
                }
            } catch (error) {
                logger.error(`Failed to migrate API key for ${provider}:`, error);
            }
        }

        if (migratedCount > 0) {
            logger.info(`Successfully migrated ${migratedCount} API keys to secure storage`);
        }
    }

    /**
     * Clear all secure storage (emergency cleanup)
     */
    clearAllSecureData() {
        try {
            const keys = Object.keys(localStorage).filter(key => key.startsWith(this.keyPrefix));
            keys.forEach(key => localStorage.removeItem(key));
            
            // Also remove master key
            localStorage.removeItem('secure_master_key');
            this.masterKey = null;
            
            logger.info('All secure storage cleared');
            return true;
        } catch (error) {
            logger.error('Failed to clear secure storage:', error);
            return false;
        }
    }

    /**
     * Check if Web Crypto API is available
     */
    static isSupported() {
        return !!(window.crypto && window.crypto.subtle);
    }

    /**
     * Get storage statistics
     */
    getStorageStats() {
        const secureKeys = Object.keys(localStorage).filter(key => key.startsWith(this.keyPrefix));
        return {
            secureItemsCount: secureKeys.length,
            hasApiKeys: secureKeys.some(key => key.includes('api_key')),
            hasMasterKey: localStorage.getItem('secure_master_key') !== null
        };
    }
}

// Create singleton instance
export const secureStorage = new SecureStorageService();