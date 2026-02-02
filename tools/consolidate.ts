import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

export function registerConsolidateTool(
    api: OpenClawPluginApi,
    cfg: MemorystackConfig,
): void {
    api.registerTool(
        {
            name: "memorystack_consolidate",
            label: "Consolidate Memories",
            description:
                "Merge duplicate or highly similar memories to reduce noise and keep memory clean. Useful for maintenance.",
            parameters: Type.Object({
                similarityThreshold: Type.Optional(
                    Type.Number({
                        description: "Similarity threshold 0-1 (default: 0.85). Higher = stricter matching.",
                    }),
                ),
                dryRun: Type.Optional(
                    Type.Boolean({
                        description: "Preview only, don't merge (default: false)",
                    }),
                ),
                maxPairs: Type.Optional(
                    Type.Number({
                        description: "Max pairs to process (default: 20)",
                    }),
                ),
            }),
            async execute(
                _toolCallId: string,
                params: {
                    similarityThreshold?: number;
                    dryRun?: boolean;
                    maxPairs?: number;
                },
            ) {
                const similarityThreshold = params.similarityThreshold ?? 0.85;
                const dryRun = params.dryRun ?? false;
                const maxPairs = params.maxPairs ?? 20;

                log.debugRequest("consolidate", { similarityThreshold, dryRun, maxPairs });

                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                try {
                    const result = await client.consolidateMemories({
                        similarityThreshold,
                        dryRun,
                    });

                    log.debugResponse("consolidate", {
                        merged: result.memoriesMerged ?? 0,
                        processed: result.memoriesProcessed ?? 0,
                    });

                    // Format output
                    const lines: string[] = [];
                    lines.push(`# 🧹 Memory Consolidation`);
                    lines.push("");
                    lines.push(`**Memories Processed:** ${result.memoriesProcessed ?? 0}`);
                    lines.push(`**Duplicates Merged:** ${result.memoriesMerged ?? 0}`);
                    lines.push(`**Memories Removed:** ${result.memoriesRemoved ?? 0}`);

                    if (result.mergedPairs && result.mergedPairs.length > 0) {
                        lines.push("");
                        lines.push("## Merged Pairs");
                        for (const pair of result.mergedPairs.slice(0, 5)) {
                            lines.push(`- Merged: "${pair.original?.substring(0, 50)}..." → "${pair.merged?.substring(0, 50)}..."`);
                        }
                    }

                    if (dryRun) {
                        lines.push("");
                        lines.push("*This was a dry run - no changes were made.*");
                    } else if (result.memoriesMerged === 0) {
                        lines.push("");
                        lines.push("✨ No duplicates found - your memory is already clean!");
                    } else {
                        lines.push("");
                        lines.push("✅ Consolidation complete!");
                    }

                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: lines.join("\n"),
                            },
                        ],
                        details: result,
                    };
                } catch (error: any) {
                    log.error("consolidate failed", error);
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `❌ Consolidation failed: ${error?.message || "Unknown error"}`,
                            },
                        ],
                    };
                }
            },
        },
        { name: "memorystack_consolidate" },
    );
}
