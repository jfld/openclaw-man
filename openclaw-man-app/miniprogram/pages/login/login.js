const app = getApp();
const { loginAndGetToken } = require('../../util/auth');

Page({
  data: {
    avatarUrl: '/image/wechat.png', // Default placeholder
    nickName: '',
    hasUserInfo: false
  },

  onLoad() {
    // Check if user is already logged in
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.nickName) {
      app.globalData.userInfo = userInfo;
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({
      avatarUrl
    });
    this.checkFormState();
  },

  onNicknameChange(e) {
    const nickName = e.detail.value;
    this.setData({
      nickName
    });
    this.checkFormState();
  },

  onNicknameInput(e) {
    // Also capture input for real-time validation if needed, 
    // but type="nickname" mainly triggers on blur/select via bindchange
    this.setData({
      nickName: e.detail.value
    });
    this.checkFormState();
  },

  checkFormState() {
    const { avatarUrl, nickName } = this.data;
    // Check if avatar is not the default one (optional, strictly speaking user might want default)
    // But usually we want them to choose. 
    // However, the default avatarUrl in data is a local path. 
    // e.detail.avatarUrl will be a temp file path (http://tmp/...)
    
    const isAvatarSet = avatarUrl && avatarUrl !== '/image/wechat.png';
    const isNicknameSet = nickName && nickName.trim().length > 0;
    
    this.setData({
      hasUserInfo: isAvatarSet && isNicknameSet
    });
  },

  async handleLogin() {
    if (!this.data.hasUserInfo) return;
    
    wx.showLoading({ title: '登录中...' });

    try {
      // 1. 先进行后端鉴权登录
      await loginAndGetToken();
      
      // 2. 登录成功后，保存用户信息（头像昵称）
      // 注意：这里仅保存到本地作为展示，实际业务中可能需要将这些信息同步给后端
      const userInfo = {
        avatarUrl: this.data.avatarUrl,
        nickName: this.data.nickName
      };

      this.saveUserInfo(userInfo);
    } catch (err) {
      console.error(err);
      const errorMsg = err.message || JSON.stringify(err);
      wx.showModal({
        title: '登录失败',
        content: `请截图反馈：${errorMsg}`,
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  saveUserInfo(userInfo) {
    // 1. Save to globalData
    app.globalData.userInfo = userInfo;
    
    // 2. Save to storage
    wx.setStorageSync('userInfo', userInfo);
    
    // 3. Navigate to Home
    wx.switchTab({
      url: '/pages/index/index'
    });
    
    wx.showToast({
      title: '登录成功',
      icon: 'success'
    });
  }
});
