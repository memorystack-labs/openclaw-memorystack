import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

function getLastTurn(messages: unknown[]): unknown[] {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (
            msg &&
            typeof msg === "object" &&
            (msg as Record<string, unknown>).role === "user"
        ) {
            lastUserIdx = i;
            break;
        }
    }
    return lastUserIdx >= 0 ? messages.slice(lastUserIdx) : messages;
}

export function buildCaptureHandler(
    cfg: MemorystackConfig,
    getSessionKey?: () => string | undefined,
    getContext?: () => Record<string, any>,
) {
    return async (event: Record<string, unknown>) => {
        if (
            !event.success ||
            !Array.isArray(event.messages) ||
            event.messages.length === 0
        )
            return;

        const lastTurn = getLastTurn(event.messages);

        const texts: string[] = [];
        for (const msg of lastTurn) {
            if (!msg || typeof msg !== "object") continue;
            const msgObj = msg as Record<string, unknown>;
            const role = msgObj.role;
            if (role !== "user" && role !== "assistant") continue;

            const content = msgObj.content;

            const parts: string[] = [];

            if (typeof content === "string") {
                parts.push(content);
            } else if (Array.isArray(content)) {
                for (const block of content) {
                    if (!block || typeof block !== "object") continue;
                    const b = block as Record<string, unknown>;
                    if (b.type === "text" && typeof b.text === "string") {
                        parts.push(b.text);
                    }
                }
            }

            if (parts.length > 0) {
                texts.push(`[role: ${role}]\n${parts.join("\n")}\n[${role}:end]`);
            }
        }

        // Filter out injected context and short messages
        const captured = texts
            .map((t) =>
                t
                    .replace(
                        /<memorystack-context>[\s\S]*?<\/memorystack-context>\s*/g,
                        "",
                    )
                    .trim(),
            )
            .filter((t) => t.length >= 10 && t.length <= 500);

        if (captured.length === 0) return;

        const content = captured.join("\n\n");
        const sessionKey = getSessionKey?.();
        const ctx = getContext?.() || {};

        log.debug(
            `capturing ${captured.length} texts (${content.length} chars)`,
        );

        try {
            const client = new MemoryStackClient({
                apiKey: cfg.apiKey,
                baseUrl: cfg.baseUrl,
                enableLogging: cfg.debug,
            });

            // Prepare metadata from context
            const metadata: Record<string, any> = {
                source: "clawdbot_auto_capture",
                session_id: sessionKey,
                timestamp: new Date().toISOString(),
                user_id: ctx.userId,
                agent_id: ctx.agentId,
                provider: ctx.Provider,
                model: ctx.Model,
                sender_name: ctx.SenderName,
            };

            // Remove undefined values
            Object.keys(metadata).forEach(key => metadata[key] === undefined && delete metadata[key]);

            await client.add(content, {
                sessionId: sessionKey,
                agentId: ctx.agentId,
                userId: ctx.userId,
                teamId: ctx.teamId,
                conversationId: ctx.conversationId,
                metadata: metadata,
            });

            log.debug(`captured ${captured.length} messages successfully`);
        } catch (err) {
            log.error("capture failed", err);
        }
    };
}
