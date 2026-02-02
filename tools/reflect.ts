import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

export function registerReflectTool(
    api: OpenClawPluginApi,
    cfg: MemorystackConfig,
): void {
    api.registerTool(
        {
            name: "memorystack_reflect",
            label: "Reflect on Memories",
            description:
                "Analyze memories to discover patterns, generate insights, and identify recurring themes. Great for understanding user behavior over time.",
            parameters: Type.Object({
                timeWindowDays: Type.Optional(
                    Type.Number({
                        description: "Analyze memories from last N days (default: 7, max: 90)",
                    }),
                ),
                analysisDepth: Type.Optional(
                    Type.String({
                        description: "Analysis depth: 'shallow' (faster) or 'deep' (more thorough)",
                    }),
                ),
                dryRun: Type.Optional(
                    Type.Boolean({
                        description: "Preview only, don't save insights (default: false)",
                    }),
                ),
            }),
            async execute(
                _toolCallId: string,
                params: {
                    timeWindowDays?: number;
                    analysisDepth?: string;
                    dryRun?: boolean;
                },
            ) {
                const timeWindowDays = params.timeWindowDays ?? 7;
                const analysisDepth = params.analysisDepth ?? "shallow";
                const dryRun = params.dryRun ?? false;

                log.debugRequest("reflect", { timeWindowDays, analysisDepth, dryRun });

                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                try {
                    const result = await client.reflectOnMemories({
                        timeWindowDays,
                        analysisDepth: analysisDepth as "shallow" | "deep",
                        dryRun,
                    });

                    log.debugResponse("reflect", {
                        patterns: result.patterns?.length ?? 0,
                        insights: result.insightsGenerated ?? 0,
                    });

                    // Format output
                    const lines: string[] = [];
                    lines.push(`# 🔮 Memory Reflection`);
                    lines.push("");
                    lines.push(`**Memories Analyzed:** ${result.memoriesAnalyzed}`);
                    lines.push(`**Patterns Found:** ${result.patterns?.length ?? 0}`);
                    lines.push(`**Insights Generated:** ${result.insightsGenerated ?? 0}`);

                    if (result.patterns && result.patterns.length > 0) {
                        lines.push("");
                        lines.push("## Patterns");
                        for (const pattern of result.patterns.slice(0, 5)) {
                            lines.push(`- **${pattern.type || "Pattern"}:** ${pattern.description || pattern.content}`);
                        }
                    }

                    if (result.insights && result.insights.length > 0) {
                        lines.push("");
                        lines.push("## Insights");
                        for (const insight of result.insights.slice(0, 5)) {
                            lines.push(`- ${insight.content || insight}`);
                        }
                    }

                    if (dryRun) {
                        lines.push("");
                        lines.push("*This was a dry run - no insights were saved.*");
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
                    log.error("reflect failed", error);
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `❌ Reflection failed: ${error?.message || "Unknown error"}`,
                            },
                        ],
                    };
                }
            },
        },
        { name: "memorystack_reflect" },
    );
}
