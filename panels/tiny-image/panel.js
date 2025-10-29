'use strict';

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { shell } = require('electron');

// Import utilities and services
const FileUtils = require('../../src/utils/FileUtils');
const AssetUtils = require('../../src/utils/AssetUtils');
const LogUtils = require('../../src/utils/LogUtils');
const TinyPNGService = require('../../src/services/TinyPNGService');
const { FOLDER_CONFIG_KEY } = require('../../src/common/constants');

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
    btnCheckUsage: '#btnCheckUsage',
    log: '#log',
    apiKeyInput: '#apiKeyInput',
    btnSaveKey: '#btnSaveKey',
    btnLoadKey: '#btnLoadKey',
    apiLink: '#apiLink',
    outputFolderInput: '#outputFolderInput',
    inputFolderInput: '#inputFolderInput',
    btnSelectInput: '#btnSelectInput',
    inputFolderPath: '#inputFolderPath',
    btnSelectOutput: '#btnSelectOutput',
    btnOpenOutput: '#btnOpenOutput',
    outputFolderPath: '#outputFolderPath',
    progressContainer: '#progressContainer',
    progressFill: '#progressFill',
    progressText: '#progressText',
    statTotalAssets: '#statTotalAssets',
    statOptimized: '#statOptimized',
    statErrors: '#statErrors',
    statSavedSize: '#statSavedSize',
    analysisPanel: '#analysisPanel',
    optimizationSection: '#optimizationSection',
    statTotalImages: '#statTotalImages',
    statPngImages: '#statPngImages',
    statJpgImages: '#statJpgImages',
    statWebpImages: '#statWebpImages',
    chkPng: '#chkPng',
    chkJpg: '#chkJpg',
    chkWebp: '#chkWebp',
    btnFolderSettings: '#btnFolderSettings',
    folderSettingsPanel: '#folderSettingsPanel',
    rememberFolders: '#rememberFolders',
    skipEmptyCheck: '#skipEmptyCheck',
    autoCreateOutput: '#autoCreateOutput',
    btnResetFolderSettings: '#btnResetFolderSettings',
  outputFolderStatus: '#outputFolderStatus'
};

