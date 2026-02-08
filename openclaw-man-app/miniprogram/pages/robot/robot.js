const app = getApp();
const { getRobots } = require('../../api/robot');

Page({
  data: {
    robots: [],
    loading: false
  },

  onShow() {
    this.fetchRobots();
  },

  async fetchRobots() {
    this.setData({ loading: true });
    try {
      const robots = await getRobots();
      this.setData({ robots });
      
      // Update global data to keep in sync (optional)
      app.globalData.robots = robots;
      wx.setStorageSync('robots', robots);
    } catch (err) {
      console.error('Failed to fetch robots:', err);
      // Fallback to local cache if API fails (optional, depending on requirements)
      // const localRobots = app.globalData.robots || [];
      // this.setData({ robots: localRobots });
      
      if (err.statusCode !== 401) { // 401 is handled by request.js
        let errorContent = '';
        if (err.message) {
           errorContent = err.message;
        } else if (err.data) {
          errorContent = JSON.stringify(err.data);
        } else if (err.errMsg) {
          errorContent = err.errMsg;
        } else {
          errorContent = JSON.stringify(err);
        }
        
        wx.showModal({
          title: '获取机器人失败',
          content: `状态码: ${err.statusCode || 'Unknown'}\n错误信息: ${errorContent}`,
          showCancel: false
        });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  goToAdd() {
    wx.navigateTo({
      url: '/pages/add-robot/add-robot'
    });
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    // 注意：后端返回的可能是 robot_id 而不是 id，或者两者都有
    // 假设列表项有 id 属性用于跳转
    const robot = this.data.robots.find(r => r.id == id || r.robot_id == id);
    const targetId = robot ? (robot.robot_id || robot.id) : id;
    
    wx.navigateTo({
      url: `/pages/robot-detail/robot-detail?id=${targetId}`
    });
  }
});
