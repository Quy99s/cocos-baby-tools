'use strict';

/**
 * Reusable UI components for panels
 */
class UIComponents {
  /**
   * Create a progress bar HTML
   * @param {string} id - Progress bar container ID
   * @returns {string} Progress bar HTML
   */
  static createProgressBar(id = 'progressContainer') {
    return `
<div id="${id}" class="progress-container" style="display: none;">
  <div class="progress-bar">
    <div id="progressFill" class="progress-fill"></div>
  </div>
  <div id="progressText" class="progress-text">0%</div>
</div>
`;
  }

  /**
   * Create stats panel HTML
   * @param {object} stats - Stats configuration {id, label, value}[]
   * @returns {string} Stats panel HTML
   */
  static createStatsPanel(stats) {
    const statsItems = stats.map(stat => `
<div class="stat-item">
  <span class="stat-label">${stat.label}:</span>
  <span id="${stat.id}" class="stat-value">${stat.value || '0'}</span>
</div>
`).join('');

    return `
<div class="stats-panel">
  ${statsItems}
</div>
`;
  }

  /**
   * Create button with icon
   * @param {object} config - {id, icon, label, className}
   * @returns {string} Button HTML
   */
  static createButton(config) {
    const { id, icon, label, className = 'btn' } = config;
    return `
<button id="${id}" class="${className}">
  <span>${icon}</span>
  <span>${label}</span>
</button>
`;
  }

  /**
   * Create button group
   * @param {array} buttons - Array of button configs
   * @returns {string} Button group HTML
   */
  static createButtonGroup(buttons) {
    const buttonsHTML = buttons.map(btn => this.createButton(btn)).join('\n');
    return `
<div class="button-group">
  ${buttonsHTML}
</div>
`;
  }

  /**
   * Create log/console area
   * @param {string} id - Log container ID
   * @returns {string} Log area HTML
   */
  static createLogArea(id = 'log') {
    return `
<div class="log-container">
  <pre id="${id}" class="log-area"></pre>
</div>
`;
  }

  /**
   * Create checkbox with label
   * @param {object} config - {id, label, checked}
   * @returns {string} Checkbox HTML
   */
  static createCheckbox(config) {
    const { id, label, checked = false } = config;
    const checkedAttr = checked ? 'checked' : '';
    return `
<label class="checkbox-label">
  <input type="checkbox" id="${id}" ${checkedAttr}>
  <span>${label}</span>
</label>
`;
  }

  /**
   * Create checkbox group
   * @param {array} checkboxes - Array of checkbox configs
   * @returns {string} Checkbox group HTML
   */
  static createCheckboxGroup(checkboxes) {
    const checkboxesHTML = checkboxes.map(cb => this.createCheckbox(cb)).join('\n');
    return `
<div class="checkbox-group">
  ${checkboxesHTML}
</div>
`;
  }

  /**
   * Create input field with label
   * @param {object} config - {id, label, type, placeholder}
   * @returns {string} Input field HTML
   */
  static createInput(config) {
    const { id, label, type = 'text', placeholder = '' } = config;
    return `
<div class="input-group">
  <label for="${id}">${label}</label>
  <input type="${type}" id="${id}" placeholder="${placeholder}">
</div>
`;
  }

  /**
   * Create section with title
   * @param {string} title - Section title
   * @param {string} content - Section content HTML
   * @param {string} className - Additional CSS class
   * @returns {string} Section HTML
   */
  static createSection(title, content, className = '') {
    return `
<section class="panel-section ${className}">
  <h3 class="section-title">${title}</h3>
  <div class="section-content">
    ${content}
  </div>
</section>
`;
  }

  /**
   * Create collapsible section
   * @param {string} title - Section title
   * @param {string} content - Section content HTML
   * @param {boolean} open - Initial open state
   * @returns {string} Collapsible section HTML
   */
  static createCollapsible(title, content, open = false) {
    const openAttr = open ? 'open' : '';
    return `
<details class="collapsible" ${openAttr}>
  <summary class="collapsible-title">${title}</summary>
  <div class="collapsible-content">
    ${content}
  </div>
</details>
`;
  }

  /**
   * Create folder selector
   * @param {object} config - {id, label, buttonText}
   * @returns {string} Folder selector HTML
   */
  static createFolderSelector(config) {
    const { id, label, buttonText = 'Select Folder' } = config;
    return `
<div class="folder-selector">
  <label>${label}</label>
  <div class="folder-selector-controls">
    <button id="btn${id}" class="btn-select-folder">${buttonText}</button>
    <div id="${id}Path" class="folder-path">No folder selected</div>
  </div>
</div>
`;
  }

  /**
   * Create status badge
   * @param {string} text - Badge text
   * @param {string} type - Badge type (info, success, warning, error)
   * @returns {string} Badge HTML
   */
  static createBadge(text, type = 'info') {
    return `<span class="badge badge-${type}">${text}</span>`;
  }

  /**
   * Create alert/notification
   * @param {object} config - {message, type, dismissible}
   * @returns {string} Alert HTML
   */
  static createAlert(config) {
    const { message, type = 'info', dismissible = false } = config;
    const dismissBtn = dismissible ? '<button class="alert-close">×</button>' : '';
    return `
<div class="alert alert-${type}">
  <span class="alert-message">${message}</span>
  ${dismissBtn}
</div>
`;
  }

  /**
   * Create tabs container
   * @param {array} tabs - Array of {id, label, content}
   * @returns {string} Tabs HTML
   */
  static createTabs(tabs) {
    const tabHeaders = tabs.map((tab, index) => `
<button class="tab-button ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">
  ${tab.label}
</button>
`).join('');

    const tabContents = tabs.map((tab, index) => `
<div id="${tab.id}" class="tab-content ${index === 0 ? 'active' : ''}">
  ${tab.content}
</div>
`).join('');

    return `
<div class="tabs-container">
  <div class="tabs-header">
    ${tabHeaders}
  </div>
  <div class="tabs-body">
    ${tabContents}
  </div>
</div>
`;
  }

  /**
   * Create loading spinner
   * @param {string} text - Loading text
   * @returns {string} Spinner HTML
   */
  static createSpinner(text = 'Loading...') {
    return `
<div class="spinner-container">
  <div class="spinner"></div>
  <span class="spinner-text">${text}</span>
</div>
`;
  }
}

module.exports = UIComponents;

