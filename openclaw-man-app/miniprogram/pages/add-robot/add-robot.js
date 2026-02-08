const app = getApp();
const { createRobot, getRobotDetail, updateRobot } = require('../../api/robot');

Page({
  data: {
    name: '',
    description: '',
    avatar: '/image/icon_API.png',
    iconBase64: '', // Store Base64 string for upload
    mode: 'create', // 'create' or 'edit'
    robotId: null
  },

  onLoad(options) {
    if (options.mode === 'edit' && options.id) {
      wx.setNavigationBarTitle({ title: '编辑机器人' });
      this.setData({
        mode: 'edit',
        robotId: options.id
      });
      this.loadRobotDetail(options.id);
    }
  },

  async loadRobotDetail(id) {
    wx.showLoading({ title: '加载中...' });
    try {
      const robot = await getRobotDetail(id);
      this.setData({
        name: robot.name,
        description: robot.description,
        avatar: robot.icon || robot.avatar || '/image/icon_API.png'
      });
      // 注意：这里没有回填 iconBase64，因为如果用户不修改图片，我们就不传 icon 字段
    } catch (err) {
      console.error('加载机器人详情失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.processImage(tempFilePath);
      }
    });
  },

  processImage(filePath) {
    wx.showLoading({ title: '处理图片中...' });
    
    wx.getImageInfo({
      src: filePath,
      success: (res) => {
        const { width, height } = res;
        // Calculate crop area (center square)
        const shortSide = Math.min(width, height);
        const x = (width - shortSide) / 2;
        const y = (height - shortSide) / 2;
        
        const ctx = wx.createCanvasContext('compressCanvas', this);
        
        // Draw cropped and resized image to 128x128
        // drawImage(url, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        ctx.drawImage(filePath, x, y, shortSide, shortSide, 0, 0, 128, 128);
        
        ctx.draw(false, () => {
          // Add small delay to ensure draw completes
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'compressCanvas',
              width: 128,
              height: 128,
              destWidth: 128,
              destHeight: 128,
              fileType: 'jpg',
              quality: 0.8,
              success: (res) => {
                const processedPath = res.tempFilePath;
                this.setData({
                  avatar: processedPath
                });

                // Convert to Base64
                wx.getFileSystemManager().readFile({
                  filePath: processedPath,
                  encoding: 'base64',
                  success: (data) => {
                    const base64 = 'data:image/jpeg;base64,' + data.data;
                    this.setData({ iconBase64: base64 });
                    wx.hideLoading();
                  },
                  fail: (err) => {
                    console.error('Read file failed', err);
                    wx.hideLoading();
                    wx.showToast({ title: '图片处理失败', icon: 'none' });
                  }
                });
              },
              fail: (err) => {
                console.error('Canvas export failed', err);
                wx.hideLoading();
                wx.showToast({ title: '图片处理失败', icon: 'none' });
              }
            }, this);
          }, 100);
        });
      },
      fail: (err) => {
        console.error('Get image info failed', err);
        wx.hideLoading();
        wx.showToast({ title: '读取图片失败', icon: 'none' });
      }
    });
  },

  async saveRobot() {
    const { name, description, iconBase64, mode, robotId } = this.data;

    if (!name) {
      wx.showToast({
        title: '请输入机器人名称',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: mode === 'edit' ? '保存中...' : '创建中...' });

    try {
      let res;
      if (mode === 'edit') {
        // 编辑模式
        res = await updateRobot(robotId, name, description, iconBase64);
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        // 创建模式
        res = await createRobot(name, description, iconBase64);
        
        // res: { id, robot_id, name, description, api_key, ... }
        // 如果有 API Key，展示给用户
        if (res.api_key) {
            wx.hideLoading();
            
            // 构造新的 JSON 格式
            let copyContent = JSON.stringify({
                "plugins": {
                    "entries": {
                        "openclaw-man": {
                            "enabled": true,
                            "config": {
                                "apiKey": res.api_key,
                                "apiEndpoint": "www.xxxxxx.top/ocms",
                                "useTls": true
                            }
                        }
                    }
                }
            }, null, 2);
            
            // 去掉最外层的大括号，仅保留内容
            copyContent = copyContent.slice(1, -1).trim();

            wx.showModal({
            title: '创建成功',
            content: `您的 API Key 是：\n${res.api_key}\n\n请点击复制保存完整配置。`,
            confirmText: '复制配置',
            showCancel: false,
            success: (modalRes) => {
                if (modalRes.confirm) {
                wx.setClipboardData({
                    data: copyContent,
                    success: () => {
                    // 复制成功后延迟返回，以便用户看到复制成功的提示
                    setTimeout(() => {
                        wx.navigateBack();
                    }, 1500);
                    }
                });
                }
            }
            });
            // return to prevent hideLoading call in finally block interfering with modal if needed
            // but finally block will run anyway. 
            // We set a flag or let it be. showModal is async but non-blocking in logic flow? No, success callback is async.
            // In MP, showModal is a UI call.
            return; 
        } else {
            wx.showToast({
            title: '创建成功',
            icon: 'success'
            });
            setTimeout(() => {
            wx.navigateBack();
            }, 1500);
        }
      }
      
    } catch (err) {
      console.error(err);
      if (err.statusCode !== 401) {
        wx.showToast({
          title: mode === 'edit' ? '保存失败' : '创建失败',
          icon: 'none'
        });
      }
    } finally {
      // 简单处理：如果不是弹窗情况，隐藏 loading
      // 实际上如果弹窗了，hideLoading 可能会把弹窗关掉吗？不会，hideLoading 只关 loading。
      // 但是如果在 success 回调前 hideLoading 没问题。
      // 问题是上面 return 了，这里 finally 还会执行吗？会。
      wx.hideLoading();
    }
  }
});
