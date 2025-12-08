const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

/**
 * Flatten a nested object into dot-notation keys
 * { a: { b: 1 } } => { 'a.b': 1 }
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

/**
 * Unflatten dot-notation keys back to nested object
 * { 'a.b': 1 } => { a: { b: 1 } }
 */
function unflattenObject(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const keys = key.split('.');
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }
  return result;
}

/**
 * Deep merge two objects (source wins)
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Remove keys from target that exist in keysToRemove
 */
function removeKeys(target, keysToRemove) {
  const flatTarget = flattenObject(target);
  for (const key of keysToRemove) {
    delete flatTarget[key];
  }
  return unflattenObject(flatTarget);
}

/**
 * Get the previous version of a file from git
 */
async function getPreviousFileContent(filePath) {
  try {
    let output = '';
    await exec.exec('git', ['show', `HEAD~1:${filePath}`], {
      silent: true,
      listeners: {
        stdout: (data) => { output += data.toString(); }
      },
      ignoreReturnCode: true
    });
    return output || null;
  } catch {
    return null;
  }
}

/**
 * Detect changed, added, and deleted keys between old and new content
 */
function detectChangedKeys(oldContent, newContent) {
  const oldFlat = oldContent ? flattenObject(oldContent) : {};
  const newFlat = flattenObject(newContent);

  const added = [];
  const modified = [];
  const deleted = [];

  // Find added and modified keys
  for (const [key, value] of Object.entries(newFlat)) {
    if (!(key in oldFlat)) {
      added.push(key);
    } else if (JSON.stringify(oldFlat[key]) !== JSON.stringify(value)) {
      modified.push(key);
    }
  }

  // Find deleted keys
  for (const key of Object.keys(oldFlat)) {
    if (!(key in newFlat)) {
      deleted.push(key);
    }
  }

  return { added, modified, deleted };
}

/**
 * Extract only specific keys from an object
 */
function extractKeys(obj, keys) {
  const flat = flattenObject(obj);
  const extracted = {};
  for (const key of keys) {
    if (key in flat) {
      extracted[key] = flat[key];
    }
  }
  return unflattenObject(extracted);
}

// ============================================
// VERIFICATION FUNCTIONS
// ============================================

/**
 * Extract placeholders from a string
 * Supports: {{name}}, {name}, %s, %d, %@, {0}, {1}, etc.
 */
function extractPlaceholders(str) {
  if (typeof str !== 'string') return [];

  const patterns = [
    /\{\{[^}]+\}\}/g,      // {{name}} - i18next/Handlebars
    /\{[^}]+\}/g,          // {name} - ICU/general
    /%[sd@]/g,             // %s, %d, %@ - printf style
    /%\d+\$[sd]/g,         // %1$s - positional printf
  ];

  const placeholders = new Set();
  for (const pattern of patterns) {
    const matches = str.match(pattern) || [];
    matches.forEach(m => placeholders.add(m));
  }

  return Array.from(placeholders).sort();
}

/**
 * Verify placeholders survived translation
 */
function verifyPlaceholders(sourceValue, translatedValue, key) {
  const sourcePlaceholders = extractPlaceholders(sourceValue);
  const translatedPlaceholders = extractPlaceholders(translatedValue);

  const missing = sourcePlaceholders.filter(p => !translatedPlaceholders.includes(p));
  const extra = translatedPlaceholders.filter(p => !sourcePlaceholders.includes(p));

  if (missing.length > 0 || extra.length > 0) {
    return {
      key,
      type: 'placeholder',
      severity: 'error',
      message: missing.length > 0
        ? `Missing placeholders: ${missing.join(', ')}`
        : `Unexpected placeholders: ${extra.join(', ')}`,
      source: sourceValue,
      translated: translatedValue
    };
  }
  return null;
}

/**
 * Verify key consistency between source and translation
 */
