'use strict';

const fs = require('fs');
const path = require('path');
const { SUPPORTED_ASSET_EXTENSIONS, SEARCHABLE_EXTENSIONS } = require('../common/constants');

/**
 * Cocos Creator asset utilities
 */
class AssetUtils {
  /**
   * Get asset info from UUID using Cocos Creator API
   * @param {string} uuid - Asset UUID
   * @returns {Promise<object|null>} Asset info or null
   */
  static async getAssetInfo(uuid) {
    try {
      return await Editor.Message.request('asset-db', 'query-asset-info', uuid);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get UUID from asset file path
   * @param {string} filePath - Asset file path
   * @returns {string|null} UUID or null
   */
  static getAssetUuidByPath(filePath) {
    const metaPath = filePath + '.meta';
    if (fs.existsSync(metaPath)) {
      try {
        const metaContent = fs.readFileSync(metaPath, 'utf8');
        const meta = JSON.parse(metaContent);
        return meta.uuid || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Build asset list from a directory
   * @param {string} rootPath - Root directory path
   * @returns {Array} Array of asset objects with path, uuid, name, relativePath
   */
  static buildAssetList(rootPath) {
    const assets = [];

    const walkDir = (dir) => {
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else {
          const ext = path.extname(file).toLowerCase();
          if (SUPPORTED_ASSET_EXTENSIONS.includes(ext)) {
            const metaPath = fullPath + '.meta';
            if (fs.existsSync(metaPath)) {
              try {
                const metaContent = fs.readFileSync(metaPath, 'utf8');
                const meta = JSON.parse(metaContent);
                if (meta.uuid) {
                  assets.push({
                    path: fullPath,
                    uuid: meta.uuid,
                    name: file,
                    relativePath: path.relative(rootPath, fullPath)
                  });
                }
              } catch (e) {
                // Skip invalid meta files
              }
            }
          }
        }
      }
    };

    walkDir(rootPath);
    return assets;
  }

  /**
   * Check if a file is searchable (can contain asset references)
   * @param {string} filePath - File path
   * @returns {boolean}
   */
  static isSearchableFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SEARCHABLE_EXTENSIONS.includes(ext);
  }

  /**
   * Query assets from Cocos Creator asset database
   * @param {string} pattern - Search pattern (e.g., 'db://assets/**\/*')
   * @returns {Promise<Array>} Array of assets
   */
  static async queryAssets(pattern) {
    try {
      const assets = await Editor.Message.request('asset-db', 'query-assets', { pattern });
      return assets || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Refresh Cocos Creator asset database
   * @returns {Promise<void>}
   */
  static async refreshAssetDB() {
    try {
      await Editor.Message.request('asset-db', 'refresh');
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Parse skeleton animation groups from asset list
   * @param {Array} assetList - Array of asset objects
   * @returns {Map} Map of skeleton groups (name -> {json, atlas, textures})
   */
  static parseSkeletonGroups(assetList) {
    const skeletonGroups = new Map();

    assetList.forEach(asset => {
      const ext = path.extname(asset.path).toLowerCase();
      const baseName = path.basename(asset.path, ext);

      if (ext === '.json' || ext === '.atlas') {
        if (!skeletonGroups.has(baseName)) {
          skeletonGroups.set(baseName, { json: null, atlas: null, textures: [] });
        }

        const group = skeletonGroups.get(baseName);
        if (ext === '.json') {
          group.json = asset;
        } else if (ext === '.atlas') {
          group.atlas = asset;
        }
      }
    });

    return skeletonGroups;
  }

  /**
   * Parse atlas file to find texture references
   * @param {string} atlasPath - Atlas file path
   * @returns {string[]} Array of texture file names
   */
  static parseAtlasTextures(atlasPath) {
    const textures = [];
    
    try {
      const atlasContent = fs.readFileSync(atlasPath, 'utf8');
      const lines = atlasContent.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        // Find texture files in atlas (first line of each page, doesn't contain :)
        if (trimmedLine && !trimmedLine.includes(':') &&
          !trimmedLine.startsWith('size') && !trimmedLine.startsWith('format') &&
          !trimmedLine.startsWith('filter') && !trimmedLine.startsWith('repeat') &&
          !trimmedLine.startsWith('pma') && !trimmedLine.startsWith('rotate')) {
          textures.push(trimmedLine);
        }
      }
    } catch (error) {
      // Silent fail
    }

    return textures;
  }

  /**
   * Parse font file to find texture references
   * @param {string} fntPath - Font file path
   * @returns {string[]} Array of texture file names
   */
  static parseFontTextures(fntPath) {
    const textures = [];
    
    try {
      const fntContent = fs.readFileSync(fntPath, 'utf8');
      const lines = fntContent.split('\n');

      for (const line of lines) {
        // Find page line (texture file)
        const pageMatch = line.match(/page\s+id=\d+\s+file="([^"]+)"/);
        if (pageMatch) {
          textures.push(pageMatch[1]);
        }
      }
    } catch (error) {
      // Silent fail
    }

    return textures;
  }

  /**
   * Convert absolute path to Cocos Creator db:// path
   * @param {string} absolutePath - Absolute file path
   * @returns {string} db:// path
   */
  static toDBPath(absolutePath) {
    const relativePath = path.relative(Editor.Project.path, absolutePath);
    return 'db://' + relativePath.replace(/\\/g, '/');
  }

  /**
   * Convert db:// path to absolute path
   * @param {string} dbPath - db:// path
   * @returns {string} Absolute file path
   */
  static toAbsolutePath(dbPath) {
    const relativePath = dbPath.replace(/^db:\/\//, '');
    return path.join(Editor.Project.path, relativePath);
  }
}

module.exports = AssetUtils;

