# MemoryStack Plugin for OpenClaw

Long-term memory for OpenClaw agents. Automatically remembers conversations, recalls relevant context, and builds a persistent user profile — all powered by [MemoryStack](https://memorystack.app).

> **✨ Requires a MemoryStack Account** - Get your API key at [memorystack.app](https://memorystack.app).

## Install

```bash
openclaw plugins install @memorystack/openclaw-memorystack
```

Restart OpenClaw after installing.

## Configuration

The only required value is your MemoryStack API key.

Set it as an environment variable:

```bash
export MEMORYSTACK_API_KEY="mem_live_..."
```

Or configure it directly in `openclaw.json` (usually `~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "slots": {
      "memory": "openclaw-memorystack"
    },
    "entries": {
      "openclaw-memorystack": {
        "enabled": true,
        "config": {
          "apiKey": "mem_live_..."
        }
      }
    }
  }
}
```

### Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `apiKey` | `string` | **Required** | Your MemoryStack API key. |
| `baseUrl` | `string` | `https://memorystack.app` | API endpoint URL (for self-hosted). |
| `autoRecall` | `boolean` | `true` | Inject relevant memories before every AI turn. |
| `autoCapture` | `boolean` | `true` | Automatically store conversation content after every turn. |
| `maxRecallResults` | `number` | `5` | Max memories injected into context per turn. |
| `debug` | `boolean` | `false` | Verbose debug logs for API calls and responses. |

## How it works

Once installed, the plugin works automatically with zero interaction:

- **Auto-Recall** — Before every AI turn, the plugin queries MemoryStack for relevant memories (facts, preferences, past conversations) and injects them as context using the `memory` slot.
- **Auto-Capture** — After every AI turn, the last user/assistant exchange is sent to MemoryStack for extraction and long-term storage.

All memories are automatically scoped to the current:
- **User ID** (`end_user_id`)
- **Agent ID** (`agent_id`)
- **Session ID** (`session_id`)

## Slash Commands

You can interact with memory directly from the chat:

```bash
/memorystack search <query>    # Search memories
/memorystack add <content>     # Manually add a memory
/memorystack stats             # View memory usage statistics
/memorystack reflect           # Generate insights from recent memories
/memorystack consolidate       # Merge duplicate memories
```

## AI Tools

The agent can use these tools autonomously:

- `memorystack_search` - Search for information
- `memorystack_add_memory` - Explicitly store important information
- `memorystack_forget` - Remove incorrect or outdated memories

## Troubleshooting

**Memories not saving?**
- Check if `autoCapture` is enabled (default: true).
- Verify your API key is correct.
- Enable `debug: true` in config to see API errors.

**Context not appearing?**
- Check if `autoRecall` is enabled (default: true).
- Run `/memorystack search <query>` to verify retrieval works.
