// app.js
App({
  globalData: {
    userInfo: null,
    currentChatRobot: null,
    robots: [],
    chatSessions: []
  },
  
  onLaunch() {
    // 初始化数据
    this.loadUserInfo();
    this.loadRobots();
    
    // Check login status
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      // If not logged in, redirect to login page
      // Note: onLaunch is too early for routing in some cases, so we might need to handle this in pages or use a flag
      // However, since we put login page first in app.json, it will be the default entry.
      // But if user has userInfo, we should redirect to index.
    }
  },
  
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.globalData.userInfo = userInfo;
    }
  },
  
  loadRobots() {
    const robots = wx.getStorageSync('robots') || [];
    this.globalData.robots = robots;
  }
});
