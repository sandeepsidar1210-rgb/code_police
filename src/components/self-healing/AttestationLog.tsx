"use client";

/**
 * ============================================================================
 * ATTESTATION LOG - ON-CHAIN COMPLIANCE RECORDS
 * ============================================================================
 * Displays tamper-evident audit trail recorded on Sepolia testnet.
 * Each row links to Etherscan for independent verification.
 */

import { useState, useEffect } from "react";
import { ExternalLink, Shield, Loader2, LinkIcon } from "lucide-react";

interface AttestationRecord {
    id: number;
    sessionId: string;
    bugCategory: string;
    filePath: string;
    line: number;
    errorMessage: string;
    fixDescription: string;
    testBeforePassed: boolean;
    testAfterPassed: boolean;
    commitSha: string;
    timestamp: number;
    agent: string;
    txHash?: string;
}

interface AttestationLogProps {
    sessionId: string;
}

export function AttestationLog({ sessionId }: AttestationLogProps) {
    const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [enabled, setEnabled] = useState(false);
    const [contractUrl, setContractUrl] = useState<string | null>(null);

    useEffect(() => {
        async function fetchAttestations() {
            try {
                const res = await fetch(`/api/self-healing/attestations/${sessionId}`);
                if (res.ok) {
                    const data = await res.json();
                    setAttestations(data.attestations || []);
                    setEnabled(data.enabled);
                    setContractUrl(data.contractUrl || null);
                }
            } catch (err) {
                console.error("Failed to fetch attestations:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchAttestations();
    }, [sessionId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
        );
    }

    if (!enabled) {
        return (
            <div className="text-center py-12 space-y-3">
                <Shield className="w-10 h-10 text-zinc-600 mx-auto" />
                <p className="text-zinc-500 text-sm">
                    Blockchain attestation is not configured.
                </p>
                <p className="text-zinc-600 text-xs max-w-md mx-auto">
                    Add <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">SEPOLIA_RPC_URL</code>,{" "}
                    <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">DEPLOYER_PRIVATE_KEY</code>,{" "}
                    and <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">COMPLIANCE_CONTRACT_ADDRESS</code> to your .env
                </p>
            </div>
        );
    }

    if (attestations.length === 0) {
        return (
            <div className="text-center py-12 space-y-3">
                <Shield className="w-10 h-10 text-zinc-600 mx-auto" />
                <p className="text-zinc-500 text-sm">
                    No on-chain attestations yet for this session.
                </p>
                <p className="text-zinc-600 text-xs">
                    Attestations are recorded when the agent commits fixes.
                </p>
            </div>
        );
    }

    const categoryColors: Record<string, string> = {
        LINTING: "text-yellow-400 bg-yellow-500/10",
        SYNTAX: "text-red-400 bg-red-500/10",
        RUNTIME: "text-orange-400 bg-orange-500/10",
        LOGIC: "text-blue-400 bg-blue-500/10",
        SECURITY: "text-rose-400 bg-rose-500/10",
        PERFORMANCE: "text-cyan-400 bg-cyan-500/10",
        UNKNOWN: "text-zinc-400 bg-zinc-500/10",
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span className="font-medium">
                        {attestations.length} On-Chain Attestation{attestations.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-500 text-xs">Sepolia Testnet</span>
                </div>

                {contractUrl && (
                    <a
                        href={contractUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-emerald-400 transition-colors"
                    >
                        <LinkIcon className="w-3 h-3" />
                        View Contract
                    </a>
                )}
            </div>

            {/* Attestation Cards */}
            <div className="space-y-3">
                {attestations.map((a) => (
                    <div
                        key={a.id}
                        className="bg-neutral-900/60 border border-white/5 rounded-xl p-4 hover:border-emerald-500/20 transition-colors"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-zinc-500">
                                    #{a.id}
                                </span>
                                <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider ${categoryColors[a.bugCategory] || categoryColors.UNKNOWN
                                        }`}
                                >
                                    {a.bugCategory}
                                </span>
                            </div>
                            <span className="text-[10px] text-zinc-600 font-mono">
                                {new Date(a.timestamp * 1000).toLocaleString()}
                            </span>
                        </div>

                        <div className="space-y-2 mb-3">
                            <div>
                                <span className="text-[10px] uppercase tracking-wider text-zinc-600 block mb-0.5">
                                    Error
                                </span>
                                <p className="text-xs text-red-400/80 font-mono truncate">
                                    {a.filePath}:{a.line} — {a.errorMessage}
                                </p>
                            </div>
                            <div>
                                <span className="text-[10px] uppercase tracking-wider text-zinc-600 block mb-0.5">
                                    Fix
                                </span>
                                <p className="text-xs text-emerald-400/80">
                                    {a.fixDescription}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                            <div className="flex items-center gap-3 text-[10px]">
                                <span className={a.testAfterPassed ? "text-emerald-400" : "text-zinc-500"}>
                                    Tests: {a.testBeforePassed ? "✅" : "❌"} → {a.testAfterPassed ? "✅" : "❌"}
                                </span>
                                {a.testAfterPassed && (
                                    <span className="text-emerald-500/60 font-medium">verified</span>
                                )}
                                <span className="text-zinc-600 font-mono">
                                    commit: {a.commitSha.slice(0, 7)}
                                </span>
                            </div>
                            {a.txHash && (
                                <a
                                    href={`https://sepolia.etherscan.io/tx/${a.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors font-mono"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    {a.txHash.slice(0, 10)}...
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
