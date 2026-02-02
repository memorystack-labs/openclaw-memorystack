import type { Logger } from "openclaw/plugin-sdk";

let logger: Logger;
let debugEnabled = false;

export function initLogger(l: Logger, debug: boolean): void {
    logger = l;
    debugEnabled = debug;
}

export const log = {
    info: (msg: string, ...args: unknown[]) => {
        logger?.info(`memorystack: ${msg}`, ...args);
    },
    warn: (msg: string, ...args: unknown[]) => {
        logger?.warn(`memorystack: ${msg}`, ...args);
    },
    error: (msg: string, err?: unknown) => {
        logger?.error(`memorystack: ${msg}`, err);
    },
    debug: (msg: string, data?: unknown) => {
        if (debugEnabled) {
            logger?.debug?.(`memorystack: ${msg}`, data);
        }
    },
    debugRequest: (method: string, params: unknown) => {
        if (debugEnabled) {
            logger?.debug?.(`memorystack → ${method}`, params);
        }
    },
    debugResponse: (method: string, result: unknown) => {
        if (debugEnabled) {
            logger?.debug?.(`memorystack ← ${method}`, result);
        }
    },
};
