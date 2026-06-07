/**
 * ============================================================================
 * BLOCKCHAIN ATTESTATION SERVICE (AI-NOTARY)
 * ============================================================================
 * Server-side ethers.js service for recording immutable compliance
 * attestations on the Sepolia testnet.
 *
 * Every AI fix is signed and recorded on-chain as a tamper-evident
 * audit trail that auditors can verify independently of GitHub.
 *
 * Requires in .env:
 *   SEPOLIA_RPC_URL         — Alchemy/Infura Sepolia endpoint
 *   DEPLOYER_PRIVATE_KEY    — Agent wallet private key
 *   COMPLIANCE_CONTRACT_ADDRESS — Deployed ComplianceLog address
 */

import { ethers } from "ethers";

// ============================================================================
// CONTRACT ABI (only the functions we use)
// ============================================================================

const COMPLIANCE_ABI = [
    // Write
    "function recordAttestation(string _sessionId, string _bugCategory, string _filePath, uint256 _line, string _errorMessage, string _fixDescription, bool _testBeforePassed, bool _testAfterPassed, string _commitSha) external returns (uint256)",
    // Read
    "function getAttestation(uint256 _id) external view returns (tuple(string sessionId, string bugCategory, string filePath, uint256 line, string errorMessage, string fixDescription, bool testBeforePassed, bool testAfterPassed, string commitSha, uint256 timestamp, address agent))",
    "function getSessionAttestationIds(string _sessionId) external view returns (uint256[])",
    "function attestationCount() external view returns (uint256)",
    // Events
    "event AttestationRecorded(uint256 indexed id, string sessionId, string bugCategory, string filePath, string commitSha, uint256 timestamp)",
];

const SEPOLIA_CHAIN_ID = 11155111;
const ETHERSCAN_BASE = "https://sepolia.etherscan.io";

// ============================================================================
// TYPES
// ============================================================================

export interface AttestationInput {
    sessionId: string;
    bugCategory: string;
    filePath: string;
    line: number;
    errorMessage: string;
    fixDescription: string;
    testBeforePassed: boolean;
    testAfterPassed: boolean;
    commitSha: string;
}

export interface AttestationResult {
    success: boolean;
    attestationId?: number;
    txHash?: string;
    etherscanUrl?: string;
    error?: string;
}

