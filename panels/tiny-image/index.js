'use strict';
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const tinify = require('tinify');

// 🔑 TinyPNG API key — bạn thay bằng key thật
tinify.key = 'X049ZfNfqgxfWgG4CtHB8wkx5z2Ssssx';

exports.template = fs.readFileSync(path.join(__dirname, './index.html'), 'utf8')

exports.$ = {
    folderInput: '#folderInput',
    btnRun: '#btnRun',
    log: '#log'
}

exports.methods = {
    logMessage(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString()
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️'
        this.$.log.innerText += `[${timestamp}] ${prefix} ${message}\n`

        // Auto scroll to bottom
        this.$.log.scrollTop = this.$.log.scrollHeight
    },

    clearLog() {
        this.$.log.innerText = ''
    },

    async runTiny() {
        const folderFile = this.$.folderInput.files[0]
        if (!folderFile) {
            this.clearLog()
            this.logMessage('Please select a folder to optimize.', 'warning')
            return
        }

        try {
            // Disable button and update text
            this.$.btnRun.disabled = true
            this.$.btnRun.innerHTML = '<span>⏳</span><span>Processing...</span>'

            this.clearLog()
            this.logMessage('Starting TinyPNG optimization process...')

            const srcFolder = path.dirname(folderFile.path)
            const outFolder = path.join(Editor.Project.path, 'temp', 'optimized')

            this.logMessage(`Source folder: ${srcFolder}`)
            this.logMessage(`Output folder: ${outFolder}`)

            // Create output directory
            fs.mkdirSync(outFolder, { recursive: true })
            this.logMessage('Created output directory.')

            // Find all images
            const files = this.getAllImages(srcFolder)
            if (files.length === 0) {
                this.logMessage('No PNG or JPG files found in the selected folder.', 'warning')
                return
            }

            this.logMessage(`Found ${files.length} image(s) to optimize.`)
            this.logMessage('─────────────────────────────────────')

            let successCount = 0
            let errorCount = 0
            let totalSaved = 0

            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const relPath = path.relative(srcFolder, file)
                const outPath = path.join(outFolder, relPath)

                this.logMessage(`[${i + 1}/${files.length}] Processing: ${relPath}`)

                // Create output subdirectory if needed
                fs.mkdirSync(path.dirname(outPath), { recursive: true })

                try {
                    const source = tinify.fromFile(file)
                    await source.toFile(outPath)

                    const beforeSize = fs.statSync(file).size
                    const afterSize = fs.statSync(outPath).size
                    const beforeKB = beforeSize / 1024
                    const afterKB = afterSize / 1024
                    const savedKB = beforeKB - afterKB
                    const savedPercent = (100 * (1 - afterSize / beforeSize)).toFixed(1)

                    totalSaved += savedKB

                    this.logMessage(`  ✅ ${beforeKB.toFixed(1)}KB → ${afterKB.toFixed(1)}KB (saved ${savedKB.toFixed(1)}KB, -${savedPercent}%)`, 'success')
                    successCount++
                } catch (e) {
                    this.logMessage(`  ❌ Failed: ${e.message}`, 'error')
                    errorCount++
                }
            }

            this.logMessage('─────────────────────────────────────')
            this.logMessage('✨ Optimization completed!', 'success')
            this.logMessage(`📊 Results: ${successCount} successful, ${errorCount} failed`)
            this.logMessage(`💾 Total space saved: ${totalSaved.toFixed(1)}KB`)
            this.logMessage('📁 Opening output folder...')

            // Open output folder
            this.openFolder(outFolder)
        } catch (error) {
            this.logMessage(`Critical error: ${error.message}`, 'error')
        } finally {
            // Re-enable button
            this.$.btnRun.disabled = false
            this.$.btnRun.innerHTML = '<span>🚀</span><span>Run TinyPNG Optimization</span>'
        }
    },

    getAllImages(dir) {
        let results = []
        const list = fs.readdirSync(dir)
        for (const file of list) {
            const f = path.join(dir, file)
            const stat = fs.statSync(f)
            if (stat.isDirectory()) {
                results = results.concat(this.getAllImages(f))
            } else if (/\.(png|jpg)$/i.test(file)) {
                results.push(f)
            }
        }
        return results
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
    console.log('Panel ready - checking methods:', typeof this.runTiny, typeof this.methods)
    console.log('Available methods:', Object.keys(this))

    if (this.runTiny) {
        this.$.btnRun.addEventListener('click', () => this.runTiny())
        console.log('TinyPNG panel ready - event listener attached via this.runTiny')
    } else if (this.methods && this.methods.runTiny) {
        this.$.btnRun.addEventListener('click', () => this.methods.runTiny.call(this))
        console.log('TinyPNG panel ready - event listener attached via this.methods.runTiny')
    } else {
        console.error('runTiny method not found')
    }
}
