'use strict';
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const tinify = require('tinify');
const { shell } = require('electron');

// Load external template and embed CSS
const cssContent = fs.readFileSync(path.join(__dirname, 'panel.css'), 'utf8')
const htmlContent = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8')

exports.template = `
<style>
${cssContent}
</style>
${htmlContent}
`

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
    // Combined analysis panel
    analysisPanel: '#analysisPanel',
    btnCloseAnalysis: '#btnCloseAnalysis',
    optimizationSection: '#optimizationSection',
    statTotalImages: '#statTotalImages',
    statPngImages: '#statPngImages',
    statJpgImages: '#statJpgImages',
    statWebpImages: '#statWebpImages',
    // Image type checkboxes
    chkPng: '#chkPng',
    chkJpg: '#chkJpg',
    chkWebp: '#chkWebp',
    // New folder management elements
    btnFolderSettings: '#btnFolderSettings',
    folderSettingsPanel: '#folderSettingsPanel',
    rememberFolders: '#rememberFolders',
    skipEmptyCheck: '#skipEmptyCheck',
    autoCreateOutput: '#autoCreateOutput',
    btnResetFolderSettings: '#btnResetFolderSettings',
    sourceFolderStatus: '#sourceFolderStatus',
    outputFolderStatus: '#outputFolderStatus',
    processAnyway: '#processAnyway'
}

