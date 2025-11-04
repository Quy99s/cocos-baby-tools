'use strict';

const fs = require('fs');
const path = require('path');

// Import utilities
const FileUtils = require('../../src/utils/FileUtils');
const AssetUtils = require('../../src/utils/AssetUtils');

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
  folderAsset: '#folderAsset',
  btnRun: '#btnRun',
  btnClearLog: '#btnClearLog',
  log: '#log',
  inputFolderInput: '#inputFolderInput',
  progressContainer: '#progressContainer',
  progressFill: '#progressFill',
  progressText: '#progressText',
  folderUrlDisplay: '#folderUrlDisplay',
};

exports.methods = {
  // Custom folder path
  customInputPath: null,

  // UUID map
  uuidMap: null,

  // Stats tracking
  stats: {
    totalFiles: 0,
    processed: 0,
    replaced: 0,
    errors: 0,
    isRunning: false
  },

  // Initialize
  async init() {
    this.loadUuidMap();
    // Initialize folder URL display
    setTimeout(() => this.updateFolderUrlDisplay(), 100);
  },

  // Load UUID map from current panel directory
  loadUuidMap() {
    try {
      const mapPath = path.join(
        __dirname,
        'uuid-replace-default-ui-map.json'
      );

      if (FileUtils.exists(mapPath)) {
        const mapContent = fs.readFileSync(mapPath, 'utf8');
        this.uuidMap = JSON.parse(mapContent);
        this.log(`✅ Loaded UUID map: ${Object.keys(this.uuidMap).length} mappings`, 'success');
      } else {
        this.log(`⚠️ UUID map not found at: ${mapPath}`, 'warning');
        this.uuidMap = null;
      }
    } catch (error) {
      this.log(`❌ Failed to load UUID map: ${error.message}`, 'error');
      this.uuidMap = null;
    }
  },

  // Logging
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
    this.$.log.innerText += `[${timestamp}] ${prefix} ${message}\n`;
    this.$.log.scrollTop = this.$.log.scrollHeight;
  },

  clearLog() {
    this.$.log.innerText = '';
    this.resetStats();
  },

  // Progress bar
  showProgress(show = true) {
    this.$.progressContainer.style.display = show ? 'block' : 'none';
  },

  updateProgress(percent, message) {
    this.$.progressFill.style.width = `${percent}%`;
    this.$.progressText.innerText = message;
  },

  // Stats
  resetStats() {
    this.stats = {
      totalFiles: 0,
      processed: 0,
      replaced: 0,
      errors: 0,
      isRunning: false
    };
  },

  // Input folder methods
  async selectInputFolder() {
    try {
      const { dialog } = require('electron').remote || require('@electron/remote');
      const result = await dialog.showOpenDialog({
        title: 'Select Folder to Process',
        properties: ['openDirectory']
      });

      if (result.canceled || !result.filePaths.length) {
        return;
      }

      const folderPath = result.filePaths[0];
      this.setInputFolder(folderPath);
    } catch (error) {
      this.log(`❌ Error: ${error.message}`, 'error');
    }
  },

  setInputFolder(folderPath) {
    this.customInputPath = folderPath;
    this.updateFolderUrlDisplay();
  },

  clearFolderAsset() {
    this.$.folderAsset.value = null;
    this.$.folderAsset._value = null;
  },

  clearCustomInputFolder() {
    this.customInputPath = null;
    if (this.$.inputFolderInput) {
      this.$.inputFolderInput.value = '';
    }
    this.updateFolderUrlDisplay();
  },

  // Update folder URL display
  async updateFolderUrlDisplay() {
    try {
      let folderPath = null;

      // Check custom input path first
      if (this.customInputPath) {
        folderPath = this.customInputPath;
      } else {
        // Check folder asset
        const folderAssetValue = this.$.folderAsset.value;
        if (folderAssetValue) {
          const folderUuid = folderAssetValue.uuid || folderAssetValue._uuid || folderAssetValue;
          const folderInfo = await AssetUtils.getAssetInfo(folderUuid);
          if (folderInfo?.file) {
            folderPath = folderInfo.file;
          }
        }
      }

      // If no folder selected, use default assets folder
      if (!folderPath) {
        folderPath = path.join(Editor.Project.path, 'assets');
      }

      this.$.folderUrlDisplay.textContent = folderPath;
      this.$.folderUrlDisplay.className = 'folder-url-display';
      this.$.folderUrlDisplay.title = folderPath;
    } catch (error) {
      const defaultAssetsPath = path.join(Editor.Project.path, 'assets');
      this.$.folderUrlDisplay.textContent = defaultAssetsPath;
      this.$.folderUrlDisplay.className = 'folder-url-display';
      this.$.folderUrlDisplay.title = defaultAssetsPath;
    }
  },

  // Get source folder
  async getSourceFolder(showDefaultMessage = false) {
    if (this.customInputPath) {
      return this.customInputPath;
    }

    const folderAssetValue = this.$.folderAsset.value;
    if (!folderAssetValue) {
      // If no input selected, use default assets folder
      const defaultAssetsPath = path.join(Editor.Project.path, 'assets');
      if (FileUtils.exists(defaultAssetsPath)) {
        if (showDefaultMessage) {
          this.log(`ℹ️ No folder selected, using default assets folder: ${defaultAssetsPath}`, 'info');
        }
        return defaultAssetsPath;
      }
      this.log('Select source folder or use default assets folder', 'error');
      return null;
    }

    const folderUuid = folderAssetValue.uuid || folderAssetValue._uuid || folderAssetValue;
    const folderInfo = await AssetUtils.getAssetInfo(folderUuid);

    if (!folderInfo?.file) {
      // If invalid, fallback to default assets folder
      const defaultAssetsPath = path.join(Editor.Project.path, 'assets');
      if (FileUtils.exists(defaultAssetsPath)) {
        if (showDefaultMessage) {
          this.log(`ℹ️ Invalid folder selected, using default assets folder: ${defaultAssetsPath}`, 'info');
        }
        return defaultAssetsPath;
      }
      this.log('Invalid source folder', 'error');
      return null;
    }

    return folderInfo.file;
  },

  // Scan directory for files to process
  scanDirectory(dir) {
    const files = [];
    const targetExtensions = ['.prefab', '.scene', '.json', '.anim'];

    const walkDir = (currentDir) => {
      try {
        const items = fs.readdirSync(currentDir);
        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            walkDir(fullPath);
          } else {
            const ext = path.extname(item).toLowerCase();
            if (targetExtensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Ignore errors
      }
    };

    walkDir(dir);
    return files;
  },

  // Replace UUIDs in a file
  replaceUUIDsInFile(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      let replaced = false;
      let replaceCount = 0;

      for (const [oldUUID, newUUID] of Object.entries(this.uuidMap)) {
        if (content.includes(oldUUID)) {
          const regex = new RegExp(oldUUID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          const matches = content.match(regex);
          if (matches) {
            replaceCount += matches.length;
            content = content.replace(regex, newUUID);
            replaced = true;
          }
        }
      }

      if (replaced) {
        fs.writeFileSync(filePath, content, 'utf8');
        return { success: true, count: replaceCount };
      }

      return { success: true, count: 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Main replace function
  async runReplace() {
    if (this.stats.isRunning) {
      this.log('Already running', 'warning');
      return;
    }

    // Validate UUID map
    if (!this.uuidMap || Object.keys(this.uuidMap).length === 0) {
      this.log('❌ UUID map not loaded. Please check the extension folder.', 'error');
      return;
    }

    // Validate inputs
    const srcFolder = await this.getSourceFolder(true);
    if (!srcFolder) return;

    if (!FileUtils.exists(srcFolder)) {
      this.log('❌ Folder does not exist', 'error');
      return;
    }

    try {
      this.stats.isRunning = true;
      this.$.btnRun.disabled = true;
      this.$.btnRun.innerHTML = '<span>⏳</span><span>Processing...</span>';

      this.resetStats();
      this.showProgress(true);
      this.updateProgress(0, 'Scanning files...');

      // Scan for files
      this.log(`📂 Scanning folder: ${srcFolder}`, 'info');
      const files = this.scanDirectory(srcFolder);

      if (files.length === 0) {
        this.log('⚠️ No files found to process', 'warning');
        return;
      }

      this.stats.totalFiles = files.length;
      this.log(`📋 Found ${files.length} files to process`, 'info');

      // Process files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progress = ((i / files.length) * 100).toFixed(1);
        const fileName = path.relative(srcFolder, file);
        this.updateProgress(progress, `${i + 1}/${files.length}: ${path.basename(file)}`);

        const result = this.replaceUUIDsInFile(file);
        this.stats.processed++;

        if (result.success) {
          if (result.count > 0) {
            this.stats.replaced++;
            this.log(`✅ [${fileName}]: Replaced ${result.count} UUID(s)`, 'success');
          }
        } else {
          this.stats.errors++;
          this.log(`❌ [${fileName}]: ${result.error}`, 'error');
        }
      }

      this.updateProgress(100, 'Complete!');

      // Show summary
      const summary = `✨ Complete: ${this.stats.processed} files processed, ${this.stats.replaced} files modified, ${this.stats.errors} errors`;
      this.log(summary, this.stats.errors > 0 ? 'warning' : 'success');

      // Refresh asset database
      try {
        await AssetUtils.refreshAssetDB();
        this.log('✅ Asset database refreshed', 'success');
      } catch (error) {
        this.log(`⚠️ Failed to refresh asset database: ${error.message}`, 'warning');
      }

    } catch (error) {
      this.stats.errors++;
      this.log(`❌ Error: ${error.message}`, 'error');
      this.updateProgress(0, `Error: ${error.message}`);
    } finally {
      this.stats.isRunning = false;
      this.$.btnRun.disabled = false;
      this.$.btnRun.innerHTML = '<span>🚀</span><span>Run Replace</span>';
      setTimeout(() => this.showProgress(false), 3000);
    }
  }
};

// Panel ready handler
exports.ready = function () {
  // Initialize
  this.init();

  // Initialize UI state
  this.resetStats();
  this.showProgress(false);

  // Attach event listeners
  this.$.btnRun.addEventListener('click', () => this.runReplace());
  this.$.btnClearLog.addEventListener('click', () => this.clearLog());

  // Source folder change detection
  this.$.folderAsset.addEventListener('change', () => {
    this.clearCustomInputFolder();

    setTimeout(async () => {
      const folderAssetValue = this.$.folderAsset.value;
      if (folderAssetValue) {
        const folderUuid = folderAssetValue.uuid || folderAssetValue._uuid || folderAssetValue;
        const folderInfo = await AssetUtils.getAssetInfo(folderUuid);
        if (folderInfo?.file) {
          this.log(`📁 Selected folder: ${folderInfo.file}`, 'info');
        }
      }
      this.updateFolderUrlDisplay();
    }, 100);
  });

  this.log('🚀 Replace Default UI UUID tool ready', 'info');
};

