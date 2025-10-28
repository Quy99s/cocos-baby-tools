'use strict'

const fs = require('fs')
const path = require('path')

// Cache to avoid reading files multiple times
const cache = {
  assetInfo: new Map(),
  fileContent: new Map(),
  scanResults: null,
  clearCache () {
    this.assetInfo.clear()
    this.fileContent.clear()
    this.scanResults = null
  }
}

// Supported file extensions
const SUPPORTED_ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.prefab', '.scene', '.json', '.mp3', '.wav', '.ogg', '.fnt', '.atlas']
const SEARCHABLE_EXTENSIONS = ['.prefab', '.scene', '.fire', '.json']

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
}

exports.methods = {
  // Add debounce to prevent spam clicks
  debounce (func, wait) {
    let timeout
    return function executedFunction (...args) {
      const later = () => {
        clearTimeout(timeout)
        func.apply(this, args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  },

  // Use Cocos Creator console instead of custom log
  logLine (msg, type = 'info', parent) {
    // Log to Cocos Creator console
    switch (type) {
    case 'error':
      console.error(`[Asset Analyzer] ${msg}`)
      break
    case 'warning':
      console.warn(`[Asset Analyzer] ${msg}`)
      break
    case 'success':
      console.log(`[Asset Analyzer] ✅ ${msg}`)
      break
    default:
      console.log(`[Asset Analyzer] ${msg}`)
      break
    }
  },

  // Replace autoScrollToBottom with autoScrollToTop
  autoScrollToTop () {
    const resultsBody = this.$.resultsBody
    const scrollIndicator = this.$.scrollIndicator

    // Check if user has scrolled down from top
    const isNearTop = resultsBody.scrollTop < 100

    if (isNearTop) {
      // Show scroll indicator
      scrollIndicator.classList.add('show')
      scrollIndicator.textContent = 'New log...'

      // Smooth scroll to top
      resultsBody.scrollTo({
        top: 0,
        behavior: 'smooth'
      })

      // Hide indicator after animation
      setTimeout(() => {
        scrollIndicator.classList.remove('show')
      }, 1500)
    }
  },

  clearAll () {
    // Clear everything for new scan
    this.$.resultsBody.innerHTML = ''

    this.$.progressFill.style.width = '0%'
    this.$.progressText.textContent = 'Initializing...'
    this.$.progressContainer.style.display = 'none'
    this.$.summaryInfo.classList.remove('show')
    this.$.actionsSection.style.display = 'none'

    cache.clearCache()
  },

  toggleTreeView () {
    const treeContainer = this.$.treeContainer
    const separator = this.$.resultsSeparator
    const showTreeBtn = this.$.btnShowTree

    if (treeContainer.classList.contains('show')) {
      // Hide tree
      treeContainer.classList.remove('show')
      separator.classList.remove('show')
      showTreeBtn.innerHTML = '🌳 Tree'
    } else {
      // Show tree
      if (cache.scanResults) {
        treeContainer.classList.add('show')
        separator.classList.add('show')
        showTreeBtn.innerHTML = '📋 Hide'
        // Scroll to show tree view
        this.$.resultsBody.scrollTop = 0
      } else {
        this.logLine('⚠️ No tree data available. Please run analysis first!', 'warning')
      }
    }
  },

  // Re-render results from cache when checkbox changes
  reRenderResults () {
    if (!cache.scanResults) {
      this.logLine('⚠️ No data to display. Please run analysis first!', 'warning')
      return
    }

    // Clear existing display
    this.$.resultsBody.innerHTML = ''

    // Re-render with current settings
    this.displayResults(cache.scanResults, cache.scanResults.rootPath)
  },

  updateProgress (current, total, currentFile = '') {
    const percent = total > 0 ? Math.floor((current / total) * 100) : 0
    this.$.progressFill.style.width = percent + '%'

    let progressText = `${percent}%`

    if (total <= 10) {
      // For small totals (like steps), show step info
      progressText += ` (Step ${Math.ceil(current)}/${total})`
    } else {
      // For large totals (like files), show count
      progressText += ` (${Math.floor(current)}/${total})`
    }

    if (currentFile) {
      progressText += ` - ${currentFile}`
    }

    this.$.progressText.textContent = progressText
  },

  updateStats (stats) {
    this.$.statTotal.textContent = stats.total
    this.$.statUsed.textContent = stats.used
    this.$.statTime.textContent = stats.time + 's'
    this.$.summaryInfo.classList.add('show')

    // Update unused count from cached results
    if (cache.scanResults) {
      const unusedCount = cache.scanResults.filter(r => !r.isUsed).length
      this.$.statUnused.textContent = unusedCount

      // Show actions section if there are unused assets
      if (unusedCount > 0 && cache.scanResults.rootPath) {
        this.$.actionsSection.style.display = 'block'
        const tempPath = this.getTempFolderPath(cache.scanResults.rootPath)
        this.$.tempFolderPath.textContent = path.relative(Editor.Project.path, tempPath)
      }
    }
  },

  setButtonsEnabled (enabled) {
    this.$.btnScan.disabled = !enabled
    this.$.btnScan.innerHTML = enabled ? '🔍 Analyze' : '⏳ Analyzing...'
    this.$.btnMoveUnused.disabled = !enabled
    this.$.btnRestoreTemp.disabled = !enabled
    this.$.btnDeleteTemp.disabled = !enabled
  },

  // Get temp folder path
  getTempFolderPath (scanPath) {
    const parentDir = path.dirname(scanPath)
    const scanFolderName = path.basename(scanPath)
    return path.join(parentDir, `${scanFolderName}_temp_unused`)
  },

  // Re-render results from cache when checkbox changes
  reRenderResults () {
    if (!cache.scanResults) {
      this.logLine('⚠️ No data to display. Please run analysis first!', 'warning')
      return
    }

    // Clear display area (only results, keep log messages)
    const existingDetails = this.$.resultsBody.querySelectorAll('.tree-folder')
    existingDetails.forEach(detail => detail.remove())
    const existingAssets = this.$.resultsBody.querySelectorAll('.asset-item')
    existingAssets.forEach(asset => asset.remove())

    // Re-render with current settings
    this.displayResults(cache.scanResults, cache.scanResults.rootPath)
  },

  async moveUnusedToTemp () {
    if (!cache.scanResults) {
      this.logLine('⚠️ No scan data available. Please run analysis first!', 'warning')
      return
    }

    const scanPath = cache.scanResults.rootPath
    const tempPath = this.getTempFolderPath(scanPath)
    const unusedAssets = cache.scanResults.filter(asset => !asset.isUsed)

    if (unusedAssets.length === 0) {
      this.logLine('ℹ️ No unused assets to move.', 'info')
      return
    }

    try {
      this.setButtonsEnabled(false)
      this.$.progressContainer.style.display = 'block'

      this.logLine(`📦 Starting move operation for ${unusedAssets.length} unused assets...`, 'info')

      // Step 1: Create temp directory structure
      this.logLine('🏗️ Step 1: Creating temp directory structure...', 'info')
      this.updateProgress(0, 4, 'Creating directories')

      if (fs.existsSync(tempPath)) {
        // Remove existing temp folder to ensure clean state
        fs.rmSync(tempPath, { recursive: true, force: true })
      }
      fs.mkdirSync(tempPath, { recursive: true })

      // Create all necessary subdirectories
      const uniqueDirs = new Set()
      unusedAssets.forEach(asset => {
        const assetDir = path.dirname(asset.relativePath)
        if (assetDir && assetDir !== '.') {
          uniqueDirs.add(assetDir)
        }
      })

      for (const dir of uniqueDirs) {
        const targetDir = path.join(tempPath, dir)
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true })
          this.logLine(`📁 Created directory: ${dir}`, 'info')
        }
      }

      // Step 2: Copy assets to temp folder
      this.logLine('📋 Step 2: Copying assets to temp folder...', 'info')
      this.updateProgress(1, 3, 'Copying assets')

      let copiedCount = 0
      let copyErrors = 0

      for (let i = 0; i < unusedAssets.length; i++) {
        const asset = unusedAssets[i]
        const subProgress = (i / unusedAssets.length) * 0.5 // 50% of step 2
        this.updateProgress(1 + subProgress, 3, `Copying ${asset.name}`)

        try {
          const sourceFile = asset.path
          const targetDir = path.join(tempPath, path.dirname(asset.relativePath))
          const targetFile = path.join(targetDir, asset.name)

          // Copy main file and meta file
          if (fs.existsSync(sourceFile)) {
            fs.copyFileSync(sourceFile, targetFile)

            // Copy .meta file
            const sourceMetaFile = sourceFile + '.meta'
            const targetMetaFile = targetFile + '.meta'
            if (fs.existsSync(sourceMetaFile)) {
              fs.copyFileSync(sourceMetaFile, targetMetaFile)
            }

            this.logLine(`📄 Copied: ${asset.name} (+ .meta)`, 'info')
            copiedCount++
          }
        } catch (error) {
          this.logLine(`❌ Error copying ${asset.name}: ${error.message}`, 'error')
          copyErrors++
        }
      }

      // Step 3: Remove original assets and clean up
      this.logLine('🗑️ Step 3: Removing original assets...', 'info')
      this.updateProgress(2, 3, 'Removing originals')

      let removedCount = 0
      let removeErrors = 0

      for (let i = 0; i < unusedAssets.length; i++) {
        const asset = unusedAssets[i]
        const subProgress = (i / unusedAssets.length) * 0.5 // 50% of step 5
        this.updateProgress(3.5 + subProgress, 4, `Removing ${asset.name}`)

        try {
          const sourceFile = asset.path
          const sourceMeta = sourceFile + '.meta'

          // Remove original files
          if (fs.existsSync(sourceFile)) {
            fs.unlinkSync(sourceFile)
          }
          if (fs.existsSync(sourceMeta)) {
            fs.unlinkSync(sourceMeta)
          }

          this.logLine(`🗑️ Removed: ${asset.name}`, 'info')
          removedCount++
        } catch (error) {
          this.logLine(`❌ Error removing ${asset.name}: ${error.message}`, 'error')
          removeErrors++
        }
      }

      // Clean up empty directories in source
      this.logLine('🧹 Cleaning up empty directories...', 'info')
      await this.cleanupEmptyDirectories(scanPath)

      // Final refresh
      this.updateProgress(3, 3, 'Final refresh')
      try {
        await Editor.Message.request('asset-db', 'refresh')
      } catch (refreshError) {
        this.logLine(`⚠️ Warning: Final refresh failed: ${refreshError.message}`, 'warning')
      }

      this.logLine('✅ Move operation completed!', 'success')
      this.logLine(`📊 Summary: ${copiedCount} copied, ${removedCount} removed`, 'success')
      if (copyErrors > 0 || removeErrors > 0) {
        this.logLine(`⚠️ Errors: ${copyErrors} copy errors, ${removeErrors} remove errors`, 'warning')
      }
      this.logLine(`📁 Assets moved to: ${path.relative(Editor.Project.path, tempPath)}`, 'info')
    } catch (error) {
      this.logLine(`❌ Critical error during move operation: ${error.message}`, 'error')
    } finally {
      this.setButtonsEnabled(true)
      this.$.progressContainer.style.display = 'none'
    }
  },

  async restoreFromTemp () {
    if (!cache.scanResults) {
      this.logLine('⚠️ No scan data available. Please run analysis first!', 'warning')
      return
    }

    const scanPath = cache.scanResults.rootPath
    const tempPath = this.getTempFolderPath(scanPath)

    if (!fs.existsSync(tempPath)) {
      this.logLine('⚠️ Temp folder not found.', 'warning')
      return
    }

    try {
      this.setButtonsEnabled(false)
      this.$.progressContainer.style.display = 'block'

      this.logLine('↩️ Restoring assets from temp folder...', 'info')

      const tempFiles = await this.getAllFilesInDirectory(tempPath)
      // Filter out .meta files for separate processing
      const mainFiles = tempFiles.filter(file => !file.endsWith('.meta'))
      let restoredCount = 0
      let errorCount = 0

      for (let i = 0; i < mainFiles.length; i++) {
        const tempFile = mainFiles[i]
        this.updateProgress(i, mainFiles.length, path.basename(tempFile))

        try {
          const relativePath = path.relative(tempPath, tempFile)
          const originalPath = path.join(scanPath, relativePath)
          const originalDir = path.dirname(originalPath)

          // Create original directory if doesn't exist
          if (!fs.existsSync(originalDir)) {
            fs.mkdirSync(originalDir, { recursive: true })
          }

          // Move main file
          await this.moveFile(tempFile, originalPath)

          // Move .meta file if exists
          const tempMetaFile = tempFile + '.meta'
          const originalMetaFile = originalPath + '.meta'
          if (fs.existsSync(tempMetaFile)) {
            await this.moveFile(tempMetaFile, originalMetaFile)
          }

          restoredCount++
        } catch (error) {
          this.logLine(`❌ Error restoring ${path.basename(tempFile)}: ${error.message}`, 'error')
          errorCount++
        }
      }

      // Remove temp directory
      try {
        fs.rmSync(tempPath, { recursive: true, force: true })
      } catch (e) {
        // Ignore cleanup errors
      }

      this.logLine(`✅ Completed! Restored ${restoredCount} files, ${errorCount} errors.`, 'success')

      // Refresh asset database
      await Editor.Message.request('asset-db', 'refresh')
    } catch (error) {
      this.logLine(`❌ Error during restore operation: ${error.message}`, 'error')
    } finally {
      this.setButtonsEnabled(true)
      this.$.progressContainer.style.display = 'none'
    }
  },

  async deleteTemp () {
    if (!cache.scanResults) {
      this.logLine('⚠️ No scan data available. Please run analysis first!', 'warning')
      return
    }

    const tempPath = this.getTempFolderPath(cache.scanResults.rootPath)

    if (!fs.existsSync(tempPath)) {
      this.logLine('⚠️ Temp folder not found.', 'warning')
      return
    }

    // Confirmation dialog
    const confirmed = await new Promise((resolve) => {
      const result = confirm(`⚠️ WARNING: Permanently delete temp folder?\n\n${tempPath}\n\nThis action CANNOT be undone!`)
      resolve(result)
    })

    if (!confirmed) {
      this.logLine('ℹ️ Delete operation cancelled.', 'info')
      return
    }

    try {
      this.setButtonsEnabled(false)
      this.logLine('🗑️ Deleting temp folder...', 'warning')

      fs.rmSync(tempPath, { recursive: true, force: true })

      this.logLine(`✅ Temp folder deleted: ${tempPath}`, 'success')

      // Refresh asset database
      await Editor.Message.request('asset-db', 'refresh')
    } catch (error) {
      this.logLine(`❌ Error deleting temp folder: ${error.message}`, 'error')
    } finally {
      this.setButtonsEnabled(true)
    }
  },

  // Helper function to move file
  async moveFile (source, target) {
    return new Promise((resolve, reject) => {
      fs.rename(source, target, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  },

  // Get all files in directory recursively
  async getAllFilesInDirectory (dir) {
    const files = []

    const walkDir = (currentDir) => {
      const items = fs.readdirSync(currentDir)

      for (const item of items) {
        const fullPath = path.join(currentDir, item)
        const stat = fs.statSync(fullPath)

        if (stat.isDirectory()) {
          walkDir(fullPath)
        } else {
          files.push(fullPath)
        }
      }
    }

    walkDir(dir)
    return files
  },

  // Clean up empty directories
  async cleanupEmptyDirectories (rootPath) {
    const cleanupDir = (dir) => {
      if (!fs.existsSync(dir)) return

      try {
        const items = fs.readdirSync(dir)

        // Recursively cleanup subdirectories first
        for (const item of items) {
          const fullPath = path.join(dir, item)
          if (fs.statSync(fullPath).isDirectory()) {
            cleanupDir(fullPath)
          }
        }

        // Check if directory is empty after cleanup
        const remainingItems = fs.readdirSync(dir)
        if (remainingItems.length === 0 && dir !== rootPath) {
          fs.rmdirSync(dir)
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    cleanupDir(rootPath)
  },

  async scanAssets () {
    const startTime = Date.now()
    this.setButtonsEnabled(false)
    this.clearAll() // Clear everything when starting new scan

    try {
      const scanVal = this.$.scanAsset.value
      if (!scanVal) {
        this.logLine('⚠️ Please select a folder to analyze!', 'warning')
        return
      }

      const scanUuid = scanVal.uuid || scanVal._uuid || scanVal
      const scanInfo = await this.getAssetInfo(scanUuid)
      if (!scanInfo?.file) {
        this.logLine('❌ Unable to retrieve asset information!', 'error')
        return
      }

      const scanPath = scanInfo.file

      // Get search path (optional)
      let searchPath = null
      const searchVal = this.$.searchAsset.value
      if (searchVal) {
        const searchUuid = searchVal.uuid || searchVal._uuid || searchVal
        const searchInfo = await this.getAssetInfo(searchUuid)
        if (searchInfo?.file) {
          searchPath = searchInfo.file
        }
      }

      this.logLine(`📂 Scanning folder: ${scanPath}`, 'info')
      if (searchPath) {
        this.logLine(`🔍 Searching only in: ${searchPath}`, 'info')
      } else {
        this.logLine('🔍 Searching in entire project', 'info')
      }

      this.$.progressContainer.style.display = 'block'

      // Pre-scan to count assets and build cache
      this.logLine('📊 Analyzing directory structure...', 'info')
      const assetList = await this.buildAssetList(scanPath)

      if (assetList.length === 0) {
        this.logLine('⚠️ No assets found to analyze!', 'warning')
        return
      }

      this.logLine(`📊 Found ${assetList.length} assets to analyze`, 'info')
      this.logLine('🔍 Checking asset usage...', 'info')

      const results = await this.processAssetsBatch(assetList, searchPath)

      // Cache results
      cache.scanResults = results
      cache.scanResults.rootPath = scanPath

      // Display results
      await this.displayResults(results, scanPath)

      const endTime = Date.now()
      const duration = Math.round((endTime - startTime) / 1000)

      const stats = {
        total: results.length,
        used: results.filter(r => r.isUsed).length,
        unused: results.filter(r => !r.isUsed).length,
        time: duration
      }

      this.updateStats(stats)
      this.logLine(`✅ Analysis complete! Processed ${stats.total} assets in ${duration}s`, 'success')
    } catch (error) {
      this.logLine(`❌ Analysis error: ${error.message}`, 'error')
      console.error('Scan error:', error)
    } finally {
      this.setButtonsEnabled(true)
      this.$.progressContainer.style.display = 'none'
    }
  },

  async displayResults (results, rootPath) {
    this.logLine('🌳 Generating tree view...', 'info')

    // Build tree structure
    const tree = this.buildDirectoryTree(results)

    // Clear results body
    this.$.resultsBody.innerHTML = ''

    // Render tree into results body
    Object.keys(tree)
      .sort()
      .forEach(folderName => {
        if (folderName === '__assets__') {
          // Root level assets
          tree.__assets__.forEach(asset => {
            const showUsed = this.$.chkUsed.checked
            const showUnused = this.$.chkUnused.checked
            const showDetails = this.$.chkDetails.checked

            if ((!asset.isUsed && !showUnused) || (asset.isUsed && !showUsed)) {
              return
            }

            const assetItem = this.createAssetItem(asset, showDetails)
            this.$.resultsBody.appendChild(assetItem)
          })
        } else {
          const folderElement = this.renderTreeFolder(folderName, tree[folderName].children, 0)
          if (folderElement) {
            this.$.resultsBody.appendChild(folderElement)
          }
        }
      })

    this.logLine('✅ Tree view generated', 'success')
  },

  // Build tree structure from flat results
  buildDirectoryTree (results) {
    const tree = {}

    results.forEach(result => {
      const pathParts = result.relativePath.split(path.sep)
      let currentLevel = tree

      // Build nested structure
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i]
        if (!currentLevel[part]) {
          currentLevel[part] = {
            type: 'folder',
            children: {},
            assets: []
          }
        }
        currentLevel = currentLevel[part].children
      }

      // Add asset to final folder
      const fileName = pathParts[pathParts.length - 1]
      const folderPath = pathParts.slice(0, -1).join(path.sep) || '.'

      if (!currentLevel.__assets__) {
        currentLevel.__assets__ = []
      }
      currentLevel.__assets__.push(result)
    })

    return tree
  },

  // Render tree structure
  renderTreeFolder (folderName, folderData, level = 0) {
    const showUsed = this.$.chkUsed.checked
    const showUnused = this.$.chkUnused.checked
    const showDetails = this.$.chkDetails.checked

    const details = document.createElement('details')
    details.className = 'tree-folder'
    details.style.marginLeft = (level * 12) + 'px'
    details.open = level < 2 // Auto open first 2 levels

    const summary = document.createElement('summary')

    // Count assets in this folder and subfolders
    let totalAssets = 0
    let usedAssets = 0
    let unusedAssets = 0

    const countAssetsRecursive = (data) => {
      if (data.__assets__) {
        data.__assets__.forEach(asset => {
          totalAssets++
          if (asset.isUsed) usedAssets++
          else unusedAssets++
        })
      }

      Object.keys(data).forEach(key => {
        if (key !== '__assets__' && data[key].children) {
          countAssetsRecursive(data[key].children)
        }
      })
    }

    countAssetsRecursive(folderData)

    const folderIcon = level === 0 ? '🗂️' : '📁'
    summary.innerHTML = `${folderIcon} ${folderName} <span class="folder-summary">(${totalAssets} files - ✓${usedAssets} ✗${unusedAssets})</span>`
    details.appendChild(summary)

    const content = document.createElement('div')
    content.className = 'folder-content'

    // Render assets in current folder
    if (folderData.__assets__) {
      folderData.__assets__.forEach(asset => {
        if ((!asset.isUsed && !showUnused) || (asset.isUsed && !showUsed)) {
          return
        }

        const assetItem = this.createAssetItem(asset, showDetails)
        content.appendChild(assetItem)
      })
    }

    // Render subfolders
    Object.keys(folderData)
      .filter(key => key !== '__assets__')
      .sort()
      .forEach(subFolderName => {
        const subFolder = this.renderTreeFolder(subFolderName, folderData[subFolderName].children, level + 1)
        if (subFolder) {
          content.appendChild(subFolder)
        }
      })

    if (content.children.length > 0) {
      details.appendChild(content)
      return details
    }

    return null
  },

  createAssetItem (asset, showDetails) {
    const assetItem = document.createElement('div')
    assetItem.className = `asset-item ${asset.isUsed ? 'used' : 'unused'}`

    const icon = document.createElement('span')
    icon.className = 'asset-icon'
    icon.textContent = asset.isUsed ? '✅' : '❌'

    const name = document.createElement('span')
    name.className = 'asset-name'
    name.textContent = asset.name

    const uuid = document.createElement('span')
    uuid.className = 'asset-uuid'
    uuid.textContent = `${asset.uuid}`

    const refs = document.createElement('span')
    refs.className = 'asset-refs'
    let refText = ''
    if (asset.usedAsDependency) {
      refText += '(dep)'
    }
    if (showDetails && asset.references.length > 0) {
      refText += ` (${asset.references.length})`
    }
    refs.textContent = refText

    assetItem.appendChild(icon)
    assetItem.appendChild(name)
    assetItem.appendChild(uuid)
    assetItem.appendChild(refs)

    let tooltip = `Path: ${asset.path}\nUUID: ${asset.uuid}\nClick UUID to select and copy`
    if (asset.usedAsDependency) {
      tooltip += '\nUsed as dependency (skeleton/font)'
    }
    assetItem.title = tooltip

    // Add event to select UUID on click
    uuid.addEventListener('click', (e) => {
      e.stopPropagation()
      this.selectText(uuid)
    })

    // Double click to copy UUID
    uuid.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      this.copyToClipboard(asset.uuid)
      this.showCopyFeedback(uuid)
    })

    // Show references if details enabled
    if (showDetails && asset.references.length > 0) {
      const refList = document.createElement('div')
      refList.className = 'reference-list'

      asset.references.forEach(ref => {
        const refItem = document.createElement('div')
        refItem.className = 'reference-item'
        refItem.textContent = `→ ${path.relative(Editor.Project.path, ref)}`
        refList.appendChild(refItem)
      })

      assetItem.appendChild(refList)
    }

    return assetItem
  },

  // Helper function to select text
  selectText (element) {
    if (window.getSelection) {
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(element)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  },

  // Helper function to copy to clipboard
  async copyToClipboard (text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  },

  // Show copy feedback
  showCopyFeedback (element) {
    const originalText = element.textContent
    element.textContent = 'Copied!'
    element.style.color = '#4CAF50'
    element.style.fontWeight = 'bold'

    setTimeout(() => {
      element.textContent = originalText
      element.style.color = ''
      element.style.fontWeight = ''
    }, 1500)
  },

  async displayResults (results, rootPath) {
    // Build tree structure
    const tree = this.buildDirectoryTree(results)

    // Render tree
    Object.keys(tree)
      .sort()
      .forEach(folderName => {
        if (folderName === '__assets__') {
          // Root level assets
          tree.__assets__.forEach(asset => {
            const showUsed = this.$.chkUsed.checked
            const showUnused = this.$.chkUnused.checked
            const showDetails = this.$.chkDetails.checked

            if ((!asset.isUsed && !showUnused) || (asset.isUsed && !showUsed)) {
              return
            }

            const assetItem = this.createAssetItem(asset, showDetails)
            this.$.resultsBody.appendChild(assetItem)
          })
        } else {
          const folderElement = this.renderTreeFolder(folderName, tree[folderName].children, 0)
          if (folderElement) {
            this.$.resultsBody.appendChild(folderElement)
          }
        }
      })
  },

  async getAssetInfo (uuid) {
    if (cache.assetInfo.has(uuid)) {
      return cache.assetInfo.get(uuid)
    }

    try {
      const info = await Editor.Message.request('asset-db', 'query-asset-info', uuid)
      cache.assetInfo.set(uuid, info)
      return info
    } catch (error) {
      console.error(`Failed to get asset info for ${uuid}:`, error)
      return null
    }
  },

  async buildAssetList (rootPath) {
    const assets = []

    const walkDir = (dir) => {
      if (!fs.existsSync(dir)) return

      const files = fs.readdirSync(dir)
      for (const file of files) {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)

        if (stat.isDirectory()) {
          walkDir(fullPath)
        } else {
          const ext = path.extname(file).toLowerCase()
          if (SUPPORTED_ASSET_EXTENSIONS.includes(ext)) {
            const metaPath = fullPath + '.meta'
            if (fs.existsSync(metaPath)) {
              try {
                const metaContent = fs.readFileSync(metaPath, 'utf8')
                const meta = JSON.parse(metaContent)
                if (meta.uuid) {
                  assets.push({
                    path: fullPath,
                    uuid: meta.uuid,
                    name: file,
                    relativePath: path.relative(rootPath, fullPath)
                  })
                }
              } catch (e) {
                // Skip invalid meta files
              }
            }
          }
        }
      }
    }

    walkDir(rootPath)
    return assets
  },

  // Check skeleton animation and font dependencies
  async checkSkeletonDependencies (assetList, usedAssets = new Set()) {
    const skeletonGroups = new Map() // Map from skeleton name → {json, atlas, textures}

    // Group skeleton files by base name
    assetList.forEach(asset => {
      const ext = path.extname(asset.path).toLowerCase()
      const baseName = path.basename(asset.path, ext)
      const dir = path.dirname(asset.path)

      if (ext === '.json' || ext === '.atlas') {
        if (!skeletonGroups.has(baseName)) {
          skeletonGroups.set(baseName, { json: null, atlas: null, textures: [] })
        }

        const group = skeletonGroups.get(baseName)
        if (ext === '.json') {
          group.json = asset
        } else if (ext === '.atlas') {
          group.atlas = asset
        }
      }
    })

    // Find textures for each atlas
    for (const [baseName, group] of skeletonGroups) {
      if (group.atlas) {
        try {
          const atlasContent = fs.readFileSync(group.atlas.path, 'utf8')
          const lines = atlasContent.split('\n')

          for (const line of lines) {
            const trimmedLine = line.trim()
            // Find texture files in atlas (first line of each page, doesn't contain :)
            if (trimmedLine && !trimmedLine.includes(':') &&
              !trimmedLine.startsWith('size') && !trimmedLine.startsWith('format') &&
              !trimmedLine.startsWith('filter') && !trimmedLine.startsWith('repeat') &&
              !trimmedLine.startsWith('pma') && !trimmedLine.startsWith('rotate')) {
              const texturePath = path.resolve(path.dirname(group.atlas.path), trimmedLine)

              // Find UUID of texture
              const textureUuid = await this.getAssetUuidByPath(texturePath)
              if (textureUuid) {
                group.textures.push(textureUuid)
              }
            }
          }
        } catch (error) {
          console.error(`Error reading atlas ${group.atlas.path}:`, error)
        }
      }
    }

    // Check which skeleton json files are used
    for (const [baseName, group] of skeletonGroups) {
      if (group.json) {
        const jsonRefs = await this.checkUUIDUsage(group.json.uuid)
        if (jsonRefs.length > 0) {
          // JSON is used → mark atlas and textures as used
          if (group.atlas) {
            usedAssets.add(group.atlas.uuid)
          }
          group.textures.forEach(textureUuid => {
            usedAssets.add(textureUuid)
          })
        }
      }
    }

    return usedAssets
  },

  // Check font file dependencies
  async checkFontDependencies (assetList, usedAssets = new Set()) {
    for (const asset of assetList) {
      const ext = path.extname(asset.path).toLowerCase()

      if (ext === '.fnt') {
        try {
          const fntContent = fs.readFileSync(asset.path, 'utf8')
          const lines = fntContent.split('\n')

          for (const line of lines) {
            // Find page line (texture file)
            const pageMatch = line.match(/page\s+id=\d+\s+file="([^"]+)"/)
            if (pageMatch) {
              const textureFile = pageMatch[1]
              const texturePath = path.resolve(path.dirname(asset.path), textureFile)

              // Check if .fnt file is used
              const fntRefs = await this.checkUUIDUsage(asset.uuid)
              if (fntRefs.length > 0) {
                // FNT is used → mark texture as used
                const textureUuid = await this.getAssetUuidByPath(texturePath)
                if (textureUuid) {
                  usedAssets.add(textureUuid)
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error checking font dependencies for ${asset.path}:`, error)
        }
      }
    }

    return usedAssets
  },

  // Helper function to find UUID from file path
  async getAssetUuidByPath (filePath) {
    const metaPath = filePath + '.meta'
    if (fs.existsSync(metaPath)) {
      try {
        const metaContent = fs.readFileSync(metaPath, 'utf8')
        const meta = JSON.parse(metaContent)
        return meta.uuid
      } catch (e) {
        return null
      }
    }
    return null
  },

  async processAssetsBatch (assetList, searchPath = null) {
    const results = []
    const batchSize = 10
    const dependencyUsedAssets = new Set() // Track assets used as dependencies

    // First pass: Find all dependency relationships
    this.logLine('📎 Analyzing skeleton animation dependencies...', 'info')
    await this.checkSkeletonDependencies(assetList, dependencyUsedAssets)

    this.logLine('🔤 Analyzing font file dependencies...', 'info')
    await this.checkFontDependencies(assetList, dependencyUsedAssets)

    // Second pass: Check usage including dependencies
    for (let i = 0; i < assetList.length; i += batchSize) {
      const batch = assetList.slice(i, i + batchSize)
      const batchPromises = batch.map(async (asset) => {
        this.updateProgress(i + batch.indexOf(asset), assetList.length, asset.name)

        // Check if asset is used as dependency
        const isUsedAsDependency = dependencyUsedAssets.has(asset.uuid)

        // Check normal usage with custom search path
        const refs = await this.checkUUIDUsage(asset.uuid, searchPath)
        const isUsedNormally = refs.length > 0

        return {
          ...asset,
          isUsed: isUsedNormally || isUsedAsDependency,
          references: refs,
          usedAsDependency: isUsedAsDependency
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // Yield control so UI doesn't block
      await new Promise(resolve => setTimeout(resolve, 1))
    }

    return results
  },

  async checkUUIDUsage (uuid, searchPath = null) {
    try {
      const refs = await this.searchUUIDInProject(uuid, searchPath)
      return refs
    } catch (err) {
      console.error(`Error checking UUID ${uuid}:`, err)
      return []
    }
  },

  async searchUUIDInProject (uuid, searchPath = null) {
    const refs = []
    const projectPath = Editor.Project.path

    // Use custom search path or default to entire assets folder
    const targetPath = searchPath || path.join(projectPath, 'assets')

    await this.searchUUIDInFolder(targetPath, uuid, refs)
    return refs
  },

  async searchUUIDInFolder (folderPath, uuid, refs) {
    if (!fs.existsSync(folderPath)) return

    const files = fs.readdirSync(folderPath)

    for (const file of files) {
      const fullPath = path.join(folderPath, file)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        await this.searchUUIDInFolder(fullPath, uuid, refs)
      } else {
        const ext = path.extname(file).toLowerCase()
        if (SEARCHABLE_EXTENSIONS.includes(ext)) {
          try {
            let content = cache.fileContent.get(fullPath)
            if (!content) {
              content = fs.readFileSync(fullPath, 'utf8')
              cache.fileContent.set(fullPath, content)
            }

            if (content.includes(uuid)) {
              refs.push(fullPath)
            }
          } catch (e) {
            // Ignore read errors
          }
        }
      }
    }
  },

  openAllCollapsible () {
    const details = this.$.resultsBody.querySelectorAll('details')
    details.forEach(detail => detail.open = true)
  },

  closeAllCollapsible () {
    const details = this.$.resultsBody.querySelectorAll('details')
    details.forEach(detail => detail.open = false)
  }
}

exports.ready = function () {
  const debouncedScan = this.debounce(() => this.scanAssets(), 300)
  const debouncedMove = this.debounce(() => this.moveUnusedToTemp(), 300)
  const debouncedRestore = this.debounce(() => this.restoreFromTemp(), 300)
  const debouncedDelete = this.debounce(() => this.deleteTemp(), 300)

  this.$.btnScan.addEventListener('click', debouncedScan)
  this.$.btnClear.addEventListener('click', () => this.clearAll())
  this.$.btnOpenAll.addEventListener('click', () => this.openAllCollapsible())
  this.$.btnCloseAll.addEventListener('click', () => this.closeAllCollapsible())

  // Move controls
  this.$.btnMoveUnused.addEventListener('click', debouncedMove)
  this.$.btnRestoreTemp.addEventListener('click', debouncedRestore)
  this.$.btnDeleteTemp.addEventListener('click', debouncedDelete)

  // Event listeners for checkbox - re-render results when changed and open all folders
  this.$.chkUsed.addEventListener('change', () => {
    this.reRenderResults()
    setTimeout(() => this.openAllCollapsible(), 100)
  })
  this.$.chkUnused.addEventListener('change', () => {
    this.reRenderResults()
    setTimeout(() => this.openAllCollapsible(), 100)
  })
  this.$.chkDetails.addEventListener('change', () => {
    this.reRenderResults()
    setTimeout(() => this.openAllCollapsible(), 100)
  })

  this.clearAll()
}
