"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const axios_1 = __importDefault(require("axios"));
// 连接的全局状态
const connections = new Map();
const messageQueues = new Map();
// 重连相关状态
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1秒
const MAX_RECONNECT_DELAY = 30000; // 30秒
// 保存当前配置供重连使用
let currentConfig = null;
let currentLogger = null;
let currentCtx = null;
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
//上传
async function uploadMedia(serverUrl, mediaUrl, workspacePath, log) {
    if (!serverUrl || !mediaUrl) {
        log?.error?.('[WE XCX] uploadMedia requires serverUrl and mediaUrl to be provided.');
        return null;
    }
    try {
        const fs = await import('fs');
        const path = await import('path');
        const filePath = mediaUrl;
        if (!fs.existsSync(filePath)) {
            log?.error?.(`[WE XCX] File not found: ${filePath}`);
            return null;
        }
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        log?.debug?.(`[WE XCX] Uploading file: ${fileName}, extension: ${ext}, size: ${fileBuffer.length}`);
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('file', fileBuffer, {
            filename: fileName,
            contentType: 'application/octet-stream'
        });
        const response = await axios_1.default.post(`${serverUrl}/upload/file`, form, {
            headers: {
                ...form.getHeaders()
            }
        });
        log?.debug?.(`[WE XCX] Upload response: ${JSON.stringify(response.data)}`);
        return response.data.file_id || null;
    }
    catch (err) {
        log?.error?.(`[WE XCX] Failed to upload media: ${err.message}`);
        if (err.response) {
            log?.error?.(`[WE XCX] Response status: ${err.response.status}, data: ${JSON.stringify(err.response.data)}`);
        }
        return null;
    }
}
async function downloadMedia(serverUrl, filePath, workspacePath, log) {
    if (!serverUrl || !filePath) {
        log?.error?.('[WE XCX] downloadMedia requires serverUrl and filePath to be provided.');
        return null;
    }
    try {
        const normalizedServerUrl = serverUrl.replace(/\/$/, '');
        const downloadUrl = `${normalizedServerUrl}/download/file?file_path=${encodeURIComponent(filePath)}`;
        log?.debug?.(`[WE XCX] Downloading media from: ${downloadUrl}`);
        const response = await axios_1.default.get(downloadUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        const buffer = Buffer.from(response.data);
        const path = await import('path');
        const fs = await import('fs');
        const mediaDir = path.join(__dirname, 'media', 'inbound');
        fs.mkdirSync(mediaDir, { recursive: true });
        const contentDisposition = response.headers['content-disposition'] || '';
        const originalNameMatch = contentDisposition.match(/filename[^;=\n]*=(?:(\\?['"])(.*?)\1|([^;=\n]*))/i);
        const originalName = originalNameMatch ? originalNameMatch[2] || originalNameMatch[3] : '';
        let filename;
        if (originalName) {
            filename = `${Date.now()}_${originalName}`;
        }
        else {
            const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
            filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        }
        currentLogger.debug(`文件名: ${filename}`);
        const mediaPath = path.join(mediaDir, filename);
        currentLogger.debug(`文件路径: ${mediaPath}`);
        fs.writeFileSync(mediaPath, buffer);
        log?.debug?.(`[WE XCX] Media saved to workspace: ${mediaPath}`);
        return { path: mediaPath, mimeType: contentType, originalName };
    }
    catch (err) {
        if (log?.error) {
            log.error(`[WE XCX] Failed to download media: ${err.message}`);
        }
        return null;
    }
}
const channelPlugin = {
    id: "we-xcx",
    meta: {
        description: "通过全双工 WebSocket 连接到 WE XCX 聊天服务",
    },
    capabilities: {
        chatTypes: ["direct"],
        media: true,
        reactions: false,
        threads: false,
    },
    // 正确的 configSchema 结构
    configSchema: {
        schema: {
            apiKey: { type: "string", description: "API Key", sensitive: true },
            apiEndpoint: { type: "string", description: "API Endpoint", default: "localhost:8080" },
            useTls: { type: "boolean", description: "Use TLS/SSL", default: false },
            serverUrl: { type: "string", description: "Server URL for file download", default: "http://localhost:8080" }
        },
        uiHints: {
            apiKey: { label: "API Key" },
            apiEndpoint: { label: "API Endpoint" },
            useTls: { label: "Use TLS" },
            serverUrl: { label: "Server URL" }
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
    outbound: {
        deliveryMode: "direct",
        resolveTarget: (params) => {
            const to = params.to;
            if (!to) {
                return { ok: false, error: new Error("缺少目标用户 ID") };
            }
            return { ok: true, to };
        },
        sendPayload: async (ctx) => {
            const { cfg, to, payload, deps } = ctx;
            const logger = deps?.log || console;
            logger.info(`[WE XCX] outbound==>发送载荷: ${JSON.stringify(ctx)}`);
            const ws = connections.get("default");
            if (!ws || ws.readyState !== ws_1.default.OPEN) {
                logger.warn(`[WE XCX] WebSocket 未打开 (状态: ${ws?.readyState})，无法发送回复`);
                return {
                    channel: "we-xcx",
                    messageId: "",
                    error: new Error("WebSocket 未连接")
                };
            }
            const replyText = payload.text || "";
            const mediaUrl = payload.mediaUrl || "";
            const payload_json = JSON.stringify({
                type: "message",
                data: {
                    text: replyText,
                    mediaUrl: mediaUrl,
                    recipientId: to,
                    conversationId: payload.channelData?.conversationId || "default"
                }
            });
            logger.info(`[WE XCX] 发送 WebSocket 载荷: ${payload_json}`);
            ws.send(payload_json);
            return {
                channel: "we-xcx",
                messageId: `we-xcx-outbound-${Date.now()}`,
                conversationId: payload.channelData?.conversationId
            };
        },
        sendText: async (ctx) => {
            const { cfg, to, text, deps } = ctx;
            const logger = deps?.log || console;
            logger.info(`[WE XCX] outbound==>发送文本: ${JSON.stringify(ctx)}`);
            const ws = connections.get("default");
            if (!ws || ws.readyState !== ws_1.default.OPEN) {
                logger.warn(`[WE XCX] WebSocket 未打开 (状态: ${ws?.readyState})，无法发送回复`);
                return {
                    channel: "we-xcx",
                    messageId: "",
                    error: new Error("WebSocket 未连接")
                };
            }
            const payload_json = JSON.stringify({
                type: "message",
                data: {
                    text: text,
                    recipientId: to,
                    conversationId: "default"
                }
            });
            logger.info(`[WE XCX] 发送文本: ${payload_json}`);
            ws.send(payload_json);
            return {
                channel: "we-xcx",
                messageId: `we-xcx-text-${Date.now()}`
            };
        },
        sendMedia: async (ctx) => {
            const { cfg, to, text, mediaUrl, deps } = ctx;
            const logger = deps?.log || console;
            logger.info(`[WE XCX] outbound==>发送媒体: ${JSON.stringify(ctx)}`);
            const ws = connections.get("default");
            if (!ws || ws.readyState !== ws_1.default.OPEN) {
                logger.warn(`[WE XCX] WebSocket 未打开 (状态: ${ws?.readyState})，无法发送媒体`);
                return {
                    channel: "we-xcx",
                    messageId: "",
                    error: new Error("WebSocket 未连接")
                };
            }
            const payload_json = JSON.stringify({
                type: "message",
                data: {
                    text: text || "",
                    mediaUrl: mediaUrl || "",
                    recipientId: to,
                    conversationId: "default"
                }
            });
            logger.info(`[WE XCX] 发送媒体: ${payload_json}`);
            ws.send(payload_json);
            return {
                channel: "we-xcx",
                messageId: `we-xcx-media-${Date.now()}`
            };
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
            // 保存配置和上下文供重连使用
            currentConfig = config;
            currentLogger = logger;
            currentCtx = ctx;
            // 调试日志：输出完整配置
            logger.debug(`[WE XCX] 完整配置: ${JSON.stringify(config)}`);
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
            // 清除之前的重连计时器
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            reconnectAttempts = 0;
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
                reconnectAttempts = 0; // 重置重连计数
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
                        const conversationId = readString(msgData, "conversationId") || "default";
                        const msgId = readString(msgData, "id") || `we-xcx-${Date.now()}`;
                        const filePath = readString(msgData, "filePath");
                        const mediaType = readString(msgData, "mediaType");
                        if ((text || filePath) && core) {
                            // 使用核心运行时分发消息
                            const cfg = core.config.loadConfig();
                            // 解析路由 (代理)
                            const route = core.channel.routing.resolveAgentRoute({
                                cfg,
                                channel: "we-xcx",
                                peer: { kind: "dm", id: userId }
                            });
                            logger.info(`[WE XCX] 解析路由: agentId=${route.agentId}, sessionKey=${route.sessionKey}`);
                            // 获取工作空间路径用于保存下载的媒体文件
                            const workspacePath = core.channel.session.resolveStorePath(cfg.session?.store, { agentId: route.agentId });
                            // 调试日志：检查当前配置
                            logger.debug(`[WE XCX] 当前配置 (from currentConfig): ${JSON.stringify(currentConfig)}`);
                            let serverUrl = (currentConfig?.serverUrl || config?.serverUrl) || "http://localhost:8080";
                            logger.debug(`[WE XCX] 使用的 serverUrl: ${serverUrl}`);
                            if (!serverUrl.startsWith("http")) {
                                serverUrl = "http://" + serverUrl;
                            }
                            // 下载媒体文件（如果有）
                            let downloadedMediaPath;
                            let downloadedMediaMimeType;
                            let originalMediaName;
                            if (filePath && mediaType) {
                                const media = await downloadMedia(serverUrl, filePath, workspacePath, logger);
                                if (media) {
                                    downloadedMediaPath = media.path;
                                    downloadedMediaMimeType = media.mimeType;
                                    originalMediaName = media.originalName;
                                    logger.info(`[WE XCX] Media downloaded: ${downloadedMediaPath}`);
                                }
                            }
                            // 构建上下文
                            const ctxPayload = core.channel.reply.finalizeInboundContext({
                                Body: text || (originalMediaName ? `<media:${mediaType || 'file'}:${originalMediaName}>` : `<media:${mediaType || 'file'}>`),
                                RawBody: text,
                                CommandBody: text,
                                From: `we-xcx:${userId}`,
                                To: userId,
                                SessionKey: route.sessionKey,
                                AccountId: "default",
                                ChatType: "direct",
                                ConversationLabel: conversationId,
                                SenderName: userId,
                                SenderId: userId,
                                Provider: "we-xcx",
                                Surface: "we-xcx",
                                MessageSid: msgId,
                                Timestamp: Date.now(),
                                CommandSource: text ? "text" : "file",
                                OriginatingChannel: "we-xcx",
                                OriginatingTo: userId,
                                MediaPath: downloadedMediaPath,
                                MediaType: mediaType,
                                MediaUrl: downloadedMediaPath
                            });
                            // 创建分发器
                            const { dispatcher } = core.channel.reply.createReplyDispatcherWithTyping({
                                responsePrefix: "",
                                responsePrefixContextProvider: () => ({ prefix: "" }),
                                humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
                                deliver: async (replyPayload) => {
                                    logger.info(`[WE XCX] 正在投递回复: ${JSON.stringify(replyPayload)}`);
                                    const replyText = replyPayload.text || "";
                                    //{"mediaUrls":["/home/user3/media/outbound/black_circle.png"],"mediaUrl":"/home/user3/media/outbound/black_circle.png","replyToTag":false,"replyToCurrent":false,"audioAsVoice":false}
                                    const mediaUrl = replyPayload.mediaUrl || "";
                                    if (ws.readyState === ws_1.default.OPEN) {
                                        //上传媒体文件
                                        if (mediaUrl) {
                                            const fileId = await uploadMedia(serverUrl, mediaUrl, workspacePath, logger);
                                            if (fileId) {
                                                replyPayload.fileId = fileId;
                                            }
                                        }
                                        const payload = JSON.stringify({
                                            type: "message",
                                            data: {
                                                text: replyText,
                                                fileId: replyPayload.fileId,
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
                        else if (!text && !filePath) {
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
                // 触发重连
                attemptReconnect(ctx, config, logger);
            });
        }
    }
};
// 重连函数
function attemptReconnect(ctx, config, logger) {
    if (!currentLogger)
        currentLogger = logger;
    if (!currentConfig)
        currentConfig = config;
    if (!currentCtx)
        currentCtx = ctx;
    const log = currentLogger || logger;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        log.error(`[WE XCX] 达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，停止重连`);
        return;
    }
    // 计算延迟（指数退避）
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    log.info(`[WE XCX] ${delay / 1000}秒后尝试重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (currentCtx && currentConfig && currentLogger) {
            const gateway = channelPlugin.gateway;
            if (gateway) {
                gateway.startAccount(currentCtx);
            }
        }
    }, delay);
}
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
