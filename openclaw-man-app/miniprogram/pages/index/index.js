const app = getApp();
const { getConversations, updateConversation, deleteConversation } = require('../../api/conversation');
// 假设这里我们需要获取机器人详情来展示头像和名称，或者Conversation里有包含
const { getRobotDetail } = require('../../api/robot');

Page({
  data: {
    chatSessions: [],
    loading: false
  },

  onShow() {
    // 每次显示页面时重新加载列表
    this.loadChatSessions();
  },

  async loadChatSessions() {
    this.setData({ loading: true });
    try {
      const conversations = await getConversations();
      // conversations: [{id, robot_id, title, creator_id, created_at, ...}, ...]
      
      const sessions = await Promise.all(conversations.map(async (conv) => {
        let robotName = '未知机器人';
        let robotAvatar = '/image/icon_API.png';
        
        // 尝试从全局数据获取机器人信息
        const robots = app.globalData.robots || [];
        let robot = robots.find(r => r.id === conv.robot_id || r.robot_id === conv.robot_id);
        
        if (!robot) {
           try {
             // robot = await getRobotDetail(conv.robot_id);
           } catch(e) {}
        }

        if (robot) {
          robotName = robot.name;
          // 优先使用 robot.icon (Base64), 其次 robot.avatar (URL/Local), 最后默认
          if (robot.icon) {
             robotAvatar = robot.icon;
          } else if (robot.avatar) {
             robotAvatar = robot.avatar;
          }
        } else if (conv.title) {
            // 如果找不到机器人信息，但有对话标题，优先显示对话标题
            robotName = conv.title;
        }

        let lastMessage = '点击进入对话';
        let firstMessage = '';
        
        // 尝试从本地存储获取最新消息和第一条消息
        if (conv.id) {
            const key = `chat_history_${conv.id}`;
            const messages = wx.getStorageSync(key);
            if (messages && messages.length > 0) {
                // Get Last Message
                const lastMsg = messages[messages.length - 1];
                if (lastMsg.msgType === 'image') {
                    lastMessage = '[图片]';
                } else {
                    // 只显示第一行
                    lastMessage = lastMsg.content ? lastMsg.content.split('\n')[0] : '';
                }
                
                // Get First Message (User's first message preferably)
                // 找到第一条 type='user' 的消息，或者直接取 messages[0]
                const firstMsgObj = messages.find(m => m.type === 'user') || messages[0];
                if (firstMsgObj) {
                     if (firstMsgObj.msgType === 'image') {
                        firstMessage = '[图片]';
                    } else {
                        firstMessage = firstMsgObj.content ? firstMsgObj.content.split('\n')[0] : '';
                    }
                }
            }
        }

        return {
          id: conv.id, // Conversation ID
          robotId: conv.robot_id,
          robotName: robotName,
          robotAvatar: robotAvatar,
          title: conv.title, // 对话主题
          lastMessage: lastMessage,
          firstMessage: firstMessage,
          timestamp: new Date(conv.created_at).getTime(),
          timeStr: this.formatTime(new Date(conv.created_at).getTime()),
          x: 0 // For movable-view
        };
      }));

      // Sort by timestamp desc
      sessions.sort((a, b) => b.timestamp - a.timestamp);

      this.setData({ chatSessions: sessions });
    } catch (err) {
      console.error('获取对话列表失败', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    
    // Check if it's today
    if (date.toDateString() === now.toDateString()) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    
    // Check if it's yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    }
    
    // Otherwise show date
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  },

  goToChat(e) {
    const { id, robotid: robotId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/chat/chat?conversationId=${id}&robotId=${robotId}`
    });
  },

  editConversation(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '编辑对话主题',
      content: title || '',
      editable: true,
      placeholderText: '请输入对话主题',
      success: async (res) => {
        if (res.confirm) {
          const newTitle = res.content;
          wx.showLoading({ title: '更新中...' });
          try {
            await updateConversation(id, newTitle);
            wx.showToast({ title: '更新成功', icon: 'success' });
            this.loadChatSessions(); // 刷新列表
          } catch (err) {
            console.error('更新对话失败', err);
            wx.showToast({ title: '更新失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  deleteConversation(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个对话吗？聊天记录也将被清除。',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            await deleteConversation(id);
            // 清除本地聊天记录
            wx.removeStorageSync(`chat_history_${id}`);
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.loadChatSessions(); // 刷新列表
          } catch (err) {
            console.error('删除对话失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // Swipe Logic
  onMovableChange(e) {
    // Record current x for the item
    // We don't need to update data on every move for performance, 
    // just track it for touchend decision if needed.
    // But here we rely on touchend to snap.
    // Actually, movable-view updates its own view, we just need to know where it ended.
    // However, event.detail.x is available.
    if (e.detail.source === 'touch') {
        this.currentX = e.detail.x;
    }
  },

  onMovableTouchEnd(e) {
    const { index } = e.currentTarget.dataset;
    const x = this.currentX;
    const threshold = -60; // Drag threshold
    const menuWidth = -120; // Width of actions (2 buttons * 60px approx? No, 240rpx approx -120px?)
    // In wxml/wxss we set width 240rpx. In logic 1px approx 2rpx. 
    // movable-view coordinates are in px.
    // 240rpx = 120px roughly depending on device.
    // Let's assume typical screen.
    
    // Better: check if dragged enough to show.
    // If x < -30 (dragged left a bit), snap to open (-menuWidth).
    // Else snap back to 0.
    
    // We need to update the specific item's x value in data to snap it.
    const sessions = this.data.chatSessions;
    
    // Close others
    sessions.forEach((item, idx) => {
        if (idx !== index && item.x !== 0) {
            item.x = 0;
        }
    });

    // Snap current
    // Note: We need to convert 240rpx to px for accurate logic or just use a safe value.
    // But movable-view x is in px (usually) or system units.
    // Actually, movable-view x supports values.
    
    // Let's simplify: if x < -40, open it.
    let targetX = 0;
    if (x < -40) {
        targetX = -120; // Open (approx 240rpx)
    } else {
        targetX = 0; // Close
    }
    
    sessions[index].x = targetX;
    
    // Reset currentX
    this.currentX = 0;
    
    this.setData({ chatSessions: sessions });
  }
});
