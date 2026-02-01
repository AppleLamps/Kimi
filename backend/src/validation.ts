import { z, ZodError } from 'zod';
import type { ZodIssue } from 'zod';

const nonEmptyString = z.string().min(1, 'Required');

const toNumber = (value: unknown) => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
};

const positiveInt = z.preprocess(
    toNumber,
    z.number().int().positive('Must be a positive integer')
);

const optionalPositiveInt = positiveInt.optional();

export class ValidationError extends Error {
    public issues: ZodError['issues'];

    constructor(error: ZodError) {
        super('Validation failed');
        this.issues = error.issues;
    }
}

export const formatValidationIssues = (issues: ZodIssue[]): string =>
    issues
        .map((issue: ZodIssue) =>
            issue.path.length > 0
                ? `${issue.path.join('.')}: ${issue.message}`
                : issue.message
        )
        .join('; ');

export const parseWithSchema = <T>(schema: z.ZodType<T>, data: unknown): T => {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
        throw new ValidationError(parsed.error);
    }
    return parsed.data;
};

export const modelConfigSchema = z
    .object({
        model: nonEmptyString.optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: positiveInt.optional(),
        baseUrl: nonEmptyString.optional(),
    })
    .strict();

export const workspaceValidateSchema = z
    .object({
        path: nonEmptyString,
    })
    .strict();

export const workspaceTreeQuerySchema = z
    .object({
        path: nonEmptyString,
        depth: optionalPositiveInt,
        maxEntries: optionalPositiveInt,
    })
    .strict();

export const sessionParamsSchema = z
    .object({
        sessionId: nonEmptyString,
    })
    .strict();

export const diffParamsSchema = z
    .object({
        sessionId: nonEmptyString,
        diffId: nonEmptyString,
    })
    .strict();

export const sessionResumeSchema = z
    .object({
        sessionId: nonEmptyString.optional(),
    })
    .strict();

export const sessionStateRequestSchema = sessionResumeSchema;

export const taskStartSchema = z
    .object({
        task: nonEmptyString,
        workspacePath: nonEmptyString,
        modelConfig: modelConfigSchema.optional(),
        systemPrompt: z.string().optional(),
    })
    .strict();

export const taskContinueSchema = z
    .object({
        message: nonEmptyString,
    })
    .strict();

export const diffActionSchema = z
    .object({
        diffId: nonEmptyString,
    })
    .strict();

export const commandConfirmationSchema = z
    .object({
        commandId: nonEmptyString,
    })
    .strict();

export const gitOperationSchema = z
    .object({
        workspacePath: nonEmptyString,
        remote: nonEmptyString.optional(),
        branch: nonEmptyString.optional(),
    })
    .strict();

export const listFilesSchema = z
    .object({
        path: nonEmptyString.optional(),
    })
    .strict();

export const readFileSchema = z
    .object({
        path: nonEmptyString,
    })
    .strict();

export const proposeFileChangeSchema = z
    .object({
        path: nonEmptyString,
        new_content: z.string(),
    })
    .strict();

export const proposeFileChangesSchema = z
    .object({
        changes: z
            .array(
                z
                    .object({
                        path: nonEmptyString,
                        new_content: z.string(),
                    })
                    .strict()
            )
            .min(1, 'At least one change is required'),
    })
    .strict();

export const runCommandSchema = z
    .object({
        command: nonEmptyString,
    })
    .strict();

export const searchFilesSchema = z
    .object({
        query: nonEmptyString,
        path: nonEmptyString.optional(),
        is_regex: z.boolean().optional(),
        case_sensitive: z.boolean().optional(),
        include: z.array(nonEmptyString).optional(),
        exclude: z.array(nonEmptyString).optional(),
        max_results: optionalPositiveInt,
        max_bytes_per_file: optionalPositiveInt,
    })
    .strict();

export const gitOperationsSchema = z
    .object({
        action: z.enum(['status', 'diff', 'commit', 'branch', 'checkout', 'pull', 'push']),
        args: z.record(z.unknown()).optional(),
    })
    .strict();

export const webSearchSchema = z
    .object({
        query: nonEmptyString,
        num_results: optionalPositiveInt,
    })
    .strict();

export const createDirectorySchema = z
    .object({
        path: nonEmptyString,
        recursive: z.boolean().optional(),
    })
    .strict();

export const deleteFileSchema = z
    .object({
        path: nonEmptyString,
    })
    .strict();

export const moveFileSchema = z
    .object({
        from: nonEmptyString,
        to: nonEmptyString,
    })
    .strict();

export const runTestsSchema = z
    .object({
        scope: z.enum(['backend', 'frontend', 'both', 'e2e']).optional(),
        command: nonEmptyString.optional(),
    })
    .strict();

export const toolInputSchemas: Record<string, z.ZodTypeAny> = {
    list_files: listFilesSchema,
    read_file: readFileSchema,
    propose_file_change: proposeFileChangeSchema,
    propose_file_changes: proposeFileChangesSchema,
    run_command: runCommandSchema,
    search_files: searchFilesSchema,
    git_operations: gitOperationsSchema,
    web_search: webSearchSchema,
    create_directory: createDirectorySchema,
    delete_file: deleteFileSchema,
    move_file: moveFileSchema,
    run_tests: runTestsSchema,
};
