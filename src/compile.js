/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil; tab-width: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright (c) 2014, Art Compiler LLC */

var _ = require("underscore");
var http = require('http');
var https = require('https');
var querystring = require("querystring");
const LOCAL = false;

function getGCHost() {
  const LOCAL = global.port === 5109;
  if (LOCAL) {
    return "localhost";
  } else {
    return "www.graffiticode.com";
  }
}
function getGCPort() {
  const LOCAL = global.port === 5109;
  if (LOCAL) {
    return "3000";
  } else {
    return "443";
  }
}

var transformer = function() {

  function print(str) {
    console.log(str);
  }

  var canvasWidth = 0
  var canvasHeight = 0
  var canvasColor = ""

  var ticket = 1000

  var table = {
    "PROG" : program,
    "EXPRS" : exprs,
    "LIST" : list,
    "BOOL" : bool,
    "NUM" : num,
    "STR" : str,
    "PARENS" : parens,
    "IDENT": ident,

    "DATA" : data,
    "LABEL" : label,
    "HEIGHT" : height,
  }

  var RADIUS = 100;
  var STEP_LENGTH = .1745;
  var leftX = 0, leftY = 0, rightX = 0, rightY = 0;
  var angle = 0;
  var penX, penY;
  var penState;
  var trackState;

  return {
    transform: transform,
    canvasWidth: function() {
      return canvasWidth;
    },
    canvasHeight: function() {
      return canvasHeight;
    },
    canvasColor: function() {
      return canvasColor;
    },
  };

  // CONTROL FLOW ENDS HERE

  var nodePool

  function reset() {
    angle = 0;
    leftX = RADIUS/2;
    leftY = 0;
    rightX = -RADIUS/2;
    rightY = 0;
    penX = 0;
    penY = 0;
    penState = false;
    trackState = false;
  }

  function transform(pool, cc) {
    reset();
    nodePool = pool;
    return visit(pool.root, cc);
  }

  function visit(nid, cc) {
    // Get the node from the pool of nodes.
    var node = nodePool[nid];
    if (node == null) {
      return null;
    } else if (node.tag === void 0) {
      return [ ];  // clean up stubs
    }

    if (isFunction(table[node.tag])) {
      // There is a visitor method for this node, so call it.
      return table[node.tag](node, cc);
    }
    // Otherwise, return the node
    return node;
  }

  function isArray(v) {
    return _.isArray(v);
  }

  function isObject(v) {
    return _isObjet(v);
  }

  function isString(v) {
    return _.isString(v);
  }

  function isPrimitive(v) {
    return _.isNull(v) || _.isString(v) || _.isNumber(v) || _.isBoolean(v);
  }

  function isFunction(v) {
    return _.isFunction(v);
  }

  // BEGIN VISITOR METHODS

  var edgesNode;

  function program(node, resume) {
    var val = [];
    val.push(visit(node.elts[0], function (err, val0) {
      if (val0.length > 0) {
        val0 = val0[0];
      }
      var keys = Object.keys(val0);
      var q = "";
      keys.forEach(function (key) {
        if (q) {
          q += "&";
        }
        q += key + "=" + val0[key];
      });
      get("/pieces/L106?" + q, null, function (data) {
        var list = [];
        for (var i = 0; i < data.length; i++) {
          list[i] = data[i].id
        }
        resume(null, {
          src: val0.src,
          items: list,
          height: val0.height
        });
      });
    }));
  }
  function exprs(node, resume) {
    if (node.elts && node.elts.length > 1) {
      visit(node.elts[0], function (err1, val1) {
        node.elts.shift();
        exprs(node, function (err2, val2) {
          resume([].concat(err1).concat(err2), [].concat(val1).concat(val2));
        });
      });
    } else if (node.elts && node.elts.length > 0) {
      visit(node.elts[0], function (err1, val1) {
        resume([].concat(err1), [].concat(val1));
      });
    } else {
      resume([], []);
    }
  };
  function list(node, cc) {
    var elts = []
    if (node.elts) {
      for (var i = 0; i < node.elts.length; i++) {
        elts.push(visit(node.elts[i], cc));
      }
    }
    return "[" + elts[0].elts + "]";
  }

  function get(path, data, cc) {
    if (data) {
      path += "?" + querystring.stringify(data);
    }
    path = path.trim().replace(/ /g, "+");
    var options = {
      method: "GET",
      host: getGCHost(),
      port: getGCPort(),
      path: path,
    };
    var proto = global.port === 5109 ? http : https;
    var req = proto.get(options, function(res) {
      var data = "";
      res.on('data', function (chunk) {
        data += chunk;
      }).on('end', function () {
        try {
          cc(JSON.parse(data));
        } catch (e) {
          console.log("parse error: " + data);
        }
      }).on("error", function () {
        console.log("error() status=" + res.statusCode + " data=" + data);
      });
    });
  }

  function data(node, resume) {
    visit(node.elts[0], function (err, val) {
      resume(null, {
        src: val
      });
    });
  }

  function label(node, resume) {
    visit(node.elts[0], function (err, val0) {
      visit(node.elts[1], function (err, val1) {
        val1.label = val0;
        resume(null, val1);
      });
    });
  }

  function height(node, resume) {
    visit(node.elts[0], function (err, val0) {
      visit(node.elts[1], function (err, val1) {
        val1.height = val0;
        resume(null, val1);
      });
    });
  }

  function polarToCartesian(centerX, centerY, radiusX, radiusY, angleInDegrees) {
    var angleInRadians = angleInDegrees * Math.PI / 180.0;
    var x = centerX + radiusX * Math.cos(angleInRadians);
    var y = centerY + radiusY * Math.sin(angleInRadians);
    return [x,y];
  }

  function text(node) {
    var elts = [];
    var str = ""+visit(node.elts[0]);
    elts.push(str);
    return {
      "tag": "text",
      "elts": elts,
    };
  }

  function genSym(str) {
    ticket += 1
    return str+"-"+ticket
  }

  function bool(node, resume) {
    resume(null, node.elts[0]);
  }

  function num(node, resume) {
    resume(null, node.elts[0]);
  }

  function str(node, resume) {
    resume(null, node.elts[0]);
  }

  function parens(node) {
    var v1 = visit(node.elts[0]);
    return "(" + v1 + ")";
  }

  function ident(node) {
    return node.elts[0];
  }

  function stub(node) {
    return "";
  }
}()


var renderer = function() {

  var scripts;

  return {
    render: render,
  }

  // CONTROL FLOW ENDS HERE
  function print(str) {
    console.log(str)
  }

  var nodePool

  function render(node, cc) {
    //var str = ""
    //str += visit(node, "  ")
    cc(null, node);
  }

  function visit(node, cc) {
    if (typeof node === "string") {
      return node;
    }
    var tagName = node.tag;
    var elts = "";
    if (node.elts) {
      for (var i = 0; i < node.elts.length; i++) {
        if (node.elts[i]) {  // skip empty elts
          elts += visit(node.elts[i], cc);
        }
      }
    }
    return tagName + elts;
  }
}();

exports.compiler = function () {
  exports.compile = compile;
  function compile(ast, data, resume) {
    transformer.transform(ast, function (err, val) {
      renderer.render(val, function (err, obj) {
        resume(err, obj);
      });
    });
  }
}();
