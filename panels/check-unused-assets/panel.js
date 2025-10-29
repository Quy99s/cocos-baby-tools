'use strict';

const fs = require('fs');
const path = require('path');

// Import utilities and services
const FileUtils = require('../../src/utils/FileUtils');
const AssetUtils = require('../../src/utils/AssetUtils');
const LogUtils = require('../../src/utils/LogUtils');
const AssetAnalyzerService = require('../../src/services/AssetAnalyzerService');

// Load external template and embed CSS
const cssContent = fs.readFileSync(path.join(__dirname, 'panel.css'), 'utf8');
const htmlContent = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8');

exports.template = `
<style>
${cssContent}
</style>
${htmlContent}
`;

exports.$ = {
  scanAsset: '#scanAsset',
  searchAsset: '#searchAsset',
  btnScan: '#btnScan',
  btnClear: '#btnClear',
  btnOpenAll: '#btnOpenAll',
  btnCloseAll: '#btnCloseAll',
  btnMoveUnused: '#btnMoveUnused',
  btnRestoreTemp: '#btnRestoreTemp',
  btnDeleteTemp: '#btnDeleteTemp',
  chkUsed: '#chkUsed',
  chkUnused: '#chkUnused',
  chkDetails: '#chkDetails',
  progressContainer: '#progressContainer',
  progressFill: '#progressFill',
  progressText: '#progressText',
  resultsBody: '#resultsBody',
  summaryInfo: '#summaryInfo',
  statTotal: '#statTotal',
  statUsed: '#statUsed',
  statUnused: '#statUnused',
  statTime: '#statTime',
  actionsSection: '#actionsSection',
  tempFolderPath: '#tempFolderPath'
};

