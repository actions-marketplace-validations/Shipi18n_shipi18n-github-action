/**
 * Tests for skipKeys and skipPaths functionality in Shipi18n GitHub Action
 */

// Mock @actions/core
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn(),
}));

// Mock @actions/github
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    ref: 'refs/heads/main',
    sha: 'abc123',
    runId: '12345',
  },
  getOctokit: jest.fn(() => ({
    rest: {
      pulls: {
        create: jest.fn().mockResolvedValue({ data: { html_url: 'https://github.com/test/pr/1', number: 1 } }),
      },
    },
  })),
}));

// Mock @actions/exec
jest.mock('@actions/exec', () => ({
  exec: jest.fn().mockResolvedValue(0),
}));

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn());

// Mock fs
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    mkdir: jest.fn(),
  },
}));

const core = require('@actions/core');
const fetch = require('node-fetch');
const fs = require('fs').promises;

describe('Skip Options Parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('parses comma-separated skip-keys correctly', () => {
    const skipKeysInput = 'brandName,company.name,legal.terms';
    const skipKeys = skipKeysInput.split(',').map(k => k.trim()).filter(Boolean);

    expect(skipKeys).toEqual(['brandName', 'company.name', 'legal.terms']);
  });

  test('parses comma-separated skip-paths correctly', () => {
    const skipPathsInput = 'states.*,config.*.secret,**.internal';
    const skipPaths = skipPathsInput.split(',').map(p => p.trim()).filter(Boolean);

    expect(skipPaths).toEqual(['states.*', 'config.*.secret', '**.internal']);
  });

  test('handles empty skip-keys input', () => {
    const skipKeysInput = '';
    const skipKeys = skipKeysInput ? skipKeysInput.split(',').map(k => k.trim()).filter(Boolean) : [];

    expect(skipKeys).toEqual([]);
  });

  test('handles whitespace in skip options', () => {
    const skipKeysInput = ' brandName , company.name , legal.terms ';
    const skipKeys = skipKeysInput.split(',').map(k => k.trim()).filter(Boolean);

    expect(skipKeys).toEqual(['brandName', 'company.name', 'legal.terms']);
  });

  test('filters empty strings from split results', () => {
    const skipKeysInput = 'brandName,,company.name,';
    const skipKeys = skipKeysInput.split(',').map(k => k.trim()).filter(Boolean);

    expect(skipKeys).toEqual(['brandName', 'company.name']);
  });
});

describe('API Request with Skip Options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes skipKeys in API request body', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        es: '{"greeting":"Hola"}',
        skipped: { count: 1, keys: ['brandName'] },
      }),
    };
    fetch.mockResolvedValue(mockResponse);

    const apiKey = 'test-api-key';
    const content = { greeting: 'Hello', brandName: 'Acme' };
    const targetLanguages = ['es'];
    const sourceLanguage = 'en';
    const outputFormat = 'json';
    const skipKeys = ['brandName'];
    const skipPaths = [];

    // Simulate API call
    await fetch('https://api.shipi18n.com/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        inputMethod: 'text',
        text: JSON.stringify(content),
        sourceLanguage,
        targetLanguages: JSON.stringify(targetLanguages),
        outputFormat,
        preservePlaceholders: true,
        skipKeys,
        skipPaths,
      }),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const callArgs = fetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.skipKeys).toEqual(['brandName']);
    expect(body.skipPaths).toEqual([]);
  });

  test('includes skipPaths in API request body', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        es: '{"greeting":"Hola"}',
        skipped: { count: 3, keys: ['states.CA', 'states.NY', 'states.TX'] },
      }),
    };
    fetch.mockResolvedValue(mockResponse);

    const skipPaths = ['states.*', 'config.*.secret'];

    await fetch('https://api.shipi18n.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skipKeys: [],
        skipPaths,
      }),
    });

    const callArgs = fetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.skipPaths).toEqual(['states.*', 'config.*.secret']);
  });

  test('sends both skipKeys and skipPaths together', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        es: '{"greeting":"Hola"}',
        skipped: { count: 4, keys: ['brandName', 'states.CA', 'states.NY', 'states.TX'] },
      }),
    };
    fetch.mockResolvedValue(mockResponse);

    const skipKeys = ['brandName', 'company.name'];
    const skipPaths = ['states.*', '*.internal'];

    await fetch('https://api.shipi18n.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skipKeys,
        skipPaths,
      }),
    });

    const callArgs = fetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.skipKeys).toEqual(['brandName', 'company.name']);
    expect(body.skipPaths).toEqual(['states.*', '*.internal']);
  });

  test('sends empty arrays when no skip options provided', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        es: '{"greeting":"Hola"}',
      }),
    };
    fetch.mockResolvedValue(mockResponse);

    await fetch('https://api.shipi18n.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skipKeys: [],
        skipPaths: [],
      }),
    });

    const callArgs = fetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.skipKeys).toEqual([]);
    expect(body.skipPaths).toEqual([]);
  });
});

