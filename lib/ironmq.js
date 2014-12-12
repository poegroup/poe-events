/**
 * Module dependencies
 */

var envs = require('envs');
var os = require('os');
var IronMQ = require('iron_mq').Client;

var SUFFIX = envs('IRONMQ_SUFFIX', '_' + envs('NODE_ENV', 'production'));
var TMP_QUEUES = envs('TMP_QUEUES');
var ERROR_QUEUE = envs('ERROR_QUEUE');
var SUBSCRIPTION_URL = envs('SUBSCRIPTION_URL');
var EVENT_TOKEN = envs('EVENT_TOKEN');

var client = new IronMQ({
  token: envs('IRONMQ_TOKEN'),
  project_id: envs('IRONMQ_PROJECT_ID')
});

var queues = {};

exports = module.exports = function(name, body, fn) {
  if (typeof body === 'function') {
    fn = body;
    body = null;
  }
  get(name + SUFFIX, name, function(err, queue) {
    if (err) return fn(err);
    if (!body) return fn();
    queue.post(JSON.stringify(body), fn);
  });
};

function get(name, shortName, fn) {
  if (queues[name]) return fn(null, queues[name]);

  var queue = client.queue(name);

  queue.update({
    push_type: 'multicast',
    retries: 5
    // error_queue: ERROR_QUEUE
  }, function(err) {
    if (err) return fn(err);
    queue.add_subscribers({url: url(shortName)}, function(err) {
      if (err) return fn(err);
      fn(null, queue);
    });
  });
}

function url(shortName) {
  var href = SUBSCRIPTION_URL + '/events/' + shortName;
  if (EVENT_TOKEN) href += '?token=' + EVENT_TOKEN;
  return href;
}

function disconnect() {
  for (var name in queues) {
    queues[name].del_queue(function(err, body) {
      console.log('DELETING QUEUE', name);
      if (err) console.error(err.stack || err.message);
    });
  }
};

if (envs('TMP_QUEUES')) {
  process.on('SIGINT', disconnect);
  process.on('SIGTERM', disconnect);
}
