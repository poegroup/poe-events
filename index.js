/**
 * Module dependencies
 */

var stack = require('simple-stack-common');
var envs = require('envs');
var auth = require('./lib/auth');
var ironmq = require('./lib/ironmq');
var Batch = require('batch');
var ngrok = require('ngrok');
var spawn = require('child_process').spawn;
var os = require('os');

/**
 * Lookup env variables
 */

var NODE_ENV = envs('NODE_ENV', 'production');

exports = module.exports = function(handle, opts) {
  opts = opts || {};

  /**
   * Expose the app
   */

  var app = module.exports = stack({
    metric: {
      context: {
        source: opts.name ? opts.name + '-' + NODE_ENV : null
      }
    }
  });

  /**
   * Force json since ironmq is sending it in text/plain
   */

  app.useBefore('json', '/events', function forceJSON(req, res, next) {
    req.headers['content-type'] = 'application/json';
    next();
  });

  /**
   * Routes
   */

  app.get('/', function(req, res) {
    var body = {
      events: {
        href: req.base + '/events'
      }
    };

    if (NODE_ENV === 'development') body.tests = {
      href: req.base + '/tests'
    }

    res.json(body);
  });

  app.post('/events/:namespace', auth(), function(req, res, next) {
    var body = req.body;

    req.metric.context({}).debug('poe-events')(body);

    res.on('close', function() {
      req.emit('close');
    });

    handle(req, req.params.namespace, body, function(err) {
      if (err) return next(err);
      res.send(200);
    });
  });

  app.queue = ironmq;

  return app;
};

/**
 * Subscribe to the queues
 */

exports.subscribe = function(handlers, fn) {
  var batch = new Batch();

  Object.keys(handlers).forEach(function(name) {
    batch.push(function(cb) {
      ironmq(name, cb);
    });
  });

  batch.end(fn);
};

/**
 * Ngrok the server
 */

exports.ngrok = function(cb) {
  var PORT = envs.int('PORT');
  var argv = process.argv;
  var command = argv[2];
  var args = argv.slice(3);

  ngrok.connect(PORT, function(err, url) {
    process.env.IRONMQ_SUFFIX = process.env.IRONMQ_SUFFIX || '_dev_' + os.hostname();
    process.env.SUBSCRIPTION_URL = url;
    process.env.TMP_QUEUES = '1';

    spawn(command, args, {stdio: 'inherit'});

    cb(err, url);
  });

  process.on('SIGINT', disconnect);
  process.on('SIGTERM', disconnect);

  function disconnect() {
    ngrok.disconnect();
  };
};
