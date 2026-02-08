/**
 * 小程序配置文件
 */

// 本地开发环境地址
//const apiBaseUrl = 'http://127.0.0.1:8811/ocms';
const apiBaseUrl = 'https://www.xxxxxx.top/ocms';

// WebSocket 服务地址
//const wsBaseUrl = 'ws://127.0.0.1:8812/ocms/v1/stream';
const wsBaseUrl = 'wss://www.xxxxxx.top/ocms/v1/stream';

const config = {
  apiBaseUrl,
  wsBaseUrl,
  
  // 测试的请求地址，用于测试会话
  requestUrl: 'https://mp.weixin.qq.com',
  
  // 云开发环境 ID
  envId: 'release-b86096',
  // envId: 'test-f0b102',

  // 云开发-存储 示例文件的文件 ID
  demoImageFileId: 'cloud://release-b86096.7265-release-b86096-1258211818/demo.jpg',
  demoVideoFileId: 'cloud://release-b86096.7265-release-b86096/demo.mp4',
}

module.exports = config
