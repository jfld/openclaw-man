import { OpenClawPluginApi, ChannelPlugin, PluginRuntime } from "openclaw/plugin-sdk";
import WebSocket from "ws";
import axios from "axios";

// 定义符合 OpenClaw 运行时预期的最小类型
interface WeXcxConfig {
  apiKey: string;
  apiEndpoint: string;
  useTls: boolean;
  serverUrl: string;
}

// 连接的全局状态
const connections = new Map<string, WebSocket>();
const messageQueues = new Map<string, string[]>();

// 重连相关状态
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1秒
const MAX_RECONNECT_DELAY = 30000; // 30秒

// 保存当前配置供重连使用
let currentConfig: WeXcxConfig | null = null;
let currentLogger: any = null;
let currentCtx: any = null;

// 全局运行时引用
let core: PluginRuntime | undefined;

// 防御性解析的辅助函数
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  if (!record) {
    return undefined;
  }
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

interface MediaFile {
  path: string;
  mimeType: string;
  originalName: string;
}

//上传
  async function uploadMedia(
    serverUrl: string,
    mediaUrl: string,
    workspacePath: string,
    userId: string,
    log?: any
  ): Promise<string | null> {
    if (!serverUrl || !mediaUrl) {
      log?.error?.('[cloud-bot-channel] uploadMedia requires serverUrl and mediaUrl to be provided.');
      return null;
    }
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const filePath = mediaUrl;
      if (!fs.existsSync(filePath)) {
        log?.error?.(`[cloud-bot-channel] File not found: ${filePath}`);
        return null;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      log.info(`[cloud-bot-channel] Uploading file: ${fileName}, extension: ${ext}, size: ${fileBuffer.length}`);
      
      const FormData = (await import('form-data')).default;
      
      const form = new FormData();
      form.append('file', fileBuffer, {
        filename: fileName,
        contentType: 'application/octet-stream'
      });

      const response = await axios.post(`${serverUrl}/upload/file?user_id=${userId}`, form, {
        headers: {
          ...form.getHeaders()
        }
      });
       log.info(`[cloud-bot-channel] Upload response: ${JSON.stringify(response.data)}`);
      return response.data.file_name || null;
    } catch (err: any) {
      log?.error?.(`[cloud-bot-channel] Failed to upload media: ${err.message}`);
      if (err.response) {
        log?.error?.(`[cloud-bot-channel] Response status: ${err.response.status}, data: ${JSON.stringify(err.response.data)}`);
      }
      return null;
    }
  }