exports.methods = {
    // Stats tracking
    stats: {
        totalAssets: 0,
        optimized: 0,
        errors: 0,
        totalSavedBytes: 0,
        isRunning: false
    },

    // Custom output folder path
    customOutputPath: null,

    // Folder settings configuration key
    FOLDER_CONFIG_KEY: 'tinyimage-folder-config',

    // Đường dẫn file cấu hình API key
    getConfigPath() {
        return path.join(Editor.Project.path, 'temp', 'tinypng-config.json');
    },

    // Folder Configuration Management
    getFolderConfig() {
        try {
            const saved = localStorage.getItem(this.FOLDER_CONFIG_KEY);
            return saved ? JSON.parse(saved) : {
                rememberFolders: true,
                skipEmptyCheck: false,
                autoCreateOutput: true,
                lastSourceFolder: null,
                lastOutputFolder: null,
                projectPath: Editor.Project.path
            };
        } catch (error) {
            return {
                rememberFolders: true,
                skipEmptyCheck: false,
                autoCreateOutput: true,
                lastSourceFolder: null,
                lastOutputFolder: null,
                projectPath: Editor.Project.path
            };
        }
    },

    saveFolderConfig(config) {
        try {
            localStorage.setItem(this.FOLDER_CONFIG_KEY, JSON.stringify(config));
        } catch (error) {
            this.logMessage(`Failed to save folder settings: ${error.message}`, 'warning');
        }
    },

    // Initialize folder settings UI
    initFolderSettings() {
        const config = this.getFolderConfig();
        
        // Load settings into UI
        this.$.rememberFolders.checked = config.rememberFolders;
        this.$.skipEmptyCheck.checked = config.skipEmptyCheck;
        this.$.autoCreateOutput.checked = config.autoCreateOutput;

        // Auto-load last folders if remember is enabled
        if (config.rememberFolders) {
            if (config.lastOutputFolder && fs.existsSync(config.lastOutputFolder)) {
                this.setOutputFolder(config.lastOutputFolder);
            }
        }
    },

    // Update folder status display
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

    showAnalysisPanel() {
        this.$.analysisPanel.style.display = 'block';
        this.$.optimizationSection.style.display = 'none'; // Hide optimization stats initially
    },

    hideAnalysisPanel() {
        this.$.analysisPanel.style.display = 'none';
    },

    showOptimizationStats() {
        if (this.$.analysisPanel.style.display === 'block') {
            this.$.optimizationSection.style.display = 'block';
        }
    },

    restoreLastOutputFolder() {
        const config = this.getFolderConfig();
        if (!config.rememberFolders) {
            this.logMessage('💡 Tip: Enable "Remember folders" in settings to auto-restore last output folder', 'info');
            return;
        }

        if (config.lastOutputFolder && fs.existsSync(config.lastOutputFolder)) {
            this.originalOutputPath = config.lastOutputFolder;
            this.setOutputFolder(config.lastOutputFolder);
            this.logMessage(`🕐 Restored last output folder: ${path.basename(config.lastOutputFolder)}`, 'success');
        } else if (config.lastOutputFolder) {
            this.logMessage(`⚠️ Last output folder no longer exists: ${config.lastOutputFolder}`, 'warning');
        } else {
            this.logMessage('💡 No previous output folder found. Please select a folder manually.', 'info');
        }
    },

    // Get recent output folders (for dropdown in future)
    getRecentOutputFolders() {
        const config = this.getFolderConfig();
        return config.recentOutputFolders || [];
    },

    addToRecentOutputFolders(folderPath) {
        const config = this.getFolderConfig();
        if (!config.recentOutputFolders) {
            config.recentOutputFolders = [];
        }
        
        // Remove if already exists
        const index = config.recentOutputFolders.indexOf(folderPath);
        if (index > -1) {
            config.recentOutputFolders.splice(index, 1);
        }
        
        // Add to beginning
        config.recentOutputFolders.unshift(folderPath);
        
        // Keep only last 5 folders
        if (config.recentOutputFolders.length > 5) {
            config.recentOutputFolders.pop();
        }
        
        this.saveFolderConfig(config);
    },

    // Smart folder validation
    async smartValidateSource() {
        const config = this.getFolderConfig();
        
        const isValid = await this.validateSourceFolder();
        if (!isValid && !config.skipEmptyCheck) {
            this.updateFolderStatus(this.$.sourceFolderStatus, 
                'No images found in source folder', 'warning');
            return false;
        } else if (config.skipEmptyCheck) {
            this.updateFolderStatus(this.$.sourceFolderStatus, 
                'Validation skipped - ready to process', 'info');
            return true;
        }
        
        return isValid;
    },

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

        // Check if folder exists
        if (!fs.existsSync(this.customOutputPath)) {
            this.updateFolderStatus(this.$.outputFolderStatus, 
                'Output folder does not exist', 'error');
            return false;
        }

        // Check if empty (unless auto-create is enabled)
        // Use original output path for checking, not the auto-created path
        const checkPath = this.originalOutputPath || this.customOutputPath;
        const files = this.getAllFilesInDirectory(checkPath);
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

    // Enhanced output folder selection
    setOutputFolder(folderPath) {
        this.customOutputPath = folderPath;
        
        // Store the original user-selected folder to avoid nested creation
        if (!this.originalOutputPath) {
            this.originalOutputPath = folderPath;
        }
        
        this.smartValidateOutput();
        
        // Save only the original folder, not the auto-created ones
        const config = this.getFolderConfig();
        config.lastOutputFolder = this.originalOutputPath;
        this.addToRecentOutputFolders(this.originalOutputPath);
        this.saveFolderConfig(config);
        
        // Update path display
        this.updateOutputPathDisplay(folderPath, 'success');
        
        this.logMessage(`💾 Output folder set: ${path.basename(folderPath)}`, 'info');
    },

    // Lưu API key vào file cấu hình
    async saveApiKey() {
        const apiKey = this.$.apiKeyInput.value.trim();
        if (!apiKey) {
            this.logMessage('Please enter an API key first.', 'warning');
            return;
        }

        try {
            const configPath = this.getConfigPath();
            const configDir = path.dirname(configPath);
            
            // Tạo thư mục nếu chưa tồn tại
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const config = {
                tinypng_api_key: apiKey,
                saved_at: new Date().toISOString()
            };

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            this.logMessage('✅ API key saved successfully!', 'success');
            this.updateStatus('API key saved - Ready to optimize');
        } catch (error) {
            this.logMessage(`Failed to save API key: ${error.message}`, 'error');
            this.updateStatus('Error saving API key');
        }
    },

    // Tải API key từ file cấu hình
    async loadApiKey(showMessages = true) {
        try {
            const configPath = this.getConfigPath();
            
            if (!fs.existsSync(configPath)) {
                if (showMessages) {
                    this.logMessage('No saved API key found. Please enter and save one first.', 'warning');
                }
                return null;
            }

            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configContent);
            
            if (config.tinypng_api_key) {
                this.$.apiKeyInput.value = config.tinypng_api_key;
                if (showMessages) {
                    this.logMessage('✅ API key loaded successfully!', 'success');
                }
                return config.tinypng_api_key;
            } else {
                if (showMessages) {
                    this.logMessage('Invalid config file format.', 'error');
                }
                return null;
            }
        } catch (error) {
            if (showMessages) {
                this.logMessage(`Failed to load API key: ${error.message}`, 'error');
            }
            return null;
        }
    },

    // Lấy API key hiện tại (từ input hoặc file)
    getCurrentApiKey() {
        const inputKey = this.$.apiKeyInput.value.trim();
        if (inputKey) {
            return inputKey;
        }

        // Nếu input trống, thử load từ file
        try {
            const configPath = this.getConfigPath();
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return config.tinypng_api_key || null;
            }
        } catch (error) {
            // Ignore error
        }
        
        return null;
    },

    logMessage(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString()
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️'
        this.$.log.innerText += `[${timestamp}] ${prefix} ${message}\n`

        // Auto scroll to bottom
        this.$.log.scrollTop = this.$.log.scrollHeight
    },

    clearLog() {
        this.$.log.innerText = ''
        this.resetStats()
        // Hide analysis panel when clearing
        this.hideAnalysisPanel()
        // Clear folder asset
        this.$.folderAsset.value = null
    },

    // Progress bar methods
    showProgress(show = true) {
        if (show) {
            this.$.progressContainer.style.display = 'block'
        } else {
            this.$.progressContainer.style.display = 'none'
        }
    },

    updateProgress(percent, message) {
        this.$.progressFill.style.width = `${percent}%`
        this.$.progressText.innerText = message
    },

    // Stats methods
    resetStats() {
        this.stats = {
            totalAssets: 0,
            optimized: 0,
            errors: 0,
            totalSavedBytes: 0,
            isRunning: false
        }
        this.updateStatsDisplay()
        // Hide optimization section when resetting
        if (this.$.optimizationSection) {
            this.$.optimizationSection.style.display = 'none'
        }
    },

    updateStatsDisplay() {
        this.$.statTotalAssets.innerText = this.stats.totalAssets
        this.$.statOptimized.innerText = this.stats.optimized
        this.$.statErrors.innerText = this.stats.errors
        
        const savedMB = (this.stats.totalSavedBytes / 1024 / 1024).toFixed(2)
        this.$.statSavedSize.innerText = `${savedMB} MB`
        
        // Show optimization section if there are stats to display
        if (this.stats.totalAssets > 0 && this.$.optimizationSection) {
            this.$.optimizationSection.style.display = 'block'
        }
    },

    // Output folder methods
    async selectOutputFolder() {
        try {
            // Use Electron's dialog to select folder
            const { dialog } = require('electron').remote || require('@electron/remote');
            
            const result = await dialog.showOpenDialog({
                title: 'Select Empty Output Folder',
                properties: ['openDirectory'],
                message: 'Choose an empty folder to save optimized images'
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const folderPath = result.filePaths[0];
                this.logMessage(`🔍 Checking selected folder: ${folderPath}`, 'info')
                
                // Reset original path when user selects new folder
                this.originalOutputPath = folderPath;
                
                // Validate that the selected output folder is suitable
                const validationResult = this.validateOutputFolder(folderPath);
                if (validationResult) {
                    // Use the returned path (might be a subfolder if auto-created)
                    const actualPath = typeof validationResult === 'string' ? validationResult : folderPath;
                    this.setOutputFolder(actualPath);
                    this.logMessage(`✅ Output folder selected: ${actualPath}`, 'success')
                } else {
                    // Reset selection if validation fails
                    this.customOutputPath = null
                    this.originalOutputPath = null
                }
            }
        } catch (error) {
            // Fallback to file input method if dialog not available
            this.logMessage('Using fallback folder selection method...', 'info')
            this.$.outputFolderInput.click()
        }
    },

    handleOutputFolderSelect(event) {
        const files = event.target.files
        if (files.length > 0) {
            // Try to get the folder path
            const firstFile = files[0]
            let folderPath = null
            
            try {
                if (firstFile.webkitRelativePath) {
                    // Method 1: Use webkitRelativePath to find the selected folder
                    const pathParts = firstFile.webkitRelativePath.split('/')
                    if (pathParts.length > 1) {
                        // Get the directory that contains the selected file
                        const relativePath = pathParts.slice(0, -1).join('/')
                        
                        // Try to construct the full path
                        if (firstFile.path) {
                            const fullFilePath = firstFile.path
                            const parentDir = path.dirname(path.dirname(fullFilePath))
                            folderPath = path.join(parentDir, pathParts[0])
                        }
                    } else {
                        // Single level, the folder itself
                        if (firstFile.path) {
                            folderPath = path.dirname(firstFile.path)
                        }
                    }
                }
                
                // Method 2: Fallback - use file path directory
                if (!folderPath && firstFile.path) {
                    folderPath = path.dirname(firstFile.path)
                }
                
                // Method 3: Last resort - prompt user to select manually
                if (!folderPath) {
                    this.logMessage('❌ Cannot determine folder path from selection. Please try selecting the folder again or use a different method.', 'warning')
                    this.$.outputFolderInput.value = ''
                    return
                }
                
            } catch (error) {
                this.logMessage(`Error processing folder selection: ${error.message}`, 'error')
                this.$.outputFolderInput.value = ''
                return
            }
            
            if (folderPath && fs.existsSync(folderPath)) {
                this.logMessage(`🔍 Checking selected folder: ${folderPath}`, 'info')
                
                // Reset original path when user selects new folder via file input
                this.originalOutputPath = folderPath;
                
                // Validate that the selected output folder is suitable
                const validationResult = this.validateOutputFolder(folderPath);
                if (validationResult) {
                    // Use the returned path (might be a subfolder if auto-created)
                    const actualPath = typeof validationResult === 'string' ? validationResult : folderPath;
                    this.setOutputFolder(actualPath);
                    this.logMessage(`✅ Output folder selected: ${path.basename(actualPath)}`, 'success')
                } else {
                    // Reset selection if validation fails
                    this.customOutputPath = null
                    this.originalOutputPath = null
                    this.$.outputFolderInput.value = ''
                }
            } else {
                this.logMessage(`❌ Folder does not exist: ${folderPath}`, 'error')
                this.$.outputFolderInput.value = ''
            }
        }
    },



    // Generate unique folder name with sequential numbering
    generateUniqueOptimizeFolderName(parentDir) {
        // First try "optimize"
        let folderName = 'optimize';
        if (!fs.existsSync(path.join(parentDir, folderName))) {
            return folderName;
        }
        
        // If "optimize" exists, try optimize_1, optimize_2, etc.
        let counter = 1;
        folderName = `optimize_${counter}`;
        
        // Find next available number
        while (fs.existsSync(path.join(parentDir, folderName))) {
            counter++;
            folderName = `optimize_${counter}`;
        }
        
        return folderName;
    },

    // Enhanced validate output folder with smart options
    validateOutputFolder(folderPath) {
        const config = this.getFolderConfig();
        
        try {
            // Check if folder exists
            if (!fs.existsSync(folderPath)) {
                this.logMessage(`❌ Output folder does not exist: ${folderPath}`, 'error')
                return false
            }

            // Check if it's actually a directory
            const stat = fs.statSync(folderPath)
            if (!stat.isDirectory()) {
                this.logMessage(`❌ Selected path is not a directory: ${folderPath}`, 'error')
                return false
            }

            // Skip empty check if setting is enabled
            if (config.skipEmptyCheck) {
                this.logMessage(`⚡ Validation skipped - using folder: ${path.basename(folderPath)}`, 'info')
                return true
            }

            // Check if folder is empty
            const allFiles = this.getAllFilesInDirectory(folderPath)
            
            if (allFiles.length > 0) {
                // Auto-create sibling folder if enabled
                if (config.autoCreateOutput) {
                    return true; // Allow to continue
                } else {
                    this.logMessage(`❌ Output folder "${path.basename(folderPath)}" is not empty (contains ${allFiles.length} file(s)). Please select an empty folder or enable auto-create.`, 'warning')
                    return false
                }
            }

            // Folder is valid
            this.logMessage(`✅ Output folder "${path.basename(folderPath)}" is valid and ready.`, 'success')
            return true

        } catch (error) {
            this.logMessage(`Error validating output folder: ${error.message}`, 'error')
            return false
        }
    },





    openOutputFolder() {
        if (!this.customOutputPath) {
            this.logMessage('❌ No output folder selected. Please choose a folder first.', 'warning')
            return
        }
        this.openFolder(this.customOutputPath)
    },

    openApiWebsite() {
        // Open TinyPNG developers website
        shell.openExternal('https://tinypng.com/developers')
    },

    // Check API usage
    async checkApiUsage() {
        const apiKey = this.getCurrentApiKey();
        if (!apiKey) {
            this.logMessage('Please enter and save your TinyPNG API key first!', 'warning')
            return
        }

        try {
            this.$.btnCheckUsage.disabled = true
            this.$.btnCheckUsage.innerHTML = '<span>⏳</span><span>Checking...</span>'
            
            tinify.key = apiKey
            
            // Make a small test to get compression count
            const testBuffer = Buffer.from('test')
            try {
                await tinify.fromBuffer(testBuffer).toBuffer()
            } catch (e) {
                // Expected to fail, but will give us compression count
            }
            
            const compressionsThisMonth = tinify.compressionCount;
            const remaining = 500 - compressionsThisMonth
            
            if (compressionsThisMonth !== undefined) {
                this.logMessage(`🔑 API Usage: ${compressionsThisMonth}/500 compressions used this month`, 'info')
                this.logMessage(`📊 Remaining: ${remaining} compressions left`, remaining > 100 ? 'success' : remaining > 20 ? 'warning' : 'error')
            } else {
                this.logMessage('Could not retrieve API usage information', 'warning')
            }
        } catch (error) {
            this.logMessage(`Failed to check API usage: ${error.message}`, 'error')
        } finally {
            this.$.btnCheckUsage.disabled = false
            this.$.btnCheckUsage.innerHTML = '<span>📊</span><span>Check Usage</span>'
        }
    },

    // Validate source folder (must contain images)
    async validateSourceFolder() {
        const folderAssetValue = this.$.folderAsset.value;
        if (!folderAssetValue) {
            return false; // Source folder is required
        }

        const folderUuid = folderAssetValue.uuid || folderAssetValue._uuid || folderAssetValue;
        const folderInfo = await this.getAssetInfo(folderUuid);
        
        if (!folderInfo?.file) {
            this.logMessage('Unable to get source folder information.', 'error')
            return false;
        }

        const srcFolder = folderInfo.file;
        
        try {
            // Analyze images in folder
            const imageStats = this.analyzeImagesInFolder(srcFolder);
            this.updateImageStats(imageStats);
            
            if (imageStats.total === 0) {
                this.logMessage(`❌ Source folder "${path.basename(srcFolder)}" contains no image files. Please select a folder with PNG, JPG, JPEG, or WebP files.`, 'warning');
                return false;
            }

            // Source folder has images, it's valid
            this.logMessage(`✅ Source folder "${path.basename(srcFolder)}" analyzed successfully.`, 'success');
            return true;

        } catch (error) {
            this.logMessage(`Error validating source folder: ${error.message}`, 'error');
            return false;
        }
    },

    // Get all files in directory (not just images)
    getAllFilesInDirectory(dir) {
        let results = []
        try {
            const list = fs.readdirSync(dir)
            for (const file of list) {
                const f = path.join(dir, file)
                const stat = fs.statSync(f)
                if (stat.isDirectory()) {
                    results = results.concat(this.getAllFilesInDirectory(f))
                } else {
                    results.push(f)
                }
            }
        } catch (error) {
            // Ignore errors
        }
        return results
    },

    // Lấy thông tin asset từ UUID
    async getAssetInfo(uuid) {
        try {
            const info = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
            return info;
        } catch (error) {
            console.error(`Failed to get asset info for ${uuid}:`, error);
            return null;
        }
    },

    // Lấy tất cả file ảnh trong thư mục
    getAllImages(dir) {
        let results = []
        const list = fs.readdirSync(dir)
        for (const file of list) {
            const f = path.join(dir, file)
            const stat = fs.statSync(f)
            if (stat.isDirectory()) {
                results = results.concat(this.getAllImages(f))
            } else if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
                results.push(f)
            }
        }
        return results
    },

    // Phân tích thông tin ảnh trong thư mục
    analyzeImagesInFolder(dir) {
        const imageStats = {
            total: 0,
            png: 0,
            jpg: 0,
            webp: 0,
            details: []
        }

        const analyzeDir = (currentDir) => {
            const list = fs.readdirSync(currentDir)
            for (const file of list) {
                const filePath = path.join(currentDir, file)
                const stat = fs.statSync(filePath)
                
                if (stat.isDirectory()) {
                    analyzeDir(filePath)
                } else {
                    const ext = path.extname(file).toLowerCase()
                    if (/\.(png|jpg|jpeg|webp)$/i.test(ext)) {
                        imageStats.total++
                        imageStats.details.push({
                            path: filePath,
                            name: file,
                            ext: ext,
                            size: stat.size
                        })

                        // Count by type
                        if (ext === '.png') {
                            imageStats.png++
                        } else if (['.jpg', '.jpeg'].includes(ext)) {
                            imageStats.jpg++
                        } else if (ext === '.webp') {
                            imageStats.webp++
                        }
                    }
                }
            }
        }

        try {
            analyzeDir(dir)
        } catch (error) {
            console.error('Error analyzing images:', error)
        }

        return imageStats
    },

    // Cập nhật hiển thị thông tin ảnh
    updateImageStats(stats) {
        this.$.statTotalImages.textContent = stats.total
        this.$.statPngImages.textContent = stats.png
        this.$.statJpgImages.textContent = stats.jpg
        this.$.statWebpImages.textContent = stats.webp

        if (stats.total > 0) {
            // Log detailed information
            const totalSizeMB = (stats.details.reduce((sum, img) => sum + img.size, 0) / 1024 / 1024).toFixed(2)
            this.logMessage(`📊 Found ${stats.total} images (${totalSizeMB}MB total):`, 'info')
            this.logMessage(`   🖼️ PNG: ${stats.png} files`, 'info')
            this.logMessage(`   📷 JPG/JPEG: ${stats.jpg} files`, 'info')
            this.logMessage(`   🌐 WebP: ${stats.webp} files`, 'info')
        }
    },

    // Lấy file ảnh theo loại được chọn
    getSelectedImageTypes() {
        const selectedTypes = []
        
        if (this.$.chkPng.checked) selectedTypes.push('.png')
        if (this.$.chkJpg.checked) selectedTypes.push('.jpg', '.jpeg')
        if (this.$.chkWebp.checked) selectedTypes.push('.webp')
        
        return selectedTypes
    },

    // Lọc file ảnh theo loại được chọn
    filterImagesBySelectedTypes(imageList) {
        const selectedTypes = this.getSelectedImageTypes()
        if (selectedTypes.length === 0) {
            this.logMessage('⚠️ Please select at least one image type to optimize!', 'warning')
            return []
        }

        const filteredImages = imageList.filter(imagePath => {
            const ext = path.extname(imagePath).toLowerCase()
            return selectedTypes.includes(ext)
        })

        if (filteredImages.length === 0) {
            this.logMessage('⚠️ No images of selected types found!', 'warning')
        } else {
            const typeNames = []
            if (this.$.chkPng.checked) typeNames.push('PNG')
            if (this.$.chkJpg.checked) typeNames.push('JPG/JPEG')
            if (this.$.chkWebp.checked) typeNames.push('WebP')
            
            this.logMessage(`🎯 Optimizing ${typeNames.join(', ')} files: ${filteredImages.length} images selected`, 'info')
        }

        return filteredImages
    },

    // Cập nhật thông tin khi thay đổi lựa chọn loại ảnh
    updateSelectedTypesInfo() {
        const selectedTypes = []
        let selectedCount = 0

        if (this.$.chkPng.checked) {
            selectedTypes.push('PNG')
            selectedCount += parseInt(this.$.statPngImages.textContent) || 0
        }
        if (this.$.chkJpg.checked) {
            selectedTypes.push('JPG/JPEG')
            selectedCount += parseInt(this.$.statJpgImages.textContent) || 0
        }
        if (this.$.chkWebp.checked) {
            selectedTypes.push('WebP')
            selectedCount += parseInt(this.$.statWebpImages.textContent) || 0
        }

        if (selectedTypes.length > 0) {
            this.logMessage(`🎯 Selected: ${selectedTypes.join(', ')} (${selectedCount} files)`, 'info')
        } else {
            this.logMessage('⚠️ No image types selected. Please select at least one type to optimize.', 'warning')
        }
    },

    async runTiny() {
        // Check if already running
        if (this.stats.isRunning) {
            this.logMessage('Optimization is already running. Please wait...', 'warning')
            return
        }

        // Show optimization stats section
        this.showOptimizationStats();

        // Validate source folder (must contain images)
        const isValidSourceFolder = await this.validateSourceFolder();
        if (!isValidSourceFolder) {
            return; // Validation failed, error already logged
        }

        // Get source folder info
        const folderAssetValue = this.$.folderAsset.value;
        const folderUuid = folderAssetValue.uuid || folderAssetValue._uuid || folderAssetValue;
        const folderInfo = await this.getAssetInfo(folderUuid);
        
        if (!folderInfo?.file) {
            this.logMessage('Unable to get source folder information. Please select a valid folder.', 'error')
            return
        }

        // Smart validation with bypass option
        const config = this.getFolderConfig();
        const processAnyway = this.$.processAnyway.checked;
        
        // Validate output folder
        if (!this.customOutputPath) {
            this.updateOutputPathDisplay('❌ Please select a folder', 'error')
            this.logMessage('❌ Please select an output folder to save optimized images.', 'warning')
            return;
        }

        if (!processAnyway && !this.smartValidateOutput()) {
            this.logMessage('❌ Output folder validation failed. Check "Process anyway" to bypass validation.', 'warning');
            return;
        }

        // Validate source folder
        if (!processAnyway && !(await this.smartValidateSource())) {
            this.logMessage('❌ Source folder validation failed. Check "Process anyway" to bypass validation.', 'warning');
            return;
        }

        // Kiểm tra API key
        const apiKey = this.getCurrentApiKey();
        if (!apiKey) {
            this.logMessage('Please enter and save your TinyPNG API key first!', 'warning')
            return
        }

        try {
            // Set running state
            this.stats.isRunning = true
            
            // Disable button and update text
            this.$.btnRun.disabled = true
            this.$.btnRun.innerHTML = '<span>⏳</span><span>Processing...</span>'
            
            // Reset and show stats
            this.resetStats()
            
            // Show progress
            this.showProgress(true)
            this.updateProgress(0, 'Initializing...')

            this.logMessage('Starting TinyPNG optimization process...')

            // Source folder is the selected folder (contains images)
            const srcFolder = folderInfo.file
            let outFolder = this.customOutputPath
            
            // Check if we need to auto-create subfolder inside ORIGINAL OUTPUT location
            const config = this.getFolderConfig();
            if (config.autoCreateOutput) {
                // Use original output folder, not the current customOutputPath
                const baseOutputFolder = this.originalOutputPath || outFolder;
                const files = this.getAllFilesInDirectory(baseOutputFolder);
                if (files.length > 0) {
                    // Create subfolder inside the original output folder
                    const uniqueFolderName = this.generateUniqueOptimizeFolderName(baseOutputFolder);
                    const newOutputPath = path.join(baseOutputFolder, uniqueFolderName);
                    
                    try {
                        fs.mkdirSync(newOutputPath, { recursive: true });
                        outFolder = newOutputPath;
                        this.customOutputPath = newOutputPath;
                        this.logMessage(`📁 Auto-created subfolder: ${path.basename(baseOutputFolder)}/${uniqueFolderName}`, 'success');
                    } catch (error) {
                        this.logMessage(`Failed to create subfolder: ${error.message}`, 'error');
                        return;
                    }
                }
            }

            this.logMessage(`📁 Source folder: ${srcFolder}`)
            this.logMessage(`📁 Output folder: ${outFolder}`)

            // Set API key
            tinify.key = apiKey
            this.logMessage('🔑 API key configured successfully')

            // Create output directory
            if (!fs.existsSync(outFolder)) {
                fs.mkdirSync(outFolder, { recursive: true })
            }
            this.logMessage('📂 Created output directory')

            // Find all images and filter by selected types
            const allImageFiles = this.getAllImages(srcFolder)
            const files = this.filterImagesBySelectedTypes(allImageFiles)
            
            if (files.length === 0) {
                if (allImageFiles.length > 0) {
                    this.logMessage('No images of selected types found. Please check your image type selections.', 'warning')
                } else {
                    this.logMessage('No PNG, JPG, JPEG, or WebP files found in the selected folder.', 'warning')
                }
                return
            }

            // Initialize stats
            this.stats.totalAssets = files.length
            this.updateStatsDisplay()

            this.logMessage(`🖼️ Processing ${files.length} selected image(s) out of ${allImageFiles.length} total`)
            this.logMessage('─────────────────────────────────────')

            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const relPath = path.relative(srcFolder, file)
                const outPath = path.join(outFolder, relPath)
                const progress = ((i + 1) / files.length * 100).toFixed(1)

                this.logMessage(`[${i + 1}/${files.length}] Processing: ${relPath}`)
                this.updateProgress(progress, `Processing ${i + 1}/${files.length}: ${path.basename(file)}`)

                // Create output subdirectory if needed
                const outDir = path.dirname(outPath);
                if (!fs.existsSync(outDir)) {
                    fs.mkdirSync(outDir, { recursive: true })
                }

                try {
                    const source = tinify.fromFile(file)
                    await source.toFile(outPath)

                    const beforeSize = fs.statSync(file).size
                    const afterSize = fs.statSync(outPath).size
                    const beforeKB = beforeSize / 1024
                    const afterKB = afterSize / 1024
                    const savedKB = beforeKB - afterKB
                    const savedPercent = (100 * (1 - afterSize / beforeSize)).toFixed(1)
                    const savedBytes = beforeSize - afterSize

                    // Update stats
                    this.stats.optimized++
                    this.stats.totalSavedBytes += savedBytes
                    this.updateStatsDisplay()

                    this.logMessage(`  ✅ ${beforeKB.toFixed(1)}KB → ${afterKB.toFixed(1)}KB (saved ${savedKB.toFixed(1)}KB, -${savedPercent}%)`, 'success')
                } catch (e) {
                    this.stats.errors++
                    this.updateStatsDisplay()
                    this.logMessage(`  ❌ Failed: ${e.message}`, 'error')
                }
            }

            // Final progress
            this.updateProgress(100, 'Optimization completed!')
            
            const totalSavedMB = (this.stats.totalSavedBytes / 1024 / 1024)
            const successRate = ((this.stats.optimized / this.stats.totalAssets) * 100).toFixed(1)

            this.logMessage('─────────────────────────────────────')
            this.logMessage('✨ Optimization completed!', 'success')
            this.logMessage(`📊 Results: ${this.stats.optimized} successful, ${this.stats.errors} failed (${successRate}% success rate)`)
            this.logMessage(`💾 Total space saved: ${totalSavedMB.toFixed(2)}MB`)
            
            // Show output folder note
            this.logMessage(`📁 Output saved to: ${outFolder}`)
            
            // Update output folder path display
            this.$.outputFolderPath.innerText = outFolder
            this.$.outputFolderPath.title = outFolder

            // Hiển thị thông tin usage API
            try {
                const compressionsThisMonth = tinify.compressionCount;
                if (compressionsThisMonth !== undefined) {
                    this.logMessage(`🔑 API Usage: ${compressionsThisMonth}/500 compressions this month`)
                }
            } catch (e) {
                // Ignore API usage error
            }

            // Auto open folder
            setTimeout(() => {
                this.openFolder(outFolder)
            }, 1000)

        } catch (error) {
            this.stats.errors++
            this.updateStatsDisplay()
            this.logMessage(`Critical error: ${error.message}`, 'error')
            this.updateProgress(0, `Error: ${error.message}`)
        } finally {
            // Reset running state
            this.stats.isRunning = false
            
            // Re-enable button
            this.$.btnRun.disabled = false
            this.$.btnRun.innerHTML = '<span>🚀</span><span>Run Optimization</span>'
            
            // Hide progress after delay
            setTimeout(() => {
                this.showProgress(false)
            }, 3000)
        }
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
}