function verifyKeyConsistency(sourceKeys, translatedKeys, lang) {
  const issues = [];

  const missing = sourceKeys.filter(k => !translatedKeys.includes(k));
  const extra = translatedKeys.filter(k => !sourceKeys.includes(k));

  if (missing.length > 0) {
    issues.push({
      type: 'missing_keys',
      severity: 'warning',
      message: `${missing.length} key(s) missing in ${lang}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`,
      keys: missing
    });
  }

  if (extra.length > 0) {
    issues.push({
      type: 'extra_keys',
      severity: 'warning',
      message: `${extra.length} unexpected key(s) in ${lang}: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '...' : ''}`,
      keys: extra
    });
  }

  return issues;
}

/**
 * Verify translation length is reasonable
 * Flag if translation is >5x or <0.2x the source length
 */
function verifyLengthSanity(sourceValue, translatedValue, key) {
  if (typeof sourceValue !== 'string' || typeof translatedValue !== 'string') return null;
  if (sourceValue.length < 5) return null; // Skip very short strings

  const ratio = translatedValue.length / sourceValue.length;

  if (ratio > 5) {
    return {
      key,
      type: 'length',
      severity: 'warning',
      message: `Translation is ${ratio.toFixed(1)}x longer than source`,
      source: sourceValue,
      translated: translatedValue
    };
  }

  if (ratio < 0.2) {
    return {
      key,
      type: 'length',
      severity: 'warning',
      message: `Translation is ${ratio.toFixed(1)}x shorter than source`,
      source: sourceValue,
      translated: translatedValue
    };
  }

  return null;
}

/**
 * Run all verification checks on a translation
 */
function runVerification(sourceContent, translatedContent, lang) {
  const issues = [];

  const sourceFlat = flattenObject(sourceContent);
  const translatedFlat = flattenObject(translatedContent);

  const sourceKeys = Object.keys(sourceFlat);
  const translatedKeys = Object.keys(translatedFlat);

  // Key consistency check
  const keyIssues = verifyKeyConsistency(sourceKeys, translatedKeys, lang);
  issues.push(...keyIssues);

  // Per-key checks
  for (const key of sourceKeys) {
    const sourceValue = sourceFlat[key];
    const translatedValue = translatedFlat[key];

    if (translatedValue === undefined) continue;

    // Placeholder check
    const placeholderIssue = verifyPlaceholders(sourceValue, translatedValue, key);
    if (placeholderIssue) {
      placeholderIssue.lang = lang;
      issues.push(placeholderIssue);
    }

    // Length sanity check
    const lengthIssue = verifyLengthSanity(sourceValue, translatedValue, key);
    if (lengthIssue) {
      lengthIssue.lang = lang;
      issues.push(lengthIssue);
    }
  }

  return issues;
}

/**
 * Format verification results for PR description
 */
function formatVerificationSummary(allIssues) {
  if (allIssues.length === 0) {
    return '### ✅ Verification Passed\nAll translations passed quality checks.';
  }

  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');

  let summary = '### ⚠️ Verification Results\n\n';

  if (errors.length > 0) {
    summary += `**${errors.length} Error(s):**\n`;
    errors.slice(0, 10).forEach(e => {
      summary += `- ❌ \`${e.key || e.type}\`: ${e.message}\n`;
    });
    if (errors.length > 10) {
      summary += `- ... and ${errors.length - 10} more errors\n`;
    }
    summary += '\n';
  }

  if (warnings.length > 0) {
    summary += `**${warnings.length} Warning(s):**\n`;
    warnings.slice(0, 5).forEach(w => {
      summary += `- ⚠️ \`${w.key || w.type}\`: ${w.message}\n`;
    });
    if (warnings.length > 5) {
      summary += `- ... and ${warnings.length - 5} more warnings\n`;
    }
  }

  return summary;
}

/**
 * Discover all translatable files in a directory
 */
