'use strict';

const { CACHE_CONFIG } = require('../common/constants');

/**
 * LRU Cache implementation for better memory management
 */
class LRUCache {
  constructor(maxSize = CACHE_CONFIG.MAX_CACHE_SIZE, maxMemory = CACHE_CONFIG.MAX_MEMORY) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxMemory = maxMemory;
    this.memoryEstimate = 0;
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // If key exists, remove it first
    if (this.cache.has(key)) {
      const oldValue = this.cache.get(key);
      this.memoryEstimate -= (oldValue?.length || 0) * 2;
      this.cache.delete(key);
    }

    // Remove least recently used items if cache is full
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      const firstValue = this.cache.get(firstKey);
      this.cache.delete(firstKey);
      this.memoryEstimate -= (firstValue?.length || 0) * 2;
    }

    // If memory would exceed limit, remove oldest entries
    const newMemory = (value?.length || 0) * 2;
    while (this.memoryEstimate + newMemory > this.maxMemory && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      const firstValue = this.cache.get(firstKey);
      this.cache.delete(firstKey);
      this.memoryEstimate -= (firstValue?.length || 0) * 2;
    }

    this.cache.set(key, value);
    this.memoryEstimate += newMemory;
  }

  clear() {
    this.cache.clear();
    this.memoryEstimate = 0;
  }

  get size() {
    return this.cache.size;
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      memory: Math.round(this.memoryEstimate / 1024 / 1024), // MB
      maxMemory: Math.round(this.maxMemory / 1024 / 1024) // MB
    };
  }
}

/**
 * Cache manager for asset and file operations
 */
class CacheManager {
  constructor() {
    this.assetInfoCache = new Map();
    this.fileContentCache = null; // Will be initialized as LRU cache when needed
    this.scanResultsCache = null;
    this.searchableAssetsCache = null;
    this.cachedSearchPath = null;
    this.searchMethod = null;
  }

  /**
   * Initialize file content cache
   */
  initFileCache() {
    if (!this.fileContentCache) {
      this.fileContentCache = new LRUCache(
        CACHE_CONFIG.MAX_CACHE_SIZE, 
        CACHE_CONFIG.MAX_MEMORY
      );
    }
  }

  /**
   * Add file content to cache
   * @param {string} filePath - File path
   * @param {string} content - File content
   */
  addFileToCache(filePath, content) {
    this.initFileCache();
    this.fileContentCache.set(filePath, content);
  }

  /**
   * Get file content from cache
   * @param {string} filePath - File path
   * @returns {string|undefined} File content or undefined
   */
  getFileFromCache(filePath) {
    this.initFileCache();
    return this.fileContentCache.get(filePath);
  }

  /**
   * Add asset info to cache
   * @param {string} uuid - Asset UUID
   * @param {object} info - Asset info
   */
  addAssetInfo(uuid, info) {
    this.assetInfoCache.set(uuid, info);
  }

  /**
   * Get asset info from cache
   * @param {string} uuid - Asset UUID
   * @returns {object|undefined} Asset info or undefined
   */
  getAssetInfo(uuid) {
    return this.assetInfoCache.get(uuid);
  }

  /**
   * Set scan results cache
   * @param {Array} results - Scan results
   */
  setScanResults(results) {
    this.scanResultsCache = results;
  }

  /**
   * Get scan results from cache
   * @returns {Array|null} Scan results or null
   */
  getScanResults() {
    return this.scanResultsCache;
  }

  /**
   * Set searchable assets cache
   * @param {Array} assets - Searchable assets
   * @param {string} searchPath - Search path
   */
  setSearchableAssets(assets, searchPath) {
    this.searchableAssetsCache = assets;
    this.cachedSearchPath = searchPath;
  }

  /**
   * Get searchable assets from cache
   * @returns {Array|null} Searchable assets or null
   */
  getSearchableAssets() {
    return this.searchableAssetsCache;
  }

  /**
   * Clear all caches
   */
  clearAll() {
    this.assetInfoCache.clear();
    if (this.fileContentCache) {
      this.fileContentCache.clear();
    }
    this.scanResultsCache = null;
    this.searchableAssetsCache = null;
    this.cachedSearchPath = null;
    this.searchMethod = null;
  }

  /**
   * Clear search cache only
   */
  clearSearchCache() {
    this.searchableAssetsCache = null;
    this.cachedSearchPath = null;
  }

  /**
   * Clear file content cache only
   */
  clearFileContentCache() {
    if (this.fileContentCache) {
      this.fileContentCache.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getCacheStats() {
    if (!this.fileContentCache) return { size: 0, memory: 0 };
    return this.fileContentCache.getStats();
  }
}

module.exports = {
  LRUCache,
  CacheManager
};

