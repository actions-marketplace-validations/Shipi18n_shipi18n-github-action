# Shipi18n GitHub Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Shipi18n-blue.svg?logo=github)](https://github.com/marketplace/actions/shipi18n-auto-translate)
[![CI](https://github.com/Shipi18n/shipi18n-github-action/actions/workflows/ci.yml/badge.svg)](https://github.com/Shipi18n/shipi18n-github-action/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub last commit](https://img.shields.io/github/last-commit/Shipi18n/shipi18n-github-action)](https://github.com/Shipi18n/shipi18n-github-action)

Automatically translate your i18n locale files in your CI/CD pipeline using [Shipi18n](https://shipi18n.com).

## Features

- ✅ **Automatic Translation** - Translate JSON/YAML locale files on every push
- ✅ **Incremental Mode** - Only translate changed keys (saves cost & time)
- ✅ **Multi-File Support** - Translate entire directories at once with `source-dir`
- ✅ **Multi-Language Support** - Translate to 100+ languages at once
- ✅ **Placeholder Preservation** - Keeps `{{name}}`, `{count}`, `%s`, etc. intact
- ✅ **i18next Compatible** - Auto-generates CLDR plural forms
- ✅ **Pull Request Mode** - Create PRs for review instead of direct commits
- ✅ **Smart Commits** - Commits only when translations change
- ✅ **Zero Configuration** - Works out of the box with sensible defaults

## Adding Shipi18n to Your Repository

Have an existing project with only English locale files? Shipi18n **automatically creates all language folders** for you.

### Before & After

```
# BEFORE: You only have English
locales/
└── en/
    ├── common.json
    └── home.json

# AFTER: Shipi18n creates all target languages
locales/
├── en/           ← Your source (you edit this)
│   ├── common.json
│   └── home.json
├── es/           ← Auto-created & translated
│   ├── common.json
│   └── home.json
├── fr/           ← Auto-created & translated
│   ├── common.json
│   └── home.json
├── de/           ← Auto-created & translated
│   ├── common.json
│   └── home.json
└── ja/           ← Auto-created & translated
    ├── common.json
    └── home.json
```

### 3 Steps to Add Translations

**1. Get API Key** → Sign up at [shipi18n.com](https://shipi18n.com) (free, 30 seconds)

**2. Add Secret** → Repository Settings → Secrets → Actions → `SHIPI18N_API_KEY`

**3. Add Workflow** → Create `.github/workflows/translate.yml` (see Quick Start below)

That's it! Push a change to your English files and translations appear automatically via Pull Request.

## Quick Start

### 1. Get Your API Key

Sign up at [shipi18n.com](https://shipi18n.com) to get your free API key (takes 30 seconds, no credit card).

**Free tier includes:**
- 100 translation keys
- 3 languages
- 10 requests/minute

### 2. Add API Key to Secrets

Go to your repository settings → Secrets and variables → Actions → New repository secret:

- **Name:** `SHIPI18N_API_KEY`
- **Value:** Your API key from shipi18n.com

### 3. Create Workflow

Create `.github/workflows/translate.yml`:

#### Option A: Multiple files in a folder (recommended)

Use this if you have `locales/en/common.json`, `locales/en/home.json`, etc:

```yaml
name: Auto Translate
on:
  push:
    branches: [main]
    paths:
      - 'locales/en/**'  # Watches all files in en folder

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # Required for incremental translation

      - uses: Shipi18n/shipi18n-github-action@v1
        with:
          api-key: ${{ secrets.SHIPI18N_API_KEY }}
          source-dir: 'locales/en'        # Folder containing your English files
          target-languages: 'es,fr,de,ja'
          create-pr: 'true'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Option B: Single file

Use this if you have one file like `locales/en.json`:

```yaml
name: Auto Translate
on:
  push:
    branches: [main]
    paths:
      - 'locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - uses: Shipi18n/shipi18n-github-action@v1
        with:
          api-key: ${{ secrets.SHIPI18N_API_KEY }}
          source-file: 'locales/en.json'  # Single file
          target-languages: 'es,fr,de,ja'
          create-pr: 'true'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### 4. Enable GitHub Actions (for forks)

If you forked a repository with this workflow:

1. Go to your repository's **Actions** tab
2. Click **"I understand my workflows, go ahead and enable them"**
3. GitHub disables workflows on forks by default for security

### 5. Merge Translations

When you push changes to your source locale file:

1. The workflow runs automatically
2. A **Pull Request** is created with the translations
3. Review the PR and **merge it** to apply translations to your main branch

> **Tip:** Use `create-pr: 'false'` to commit translations directly without a PR (not recommended for teams).

That's it! Now whenever you update `locales/en.json`, only the changed keys are translated (incremental mode).

## Usage

### Basic Usage

```yaml
- uses: Shipi18n/shipi18n-github-action@v1
  with:
    api-key: ${{ secrets.SHIPI18N_API_KEY }}
    source-file: 'locales/en.json'
    target-languages: 'es,fr,de'
```

### Advanced Usage with Pull Request

```yaml
- uses: Shipi18n/shipi18n-github-action@v1
  with:
    api-key: ${{ secrets.SHIPI18N_API_KEY }}
    source-file: 'locales/en.json'
    target-languages: 'es,fr,de,ja,zh,pt,ru,ko'
    create-pr: 'true'
    branch-name: 'translations-update'
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Custom Output Directory

```yaml
- uses: Shipi18n/shipi18n-github-action@v1
  with:
    api-key: ${{ secrets.SHIPI18N_API_KEY }}
    source-file: 'src/locales/en.json'
    target-languages: 'es,fr,de'
    output-dir: 'src/locales'
```

### Multi-File Mode (Recommended)

Translate an entire directory of locale files at once:

```yaml
- uses: Shipi18n/shipi18n-github-action@v1
  with:
    api-key: ${{ secrets.SHIPI18N_API_KEY }}
    source-dir: 'locales/en'
    target-languages: 'es,fr,de'
```

This will:
1. Find all JSON/YAML files in `locales/en/`
2. Translate each file to all target languages
3. Output to `locales/es/`, `locales/fr/`, `locales/de/` (preserving filenames)

**Example structure:**
```
locales/
├── en/
│   ├── common.json     # Source files (you edit these)
│   └── home.json
├── es/
│   ├── common.json     # Auto-generated
│   └── home.json
├── fr/
│   ├── common.json     # Auto-generated
│   └── home.json
└── de/
    ├── common.json     # Auto-generated
    └── home.json
```

### Monorepo Setup

```yaml
- uses: Shipi18n/shipi18n-github-action@v1
  with:
    api-key: ${{ secrets.SHIPI18N_API_KEY }}
    source-dir: 'apps/frontend/locales/en'
    target-languages: 'es,fr,de'
    output-dir: 'apps/frontend/locales'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | Shipi18n API key | ✅ Yes | - |
| `source-file` | Path to source locale file (use this OR `source-dir`) | No | - |
| `source-dir` | Path to source locale directory (use this OR `source-file`) | No | - |
| `target-languages` | Comma-separated language codes | ✅ Yes | - |
| `output-dir` | Output directory for translations | No | Parent of source dir/file |
| `source-language` | Source language code | No | `en` |
| `create-pr` | Create PR instead of direct commit | No | `false` |
| `incremental` | Only translate changed keys (requires `fetch-depth: 2`) | No | `true` |
| `commit-message` | Custom commit message | No | `chore: update translations [skip ci]` |
| `branch-name` | Branch name for PR | No | `shipi18n-translations` |
| `github-token` | GitHub token for creating PRs | No | `GITHUB_TOKEN` |

> **Note:** You must specify either `source-file` OR `source-dir`, not both.
> - Use `source-file` for single file translation (outputs `{lang}.json`)
> - Use `source-dir` for multi-file translation (outputs `{lang}/{filename}.json`)

## Outputs

| Output | Description |
|--------|-------------|
| `files-changed` | Number of translation files updated |
| `files-list` | JSON array of files that were created/updated |
| `languages` | List of languages translated |

## Supported Languages

Shipi18n supports **100+ languages** including:

| Language | Code | Language | Code | Language | Code |
|----------|------|----------|------|----------|------|
| Spanish | `es` | French | `fr` | German | `de` |
| Japanese | `ja` | Chinese (Simplified) | `zh` | Chinese (Traditional) | `zh-TW` |
| Portuguese | `pt` | Russian | `ru` | Korean | `ko` |
| Italian | `it` | Dutch | `nl` | Polish | `pl` |
| Turkish | `tr` | Vietnamese | `vi` | Thai | `th` |
| Indonesian | `id` | Swedish | `sv` | Arabic | `ar` |
| Hindi | `hi` | and 85+ more... | |

[See full list →](https://shipi18n.com/docs/languages)

## Example Workflows

### Translate on Push to Main

```yaml
name: Auto Translate
on:
  push:
    branches: [main]
    paths:
      - 'locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Translate locales
        uses: Shipi18n/shipi18n-github-action@v1
        with:
          api-key: ${{ secrets.SHIPI18N_API_KEY }}
          source-file: 'locales/en.json'
          target-languages: 'es,fr,de,ja'
```

### Create Pull Request for Review

```yaml
name: Translation PR
on:
  push:
    branches: [main]
    paths:
      - 'locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Create translation PR
        uses: Shipi18n/shipi18n-github-action@v1
        with:
          api-key: ${{ secrets.SHIPI18N_API_KEY }}
          source-file: 'locales/en.json'
          target-languages: 'es,fr,de,ja,zh,pt,ru,ko'
          create-pr: 'true'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Translate on Pull Request

```yaml
name: Translation Check
on:
  pull_request:
    paths:
      - 'locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Generate translations
        uses: Shipi18n/shipi18n-github-action@v1
        with:
          api-key: ${{ secrets.SHIPI18N_API_KEY }}
          source-file: 'locales/en.json'
          target-languages: 'es,fr,de'

      - name: Commit translations
        run: |
          git config user.name "Shipi18n Bot"
          git config user.email "bot@shipi18n.com"
          git add locales/
          git commit -m "chore: update translations" || echo "No changes"
          git push
```

### Schedule Daily Translation Updates

```yaml
name: Daily Translation Sync
on:
  schedule:
    - cron: '0 2 * * *'  # Run at 2 AM UTC daily

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Update translations
        uses: Shipi18n/shipi18n-github-action@v1
        with:
          api-key: ${{ secrets.SHIPI18N_API_KEY }}
          source-file: 'locales/en.json'
          target-languages: 'es,fr,de,ja'
```

### Monorepo with Multiple Apps

```yaml
name: Translate All Apps
on:
  push:
    branches: [main]
    paths:
      - 'apps/*/locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    strategy:
      matrix:
        app: [frontend, admin, mobile]

    steps:
      - uses: actions/checkout@v4

      - name: Translate ${{ matrix.app }}
        uses: Shipi18n/shipi18n-github-action@v1
        with:
          api-key: ${{ secrets.SHIPI18N_API_KEY }}
          source-file: 'apps/${{ matrix.app }}/locales/en.json'
          target-languages: 'es,fr,de'
          output-dir: 'apps/${{ matrix.app }}/locales'
```

## How It Works

1. **Trigger**: Action runs when source locale file changes
2. **Read**: Reads your source locale file (e.g., `en.json`)
3. **Translate**: Calls Shipi18n API to translate to target languages
4. **Write**: Creates translated files (e.g., `es.json`, `fr.json`, `de.json`)
5. **Commit**: Commits changes directly or creates a pull request

## i18next Compatibility

This action is fully compatible with i18next and automatically:
- Preserves placeholders: `{{name}}`, `{count}`, `%s`
- Generates CLDR plural forms: `_one`, `_few`, `_many`, `_other`
- Maintains JSON structure and nesting
- Handles context variants: `_male`, `_female`, `_formal`

## Pricing

| Tier | Price | Keys | Languages | Rate Limit |
|------|-------|------|-----------|------------|
| **FREE** | $0/mo | 100 | 3 | 10 req/min |
| **STARTER** | $9/mo | 500 | 10 | 60 req/min |
| **PRO** | $29/mo | 10K | 100+ | 300 req/min |
| **ENTERPRISE** | Custom | Unlimited | Custom | 1000+ req/min |

**What's a "key"?** Each unique translation path (e.g., `app.welcome`) counts as one key. Translating to multiple languages doesn't multiply the count!

[View full pricing →](https://shipi18n.com/pricing)

## Troubleshooting

### Action fails with "API key not found"

Make sure you've added `SHIPI18N_API_KEY` to your repository secrets:
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `SHIPI18N_API_KEY`
4. Value: Your API key from shipi18n.com

### Permission denied when pushing

Add `contents: write` permission to your workflow:

```yaml
jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write  # Required for commits
```

### Pull request creation fails

Add `pull-requests: write` permission when using `create-pr: true`:

```yaml
jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write  # Required for PRs
```

### Rate limit exceeded

Your free tier allows 10 requests/minute. Upgrade your plan or:
- Reduce translation frequency
- Translate fewer languages per run
- Use caching to avoid redundant translations

### Source file not found

Ensure the path is relative to repository root:

```yaml
# ✅ Correct
source-file: 'src/locales/en.json'

# ❌ Incorrect
source-file: './src/locales/en.json'
```

### Workflow not running on forked repository

GitHub disables workflows on forks by default for security. To enable:

1. Go to your fork's **Actions** tab
2. You'll see a banner: "Workflows aren't being run on this fork"
3. Click **"I understand my workflows, go ahead and enable them"**

### Translations not appearing in my files

If using `create-pr: 'true'` (recommended), translations are in a **Pull Request**, not directly in main:

1. Go to your repository's **Pull Requests** tab
2. Find the PR titled "🌍 Update translations"
3. Review and **merge** the PR to apply translations

To commit directly without PR (not recommended for teams):
```yaml
create-pr: 'false'
```

### Incremental mode shows "No previous version found"

Add `fetch-depth: 2` to your checkout step:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 2  # Required for incremental translation
```

## Documentation & Resources

📚 **Full Documentation:** [shipi18n.com/integrations/github-action](https://shipi18n.com/integrations/github-action)

| Resource | Link |
|----------|------|
| **Getting Started** | [shipi18n.com](https://shipi18n.com) |
| **API Reference** | [shipi18n.com/api](https://shipi18n.com/api) |
| **i18next Best Practices** | [shipi18n.com/integrations/react](https://shipi18n.com/integrations/react) |
| **Blog & Tutorials** | [shipi18n.com/blog](https://shipi18n.com/blog) |

## Related Packages

| Package | Description |
|---------|-------------|
| [@shipi18n/api](https://www.npmjs.com/package/@shipi18n/api) | Node.js SDK for programmatic use |
| [@shipi18n/cli](https://www.npmjs.com/package/@shipi18n/cli) | CLI tool for translating files |
| [vite-plugin-shipi18n](https://www.npmjs.com/package/vite-plugin-shipi18n) | Vite plugin for build-time translation |
| [i18next-shipi18n-backend](https://www.npmjs.com/package/i18next-shipi18n-backend) | i18next backend for dynamic loading |

## Examples

- [Node.js Example](https://github.com/Shipi18n/shipi18n-nodejs-example) - Basic usage examples
- [Vue Example](https://github.com/Shipi18n/shipi18n-vue-example) - Vue 3 + vue-i18n integration

## Support

- [GitHub Issues](https://github.com/Shipi18n/shipi18n-github-action/issues)

## License

MIT

---

<p align="center">
  <a href="https://shipi18n.com">shipi18n.com</a> ·
  <a href="https://github.com/Shipi18n">GitHub</a> ·
  <a href="https://shipi18n.com/pricing">Pricing</a>
</p>