export interface AttestationRecord {
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

// ============================================================================
// CONFIGURATION CHECK
// ============================================================================

export function isAttestationEnabled(): boolean {
    return !!(
        process.env.SEPOLIA_RPC_URL &&
        process.env.DEPLOYER_PRIVATE_KEY &&
        process.env.COMPLIANCE_CONTRACT_ADDRESS
    );
}

// ============================================================================
// PROVIDER & CONTRACT
// ============================================================================

function getProvider(): ethers.JsonRpcProvider {
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL not set in .env");
    return new ethers.JsonRpcProvider(rpcUrl, SEPOLIA_CHAIN_ID);
}

function getSigner(): ethers.Wallet {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
    return new ethers.Wallet(privateKey, getProvider());
}

function getContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
    const address = process.env.COMPLIANCE_CONTRACT_ADDRESS;
    if (!address) throw new Error("COMPLIANCE_CONTRACT_ADDRESS not set in .env");
    return new ethers.Contract(address, COMPLIANCE_ABI, signerOrProvider || getProvider());
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Record a fix attestation on-chain.
 * This creates a permanent, tamper-evident record of the AI fix.
 */
export async function recordFixAttestation(
    input: AttestationInput
): Promise<AttestationResult> {
    if (!isAttestationEnabled()) {
        console.warn("[Attestation] Blockchain attestation is not configured — skipping on-chain recording");
        return { success: false, error: "Attestation not configured" };
    }

    console.log(`[Attestation] Recording on-chain: ${input.bugCategory} fix in ${input.filePath}:${input.line}`);

    const MAX_RETRIES = 2;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const signer = getSigner();
            const contract = getContract(signer);

            // Truncate long strings to avoid excessive gas costs
            const errorMsg = (input.errorMessage || "").slice(0, 500);
            const fixDesc = (input.fixDescription || "").slice(0, 500);
            const commitSha = (input.commitSha || "unknown").slice(0, 64);
            const filePath = (input.filePath || "unknown").slice(0, 256);
            const sessionId = (input.sessionId || "unknown").slice(0, 128);

            const tx = await contract.recordAttestation(
                sessionId,
                input.bugCategory || "RUNTIME",
                filePath,
                input.line || 0,
                errorMsg,
                fixDesc,
                input.testBeforePassed ?? false,
                input.testAfterPassed ?? false,
                commitSha
            );

            console.log(`[Attestation] ⏳ Tx submitted: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`[Attestation] ✅ Tx confirmed in block ${receipt.blockNumber}`);

            // Parse event to get attestation ID
            let attestationId: number | undefined;
            for (const log of receipt.logs) {
                try {
                    const parsed = contract.interface.parseLog({
                        topics: log.topics as string[],
                        data: log.data,
                    });
                    if (parsed && parsed.name === "AttestationRecorded") {
                        attestationId = Number(parsed.args.id);
                    }
                } catch {
                    // Not our event
                }
            }

            return {
                success: true,
                attestationId,
                txHash: tx.hash,
                etherscanUrl: `${ETHERSCAN_BASE}/tx/${tx.hash}`,
            };
        } catch (error) {
            const err = error as Error;
            const isRetryable = err.message?.includes("nonce") || 
                                err.message?.includes("timeout") || 
                                err.message?.includes("ETIMEDOUT") ||
                                err.message?.includes("replacement fee too low") ||
                                err.message?.includes("already known");
            
            if (attempt < MAX_RETRIES && isRetryable) {
                console.warn(`[Attestation] Attempt ${attempt} failed (retryable): ${err.message}. Retrying in 2s...`);
                await new Promise((r) => setTimeout(r, 2000));
                continue;
            }

            console.error(`[Attestation] Failed after ${attempt} attempt(s):`, err.message);
            return {
                success: false,
                error: err.message,
            };
        }
    }

    return { success: false, error: "Max retries exhausted" };
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get all attestation records for a healing session
 */
export async function getSessionAttestations(
    sessionId: string
): Promise<AttestationRecord[]> {
    if (!isAttestationEnabled()) return [];

    try {
        const contract = getContract();
        const ids: bigint[] = await contract.getSessionAttestationIds(sessionId);

        const records: AttestationRecord[] = [];
        for (const id of ids) {
            const a = await contract.getAttestation(id);
            records.push({
                id: Number(id),
                sessionId: a.sessionId,
                bugCategory: a.bugCategory,
                filePath: a.filePath,
                line: Number(a.line),
                errorMessage: a.errorMessage,
                fixDescription: a.fixDescription,
                testBeforePassed: a.testBeforePassed,
                testAfterPassed: a.testAfterPassed,
                commitSha: a.commitSha,
                timestamp: Number(a.timestamp),
                agent: a.agent,
            });
        }

        return records;
    } catch (error) {
        console.error("[Attestation] Failed to read attestations:", error);
        return [];
    }
}

/**
 * Get the total number of attestations on-chain
 */
export async function getAttestationCount(): Promise<number> {
    if (!isAttestationEnabled()) return 0;
    try {
        const contract = getContract();
        const count = await contract.attestationCount();
        return Number(count);
    } catch {
        return 0;
    }
}

/**
 * Get an Etherscan URL for a transaction hash
 */
export function getEtherscanTxUrl(txHash: string): string {
    return `${ETHERSCAN_BASE}/tx/${txHash}`;
}

/**
 * Get an Etherscan URL for the contract
 */
export function getContractUrl(): string {
    const address = process.env.COMPLIANCE_CONTRACT_ADDRESS || "";
    return `${ETHERSCAN_BASE}/address/${address}`;
}
