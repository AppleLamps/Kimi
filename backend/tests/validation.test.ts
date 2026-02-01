/// <reference types="jest" />

import {
  parseWithSchema,
  ValidationError,
  formatValidationIssues,
  taskStartSchema,
  taskContinueSchema,
  diffActionSchema,
  modelConfigSchema,
  workspaceValidateSchema,
  searchFilesSchema,
  gitOperationsSchema,
  taskCompleteSchema,
} from '../src/validation.js';

describe('Validation', () => {
  describe('parseWithSchema', () => {
    it('returns parsed data for valid input', () => {
      const result = parseWithSchema(taskStartSchema, {
        task: 'test task',
        workspacePath: '/test/path',
      });
      expect(result).toEqual({
        task: 'test task',
        workspacePath: '/test/path',
      });
    });

    it('throws ValidationError for invalid input', () => {
      expect(() =>
        parseWithSchema(taskStartSchema, {
          task: '',
          workspacePath: '/test/path',
        })
      ).toThrow(ValidationError);
    });

    it('throws ValidationError for missing required fields', () => {
      expect(() =>
        parseWithSchema(taskStartSchema, {
          task: 'test task',
        })
      ).toThrow(ValidationError);
    });
  });

  describe('formatValidationIssues', () => {
    it('formats issues with paths', () => {
      const issues = [
        { path: ['field1'], message: 'Required', code: 'invalid_type' as const, expected: 'string', received: 'undefined' },
        { path: ['nested', 'field2'], message: 'Too short', code: 'too_small' as const, minimum: 1, type: 'string' as const, inclusive: true, exact: false },
      ];
      const result = formatValidationIssues(issues);
      expect(result).toBe('field1: Required; nested.field2: Too short');
    });

    it('formats issues without paths', () => {
      const issues = [
        { path: [], message: 'Invalid input', code: 'custom' as const },
      ];
      const result = formatValidationIssues(issues);
      expect(result).toBe('Invalid input');
    });
  });

  describe('taskStartSchema', () => {
    it('accepts valid task start payload', () => {
      const result = parseWithSchema(taskStartSchema, {
        task: 'Build feature',
        workspacePath: '/home/user/project',
      });
      expect(result.task).toBe('Build feature');
    });

    it('accepts optional modelConfig', () => {
      const result = parseWithSchema(taskStartSchema, {
        task: 'Build feature',
        workspacePath: '/home/user/project',
        modelConfig: {
          model: 'gpt-4',
          temperature: 0.5,
        },
      });
      expect(result.modelConfig?.model).toBe('gpt-4');
    });

    it('rejects empty task', () => {
      expect(() =>
        parseWithSchema(taskStartSchema, {
          task: '',
          workspacePath: '/path',
        })
      ).toThrow(ValidationError);
    });

    it('rejects invalid temperature', () => {
      expect(() =>
        parseWithSchema(taskStartSchema, {
          task: 'test',
          workspacePath: '/path',
          modelConfig: { temperature: 3 },
        })
      ).toThrow(ValidationError);
    });

    it('rejects extra properties (strict mode)', () => {
      expect(() =>
        parseWithSchema(taskStartSchema, {
          task: 'test',
          workspacePath: '/path',
          unknownField: 'value',
        })
      ).toThrow(ValidationError);
    });
  });

  describe('taskContinueSchema', () => {
    it('accepts valid message', () => {
      const result = parseWithSchema(taskContinueSchema, {
        message: 'Continue with the next step',
      });
      expect(result.message).toBe('Continue with the next step');
    });

    it('rejects empty message', () => {
      expect(() =>
        parseWithSchema(taskContinueSchema, { message: '' })
      ).toThrow(ValidationError);
    });

    it('rejects missing message', () => {
      expect(() =>
        parseWithSchema(taskContinueSchema, {})
      ).toThrow(ValidationError);
    });
  });

  describe('diffActionSchema', () => {
    it('accepts valid diffId', () => {
      const result = parseWithSchema(diffActionSchema, {
        diffId: 'abc-123-def',
      });
      expect(result.diffId).toBe('abc-123-def');
    });

    it('rejects empty diffId', () => {
      expect(() =>
        parseWithSchema(diffActionSchema, { diffId: '' })
      ).toThrow(ValidationError);
    });
  });

  describe('modelConfigSchema', () => {
    it('accepts all optional fields', () => {
      const result = parseWithSchema(modelConfigSchema, {});
      expect(result).toEqual({});
    });

    it('validates temperature range (0-2)', () => {
      expect(() =>
        parseWithSchema(modelConfigSchema, { temperature: -0.1 })
      ).toThrow(ValidationError);

      expect(() =>
        parseWithSchema(modelConfigSchema, { temperature: 2.1 })
      ).toThrow(ValidationError);

      const valid = parseWithSchema(modelConfigSchema, { temperature: 1.5 });
      expect(valid.temperature).toBe(1.5);
    });

    it('validates maxTokens is positive integer', () => {
      expect(() =>
        parseWithSchema(modelConfigSchema, { maxTokens: -1 })
      ).toThrow(ValidationError);

      expect(() =>
        parseWithSchema(modelConfigSchema, { maxTokens: 0 })
      ).toThrow(ValidationError);

      const valid = parseWithSchema(modelConfigSchema, { maxTokens: 1000 });
      expect(valid.maxTokens).toBe(1000);
    });
  });

  describe('searchFilesSchema', () => {
    it('accepts minimal query', () => {
      const result = parseWithSchema(searchFilesSchema, {
        query: 'function',
      });
      expect(result.query).toBe('function');
    });

    it('accepts all optional parameters', () => {
      const result = parseWithSchema(searchFilesSchema, {
        query: 'test',
        path: './src',
        is_regex: true,
        case_sensitive: false,
        include: ['*.ts', '*.js'],
        exclude: ['node_modules'],
        max_results: 100,
        max_bytes_per_file: 50000,
      });
      expect(result.is_regex).toBe(true);
      expect(result.include).toEqual(['*.ts', '*.js']);
    });

    it('rejects empty query', () => {
      expect(() =>
        parseWithSchema(searchFilesSchema, { query: '' })
      ).toThrow(ValidationError);
    });
  });

  describe('gitOperationsSchema', () => {
    it('accepts valid actions', () => {
      const actions = ['status', 'diff', 'commit', 'branch', 'checkout', 'pull', 'push'];
      for (const action of actions) {
        const result = parseWithSchema(gitOperationsSchema, { action });
        expect(result.action).toBe(action);
      }
    });

    it('rejects invalid action', () => {
      expect(() =>
        parseWithSchema(gitOperationsSchema, { action: 'invalid' })
      ).toThrow(ValidationError);
    });

    it('accepts optional args', () => {
      const result = parseWithSchema(gitOperationsSchema, {
        action: 'commit',
        args: { message: 'test commit' },
      });
      expect(result.args).toEqual({ message: 'test commit' });
    });
  });

  describe('taskCompleteSchema', () => {
    it('accepts valid summary', () => {
      const result = parseWithSchema(taskCompleteSchema, {
        summary: 'Task completed successfully',
      });
      expect(result.summary).toBe('Task completed successfully');
    });

    it('rejects empty summary', () => {
      expect(() =>
        parseWithSchema(taskCompleteSchema, { summary: '' })
      ).toThrow(ValidationError);
    });

    it('rejects missing summary', () => {
      expect(() =>
        parseWithSchema(taskCompleteSchema, {})
      ).toThrow(ValidationError);
    });
  });
});
