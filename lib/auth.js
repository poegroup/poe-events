/**
 * Module dependencies
 */

var envs = require('envs');

var EVENT_TOKEN = envs('EVENT_TOKEN');

module.exports = function() {
  return function(req, res, next) {
    if (!EVENT_TOKEN) next();
    var token = req.query.token || (req.body && req.body.token);
    if (EVENT_TOKEN !== token) return res.send(403);
    next();
  };
};
