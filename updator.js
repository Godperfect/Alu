const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const PACKAGE_JSON = path.join(process.cwd(), 'package.json');
const VERSIONS_JSON_URL = 'https://raw.githubusercontent.com/Mr-Perfect-DevX/Luna-V1/main/versions.jsono';
const PACKAGE_JSON_URL = 'https://raw.githubusercontent.com/Mr-Perfect-DevX/Luna-V1/main/package.jsono';

// Simple logger without colors
const log = {
  info: (tag, msg) => console.log(`[${tag}] ${msg}`),
  warn: (tag, msg) => console.warn(`[${tag}] ${msg}`),
  error: (tag, msg) => console.error(`[${tag}] ${msg}`)
};

function ensureFolderExists(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

async function fetchJSON(url) {
  try {
    const res = await axios.get(url);
    return res.data;
  } catch (e) {
    log.error('NETWORK', `Failed to fetch JSON from ${url}: ${e.message}`);
    throw e;
  }
}

async function fetchFileBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    return res.data;
  } catch (e) {
    log.error('NETWORK', `Failed to fetch file from ${url}: ${e.message}`);
    throw e;
  }
}

async function backupFile(filePath, backupFolder) {
  if (fs.existsSync(filePath)) {
    const relativePath = path.relative(process.cwd(), filePath);
    const backupPath = path.join(backupFolder, relativePath);
    ensureFolderExists(path.dirname(backupPath));
    fs.copyFileSync(filePath, backupPath);
  }
}

async function updateFiles(files, backupFolder) {
  for (const filePath in files) {
    const fullPath = path.join(process.cwd(), filePath);
    try {
      // Use raw.githubusercontent.com to fetch raw file content
      const fileBuffer = await fetchFileBuffer(`https://raw.githubusercontent.com/Mr-Perfect-DevX/Luna-V1/maino/${filePath}`);

      // Backup existing file before overwriting
      await backupFile(fullPath, backupFolder);

      // Ensure directory exists and write new file content
      ensureFolderExists(path.dirname(fullPath));
      fs.writeFileSync(fullPath, fileBuffer);
      log.info('UPDATE', `Updated file: ${filePath}`);
    } catch (e) {
      log.error('UPDATE', `Failed to update file ${filePath}: ${e.message}`);
    }
  }
}

async function deleteFiles(filesToDelete, backupFolder) {
  for (const filePath in filesToDelete) {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      await backupFile(fullPath, backupFolder);
      try {
        if (fs.lstatSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        log.info('UPDATE', `Deleted file/folder: ${filePath}`);
      } catch (e) {
        log.error('UPDATE', `Failed to delete ${filePath}: ${e.message}`);
      }
    }
  }
}

async function main() {
  try {
    const versions = await fetchJSON(VERSIONS_JSON_URL);
    const currentVersion = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8')).version;

    const currentIndex = versions.findIndex(v => v.version === currentVersion);
    if (currentIndex === -1) {
      log.error('ERROR', `Current version ${currentVersion} not found in versions.json`);
      return;
    }

    const updates = versions.slice(currentIndex + 1);
    if (updates.length === 0) {
      log.info('UPDATE', 'Already at latest version.');
      return;
    }

    log.info('UPDATE', `Found ${updates.length} new version(s) to update.`);

    // Prepare backup folder
    ensureFolderExists(BACKUP_DIR);
    const backupFolder = path.join(BACKUP_DIR, `backup_${currentVersion}_${Date.now()}`);
    ensureFolderExists(backupFolder);

    // Aggregate all files and deletes from updates
    const allFiles = {};
    const allDeletes = {};
    let reinstallDeps = false;

    for (const update of updates) {
      Object.assign(allFiles, update.files || {});
      Object.assign(allDeletes, update.deleteFiles || {});
      if (update.reinstallDependencies) reinstallDeps = true;
    }

    await updateFiles(allFiles, backupFolder);
    await deleteFiles(allDeletes, backupFolder);

    // Update package.json to latest version
    const latestPackageJson = await fetchJSON(PACKAGE_JSON_URL);
    fs.writeFileSync(PACKAGE_JSON, JSON.stringify(latestPackageJson, null, 2));
    log.info('UPDATE', 'package.json updated.');

    if (reinstallDeps) {
      log.info('UPDATE', 'Reinstalling dependencies...');
      execSync('npm install', { stdio: 'inherit' });
      log.info('UPDATE', 'Dependencies reinstalled.');
    }

    log.info('UPDATE', `Update complete. Backup saved at ${backupFolder}`);
  } catch (e) {
    log.error('FATAL', `Update failed: ${e.message}`);
  }
}

main();
