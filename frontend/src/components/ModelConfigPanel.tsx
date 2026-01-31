import { useState } from 'react';
import { Sliders, ServerCog, Sparkles, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import type { ModelConfig } from '../types';

const MODEL_OPTIONS = [
    'kimi-k2-0711-preview',
    'kimi-k2-0729-preview',
    'kimi-k2-0901-preview',
];

interface ModelConfigPanelProps {
    config: ModelConfig;
    onChange: (config: ModelConfig) => void;
}

export default function ModelConfigPanel({ config, onChange }: ModelConfigPanelProps) {
    const [showAdvanced, setShowAdvanced] = useState(false);

    const updateField = <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => {
        onChange({ ...config, [key]: value });
    };

    return (
        <div className="border-b border-kimi-border bg-kimi-darker/60">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sliders size={16} className="text-kimi-blue" />
                    <h3 className="text-sm font-semibold">Model Settings</h3>
                </div>
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="p-1 hover:bg-kimi-gray rounded text-kimi-text-muted transition-colors"
                    title={showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
                >
                    {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>

            <div className="px-4 pb-4 space-y-3">
                {!showAdvanced ? (
                    <label className="block text-xs text-kimi-text-muted">
                        Model
                        <select
                            value={config.model}
                            onChange={(event) => updateField('model', event.target.value)}
                            className="mt-1 w-full bg-kimi-gray border border-kimi-border rounded-lg px-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light"
                        >
                            {MODEL_OPTIONS.map((model) => (
                                <option key={model} value={model}>
                                    {model}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : (
                    <>
                        <label className="block text-xs text-kimi-text-muted">
                            Model
                            <select
                                value={config.model}
                                onChange={(event) => updateField('model', event.target.value)}
                                className="mt-1 w-full bg-kimi-gray border border-kimi-border rounded-lg px-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light"
                            >
                                {MODEL_OPTIONS.map((model) => (
                                    <option key={model} value={model}>
                                        {model}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs text-kimi-text-muted">
                                Temperature
                                <input
                                    type="number"
                                    min={0}
                                    max={2}
                                    step={0.05}
                                    value={config.temperature}
                                    onChange={(event) => updateField('temperature', Number(event.target.value))}
                                    className="mt-1 w-full bg-kimi-gray border border-kimi-border rounded-lg px-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light"
                                />
                            </label>
                            <label className="block text-xs text-kimi-text-muted">
                                Max tokens
                                <input
                                    type="number"
                                    min={256}
                                    max={200000}
                                    step={256}
                                    value={config.maxTokens}
                                    onChange={(event) => updateField('maxTokens', Number(event.target.value))}
                                    className="mt-1 w-full bg-kimi-gray border border-kimi-border rounded-lg px-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light"
                                />
                            </label>
                        </div>

                        <label className="block text-xs text-kimi-text-muted">
                            Custom API endpoint
                            <div className="mt-1 flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="https://api.moonshot.cn/v1"
                                    value={config.baseUrl ?? ''}
                                    onChange={(event) => updateField('baseUrl', event.target.value)}
                                    className="flex-1 bg-kimi-gray border border-kimi-border rounded-lg px-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light"
                                />
                            </div>
                        </label>

                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="flex items-center gap-1.5 text-xs text-kimi-text-muted">
                                    <Sparkles size={12} className="text-kimi-purple" />
                                    Custom System Prompt
                                </label>
                                {config.systemPrompt && (
                                    <button
                                        onClick={() => updateField('systemPrompt', undefined)}
                                        className="text-[10px] text-kimi-text-muted hover:text-kimi-red flex items-center gap-0.5"
                                        title="Reset to default"
                                    >
                                        <RotateCcw size={10} />
                                        Reset
                                    </button>
                                )}
                            </div>
                            <textarea
                                value={config.systemPrompt ?? ''}
                                onChange={(event) => updateField('systemPrompt', event.target.value)}
                                placeholder="Override the agent's system instructions..."
                                className="w-full h-32 bg-kimi-gray border border-kimi-border rounded-lg px-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light resize-none font-mono leading-relaxed"
                            />
                            <p className="mt-1.5 text-[10px] text-kimi-text-muted leading-relaxed">
                                Leaving this blank will use the default agent system prompt. Use this to refine how the agent behaves.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
