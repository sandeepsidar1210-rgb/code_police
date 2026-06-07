"use client";

/**
 * ============================================================================
 * SELF-HEALING - FILE TREE COMPONENT
 * ============================================================================
 * Visual file tree showing affected files with fix status indicators.
 * Groups bugs by file path and shows a collapsible tree structure.
 */

import { useState, useMemo } from "react";
import {
    FileCode,
    FolderOpen,
    Folder,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    Bug,
} from "lucide-react";
import type { HealingBug } from "@/types";

interface FileTreeProps {
    bugs: HealingBug[];
}

interface TreeNode {
    name: string;
    fullPath: string;
    isFile: boolean;
    children: Map<string, TreeNode>;
    bugs: HealingBug[];
}

function buildTree(bugs: HealingBug[]): TreeNode {
    const root: TreeNode = {
        name: "root",
        fullPath: "",
        isFile: false,
        children: new Map(),
        bugs: [],
    };

    for (const bug of bugs) {
        const parts = bug.filePath.split("/");
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;
            const fullPath = parts.slice(0, i + 1).join("/");

            if (!current.children.has(part)) {
                current.children.set(part, {
                    name: part,
                    fullPath,
                    isFile,
                    children: new Map(),
                    bugs: [],
                });
            }

            current = current.children.get(part)!;
            if (isFile) {
                current.bugs.push(bug);
            }
        }
    }

    return root;
}

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
    const [open, setOpen] = useState(true);
    const allFixed = node.bugs.length > 0 && node.bugs.every((b) => b.fixed);
    const someFixed = node.bugs.some((b) => b.fixed);
    const totalBugs = node.bugs.length;

    // For folders, aggregate bugs from all descendants
    const descendantBugs = useMemo(() => {
        if (node.isFile) return node.bugs;
        const bugs: HealingBug[] = [...node.bugs];
        function collect(n: TreeNode) {
            for (const child of n.children.values()) {
                bugs.push(...child.bugs);
                collect(child);
            }
        }
        collect(node);
        return bugs;
    }, [node]);

    const descAllFixed = descendantBugs.length > 0 && descendantBugs.every((b) => b.fixed);
    const descFixed = descendantBugs.filter((b) => b.fixed).length;

    if (node.isFile) {
        return (
            <div className="group">
                <div
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors"
                    style={{ paddingLeft: `${depth * 16 + 8}px` }}
                >
                    <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <span className="text-xs text-zinc-300 truncate flex-1 font-mono">
                        {node.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {allFixed ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {totalBugs} fixed
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                                <Bug className="w-2.5 h-2.5" />
                                {someFixed ? `${node.bugs.filter(b => b.fixed).length}/${totalBugs}` : totalBugs}
                            </span>
                        )}
                    </div>
                </div>

                {/* Bug details under file */}
                <div className="space-y-0.5">
                    {node.bugs.map((bug) => (
                        <div
                            key={bug.id}
                            className="flex items-center gap-2 py-1 text-[10px]"
                            style={{ paddingLeft: `${depth * 16 + 32}px` }}
                        >
                            {bug.fixed ? (
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                            ) : (
                                <AlertCircle className="w-2.5 h-2.5 text-red-400 flex-shrink-0" />
                            )}
                            <span className="text-zinc-500 font-mono">L{bug.line}</span>
                            <span className={`truncate ${bug.fixed ? "text-zinc-500 line-through" : "text-zinc-400"}`}>
                                {bug.message.replace(/^.*?:\s*/, "").slice(0, 60)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Folder
    return (
        <div>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors w-full text-left"
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
                <ChevronRight className={`w-3 h-3 text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`} />
                {open ? (
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                ) : (
                    <Folder className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />
                )}
                <span className="text-xs text-zinc-400 flex-1">{node.name}</span>
                {descendantBugs.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${descAllFixed ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-500 bg-white/5"}`}>
                        {descFixed}/{descendantBugs.length}
                    </span>
                )}
            </button>
            {open && (
                <div>
                    {Array.from(node.children.values())
                        .sort((a, b) => {
                            if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
                            return a.name.localeCompare(b.name);
                        })
                        .map((child) => (
                            <TreeItem key={child.fullPath} node={child} depth={depth + 1} />
                        ))}
                </div>
            )}
        </div>
    );
}

export function FileTree({ bugs }: FileTreeProps) {
    const tree = useMemo(() => buildTree(bugs), [bugs]);

    if (bugs.length === 0) {
        return (
            <div className="text-center py-12 space-y-2">
                <FileCode className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-zinc-500 text-sm">No files affected yet</p>
            </div>
        );
    }

    const allFixed = bugs.every((b) => b.fixed);
    const fixedCount = bugs.filter((b) => b.fixed).length;

    return (
        <div className="space-y-3">
            {/* Summary header */}
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{new Set(bugs.map((b) => b.filePath)).size} files affected</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg ${allFixed ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"}`}>
                    {fixedCount}/{bugs.length} bugs fixed
                </span>
            </div>

            {/* Tree */}
            <div className="bg-neutral-950/40 border border-white/5 rounded-xl p-3 max-h-[400px] overflow-y-auto">
                {Array.from(tree.children.values())
                    .sort((a, b) => {
                        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
                        return a.name.localeCompare(b.name);
                    })
                    .map((child) => (
                        <TreeItem key={child.fullPath} node={child} depth={0} />
                    ))}
            </div>
        </div>
    );
}
