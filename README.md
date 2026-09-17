# openai-mock-worker

OpenAI 兼容的 Mock API，部署在 Cloudflare Workers 上。所有响应都是 mock 数据，**不调用真实模型**。直接用官方 OpenAI SDK 指向它即可测试你的集成。

## 支持的接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/v1/models` | 模型列表（gpt-5 / gpt-4.1 / gpt-4o / o3 / embedding 等 10 个） |
| GET | `/v1/models/{id}` | 模型详情，不存在返回 404（`model_not_found`） |
| POST | `/v1/chat/completions` | Chat 补全：50 条随机回复池（中英混合、多种 Markdown 格式），支持 `stream`、`tools`（返回 mock `tool_calls`）、`stream_options.include_usage`、`n` |
| POST | `/v1/completions` | 传统文本补全（支持 `stream`） |
| POST | `/v1/embeddings` | 向量：**确定性 mock**（同输入 → 同向量），支持 `dimensions` |

其他特性：

- 路径可省略 `/v1` 前缀（`/chat/completions` 也能访问），方便不同 baseURL 配置
- CORS 全开，可直接在浏览器里调用
- 任意（或无）`Authorization` 头都接受
- 错误响应使用 OpenAI 标准格式 `{"error": {message, type, param, code}}`
- 流式响应为标准 SSE（`data: {...}\n\n` … `data: [DONE]`），逐词输出带 15ms 节奏

## 本地运行

```bash
npm install
npm run dev   # http://localhost:8787
```

## curl 示例

```bash
curl http://localhost:8787/v1/models

curl http://localhost:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"你好"}]}'

# 流式
curl -N http://localhost:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","stream":true,"messages":[{"role":"user","content":"hi"}]}'

# 工具调用（会 mock 返回第一个 tool 的调用参数）
curl http://localhost:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"上海天气"}],
       "tools":[{"type":"function","function":{"name":"get_weather",
       "parameters":{"type":"object","properties":{"location":{"type":"string"}}}}}]}' \

# 向量
curl http://localhost:8787/v1/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"model":"text-embedding-3-small","input":["hello","world"]}'
```

## SDK 接入

```python
# Python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8787/v1", api_key="sk-mock")
```

```js
// Node
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://localhost:8787/v1", apiKey: "sk-mock" });
```

## 部署

```bash
npx wrangler login   # 首次
npm run deploy       # 部署后拿到 https://openai-mock-worker.<account>.workers.dev
```

部署后把 SDK 的 `baseURL` 换成 `https://openai-mock-worker.<account>.workers.dev/v1` 即可。

## 项目结构

```
src/
  index.ts        # 路由 + CORS + 错误兜底
  util.ts         # JSON/SSE 响应、OpenAI 错误格式、id/usage 工具
  mock-data.ts    # 模型列表、mock 回复与 tool 参数生成器
  replies.ts      # 50 条随机回复池
  models.ts       # GET /v1/models[/id]
  chat.ts         # POST /v1/chat/completions
  completions.ts  # POST /v1/completions
  embeddings.ts   # POST /v1/embeddings
```

改完配置（wrangler.jsonc）后记得 `npm run types` 重新生成类型；`npm run check` 做类型检查。
