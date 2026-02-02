import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

export function registerAddTool(
    api: OpenClawPluginApi,
    cfg: MemorystackConfig,
    getSessionKey?: () => string | undefined,
    getContext?: () => Record<string, any>,
): void {
    api.registerTool(
        {
            name: "memorystack_add",
            label: "Memory Add",
            description: `Save important information to long-term memory with automatic importance scoring.

**Automatic Context Capture**: The following are automatically captured from your session context:
- agent_id: Your agent identifier (e.g., "main", subagent UUID)
- session_id: Current session key for conversation tracking
- team_id: Team/group identifier (if in a group chat)
- conversation_id: Specific conversation thread ID
- user_id: The sender's ID (can be overridden with userId parameter)

You don't need to specify these manually - they are captured automatically to organize memories.`,
            parameters: Type.Object({
                text: Type.String({ description: "Information to remember" }),
                userId: Type.Optional(Type.String({ description: "Override user ID (defaults to sender)" })),
                memory_type: Type.Optional(
                    Type.String({
                        description: "Type of memory: fact, preference, episode, procedure, belief",
                    }),
                ),
            }),
            async execute(
                _toolCallId: string,
                params: { text: string; userId?: string; memory_type?: string },
            ) {
                const sessionKey = getSessionKey?.();
                const ctx = getContext?.() || {};

                // For subagents, use the subagent UUID as the agent_id
                // This ensures subagent memories are properly attributed
                const effectiveAgentId = ctx.subagentId || ctx.agentId || "main";

                log.debugRequest("add", {
                    textLength: params.text.length,
                    userId: params.userId,
                    sessionKey,
                    agentId: ctx.agentId,
                    subagentId: ctx.subagentId,
                    effectiveAgentId,
                });

                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                // Prepare metadata from context
                const metadata: Record<string, any> = {
                    source: "clawdbot_tool",
                    session_key: sessionKey,
                    timestamp: new Date().toISOString(),
                    user_id: params.userId ?? ctx.userId,
                    parent_agent_id: ctx.agentId,  // Track the parent agent
                    subagent_id: ctx.subagentId,   // Track if this is a subagent
                    provider: ctx.Provider,
                    model: ctx.Model,
                    sender_name: ctx.SenderName,
                };

                // Remove undefined values
                Object.keys(metadata).forEach(key => metadata[key] === undefined && delete metadata[key]);

                const result = await client.add(params.text, {
                    userId: params.userId ?? ctx.userId,
                    sessionId: sessionKey,
                    agentId: effectiveAgentId,  // Use subagentId if available!
                    teamId: ctx.teamId,
                    conversationId: ctx.conversationId,
                    memory_type: params.memory_type,
                    metadata: metadata,
                });

                log.debugResponse("add", {
                    memories_created: result.memories_created,
                    memory_ids: result.memory_ids,
                });

                const preview =
                    params.text.length > 80 ? `${params.text.slice(0, 80)}…` : params.text;

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Stored: "${preview}"\nCreated ${result.memories_created} memory (IDs: ${result.memory_ids.join(", ")})`,
                        },
                    ],
                    details: result,
                };
            },
        },
        { name: "memorystack_add" },
    );
}
