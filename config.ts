import { Type } from "@sinclair/typebox";

export const memorystackConfigSchema = Type.Object({
    apiKey: Type.String(),
    baseUrl: Type.Optional(Type.String()),
    autoRecall: Type.Optional(Type.Boolean()),
    autoCapture: Type.Optional(Type.Boolean()),
    maxRecallResults: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    debug: Type.Optional(Type.Boolean()),
});

export type MemorystackConfig = {
    apiKey: string;
    baseUrl: string;
    autoRecall: boolean;
    autoCapture: boolean;
    maxRecallResults: number;
    debug: boolean;
};

export function parseConfig(rawConfig: unknown): MemorystackConfig {
    const cfg = rawConfig as Partial<MemorystackConfig>;

    return {
        apiKey: cfg.apiKey || process.env.MEMORYSTACK_API_KEY || "",
        baseUrl: cfg.baseUrl || "https://memorystack.app",
        autoRecall: cfg.autoRecall ?? true,
        autoCapture: cfg.autoCapture ?? true,
        maxRecallResults: cfg.maxRecallResults ?? 5,
        debug: cfg.debug ?? false,
    };
}
