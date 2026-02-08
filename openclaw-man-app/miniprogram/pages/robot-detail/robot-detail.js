const app = getApp();
const { getRobotDetail, deleteRobot } = require('../../api/robot');
const { createConversation } = require('../../api/conversation');

Page({
  data: {
    robot: null,
    createdAtFormatted: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ robotId: options.id });
      this.loadRobot(options.id);
    }
  },

  onShow() {
    // 每次显示页面时刷新数据，确保编辑后数据同步
    if (this.data.robotId) {
      this.loadRobot(this.data.robotId);
    }
  },

  async loadRobot(id) {
    wx.showLoading({ title: '加载中' });
    try {
      const robot = await getRobotDetail(id);
      
      let createdAtFormatted = '';
      const timeStr = robot.created_at || robot.createdAt;
      if (timeStr) {
        const date = new Date(timeStr);
        createdAtFormatted = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      }

      this.setData({ 
        robot,
        createdAtFormatted
      });
    } catch (err) {
      console.error(err);
      // Fallback: try to find in global list if API fails
      const robots = app.globalData.robots || [];
      const robot = robots.find(r => r.id == id || r.robot_id == id);
      
      if (robot) {
        let createdAtFormatted = '';
        if (robot.createdAt) {
          const date = new Date(robot.createdAt);
          createdAtFormatted = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        }
        this.setData({ robot, createdAtFormatted });
      } else {
        if (err.statusCode !== 401) {
          wx.showToast({
            title: '获取详情失败',
            icon: 'none'
          });
        }
      }
    } finally {
      wx.hideLoading();
    }
  },

  async startChat() {
    if (!this.data.robot) return;
    
    const robotId = this.data.robot.robot_id || this.data.robot.id;
    
    wx.showLoading({ title: '创建对话中...' });
    
    try {
      // 调用创建对话接口
      const conversation = await createConversation(robotId);
      
      wx.navigateTo({
        url: `/pages/chat/chat?conversationId=${conversation.id}&robotId=${robotId}`
      });
    } catch (err) {
      console.error('创建对话失败', err);
      wx.showToast({
        title: '创建对话失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  editRobot() {
    if (!this.data.robot) return;
    const robotId = this.data.robot.robot_id || this.data.robot.id;
    // 复用 add-robot 页面，通过参数区分模式
    wx.navigateTo({
      url: `/pages/add-robot/add-robot?id=${robotId}&mode=edit`
    });
  },

  deleteRobot() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个机器人吗？聊天记录也会被清除。',
      success: (res) => {
        if (res.confirm) {
          this.doDelete();
        }
      }
    });
  },

  async doDelete() {
    const robot = this.data.robot;
    const id = robot.robot_id || robot.id;
    
    wx.showLoading({ title: '删除中' });
    
    try {
      await deleteRobot(id);
      
      // Also delete local chat history if any (legacy compatibility)
      wx.removeStorageSync(`chat_${id}`);

      wx.showToast({
        title: '已删除',
        icon: 'success'
      });
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      
    } catch (err) {
      console.error(err);
      if (err.statusCode !== 401) {
        wx.showToast({
          title: '删除失败',
          icon: 'none'
        });
      }
    } finally {
      wx.hideLoading();
    }
  }
});
