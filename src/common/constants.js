'use strict';

/**
 * Constants used across the extension
 */
module.exports = {
  // Supported file extensions for asset analysis
  SUPPORTED_ASSET_EXTENSIONS: [
    '.png', '.jpg', '.jpeg', '.webp', 
    '.prefab', '.scene', '.json', 
    '.mp3', '.wav', '.ogg', 
    '.fnt', '.atlas'
  ],

  // File extensions that can be searched for references
  SEARCHABLE_EXTENSIONS: [
    '.prefab', '.scene', '.fire', 
    '.json', '.mtl', '.anim'
  ],

  // Image file extensions
  IMAGE_EXTENSIONS: [
    '.png', '.jpg', '.jpeg', '.webp'
  ],

  // Cache configuration
  CACHE_CONFIG: {
    MAX_CACHE_SIZE: 2000, // Maximum number of files in cache
    MAX_MEMORY: 200 * 1024 * 1024, // Maximum memory (200MB)
  },

  // Folder settings key for localStorage
  FOLDER_CONFIG_KEY: 'tinyimage-folder-config',

  // Batch processing size
  BATCH_SIZE: 10,

  // File operation delays
  DELAYS: {
    YIELD_CONTROL: 1, // Yield control every N ms
    PROGRESS_UPDATE: 100, // Update progress every N files
  }
};

