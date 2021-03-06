var express = require("express");
var express_session = require("express-session");
var http = require("http");
var babelon = require("babelon");
var fs = require("fs");
var path = require("path");
var url = require("url");
var recursiveReadSync = require("recursive-readdir-sync");
var anyBody = require("body/any");
var anyMulter = require("multer")().any();
var cors = require("cors");
var ClusterStore = require("strong-cluster-connect-store")(express_session);
var expressWinston = require('express-winston');
var winston = require('winston');

var apiculator = {};

apiculator.clusterMasterSetup = function() {
  ClusterStore.setup();
}

apiculator.createServer = function(api_dir, helpers, dynamic_helpers, opts = {}) {
  api_dir = path.resolve(api_dir);
  var app = express();
  app.use(cors({ credentials: true, origin: true }));
  app.options("*", cors());
  app.use(
    express_session({
      secret: "not-so-secret",
      resave: false,
      saveUninitialized: false,
      store: new ClusterStore()
    })
  );
  if (!opts || opts.use_logger !== false) {
    app.use(expressWinston.logger({
      transports: [
        new winston.transports.Console()
      ],
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, label, timestamp }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
      msg: "{{req.method}} {{req.url}}"
    }));
  }
  var routes = apiculator.parseRoutes(api_dir);
  for (var route in routes) {
    var route_info = routes[route];
    if (route_info.rules) {
      app.all(route, function(req, res) {
        anyMulter(req, res, function(err) {
          anyBody(req, res, function(err, body) {
            if (!err && body) {
              req.body = body;
            }
            var req_helpers = helpers;
            if (dynamic_helpers) {
              req_helpers = Object.assign(
                {},
                req_helpers,
                dynamic_helpers(req)
              );
            }
            apiculator.applyMatchingRule(
              api_dir,
              req_helpers,
              routes,
              req,
              res
            );
          });
        });
      });
    } else {
      for (var i in route_info.methods) {
        var meth = route_info.methods[i];
        app[meth](route, function(req, res) {
          anyMulter(req, res, function(err) {
            anyBody(req, res, function(err, body) {
              if (!err && body) {
                req.body = body;
              }
              var req_helpers = helpers;
              if (dynamic_helpers) {
                req_helpers = Object.assign(
                  {},
                  req_helpers,
                  dynamic_helpers(req)
                );
              }
              apiculator.applyMatchingTemplate(
                api_dir,
                req_helpers,
                routes,
                req,
                res
              );
            });
          });
        });
      }
    }
  }
  if (!opts || opts.use_logger !== false) {
    app.use(expressWinston.errorLogger({
      transports: [
        new winston.transports.Console()
      ],
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json()
      )
    }));
  }
  return app;
};

apiculator.parseRoutes = function(api_dir, cb) {
  var routes = {};
  api_dir = path.resolve(api_dir);
  var files = recursiveReadSync(api_dir);
  files = files.map(fp => {
    return fp.substr(api_dir.length);
  });
  files = files.sort((a, b) => {
    var asplit = a.split("/");
    var bsplit = b.split("/");
    var is_a_longer = asplit.length > bsplit.length;
    var shorter_length = is_a_longer ? bsplit.length : asplit.length;
    for (var i = 0; i < shorter_length; i++) {
      if (asplit[i] === bsplit[i]) {
        // noop
      } else if (asplit[i].indexOf(":") != -1 && bsplit[i].indexOf(":") != -1) {
        return bsplit[i].indexOf(":") - asplit[i].indexOf(":");
      } else if (asplit[i].indexOf(":") != -1) {
        return 1;
      } else if (bsplit[i].indexOf(":") != -1) {
        return -1;
      } else if (asplit.length == bsplit.length) {
        return asplit[i].localeCompare(bsplit[i]);
      }
    }
    return !is_a_longer;
  });
  files.map(fp => {
    var segments = fp.split("/");
    var file = segments.pop();
    var path = segments.join("/");
    if (path === "") {
      path = "/";
    }
    if (!routes[path]) {
      routes[path] = {
        rules: null,
        templates: [],
        methods: []
      };
    }
    var route = routes[path];
    if (file.match(/^_rules\./)) {
      route.rules = file;
    } else {
      var m = file.match(/^(get|post|put|delete|patch)[\.|\+]/);
      if (m && route.methods.indexOf(m[1]) == -1) {
        route.methods.push(m[1]);
      }
      route.templates.push(file);
    }
    routes[path] = route;
  });
  return routes;
};

