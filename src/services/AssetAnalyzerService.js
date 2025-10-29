'use strict';

const fs = require('fs');
const path = require('path');
const FileUtils = require('../utils/FileUtils');
const AssetUtils = require('../utils/AssetUtils');
const { CacheManager } = require('../utils/CacheUtils');
const { BATCH_SIZE, SEARCHABLE_EXTENSIONS } = require('../common/constants');

/**
 * Service for analyzing asset usage in Cocos Creator projects
 */
class AssetAnalyzerService {
  constructor() {
    this.cache = new CacheManager();
  }

  /**
   * Analyze assets in a folder to find unused assets
   * @param {string} scanPath - Path to scan
   * @param {string} searchPath - Path to search for references (optional)
   * @param {function} onProgress - Progress callback (current, total, currentFile)
   * @returns {Promise<Array>} Array of results with usage info
   */
  async analyzeAssets(scanPath, searchPath = null, onProgress = null) {
    // Build asset list
    const assetList = AssetUtils.buildAssetList(scanPath);

    if (assetList.length === 0) {
      return [];
    }

    const dependencyUsedAssets = new Set();

    // Check skeleton dependencies
    await this.checkSkeletonDependencies(assetList, dependencyUsedAssets, searchPath);

    // Check font dependencies
    await this.checkFontDependencies(assetList, dependencyUsedAssets, searchPath);

    // Process assets in batches
    const results = [];
    for (let i = 0; i < assetList.length; i += BATCH_SIZE) {
      const batch = assetList.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (asset) => {
        if (onProgress) {
          onProgress(i + batch.indexOf(asset), assetList.length, asset.name);
        }

        // Check if asset is used as dependency
        const isUsedAsDependency = dependencyUsedAssets.has(asset.uuid);

        // Check normal usage
        const refs = await this.checkUUIDUsage(asset.uuid, searchPath);
        const isUsedNormally = refs.length > 0;

        return {
          ...asset,
          isUsed: isUsedNormally || isUsedAsDependency,
          references: refs,
          usedAsDependency: isUsedAsDependency
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Yield control
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    return results;
  }

  /**
   * Check skeleton animation dependencies
   * @param {Array} assetList - List of assets
   * @param {Set} usedAssets - Set to store used asset UUIDs
   * @param {string} searchPath - Search path
   */
  async checkSkeletonDependencies(assetList, usedAssets, searchPath = null) {
    const skeletonGroups = AssetUtils.parseSkeletonGroups(assetList);

    // Find textures for each atlas
    for (const [baseName, group] of skeletonGroups) {
      if (group.atlas) {
        const textureNames = AssetUtils.parseAtlasTextures(group.atlas.path);

        for (const textureName of textureNames) {
          const texturePath = path.resolve(path.dirname(group.atlas.path), textureName);
          const textureUuid = AssetUtils.getAssetUuidByPath(texturePath);
          if (textureUuid) {
            group.textures.push(textureUuid);
          }
        }
      }
    }

    // Check which skeleton json files are used
    for (const [baseName, group] of skeletonGroups) {
      if (group.json) {
        const jsonRefs = await this.checkUUIDUsage(group.json.uuid, searchPath);
        if (jsonRefs.length > 0) {
          // JSON is used → mark atlas and textures as used
          if (group.atlas) {
            usedAssets.add(group.atlas.uuid);
          }
          group.textures.forEach(textureUuid => {
            usedAssets.add(textureUuid);
          });
        }
      }
    }
  }

  /**
   * Check font file dependencies
   * @param {Array} assetList - List of assets
   * @param {Set} usedAssets - Set to store used asset UUIDs
   * @param {string} searchPath - Search path
   */
  async checkFontDependencies(assetList, usedAssets, searchPath = null) {
    for (const asset of assetList) {
      const ext = path.extname(asset.path).toLowerCase();

      if (ext === '.fnt') {
        // Check if .fnt file is used
        const fntRefs = await this.checkUUIDUsage(asset.uuid, searchPath);

        if (fntRefs.length > 0) {
          // FNT is used → mark all textures as used
          const textureNames = AssetUtils.parseFontTextures(asset.path);

          for (const textureName of textureNames) {
            const texturePath = path.resolve(path.dirname(asset.path), textureName);
            const textureUuid = AssetUtils.getAssetUuidByPath(texturePath);
            if (textureUuid) {
              usedAssets.add(textureUuid);
            }
          }
        }
      }
    }
  }

  /**
   * Check UUID usage in project
   * @param {string} uuid - Asset UUID
   * @param {string} searchPath - Search path (optional)
   * @returns {Promise<Array>} Array of file paths that reference the UUID
   */
  async checkUUIDUsage(uuid, searchPath = null) {
    try {
      // Try using asset-db API first
      const refs = await this.searchUUIDUsingAssetDB(uuid, searchPath);
      if (refs !== null) {
        return refs;
      }

      // Fallback to file system search
      return await this.searchUUIDInProject(uuid, searchPath);
    } catch (err) {
      return [];
    }
  }

  /**
   * Search UUID using Cocos Creator asset-db API
   * @param {string} uuid - Asset UUID
   * @param {string} searchPath - Search path (optional)
   * @returns {Promise<Array|null>} Array of file paths or null if failed
   */
  async searchUUIDUsingAssetDB(uuid, searchPath = null) {
    try {
      const refs = [];

      // Check if searchPath changed
      if (this.cache.cachedSearchPath !== searchPath) {
        this.cache.clearSearchCache();
        this.cache.cachedSearchPath = searchPath;
      }

      // Cache searchable assets list
      if (!this.cache.getSearchableAssets()) {
        const pattern = searchPath ?
          `db://${path.relative(Editor.Project.path, searchPath).replace(/\\/g, '/')}/**/*` :
          'db://assets/**/*';

        const allAssets = await AssetUtils.queryAssets(pattern);

        if (!allAssets || allAssets.length === 0) {
          this.cache.searchMethod = 'file-search';
          return null; // Fallback to file search
        }

        // Filter only searchable types
        const searchableAssets = allAssets.filter(asset => {
          if (!asset || !asset.file) return false;
          return AssetUtils.isSearchableFile(asset.file);
        });

        this.cache.setSearchableAssets(searchableAssets, searchPath);
        this.cache.searchMethod = 'asset-db-api';
      }

      // Search UUID in cached searchable assets
      const searchableAssets = this.cache.getSearchableAssets();
      let processed = 0;

      for (const asset of searchableAssets) {
        processed++;

        try {
          const filePath = asset.file;
          let content = this.cache.getFileFromCache(filePath);

          if (!content) {
            content = fs.readFileSync(filePath, 'utf8');
            this.cache.addFileToCache(filePath, content);
          }

          if (content.includes(uuid)) {
            refs.push(filePath);
          }
        } catch (e) {
          // Ignore read errors
        }

        // Yield control every 100 files
        if (processed % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      return refs;
    } catch (error) {
      this.cache.searchMethod = 'file-search';
      return null; // Fallback to file search
    }
  }

  /**
   * Search UUID in project using file system
   * @param {string} uuid - Asset UUID
   * @param {string} searchPath - Search path (optional)
   * @returns {Promise<Array>} Array of file paths
   */
  async searchUUIDInProject(uuid, searchPath = null) {
    const refs = [];
    const projectPath = Editor.Project.path;
    const targetPath = searchPath || path.join(projectPath, 'assets');

    await this.searchUUIDInFolder(targetPath, uuid, refs);
    return refs;
  }

  /**
   * Search UUID in folder recursively
   * @param {string} folderPath - Folder path
   * @param {string} uuid - Asset UUID
   * @param {Array} refs - Array to store results
   */
  async searchUUIDInFolder(folderPath, uuid, refs) {
    if (!fs.existsSync(folderPath)) return;

    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        await this.searchUUIDInFolder(fullPath, uuid, refs);
      } else {
        if (AssetUtils.isSearchableFile(fullPath)) {
          try {
            let content = this.cache.getFileFromCache(fullPath);
            if (!content) {
              content = fs.readFileSync(fullPath, 'utf8');
              this.cache.addFileToCache(fullPath, content);
            }

            if (content.includes(uuid)) {
              refs.push(fullPath);
            }
          } catch (e) {
            // Ignore read errors
          }
        }
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getCacheStats() {
    return this.cache.getCacheStats();
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.cache.clearAll();
  }

  /**
   * Clear file content cache to free memory
   */
  clearFileContentCache() {
    this.cache.clearFileContentCache();
  }
}

module.exports = AssetAnalyzerService;

