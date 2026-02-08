const config = require('../config');
const { ensureToken, clearToken } = require('./auth');

/**
 * 封装 wx.request，自动添加鉴权头并处理 401
 */
function request({ url, method = 'GET', data, header = {} }) {
  // 1. 构造完整 URL
  const fullUrl = url.startsWith('http') ? url : `${config.apiBaseUrl}${url}`;

  return new Promise(async (resolve, reject) => {
    // 2. 获取有效 Token (会自动刷新或重登录)
    let token;
    try {
      token = await ensureToken();
    } catch (e) {
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      return reject(e);
    }

    // 3. 发起请求
    wx.request({
      url: fullUrl,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...header
      },
      success: async (res) => {
        // 4. 处理 401 未授权
        if (res.statusCode === 401) {
          console.warn('Received 401, trying to re-login...');
          clearToken();
          
          try {
            const newToken = await ensureToken();
            // 重发请求
            wx.request({
              url: fullUrl,
              method,
              data,
              header: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${newToken}`,
                ...header
              },
              success: (retryRes) => {
                if (retryRes.statusCode >= 200 && retryRes.statusCode < 300) {
                  resolve(retryRes.data);
                } else {
                  reject(retryRes);
                }
              },
              fail: reject
            });
          } catch (loginErr) {
            reject(loginErr);
            // 引导用户去登录页
             wx.reLaunch({ url: '/pages/login/login' }); 
          }
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          // 其他错误码
          reject(res);
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

module.exports = {
  request
};
