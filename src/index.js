const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

/**
 * Call Shipi18n API to translate a JSON file
 */
async function translateFile(apiKey, sourceFile, targetLanguages, sourceLanguage) {
  core.info(`📖 Reading source file: ${sourceFile}`);

  const sourceContent = await fs.readFile(sourceFile, 'utf8');
  const sourceJson = JSON.parse(sourceContent);

  core.info(`🌍 Translating to: ${targetLanguages.join(', ')}`);

  const response = await fetch('https://api.shipi18n.com/v1/translate/json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      content: sourceJson,
      sourceLanguage,
      targetLanguages,
      preservePlaceholders: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Translation API error: ${error.error || response.statusText}`);
  }

  const result = await response.json();

  // Handle response format
  if (result.translations) {
    return result.translations;
  } else {
    // Direct language mapping
    return result;
  }
}

/**
 * Write translated files to disk
 */
async function writeTranslatedFiles(translations, outputDir, sourceFile) {
  const filesChanged = [];
  const dir = outputDir || path.dirname(sourceFile);
  const ext = path.extname(sourceFile);

  core.info(`📝 Writing translated files to: ${dir}`);

  for (const [lang, content] of Object.entries(translations)) {
    const outputFile = path.join(dir, `${lang}${ext}`);
    await fs.writeFile(outputFile, JSON.stringify(content, null, 2) + '\n', 'utf8');
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
  let hasChanges = false;
  await exec.exec('git', ['diff', '--cached', '--quiet'], {
    ignoreReturnCode: true,
    listeners: {
      errline: () => {
        hasChanges = true;
      }
    }
  });

  if (!hasChanges) {
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
async function createPullRequest(filesChanged, branchName, commitMessage, token) {
  core.info(`🌿 Creating branch: ${branchName}`);

  // Create and checkout new branch
  await exec.exec('git', ['checkout', '-b', branchName]);

  // Configure git
  await exec.exec('git', ['config', 'user.name', 'Shipi18n Bot']);
  await exec.exec('git', ['config', 'user.email', 'bot@shipi18n.com']);

  // Add and commit changes
  await exec.exec('git', ['add', ...filesChanged]);
  await exec.exec('git', ['commit', '-m', commitMessage]);

  // Push branch
  await exec.exec('git', ['push', '-u', 'origin', branchName]);

  // Create PR using GitHub API
  const octokit = github.getOctokit(token);
  const { context } = github;

  core.info('📬 Creating pull request');

  const pr = await octokit.rest.pulls.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    title: '🌍 Update translations',
    head: branchName,
    base: context.ref.replace('refs/heads/', ''),
    body: `## 🤖 Auto-generated translations

This PR was automatically created by [Shipi18n GitHub Action](https://github.com/Shipi18n/shipi18n-github-action).

### 📝 Changes
${filesChanged.map(f => `- \`${f}\``).join('\n')}

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
    const sourceFile = core.getInput('source-file', { required: true });
    const targetLanguagesStr = core.getInput('target-languages', { required: true });
    const outputDir = core.getInput('output-dir');
    const sourceLanguage = core.getInput('source-language') || 'en';
    const createPR = core.getInput('create-pr') === 'true';
    const commitMessage = core.getInput('commit-message') || 'chore: update translations [skip ci]';
    const branchName = core.getInput('branch-name') || 'shipi18n-translations';

    // Parse target languages
    const targetLanguages = targetLanguagesStr.split(',').map(lang => lang.trim());

    core.info('🚀 Shipi18n Translation Action');
    core.info(`📄 Source: ${sourceFile}`);
    core.info(`🌍 Languages: ${targetLanguages.join(', ')}`);

    // Translate the file
    const translations = await translateFile(apiKey, sourceFile, targetLanguages, sourceLanguage);

    // Write translated files
    const filesChanged = await writeTranslatedFiles(translations, outputDir, sourceFile);

    // Set outputs
    core.setOutput('files-changed', filesChanged.length);
    core.setOutput('languages', targetLanguages.join(','));

    // Commit or create PR
    if (createPR) {
      const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error('github-token is required when create-pr is true');
      }
      await createPullRequest(filesChanged, branchName, commitMessage, token);
    } else {
      const committed = await commitChanges(filesChanged, commitMessage);
      if (!committed) {
        core.info('ℹ️ No changes were made to translations');
      }
    }

    core.info('✅ Translation complete!');
  } catch (error) {
    core.setFailed(`❌ Action failed: ${error.message}`);
  }
}

run();