async function discoverFiles(sourceDir) {
  const files = [];
  const supportedExtensions = ['.json', '.yaml', '.yml'];

  try {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          files.push(path.join(sourceDir, entry.name));
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to read source directory '${sourceDir}': ${error.message}`);
  }

  if (files.length === 0) {
    throw new Error(`No translatable files found in '${sourceDir}'. Supported formats: ${supportedExtensions.join(', ')}`);
  }

  return files;
}

/**
 * Report sync status to Shipi18n API (for dashboard)
 */
async function reportSyncStatus(apiKey, data) {
  try {
    const response = await fetch('https://ydjkwckq3f.execute-api.us-east-1.amazonaws.com/api/sync/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      core.warning(`Failed to report sync status: ${response.statusText}`);
      return false;
    }

    core.info(`📊 Sync status reported to dashboard`);
    return true;
  } catch (error) {
    core.warning(`Failed to report sync status: ${error.message}`);
    return false;
  }
}

/**
 * Report sync history to Shipi18n API (for dashboard)
 */
async function reportSyncHistory(apiKey, data) {
  try {
    const response = await fetch('https://ydjkwckq3f.execute-api.us-east-1.amazonaws.com/api/sync/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      core.warning(`Failed to report sync history: ${response.statusText}`);
      return false;
    }

    core.info(`📜 Sync history recorded`);
    return true;
  } catch (error) {
    core.warning(`Failed to report sync history: ${error.message}`);
    return false;
  }
}

/**
 * Call Shipi18n API to translate content
 */
async function callTranslateAPI(apiKey, content, targetLanguages, sourceLanguage, outputFormat) {
  const response = await fetch('https://ydjkwckq3f.execute-api.us-east-1.amazonaws.com/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      inputMethod: 'text',
      text: outputFormat === 'json' ? JSON.stringify(content) : content,
      sourceLanguage,
      targetLanguages: JSON.stringify(targetLanguages),
      outputFormat,
      preservePlaceholders: true,
      saveKeys: true,  // Store keys in translation memory (counts toward user's key limit)
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Translation API error: ${error.error || response.statusText}`);
  }

  const result = await response.json();

  // Filter out non-translation fields (warnings, savedKeys, etc.)
  const translations = {};
  for (const [key, value] of Object.entries(result)) {
    if (!['warnings', 'savedKeys', 'keysSavedCount', 'namespaces', 'namespaceFiles', 'namespaceFileNames'].includes(key)) {
      translations[key] = value;
    }
  }

  return translations;
}

/**
 * Translate a JSON file (with optional incremental mode)
 */
async function translateFile(apiKey, sourceFile, targetLanguages, sourceLanguage, incremental = false) {
  core.info(`📖 Reading source file: ${sourceFile}`);

  const sourceContent = await fs.readFile(sourceFile, 'utf8');

  // Determine format based on extension
  const ext = path.extname(sourceFile).toLowerCase();
  let outputFormat = 'json';
  if (ext === '.yaml' || ext === '.yml') {
    outputFormat = 'yaml';
  }

  // Parse content to validate it
  let parsedContent;
  try {
    if (outputFormat === 'json') {
      parsedContent = JSON.parse(sourceContent);
    } else {
      // For YAML, incremental mode not supported yet
      parsedContent = sourceContent;
      incremental = false;
    }
  } catch (error) {
    throw new Error(`Failed to parse ${sourceFile}: ${error.message}`);
  }

  let contentToTranslate = parsedContent;
  let deletedKeys = [];
  let changedKeyCount = 0;

  // Incremental mode: only translate changed keys
  if (incremental && outputFormat === 'json') {
    const previousContent = await getPreviousFileContent(sourceFile);

    if (previousContent) {
      try {
        const previousParsed = JSON.parse(previousContent);
        const changes = detectChangedKeys(previousParsed, parsedContent);

        const keysToTranslate = [...changes.added, ...changes.modified];
        deletedKeys = changes.deleted;
        changedKeyCount = keysToTranslate.length;

        if (keysToTranslate.length === 0 && deletedKeys.length === 0) {
          core.info(`⏭️ No changes detected, skipping translation`);
          return { translations: {}, deletedKeys: [], isIncremental: true, changedKeyCount: 0 };
        }

        if (keysToTranslate.length > 0) {
          core.info(`📊 Incremental mode: ${changes.added.length} added, ${changes.modified.length} modified, ${changes.deleted.length} deleted`);
          contentToTranslate = extractKeys(parsedContent, keysToTranslate);
        } else {
          // Only deletions, no translations needed
          core.info(`📊 Incremental mode: ${changes.deleted.length} key(s) deleted, no translations needed`);
          return { translations: {}, deletedKeys, isIncremental: true, changedKeyCount: 0 };
        }
      } catch (e) {
        core.warning(`Could not parse previous version, falling back to full translation: ${e.message}`);
        incremental = false;
      }
    } else {
      core.info(`📊 No previous version found, performing full translation`);
      incremental = false;
    }
  }

  const keyCount = Object.keys(flattenObject(contentToTranslate)).length;
  core.info(`🌍 Translating ${keyCount} key(s) to: ${targetLanguages.join(', ')}`);

  const translations = await callTranslateAPI(apiKey, contentToTranslate, targetLanguages, sourceLanguage, outputFormat);

  return {
    translations,
    deletedKeys,
    isIncremental: incremental,
    changedKeyCount: incremental ? changedKeyCount : keyCount
  };
}

