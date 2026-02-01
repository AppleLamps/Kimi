import React, { useState, useEffect } from 'react';
import { libraryStore } from '../utils/libraryStore';
import { TaskPreset, ProjectTemplate, CodeSnippet, LibraryData } from '../types';
import {
    Zap,
    CheckSquare,
    FileText,
    Layout,
    Code,
    Trash2,
    Plus,
    Search,
    Book,
    Clipboard,
    Sparkles
} from 'lucide-react';

interface LibraryPaneProps {
    onUsePreset: (preset: TaskPreset) => void;
    onUseTemplate: (template: ProjectTemplate) => void;
    onUseSnippet: (snippet: CodeSnippet) => void;
}

const LibraryPane: React.FC<LibraryPaneProps> = ({
    onUsePreset,
    onUseTemplate,
    onUseSnippet
}) => {
    const [library, setLibrary] = useState<LibraryData | null>(null);
    const [activeTab, setActiveTab] = useState<'presets' | 'templates' | 'snippets'>('presets');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        libraryStore.getLibrary().then(setLibrary);
    }, []);

    if (!library) {
        return (
            <div className="flex-1 flex items-center justify-center p-8 text-kimi-text-muted">
                <div className="animate-pulse">Loading Library...</div>
            </div>
        );
    }

    const filteredPresets = library.presets.filter(p =>
        p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.task.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredTemplates = library.templates.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredSnippets = library.snippets.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderIcon = (iconName: string | undefined) => {
        switch (iconName) {
            case 'zap': return <Zap size={16} />;
            case 'check-square': return <CheckSquare size={16} />;
            case 'file-text': return <FileText size={16} />;
            case 'layout': return <Layout size={16} />;
            default: return <Book size={16} />;
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-kimi-darker/30">
            <div className="p-4 border-b border-kimi-border">
                <h2 className="text-lg font-semibold mb-3">Library</h2>

                <div className="relative mb-4">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-kimi-text-muted" />
                    <input
                        type="text"
                        placeholder="Search library..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-kimi-gray border border-kimi-border rounded-lg text-sm focus:outline-none focus:border-kimi-blue transition-colors"
                    />
                </div>

                <div className="flex gap-1 p-1 bg-kimi-gray rounded-lg">
                    <button
                        onClick={() => setActiveTab('presets')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'presets'
                            ? 'bg-kimi-dark text-kimi-blue shadow-sm'
                            : 'text-kimi-text-muted hover:text-kimi-text hover:bg-kimi-dark/50'
                            }`}
                    >
                        Presets
                    </button>
                    <button
                        onClick={() => setActiveTab('templates')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'templates'
                            ? 'bg-kimi-dark text-kimi-blue shadow-sm'
                            : 'text-kimi-text-muted hover:text-kimi-text hover:bg-kimi-dark/50'
                            }`}
                    >
                        Templates
                    </button>
                    <button
                        onClick={() => setActiveTab('snippets')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'snippets'
                            ? 'bg-kimi-dark text-kimi-blue shadow-sm'
                            : 'text-kimi-text-muted hover:text-kimi-text hover:bg-kimi-dark/50'
                            }`}
                    >
                        Snippets
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTab === 'presets' && (
                    <div className="space-y-3">
                        {filteredPresets.map(preset => (
                            <div key={preset.id} className="p-3 bg-kimi-gray/40 border border-kimi-border rounded-xl hover:border-kimi-border-light transition-all group">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-kimi-blue/10 text-kimi-blue rounded-lg">
                                            {renderIcon(preset.icon)}
                                        </div>
                                        <span className="font-medium text-sm">{preset.label}</span>
                                    </div>
                                    <button
                                        onClick={() => onUsePreset(preset)}
                                        className="p-1.5 bg-kimi-blue/10 text-kimi-blue hover:bg-kimi-blue hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                        title="Use this preset"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <p className="text-xs text-kimi-text-muted line-clamp-2 italic">
                                    "{preset.task}"
                                </p>
                                {preset.systemPromptOverride && (
                                    <div className="mt-2 text-[10px] text-kimi-purple font-medium flex items-center gap-1">
                                        <Sparkles size={10} />
                                        Custom System Prompt
                                    </div>
                                )}
                            </div>
                        ))}
                        {filteredPresets.length === 0 && (
                            <div className="text-center py-8 text-kimi-text-muted text-sm italic">
                                No presets found.
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'templates' && (
                    <div className="space-y-3">
                        {filteredTemplates.map(template => (
                            <div key={template.id} className="p-4 bg-kimi-gray/40 border border-kimi-border rounded-xl hover:border-kimi-border-light transition-all group">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-kimi-purple/10 text-kimi-purple rounded-lg">
                                            {renderIcon(template.icon)}
                                        </div>
                                        <span className="font-medium text-sm">{template.name}</span>
                                    </div>
                                    <button
                                        onClick={() => onUseTemplate(template)}
                                        className="p-1.5 bg-kimi-purple/10 text-kimi-purple hover:bg-kimi-purple hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Layout size={14} />
                                    </button>
                                </div>
                                <p className="text-xs text-kimi-text-muted leading-relaxed">
                                    {template.description}
                                </p>
                            </div>
                        ))}
                        {filteredTemplates.length === 0 && (
                            <div className="text-center py-8 text-kimi-text-muted text-sm italic">
                                No templates found.
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'snippets' && (
                    <div className="space-y-3">
                        {filteredSnippets.map(snippet => (
                            <div key={snippet.id} className="p-3 bg-kimi-gray/40 border border-kimi-border rounded-xl group relative overflow-hidden">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-kimi-yellow/10 text-kimi-yellow rounded-lg">
                                            <Code size={16} />
                                        </div>
                                        <span className="font-medium text-sm truncate max-w-[180px]">{snippet.title}</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                        <button
                                            onClick={() => onUseSnippet(snippet)}
                                            className="p-1.5 bg-kimi-blue/10 text-kimi-blue hover:bg-kimi-blue hover:text-white rounded-lg"
                                            title="Copy to chat"
                                        >
                                            <Clipboard size={14} />
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (confirm('Delete this snippet?')) {
                                                    await libraryStore.removeSnippet(snippet.id);
                                                    setLibrary(prev => prev ? ({
                                                        ...prev,
                                                        snippets: prev.snippets.filter(s => s.id !== snippet.id)
                                                    }) : null);
                                                }
                                            }}
                                            className="p-1.5 bg-kimi-red/10 text-kimi-red hover:bg-kimi-red hover:text-white rounded-lg"
                                            title="Delete snippet"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <div className="bg-kimi-darker/50 rounded p-2 font-mono text-[10px] overflow-hidden max-h-24">
                                        {snippet.content}
                                    </div>
                                    <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-kimi-gray/40 to-transparent pointer-events-none" />
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[10px] text-kimi-text-muted uppercase font-semibold">
                                        {snippet.language}
                                    </span>
                                    <span className="text-[10px] text-kimi-text-muted">
                                        {new Date(snippet.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {filteredSnippets.length === 0 && (
                            <div className="text-center py-12 flex flex-col items-center gap-3">
                                <div className="p-3 bg-kimi-gray rounded-full text-kimi-text-muted">
                                    <Code size={24} />
                                </div>
                                <div className="text-sm text-kimi-text-muted italic">
                                    No snippets saved yet.
                                </div>
                                <p className="text-[10px] text-kimi-text-muted max-w-[200px]">
                                    You can save code blocks from the chat or diff view to reuse them later.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LibraryPane;
