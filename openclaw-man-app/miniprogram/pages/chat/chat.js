const app = getApp();
const config = require('../../config');
const { ensureToken } = require('../../util/auth');

Page({
  data: {
    robot: null,
    userInfo: null,
    messages: [],
    inputValue: '',
    toView: '',
    robotId: '',
    conversationId: '',
    isVoiceMode: false,
    showMorePanel: false,
    keyboardHeight: 0,
    socketConnected: false,
    isRobotOffline: false,
    robotOfflineTip: ''
  },

  onLoad(options) {
    if (options.robotId) {
      this.setData({ 
        robotId: options.robotId,
        conversationId: options.conversationId || ''
      });
      this.loadRobot(options.robotId);
      
      // 加载本地历史消息
      this.loadMessages(); 
      
      // 连接 WebSocket
      this.connectWebSocket();
    }
    
    this.setData({
      userInfo: app.globalData.userInfo
    });
  },

  onUnload() {
    this.closeWebSocket();
  },

  async connectWebSocket() {
    const { robotId, conversationId } = this.data;
    if (!robotId) return;

    try {
      const token = await ensureToken();
      let url = `${config.wsBaseUrl}?robotId=${robotId}`;
      if (conversationId) {
        url += `&conversationId=${conversationId}`;
      }

      console.log('Connecting to WebSocket:', url);

      this.socketTask = wx.connectSocket({
        url: url,
        header: {
          'Authorization': `Bearer ${token}`
        },
        success: () => {
          console.log('WebSocket 连接请求发送成功');
        }
      });

      this.socketTask.onOpen(() => {
        console.log('WebSocket Connected');
        this.setData({ socketConnected: true });
        this.startHeartbeat();
        // 隐式发送探测消息，检查机器人在线状态
        this.checkRobotStatus();
      });

      this.socketTask.onMessage((res) => {
        this.onSocketMessage(res);
      });

      this.socketTask.onError((err) => {
        console.error('WebSocket Error', err);
        this.setData({ socketConnected: false });
      });

      this.socketTask.onClose((res) => {
        console.log('WebSocket Closed', res);
        this.setData({ socketConnected: false });
        this.stopHeartbeat();
      });

    } catch (err) {
      console.error('Failed to get token or connect socket', err);
    }
  },

  closeWebSocket() {
    if (this.socketTask) {
      this.socketTask.close();
      this.socketTask = null;
    }
    this.stopHeartbeat();
  },

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socketTask && this.data.socketConnected) {
        this.sendSocketMessage({ type: 'ping' });
      }
    }, 30000);
  },

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  },

  checkRobotStatus() {
    // 发送一个探测消息，如果机器人不在线，后端会返回 error: robot_offline
    this.sendSocketMessage({
      type: 'check_online'
    });
  },

  onSocketMessage(res) {
    try {
      const data = JSON.parse(res.data);
      console.log('Received message:', data);

      // 处理机器人离线错误
      if (data.error === 'robot_offline') {
        this.setData({
          isRobotOffline: true,
          robotOfflineTip: '当前机器人不在线，无法发送消息'
        });
        wx.showToast({
          title: '机器人已离线',
          icon: 'none'
        });
        return; // 不作为普通消息处理
      }

      // 如果之前标记为离线，收到正常消息则恢复
      if (this.data.isRobotOffline && (data.text || data.message)) {
        this.setData({
          isRobotOffline: false,
          robotOfflineTip: ''
        });
      }

      // 服务端返回的消息字段不统一，兼容处理
      // 1. 标准协议 { type: 'message', text: '...' }
      // 2. 日志中的格式 { sender: 'Robot', text: '...', ... }
      
      let content = '';
      if (data.type === 'message' && data.text) {
        content = data.text;
      } else if (data.text) {
        content = data.text;
      } else if (data.message) {
        content = data.message;
      }

      if (content) {
        this.addRobotReply(content);
      }
      
    } catch (e) {
      console.error('Parse message failed', e);
    }
  },

  sendSocketMessage(data) {
    if (this.socketTask && this.data.socketConnected) {
      this.socketTask.send({
        data: JSON.stringify(data)
      });
    } else {
      console.warn('Socket not connected');
      wx.showToast({
        title: '连接已断开',
        icon: 'none'
      });
    }
  },

  loadRobot(id) {
    const robots = app.globalData.robots || [];
    const robot = robots.find(r => r.id === id || r.robot_id === id);
    if (robot) {
      this.setData({ robot });
      wx.setNavigationBarTitle({
        title: robot.name
      });
    }
  },

  loadMessages() {
    const key = this.getStorageKey();
    const messages = wx.getStorageSync(key) || [];
    this.setData({ messages });
    this.scrollToBottom();
  },

  getStorageKey() {
    const { conversationId, robotId } = this.data;
    if (conversationId) {
      return `chat_history_${conversationId}`;
    }
    return `chat_history_robot_${robotId}`;
  },

  scrollToBottom() {
    if (this.data.messages.length > 0) {
      this.setData({
        toView: `msg-${this.data.messages.length - 1}`
      });
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onListTap() {
    if (this.data.showMorePanel) {
      this.setData({ showMorePanel: false });
    }
    // Also hide keyboard
    wx.hideKeyboard();
  },

  toggleVoiceMode() {
    this.setData({ 
      isVoiceMode: !this.data.isVoiceMode,
      showMorePanel: false 
    });
  },

  toggleMorePanel() {
    const show = !this.data.showMorePanel;
    this.setData({ 
      showMorePanel: show,
      isVoiceMode: false 
    });
    
    if (show) {
      // Hide keyboard when showing panel
      wx.hideKeyboard();
      this.scrollToBottom();
    }
  },
  
  onFocus(e) {
    // When keyboard shows, hide panel and adjust height
    this.setData({
      showMorePanel: false,
      keyboardHeight: e.detail.height
    });
    this.scrollToBottom();
  },
  
  onBlur(e) {
    this.setData({
      keyboardHeight: 0
    });
  },

  startRecord() {
    wx.showToast({ title: '按住说话...', icon: 'none' });
  },

  stopRecord() {
    // Mock voice message
    this.sendMockVoice();
  },

  sendMockVoice() {
    const text = "【语音消息】(演示)";
    this.doSendMessage(text, 'text');
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths;
        // 图片目前只在本地展示，暂不支持 WebSocket 发送图片（协议只定义了 text）
        this.doSendMessage(tempFilePaths[0], 'image');
      }
    });
  },

  takePhoto() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths;
        this.doSendMessage(tempFilePaths[0], 'image');
      }
    });
  },

  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    wx.previewImage({
      urls: [src]
    });
  },

  sendMessage() {
    const content = this.data.inputValue.trim();
    if (!content) return;
    this.doSendMessage(content, 'text');
  },

  doSendMessage(content, type = 'text') {
    const { messages } = this.data;

    // 1. Add user message locally
    const userMsg = {
      id: Date.now().toString(),
      type: 'user',
      msgType: type, // text or image
      content: content,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMsg];
    this.setData({
      messages: newMessages,
      inputValue: '',
      showMorePanel: false
    });
    this.saveMessages(newMessages); 
    this.scrollToBottom();

    // 2. Send via WebSocket (Only text)
    if (type === 'text') {
      this.sendSocketMessage({
        type: 'message',
        text: content
      });
    } else {
        // Image logic
        setTimeout(() => {
            this.addRobotReply('目前只支持发送文本消息');
        }, 1000);
    }
  },

  addRobotReply(content) {
    const robotMsg = {
        id: (Date.now() + 1).toString(),
        type: 'robot',
        msgType: 'text',
        content: content,
        timestamp: Date.now()
    };
    const updatedMessages = [...this.data.messages, robotMsg];
    this.setData({ messages: updatedMessages });
    this.saveMessages(updatedMessages);
    this.scrollToBottom();
  },

  saveMessages(messages) {
    const key = this.getStorageKey();
    wx.setStorageSync(key, messages);
  }
});
