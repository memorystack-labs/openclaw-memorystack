import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

export function registerSearchTool(
    api: OpenClawPluginApi,
    cfg: MemorystackConfig,
    getSessionKey?: () => string | undefined,
    getContext?: () => Record<string, any>,
): void {
    api.registerTool(
        {
            name: "memorystack_search",
            label: "Memory Search",
            description: `Search through long-term memories using semantic search.

**Automatic Context**: Your agent_id, session_id, team_id, and conversation_id are available for filtering.

**Scoping Options**:
- scope="global": Search all memories (default)
- scope="agent": Search only memories from THIS agent
- scope="team": Search only memories from this team/group

**Explicit Filters** (override scope):
- agent_id: Search memories from a specific agent/subagent by UUID
- session_id: Search memories from a specific session
- metadata: Filter by metadata key-value pairs (e.g., parent_agent_id, source)

**Filtering**: Supports memory_type, min_confidence, days_ago, and current_session filters.`,
            parameters: Type.Object({
                query: Type.String({ description: "Search query" }),
                limit: Type.Optional(
                    Type.Number({ description: "Max results (default: 5)" }),
                ),
                agent_id: Type.Optional(
                    Type.String({
                        description: "Filter by specific agent/subagent UUID (e.g., from a spawned subagent)",
                    }),
                ),
                session_id: Type.Optional(
                    Type.String({
                        description: "Filter by specific session key",
                    }),
                ),
                memory_type: Type.Optional(
                    Type.String({
                        description:
                            "Filter by type: fact, preference, episode, procedure, belief",
                    }),
                ),
                min_confidence: Type.Optional(
                    Type.Number({
                        description: "Minimum confidence score 0-1 (default: 0)",
                    }),
                ),
                days_ago: Type.Optional(
                    Type.Number({
                        description: "Only memories from last N days",
                    }),
                ),
                current_session: Type.Optional(
                    Type.Boolean({
                        description: "Filter to current session only (default: false)",
                    }),
                ),
                scope: Type.Optional(
                    Type.String({
                        description: "Scope of search: 'global', 'agent', 'team' (default: 'global')",
                        enum: ["global", "agent", "team"],
                    }),
                ),
                metadata: Type.Optional(
                    Type.Record(Type.String(), Type.Any(), {
                        description: "Filter by metadata fields (e.g., { parent_agent_id: 'main' })",
                    }),
                ),
            }),
            async execute(
                _toolCallId: string,
                params: {
                    query: string;
                    limit?: number;
                    agent_id?: string;
                    session_id?: string;
                    memory_type?: string;
                    min_confidence?: number;
                    days_ago?: number;
                    current_session?: boolean;
                    scope?: "global" | "agent" | "team";
                    metadata?: Record<string, any>;
                },
            ) {
                const limit = params.limit ?? 5;
                const sessionKey = getSessionKey?.();
                const ctx = getContext?.() || {};

                log.debugRequest("search", {
                    query: params.query,
                    scope: params.scope,
                    agentId: ctx.agentId
                });

                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                // Build search options
                const searchOpts: any = {
                    limit,
                    userId: ctx.userId, // Default to current user
                    min_confidence: params.min_confidence,
                    memory_type: params.memory_type,
                };

                // For subagents, use subagentId as the effective agent
                const effectiveAgentId = ctx.subagentId || ctx.agentId;

                // Priority: explicit params > scope > default
                // 1. Explicit agent_id/session_id params override everything
                if (params.agent_id) {
                    searchOpts.agentId = params.agent_id;
                } else if (params.scope === "agent" && effectiveAgentId) {
                    // 2. Scope-based filtering
                    searchOpts.agentId = effectiveAgentId;
                } else if (params.scope === "team" && ctx.teamId) {
                    searchOpts.teamId = ctx.teamId;
                }
                // 3. global scope = no agent filter (default)

                // Session filtering: explicit param > current_session flag
                if (params.session_id) {
                    searchOpts.sessionId = params.session_id;
                } else if (params.current_session && sessionKey) {
                    searchOpts.sessionId = sessionKey;
                }

                // Metadata filtering (passed directly to SDK)
                if (params.metadata && Object.keys(params.metadata).length > 0) {
                    searchOpts.metadata = params.metadata;
                }

                // Apply Time Filter (handled via generic params if needed, or client-side filtering)
                // improved SDK might support start_date, but for now we can rely on natural language query 
                // or pass it if backend supports it. The backend supports start_date.
                if (params.days_ago) {
                    const date = new Date();
                    date.setDate(date.getDate() - params.days_ago);
                    searchOpts.start_date = date.toISOString();
                }

                try {
                    const results = await client.search(params.query, searchOpts);

                    if (results.count === 0) {
                        return {
                            content: [
                                { type: "text" as const, text: "No relevant memories found." },
                            ],
                        };
                    }

                    const text = results.results
                        .map((r, i) => {
                            const type = r.memory_type ? ` [${r.memory_type}]` : "";
                            const conf = r.confidence
                                ? ` (${(r.confidence * 100).toFixed(0)}%)`
                                : "";
                            // Full ISO timestamp for temporal reasoning (e.g., 2024-06-03T14:30:00Z)
                            const timestamp = r.created_at ? ` [${r.created_at}]` : "";
                            return `${i + 1}. ${r.content}${type}${conf}${timestamp}`;
                        })
                        .join("\n");

                    log.debugResponse("search", { count: results.count });

                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Found ${results.count} memories:\n\n${text}`,
                            },
                        ],
                        details: {
                            count: results.count,
                            mode: results.mode,
                            memories: results.results.map((r) => ({
                                id: r.id,
                                content: r.content,
                                memory_type: r.memory_type,
                                confidence: r.confidence,
                                created_at: r.created_at,
                                metadata: r.metadata,
                            })),
                        },
                    };
                } catch (error: any) {
                    log.error("search failed", error);
                    return {
                        content: [{ type: "text", text: `Search failed: ${error.message}` }],
                        isError: true,
                    };
                }
            },
        },
        { name: "memorystack_search" },
    );
}
