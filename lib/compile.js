(function() {
    "use strict";
    /* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil; tab-width: 2 -*- */
    /* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
    /* Copyright (c) 2014, Art Compiler LLC */

    var _ = require("underscore");
    var http = require('http');
    var querystring = require("querystring");

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

        "MATH-RAND" : random,
        "RAND" : random,
        "PLUS" : plus,
        "CONCAT" : concat,
        "MINUS" : minus,
        "TIMES" : times,
        "FRAC" : frac,
        "EXPO" : expo,

        "ADD" : plus,
        "SUB" : minus,
        "MUL" : mul,
        "DIV" : div,

        "PI": pi,
        "COS": cos,
        "SIN": sin,
        "ATAN": atan,
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

      function program(node, cc) {
        var elts = [ ]
        elts.push(visit(node.elts[0], cc))
        return {
          "tag": "",
          //            "class": "program",
          "elts": elts
        }
      }

      function exprs(node, cc) {
        var elts = []
        if (node.elts) {
          for (var i = 0; i < node.elts.length; i++) {
            elts.push(visit(node.elts[i], cc))
          }
        }
        if (elts.length===1) {
          return elts[0]
        }
        return {
          tag: "",
          //            class: "exprs",
          elts: elts
        }
      }

      function list(node, cc) {
        var elts = []
        if (node.elts) {
          for (var i = 0; i < node.elts.length; i++) {
            elts.push(visit(node.elts[i], cc));
          }
        }
        return "[" + elts[0].elts + "]";
      }

      function random(node) {
        var elts = [];
        var min = +visit(node.elts[0]);
        var max = +visit(node.elts[1]);
        if (max < min) {
          var t = max;
          max = min;
          min = t;
        }
        var rand = Math.random();
        var num = min + Math.floor((max-min)*rand);
        return num;
      }

      function concat(node) {
        var v2 = visit(node.elts[0]);
        var v1 = visit(node.elts[1]);
        return "" + v2 + v1;
      }

      function plus(node) {
        var v2 = visit(node.elts[0]);
        var v1 = visit(node.elts[1]);
        return v1 + "+" + v2;
      }

      function minus(node) {
        var v2 = visit(node.elts[0]);
        var v1 = visit(node.elts[1]);
        return v1 + "-" + v2;
      }

      function times(node) {
        var v2 = visit(node.elts[0]);
        var v1 = visit(node.elts[1]);
        return v1 + " \\times " + v2;
      }

      function frac(node) {
        var v1 = visit(node.elts[1]);
        var v2 = visit(node.elts[0]);
        return "\\frac{" + v1 + "}{" + v2 + "}";
      }

      function mul(node) {
        return visit(node, mathValueVisitor);
      }

      function div(node) {
        var v1 = visit(node.elts[0]);
        var v2 = visit(node.elts[1]);
        return v1 + " \\div " + v2;
      }

      function expo(node) {
        var v2 = visit(node.elts[0]);
        var v1 = visit(node.elts[1]);
        return v1 + "^{" + v2 + "}";
      }

      function toHexString(n, size) {
        if (n < 0 && n > -0x8000) {
          // Encode negatives as signed integers
          n = 0x10000 + n;
        }
        var str = n.toString(16).toUpperCase();
        if (str.length > size) {
          console.log("ERROR toHexString() value to large: " + n);
        }
        var padding = "";
        for (var i = size - str.length; i > 0; i--) {
          padding += "0";
        }
        return padding + str;
      }

      function get(path, data, cc) {
        if (data) {
          path += "?" + querystring.stringify(data);
        }
        var options = {
          method: "GET",
          host: "www.graffiticode.org",
          path: path,
        };
        var req = http.get(options, function(res) {
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
      
      function data(node, cc) {
        var str = ""+visit(node.elts[0]);
        get("/pieces/L106?q=" + str, null, function (data) {
          var list = [];
          for (var i = 0; i < data.length; i++) {
            list[i] = data[i].id        
          }
          get("/code", {list: String(list)}, function (data) {
            cc(data);
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

      function bool(node) {
        return node.elts[0];
      }

      function num(node) {
        return node.elts[0];
      }

      function str(node) {
        return node.elts[0];
      }

      function parens(node) {
        var v1 = visit(node.elts[0]);
        return "(" + v1 + ")";
      }

      function ident(node) {
        return node.elts[0];
      }

      function pi(node) {
        return "\\pi";
      }

      function cos(node) {
        var v1 = visit(node.elts[0]);
        return "\\cos" + v1;
      }

      function sin(node) {
        var v1 = visit(node.elts[0]);
        return "\\sin" + v1;
      }

      function atan(node) {
        var v1 = visit(node.elts[0]);
        return "\\atan" + v1;
      }

      function stub(node) {
        return "";
      }
    }();


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
        cc(node);
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
      function compile(src, next) {
        transformer.transform(src, function (data) {
          renderer.render(data, function (data) {
            next(null, data);
          });
        });
      }
    }();
}).call(this);