async function downloadMedia(
  serverUrl: string,
  filePath: string,
  workspacePath: string,
  userId: string,
  log?: any
): Promise<MediaFile | null> {
  if (!serverUrl || !filePath) {
    log?.error?.('[cloud-bot-channel] downloadMedia requires serverUrl and filePath to be provided.');
    return null;
  }

  try {
    const normalizedServerUrl = serverUrl.replace(/\/$/, '');
    const downloadUrl = `${normalizedServerUrl}/download/file?user_id=${userId}&file_name=${encodeURIComponent(filePath)}`;
    
    log?.debug?.(`[cloud-bot-channel] Downloading media from: ${downloadUrl}`);
    
    const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const buffer = Buffer.from(response.data);

    const path = await import('path');
    const fs = await import('fs');
    
    const mediaDir = path.join(__dirname, 'media', 'inbound');
    fs.mkdirSync(mediaDir, { recursive: true });

    const contentDisposition = response.headers['content-disposition'] || '';
    const originalNameMatch = contentDisposition.match(/filename[^;=\n]*=(?:(\\?['"])(.*?)\1|([^;=\n]*))/i);
    const originalName = originalNameMatch ? originalNameMatch[2] || originalNameMatch[3] : '';
    
    let filename: string;
    if (originalName) {
      filename = `${Date.now()}_${originalName}`;
    } else {
      const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
      filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    }
    currentLogger.debug(`文件名: ${filename}`);
    const mediaPath = path.join(mediaDir, filename);
    currentLogger.debug(`文件路径: ${mediaPath}`); 
    fs.writeFileSync(mediaPath, buffer);
    log?.debug?.(`[cloud-bot-channel] Media saved to workspace: ${mediaPath}`);
    return { path: mediaPath, mimeType: contentType, originalName };
  } catch (err: any) {
    const errorMsg = err.response?.data 
      ? JSON.stringify(err.response.data) 
      : err.message || err.toString();
    if (log?.error) {
      log.error(`[cloud-bot-channel] Failed to download media: ${errorMsg}`);
      if (err.response?.status) {
        log.error(`[cloud-bot-channel] HTTP status: ${err.response.status}`);
      }
    }
    return null;
  }
}

const channelPlugin: ChannelPlugin<any> = {
  id: "cloud-bot-channel",
  meta: {
    description: "通过全双工 WebSocket 连接到 cloud-bot-channel 聊天服务",
  } as any,
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
    listAccountIds: (cfg: any) => {
       // 检查是否在 plugins.entries.cloud-bot-channel 中配置
       // 配置结构是 cfg.plugins.entries['cloud-bot-channel']
       const entry = cfg.plugins?.entries?.['cloud-bot-channel'];
       if (entry && (entry.enabled === undefined || entry.enabled)) {
         return ["default"];
       }
       return [];
    },
    resolveAccount: (cfg: any, accountId?: string | null) => {
      // 返回配置对象
      const entry = cfg.plugins?.entries?.['cloud-bot-channel'];
      return entry?.config || {};
    },
    describeAccount: (account: any) => {
        return { accountId: "default", id: "default", name: "cloud-bot-channel 默认账户" };
    }
  },

  outbound: {
    deliveryMode: "direct" as const,

    resolveTarget: (params: {
      cfg?: any;
      to?: string;
      allowFrom?: string[];
      accountId?: string | null;
      mode?: string;
    }) => {
      const to = params.to;
      if (!to) {
        return { ok: false, error: new Error("缺少目标用户 ID") };
      }
      return { ok: true, to };
    },

    sendPayload: async (ctx: any) => {
      const { cfg, to, payload, deps } = ctx;
      const logger = deps?.log || console;
      logger.info(`[cloud-bot-channel] outbound==>发送载荷: ${JSON.stringify(ctx)}`);
      const ws = connections.get("default");
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        logger.warn(`[cloud-bot-channel] WebSocket 未打开 (状态: ${ws?.readyState})，无法发送回复`);
        return {
          channel: "cloud-bot-channel" as any,
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

      logger.info(`[cloud-bot-channel] 发送 WebSocket 载荷: ${payload_json}`);
      ws.send(payload_json);

      return {
        channel: "cloud-bot-channel" as any,
        messageId: `cloud-bot-channel-outbound-${Date.now()}`,
        conversationId: payload.channelData?.conversationId
      };
    },

    sendText: async (ctx: any) => {
      const { cfg, to, text, deps } = ctx;
      const logger = deps?.log || console;
      logger.info(`[cloud-bot-channel] outbound==>发送文本: ${JSON.stringify(ctx)}`);
      const ws = connections.get("default");
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        logger.warn(`[cloud-bot-channel] WebSocket 未打开 (状态: ${ws?.readyState})，无法发送回复`);
        return {
          channel: "cloud-bot-channel" as any,
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

      logger.info(`[cloud-bot-channel] 发送文本: ${payload_json}`);
      ws.send(payload_json);

      return {
        channel: "cloud-bot-channel" as any,
        messageId: `cloud-bot-channel-text-${Date.now()}`
      };
    },

    sendMedia: async (ctx: any) => {
      const { cfg, to, text, mediaUrl, deps } = ctx;
      const logger = deps?.log || console;
      logger.info(`[cloud-bot-channel] outbound==>发送媒体: ${JSON.stringify(ctx)}`);
      const ws = connections.get("default");
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        logger.warn(`[cloud-bot-channel] WebSocket 未打开 (状态: ${ws?.readyState})，无法发送媒体`);
        return {
          channel: "cloud-bot-channel" as any,
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

      logger.info(`[cloud-bot-channel] 发送媒体: ${payload_json}`);
      ws.send(payload_json);

      return {
        channel: "cloud-bot-channel" as any,
        messageId: `cloud-bot-channel-media-${Date.now()}`
      };
    }
  },

  gateway: {
    startAccount: async (ctx: any) => {
      const config = ctx.account as WeXcxConfig;
      // 如果可用，使用全局核心运行时，否则回退到 ctx.runtime（功能有限）
      // 注意：ctx.runtime 通常没有 'ingest' 或 'channel'。
      const runtime = ctx.runtime; 
      const logger = runtime.logging && runtime.logging.getChildLogger 
        ? runtime.logging.getChildLogger({ module: "cloud-bot-channel" })
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
      logger.debug(`[cloud-bot-channel] 完整配置: ${JSON.stringify(config)}`);

      if (!core) {
        logger.error("[cloud-bot-channel] 插件运行时未初始化。Register 函数未被调用？");
      }

      if (!config.apiKey || !config.apiEndpoint) {
        logger.warn("[cloud-bot-channel] 配置中缺少 apiKey 或 apiEndpoint。跳过连接。");
        return;
      }
      
      const protocol = config.useTls ? "wss" : "ws";
      // 确保 apiEndpoint 不包含协议
      const endpoint = (config.apiEndpoint || "").replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
      const wsUrl = `${protocol}://${endpoint}/v1/stream?apiKey=${config.apiKey}`;
      
      logger.info(`[cloud-bot-channel] 正在连接到 ${wsUrl}...`);
      
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

      const ws = new WebSocket(wsUrl);
      connections.set("default", ws);
      
      if (!messageQueues.has("default")) {
        messageQueues.set("default", []);
      }

      ws.on("open", () => {
        logger.info("[cloud-bot-channel] 已连接！");
        reconnectAttempts = 0; // 重置重连计数
        // 发送排队的消息
        const queue = messageQueues.get("default") || [];
        while (queue.length > 0) {
          const msg = queue.shift();
          if (msg) ws.send(msg);
        }
      });

      ws.on("message", async (data: any) => {
        try {
          const str = data.toString();
          logger.info(`[cloud-bot-channel] 收到消息: ${str}`); // 记录原始消息以进行调试
          
          let msg: any;
          try {
             msg = JSON.parse(str);
          } catch (e) {
             logger.warn(`[cloud-bot-channel] JSON 解析失败: ${str}`);
             return;
          }
          
          const payload = asRecord(msg);
          if (!payload) return;

          const type = readString(payload, "type");
          const msgData = asRecord(payload["data"]);
          
          if (type === "message" && msgData) {
            const text = readString(msgData, "text") || "";
            const userId = readString(msgData, "userId") || "unknown";
            const conversationId = readString(msgData, "conversationId") || "default";
            const msgId = readString(msgData, "id") || `cloud-bot-channel-${Date.now()}`;
            const filePath = readString(msgData, "filePath");
            const mediaType = readString(msgData, "mediaType");
            
            if ((text || filePath) && core) {
                // 使用核心运行时分发消息
                const cfg = core.config.loadConfig();
                
                // 解析路由 (代理)
                const route = core.channel.routing.resolveAgentRoute({
                    cfg,
                    channel: "cloud-bot-channel",
                    peer: { kind: "dm", id: userId }
                });
                
                logger.info(`[cloud-bot-channel] 解析路由: agentId=${route.agentId}, sessionKey=${route.sessionKey}`);

                // 获取工作空间路径用于保存下载的媒体文件
                const workspacePath = core.channel.session.resolveStorePath(cfg.session?.store, { agentId: route.agentId });
                
                // 调试日志：检查当前配置
                logger.debug(`[cloud-bot-channel] 当前配置 (from currentConfig): ${JSON.stringify(currentConfig)}`);
                let serverUrl = (currentConfig?.serverUrl || config?.serverUrl) || "http://localhost:8080";
                logger.debug(`[cloud-bot-channel] 使用的 serverUrl: ${serverUrl}`);
                if (!serverUrl.startsWith("http")) {
                    serverUrl = "http://" + serverUrl;
                }

                // 下载媒体文件（如果有）
                let downloadedMediaPath: string | undefined;
                let downloadedMediaMimeType: string | undefined;
                let originalMediaName: string | undefined;
                if (filePath && mediaType) {
                    const media = await downloadMedia(serverUrl, filePath, workspacePath, userId, logger);
                    if (media) {
                        downloadedMediaPath = media.path;
                        downloadedMediaMimeType = media.mimeType;
                        originalMediaName = media.originalName;
                        logger.info(`[cloud-bot-channel] Media downloaded: ${downloadedMediaPath}`);
                    }
                }

                // 构建上下文
                const ctxPayload = core.channel.reply.finalizeInboundContext({
                    Body: text || (originalMediaName ? `<media:${mediaType || 'file'}:${originalMediaName}>` : `<media:${mediaType || 'file'}>`),
                    RawBody: text,
                    CommandBody: text,
                    From: `cloud-bot-channel:${userId}`,
                    To: userId,
                    SessionKey: route.sessionKey,
                    AccountId: "default",
                    ChatType: "direct",
                    ConversationLabel: conversationId,
                    SenderName: userId,
                    SenderId: userId,
                    Provider: "cloud-bot-channel" as const,
                    Surface: "cloud-bot-channel" as const,
                    MessageSid: msgId,
                    Timestamp: Date.now(),
                    CommandSource: text ? "text" : "file",
                    OriginatingChannel: "cloud-bot-channel" as const,
                    OriginatingTo: userId,
                    MediaPath: downloadedMediaPath,
                    MediaType: mediaType,
                    MediaUrl: downloadedMediaPath
                });

                // 创建分发器
                const { dispatcher } = core.channel.reply.createReplyDispatcherWithTyping({
                    responsePrefix: "",
                    responsePrefixContextProvider: () => ({ prefix: "" }) as any,
                    humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
                    deliver: async (replyPayload: any) => {
                        logger.info(`[cloud-bot-channel] 正在投递回复: ${JSON.stringify(replyPayload)}`);
                        const replyText = replyPayload.text || "";
                        //{"mediaUrls":["/home/user3/media/outbound/black_circle.png"],"mediaUrl":"/home/user3/media/outbound/black_circle.png","replyToTag":false,"replyToCurrent":false,"audioAsVoice":false}
                        const mediaUrl = replyPayload.mediaUrl || "";
                        if (ws.readyState === WebSocket.OPEN) {
                          //上传媒体文件
                          if (mediaUrl) {
                            const fileId = await uploadMedia(serverUrl, mediaUrl, workspacePath, userId, logger);
                            if (fileId) {
                                replyPayload.fileId = fileId;
                            }
                          }
                            const payload = JSON.stringify({
                                type: "message",
                                data: {
                                    text: replyText,
                                    mediaUrl: replyPayload.fileId,
                                    recipientId: userId,
                                    conversationId: conversationId // 回传 conversationId
                                }
                            });
                            logger.info(`[cloud-bot-channel] 发送 WebSocket 载荷: ${payload}`);
                            ws.send(payload);
                        } else {
                            logger.warn(`[cloud-bot-channel] WebSocket 未打开 (状态: ${ws.readyState})，无法发送回复`);
                        }
                    },
                    onError: (err: any, info: any) => {
                        logger.error(`[cloud-bot-channel] 回复错误: ${err}`);
                    }
                });

                // 分发
                await core.channel.reply.dispatchReplyFromConfig({
                    ctx: ctxPayload,
                    cfg,
                    dispatcher
                });

            } else if (!text && !filePath) {
              logger.warn("[cloud-bot-channel] 收到没有文本内容的消息");
            } else if (!core) {
                logger.error("[cloud-bot-channel] 核心运行时不可用，无法处理消息");
            }
          }
        } catch (e) {
          logger.error(`[cloud-bot-channel] 处理消息时出错: ${e}`);
        }
      });

      ws.on("error", (err) => {
        logger.error(`[cloud-bot-channel] WebSocket 错误: ${err}`);
      });

      ws.on("close", () => {
        logger.info("[cloud-bot-channel] 已断开连接");
        connections.delete("default");
        
        // 触发重连
        attemptReconnect(ctx, config, logger);
      });
    }
  }
};

// 重连函数
function attemptReconnect(ctx: any, config: WeXcxConfig, logger: any) {
  if (!currentLogger) currentLogger = logger;
  if (!currentConfig) currentConfig = config;
  if (!currentCtx) currentCtx = ctx;
  
  const log = currentLogger || logger;
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.error(`[cloud-bot-channel] 达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，停止重连`);
    return;
  }
  
  // 计算延迟（指数退避）
  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );
  
  reconnectAttempts++;
  log.info(`[cloud-bot-channel] ${delay/1000}秒后尝试重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentCtx && currentConfig && currentLogger) {
      const gateway = (channelPlugin as any).gateway;
      if (gateway) {
        gateway.startAccount(currentCtx);
      }
    }
  }, delay);
}

const plugin = {
  id: "cloud-bot-channel",
  name: "cloud-bot-channel",
  description: "cloud-bot-channel 通道插件",
  configSchema: {}, 
  register(api: OpenClawPluginApi) {
    core = api.runtime;
    api.registerChannel({ plugin: channelPlugin });
  }
};

export default plugin;
