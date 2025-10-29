'use strict';

/**
 * Global configuration for the extension
 */
module.exports = {
  // Debug mode - set to false in production
  DEBUG: false,

  // Logging configuration
  LOGGING: {
    ENABLED: true,
    LEVEL: 'warn', // 'debug', 'info', 'warn', 'error', 'none'
    CONSOLE_OUTPUT: false, // Log to Cocos Creator console
    UI_OUTPUT: true // Log to panel UI
  },

  // Performance settings
  PERFORMANCE: {
    BATCH_SIZE: 10,
    YIELD_DELAY: 1,
    PROGRESS_UPDATE_INTERVAL: 100
  }
};

