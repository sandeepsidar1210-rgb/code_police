import { NextRequest, NextResponse } from "next/server";
import { getSessionAttestations, getContractUrl, isAttestationEnabled } from "@/lib/blockchain/attestation";

/**
 * GET /api/self-healing/attestations/[sessionId]
 * 
 * Read on-chain attestation records for a healing session.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    if (!isAttestationEnabled()) {
        return NextResponse.json({
            enabled: false,
            attestations: [],
            contractUrl: null,
            message: "Blockchain attestation is not configured",
        });
    }

    try {
        const attestations = await getSessionAttestations(sessionId);
        return NextResponse.json({
            enabled: true,
            attestations,
            contractUrl: getContractUrl(),
            count: attestations.length,
        });
    } catch (error) {
        console.error("[Attestation API] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch attestations" },
            { status: 500 }
        );
    }
}
