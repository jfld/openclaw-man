const config = require('../config');

// 存储键名常量
const KEY_ACCESS_TOKEN = 'access_token';
const KEY_REFRESH_TOKEN = 'refresh_token';
const KEY_TOKEN_EXPIRES_AT = 'token_expires_at';

/**
 * 保存 Token 到本地存储
 */
function saveToken(accessToken, refreshToken, expiresIn) {
  wx.setStorageSync(KEY_ACCESS_TOKEN, accessToken);
  if (refreshToken) {
    wx.setStorageSync(KEY_REFRESH_TOKEN, refreshToken);
  }
  // 提前 60 秒视为过期，避免边界问题
  const expiresAt = Date.now() + (expiresIn - 60) * 1000;
  wx.setStorageSync(KEY_TOKEN_EXPIRES_AT, expiresAt);
}

/**
 * 清除本地 Token
 */
function clearToken() {
  wx.removeStorageSync(KEY_ACCESS_TOKEN);
  wx.removeStorageSync(KEY_REFRESH_TOKEN);
  wx.removeStorageSync(KEY_TOKEN_EXPIRES_AT);
}

/**
 * 登录并获取 Token
 * @returns {Promise<string>} access_token
 */
async function loginAndGetToken() {
  try {
    // 1. 微信登录获取 code
    const loginRes = await wx.login();
    const code = loginRes.code;
    
    if (!code) {
      throw new Error('微信登录失败，未获取到 code');
    }

    // 2. 调用后端接口换取 Token
    // 注意：这里使用 wx.request 的 Promise 封装或直接回调，为了简洁这里用 Promise
    const res = await new Promise((resolve, reject) => {
      wx.request({
        url: `${config.apiBaseUrl}/auth/weapp/token`,
        method: 'POST',
        data: {
          grant_type: 'weapp_code',
          code
          // appid: '...' 
        },
        header: {
          'Content-Type': 'application/json'
        },
        success: resolve,
        fail: reject
      });
    });

    if (res.statusCode === 200 && res.data && res.data.access_token) {
      const { access_token, refresh_token, expires_in } = res.data;
      saveToken(access_token, refresh_token, expires_in);
      return access_token;
    } else {
      console.error('登录后端接口失败', res);
      const errorMsg = (res.data && res.data.detail) || res.errMsg || 'Unknown error';
      throw new Error(`登录后端接口失败: ${res.statusCode} - ${JSON.stringify(errorMsg)}`);
    }
  } catch (err) {
    console.error('Login process failed:', err);
    throw err;
  }
}

/**
 * 刷新 Token
 * @returns {Promise<string|null>} new access_token or null
 */
async function refreshToken() {
  const refreshTokenStr = wx.getStorageSync(KEY_REFRESH_TOKEN);
  if (!refreshTokenStr) return null;

  try {
    const res = await new Promise((resolve, reject) => {
      wx.request({
        url: `${config.apiBaseUrl}/auth/refresh`,
        method: 'POST',
        data: {
          refresh_token: refreshTokenStr
        },
        header: {
          'Content-Type': 'application/json'
        },
        success: resolve,
        fail: reject
      });
    });

    if (res.statusCode === 200 && res.data && res.data.access_token) {
      const { access_token, refresh_token, expires_in } = res.data;
      saveToken(access_token, refresh_token, expires_in);
      return access_token;
    } else {
      // 刷新失败（如 refresh_token 也过期了），清除本地存储
      clearToken();
      return null;
    }
  } catch (err) {
    console.error('Refresh token failed:', err);
    return null;
  }
}

/**
 * 获取有效的 Access Token
 * 如果过期则尝试刷新，刷新失败则重新登录
 */
async function ensureToken() {
  let token = wx.getStorageSync(KEY_ACCESS_TOKEN);
  const expiresAt = wx.getStorageSync(KEY_TOKEN_EXPIRES_AT) || 0;

  // 检查是否过期
  if (!token || Date.now() > expiresAt) {
    // 尝试刷新
    token = await refreshToken();
    
    // 刷新失败，则重新登录
    if (!token) {
      token = await loginAndGetToken();
    }
  }
  
  return token;
}

/**
 * 检查是否已登录（本地判断）
 */
function isLogged() {
  const token = wx.getStorageSync(KEY_ACCESS_TOKEN);
  const expiresAt = wx.getStorageSync(KEY_TOKEN_EXPIRES_AT) || 0;
  return token && Date.now() < expiresAt;
}

module.exports = {
  loginAndGetToken,
  refreshToken,
  ensureToken,
  clearToken,
  isLogged
};
