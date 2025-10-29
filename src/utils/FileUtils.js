'use strict';

const fs = require('fs');
const path = require('path');
const { IMAGE_EXTENSIONS } = require('../common/constants');

/**
 * File system utilities
 */
class FileUtils {
  /**
   * Get all files in a directory recursively
   * @param {string} dir - Directory path
   * @param {function} filter - Optional filter function
   * @returns {string[]} Array of file paths
   */
  static getAllFilesInDirectory(dir, filter = null) {
    const files = [];

    const walkDir = (currentDir) => {
      try {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            walkDir(fullPath);
          } else {
            if (!filter || filter(fullPath)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Ignore errors (e.g., permission denied)
      }
    };

    walkDir(dir);
    return files;
  }

  /**
   * Get all image files in a directory
   * @param {string} dir - Directory path
   * @returns {string[]} Array of image file paths
   */
  static getAllImages(dir) {
    return this.getAllFilesInDirectory(dir, (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext);
    });
  }

  /**
   * Check if a file has a specific extension
   * @param {string} filePath - File path
   * @param {string[]} extensions - Array of extensions (e.g., ['.png', '.jpg'])
   * @returns {boolean}
   */
  static hasExtension(filePath, extensions) {
    const ext = path.extname(filePath).toLowerCase();
    return extensions.includes(ext);
  }

  /**
   * Analyze images in a folder
   * @param {string} dir - Directory path
   * @returns {object} Statistics about images
   */
  static analyzeImagesInFolder(dir) {
    const imageStats = {
      total: 0,
      png: 0,
      jpg: 0,
      webp: 0,
      details: []
    };

    const analyzeDir = (currentDir) => {
      try {
        const list = fs.readdirSync(currentDir);
        for (const file of list) {
          const filePath = path.join(currentDir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            analyzeDir(filePath);
          } else {
            const ext = path.extname(file).toLowerCase();
            if (IMAGE_EXTENSIONS.includes(ext)) {
              imageStats.total++;
              imageStats.details.push({
                path: filePath,
                name: file,
                ext: ext,
                size: stat.size
              });

              // Count by type
              if (ext === '.png') {
                imageStats.png++;
              } else if (['.jpg', '.jpeg'].includes(ext)) {
                imageStats.jpg++;
              } else if (ext === '.webp') {
                imageStats.webp++;
              }
            }
          }
        }
      } catch (error) {
        // Silent fail
      }
    };

    analyzeDir(dir);
    return imageStats;
  }

  /**
   * Clean up empty directories recursively
   * @param {string} rootPath - Root directory path
   */
  static cleanupEmptyDirectories(rootPath) {
    const cleanupDir = (dir) => {
      if (!fs.existsSync(dir)) return;

      try {
        const items = fs.readdirSync(dir);

        // Recursively cleanup subdirectories first
        for (const item of items) {
          const fullPath = path.join(dir, item);
          if (fs.statSync(fullPath).isDirectory()) {
            cleanupDir(fullPath);
          }
        }

        // Check if directory is empty after cleanup
        const remainingItems = fs.readdirSync(dir);
        if (remainingItems.length === 0 && dir !== rootPath) {
          fs.rmdirSync(dir);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    };

    cleanupDir(rootPath);
  }

  /**
   * Move a file from source to target
   * @param {string} source - Source file path
   * @param {string} target - Target file path
   * @returns {Promise<void>}
   */
  static async moveFile(source, target) {
    return new Promise((resolve, reject) => {
      fs.rename(source, target, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Generate a unique folder name with sequential numbering
   * @param {string} parentDir - Parent directory path
   * @param {string} baseName - Base folder name (default: 'optimize')
   * @returns {string} Unique folder name
   */
  static generateUniqueFolderName(parentDir, baseName = 'optimize') {
    // First try base name
    if (!fs.existsSync(path.join(parentDir, baseName))) {
      return baseName;
    }
    
    // If base name exists, try baseName_1, baseName_2, etc.
    let counter = 1;
    let folderName = `${baseName}_${counter}`;
    
    // Find next available number
    while (fs.existsSync(path.join(parentDir, folderName))) {
      counter++;
      folderName = `${baseName}_${counter}`;
    }
    
    return folderName;
  }

  /**
   * Read file content with caching support
   * @param {string} filePath - File path
   * @param {string} encoding - File encoding (default: 'utf8')
   * @returns {string} File content
   */
  static readFileSync(filePath, encoding = 'utf8') {
    return fs.readFileSync(filePath, encoding);
  }

  /**
   * Check if path exists
   * @param {string} filePath - File or directory path
   * @returns {boolean}
   */
  static exists(filePath) {
    return fs.existsSync(filePath);
  }

  /**
   * Create directory recursively
   * @param {string} dirPath - Directory path
   */
  static mkdirSync(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Copy file with meta file support
   * @param {string} source - Source file path
   * @param {string} target - Target file path
   * @param {boolean} copyMeta - Whether to copy .meta file (default: true)
   */
  static copyFileWithMeta(source, target, copyMeta = true) {
    // Copy main file
    fs.copyFileSync(source, target);

    // Copy .meta file if exists
    if (copyMeta) {
      const sourceMeta = source + '.meta';
      const targetMeta = target + '.meta';
      if (fs.existsSync(sourceMeta)) {
        fs.copyFileSync(sourceMeta, targetMeta);
      }
    }
  }

  /**
   * Delete file with meta file support
   * @param {string} filePath - File path
   * @param {boolean} deleteMeta - Whether to delete .meta file (default: true)
   */
  static deleteFileWithMeta(filePath, deleteMeta = true) {
    // Delete main file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete .meta file
    if (deleteMeta) {
      const metaPath = filePath + '.meta';
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }
    }
  }
}

module.exports = FileUtils;

