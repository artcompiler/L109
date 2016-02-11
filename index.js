/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil; tab-width: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/*
   Web service for compiling L109.
*/

var http = require('http');
var express = require('express')
var app = express();

app.set('port', (process.env.PORT || 5109));
app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
  res.send("Hello, L109!");
});

var compiler = require("./lib/compile.js");

app.get('/compile', function(req, res) {
  var data = "";
  req.on("data", function (chunk) {
    data += chunk;
  });
  req.on('end', function () {
    var src = JSON.parse(data).src;
    compiler.compile(src, function (err, obj) {
      if (err) {
        res.send({
          error: err
        });
      } else {
        res.send(obj);
      }
    });
  });
  req.on('error', function(e) {
    console.log("ERROR: " + e);
    res.send(e);
  });
});

app.listen(app.get('port'), function() {
  global.port = app.get('port');
  console.log("Node app is running at localhost:" + app.get('port'))
});

process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err.stack);
});
