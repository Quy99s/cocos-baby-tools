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
    outputFolderPath: '#outputFolderPath',
    btnOpenOutput: '#btnOpenOutput',
    progressContainer: '#progressContainer',
    progressFill: '#progressFill',
    progressText: '#progressText',
    statsSection: '#statsSection',
    statTotalAssets: '#statTotalAssets',
    statOptimized: '#statOptimized',
    statErrors: '#statErrors',
    statSavedSize: '#statSavedSize',
    // Image info section
    imageInfoSection: '#imageInfoSection',
    statTotalImages: '#statTotalImages',
    statPngImages: '#statPngImages',
    statJpgImages: '#statJpgImages',
    statWebpImages: '#statWebpImages',
    // Image type checkboxes
    chkPng: '#chkPng',
    chkJpg: '#chkJpg',
    chkWebp: '#chkWebp'
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

    // Đường dẫn file cấu hình API key
    getConfigPath() {
        return path.join(Editor.Project.path, 'temp', 'tinypng-config.json');
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
        this.$.statsSection.classList.remove('show')
        // Reset image info as well
        this.$.imageInfoSection.classList.remove('show')
    },

    updateStatsDisplay() {
        this.$.statTotalAssets.innerText = this.stats.totalAssets
        this.$.statOptimized.innerText = this.stats.optimized
        this.$.statErrors.innerText = this.stats.errors
        
        const savedMB = (this.stats.totalSavedBytes / 1024 / 1024).toFixed(2)
        this.$.statSavedSize.innerText = `${savedMB} MB`
        
        if (this.stats.totalAssets > 0) {
            this.$.statsSection.classList.add('show')
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
                
                // Validate that the selected output folder is empty
                if (this.validateOutputFolder(folderPath)) {
                    this.customOutputPath = folderPath
                    this.logMessage(`✅ Empty output folder selected: ${this.customOutputPath}`, 'success')
                } else {
                    // Reset selection if validation fails
                    this.customOutputPath = null
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
                
                // Validate that the selected output folder is empty
                if (this.validateOutputFolder(folderPath)) {
                    this.customOutputPath = folderPath
                    this.logMessage(`✅ Empty output folder selected: ${path.basename(this.customOutputPath)}`, 'success')
                } else {
                    // Reset selection if validation fails
                    this.customOutputPath = null
                    this.$.outputFolderInput.value = ''
                }
            } else {
                this.logMessage(`❌ Folder does not exist: ${folderPath}`, 'error')
                this.$.outputFolderInput.value = ''
            }
        }
    },



    // Validate output folder (must be empty) - with visual feedback only
    validateOutputFolder(folderPath) {
        try {
            // Check if folder exists
            if (!fs.existsSync(folderPath)) {
                this.updateOutputPathDisplay('❌ Folder not found', 'error')
                this.logMessage(`❌ Output folder does not exist: ${folderPath}`, 'error')
                return false
            }

            // Check if it's actually a directory
            const stat = fs.statSync(folderPath)
            if (!stat.isDirectory()) {
                this.updateOutputPathDisplay('❌ Not a directory', 'error')
                this.logMessage(`❌ Selected path is not a directory: ${folderPath}`, 'error')
                return false
            }

            // Check if folder is empty
            const allFiles = this.getAllFilesInDirectory(folderPath)
            
            if (allFiles.length > 0) {
                this.updateOutputPathDisplay(`❌ Folder not empty (${allFiles.length} files)`, 'error')
                this.logMessage(`❌ Output folder "${path.basename(folderPath)}" is not empty (contains ${allFiles.length} file(s)). Please select an empty folder.`, 'warning')
                return false
            }

            // Folder is valid
            this.updateOutputPathDisplay(folderPath, 'success')
            return true

        } catch (error) {
            this.updateOutputPathDisplay('❌ Validation error', 'error')
            this.logMessage(`Error validating output folder: ${error.message}`, 'error')
            return false
        }
    },

    // Update output path display with visual feedback
    updateOutputPathDisplay(text, status = 'normal') {
        const pathElement = this.$.outputFolderPath
        
        // Reset classes
        pathElement.classList.remove('error', 'success', 'normal')
        
        // Add appropriate class and text
        if (status === 'error') {
            pathElement.classList.add('error')
            pathElement.innerText = text
            pathElement.title = text
        } else if (status === 'success') {
            pathElement.classList.add('success')
            pathElement.innerText = path.basename(text)
            pathElement.title = text
        } else {
            pathElement.classList.add('normal')
            pathElement.innerText = text
            pathElement.title = text
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
            // Hide image info section when no folder selected
            this.$.imageInfoSection.classList.remove('show')
            return false; // Source folder is required
        }

        const folderUuid = folderAssetValue.uuid || folderAssetValue._uuid || folderAssetValue;
        const folderInfo = await this.getAssetInfo(folderUuid);
        
        if (!folderInfo?.file) {
            this.logMessage('Unable to get source folder information.', 'error')
            this.$.imageInfoSection.classList.remove('show')
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
            this.$.imageInfoSection.classList.remove('show')
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
            this.$.imageInfoSection.classList.add('show')
            
            // Log detailed information
            const totalSizeMB = (stats.details.reduce((sum, img) => sum + img.size, 0) / 1024 / 1024).toFixed(2)
            this.logMessage(`📊 Found ${stats.total} images (${totalSizeMB}MB total):`, 'info')
            this.logMessage(`   🖼️ PNG: ${stats.png} files`, 'info')
            this.logMessage(`   📷 JPG/JPEG: ${stats.jpg} files`, 'info')
            this.logMessage(`   🌐 WebP: ${stats.webp} files`, 'info')
        } else {
            this.$.imageInfoSection.classList.remove('show')
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

        // Validate that output folder is selected and valid
        if (!this.customOutputPath) {
            this.updateOutputPathDisplay('❌ Please select a folder', 'error')
            this.logMessage('❌ Please select an output folder to save optimized images.', 'warning')
            return;
        }

        if (!this.validateOutputFolder(this.customOutputPath)) {
            return; // Validation failed, error already shown in display
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
            // Output folder is the user-selected empty folder (required)
            const outFolder = this.customOutputPath

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
    
    // Output folder selection
    this.$.btnSelectOutput.addEventListener('click', () => this.selectOutputFolder())
    this.$.outputFolderInput.addEventListener('change', (e) => this.handleOutputFolderSelect(e))
    this.$.btnOpenOutput.addEventListener('click', () => this.openOutputFolder())
    
    // Source folder change detection - analyze images when folder is selected
    this.$.folderAsset.addEventListener('change', () => {
        // Small delay to ensure the value is set
        setTimeout(() => {
            this.validateSourceFolder()
        }, 100)
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
    
    console.log('TinyPNG Optimizer panel ready!')
}
