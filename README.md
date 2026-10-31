# n8n-nodes-nvidianim

An independent community node package for [n8n](https://n8n.io/) providing native integration with **NVIDIA NIM** (NVIDIA Inference Microservice) hosted models and inference APIs.

> **Disclaimer:** This is an independent open-source community integration maintained by the community and is not an official product of NVIDIA Corporation. All product names, logos, and brands (including NVIDIA and NIM) are property of their respective owners.

---

## Features

This package provides two complementary node types for n8n workflows:

### 1. Nvidia NIM (Action Node)
The primary node for structured workflows, data pipelines, and automation:

- **Text:**
  - **Message a Model:** OpenAI-compatible Chat Completions (`POST /chat/completions`) supporting simple prompt and multi-turn chat message history, system instructions, temperature, top_p, and raw/simplified output modes.
  - **Generate Text:** Legacy text completion (`POST /completions`) for text completion models.
- **Vision:**
  - **Analyze an Image:** Multimodal vision chat completion accepting remote URLs, n8n binary inputs, or base64 strings with automatic MIME validation.
- **Embedding:**
  - **Generate Embeddings:** Vector embeddings generation (`POST /embeddings`) supporting single strings and batches, input type annotation (`passage` / `query` for NeMo Retriever), and strict ordering preservation.
- **Model:**
  - **List Models:** Dynamic fetching and pagination of available hosted models and metadata (`GET /models`).
- **Custom API:**
  - **Make a Custom API Call:** Direct authenticated HTTP requests (GET, POST, PUT, DELETE, PATCH) to any NVIDIA NIM hosted endpoint with automated Bearer auth, path traversal protection, and secret sanitization.

### 2. Nvidia NIM Chat Model (AI Agent Sub-Node)
A sub-node for n8n's Advanced AI Agent and LangChain ecosystem:

- Connects directly to the **AI Agent** (`ai_languageModel` connection).
- Powered by `@n8n/ai-node-sdk` with full streaming support.
- **Dynamic Model Selection:** Automatically populates available models from `GET /models` with curated offline fallbacks.
- **Custom Model Override:** Enter unlisted or private NIM model IDs directly in Options.
- **Configurable Parameters:** Temperature, Maximum Output Tokens, Top-P, Frequency Penalty, Presence Penalty, Streaming toggle, Timeout, and Max Retries.

---

## Installation

### In n8n Community Nodes Panel (Recommended)
1. In your n8n instance, go to **Settings > Community Nodes**.
2. Click **Install a community node**.
3. Enter `n8n-nodes-nvidianim` and accept the risks.
4. Click **Install**.

### For Docker or Self-Hosted npm
In your custom n8n Dockerfile or environment:
```bash
npm install n8n-nodes-nvidianim
```

---

## Credentials Setup

1. Obtain an API key from the [NVIDIA API Catalog](https://build.nvidia.com/explore/discover).
2. In n8n, create a new credential of type **Nvidia NIM API**.
3. Enter your API key (typically starts with `nvapi-...`).
4. Click **Save** — n8n automatically tests the credential against the `/models` health endpoint.

---

## Security & Reliability

- **Secret Redaction:** Built-in sanitizer redacts `Bearer` tokens and `nvapi-*` keys from all errors, logs, and stack traces.
- **Host Restriction:** API transport strictly targets `integrate.api.nvidia.com` and protects against path traversal and double `/v1` prefixes.
- **Paired Items:** Fully adheres to n8n paired-item data contract for flawless item-level error reporting and tracing.

---

## License

[MIT](LICENSE.md)