/**
 * Write translated files to disk
 * For single file: outputs to {outputDir}/{lang}.json
 * For multi-file (source-dir): outputs to {outputDir}/{lang}/{filename}.json
 * In incremental mode: merges with existing files and removes deleted keys
 */
async function writeTranslatedFiles(translations, outputDir, sourceFile, useLanguageFolders = false, deletedKeys = [], isIncremental = false) {
  const filesChanged = [];
  const filename = path.basename(sourceFile);
  const ext = path.extname(sourceFile);

  core.info(`📝 Writing translated files to: ${outputDir}`);

  for (const [lang, newContent] of Object.entries(translations)) {
    let outputFile;

    if (useLanguageFolders) {
      // Multi-file mode: {outputDir}/{lang}/{filename}
      const langDir = path.join(outputDir, lang);
      await fs.mkdir(langDir, { recursive: true });
      outputFile = path.join(langDir, filename);
    } else {
      // Single file mode: {outputDir}/{lang}.json
      outputFile = path.join(outputDir, `${lang}${ext}`);
    }

    let finalContent = newContent;

    // In incremental mode, merge with existing file
    if (isIncremental && typeof newContent === 'object') {
      try {
        const existingContent = await fs.readFile(outputFile, 'utf8');
        const existingParsed = JSON.parse(existingContent);

        // Merge new translations into existing
        finalContent = deepMerge(existingParsed, newContent);

        // Remove deleted keys
        if (deletedKeys.length > 0) {
          finalContent = removeKeys(finalContent, deletedKeys);
        }

        core.info(`🔄 Merged: ${outputFile}`);
      } catch (e) {
        // File doesn't exist or isn't valid JSON, use new content as-is
        core.info(`✨ New file: ${outputFile}`);
      }
    }

    // Format content based on type
    let outputContent;
    if (typeof finalContent === 'string') {
      // YAML content
      outputContent = finalContent;
    } else {
      // JSON content
      outputContent = JSON.stringify(finalContent, null, 2) + '\n';
    }

    await fs.writeFile(outputFile, outputContent, 'utf8');
    filesChanged.push(outputFile);
    core.info(`✅ Saved: ${outputFile}`);
  }

  return filesChanged;
}

/**
 * Remove deleted keys from existing translation files
 * Used when source keys are deleted but no new translations are needed
 */
async function removeDeletedKeysFromFiles(outputDir, sourceFile, targetLanguages, deletedKeys, useLanguageFolders) {
  const filesChanged = [];
  const filename = path.basename(sourceFile);
  const ext = path.extname(sourceFile);

  core.info(`🗑️ Removing ${deletedKeys.length} deleted key(s) from ${targetLanguages.length} language file(s)`);

  for (const lang of targetLanguages) {
    let outputFile;

    if (useLanguageFolders) {
      outputFile = path.join(outputDir, lang, filename);
    } else {
      outputFile = path.join(outputDir, `${lang}${ext}`);
    }

    try {
      const existingContent = await fs.readFile(outputFile, 'utf8');
      const existingParsed = JSON.parse(existingContent);

      // Remove deleted keys
      const updatedContent = removeKeys(existingParsed, deletedKeys);

      // Write updated content
      await fs.writeFile(outputFile, JSON.stringify(updatedContent, null, 2) + '\n', 'utf8');
      filesChanged.push(outputFile);
      core.info(`🗑️ Updated: ${outputFile}`);
    } catch (e) {
      // File doesn't exist, skip
      core.info(`⏭️ Skipping ${outputFile} (not found)`);
    }
  }

  return filesChanged;
}

