"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
// 连接的全局状态
const connections = new Map();
const messageQueues = new Map();
// 全局运行时引用
let core;
// 防御性解析的辅助函数
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function readString(record, key) {
    if (!record) {
        return undefined;
    }
    const value = record[key];
    return typeof value === "string" ? value : undefined;
}
const channelPlugin = {
    id: "we-xcx",
    meta: {
        description: "通过全双工 WebSocket 连接到 WE XCX 聊天服务",
    },
    capabilities: {
        chatTypes: ["direct"],
        media: false,
        reactions: false,
        threads: false,
    },
    // 正确的 configSchema 结构
    configSchema: {
        schema: {
            apiKey: { type: "string", description: "API Key", sensitive: true },
            apiEndpoint: { type: "string", description: "API Endpoint", default: "localhost:8080" },
            useTls: { type: "boolean", description: "Use TLS/SSL", default: false }
        },
        uiHints: {
            apiKey: { label: "API Key" },
            apiEndpoint: { label: "API Endpoint" },
            useTls: { label: "Use TLS" }
        }
    },
    config: {
        listAccountIds: (cfg) => {
            // 检查是否在 plugins.entries.we-xcx 中配置
            // 配置结构是 cfg.plugins.entries['we-xcx']
            const entry = cfg.plugins?.entries?.['we-xcx'];
            if (entry && (entry.enabled === undefined || entry.enabled)) {
                return ["default"];
            }
            return [];
        },
        resolveAccount: (cfg, accountId) => {
            // 返回配置对象
            const entry = cfg.plugins?.entries?.['we-xcx'];
            return entry?.config || {};
        },
        describeAccount: (account) => {
            return { accountId: "default", id: "default", name: "WE XCX 默认账户" };
        }
    },
    gateway: {
        startAccount: async (ctx) => {
            const config = ctx.account;
            // 如果可用，使用全局核心运行时，否则回退到 ctx.runtime（功能有限）
            // 注意：ctx.runtime 通常没有 'ingest' 或 'channel'。
            const runtime = ctx.runtime;
            const logger = runtime.logging && runtime.logging.getChildLogger
                ? runtime.logging.getChildLogger({ module: "we-xcx" })
                : {
                    info: console.log,
                    warn: console.warn,
                    error: console.error,
                    debug: console.debug
                };
            if (!core) {
                logger.error("[WE XCX] 插件运行时未初始化。Register 函数未被调用？");
            }
            if (!config.apiKey || !config.apiEndpoint) {
                logger.warn("[WE XCX] 配置中缺少 apiKey 或 apiEndpoint。跳过连接。");
                return;
            }
            const protocol = config.useTls ? "wss" : "ws";
            // 确保 apiEndpoint 不包含协议
            const endpoint = (config.apiEndpoint || "").replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
            const wsUrl = `${protocol}://${endpoint}/v1/stream?apiKey=${config.apiKey}`;
            logger.info(`[WE XCX] 正在连接到 ${wsUrl}...`);
            // 如果存在则关闭现有连接
            if (connections.has("default")) {
                connections.get("default")?.terminate();
            }
            const ws = new ws_1.default(wsUrl);
            connections.set("default", ws);
            if (!messageQueues.has("default")) {
                messageQueues.set("default", []);
            }
            ws.on("open", () => {
                logger.info("[WE XCX] 已连接！");
                // 发送排队的消息
                const queue = messageQueues.get("default") || [];
                while (queue.length > 0) {
                    const msg = queue.shift();
                    if (msg)
                        ws.send(msg);
                }
            });
            ws.on("message", async (data) => {
                try {
                    const str = data.toString();
                    logger.info(`[WE XCX] 收到消息: ${str}`); // 记录原始消息以进行调试
                    let msg;
                    try {
                        msg = JSON.parse(str);
                    }
                    catch (e) {
                        logger.warn(`[WE XCX] JSON 解析失败: ${str}`);
                        return;
                    }
                    const payload = asRecord(msg);
                    if (!payload)
                        return;
                    const type = readString(payload, "type");
                    const msgData = asRecord(payload["data"]);
                    if (type === "message" && msgData) {
                        const text = readString(msgData, "text") || "";
                        const userId = readString(msgData, "userId") || "unknown";
                        const conversationId = readString(msgData, "conversationId") || "default"; // 获取 conversationId
                        const msgId = readString(msgData, "id") || `we-xcx-${Date.now()}`;
                        if (text && core) {
                            // 使用核心运行时分发消息
                            const cfg = core.config.loadConfig();
                            // 解析路由 (代理)
                            const route = core.channel.routing.resolveAgentRoute({
                                cfg,
                                channel: "we-xcx",
                                peer: { kind: "dm", id: userId }
                            });
                            logger.info(`[WE XCX] 解析路由: agentId=${route.agentId}, sessionKey=${route.sessionKey}`);
                            // 构建上下文
                            const ctxPayload = core.channel.reply.finalizeInboundContext({
                                Body: text,
                                RawBody: text,
                                CommandBody: text,
                                From: `we-xcx:${userId}`,
                                To: "we-xcx:bot",
                                SessionKey: route.sessionKey,
                                AccountId: "default",
                                ChatType: "direct",
                                ConversationLabel: conversationId, // 使用 conversationId 作为会话标签
                                SenderName: userId,
                                SenderId: userId,
                                Provider: "we-xcx",
                                Surface: "we-xcx",
                                MessageSid: msgId,
                                Timestamp: Date.now(),
                                CommandSource: "text",
                                OriginatingChannel: "we-xcx",
                                OriginatingTo: "we-xcx:bot"
                            });
                            // 创建分发器
                            const { dispatcher } = core.channel.reply.createReplyDispatcherWithTyping({
                                responsePrefix: "",
                                responsePrefixContextProvider: () => ({ prefix: "" }),
                                humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
                                deliver: async (replyPayload) => {
                                    logger.info(`[WE XCX] 正在投递回复: ${JSON.stringify(replyPayload)}`);
                                    const replyText = replyPayload.text || "";
                                    if (ws.readyState === ws_1.default.OPEN) {
                                        const payload = JSON.stringify({
                                            type: "message",
                                            data: {
                                                text: replyText,
                                                recipientId: userId,
                                                conversationId: conversationId // 回传 conversationId
                                            }
                                        });
                                        logger.info(`[WE XCX] 发送 WebSocket 载荷: ${payload}`);
                                        ws.send(payload);
                                    }
                                    else {
                                        logger.warn(`[WE XCX] WebSocket 未打开 (状态: ${ws.readyState})，无法发送回复`);
                                    }
                                },
                                onError: (err, info) => {
                                    logger.error(`[WE XCX] 回复错误: ${err}`);
                                }
                            });
                            // 分发
                            await core.channel.reply.dispatchReplyFromConfig({
                                ctx: ctxPayload,
                                cfg,
                                dispatcher
                            });
                        }
                        else if (!text) {
                            logger.warn("[WE XCX] 收到没有文本内容的消息");
                        }
                        else if (!core) {
                            logger.error("[WE XCX] 核心运行时不可用，无法处理消息");
                        }
                    }
                }
                catch (e) {
                    logger.error(`[WE XCX] 处理消息时出错: ${e}`);
                }
            });
            ws.on("error", (err) => {
                logger.error(`[WE XCX] WebSocket 错误: ${err}`);
            });
            ws.on("close", () => {
                logger.info("[WE XCX] 已断开连接");
                connections.delete("default");
            });
        }
    }
};
const plugin = {
    id: "we-xcx",
    name: "WE XCX",
    description: "WE XCX 通道插件",
    configSchema: {},
    register(api) {
        core = api.runtime;
        api.registerChannel({ plugin: channelPlugin });
    }
};
exports.default = plugin;
