import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { parseConfig, memorystackConfigSchema } from "./config.ts";
import { initLogger } from "./logger.ts";
import { registerSearchTool } from "./tools/search.ts";
import { registerAddTool } from "./tools/add.ts";
import { registerStatsTool } from "./tools/stats.ts";
import { registerDeleteTool } from "./tools/delete.ts";
import { registerReflectTool } from "./tools/reflect.ts";
import { registerConsolidateTool } from "./tools/consolidate.ts";
import { buildRecallHandler } from "./hooks/recall.ts";
import { buildCaptureHandler } from "./hooks/capture.ts";
import { registerSlashCommands } from "./commands/slash.ts";
import { registerCliCommands } from "./commands/cli.ts";

// Helper to properly parse Moltbot session keys
// Format: "agent:{agentId}:{rest}" where rest may be "subagent:{uuid}" or "main" etc.
function parseSessionKey(sessionKey: string | undefined | null): {
    agentId: string;
    subagentId: string | null;
    sessionId: string;
} {
    const DEFAULT_AGENT = "main";
    if (!sessionKey) return { agentId: DEFAULT_AGENT, subagentId: null, sessionId: "" };

    const parts = sessionKey.split(":");
    if (parts.length < 3 || parts[0] !== "agent") {
        // Not a standard agent session key, return as-is
        return { agentId: DEFAULT_AGENT, subagentId: null, sessionId: sessionKey };
    }

    const agentId = parts[1] || DEFAULT_AGENT;
    const rest = parts.slice(2).join(":");

    // Check if this is a subagent session
    let subagentId: string | null = null;
    if (rest.toLowerCase().startsWith("subagent:")) {
        subagentId = rest.slice("subagent:".length);
    }

    return { agentId, subagentId, sessionId: sessionKey };
}

export default {
    id: "openclaw-memorystack",
    name: "MemoryStack",
    description: "OpenClaw powered by MemoryStack plugin",
    kind: "memory" as const,
    configSchema: memorystackConfigSchema,

    register(api: OpenClawPluginApi) {
        const cfg = parseConfig(api.pluginConfig);

        if (!cfg.apiKey) {
            api.logger.error("memorystack: API key is required. Set MEMORYSTACK_API_KEY or configure in plugin config.");
            return;
        }

        initLogger(api.logger, cfg.debug);

        // Context tracking
        let currentContext: Record<string, any> = {};
        const getContext = () => currentContext;
        const getSessionKey = () => currentContext.sessionKey;

        // Register tools
        registerSearchTool(api, cfg, getSessionKey, getContext);
        registerAddTool(api, cfg, getSessionKey, getContext);
        registerStatsTool(api, cfg);
        registerDeleteTool(api, cfg);
        registerReflectTool(api, cfg);
        registerConsolidateTool(api, cfg);

        // ALWAYS capture context on before_agent_start (regardless of autoRecall setting)
        // This ensures tools like memorystack_add have access to agentId, subagentId, etc.
        const recallHandler = cfg.autoRecall ? buildRecallHandler(cfg, getSessionKey) : null;

        api.on("before_agent_start", (event: Record<string, unknown>, ctx: Record<string, unknown>) => {
            if (ctx) {
                currentContext = { ...ctx };

                // Parse session key to extract proper IDs
                // Moltbot passes agentId incorrectly as "agent" (the literal prefix)
                // We need to parse the sessionKey to get the actual agentId
                const parsed = parseSessionKey(currentContext.sessionKey as string);

                // Use parsed agentId, overriding the incorrect ctx.agentId
                if (!currentContext.agentId || currentContext.agentId === "agent") {
                    currentContext.agentId = parsed.agentId;
                }

                // Track subagent ID separately if present (for scoped searches)
                if (parsed.subagentId) {
                    currentContext.subagentId = parsed.subagentId;
                }

                // Normalize other commonly used fields
                if (!currentContext.userId && currentContext.SenderId) currentContext.userId = currentContext.SenderId;

                // Map group context to MemoryStack scoping
                if (currentContext.groupId) currentContext.teamId = currentContext.groupId;
                if (currentContext.groupChannel) currentContext.conversationId = currentContext.groupChannel;
                // Fallback for conversation ID from session key if no group channel
                if (!currentContext.conversationId && getSessionKey()) currentContext.conversationId = getSessionKey();
            }

            // Only run recall if autoRecall is enabled
            if (recallHandler) {
                return recallHandler(event);
            }
        });

        // Auto-capture hook
        if (cfg.autoCapture) {
            const captureHandler = buildCaptureHandler(cfg, getSessionKey, getContext);
            api.on("agent_end", (event: Record<string, unknown>) => {
                return captureHandler(event);
            });
        }

        // Register slash commands (/add, /search, /stats)
        registerSlashCommands(api, cfg, getSessionKey, getContext);

        // Register CLI commands (memorystack search, stats, add, wipe)
        registerCliCommands(api, cfg);

        // Register service
        api.registerService({
            id: "clawdbot-memorystack",
            start: () => {
                api.logger.info("memorystack: connected");
            },
            stop: () => {
                api.logger.info("memorystack: stopped");
            },
        });
    },
};
