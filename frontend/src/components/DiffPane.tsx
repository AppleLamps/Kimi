import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    Check,
    X,
    ChevronDown,
    ChevronRight,
    FileCode,
    FilePlus,
    FileEdit,
    CheckCheck,
    XCircle,
    Copy,
    CheckCircle,
    Columns2,
    Folder,
    FileText,
    MessageSquarePlus,
    Trash2,
    ArrowRightLeft,
    Eye,
    Pin,
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import type { DiffComment, DiffResult, PinnedFile } from '../types';
import type * as Monaco from 'monaco-editor';

const BACKEND_URL = 'http://localhost:3001';

interface DiffPaneProps {
    diffs: DiffResult[];
    comments: DiffComment[];
    sessionId: string | null;
    pinnedFiles: PinnedFile[];
    onApply: (diffId: string) => void;
    onReject: (diffId: string) => void;
    onApplyAll: () => void;
    onRejectAll: () => void;
    onAddComment: (comment: DiffComment) => void;
    onDeleteComment: (commentId: string) => void;
    onPinFile: (path: string) => void;
}

interface DiffViewerProps {
    diff: DiffResult;
    viewMode: DiffViewMode;
    comments: DiffComment[];
    originalContent?: string;
    proposedContent?: string;
    contentLoaded: boolean;
    contentLoading: boolean;
    contentError?: string;
    isPinned: boolean;
    onRequestContent: () => void;
    onApply: () => void;
    onReject: () => void;
    onAddComment: (comment: DiffComment) => void;
    onDeleteComment: (commentId: string) => void;
    onPinFile: () => void;
}

type DiffViewMode = 'unified' | 'side-by-side';

type TreeNode = {
    name: string;
    path: string;
    isFile: boolean;
    diffId?: string;
    children: TreeNode[];
};

type FlatTreeNode = {
    node: TreeNode;
    depth: number;
};

const LANGUAGE_MAP: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
    toml: 'toml',
    xml: 'xml',
};

function getLanguageFromPath(path: string): string {
    const extension = path.split('.').pop()?.toLowerCase();
    if (!extension) return 'plaintext';
    return LANGUAGE_MAP[extension] || 'plaintext';
}

function buildFileTree(diffs: DiffResult[]): TreeNode {
    const root: TreeNode = { name: '', path: '', isFile: false, children: [] };

    diffs.forEach((diff) => {
        const parts = diff.path.split('/').filter(Boolean);
        let current = root;
        let currentPath = '';

        parts.forEach((part, index) => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            let child = current.children.find((node) => node.name === part);
            if (!child) {
                child = {
                    name: part,
                    path: currentPath,
                    isFile: index === parts.length - 1,
                    diffId: index === parts.length - 1 ? diff.id : undefined,
                    children: [],
                };
                current.children.push(child);
            }
            if (index === parts.length - 1) {
                child.isFile = true;
                child.diffId = diff.id;
            }
            current = child;
        });
    });

    return root;
}

function flattenTree(node: TreeNode, expanded: Record<string, boolean>, depth = 0): FlatTreeNode[] {
    const items: FlatTreeNode[] = [];
    if (node.path) {
        items.push({ node, depth });
    }

    if (!node.isFile) {
        const isExpanded = expanded[node.path] ?? true;
        if (node.path === '' || isExpanded) {
            node.children.forEach((child) => {
                items.push(...flattenTree(child, expanded, node.path === '' ? depth : depth + 1));
            });
        }
    }

    return items;
}

function parseDiff(diffText: string): Array<{
    type: 'header' | 'add' | 'remove' | 'context';
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
}> {
    const lines = diffText.split('\n');
    const result: Array<{
        type: 'header' | 'add' | 'remove' | 'context';
        content: string;
        oldLineNum?: number;
        newLineNum?: number;
    }> = [];

    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (match) {
                oldLine = parseInt(match[1], 10);
                newLine = parseInt(match[2], 10);
            }
            result.push({ type: 'header', content: line });
        } else if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:') || line.startsWith('===')) {
            result.push({ type: 'header', content: line });
        } else if (line.startsWith('+')) {
            result.push({
                type: 'add',
                content: line.substring(1),
                newLineNum: newLine++,
            });
        } else if (line.startsWith('-')) {
            result.push({
                type: 'remove',
                content: line.substring(1),
                oldLineNum: oldLine++,
            });
        } else if (line.startsWith(' ')) {
            result.push({
                type: 'context',
                content: line.substring(1),
                oldLineNum: oldLine++,
                newLineNum: newLine++,
            });
        } else if (line.length > 0) {
            result.push({
                type: 'context',
                content: line,
                oldLineNum: oldLine++,
                newLineNum: newLine++,
            });
        }
    }

    return result;
}

