# Shipi18n GitHub Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Shipi18n-blue.svg?logo=github)](https://github.com/marketplace/actions/shipi18n-auto-translate)
[![CI](https://github.com/Shipi18n/shipi18n-github-action/actions/workflows/ci.yml/badge.svg)](https://github.com/Shipi18n/shipi18n-github-action/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub last commit](https://img.shields.io/github/last-commit/Shipi18n/shipi18n-github-action)](https://github.com/Shipi18n/shipi18n-github-action)

Automatically translate your i18n locale files in your CI/CD pipeline using [Shipi18n](https://shipi18n.com).

## Features

- ✅ **Automatic Translation** - Translate JSON/YAML locale files on every push
- ✅ **Multi-File Support** - Translate entire directories at once with `source-dir`
- ✅ **Multi-Language Support** - Translate to 100+ languages at once
- ✅ **Placeholder Preservation** - Keeps `{{name}}`, `{count}`, `%s`, etc. intact
- ✅ **i18next Compatible** - Auto-generates CLDR plural forms
- ✅ **Pull Request Mode** - Create PRs for review instead of direct commits
- ✅ **Smart Commits** - Commits only when translations change
- ✅ **Zero Configuration** - Works out of the box with sensible defaults

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
    steps:
      - uses: actions/checkout@v4

      - uses: Shipi18n/shipi18n-github-action@v1
        with:
          api-key: ${{ secrets.SHIPI18N_API_KEY }}
          source-file: 'locales/en.json'
          target-languages: 'es,fr,de,ja'
```

That's it! Now whenever you update `locales/en.json`, translations are automatically generated.

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
| `commit-message` | Custom commit message | No | `chore: update translations [skip ci]` |
| `branch-name` | Branch name for PR | No | `shipi18n-translations` |

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