exports.methods = {
  // Service instance
  tinyPNGService: null,

    // Stats tracking
    stats: {
        totalAssets: 0,
        optimized: 0,
        errors: 0,
        totalSavedBytes: 0,
        isRunning: false
    },

    // Custom folder paths
    customInputPath: null,
    customOutputPath: null,
  originalOutputPath: null,

  // Initialize service
  init() {
    if (!this.tinyPNGService) {
      this.tinyPNGService = new TinyPNGService();
    }
  },

  // Get config path
    getConfigPath() {
        return path.join(Editor.Project.path, 'temp', 'tinypng-config.json');
    },

  // Folder configuration management
    getFolderConfig() {
        try {
      const saved = localStorage.getItem(FOLDER_CONFIG_KEY);
            return saved ? JSON.parse(saved) : {
                rememberFolders: true,
                skipEmptyCheck: false,
                autoCreateOutput: true,
                lastOutputFolder: null,
                projectPath: Editor.Project.path
            };
        } catch (error) {
            return {
                rememberFolders: true,
                skipEmptyCheck: false,
                autoCreateOutput: true,
                lastOutputFolder: null,
                projectPath: Editor.Project.path
            };
        }
    },

    saveFolderConfig(config) {
        try {
      localStorage.setItem(FOLDER_CONFIG_KEY, JSON.stringify(config));
        } catch (error) {
      this.log(`Failed to save folder settings: ${error.message}`, 'warning');
        }
    },

    // Initialize folder settings UI
    initFolderSettings() {
        const config = this.getFolderConfig();
        
        this.$.rememberFolders.checked = config.rememberFolders;
        this.$.skipEmptyCheck.checked = config.skipEmptyCheck;
        this.$.autoCreateOutput.checked = config.autoCreateOutput;

        // Auto-load last output folder if remember is enabled
    if (config.rememberFolders && config.lastOutputFolder && FileUtils.exists(config.lastOutputFolder)) {
            this.setOutputFolder(config.lastOutputFolder);
        }
    },

  // Update folder status
    updateFolderStatus(element, message, type = 'info') {
        element.className = `folder-status ${type} show`;
        element.textContent = message;
    },

    hideFolderStatus(element) {
        element.className = 'folder-status';
        element.textContent = '';
    },

    updateOutputPathDisplay(message, type = 'info') {
        if (this.$.outputFolderPath) {
            this.$.outputFolderPath.textContent = message;
            this.$.outputFolderPath.className = `path-text ${type}`;
        }
    },

  // Restore last output folder
    restoreLastOutputFolder() {
        const config = this.getFolderConfig();
    if (!config.rememberFolders) return;

    if (config.lastOutputFolder && FileUtils.exists(config.lastOutputFolder)) {
            this.originalOutputPath = config.lastOutputFolder;
            this.setOutputFolder(config.lastOutputFolder);
    }
  },

  // Add to recent output folders
    addToRecentOutputFolders(folderPath) {
        const config = this.getFolderConfig();
        if (!config.recentOutputFolders) {
            config.recentOutputFolders = [];
        }
        
        const index = config.recentOutputFolders.indexOf(folderPath);
        if (index > -1) {
            config.recentOutputFolders.splice(index, 1);
        }
        
        config.recentOutputFolders.unshift(folderPath);
        
        if (config.recentOutputFolders.length > 5) {
            config.recentOutputFolders.pop();
        }
        
        this.saveFolderConfig(config);
    },

  // Set output folder
  setOutputFolder(folderPath) {
    this.customOutputPath = folderPath;
    
    if (!this.originalOutputPath) {
      this.originalOutputPath = folderPath;
    }
    
    this.smartValidateOutput();
    
    const config = this.getFolderConfig();
    config.lastOutputFolder = this.originalOutputPath;
    this.addToRecentOutputFolders(this.originalOutputPath);
    this.saveFolderConfig(config);
    
    this.updateOutputPathDisplay(folderPath, 'success');
  },

  // Smart validation
    smartValidateOutput() {
        const config = this.getFolderConfig();
        
        if (!this.customOutputPath) {
            this.updateFolderStatus(this.$.outputFolderStatus, 
                'Please select an output folder', 'warning');
            return false;
        }

        if (config.skipEmptyCheck) {
            this.updateFolderStatus(this.$.outputFolderStatus, 
                'Ready to process (validation skipped)', 'info');
            return true;
        }

    if (!FileUtils.exists(this.customOutputPath)) {
            this.updateFolderStatus(this.$.outputFolderStatus, 
                'Output folder does not exist', 'error');
            return false;
        }

        const checkPath = this.originalOutputPath || this.customOutputPath;
    const files = FileUtils.getAllFilesInDirectory(checkPath);
        if (files.length > 0) {
            if (config.autoCreateOutput) {
                return true;
            } else {
                this.updateFolderStatus(this.$.outputFolderStatus, 
                    `Folder not empty (${files.length} files)`, 'warning');
                return false;
            }
        }

        this.updateFolderStatus(this.$.outputFolderStatus, 
            'Empty folder - ready to process', 'success');
        return true;
    },

  // API key management
    async saveApiKey() {
        const apiKey = this.$.apiKeyInput.value.trim();
        if (!apiKey) {
      this.log('Enter API key first', 'warning');
            return;
        }

        try {
            const configPath = this.getConfigPath();
      FileUtils.mkdirSync(path.dirname(configPath));

      fs.writeFileSync(configPath, JSON.stringify({
                tinypng_api_key: apiKey,
                saved_at: new Date().toISOString()
      }, null, 2));

      this.tinyPNGService.setApiKey(apiKey);
      this.log('✅ API key saved', 'success');
        } catch (error) {
      this.log(`❌ Save failed: ${error.message}`, 'error');
        }
    },

    async loadApiKey(showMessages = true) {
        try {
            const configPath = this.getConfigPath();
      if (!FileUtils.exists(configPath)) {
        if (showMessages) this.log('No saved API key', 'warning');
                return null;
            }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.tinypng_api_key) {
                this.$.apiKeyInput.value = config.tinypng_api_key;
        this.tinyPNGService.setApiKey(config.tinypng_api_key);
        if (showMessages) this.log('✅ API key loaded', 'success');
                return config.tinypng_api_key;
                }
                return null;
        } catch (error) {
      if (showMessages) this.log(`❌ Load failed: ${error.message}`, 'error');
            return null;
        }
    },

    getCurrentApiKey() {
        const inputKey = this.$.apiKeyInput.value.trim();
        if (inputKey) {
            return inputKey;
        }

        try {
            const configPath = this.getConfigPath();
      if (FileUtils.exists(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return config.tinypng_api_key || null;
            }
        } catch (error) {
            // Ignore error
        }
        
        return null;
    },

  // Logging - only essential messages
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
            totalAssets: 0,
            optimized: 0,
            errors: 0,
            totalSavedBytes: 0,
            isRunning: false
    };
    this.updateStatsDisplay();
        if (this.$.optimizationSection) {
      this.$.optimizationSection.style.display = 'none';
        }
    },

    updateStatsDisplay() {
    this.$.statTotalAssets.innerText = this.stats.totalAssets;
    this.$.statOptimized.innerText = this.stats.optimized;
    this.$.statErrors.innerText = this.stats.errors;
    
    const savedMB = (this.stats.totalSavedBytes / 1024 / 1024).toFixed(2);
    this.$.statSavedSize.innerText = `${savedMB} MB`;
    
        if (this.stats.totalAssets > 0 && this.$.optimizationSection) {
      this.$.optimizationSection.style.display = 'block';
        }
    },

    // Input folder methods
    async selectInputFolder() {
        try {
            const { dialog } = require('electron').remote || require('@electron/remote');
            const result = await dialog.showOpenDialog({
                title: 'Select Source Folder',
        properties: ['openDirectory']
      });

      if (result.canceled || !result.filePaths.length) {
        this.resetImageStats();
        return;
      }

      const folderPath = result.filePaths[0];
                this.setInputFolder(folderPath);
                
      const imageStats = FileUtils.analyzeImagesInFolder(folderPath);
      this.updateImageStats(imageStats);
      
                if (imageStats.total === 0) {
        this.log(`❌ No images found`, 'warning');
            }
        } catch (error) {
      this.log(`❌ Error: ${error.message}`, 'error');
      this.resetImageStats();
        }
    },

    setInputFolder(folderPath) {
        this.customInputPath = folderPath;
        this.$.inputFolderPath.textContent = folderPath;
        this.$.inputFolderPath.className = 'path-text success';
        this.$.inputFolderPath.title = folderPath;
    },

    // Output folder methods
    async selectOutputFolder() {
        try {
            const { dialog } = require('electron').remote || require('@electron/remote');
            const result = await dialog.showOpenDialog({
        title: 'Select Output Folder',
        properties: ['openDirectory']
            });

      if (result.canceled || !result.filePaths.length) return;
                
      const folderPath = result.filePaths[0];
                this.originalOutputPath = folderPath;
                
      if (this.validateOutputFolder(folderPath)) {
        this.setOutputFolder(folderPath);
                } else {
        this.customOutputPath = null;
        this.originalOutputPath = null;
            }
        } catch (error) {
      this.$.outputFolderInput.click();
    }
  },

    validateOutputFolder(folderPath) {
        const config = this.getFolderConfig();
        
        try {
      if (!FileUtils.exists(folderPath)) {
        this.log(`❌ Folder not found`, 'error');
        return false;
      }

      if (!fs.statSync(folderPath).isDirectory()) {
        this.log(`❌ Not a directory`, 'error');
        return false;
      }

      if (config.skipEmptyCheck) return true;

      const allFiles = FileUtils.getAllFilesInDirectory(folderPath);
      if (allFiles.length > 0 && !config.autoCreateOutput) {
        this.log(`❌ Folder not empty (${allFiles.length} files)`, 'warning');
        return false;
      }

      return true;
        } catch (error) {
      this.log(`❌ Validation error: ${error.message}`, 'error');
      return false;
        }
    },

    openOutputFolder() {
        if (!this.customOutputPath) {
      this.log('❌ No folder selected', 'warning');
      return;
    }
    this.openFolder(this.customOutputPath);
  },

    openApiWebsite() {
    shell.openExternal('https://tinypng.com/developers');
    },

    // Check API usage
    async checkApiUsage() {
        const apiKey = this.getCurrentApiKey();
        if (!apiKey) {
      this.log('Enter API key first', 'warning');
      return;
        }

        try {
      this.$.btnCheckUsage.disabled = true;
      this.$.btnCheckUsage.innerHTML = '<span>⏳</span><span>Checking...</span>';
      
      this.tinyPNGService.setApiKey(apiKey);
      const usage = await this.tinyPNGService.checkUsage();
      
      const remainingType = usage.remaining > 100 ? 'success' : usage.remaining > 20 ? 'warning' : 'error';
      this.log(`API: ${usage.used}/${usage.total} used, ${usage.remaining} remaining`, remainingType);
        } catch (error) {
      this.log(`❌ Check failed: ${error.message}`, 'error');
        } finally {
      this.$.btnCheckUsage.disabled = false;
      this.$.btnCheckUsage.innerHTML = '<span>📊</span><span>Check Usage</span>';
    }
  },

  // Update image stats display
    updateImageStats(stats) {
    this.$.statTotalImages.textContent = stats.total;
    this.$.statPngImages.textContent = stats.png;
    this.$.statJpgImages.textContent = stats.jpg;
    this.$.statWebpImages.textContent = stats.webp;

        if (stats.total > 0) {
      const totalMB = (stats.details.reduce((sum, img) => sum + img.size, 0) / 1024 / 1024).toFixed(2);
      this.log(`📊 ${stats.total} images (${totalMB}MB): PNG ${stats.png}, JPG ${stats.jpg}, WebP ${stats.webp}`, 'info');
    }
  },

    resetImageStats() {
    this.$.statTotalImages.textContent = '0';
    this.$.statPngImages.textContent = '0';
    this.$.statJpgImages.textContent = '0';
    this.$.statWebpImages.textContent = '0';
  },

    clearFolderAsset() {
        this.$.folderAsset.value = null;
        this.$.folderAsset._value = null;
    },

    clearCustomInputFolder() {
        this.customInputPath = null;
        this.$.inputFolderPath.textContent = 'No folder selected';
        this.$.inputFolderPath.className = 'path-text';
        this.$.inputFolderPath.title = '';
        this.$.inputFolderInput.value = '';
    },

  // Get selected image types
    getSelectedImageTypes() {
    const selectedTypes = [];
    
    if (this.$.chkPng.checked) selectedTypes.push('.png');
    if (this.$.chkJpg.checked) selectedTypes.push('.jpg', '.jpeg');
    if (this.$.chkWebp.checked) selectedTypes.push('.webp');
    
    return selectedTypes;
  },

    filterImagesBySelectedTypes(imageList) {
    const selectedTypes = this.getSelectedImageTypes();
        if (selectedTypes.length === 0) {
      this.log('⚠️ Select image types', 'warning');
      return [];
    }

    return imageList.filter(imagePath => {
      const ext = path.extname(imagePath).toLowerCase();
      return selectedTypes.includes(ext);
    });
  },

  // Main optimization function
    async runTiny() {
        if (this.stats.isRunning) {
      this.log('Already running', 'warning');
      return;
    }

    // Validate inputs
    const srcFolder = await this.getSourceFolder();
    if (!srcFolder) return;

        if (!this.customOutputPath) {
      this.log('❌ Select output folder', 'warning');
            return;
        }

        const apiKey = this.getCurrentApiKey();
        if (!apiKey) {
      this.log('❌ Enter API key', 'warning');
      return;
    }

    const imageStats = FileUtils.analyzeImagesInFolder(srcFolder);
    if (imageStats.total === 0) {
      this.log(`❌ No images found`, 'warning');
      return;
        }

        try {
      this.stats.isRunning = true;
      this.$.btnRun.disabled = true;
      this.$.btnRun.innerHTML = '<span>⏳</span><span>Processing...</span>';
      
      this.resetStats();
      this.showProgress(true);
      this.updateProgress(0, 'Initializing...');

      // Prepare output folder
      let outFolder = await this.prepareOutputFolder();
      if (!outFolder) return;

      // Set API key
      this.tinyPNGService.setApiKey(apiKey);
      FileUtils.mkdirSync(outFolder);

      // Get images to process
      const allImageFiles = FileUtils.getAllImages(srcFolder);
      const files = this.filterImagesBySelectedTypes(allImageFiles);
      
      if (files.length === 0) {
        this.log('No images to process', 'warning');
                        return;
      }

      this.stats.totalAssets = files.length;
      this.updateStatsDisplay();
      this.log(`Processing ${files.length} images`, 'info');

      // Optimize images
      const summary = await this.tinyPNGService.optimizeImages(
        files,
        srcFolder,
        outFolder,
        (current, total, file, result, error) => {
          const progress = ((current / total) * 100).toFixed(1);
          this.updateProgress(progress, `${current}/${total}: ${path.basename(file)}`);

          if (result) {
            this.stats.optimized++;
            this.stats.totalSavedBytes += result.saved;
            this.updateStatsDisplay();
          } else if (error) {
            this.stats.errors++;
            this.updateStatsDisplay();
            console.error(`Optimize error ${file}:`, error);
          }
        }
      );

      this.updateProgress(100, 'Complete!');

      // Update UI
      this.$.outputFolderPath.innerText = outFolder;
      this.$.outputFolderPath.title = outFolder;

      // Show summary
      const successRate = ((summary.optimized / this.stats.totalAssets) * 100).toFixed(1);
      this.log(`✨ Complete: ${summary.optimized}/${this.stats.totalAssets} (${successRate}%) saved ${summary.totalSavedMB.toFixed(2)}MB`, 'success');
      
      if (summary.compressionCount) {
        this.log(`API: ${summary.compressionCount}/500 used`, 'info');
      }

      // Auto open folder
      setTimeout(() => this.openFolder(outFolder), 1000);

    } catch (error) {
      this.stats.errors++;
      this.updateStatsDisplay();
      this.log(`❌ Error: ${error.message}`, 'error');
      this.updateProgress(0, `Error: ${error.message}`);
    } finally {
      this.stats.isRunning = false;
      this.$.btnRun.disabled = false;
      this.$.btnRun.innerHTML = '<span>🚀</span><span>Run Optimization</span>';
      setTimeout(() => this.showProgress(false), 3000);
    }
  },

  // Get source folder
  async getSourceFolder() {
    if (this.customInputPath) {
      return this.customInputPath;
    }

    const folderAssetValue = this.$.folderAsset.value;
    if (!folderAssetValue) {
      this.log('Select source folder', 'error');
      return null;
    }

    const folderUuid = folderAssetValue.uuid || folderAssetValue._uuid || folderAssetValue;
    const folderInfo = await AssetUtils.getAssetInfo(folderUuid);
    
    if (!folderInfo?.file) {
      this.log('Invalid source folder', 'error');
      return null;
    }

    return folderInfo.file;
  },

  // Prepare output folder with auto-create if needed
  async prepareOutputFolder() {
    let outFolder = this.customOutputPath;
    const config = this.getFolderConfig();

    if (config.autoCreateOutput) {
      const baseOutputFolder = this.originalOutputPath || outFolder;
      const files = FileUtils.getAllFilesInDirectory(baseOutputFolder);
      
      if (files.length > 0) {
        const uniqueFolderName = FileUtils.generateUniqueFolderName(baseOutputFolder);
        const newOutputPath = path.join(baseOutputFolder, uniqueFolderName);
        
        try {
          FileUtils.mkdirSync(newOutputPath);
          this.customOutputPath = newOutputPath;
          return newOutputPath;
        } catch (error) {
          this.log(`❌ Failed to create subfolder: ${error.message}`, 'error');
          return null;
        }
      }
    }

    return outFolder;
    },

    openFolder(folderPath) {
        if (process.platform === 'darwin') {
            child_process.spawn('open', [folderPath]);
        } else if (process.platform === 'win32') {
            child_process.spawn('explorer', [folderPath]);
        } else {
            child_process.spawn('xdg-open', [folderPath]);
        }
    }
};

