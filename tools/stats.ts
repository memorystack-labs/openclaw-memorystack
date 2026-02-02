import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

export function registerStatsTool(
    api: OpenClawPluginApi,
    cfg: MemorystackConfig,
): void {
    api.registerTool(
        {
            name: "memorystack_stats",
            label: "Memory Stats",
            description: "Get statistics about memory usage and API calls.",
            parameters: Type.Object({}),
            async execute() {
                log.debugRequest("stats", {});

                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                const stats = await client.getStats();

                log.debugResponse("stats", {
                    total_memories: stats.totals.total_memories,
                    api_calls: stats.usage.current_month_api_calls,
                });

                const text = [
                    `**Total Memories:** ${stats.totals.total_memories}`,
                    `**API Calls:** ${stats.usage.current_month_api_calls} / ${stats.usage.monthly_api_limit}`,
                    `**Plan:** ${stats.plan_tier || "Free"}`,
                    `**Storage:** ${(stats.storage.total_storage_bytes / 1024 / 1024).toFixed(2)} MB`,
                ].join("\n");

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `# MemoryStack Stats\n\n${text}`,
                        },
                    ],
                    details: stats,
                };
            },
        },
        { name: "memorystack_stats" },
    );
}