exports.methods = {
  // Initialize service
  analyzerService: null,

  init() {
    if (!this.analyzerService) {
      this.analyzerService = new AssetAnalyzerService();
    }
  },

  // Debounce utility
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func.apply(this, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Logging - only for important messages
  log(msg, type = 'info') {
    LogUtils.log(msg, type, '[Asset Analyzer]');
  },

  // Progress management
  updateProgress(current, total, currentFile = '') {
    const percent = total > 0 ? Math.floor((current / total) * 100) : 0;
    this.$.progressFill.style.width = percent + '%';

    let progressText = `${percent}%`;

    if (total <= 10) {
      progressText += ` (Step ${Math.ceil(current)}/${total})`;
    } else {
      progressText += ` (${Math.floor(current)}/${total})`;
    }

    if (currentFile) {
      progressText += ` - ${currentFile}`;
    }

    this.$.progressText.textContent = progressText;
  },

  updateStats(stats) {
    this.$.statTotal.textContent = stats.total;
    this.$.statUsed.textContent = stats.used;
    this.$.statTime.textContent = stats.time + 's';
    this.$.summaryInfo.classList.add('show');

    // Update unused count
    if (this.analyzerService && this.analyzerService.cache.getScanResults()) {
      const scanResults = this.analyzerService.cache.getScanResults();
      const unusedCount = scanResults.filter(r => !r.isUsed).length;
      this.$.statUnused.textContent = unusedCount;

      // Show actions section if there are unused assets
      if (unusedCount > 0 && scanResults.rootPath) {
        this.$.actionsSection.style.display = 'block';
        const tempPath = this.getTempFolderPath(scanResults.rootPath);
        this.$.tempFolderPath.textContent = path.relative(Editor.Project.path, tempPath);
      }
    }
  },

  setButtonsEnabled(enabled) {
    this.$.btnScan.disabled = !enabled;
    this.$.btnScan.innerHTML = enabled ? '🔍 Analyze' : '⏳ Analyzing...';
    this.$.btnMoveUnused.disabled = !enabled;
    this.$.btnRestoreTemp.disabled = !enabled;
    this.$.btnDeleteTemp.disabled = !enabled;
  },

  clearAll() {
    this.$.resultsBody.innerHTML = '';
    this.$.progressFill.style.width = '0%';
    this.$.progressText.textContent = 'Initializing...';
    this.$.progressContainer.style.display = 'none';
    this.$.summaryInfo.classList.remove('show');
    this.$.actionsSection.style.display = 'none';

    if (this.analyzerService) {
      this.analyzerService.clearCache();
    }
  },

  // Get temp folder path
  getTempFolderPath(scanPath) {
    const parentDir = path.dirname(scanPath);
    const scanFolderName = path.basename(scanPath);
    return path.join(parentDir, `${scanFolderName}_temp_unused`);
  },

  // Main scan function
  async scanAssets() {
    this.init();
    const startTime = Date.now();
    this.setButtonsEnabled(false);
    this.clearAll();

    try {
      // Validate scan folder
      const scanPath = await this.getScanPath();
      if (!scanPath) return;

      // Get optional search path
      const searchPath = await this.getSearchPath();
      
      this.$.progressContainer.style.display = 'block';

      // Analyze assets
      const results = await this.analyzerService.analyzeAssets(
        scanPath,
        searchPath,
        (current, total, currentFile) => {
          this.updateProgress(current, total, currentFile);
        }
      );

      if (results.length === 0) {
        this.log('⚠️ No assets found', 'warning');
        return;
      }

      // Cache and display results
      results.rootPath = scanPath;
      this.analyzerService.cache.setScanResults(results);
      await this.displayResults(results, scanPath);

      // Update stats
      const duration = Math.round((Date.now() - startTime) / 1000);
      const stats = {
        total: results.length,
        used: results.filter(r => r.isUsed).length,
        unused: results.filter(r => !r.isUsed).length,
        time: duration
      };
      this.updateStats(stats);

      // Clear file cache to free memory
      this.analyzerService.clearFileContentCache();
      
      this.log(`✅ Complete: ${stats.total} assets in ${duration}s`, 'success');
    } catch (error) {
      this.log(`❌ Error: ${error.message}`, 'error');
      console.error('Scan error:', error);
    } finally {
      this.setButtonsEnabled(true);
      this.$.progressContainer.style.display = 'none';
    }
  },

  // Get scan folder path
  async getScanPath() {
    const scanVal = this.$.scanAsset.value;
    if (!scanVal) {
      this.log('⚠️ Please select a folder', 'warning');
      return null;
    }

    const scanUuid = scanVal.uuid || scanVal._uuid || scanVal;
    const scanInfo = await AssetUtils.getAssetInfo(scanUuid);
    
    if (!scanInfo?.file) {
      this.log('❌ Invalid folder', 'error');
      return null;
    }

    return scanInfo.file;
  },

  // Get optional search path
  async getSearchPath() {
    const searchVal = this.$.searchAsset.value;
    if (!searchVal) return null;

    const searchUuid = searchVal.uuid || searchVal._uuid || searchVal;
    const searchInfo = await AssetUtils.getAssetInfo(searchUuid);
    
    return searchInfo?.file || null;
  },

  // Display results in tree view
  async displayResults(results, rootPath) {
    const tree = this.buildDirectoryTree(results);
    this.$.resultsBody.innerHTML = '';

    // Render tree structure
    Object.keys(tree).sort().forEach(folderName => {
      if (folderName === '__assets__') {
        this.renderRootAssets(tree.__assets__);
      } else {
        const folderElement = this.renderTreeFolder(folderName, tree[folderName].children, 0);
        if (folderElement) {
          this.$.resultsBody.appendChild(folderElement);
        }
      }
    });
  },

  // Render root level assets
  renderRootAssets(assets) {
    const showUsed = this.$.chkUsed.checked;
    const showUnused = this.$.chkUnused.checked;
    const showDetails = this.$.chkDetails.checked;

    assets.forEach(asset => {
      if ((!asset.isUsed && !showUnused) || (asset.isUsed && !showUsed)) {
        return;
      }
      const assetItem = this.createAssetItem(asset, showDetails);
      this.$.resultsBody.appendChild(assetItem);
    });
  },

  // Build directory tree structure
  buildDirectoryTree(results) {
    const tree = {};

    results.forEach(result => {
      const pathParts = result.relativePath.split(path.sep);
      let currentLevel = tree;

      // Build nested structure
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!currentLevel[part]) {
          currentLevel[part] = {
            type: 'folder',
            children: {},
            assets: []
          };
        }
        currentLevel = currentLevel[part].children;
      }

      // Add asset to final folder
      if (!currentLevel.__assets__) {
        currentLevel.__assets__ = [];
      }
      currentLevel.__assets__.push(result);
    });

    return tree;
  },

  // Render tree folder
  renderTreeFolder(folderName, folderData, level = 0) {
    const showUsed = this.$.chkUsed.checked;
    const showUnused = this.$.chkUnused.checked;
    const showDetails = this.$.chkDetails.checked;

    const details = document.createElement('details');
    details.className = 'tree-folder';
    details.style.marginLeft = (level * 12) + 'px';
    details.open = level < 2; // Auto open first 2 levels

    const summary = document.createElement('summary');

    // Count assets
    let totalAssets = 0;
    let usedAssets = 0;
    let unusedAssets = 0;

    const countAssetsRecursive = (data) => {
      if (data.__assets__) {
        data.__assets__.forEach(asset => {
          totalAssets++;
          if (asset.isUsed) usedAssets++;
          else unusedAssets++;
        });
      }

      Object.keys(data).forEach(key => {
        if (key !== '__assets__' && data[key].children) {
          countAssetsRecursive(data[key].children);
        }
      });
    };

    countAssetsRecursive(folderData);

    const folderIcon = level === 0 ? '🗂️' : '📁';
    summary.innerHTML = `${folderIcon} ${folderName} <span class="folder-summary">(${totalAssets} files - ✓${usedAssets} ✗${unusedAssets})</span>`;
    details.appendChild(summary);

    const content = document.createElement('div');
    content.className = 'folder-content';

    // Render assets in current folder
    if (folderData.__assets__) {
      folderData.__assets__.forEach(asset => {
        if ((!asset.isUsed && !showUnused) || (asset.isUsed && !showUsed)) {
          return;
        }

        const assetItem = this.createAssetItem(asset, showDetails);
        content.appendChild(assetItem);
      });
    }

    // Render subfolders
    Object.keys(folderData)
      .filter(key => key !== '__assets__')
      .sort()
      .forEach(subFolderName => {
        const subFolder = this.renderTreeFolder(subFolderName, folderData[subFolderName].children, level + 1);
        if (subFolder) {
          content.appendChild(subFolder);
        }
      });

    if (content.children.length > 0) {
      details.appendChild(content);
      return details;
    }

    return null;
  },

  // Create asset item element
  createAssetItem(asset, showDetails) {
    const assetItem = document.createElement('div');
    assetItem.className = `asset-item ${asset.isUsed ? 'used' : 'unused'}`;

    const icon = document.createElement('span');
    icon.className = 'asset-icon';
    icon.textContent = asset.isUsed ? '✅' : '❌';

    const name = document.createElement('span');
    name.className = 'asset-name';
    name.textContent = asset.name;

    const uuid = document.createElement('span');
    uuid.className = 'asset-uuid';
    uuid.textContent = `${asset.uuid}`;

    const refs = document.createElement('span');
    refs.className = 'asset-refs';
    let refText = '';
    if (asset.usedAsDependency) {
      refText += '(dep)';
    }
    if (showDetails && asset.references.length > 0) {
      refText += ` (${asset.references.length})`;
    }
    refs.textContent = refText;

    assetItem.appendChild(icon);
    assetItem.appendChild(name);
    assetItem.appendChild(uuid);
    assetItem.appendChild(refs);

    let tooltip = `Path: ${asset.path}\nUUID: ${asset.uuid}\nClick UUID to select and copy`;
    if (asset.usedAsDependency) {
      tooltip += '\nUsed as dependency (skeleton/font)';
    }
    assetItem.title = tooltip;

    // UUID interaction handlers
    uuid.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectText(uuid);
    });

    uuid.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.copyToClipboard(asset.uuid);
      this.showCopyFeedback(uuid);
    });

    // Show references if details enabled
    if (showDetails && asset.references.length > 0) {
      const refList = document.createElement('div');
      refList.className = 'reference-list';

      asset.references.forEach(ref => {
        const refItem = document.createElement('div');
        refItem.className = 'reference-item';
        refItem.textContent = `→ ${path.relative(Editor.Project.path, ref)}`;
        refList.appendChild(refItem);
      });

      assetItem.appendChild(refList);
    }

    return assetItem;
  },

  // Helper: select text
  selectText(element) {
    if (window.getSelection) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  },

  // Helper: copy to clipboard
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  },

  // Show copy feedback
  showCopyFeedback(element) {
    const originalText = element.textContent;
    element.textContent = 'Copied!';
    element.style.color = '#4CAF50';
    element.style.fontWeight = 'bold';

    setTimeout(() => {
      element.textContent = originalText;
      element.style.color = '';
      element.style.fontWeight = '';
    }, 1500);
  },

  // Re-render results from cache
  reRenderResults() {
    const scanResults = this.analyzerService?.cache.getScanResults();
    if (!scanResults) {
      this.log('⚠️ No data. Run analysis first', 'warning');
      return;
    }

    // Clear and re-render
    this.$.resultsBody.querySelectorAll('.tree-folder, .asset-item').forEach(el => el.remove());
    this.displayResults(scanResults, scanResults.rootPath);
  },

  // Move unused assets to temp folder
  async moveUnusedToTemp() {
    const scanResults = this.analyzerService?.cache.getScanResults();
    if (!scanResults) {
      this.log('⚠️ No scan data', 'warning');
      return;
    }

    const unusedAssets = scanResults.filter(asset => !asset.isUsed);
    if (unusedAssets.length === 0) {
      this.log('ℹ️ No unused assets', 'info');
      return;
    }

    const scanPath = scanResults.rootPath;
    const tempPath = this.getTempFolderPath(scanPath);

    // Confirm operation
    if (!confirm(`Move ${unusedAssets.length} unused assets to temp folder?\n\nYou can restore them later.`)) {
      return;
    }

    try {
      this.setButtonsEnabled(false);
      this.$.progressContainer.style.display = 'block';

      // Create temp directory structure
      this.updateProgress(0, 3, 'Creating directories');
      await this.createTempDirectories(tempPath, unusedAssets);

      // Copy assets
      this.updateProgress(1, 3, 'Copying assets');
      const copiedCount = await this.copyAssetsToTemp(tempPath, unusedAssets);

      // Remove originals
      this.updateProgress(2, 3, 'Removing originals');
      const removedCount = await this.removeOriginalAssets(unusedAssets);

      // Cleanup and refresh
      FileUtils.cleanupEmptyDirectories(scanPath);
      await AssetUtils.refreshAssetDB();

      this.log(`✅ Moved ${removedCount} assets`, 'success');
    } catch (error) {
      this.log(`❌ Error: ${error.message}`, 'error');
    } finally {
      this.setButtonsEnabled(true);
      this.$.progressContainer.style.display = 'none';
    }
  },

  // Create temp directory structure
  async createTempDirectories(tempPath, assets) {
    if (FileUtils.exists(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
    FileUtils.mkdirSync(tempPath);

    const uniqueDirs = new Set();
    assets.forEach(asset => {
      const assetDir = path.dirname(asset.relativePath);
      if (assetDir && assetDir !== '.') uniqueDirs.add(assetDir);
    });

    for (const dir of uniqueDirs) {
      FileUtils.mkdirSync(path.join(tempPath, dir));
    }
  },

  // Copy assets to temp folder
  async copyAssetsToTemp(tempPath, assets) {
    let copiedCount = 0;
    for (const asset of assets) {
      try {
        const targetFile = path.join(tempPath, asset.relativePath);
        if (FileUtils.exists(asset.path)) {
          FileUtils.copyFileWithMeta(asset.path, targetFile);
          copiedCount++;
        }
      } catch (error) {
        console.error(`Copy error ${asset.name}:`, error);
      }
    }
    return copiedCount;
  },

  // Remove original assets
  async removeOriginalAssets(assets) {
    let removedCount = 0;
    for (const asset of assets) {
      try {
        if (FileUtils.exists(asset.path)) {
          FileUtils.deleteFileWithMeta(asset.path);
          removedCount++;
        }
      } catch (error) {
        console.error(`Remove error ${asset.name}:`, error);
      }
    }
    return removedCount;
  },

  // Restore from temp folder
  async restoreFromTemp() {
    const scanResults = this.analyzerService?.cache.getScanResults();
    if (!scanResults) {
      this.log('⚠️ No scan data', 'warning');
      return;
    }

    const tempPath = this.getTempFolderPath(scanResults.rootPath);
    if (!FileUtils.exists(tempPath)) {
      this.log('⚠️ Temp folder not found', 'warning');
      return;
    }

    try {
      this.setButtonsEnabled(false);
      this.$.progressContainer.style.display = 'block';

      const tempFiles = FileUtils.getAllFilesInDirectory(tempPath);
      const mainFiles = tempFiles.filter(file => !file.endsWith('.meta'));
      let restoredCount = 0;

      for (let i = 0; i < mainFiles.length; i++) {
        const tempFile = mainFiles[i];
        this.updateProgress(i, mainFiles.length, path.basename(tempFile));

        try {
          const relativePath = path.relative(tempPath, tempFile);
          const originalPath = path.join(scanResults.rootPath, relativePath);
          
          FileUtils.mkdirSync(path.dirname(originalPath));
          await FileUtils.moveFile(tempFile, originalPath);

          // Move .meta file
          const tempMetaFile = tempFile + '.meta';
          const originalMetaFile = originalPath + '.meta';
          if (FileUtils.exists(tempMetaFile)) {
            await FileUtils.moveFile(tempMetaFile, originalMetaFile);
          }

          restoredCount++;
        } catch (error) {
          console.error(`Restore error:`, error);
        }
      }

      // Cleanup temp directory
      try {
        fs.rmSync(tempPath, { recursive: true, force: true });
      } catch (e) {}

      await AssetUtils.refreshAssetDB();
      this.log(`✅ Restored ${restoredCount} files`, 'success');
    } catch (error) {
      this.log(`❌ Error: ${error.message}`, 'error');
    } finally {
      this.setButtonsEnabled(true);
      this.$.progressContainer.style.display = 'none';
    }
  },

  // Delete temp folder
  async deleteTemp() {
    const scanResults = this.analyzerService?.cache.getScanResults();
    if (!scanResults) {
      this.log('⚠️ No scan data', 'warning');
      return;
    }

    const tempPath = this.getTempFolderPath(scanResults.rootPath);
    if (!FileUtils.exists(tempPath)) {
      this.log('⚠️ Temp folder not found', 'warning');
      return;
    }

    if (!confirm(`⚠️ Permanently delete temp folder?\n\nThis CANNOT be undone!`)) {
      return;
    }

    try {
      this.setButtonsEnabled(false);
      fs.rmSync(tempPath, { recursive: true, force: true });
      await AssetUtils.refreshAssetDB();
      this.log(`✅ Deleted temp folder`, 'success');
    } catch (error) {
      this.log(`❌ Error: ${error.message}`, 'error');
    } finally {
      this.setButtonsEnabled(true);
    }
  },

  // Collapsible controls
  openAllCollapsible() {
    const details = this.$.resultsBody.querySelectorAll('details');
    details.forEach(detail => detail.open = true);
  },

  closeAllCollapsible() {
    const details = this.$.resultsBody.querySelectorAll('details');
    details.forEach(detail => detail.open = false);
  }
};

// Panel ready handler
exports.ready = function () {
  // Initialize service
  this.init();

  // Debounced handlers
  const debouncedScan = this.debounce(() => this.scanAssets(), 300);
  const debouncedMove = this.debounce(() => this.moveUnusedToTemp(), 300);
  const debouncedRestore = this.debounce(() => this.restoreFromTemp(), 300);
  const debouncedDelete = this.debounce(() => this.deleteTemp(), 300);

  // Attach event listeners
  this.$.btnScan.addEventListener('click', debouncedScan);
  this.$.btnClear.addEventListener('click', () => this.clearAll());
  this.$.btnOpenAll.addEventListener('click', () => this.openAllCollapsible());
  this.$.btnCloseAll.addEventListener('click', () => this.closeAllCollapsible());

  // Move controls
  this.$.btnMoveUnused.addEventListener('click', debouncedMove);
  this.$.btnRestoreTemp.addEventListener('click', debouncedRestore);
  this.$.btnDeleteTemp.addEventListener('click', debouncedDelete);

  // Checkbox event listeners - re-render results when changed
  this.$.chkUsed.addEventListener('change', () => {
    this.reRenderResults();
    setTimeout(() => this.openAllCollapsible(), 100);
  });
  this.$.chkUnused.addEventListener('change', () => {
    this.reRenderResults();
    setTimeout(() => this.openAllCollapsible(), 100);
  });
  this.$.chkDetails.addEventListener('change', () => {
    this.reRenderResults();
    setTimeout(() => this.openAllCollapsible(), 100);
  });

  this.clearAll();
};
