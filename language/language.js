const fs = require('fs');
const path = require('path');

class LanguageManager {
  constructor() {
    this.translations = {};
    this.currentLanguage = 'en'; // Default language
  }

  /**
   * Initialize the language manager with the config settings
   * @param {Object} config - The config object containing language settings
   */
  initialize(config) {
    if (!config || !config.botSettings || !config.botSettings.language) {
      console.warn('No language specified in config, using default: en');
    } else {
      this.currentLanguage = config.botSettings.language;
    }

    this.loadLanguageFile(this.currentLanguage);
    return this;
  }

  /**
   * Load a language file
   * @param {string} langCode - The language code to load (e.g., 'en', 'vi', 'np')
   * @returns {boolean} - Whether the language was successfully loaded
   */
  loadLanguageFile(langCode) {
    try {
      const langFilePath = path.join(__dirname, `${langCode}.lang`);

      if (!fs.existsSync(langFilePath)) {
        console.error(`Language file not found: ${langFilePath}`);
        // If the requested language file doesn't exist, fall back to English
        if (langCode !== 'en') {
          console.warn(`Falling back to default language: en`);
          this.currentLanguage = 'en';
          return this.loadLanguageFile('en');
        }
        return false;
      }

      const content = fs.readFileSync(langFilePath, 'utf8');
      this.translations = this.parseLanguageFile(content);
      
      this.currentLanguage = langCode;
      return true;
    } catch (error) {
      console.error(`Error loading language file ${langCode}.lang:`, error);
      return false;
    }
  }

  /**
   * Parse a language file content into a translations object
   * @param {string} content - The content of the language file
   * @returns {Object} - Object containing key-value pairs of translations
   */
  parseLanguageFile(content) {
    const translations = {};
    const lines = content.split('\n');

    lines.forEach(line => {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) return;

      const equalsPos = line.indexOf('=');
      if (equalsPos !== -1) {
        const key = line.substring(0, equalsPos).trim();
        const value = line.substring(equalsPos + 1).trim();
        translations[key] = value;
      }
    });

    return translations;
  }

  /**
   * Get a translated string by key
   * @param {string} key - The translation key (e.g., 'login.currentlyLogged')
   * @param {...any} params - Optional parameters to replace placeholders in the string
   * @returns {string} - The translated string
   */
  get(key, ...params) {
    if (!this.translations[key]) {
      console.warn(`Translation key not found: ${key}`);
      return key; // Return the key itself as fallback
    }

    let text = this.translations[key];

    // Replace placeholders like {0}, {1}, etc. with the provided parameters
    params.forEach((param, index) => {
      text = text.replace(new RegExp(`\\{${index}\\}`, 'g'), param);
    });

    return text;
  }

  /**
   * Change the current language
   * @param {string} langCode - The language code to switch to
   * @returns {boolean} - Whether the language was successfully changed
   */
  changeLanguage(langCode) {
    return this.loadLanguageFile(langCode);
  }

  /**
   * Get the current language code
   * @returns {string} - The current language code
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }
}

// Export a singleton instance
const languageManager = new LanguageManager();
module.exports = languageManager;