/**
 * Commit and push changes
 */
async function commitChanges(filesChanged, commitMessage) {
  core.info('🔧 Configuring git');

  await exec.exec('git', ['config', 'user.name', 'Shipi18n Bot']);
  await exec.exec('git', ['config', 'user.email', 'bot@shipi18n.com']);

  core.info('📦 Adding translated files');
  await exec.exec('git', ['add', ...filesChanged]);

  // Check if there are changes to commit
  let exitCode = 0;
  try {
    exitCode = await exec.exec('git', ['diff', '--cached', '--quiet'], {
      ignoreReturnCode: true,
    });
  } catch {
    exitCode = 1;
  }

  if (exitCode === 0) {
    core.info('✅ No changes to commit');
    return false;
  }

  core.info(`💾 Committing: ${commitMessage}`);
  await exec.exec('git', ['commit', '-m', commitMessage]);

  core.info('🚀 Pushing changes');
  await exec.exec('git', ['push']);

  return true;
}

/**
 * Create a pull request
 */
async function createPullRequest(filesChanged, branchName, commitMessage, token, sourceFiles, verificationSummary = '') {
  // Add timestamp to branch name to avoid conflicts
  const timestamp = Date.now();
  const uniqueBranchName = `${branchName}-${timestamp}`;

  core.info(`🌿 Creating branch: ${uniqueBranchName}`);

  // Create and checkout new branch
  await exec.exec('git', ['checkout', '-b', uniqueBranchName]);

  // Configure git
  await exec.exec('git', ['config', 'user.name', 'Shipi18n Bot']);
  await exec.exec('git', ['config', 'user.email', 'bot@shipi18n.com']);

  // Add and commit changes
  await exec.exec('git', ['add', ...filesChanged]);
  await exec.exec('git', ['commit', '-m', commitMessage]);

  // Push branch
  await exec.exec('git', ['push', '-u', 'origin', uniqueBranchName]);

  // Create PR using GitHub API
  const octokit = github.getOctokit(token);
  const { context } = github;

  core.info('📬 Creating pull request');

  // Group files by language for cleaner PR description
  const filesByLang = {};
  for (const file of filesChanged) {
    const parts = file.split(path.sep);
    // Try to extract language from path
    const langMatch = parts.find(p => /^[a-z]{2}(-[A-Z]{2})?$/.test(p));
    const lang = langMatch || 'other';
    if (!filesByLang[lang]) filesByLang[lang] = [];
    filesByLang[lang].push(file);
  }

  const filesSection = Object.entries(filesByLang)
    .map(([lang, files]) => `**${lang}:**\n${files.map(f => `- \`${f}\``).join('\n')}`)
    .join('\n\n');

  const pr = await octokit.rest.pulls.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    title: '🌍 Update translations',
    head: uniqueBranchName,
    base: context.ref.replace('refs/heads/', ''),
    body: `## 🤖 Auto-generated translations

