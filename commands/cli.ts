import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { MemoryStackClient } from "@memorystack/sdk";
import type { MemorystackConfig } from "../config.ts";
import { log } from "../logger.ts";

export function registerCliCommands(
    api: OpenClawPluginApi,
    cfg: MemorystackConfig,
): void {
    api.registerCli(
        // biome-ignore lint/suspicious/noExplicitAny: clawdbot SDK does not ship types
        ({ program }: { program: any }) => {
            const cmd = program
                .command("memorystack")
                .description("MemoryStack long-term memory commands");

            // openclaw memorystack search <query>
            cmd
                .command("search")
                .argument("<query>", "Search query")
                .option("--limit <n>", "Max results", "5")
                .option("--type <type>", "Filter by memory type (fact, preference, episode)")
                .action(async (query: string, opts: { limit: string; type?: string }) => {
                    const limit = Number.parseInt(opts.limit, 10) || 5;
                    log.debug(`cli search: query="${query}" limit=${limit}`);

                    try {
                        const client = new MemoryStackClient({
                            apiKey: cfg.apiKey,
                            baseUrl: cfg.baseUrl,
                            enableLogging: cfg.debug,
                        });

                        const results = await client.search(query, {
                            limit,
                            memory_type: opts.type,
                        });

                        if (results.count === 0) {
                            console.log("No memories found.");
                            return;
                        }

                        console.log(`Found ${results.count} memories:\n`);
                        for (const r of results.results) {
                            const conf = r.confidence
                                ? ` (${(r.confidence * 100).toFixed(0)}%)`
                                : "";
                            const type = r.memory_type ? ` [${r.memory_type}]` : "";
                            console.log(`- ${r.content}${type}${conf}`);
                        }
                    } catch (err) {
                        console.error("Search failed:", err);
                    }
                });

            // openclaw memorystack stats
            cmd
                .command("stats")
                .description("View usage statistics")
                .action(async () => {
                    log.debug("cli stats");

                    try {
                        const client = new MemoryStackClient({
                            apiKey: cfg.apiKey,
                            baseUrl: cfg.baseUrl,
                            enableLogging: cfg.debug,
                        });

                        const stats = await client.getStats();

                        console.log("\n📊 MemoryStack Statistics\n");
                        console.log(`Total Memories:      ${stats.totals.total_memories}`);
                        console.log(`Total API Calls:     ${stats.totals.total_api_calls}`);
                        console.log(`This Month's Calls:  ${stats.usage.current_month_api_calls}/${stats.usage.monthly_api_limit}`);
                        console.log(`Plan:                ${stats.plan_tier || "Free"}`);
                    } catch (err) {
                        console.error("Failed to get stats:", err);
                    }
                });

            // openclaw memorystack add <text>
            cmd
                .command("add")
                .argument("<text>", "Text to save as memory")
                .option("--type <type>", "Memory type (fact, preference, episode)")
                .action(async (text: string, opts: { type?: string }) => {
                    log.debug(`cli add: "${text.slice(0, 50)}"`);

                    try {
                        const client = new MemoryStackClient({
                            apiKey: cfg.apiKey,
                            baseUrl: cfg.baseUrl,
                            enableLogging: cfg.debug,
                        });

                        await client.add(text, {
                            metadata: {
                                source: "openclaw_cli",
                                memory_type: opts.type,
                            },
                        });

                        console.log(`✓ Saved: "${text.length > 60 ? text.slice(0, 60) + "…" : text}"`);
                    } catch (err) {
                        console.error("Failed to add memory:", err);
                    }
                });

            // openclaw memorystack deleteall (destructive!)
            cmd
                .command("deleteall")
                .description("Delete ALL your memories (destructive, requires confirmation)")
                .action(async () => {
                    const readline = await import("node:readline");
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout,
                    });

                    const answer = await new Promise<string>((resolve) => {
                        rl.question(
                            "⚠️  This will permanently delete ALL your memories. Type 'yes' to confirm: ",
                            resolve,
                        );
                    });
                    rl.close();

                    if (answer.trim().toLowerCase() !== "yes") {
                        console.log("Aborted.");
                        return;
                    }

                    log.debug("cli wipe: confirmed");

                    try {
                        const client = new MemoryStackClient({
                            apiKey: cfg.apiKey,
                            baseUrl: cfg.baseUrl,
                            enableLogging: cfg.debug,
                        });

                        // List all memories first, then delete them
                        const memories = await client.listMemories({ limit: 1000 });
                        if (memories.count === 0) {
                            console.log("No memories to delete.");
                            return;
                        }

                        const memoryIds = memories.results.map(m => m.id);
                        const result = await client.deleteMemories(memoryIds, true);
                        console.log(`Wiped ${result.deleted_count} memories.`);
                    } catch (err) {
                        console.error("Failed to wipe memories:", err);
                    }
                });
        },
        { commands: ["memorystack"] },
    );
}
