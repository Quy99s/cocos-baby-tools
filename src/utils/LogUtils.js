'use strict';

/**
 * Logging utilities for consistent logging across the extension
 */
class LogUtils {
  /**
   * Log a message to Cocos Creator console
   * @param {string} msg - Message to log
   * @param {string} type - Log type: 'info', 'success', 'warning', 'error'
   * @param {string} prefix - Optional prefix (default: '[BabyTools]')
   */
  static log(msg, type = 'info', prefix = '[BabyTools]') {
    const fullMsg = `${prefix} ${msg}`;
    
    switch (type) {
      case 'error':
        console.error(fullMsg);
        break;
      case 'warning':
        console.warn(fullMsg);
        break;
      case 'success':
        console.log(`✅ ${fullMsg}`);
        break;
      default:
        console.log(fullMsg);
        break;
    }
  }

  /**
   * Log info message
   * @param {string} msg - Message
   * @param {string} prefix - Optional prefix
   */
  static info(msg, prefix = '[BabyTools]') {
    this.log(msg, 'info', prefix);
  }

  /**
   * Log success message
   * @param {string} msg - Message
   * @param {string} prefix - Optional prefix
   */
  static success(msg, prefix = '[BabyTools]') {
    this.log(msg, 'success', prefix);
  }

  /**
   * Log warning message
   * @param {string} msg - Message
   * @param {string} prefix - Optional prefix
   */
  static warn(msg, prefix = '[BabyTools]') {
    this.log(msg, 'warning', prefix);
  }

  /**
   * Log error message
   * @param {string} msg - Message
   * @param {string} prefix - Optional prefix
   */
  static error(msg, prefix = '[BabyTools]') {
    this.log(msg, 'error', prefix);
  }

  /**
   * Create a UI logger that appends to a DOM element
   * @param {HTMLElement} logElement - DOM element to append logs to
   * @returns {object} Logger object with log methods
   */
  static createUILogger(logElement) {
    return {
      log: (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = type === 'error' ? '❌' : 
                      type === 'success' ? '✅' : 
                      type === 'warning' ? '⚠️' : 'ℹ️';
        
        logElement.innerText += `[${timestamp}] ${prefix} ${message}\n`;
        
        // Auto scroll to bottom
        logElement.scrollTop = logElement.scrollHeight;
        
        // Also log to console
        LogUtils.log(message, type);
      },
      
      clear: () => {
        logElement.innerText = '';
      }
    };
  }

  /**
   * Format bytes to human-readable size
   * @param {number} bytes - Bytes
   * @param {number} decimals - Number of decimals (default: 2)
   * @returns {string} Formatted size
   */
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Format duration in milliseconds to readable string
   * @param {number} ms - Milliseconds
   * @returns {string} Formatted duration
   */
  static formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }
}

module.exports = LogUtils;