apiculator.applyMatchingRule = function(api_dir, helpers, routes, req, res) {
  var route_info = routes[req.route.path];
  var rules_file = `${api_dir}${req.route.path}/_rules.babelon`;
  var rules = babelon.evalFile(rules_file, {});

  var req_tags = [];
  if (req.headers["x-apiculator-tags"]) {
    req_tags = req.headers["x-apiculator-tags"].split(",");
  }

  var first_matching_rule = null;
  for (var i in rules) {
    var rule = rules[i];

    if (!rule.request) {
      first_matching_rule = rule;
      break;
    }

    if (rule.request.method) {
      if (typeof rule.request.method === "function") {
        if (!rule.request.method(req.method.toLowerCase())) {
          continue;
        }
      } else {
        if (rule.request.method !== req.method.toLowerCase()) {
          continue;
        }
      }
    }

    if (rule.request.query) {
      if (typeof rule.request.query === "function") {
        if (!rule.request.query(req.query)) {
          continue;
        }
      }
    }

    if (rule.request.params) {
      if (typeof rule.request.params === "function") {
        if (!rule.request.params(req.params)) {
          continue;
        }
      }
    }

    if (rule.request.tags) {
      if (typeof rule.request.tags === "function") {
        if (!rule.request.tags(req_tags)) {
          continue;
        }
      } else if (Array.isArray(rule.request.tags)) {
        if (rule.request.tags.every(v => req_tags.indexOf(v) !== -1)) {
        } else {
          continue;
        }
      }
    }

    if (rule.request.body) {
      if (typeof rule.request.body === "function") {
        if (!rule.request.body(req.body)) {
          continue;
        }
      }
    }

    if (rule.request.session) {
      if (typeof rule.request.session === "function") {
        if (!rule.request.session(req.session)) {
          continue;
        }
      }
    }

    if (rule.request.tags) {
      if (typeof rule.request.tags === "function") {
        var tags = []; // TODO
        if (!rule.request.tags(tags)) {
          continue;
        }
      }
    }

    first_matching_rule = rule;
    break;
  }

  var locals = Object.assign(helpers, {
    params: req.params,
    body: req.body,
    tags: req_tags,
    session: req.session
  });

  if (first_matching_rule) {
    var rule = first_matching_rule;
    if (rule.response.session) {
      var req_session = rule.response.session(locals);
      for (var k in req_session) {
        req.session[k] = req_session[k];
      }
    } else if (rule.response.session === null) {
      req.session.destroy();
    }
    if (rule.response.redirect) {
      var redirect = rule.response.redirect;
      if (typeof redirect === "function") {
        redirect = redirect(locals);
      }
      res.redirect(redirect);
    } else {
      if (rule.response.status) {
        res.status(rule.response.status);
      }

      if (rule.response.json) {
        res.json(rule.response.json);
      } else if (rule.response.template) {
        apiculator.sendRenderedTemplate(
          res,
          `${api_dir}${req.route.path}/${rule.response.template}`,
          locals
        );
      }
    }
    // res.end();
  } else {
    res.status(404);
    // .end();
  }
};

apiculator.applyMatchingTemplate = function(
  api_dir,
  helpers,
  routes,
  req,
  res
) {
  var meth = req.method.toLowerCase();
  var route_info = routes[req.route.path];
  if (route_info.methods.indexOf(meth) == -1) {
    res.status(404);
    //.end();
  } else {
    var default_re = new RegExp("^" + meth + "\\.");
    var tagged_re = new RegExp("^" + meth + "\\+");

    var default_template = route_info.templates.filter(tn =>
      tn.match(default_re)
    )[0];
    var tagged_templates = route_info.templates.filter(tn =>
      tn.match(tagged_re)
    );

    var req_tags = [];
    if (req.headers["x-apiculator-tags"]) {
      req_tags = req.headers["x-apiculator-tags"].split(",");
    }

    var best_tagged_template = null;
    var best_tag_count = 0;
    for (var tagged_template of tagged_templates) {
      var tag_count = 0;
      var missing_tag_count = 0;
      var tags = tagged_template.split(".")[0].split("+");
      tags.shift();
      for (var i in tags) {
        if (req_tags.indexOf(tags[i]) === -1) {
          missing_tag_count += 1;
        } else {
          tag_count += 1;
        }
      }
      if (missing_tag_count == 0 && tag_count > best_tag_count) {
        best_tagged_template = tagged_template;
        best_tag_count = tag_count;
      }
    }

    var locals = Object.assign(helpers, {
      params: req.params,
      query: req.query,
      body: req.body,
      tags: req_tags,
      session: req.session
    });

    const tmpl_name = best_tagged_template || default_template;
    if (tmpl_name) {
      const tmpl = `${api_dir}${req.route.path}/${tmpl_name}`;
      if (tmpl_name.match(/.js$/)) {
        delete require.cache[require.resolve(tmpl)];
        return require(tmpl)(req, res);
      } else {
        apiculator.sendRenderedTemplate(res, tmpl, locals);
      }
    } else {
      res.status(404);
      // .end();
    }
  }
};

apiculator.sendRenderedTemplate = function(res, tmpl, locals) {
  if (tmpl.match(/\.babelon$/)) {
    res.json(babelon.evalFile(tmpl, locals));
  } else if (tmpl.match(/\.json$/)) {
    res.json(JSON.parse(fs.readFileSync(tmpl).toString()));
  } else if (tmpl.match(/\.html$/)) {
    res.sendFile(tmpl);
  }
};

module.exports = apiculator;
