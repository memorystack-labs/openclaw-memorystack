import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

export function registerDeleteTool(
    api: OpenClawPluginApi,
    cfg: MemorystackConfig,
): void {
    api.registerTool(
        {
            name: "memorystack_delete",
            label: "Delete Memory",
            description:
                "Delete a memory by ID. Use search first to find the memory ID if you only have the content.",
            parameters: Type.Object({
                memoryId: Type.String({ description: "UUID of the memory to delete" }),
                hard: Type.Optional(
                    Type.Boolean({
                        description: "Permanently delete (true) or soft delete (false, default)",
                    }),
                ),
            }),
            async execute(
                _toolCallId: string,
                params: { memoryId: string; hard?: boolean },
            ) {
                log.debugRequest("delete", { memoryId: params.memoryId, hard: params.hard });

                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                try {
                    const result = await client.deleteMemory(params.memoryId, params.hard ?? false);

                    log.debugResponse("delete", { success: result.success });

                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: result.success
                                    ? `✅ Memory deleted successfully (ID: ${params.memoryId})`
                                    : `❌ Failed to delete memory`,
                            },
                        ],
                        details: result,
                    };
                } catch (error: any) {
                    log.error("delete failed", error);
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `❌ Failed to delete memory: ${error?.message || "Unknown error"}`,
                            },
                        ],
                    };
                }
            },
        },
        { name: "memorystack_delete" },
    );
}
