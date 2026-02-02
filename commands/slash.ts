import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

export function registerSlashCommands(
    api: OpenClawPluginApi,
    cfg: MemorystackConfig,
    getSessionKey: () => string | undefined,
    getContext: () => Record<string, any>,
): void {
    // /add <text> - Save something to memory
    api.registerCommand({
        name: "add",
        description: "Save something to long-term memory",
        acceptsArgs: true,
        requireAuth: true,
        handler: async (ctx: { args?: string }) => {
            const text = ctx.args?.trim();
            if (!text) {
                return { text: "Usage: /add <text to remember>" };
            }

            log.debug(`/add command: "${text.slice(0, 50)}"`);

            try {
                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                const context = getContext();
                const sessionKey = getSessionKey();
                const effectiveAgentId = context.subagentId || context.agentId || "main";

                await client.add(text, {
                    agentId: effectiveAgentId,
                    sessionId: sessionKey,
                    metadata: {
                        source: "openclaw_command",
                        session_key: sessionKey,
                    },
                });

                const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
                return { text: `✓ Saved to memory: "${preview}"` };
            } catch (err) {
                log.error("/add failed", err);
                return { text: "Failed to save memory. Check logs for details." };
            }
        },
    });

    // /search <query> - Search memories
    api.registerCommand({
        name: "search",
        description: "Search your long-term memories",
        acceptsArgs: true,
        requireAuth: true,
        handler: async (ctx: { args?: string }) => {
            const query = ctx.args?.trim();
            if (!query) {
                return { text: "Usage: /search <search query>" };
            }

            log.debug(`/search command: "${query}"`);

            try {
                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                const results = await client.search(query, { limit: 5 });

                if (results.count === 0) {
                    return { text: `No memories found for: "${query}"` };
                }

                const lines = results.results.map((r, i) => {
                    const conf = r.confidence
                        ? ` (${(r.confidence * 100).toFixed(0)}%)`
                        : "";
                    const type = r.memory_type ? ` [${r.memory_type}]` : "";
                    return `${i + 1}. ${r.content}${type}${conf}`;
                });

                return {
                    text: `Found ${results.count} memories:\n\n${lines.join("\n")}`,
                };
            } catch (err) {
                log.error("/search failed", err);
                return { text: "Failed to search memories. Check logs for details." };
            }
        },
    });

    // /stats - View memory usage statistics
    api.registerCommand({
        name: "stats",
        description: "View your memory usage statistics",
        acceptsArgs: false,
        requireAuth: true,
        handler: async () => {
            log.debug("/stats command");

            try {
                const client = new MemoryStackClient({
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    enableLogging: cfg.debug,
                });

                const stats = await client.getStats();

                return {
                    text: `📊 Memory Statistics\n\n` +
                        `Total Memories: ${stats.totals.total_memories}\n` +
                        `API Calls (this month): ${stats.usage.current_month_api_calls}/${stats.usage.monthly_api_limit}\n` +
                        `Plan: ${stats.plan_tier || "Free"}`,
                };
            } catch (err) {
                log.error("/stats failed", err);
                return { text: "Failed to get stats. Check logs for details." };
            }
        },
    });
}
