const WebSocket = require('ws');

// 配置
const config = {
    apiKey: 'api_key_123', //process.env.API_KEY, // 必须通过环境变量提供
    endpoint: process.env.API_ENDPOINT || '127.0.0.1:8812/ocms',
    useTls: process.env.USE_TLS === 'false', // 默认 false (开发环境)
};

if (!config.apiKey) {
    console.error('错误: 未提供 API_KEY');
    console.log('用法: API_KEY=your_key node test/test-client.js');
    process.exit(1);
}

const protocol = config.useTls ? 'wss' : 'ws';
// 构造连接 URL，移除 endpoint 可能存在的协议前缀
const cleanEndpoint = config.endpoint.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
const url = `${protocol}://${cleanEndpoint}/v1/stream?apiKey=${config.apiKey}`;

console.log(`[Client] 正在连接到: ${url}`);

let ws;
let reconnectTimer;

function connect() {
    ws = new WebSocket(url);

    ws.on('open', () => {
        console.log('[Client] 连接成功！等待接收消息...');
        // 如果有断线重连计时器，清除它
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    });

    ws.on('message', (data) => {
        const timestamp = new Date().toLocaleString();
        console.log(`\n[Client] [${timestamp}] 收到消息:`);
        try {
            const str = data.toString();
            console.log('Raw:', str);
            
            const json = JSON.parse(str);
            console.log('JSON:', JSON.stringify(json, null, 2));
            
            // 简单的消息类型判断
            if (json.type === 'message' && json.data) {
                console.log(`>>> 来自用户 [${json.data.userId}]: ${json.data.text}`);
                if (json.data.conversationId) {
                    console.log(`    Conversation ID: ${json.data.conversationId}`);
                }

                // 模拟自动回复 (Echo)
                const replyText = `[Auto Reply] 我收到了你的消息: "${json.data.text}"`;
                const replyMsg = {
                    type: 'message',
                    data: {
                        text: replyText,
                        recipientId: json.data.userId,
                        conversationId: json.data.conversationId
                    }
                };
                
                // 模拟一点延迟回复
                setTimeout(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        console.log(`<<< 发送回复给 [${json.data.userId}]: ${replyText}`);
                        ws.send(JSON.stringify(replyMsg));
                    }
                }, 1000);
            }
        } catch (e) {
            console.log('无法解析为 JSON');
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[Client] 连接断开 (Code: ${code}, Reason: ${reason})`);
        attemptReconnect();
    });

    ws.on('error', (err) => {
        console.error(`[Client] 连接错误: ${err.message}`);
        // error 通常会触发 close，所以重连逻辑主要在 close 中处理
    });
}

function attemptReconnect() {
    if (!reconnectTimer) {
        console.log('[Client] 3秒后尝试重连...');
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, 3000);
    }
}

// 启动连接
connect();

// 处理进程退出，优雅关闭
process.on('SIGINT', () => {
    console.log('\n[Client] 停止测试...');
    if (ws) ws.terminate();
    process.exit(0);
});