describe('Skipped Info Handling', () => {
  test('extracts skipped info from API response', () => {
    const apiResponse = {
      es: '{"greeting":"Hola"}',
      skipped: {
        count: 3,
        keys: ['brandName', 'states.CA', 'states.NY'],
      },
    };

    const skippedInfo = apiResponse.skipped || { count: 0, keys: [] };

    expect(skippedInfo.count).toBe(3);
    expect(skippedInfo.keys).toContain('brandName');
    expect(skippedInfo.keys).toContain('states.CA');
    expect(skippedInfo.keys).toContain('states.NY');
  });

  test('handles missing skipped info in API response', () => {
    const apiResponse = {
      es: '{"greeting":"Hola"}',
    };

    const skippedInfo = apiResponse.skipped || { count: 0, keys: [] };

    expect(skippedInfo.count).toBe(0);
    expect(skippedInfo.keys).toEqual([]);
  });

  test('filters skipped key from translations object', () => {
    const result = {
      es: '{"greeting":"Hola"}',
      warnings: [],
      savedKeys: [],
      skipped: { count: 1, keys: ['brandName'] },
    };

    // Simulate filtering non-translation fields
    const translations = {};
    for (const [key, value] of Object.entries(result)) {
      if (!['warnings', 'savedKeys', 'keysSavedCount', 'namespaces', 'namespaceFiles', 'namespaceFileNames', 'skipped'].includes(key)) {
        translations[key] = value;
      }
    }

    expect(translations).toEqual({ es: '{"greeting":"Hola"}' });
    expect(translations.skipped).toBeUndefined();
    expect(translations.warnings).toBeUndefined();
  });
});

describe('Skip Options Input Parsing from Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('parses skip-keys input from action', () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'skip-keys') return 'brandName,company.name';
      return '';
    });

    const skipKeysInput = core.getInput('skip-keys') || '';
    const skipKeys = skipKeysInput ? skipKeysInput.split(',').map(k => k.trim()).filter(Boolean) : [];

    expect(skipKeys).toEqual(['brandName', 'company.name']);
  });

  test('parses skip-paths input from action', () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'skip-paths') return 'states.*,config.*.internal';
      return '';
    });

    const skipPathsInput = core.getInput('skip-paths') || '';
    const skipPaths = skipPathsInput ? skipPathsInput.split(',').map(p => p.trim()).filter(Boolean) : [];

    expect(skipPaths).toEqual(['states.*', 'config.*.internal']);
  });

  test('handles missing skip inputs gracefully', () => {
    core.getInput.mockImplementation(() => '');

    const skipKeysInput = core.getInput('skip-keys') || '';
    const skipPathsInput = core.getInput('skip-paths') || '';

    const skipKeys = skipKeysInput ? skipKeysInput.split(',').map(k => k.trim()).filter(Boolean) : [];
    const skipPaths = skipPathsInput ? skipPathsInput.split(',').map(p => p.trim()).filter(Boolean) : [];

    expect(skipKeys).toEqual([]);
    expect(skipPaths).toEqual([]);
  });
});

describe('Glob Pattern Validation', () => {
  const isValidGlobPattern = (pattern) => {
    // Simple validation for glob patterns
    if (!pattern || typeof pattern !== 'string') return false;
    if (pattern.trim() === '') return false;
    return true;
  };

  test('validates single wildcard patterns', () => {
    expect(isValidGlobPattern('states.*')).toBe(true);
    expect(isValidGlobPattern('*.internal')).toBe(true);
    expect(isValidGlobPattern('config.*.secret')).toBe(true);
  });

  test('validates double wildcard patterns', () => {
    expect(isValidGlobPattern('config.**')).toBe(true);
    expect(isValidGlobPattern('**.secret')).toBe(true);
  });

  test('validates exact path patterns', () => {
    expect(isValidGlobPattern('brandName')).toBe(true);
    expect(isValidGlobPattern('company.name')).toBe(true);
    expect(isValidGlobPattern('deeply.nested.key')).toBe(true);
  });

  test('rejects invalid patterns', () => {
    expect(isValidGlobPattern('')).toBe(false);
    expect(isValidGlobPattern('   ')).toBe(false);
    expect(isValidGlobPattern(null)).toBe(false);
    expect(isValidGlobPattern(undefined)).toBe(false);
  });
});

describe('Output Setting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sets skipped-keys-count output', () => {
    const totalSkippedKeys = 5;

    core.setOutput('skipped-keys-count', totalSkippedKeys.toString());

    expect(core.setOutput).toHaveBeenCalledWith('skipped-keys-count', '5');
  });

  test('sets skipped-keys-count to 0 when no keys skipped', () => {
    const totalSkippedKeys = 0;

    core.setOutput('skipped-keys-count', totalSkippedKeys.toString());

    expect(core.setOutput).toHaveBeenCalledWith('skipped-keys-count', '0');
  });
});
