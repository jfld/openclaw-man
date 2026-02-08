const app = getApp();

Page({
  data: {
    userInfo: null
  },

  onShow() {
    this.setData({
      userInfo: app.globalData.userInfo
    });
  },

  login() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定要清除所有本地数据（包括机器人配置和聊天记录）吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          app.globalData.userInfo = null;
          app.globalData.robots = [];
          this.setData({ userInfo: null });
          wx.showToast({
            title: '已清除',
            icon: 'success'
          });
        }
      }
    });
  },

  about() {
    wx.showModal({
      title: '关于',
      content: 'OpenClaw Man AI助手 v1.0.0',
      showCancel: false
    });
  }
});