exports.ready = function () {
    // Initialize UI state
    this.resetStats()
    this.showProgress(false)
    
    // Initialize folder settings and auto-load configurations
    this.initFolderSettings()
    
    // Auto-load saved API key on startup (without showing messages)
    this.loadApiKey(false)

    // Attach event listeners
    this.$.btnRun.addEventListener('click', () => this.runTiny())
    this.$.btnClearLog.addEventListener('click', () => this.clearLog())
    this.$.btnCheckUsage.addEventListener('click', () => this.checkApiUsage())
    this.$.btnSaveKey.addEventListener('click', () => this.saveApiKey())
    this.$.btnLoadKey.addEventListener('click', () => this.loadApiKey(true))
    this.$.apiLink.addEventListener('click', (e) => {
        e.preventDefault()
        this.openApiWebsite()
    })
    
    // Folder settings panel toggle
    this.$.btnFolderSettings.addEventListener('click', () => {
        const panel = this.$.folderSettingsPanel;
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
    })

    // Settings checkboxes
    this.$.rememberFolders.addEventListener('change', (e) => {
        const config = this.getFolderConfig();
        config.rememberFolders = e.target.checked;
        this.saveFolderConfig(config);
    })

    this.$.skipEmptyCheck.addEventListener('change', (e) => {
        const config = this.getFolderConfig();
        config.skipEmptyCheck = e.target.checked;
        this.saveFolderConfig(config);
        
        // Re-validate folders when this setting changes
        this.smartValidateOutput();
        this.smartValidateSource();
    })

    this.$.autoCreateOutput.addEventListener('change', (e) => {
        const config = this.getFolderConfig();
        config.autoCreateOutput = e.target.checked;
        this.saveFolderConfig(config);
    })

    this.$.btnResetFolderSettings.addEventListener('click', () => {
        if (confirm('Reset all folder settings to default?')) {
            localStorage.removeItem(this.FOLDER_CONFIG_KEY);
            this.initFolderSettings();
            this.logMessage('✅ Folder settings reset to default', 'success');
        }
    })


    
    // Output folder selection
    this.$.btnSelectOutput.addEventListener('click', () => this.selectOutputFolder())
    this.$.outputFolderInput.addEventListener('change', (e) => this.handleOutputFolderSelect(e))
    this.$.btnOpenOutput.addEventListener('click', () => this.openOutputFolder())
    
    // Source folder change detection - analyze images when folder is selected
    this.$.folderAsset.addEventListener('change', () => {
        // Small delay to ensure the value is set
        setTimeout(() => {
            this.smartValidateSource()
            // Show analysis panel when asset is selected
            if (this.$.folderAsset.value) {
                this.showAnalysisPanel()
            }
        }, 100)
    })

    // Analysis panel close button
    this.$.btnCloseAnalysis.addEventListener('click', () => {
        this.hideAnalysisPanel()
    })

    // Image type checkbox changes
    this.$.chkPng.addEventListener('change', () => this.updateSelectedTypesInfo())
    this.$.chkJpg.addEventListener('change', () => this.updateSelectedTypesInfo())
    this.$.chkWebp.addEventListener('change', () => this.updateSelectedTypesInfo())
    
    // Enter key to save API key
    this.$.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            this.saveApiKey()
        }
    })

    // Initialize output folder display
    this.updateOutputPathDisplay('❌ Please select a folder', 'error')
    
    // Test log message to ensure log area is working
    this.logMessage('🚀 TinyPNG Optimizer ready! Select source folder to begin.', 'info');
    
    // Auto-restore last output folder if remember setting is enabled
    setTimeout(() => {
        this.restoreLastOutputFolder();
    }, 500);
    
    console.log('TinyPNG Optimizer panel ready with smart OUTPUT folder management!')
}
