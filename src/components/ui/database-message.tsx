"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Table2, Code2 } from "lucide-react";

interface QueryResult {
    [key: string]: unknown;
}

interface DatabaseMessageProps {
    content: string;
    query?: string | Record<string, unknown>;
    results?: QueryResult[];
    isUser?: boolean;
}

// Helper to safely convert query to string for rendering
function stringifyQuery(query: string | Record<string, unknown> | undefined): string {
    if (!query) return "";
    if (typeof query === "string") return query;
    return JSON.stringify(query, null, 2);
}

// Detect query language
function getQueryLanguage(query: string): "sql" | "json" {
    const trimmed = query.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return "json";
    }
    return "sql";
}

// Format cell value for display
function formatCellValue(value: unknown): string {
    if (value === null) return "null";
    if (value === undefined) return "";
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}

export function DatabaseMessage({ content, query, results, isUser }: DatabaseMessageProps) {
    const [copiedQuery, setCopiedQuery] = React.useState(false);
    const [showTable, setShowTable] = React.useState(true);

    const handleCopyQuery = () => {
        navigator.clipboard.writeText(stringifyQuery(query));
        setCopiedQuery(true);
        setTimeout(() => setCopiedQuery(false), 2000);
    };

    if (isUser) {
        return (
            <div className="bg-green-500 text-white rounded-2xl rounded-br-md px-4 py-3">
                <p className="whitespace-pre-wrap">{content}</p>
            </div>
        );
    }

    // Parse the content - remove any embedded query blocks since we handle them separately
    const cleanContent = content
        .replace(/\*\*Generated Query:\*\*[\s\S]*?```[\s\S]*?```/g, "")
        .replace(/```sql[\s\S]*?```/g, "")
        .replace(/```json[\s\S]*?```/g, "")
        .replace(/✅ \*\*Results\*\*[\s\S]*$/g, "")
        .replace(/❌ \*\*Execution Error\*\*:[\s\S]*$/g, "")
        .trim();

    const queryString = stringifyQuery(query);
    const queryLang = queryString ? getQueryLanguage(queryString) : "sql";

    // Get table columns from results
    const columns = results && results.length > 0 ? Object.keys(results[0]) : [];

    return (
        <div className="space-y-3">
            {/* Main explanation */}
            {cleanContent && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl rounded-tl-md p-4">
                    <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                // Style headings
                                h1: ({ children }) => (
                                    <h1 className="text-lg font-bold text-white mb-2">{children}</h1>
                                ),
                                h2: ({ children }) => (
                                    <h2 className="text-base font-semibold text-white mb-2">{children}</h2>
                                ),
                                h3: ({ children }) => (
                                    <h3 className="text-sm font-semibold text-zinc-200 mb-1">{children}</h3>
                                ),
                                // Style paragraphs
                                p: ({ children }) => (
                                    <p className="text-zinc-300 mb-2 last:mb-0">{children}</p>
                                ),
                                // Style lists
                                ul: ({ children }) => (
                                    <ul className="list-disc list-inside text-zinc-300 space-y-1 mb-2">{children}</ul>
                                ),
                                ol: ({ children }) => (
                                    <ol className="list-decimal list-inside text-zinc-300 space-y-1 mb-2">{children}</ol>
                                ),
                                li: ({ children }) => (
                                    <li className="text-zinc-300">{children}</li>
                                ),
                                // Style inline code
                                code: ({ children, className }) => {
                                    const isInline = !className;
                                    if (isInline) {
                                        return (
                                            <code className="bg-zinc-800 text-green-400 px-1.5 py-0.5 rounded text-sm font-mono">
                                                {children}
                                            </code>
                                        );
                                    }
                                    return (
                                        <code className="block bg-zinc-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                                            {children}
                                        </code>
                                    );
                                },
                                // Style code blocks
                                pre: ({ children }) => (
                                    <pre className="bg-zinc-900 rounded-lg overflow-x-auto mb-2">{children}</pre>
                                ),
                                // Style strong/bold
                                strong: ({ children }) => (
                                    <strong className="font-semibold text-white">{children}</strong>
                                ),
                                // Style emphasis
                                em: ({ children }) => (
                                    <em className="text-zinc-400 italic">{children}</em>
                                ),
                                // Style blockquotes
                                blockquote: ({ children }) => (
                                    <blockquote className="border-l-2 border-green-500 pl-3 text-zinc-400 italic my-2">
                                        {children}
                                    </blockquote>
                                ),
                            }}
                        >
                            {cleanContent}
                        </ReactMarkdown>
                    </div>
                </div>
            )}

            {/* Generated Query */}
            {queryString && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
                        <div className="flex items-center gap-2">
                            <Code2 className="w-4 h-4 text-green-400" />
                            <span className="text-xs font-medium text-zinc-400">
                                Generated {queryLang === "sql" ? "SQL" : "MongoDB"} Query
                            </span>
                        </div>
                        <button
                            onClick={handleCopyQuery}
                            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
                        >
                            {copiedQuery ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-green-400" />
                                    <span className="text-green-400">Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                    <div className="p-3 overflow-x-auto">
                        <pre className="text-sm font-mono">
                            <code className="text-green-400 whitespace-pre-wrap">{queryString}</code>
                        </pre>
                    </div>
                </div>
            )}

            {/* Query Results */}
            {results && results.length > 0 && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
                        <div className="flex items-center gap-2">
                            <Table2 className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-medium text-zinc-400">
                                Results ({results.length} row{results.length !== 1 ? "s" : ""})
                            </span>
                        </div>
                        <button
                            onClick={() => setShowTable(!showTable)}
                            className="text-xs text-zinc-400 hover:text-white transition-colors"
                        >
                            {showTable ? "Show JSON" : "Show Table"}
                        </button>
                    </div>

                    {showTable && columns.length > 0 ? (
                        <div className="overflow-x-auto max-h-80">
                            <table className="w-full text-sm">
                                <thead className="bg-zinc-800/50 sticky top-0">
                                    <tr>
                                        {columns.map((col) => (
                                            <th
                                                key={col}
                                                className="px-3 py-2 text-left text-xs font-medium text-zinc-400 border-b border-zinc-700"
                                            >
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.slice(0, 50).map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30"
                                        >
                                            {columns.map((col) => (
                                                <td
                                                    key={col}
                                                    className="px-3 py-2 text-zinc-300 font-mono text-xs whitespace-nowrap max-w-xs truncate"
                                                    title={formatCellValue(row[col])}
                                                >
                                                    {formatCellValue(row[col])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {results.length > 50 && (
                                <div className="px-3 py-2 text-xs text-zinc-500 text-center border-t border-zinc-800">
                                    Showing first 50 of {results.length} rows
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-3 overflow-x-auto max-h-80">
                            <pre className="text-xs font-mono text-zinc-300">
                                {JSON.stringify(results, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