function DiffViewer({
    diff,
    viewMode,
    comments,
    originalContent,
    proposedContent,
    contentLoaded,
    contentLoading,
    contentError,
    isPinned,
    onRequestContent,
    onApply,
    onReject,
    onAddComment,
    onDeleteComment,
    onPinFile,
}: DiffViewerProps) {
    const [expanded, setExpanded] = useState(true);
    const [copied, setCopied] = useState(false);
    const [commentTarget, setCommentTarget] = useState<{ side: 'original' | 'proposed'; line: number } | null>(null);
    const [commentDraft, setCommentDraft] = useState('');
    const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);
    const monacoRef = useRef<typeof Monaco | null>(null);
    const decorationIdsRef = useRef<{ original: string[]; modified: string[] }>({ original: [], modified: [] });
    const disposablesRef = useRef<Monaco.IDisposable[]>([]);

    const parsedLines = useMemo(() => parseDiff(diff.diff), [diff.diff]);
    const addedLines = parsedLines.filter((l) => l.type === 'add').length;
    const removedLines = parsedLines.filter((l) => l.type === 'remove').length;
    const operation = diff.operation ?? (diff.original !== undefined ? 'modify' : 'create');
    const isNewFile = operation === 'create';
    const isDelete = operation === 'delete';
    const isMove = operation === 'move';
    const diffComments = comments.filter((comment) => comment.diffId === diff.id);
    const language = getLanguageFromPath(diff.path);

    const handleCopyPath = async () => {
        await navigator.clipboard.writeText(diff.path);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveComment = () => {
        if (!commentTarget || !commentDraft.trim()) return;
        onAddComment({
            id: crypto.randomUUID(),
            diffId: diff.id,
            side: commentTarget.side,
            line: commentTarget.line,
            text: commentDraft.trim(),
            createdAt: new Date().toISOString(),
        });
        setCommentDraft('');
        setCommentTarget(null);
    };

    const updateDecorations = () => {
        if (!diffEditorRef.current || !monacoRef.current) return;

        const diffEditor = diffEditorRef.current;
        const monaco = monacoRef.current;

        const originalEditor = diffEditor.getOriginalEditor();
        const modifiedEditor = diffEditor.getModifiedEditor();

        const originalDecorations = diffComments
            .filter((comment) => comment.side === 'original')
            .map((comment) => ({
                range: new monaco.Range(comment.line, 1, comment.line, 1),
                options: {
                    isWholeLine: true,
                    linesDecorationsClassName: 'diff-comment-line',
                    glyphMarginClassName: 'diff-comment-glyph',
                },
            }));

        const modifiedDecorations = diffComments
            .filter((comment) => comment.side === 'proposed')
            .map((comment) => ({
                range: new monaco.Range(comment.line, 1, comment.line, 1),
                options: {
                    isWholeLine: true,
                    linesDecorationsClassName: 'diff-comment-line',
                    glyphMarginClassName: 'diff-comment-glyph',
                },
            }));

        decorationIdsRef.current.original = originalEditor.deltaDecorations(
            decorationIdsRef.current.original,
            originalDecorations
        );
        decorationIdsRef.current.modified = modifiedEditor.deltaDecorations(
            decorationIdsRef.current.modified,
            modifiedDecorations
        );
    };

    useEffect(() => {
        updateDecorations();
    }, [diffComments]);

    useEffect(() => {
        return () => {
            disposablesRef.current.forEach((disposable) => disposable.dispose());
            disposablesRef.current = [];
        };
    }, []);

    const handleEditorMount = (
        editor: Monaco.editor.IStandaloneDiffEditor,
        monaco: typeof Monaco
    ) => {
        diffEditorRef.current = editor;
        monacoRef.current = monaco;

        const originalEditor = editor.getOriginalEditor();
        const modifiedEditor = editor.getModifiedEditor();

        disposablesRef.current = [
            originalEditor.onMouseDown((event) => {
                if (!event.target.position) return;
                setCommentTarget({ side: 'original', line: event.target.position.lineNumber });
                setCommentDraft('');
            }),
            modifiedEditor.onMouseDown((event) => {
                if (!event.target.position) return;
                setCommentTarget({ side: 'proposed', line: event.target.position.lineNumber });
                setCommentDraft('');
            }),
        ];

        updateDecorations();
    };

    const fileName = diff.path.split('/').pop() || diff.path;
    const dirPath = diff.path.split('/').slice(0, -1).join('/');
    const moveLabel = isMove && diff.oldPath ? `${diff.oldPath} → ${diff.newPath}` : undefined;

    return (
        <div className="card card-hover overflow-hidden mb-4 animate-slide-up">
            <div
                className="flex items-center justify-between px-4 py-3 bg-kimi-gray/50 cursor-pointer hover:bg-kimi-light-gray/50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {expanded ? (
                            <ChevronDown size={16} className="text-kimi-text-muted flex-shrink-0" />
                        ) : (
                            <ChevronRight size={16} className="text-kimi-text-muted flex-shrink-0" />
                        )}
                        {isDelete ? (
                            <Trash2 size={16} className="text-kimi-red flex-shrink-0" />
                        ) : isMove ? (
                            <ArrowRightLeft size={16} className="text-kimi-yellow flex-shrink-0" />
                        ) : isNewFile ? (
                            <FilePlus size={16} className="text-kimi-green flex-shrink-0" />
                        ) : (
                            <FileEdit size={16} className="text-kimi-blue flex-shrink-0" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-kimi-text truncate">
                                {fileName}
                            </span>
                            {isDelete ? (
                                <span className="badge badge-error text-[10px] py-0.5">DELETED</span>
                            ) : isMove ? (
                                <span className="badge badge-info text-[10px] py-0.5">MOVED</span>
                            ) : isNewFile ? (
                                <span className="badge badge-success text-[10px] py-0.5">NEW</span>
                            ) : (
                                <span className="badge badge-info text-[10px] py-0.5">MODIFIED</span>
                            )}
                            {diffComments.length > 0 && (
                                <span className="badge badge-purple text-[10px] py-0.5">
                                    {diffComments.length} comment{diffComments.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        {dirPath && (
                            <span className="text-xs text-kimi-text-muted truncate block">
                                {dirPath}
                            </span>
                        )}
                        {moveLabel && (
                            <span className="text-[10px] text-kimi-text-muted truncate block">
                                {moveLabel}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-kimi-green">+{addedLines}</span>
                        <span className="text-kimi-red">-{removedLines}</span>
                    </div>

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            handleCopyPath();
                        }}
                        className="p-1.5 rounded hover:bg-kimi-light-gray transition-colors"
                        title="Copy file path"
                    >
                        {copied ? (
                            <CheckCircle size={14} className="text-kimi-green" />
                        ) : (
                            <Copy size={14} className="text-kimi-text-muted" />
                        )}
                    </button>
                </div>
            </div>

            {expanded && (
                <>
                    <div className="border-t border-kimi-border bg-kimi-darker">
                        {contentLoaded ? (
                            <DiffEditor
                                height="360px"
                                original={originalContent ?? ''}
                                modified={proposedContent ?? ''}
                                language={language}
                                theme="vs-dark"
                                onMount={handleEditorMount}
                                options={{
                                    readOnly: true,
                                    renderSideBySide: viewMode === 'side-by-side',
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                    automaticLayout: true,
                                    glyphMargin: true,
                                    lineNumbersMinChars: 3,
                                }}
                            />
                        ) : (
                            <div className="h-[360px] flex flex-col items-center justify-center gap-3 text-xs text-kimi-text-muted">
                                <span>{contentLoading ? 'Loading diff contents...' : 'Diff contents not loaded yet.'}</span>
                                {contentError && (
                                    <span className="text-kimi-red text-[10px]">{contentError}</span>
                                )}
                                {!contentLoading && (
                                    <button
                                        onClick={onRequestContent}
                                        className="btn-ghost px-3 py-1 text-[10px] rounded-full"
                                        title="Load diff contents"
                                    >
                                        Load file contents
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-kimi-border bg-kimi-gray/30 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-kimi-text-secondary">
                                <MessageSquarePlus size={14} className="text-kimi-purple" />
                                Comments
                            </div>
                            {commentTarget ? (
                                <span className="text-[10px] text-kimi-text-muted">
                                    {commentTarget.side === 'original' ? 'Original' : 'Proposed'} line {commentTarget.line}
                                </span>
                            ) : (
                                <span className="text-[10px] text-kimi-text-muted">Click a line to comment</span>
                            )}
                        </div>

                        {commentTarget && (
                            <div className="mb-3">
                                <textarea
                                    value={commentDraft}
                                    onChange={(event) => setCommentDraft(event.target.value)}
                                    placeholder="Add comment..."
                                    className="w-full bg-kimi-darker border border-kimi-border rounded-lg px-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light"
                                    rows={2}
                                />
                                <div className="flex items-center justify-end gap-2 mt-2">
                                    <button
                                        onClick={() => {
                                            setCommentDraft('');
                                            setCommentTarget(null);
                                        }}
                                        className="text-[10px] px-2 py-1 rounded-md text-kimi-text-muted hover:text-kimi-text"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveComment}
                                        className="text-[10px] px-2.5 py-1 rounded-md bg-kimi-purple/20 text-kimi-purple border border-kimi-purple/30"
                                    >
                                        Save comment
                                    </button>
                                </div>
                            </div>
                        )}

                        {diffComments.length === 0 ? (
                            <p className="text-[11px] text-kimi-text-muted">No comments yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {diffComments.map((comment) => (
                                    <div key={comment.id} className="flex items-start justify-between gap-3 rounded-md bg-kimi-darker/80 border border-kimi-border px-3 py-2">
                                        <div className="text-xs text-kimi-text-secondary">
                                            <div className="text-[10px] text-kimi-text-muted mb-1">
                                                {comment.side === 'original' ? 'Original' : 'Proposed'} line {comment.line}
                                            </div>
                                            <p className="whitespace-pre-wrap">{comment.text}</p>
                                        </div>
                                        <button
                                            onClick={() => onDeleteComment(comment.id)}
                                            className="p-1 rounded hover:bg-kimi-light-gray/60 transition-colors"
                                            title="Delete comment"
                                        >
                                            <Trash2 size={12} className="text-kimi-text-muted" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-3 px-4 py-3 bg-kimi-gray/30 border-t border-kimi-border">
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onPinFile();
                            }}
                            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                                isPinned
                                    ? 'bg-kimi-blue/20 text-kimi-blue border border-kimi-blue/30'
                                    : 'bg-kimi-gray hover:bg-kimi-light-gray text-kimi-text-secondary border border-kimi-border'
                            }`}
                            title={isPinned ? 'File is pinned to context' : 'Pin file to always keep in context'}
                        >
                            <Pin size={14} />
                            {isPinned ? 'Pinned' : 'Pin'}
                        </button>
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onReject();
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-kimi-red/10 hover:bg-kimi-red/20 text-kimi-red border border-kimi-red/30 rounded-lg transition-all duration-200"
                        >
                            <X size={16} />
                            Reject
                        </button>
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onApply();
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-kimi-green/10 hover:bg-kimi-green/20 text-kimi-green border border-kimi-green/30 rounded-lg transition-all duration-200"
                        >
                            <Check size={16} />
                            Apply
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default function DiffPane({
    diffs,
    comments,
    sessionId,
    pinnedFiles,
    onApply,
    onReject,
    onApplyAll,
    onRejectAll,
    onAddComment,
    onDeleteComment,
    onPinFile,
}: DiffPaneProps) {
    const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
    const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
    const [selectedDiffId, setSelectedDiffId] = useState<string | null>(null);
    const [diffContentById, setDiffContentById] = useState<Record<string, { original: string; proposed: string; loaded: boolean; loading: boolean; error?: string }>>({});
    const [previewExpanded, setPreviewExpanded] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const treeParentRef = useRef<HTMLDivElement | null>(null);
    const diffListParentRef = useRef<HTMLDivElement | null>(null);
    const diffRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const diffIndexByIdRef = useRef<Record<string, number>>({});

    const fileTree = useMemo(() => buildFileTree(diffs), [diffs]);

    const sortedChildren = (children: TreeNode[]) =>
        [...children].sort((a, b) => {
            if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
            return a.name.localeCompare(b.name);
        });

    const sortTree = (node: TreeNode): TreeNode => ({
        ...node,
        children: sortedChildren(node.children).map(sortTree),
    });

    const sortedTree = useMemo(() => sortTree(fileTree), [fileTree]);
    const flattenedTree = useMemo(() => flattenTree(sortedTree, expandedPaths), [sortedTree, expandedPaths]);

    const treeVirtualizer = useVirtualizer({
        count: flattenedTree.length,
        getScrollElement: () => treeParentRef.current,
        estimateSize: () => 28,
        overscan: 6,
    });

    const diffVirtualizer = useVirtualizer({
        count: diffs.length,
        getScrollElement: () => diffListParentRef.current,
        estimateSize: () => 520,
        overscan: 4,
    });

    useEffect(() => {
        diffIndexByIdRef.current = diffs.reduce<Record<string, number>>((acc, diff, index) => {
            acc[diff.id] = index;
            return acc;
        }, {});
    }, [diffs]);

    const togglePath = (path: string) => {
        setExpandedPaths((prev) => ({
            ...prev,
            [path]: !prev[path],
        }));
    };

    const handleSelectDiff = (diffId?: string) => {
        if (!diffId) return;
        setSelectedDiffId(diffId);
        void requestDiffContent(diffId);
        const index = diffIndexByIdRef.current[diffId];
        if (index !== undefined) {
            diffVirtualizer.scrollToIndex(index, { align: 'start' });
        } else {
            diffRefs.current[diffId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const requestDiffContent = async (diffId: string) => {
        const existing = diffContentById[diffId];
        if (existing?.loading || existing?.loaded) return;
        if (!sessionId) {
            setDiffContentById((prev) => ({
                ...prev,
                [diffId]: { original: '', proposed: '', loaded: false, loading: false, error: 'No active session.' },
            }));
            return;
        }

        setDiffContentById((prev) => ({
            ...prev,
            [diffId]: { original: '', proposed: '', loaded: false, loading: true },
        }));

        try {
            const response = await fetch(`${BACKEND_URL}/api/session/${sessionId}/diff/${diffId}`);
            if (!response.ok) {
                throw new Error('Failed to load diff contents');
            }
            const payload = (await response.json()) as { original: string; proposed: string };
            setDiffContentById((prev) => ({
                ...prev,
                [diffId]: { original: payload.original ?? '', proposed: payload.proposed ?? '', loaded: true, loading: false },
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load diff contents';
            setDiffContentById((prev) => ({
                ...prev,
                [diffId]: { original: '', proposed: '', loaded: false, loading: false, error: message },
            }));
        }
    };

    const loadAllDiffContents = async () => {
        if (!sessionId) {
            setPreviewError('No active session.');
            return;
        }

        setPreviewError(null);
        setPreviewLoading(true);
        try {
            await Promise.all(diffs.map((diff) => requestDiffContent(diff.id)));
            setPreviewExpanded(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load diff contents.';
            setPreviewError(message);
        } finally {
            setPreviewLoading(false);
        }
    };

    const renderTreeNode = (item: FlatTreeNode) => {
        const { node, depth } = item;
        const paddingLeft = 12 + depth * 12;

        if (node.isFile) {
            return (
                <button
                    onClick={() => handleSelectDiff(node.diffId)}
                    className={`w-full flex items-center gap-2 py-1.5 rounded-md text-xs text-left transition-colors ${selectedDiffId === node.diffId
                        ? 'bg-kimi-purple/15 text-kimi-purple'
                        : 'text-kimi-text-secondary hover:bg-kimi-light-gray/40'
                        }`}
                    style={{ paddingLeft }}
                >
                    <FileText size={12} className="text-kimi-text-muted" />
                    <span className="truncate">{node.name}</span>
                </button>
            );
        }

        const isExpanded = expandedPaths[node.path] ?? true;
        return (
            <button
                onClick={() => togglePath(node.path)}
                className="w-full flex items-center gap-2 py-1.5 rounded-md text-xs text-kimi-text-secondary hover:bg-kimi-light-gray/40"
                style={{ paddingLeft }}
            >
                {isExpanded ? (
                    <ChevronDown size={12} className="text-kimi-text-muted" />
                ) : (
                    <ChevronRight size={12} className="text-kimi-text-muted" />
                )}
                <Folder size={12} className="text-kimi-text-muted" />
                <span className="truncate">{node.name}</span>
            </button>
        );
    };

    const totalAdded = diffs.reduce((acc, diff) => {
        const lines = parseDiff(diff.diff);
        return acc + lines.filter((l) => l.type === 'add').length;
    }, 0);

    const totalRemoved = diffs.reduce((acc, diff) => {
        const lines = parseDiff(diff.diff);
        return acc + lines.filter((l) => l.type === 'remove').length;
    }, 0);

    const impactItems = useMemo(() => diffs.map((diff) => {
        const lines = parseDiff(diff.diff);
        const added = lines.filter((l) => l.type === 'add').length;
        const removed = lines.filter((l) => l.type === 'remove').length;
        const operation = diff.operation ?? (diff.original !== undefined ? 'modify' : 'create');
        const contentStatus = diffContentById[diff.id];
        const loaded = contentStatus?.loaded ?? diff.original !== undefined || diff.proposed !== undefined;
        return {
            id: diff.id,
            path: diff.path,
            added,
            removed,
            operation,
            loaded,
        };
    }), [diffs, diffContentById]);

    const operationCounts = useMemo(() => impactItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.operation] = (acc[item.operation] ?? 0) + 1;
        return acc;
    }, {}), [impactItems]);

    return (
        <div className="flex flex-col h-full">
            <div className="pane-header">
                <div className="flex items-center gap-3">
                    <h2>
                        <FileCode size={18} className="text-kimi-purple" />
                        Code Review
                    </h2>
                    {diffs.length > 0 && (
                        <>
                            <span className="badge badge-purple">
                                {diffs.length} file{diffs.length !== 1 ? 's' : ''}
                            </span>
                            <div className="flex items-center gap-2 text-xs font-mono text-kimi-text-muted">
                                <span className="text-kimi-green">+{totalAdded}</span>
                                <span className="text-kimi-red">-{totalRemoved}</span>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setViewMode(viewMode === 'side-by-side' ? 'unified' : 'side-by-side')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-kimi-text-secondary hover:bg-kimi-light-gray/40 rounded-lg transition-colors"
                        title="Toggle diff view"
                    >
                        <Columns2 size={14} />
                        {viewMode === 'side-by-side' ? 'Side-by-side' : 'Unified'}
                    </button>
                    {diffs.length > 0 && (
                        <button
                            onClick={() => {
                                if (previewExpanded) {
                                    setPreviewExpanded(false);
                                } else {
                                    void loadAllDiffContents();
                                }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-kimi-purple hover:bg-kimi-purple/10 rounded-lg transition-colors"
                            title="Preview full impact before applying"
                        >
                            <Eye size={14} />
                            {previewExpanded ? 'Hide Preview' : 'Preview Impact'}
                        </button>
                    )}
                    {diffs.length > 1 && (
                        <>
                            <button
                                onClick={onRejectAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-kimi-red hover:bg-kimi-red/10 rounded-lg transition-colors"
                                title="Reject all changes"
                            >
                                <XCircle size={14} />
                                Reject All
                            </button>
                            <button
                                onClick={onApplyAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-kimi-green hover:bg-kimi-green/10 rounded-lg transition-colors"
                                title="Apply all changes atomically"
                            >
                                <CheckCheck size={14} />
                                Apply All (Atomic)
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col p-4 gap-4">
                {diffs.length === 0 ? (
                    <div className="empty-state mt-12">
                        <div className="w-20 h-20 rounded-2xl bg-kimi-gray flex items-center justify-center mb-6">
                            <FileCode size={36} className="text-kimi-text-muted opacity-40" />
                        </div>
                        <h3 className="empty-state-title">No pending changes</h3>
                        <p className="empty-state-description">
                            Code changes proposed by the agent will appear here for your review and approval.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="rounded-xl border border-kimi-border bg-kimi-darker/60 p-4">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-kimi-text-secondary">
                                    <Eye size={14} className="text-kimi-purple" />
                                    Full Impact Preview
                                </div>
                                <div className="text-[10px] text-kimi-text-muted">
                                    {previewLoading ? 'Loading contents...' : previewExpanded ? 'Ready' : 'Not loaded'}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-kimi-text-muted mb-3">
                                <span className="badge badge-purple">{diffs.length} file{diffs.length !== 1 ? 's' : ''}</span>
                                <span className="text-kimi-green">+{totalAdded}</span>
                                <span className="text-kimi-red">-{totalRemoved}</span>
                                {Object.entries(operationCounts).map(([operation, count]) => (
                                    <span key={operation} className="badge badge-info text-[10px] py-0.5">
                                        {operation.toUpperCase()} {count}
                                    </span>
                                ))}
                            </div>

                            {previewError && (
                                <div className="text-[11px] text-kimi-red mb-2">{previewError}</div>
                            )}

                            {previewExpanded ? (
                                <div className="grid grid-cols-1 gap-2 text-[11px]">
                                    {impactItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between gap-3 rounded-md border border-kimi-border bg-kimi-darker/80 px-3 py-2"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-kimi-text-secondary truncate">{item.path}</span>
                                                <span className="badge badge-info text-[10px] py-0.5">
                                                    {item.operation.toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 font-mono">
                                                <span className="text-kimi-green">+{item.added}</span>
                                                <span className="text-kimi-red">-{item.removed}</span>
                                                <span className={`text-[10px] ${item.loaded ? 'text-kimi-green' : 'text-kimi-text-muted'}`}>
                                                    {item.loaded ? 'content loaded' : 'content pending'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-[11px] text-kimi-text-muted">
                                    Load all diff contents to preview the full impact before applying.
                                </div>
                            )}
                        </div>

                        <div className="rounded-xl border border-kimi-border bg-kimi-darker/50 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-kimi-text-secondary mb-2">
                                <FileCode size={14} className="text-kimi-purple" />
                                Files
                            </div>
                            <div
                                ref={treeParentRef}
                                className="max-h-56 overflow-y-auto scroll-container"
                            >
                                <div
                                    className="relative"
                                    style={{ height: `${treeVirtualizer.getTotalSize()}px` }}
                                >
                                    {treeVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const item = flattenedTree[virtualRow.index];
                                        return (
                                            <div
                                                key={item.node.path || `${item.node.name}-${virtualRow.index}`}
                                                ref={treeVirtualizer.measureElement}
                                                data-index={virtualRow.index}
                                                className="absolute left-0 w-full"
                                                style={{ transform: `translateY(${virtualRow.start}px)` }}
                                            >
                                                {renderTreeNode(item)}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div
                            ref={diffListParentRef}
                            className="flex-1 overflow-y-auto scroll-container pr-1"
                        >
                            <div
                                className="relative"
                                style={{ height: `${diffVirtualizer.getTotalSize()}px` }}
                            >
                                {diffVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const diff = diffs[virtualRow.index];
                                    diffIndexByIdRef.current[diff.id] = virtualRow.index;
                                    const cached = diffContentById[diff.id];
                                    const contentLoaded = diff.original !== undefined || diff.proposed !== undefined || cached?.loaded;
                                    const originalContent = cached?.loaded ? cached.original : diff.original;
                                    const proposedContent = cached?.loaded ? cached.proposed : diff.proposed;
                                    return (
                                        <div
                                            key={diff.id}
                                            ref={(node) => {
                                                diffRefs.current[diff.id] = node;
                                                if (node) {
                                                    diffVirtualizer.measureElement(node);
                                                }
                                            }}
                                            data-index={virtualRow.index}
                                            className="absolute left-0 w-full"
                                            style={{ transform: `translateY(${virtualRow.start}px)` }}
                                        >
                                            <DiffViewer
                                                diff={diff}
                                                viewMode={viewMode}
                                                comments={comments}
                                                originalContent={originalContent}
                                                proposedContent={proposedContent}
                                                contentLoaded={contentLoaded}
                                                contentLoading={cached?.loading ?? false}
                                                contentError={cached?.error}
                                                isPinned={pinnedFiles.some(pf => pf.path === diff.path)}
                                                onRequestContent={() => requestDiffContent(diff.id)}
                                                onApply={() => onApply(diff.id)}
                                                onReject={() => onReject(diff.id)}
                                                onAddComment={onAddComment}
                                                onDeleteComment={onDeleteComment}
                                                onPinFile={() => onPinFile(diff.path)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}