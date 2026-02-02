import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

const MAX_CONTEXT_CHARS = 2000;

interface MemoryResult {
    content: string;
    memory_type?: string;
    confidence?: number;
    created_at?: string;
}

function formatGroupedMemories(memories: MemoryResult[]): string {
    // Group by memory type
    const groups: Record<string, MemoryResult[]> = {};
    const ungrouped: MemoryResult[] = [];

    for (const m of memories) {
        const type = m.memory_type || "other";
        if (type === "other") {
            ungrouped.push(m);
        } else {
            groups[type] = groups[type] || [];
            groups[type].push(m);
        }
    }

    const sections: string[] = [];
    const typeLabels: Record<string, string> = {
        fact: "📋 Facts",
        preference: "💜 Preferences",
        episode: "📅 Recent Context",
        procedure: "🔧 Procedures",
        belief: "💭 Beliefs",
    };

    // Format grouped memories
    for (const [type, items] of Object.entries(groups)) {
        const label = typeLabels[type] || type.charAt(0).toUpperCase() + type.slice(1);
        const lines = items.map((m) => {
            const conf = m.confidence && m.confidence >= 0.8 ? ` (${Math.round(m.confidence * 100)}%)` : "";
            return `- ${m.content}${conf}`;
        });
        sections.push(`## ${label}\n${lines.join("\n")}`);
    }

    // Add ungrouped at end
    if (ungrouped.length > 0) {
        const lines = ungrouped.map((m) => `- ${m.content}`);
        sections.push(`## Other\n${lines.join("\n")}`);
    }

    return sections.join("\n\n");
}

export function buildRecallHandler(cfg: MemorystackConfig) {
    return async (event: Record<string, unknown>) => {
        const prompt = event.prompt as string | undefined;
        if (!prompt || prompt.length < 10) return;

        log.debug(`recalling for prompt (${prompt.length} chars)`);

        try {
            const client = new MemoryStackClient({
                apiKey: cfg.apiKey,
                baseUrl: cfg.baseUrl,
                enableLogging: cfg.debug,
            });

            const results = await client.search(prompt, {
                limit: cfg.maxRecallResults,
            });

            if (results.count === 0) {
                log.debug("no memories to inject");
                return;
            }

            const formattedMemories = formatGroupedMemories(results.results);

            // Truncate if too long
            const truncated = formattedMemories.length > MAX_CONTEXT_CHARS
                ? formattedMemories.slice(0, MAX_CONTEXT_CHARS) + "\n...(truncated)"
                : formattedMemories;

            const context = `<memorystack-context>
The following is recalled context about the user. Reference it only when relevant.

${truncated}

Use these memories naturally when relevant — including indirect connections — but don't force them into every response or make assumptions beyond what's stated.
</memorystack-context>`;

            log.debug(`injecting ${results.count} memories (${context.length} chars)`);

            return { prependContext: context };
        } catch (err) {
            log.error("recall failed", err);
            return;
        }
    };
}

