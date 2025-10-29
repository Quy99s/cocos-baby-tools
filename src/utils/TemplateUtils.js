'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Template utilities for loading and composing HTML/CSS templates
 */
class TemplateUtils {
  /**
   * Load CSS file content
   * @param {string} cssPath - Path to CSS file
   * @returns {string} CSS content
   */
  static loadCSS(cssPath) {
    try {
      return fs.readFileSync(cssPath, 'utf8');
    } catch (error) {
      return '';
    }
  }

  /**
   * Load HTML file content
   * @param {string} htmlPath - Path to HTML file
   * @returns {string} HTML content
   */
  static loadHTML(htmlPath) {
    try {
      return fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
      return '';
    }
  }

  /**
   * Compose template with CSS and HTML
   * @param {string} cssContent - CSS content
   * @param {string} htmlContent - HTML content
   * @returns {string} Complete template
   */
  static composeTemplate(cssContent, htmlContent) {
    return `
<style>
${cssContent}
</style>
${htmlContent}
`;
  }

  /**
   * Load template from directory (expects panel.css and panel.html)
   * @param {string} dirPath - Directory path
   * @returns {string} Complete template
   */
  static loadFromDirectory(dirPath) {
    const cssPath = path.join(dirPath, 'panel.css');
    const htmlPath = path.join(dirPath, 'panel.html');
    
    const cssContent = this.loadCSS(cssPath);
    const htmlContent = this.loadHTML(htmlPath);
    
    return this.composeTemplate(cssContent, htmlContent);
  }

  /**
   * Load multiple CSS files and combine them
   * @param {string[]} cssPaths - Array of CSS file paths
   * @returns {string} Combined CSS content
   */
  static loadMultipleCSS(cssPaths) {
    return cssPaths.map(cssPath => {
      const content = this.loadCSS(cssPath);
      return `/* ${path.basename(cssPath)} */\n${content}`;
    }).join('\n\n');
  }

  /**
   * Load template with common CSS
   * @param {string} dirPath - Panel directory path
   * @param {string} commonCSSPath - Path to common CSS file
   * @returns {string} Complete template with common styles
   */
  static loadWithCommonCSS(dirPath, commonCSSPath) {
    const panelCSS = this.loadCSS(path.join(dirPath, 'panel.css'));
    const commonCSS = this.loadCSS(commonCSSPath);
    const htmlContent = this.loadHTML(path.join(dirPath, 'panel.html'));
    
    const combinedCSS = `/* Common Styles */\n${commonCSS}\n\n/* Panel Specific Styles */\n${panelCSS}`;
    
    return this.composeTemplate(combinedCSS, htmlContent);
  }

  /**
   * Replace placeholders in template
   * @param {string} template - Template content
   * @param {object} data - Data object with key-value pairs
   * @returns {string} Template with replaced placeholders
   */
  static replacePlaceholders(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  /**
   * Create element selector object from HTML
   * @param {string[]} selectors - Array of selector strings (e.g., ['#btnRun', '#log'])
   * @returns {object} Object mapping to selector IDs
   */
  static createSelectorMap(selectors) {
    const map = {};
    selectors.forEach(selector => {
      // Extract ID from selector (e.g., '#btnRun' -> 'btnRun')
      const key = selector.replace(/^#/, '');
      map[key] = selector;
    });
    return map;
  }
}

module.exports = TemplateUtils;

