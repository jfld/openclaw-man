const { request } = require('../util/request');

/**
 * 创建对话
 * @param {string} robotId 机器人ID
 * @param {string} title 对话标题（可选）
 */
function createConversation(robotId, title) {
  return request({
    url: '/conversations/',
    method: 'POST',
    data: {
      robot_id: robotId,
      title: title
    }
  });
}

/**
 * 获取对话列表
 * @param {string} robotId 按机器人ID筛选（可选）
 * @param {number} skip 分页偏移
 * @param {number} limit 分页数量
 */
function getConversations(robotId, skip = 0, limit = 100) {
  const data = { skip, limit };
  if (robotId) {
    data.robot_id = robotId;
  }
  return request({
    url: '/conversations/',
    method: 'GET',
    data: data
  });
}

/**
 * 获取单个对话详情
 * @param {string} conversationId 
 */
function getConversationDetail(conversationId) {
  return request({
    url: `/conversations/${conversationId}`,
    method: 'GET'
  });
}

/**
 * 更新对话信息
 * @param {string} conversationId 
 * @param {string} title 
 */
function updateConversation(conversationId, title) {
  return request({
    url: `/conversations/${conversationId}`,
    method: 'PUT',
    data: { title }
  });
}

/**
 * 删除对话
 * @param {string} conversationId 
 */
function deleteConversation(conversationId) {
  return request({
    url: `/conversations/${conversationId}`,
    method: 'DELETE'
  });
}

module.exports = {
  createConversation,
  getConversations,
  getConversationDetail,
  updateConversation,
  deleteConversation
};