// Panel ready handler
exports.ready = function () {
  // Initialize service
  this.init();
  
    // Initialize UI state
  this.resetStats();
  this.showProgress(false);
    
  // Initialize folder settings
  this.initFolderSettings();
    
  // Auto-load saved API key
  this.loadApiKey(false);

    // Attach event listeners
  this.$.btnRun.addEventListener('click', () => this.runTiny());
  this.$.btnClearLog.addEventListener('click', () => this.clearLog());
  this.$.btnCheckUsage.addEventListener('click', () => this.checkApiUsage());
  this.$.btnSaveKey.addEventListener('click', () => this.saveApiKey());
  this.$.btnLoadKey.addEventListener('click', () => this.loadApiKey(true));
    this.$.apiLink.addEventListener('click', (e) => {
    e.preventDefault();
    this.openApiWebsite();
  });
    
    // Folder settings panel toggle
    this.$.btnFolderSettings.addEventListener('click', () => {
        const panel = this.$.folderSettingsPanel;
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
  });

    // Settings checkboxes
    this.$.rememberFolders.addEventListener('change', (e) => {
        const config = this.getFolderConfig();
        config.rememberFolders = e.target.checked;
        this.saveFolderConfig(config);
  });

    this.$.skipEmptyCheck.addEventListener('change', (e) => {
        const config = this.getFolderConfig();
        config.skipEmptyCheck = e.target.checked;
        this.saveFolderConfig(config);
        this.smartValidateOutput();
  });

    this.$.autoCreateOutput.addEventListener('change', (e) => {
        const config = this.getFolderConfig();
        config.autoCreateOutput = e.target.checked;
        this.saveFolderConfig(config);
  });

    this.$.btnResetFolderSettings.addEventListener('click', () => {
    if (confirm('Reset all folder settings to default?')) {
      localStorage.removeItem(FOLDER_CONFIG_KEY);
      this.initFolderSettings();
      this.log('✅ Folder settings reset', 'success');
    }
  });
    
    // Input folder selection
    this.$.btnSelectInput.addEventListener('click', () => {
    this.resetImageStats();
    this.clearFolderAsset();
    this.selectInputFolder();
  });
    
    // Output folder selection
  this.$.btnSelectOutput.addEventListener('click', () => this.selectOutputFolder());
  this.$.btnOpenOutput.addEventListener('click', () => this.openOutputFolder());
    
  // Source folder change detection
    this.$.folderAsset.addEventListener('change', () => {
    this.resetImageStats();
    this.clearCustomInputFolder();
    
    setTimeout(async () => {
      const folderAssetValue = this.$.folderAsset.value;
      if (folderAssetValue) {
        const folderUuid = folderAssetValue.uuid || folderAssetValue._uuid || folderAssetValue;
        const folderInfo = await AssetUtils.getAssetInfo(folderUuid);
        if (folderInfo?.file) {
          const imageStats = FileUtils.analyzeImagesInFolder(folderInfo.file);
          this.updateImageStats(imageStats);
        }
      }
    }, 100);
  });

    // Image type checkbox changes
  this.$.chkPng.addEventListener('change', () => {
    const selectedTypes = [];
    let selectedCount = 0;

    if (this.$.chkPng.checked) {
      selectedTypes.push('PNG');
      selectedCount += parseInt(this.$.statPngImages.textContent) || 0;
    }
    if (this.$.chkJpg.checked) {
      selectedTypes.push('JPG/JPEG');
      selectedCount += parseInt(this.$.statJpgImages.textContent) || 0;
    }
    if (this.$.chkWebp.checked) {
      selectedTypes.push('WebP');
      selectedCount += parseInt(this.$.statWebpImages.textContent) || 0;
    }

    if (selectedTypes.length > 0) {
      this.log(`🎯 Selected: ${selectedTypes.join(', ')} (${selectedCount} files)`, 'info');
    }
  });

  this.$.chkJpg.addEventListener('change', () => this.$.chkPng.dispatchEvent(new Event('change')));
  this.$.chkWebp.addEventListener('change', () => this.$.chkPng.dispatchEvent(new Event('change')));
    
    // Enter key to save API key
    this.$.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
      this.saveApiKey();
        }
  });

    // Initialize output folder display
  this.updateOutputPathDisplay('❌ Please select a folder', 'error');
  
  this.log('🚀 TinyPNG Optimizer ready', 'info');
  
  // Auto-restore last output folder
  setTimeout(() => {
    this.restoreLastOutputFolder();
  }, 500);
};
