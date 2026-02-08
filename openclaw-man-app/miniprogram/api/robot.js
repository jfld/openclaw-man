const { request } = require('../util/request');

/**
 * 获取机器人列表
 * @param {number} skip 
 * @param {number} limit 
 */
function getRobots(skip = 0, limit = 100) {
  return request({
    url: '/robots/',
    method: 'GET',
    data: { skip, limit }
  });
}

/**
 * 创建机器人
 * @param {string} name 
 * @param {string} description 
 * @param {string} icon (optional) Base64 icon string
 */
function createRobot(name, description, icon) {
  const data = { name, description };
  if (icon) {
    data.icon = icon;
  }
  return request({
    url: '/robots/',
    method: 'POST',
    data: data
  });
}

/**
 * 获取单个机器人详情
 * @param {string} robotId 
 */
function getRobotDetail(robotId) {
  return request({
    url: `/robots/${robotId}`,
    method: 'GET'
  });
}

/**
 * 更新机器人信息
 * @param {string} robotId 
 * @param {string} name 
 * @param {string} description 
 * @param {string} icon (optional) Base64 icon string
 */
function updateRobot(robotId, name, description, icon) {
  const data = {};
  if (name) data.name = name;
  if (description) data.description = description;
  if (icon) data.icon = icon;

  return request({
    url: `/robots/${robotId}`,
    method: 'PUT',
    data: data
  });
}

/**
 * 删除机器人
 * @param {string} robotId 
 */
function deleteRobot(robotId) {
  return request({
    url: `/robots/${robotId}`,
    method: 'DELETE'
  });
}

module.exports = {
  getRobots,
  createRobot,
  getRobotDetail,
  updateRobot,
  deleteRobot
};
