const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

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
 * Call Shipi18n API to translate a JSON file
 */
async function translateFile(apiKey, sourceFile, targetLanguages, sourceLanguage) {
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
      // For YAML, send as-is
      parsedContent = sourceContent;
    }
  } catch (error) {
    throw new Error(`Failed to parse ${sourceFile}: ${error.message}`);
  }

  core.info(`🌍 Translating to: ${targetLanguages.join(', ')}`);

  const response = await fetch('https://x9527l3blg.execute-api.us-east-1.amazonaws.com/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      inputMethod: 'text',
      text: outputFormat === 'json' ? JSON.stringify(parsedContent) : parsedContent,
      sourceLanguage,
      targetLanguages: JSON.stringify(targetLanguages),
      outputFormat,
      preservePlaceholders: true,
      saveKeys: false,
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
    // Skip metadata fields
    if (!['warnings', 'savedKeys', 'keysSavedCount', 'namespaces', 'namespaceFiles', 'namespaceFileNames'].includes(key)) {
      translations[key] = value;
    }
  }

  return translations;
}

/**
 * Write translated files to disk
 * For single file: outputs to {outputDir}/{lang}.json
 * For multi-file (source-dir): outputs to {outputDir}/{lang}/{filename}.json
 */
async function writeTranslatedFiles(translations, outputDir, sourceFile, useLanguageFolders = false) {
  const filesChanged = [];
  const filename = path.basename(sourceFile);
  const ext = path.extname(sourceFile);

  core.info(`📝 Writing translated files to: ${outputDir}`);

  for (const [lang, content] of Object.entries(translations)) {
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

    // Format content based on type
    let outputContent;
    if (typeof content === 'string') {
      // YAML content
      outputContent = content;
    } else {
      // JSON content
      outputContent = JSON.stringify(content, null, 2) + '\n';
    }

    await fs.writeFile(outputFile, outputContent, 'utf8');
    filesChanged.push(outputFile);
    core.info(`✅ Created: ${outputFile}`);
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
async function createPullRequest(filesChanged, branchName, commitMessage, token, sourceFiles) {
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

### ✅ Ready to merge
All translations have been generated and are ready for review.

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

    // Translate all files
    const allFilesChanged = [];

    for (const file of sourceFiles) {
      core.info(`\n${'─'.repeat(50)}`);
      core.info(`📄 Processing: ${path.basename(file)}`);

      // Translate the file
      const translations = await translateFile(apiKey, file, targetLanguages, sourceLanguage);

      // Determine output directory
      const effectiveOutputDir = outputDir || (sourceDir ? path.dirname(sourceDir) : path.dirname(file));

      // Write translated files
      const filesChanged = await writeTranslatedFiles(translations, effectiveOutputDir, file, useLanguageFolders);
      allFilesChanged.push(...filesChanged);
    }

    core.info(`\n${'─'.repeat(50)}`);
    core.info(`✅ Translated ${sourceFiles.length} file(s) to ${targetLanguages.length} language(s)`);
    core.info(`📝 Total files created/updated: ${allFilesChanged.length}`);

    // Set outputs
    core.setOutput('files-changed', allFilesChanged.length);
    core.setOutput('files-list', JSON.stringify(allFilesChanged));
    core.setOutput('languages', targetLanguages.join(','));

    // Commit or create PR
    if (allFilesChanged.length > 0) {
      if (createPR) {
        const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
        if (!token) {
          throw new Error('github-token is required when create-pr is true');
        }
        await createPullRequest(allFilesChanged, branchName, commitMessage, token, sourceFiles);
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