This PR was automatically created by [Shipi18n GitHub Action](https://github.com/Shipi18n/shipi18n-github-action).

### 📄 Source files translated
${sourceFiles.map(f => `- \`${f}\``).join('\n')}

### 📝 Files created/updated

${filesSection}

${verificationSummary}

---
*Generated with [Shipi18n](https://shipi18n.com)*
`,
  });

  core.info(`✅ Pull request created: ${pr.data.html_url}`);
  return pr.data.number;
}

/**
 * Main action logic
 */
async function run() {
  try {
    // Get inputs
    const apiKey = core.getInput('api-key', { required: true });
    const sourceFile = core.getInput('source-file');
    const sourceDir = core.getInput('source-dir');
    const targetLanguagesStr = core.getInput('target-languages', { required: true });
    const outputDir = core.getInput('output-dir');
    const sourceLanguage = core.getInput('source-language') || 'en';
    const createPR = core.getInput('create-pr') === 'true';
    const incremental = core.getInput('incremental') !== 'false'; // Default true
    const commitMessage = core.getInput('commit-message') || 'chore: update translations [skip ci]';
    const branchName = core.getInput('branch-name') || 'shipi18n-translations';

    // Validate inputs
    if (!sourceFile && !sourceDir) {
      throw new Error('Either source-file or source-dir must be specified');
    }
    if (sourceFile && sourceDir) {
      throw new Error('Specify either source-file or source-dir, not both');
    }

    // Parse target languages
    const targetLanguages = targetLanguagesStr.split(',').map(lang => lang.trim());

    core.info('🚀 Shipi18n Translation Action');

    // Determine files to translate
    let sourceFiles = [];
    let useLanguageFolders = false;

    if (sourceDir) {
      // Multi-file mode
      core.info(`📁 Source directory: ${sourceDir}`);
      sourceFiles = await discoverFiles(sourceDir);
      useLanguageFolders = true;
      core.info(`📄 Found ${sourceFiles.length} file(s): ${sourceFiles.map(f => path.basename(f)).join(', ')}`);
    } else {
      // Single file mode
      sourceFiles = [sourceFile];
      core.info(`📄 Source file: ${sourceFile}`);
    }

    core.info(`🌍 Target languages: ${targetLanguages.join(', ')}`);
    if (incremental) {
      core.info(`⚡ Incremental mode: enabled`);
    }

    // Translate all files
    const allFilesChanged = [];
    let totalKeysTranslated = 0;
    let totalKeysDeleted = 0;
    const allVerificationIssues = [];
    const sourceContents = {}; // Store source content for verification

    for (const file of sourceFiles) {
      core.info(`\n${'─'.repeat(50)}`);
      core.info(`📄 Processing: ${path.basename(file)}`);

      // Read and store source content for verification
      const sourceContent = await fs.readFile(file, 'utf8');
      const ext = path.extname(file).toLowerCase();
      if (ext === '.json') {
        try {
          sourceContents[file] = JSON.parse(sourceContent);
        } catch (e) {
          core.warning(`Could not parse source file for verification: ${file}`);
        }
      }

      // Translate the file
      const result = await translateFile(apiKey, file, targetLanguages, sourceLanguage, incremental);

      // Skip if no changes
      if (result.isIncremental && result.changedKeyCount === 0 && result.deletedKeys.length === 0) {
        continue;
      }

      totalKeysTranslated += result.changedKeyCount;
      totalKeysDeleted += result.deletedKeys.length;

      // Determine output directory
      const effectiveOutputDir = outputDir || (sourceDir ? path.dirname(sourceDir) : path.dirname(file));

      // Write translated files (with merge for incremental mode)
      if (Object.keys(result.translations).length > 0) {
        const filesChanged = await writeTranslatedFiles(
          result.translations,
          effectiveOutputDir,
          file,
          useLanguageFolders,
          result.deletedKeys,
          result.isIncremental
        );
        allFilesChanged.push(...filesChanged);
      } else if (result.deletedKeys.length > 0) {
        // Only deletions, no new translations
        const filesChanged = await removeDeletedKeysFromFiles(
          effectiveOutputDir,
          file,
          targetLanguages,
          result.deletedKeys,
          useLanguageFolders
        );
        allFilesChanged.push(...filesChanged);
      }
    }

    core.info(`\n${'─'.repeat(50)}`);
    if (incremental) {
      core.info(`⚡ Incremental summary: ${totalKeysTranslated} key(s) translated, ${totalKeysDeleted} key(s) deleted`);
    }
    core.info(`✅ Processed ${sourceFiles.length} file(s) to ${targetLanguages.length} language(s)`);
    core.info(`📝 Total files created/updated: ${allFilesChanged.length}`);

    // Run verification on translated files
    if (allFilesChanged.length > 0) {
      core.info(`\n🔍 Running verification checks...`);

      for (const translatedFile of allFilesChanged) {
        try {
          // Read translated file
          const translatedContent = await fs.readFile(translatedFile, 'utf8');
          const ext = path.extname(translatedFile).toLowerCase();

          if (ext === '.json') {
            const translatedParsed = JSON.parse(translatedContent);

            // Find corresponding source file
            const filename = path.basename(translatedFile);
            const sourceFile = Object.keys(sourceContents).find(f => path.basename(f) === filename);

            if (sourceFile && sourceContents[sourceFile]) {
              // Extract language from path (e.g., locales/es/common.json -> es)
              const pathParts = translatedFile.split(path.sep);
              const langMatch = pathParts.find(p => /^[a-z]{2}(-[A-Z]{2})?$/.test(p));
              const lang = langMatch || 'unknown';

              // Run verification
              const issues = runVerification(sourceContents[sourceFile], translatedParsed, lang);
              allVerificationIssues.push(...issues);
            }
          }
        } catch (e) {
          core.warning(`Could not verify ${translatedFile}: ${e.message}`);
        }
      }

      // Log verification results
      const errors = allVerificationIssues.filter(i => i.severity === 'error');
      const warnings = allVerificationIssues.filter(i => i.severity === 'warning');

      if (allVerificationIssues.length === 0) {
        core.info(`✅ All verification checks passed`);
      } else {
        core.info(`⚠️ Verification found ${errors.length} error(s) and ${warnings.length} warning(s)`);
        errors.slice(0, 5).forEach(e => core.warning(`${e.key || e.type}: ${e.message}`));
      }
    }

    // Generate verification summary for PR
    const verificationSummary = formatVerificationSummary(allVerificationIssues);

    // Set outputs
    core.setOutput('files-changed', allFilesChanged.length);
    core.setOutput('files-list', JSON.stringify(allFilesChanged));
    core.setOutput('languages', targetLanguages.join(','));
    core.setOutput('verification-errors', allVerificationIssues.filter(i => i.severity === 'error').length);
    core.setOutput('verification-warnings', allVerificationIssues.filter(i => i.severity === 'warning').length);

    // Get GitHub context for sync reporting
    const { context } = github;
    const repoUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}`;
    const runId = `${context.runId}`;
    const commitSha = context.sha;
    const branch = context.ref.replace('refs/heads/', '');
    const startTime = Date.now();

    // Report sync status for each source file
    for (const file of sourceFiles) {
      const sourceContent = sourceContents[file];
      const totalKeys = sourceContent ? Object.keys(flattenObject(sourceContent)).length : 0;

      // Calculate language status
      const languages = {};
      for (const lang of targetLanguages) {
        languages[lang] = {
          translated: totalKeys,
          missing: 0,
          lastSyncAt: new Date().toISOString()
        };
      }

      // Report sync status
      await reportSyncStatus(apiKey, {
        repoUrl,
        sourceFile: file,
        targetLanguages,
        totalKeys,
        languages,
        status: allVerificationIssues.filter(i => i.severity === 'error').length > 0 ? 'error' : 'synced',
        lastError: null
      });
    }

    // Report sync history (run details)
    await reportSyncHistory(apiKey, {
      repoUrl,
      sourceFile: sourceFiles.join(', '),
      runId,
      keysTranslated: totalKeysTranslated,
      keysDeleted: totalKeysDeleted,
      filesUpdated: allFilesChanged.length,
      duration: Date.now() - startTime,
      status: allVerificationIssues.filter(i => i.severity === 'error').length > 0 ? 'partial' : 'success',
      verificationIssues: allVerificationIssues.slice(0, 10).map(i => ({
        type: i.type,
        severity: i.severity,
        key: i.key,
        message: i.message
      })),
      prUrl: null, // Will be updated after PR creation
      commitSha,
      branch
    });

    // Commit or create PR
    if (allFilesChanged.length > 0) {
      if (createPR) {
        const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
        if (!token) {
          throw new Error('github-token is required when create-pr is true');
        }
        await createPullRequest(allFilesChanged, branchName, commitMessage, token, sourceFiles, verificationSummary);
      } else {
        const committed = await commitChanges(allFilesChanged, commitMessage);
        if (!committed) {
          core.info('ℹ️ No changes were made to translations');
        }
      }
    } else {
      core.info('ℹ️ No files were translated');
    }

    core.info('✅ Translation complete!');
  } catch (error) {
    core.setFailed(`❌ Action failed: ${error.message}`);
  }
}

run();
