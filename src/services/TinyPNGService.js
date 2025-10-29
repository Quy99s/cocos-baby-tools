'use strict';

const fs = require('fs');
const path = require('path');
const tinify = require('tinify');

/**
 * Service for TinyPNG image optimization
 */
class TinyPNGService {
  constructor() {
    this.apiKey = null;
    this.compressionCount = 0;
  }

  /**
   * Set TinyPNG API key
   * @param {string} key - API key
   */
  setApiKey(key) {
    this.apiKey = key;
    tinify.key = key;
  }

  /**
   * Get current API key
   * @returns {string|null} API key or null
   */
  getApiKey() {
    return this.apiKey;
  }

  /**
   * Check API usage
   * @returns {Promise<object>} Usage info {used, remaining, total}
   */
  async checkUsage() {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    try {
      // Make a small test to get compression count
      const testBuffer = Buffer.from('test');
      try {
        await tinify.fromBuffer(testBuffer).toBuffer();
      } catch (e) {
        // Expected to fail, but will give us compression count
      }

      const used = tinify.compressionCount || 0;
      const total = 500;
      const remaining = total - used;

      this.compressionCount = used;

      return {
        used,
        remaining,
        total,
        percentage: Math.round((used / total) * 100)
      };
    } catch (error) {
      throw new Error(`Failed to check API usage: ${error.message}`);
    }
  }

  /**
   * Optimize a single image file
   * @param {string} inputPath - Input file path
   * @param {string} outputPath - Output file path
   * @returns {Promise<object>} Optimization result {beforeSize, afterSize, saved, percentage}
   */
  async optimizeImage(inputPath, outputPath) {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const beforeSize = fs.statSync(inputPath).size;

      // Optimize image
      const source = tinify.fromFile(inputPath);
      await source.toFile(outputPath);

      const afterSize = fs.statSync(outputPath).size;
      const saved = beforeSize - afterSize;
      const percentage = Math.round((1 - afterSize / beforeSize) * 100);

      // Update compression count
      this.compressionCount = tinify.compressionCount;

      return {
        beforeSize,
        afterSize,
        saved,
        percentage,
        beforeKB: beforeSize / 1024,
        afterKB: afterSize / 1024,
        savedKB: saved / 1024
      };
    } catch (error) {
      throw new Error(`Failed to optimize ${path.basename(inputPath)}: ${error.message}`);
    }
  }

  /**
   * Optimize multiple images
   * @param {string[]} inputFiles - Array of input file paths
   * @param {string} inputFolder - Input folder base path
   * @param {string} outputFolder - Output folder base path
   * @param {function} onProgress - Progress callback (current, total, file, result)
   * @returns {Promise<object>} Summary {optimized, errors, totalSaved, results}
   */
  async optimizeImages(inputFiles, inputFolder, outputFolder, onProgress = null) {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    const results = [];
    let optimized = 0;
    let errors = 0;
    let totalSaved = 0;

    for (let i = 0; i < inputFiles.length; i++) {
      const inputFile = inputFiles[i];
      const relativePath = path.relative(inputFolder, inputFile);
      const outputPath = path.join(outputFolder, relativePath);

      try {
        const result = await this.optimizeImage(inputFile, outputPath);
        
        results.push({
          file: relativePath,
          success: true,
          ...result
        });

        optimized++;
        totalSaved += result.saved;

        if (onProgress) {
          onProgress(i + 1, inputFiles.length, relativePath, result);
        }
      } catch (error) {
        results.push({
          file: relativePath,
          success: false,
          error: error.message
        });

        errors++;

        if (onProgress) {
          onProgress(i + 1, inputFiles.length, relativePath, null, error);
        }
      }
    }

    return {
      optimized,
      errors,
      totalSaved,
      totalSavedMB: totalSaved / 1024 / 1024,
      results,
      compressionCount: this.compressionCount
    };
  }

  /**
   * Get current compression count
   * @returns {number} Compression count
   */
  getCompressionCount() {
    return tinify.compressionCount || this.compressionCount;
  }

  /**
   * Validate API key
   * @param {string} key - API key to validate
   * @returns {Promise<boolean>} True if valid
   */
  async validateApiKey(key) {
    try {
      tinify.key = key;
      
      // Try a small test
      const testBuffer = Buffer.from('test');
      try {
        await tinify.fromBuffer(testBuffer).toBuffer();
      } catch (e) {
        // Expected to fail, but if it's an API key error, it will throw differently
      }

      // If we get here and have a compression count, key is valid
      return tinify.compressionCount !== undefined;
    } catch (error) {
      if (error.message && error.message.includes('Credentials are invalid')) {
        return false;
      }
      // Other errors might still mean the key is valid
      return true;
    }
  }
}

module.exports = TinyPNGService;

