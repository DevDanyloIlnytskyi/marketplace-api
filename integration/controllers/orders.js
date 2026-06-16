const orderService = require('../services/orders');
const { successResponse, notFoundError } = require('../../shared/integration/http');

async function listOrders(req, res) {
  const data = await orderService.listOrders(req.models, {
    active: orderService.parseBooleanQuery(req.query.active),
    since: req.query.since,
    cursor: req.query.cursor,
    limit: req.query.limit,
  });
  return successResponse(res, req, data);
}

async function getOrderById(req, res) {
  const order = await orderService.getOrderById(req.models, req.params.id);
  if (!order) {
    throw notFoundError('Order not found.');
  }
  return successResponse(res, req, order);
}

module.exports = {
  listOrders,
  getOrderById,
};
