/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil; tab-width: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* copyright (c) 2014, Jeff Dyer */

exports.viewer = (function () {

  var CENTER_X = 320;
  var CENTER_Y = 180;
  var SCALE = 2;
  var RADIUS = 100*SCALE;
  var STEP_LENGTH = .1745*SCALE;
  var leftX = 0, leftY = 0, rightX = 0, rightY = 0;
  var angle = 0;
  var penX = 0, penY = 0;
  var penState = true;
  var trackState = false;
  var lastInkX = Number.MAX_VALUE, lastInkY = Number.MAX_VALUE, needsInk = true;
  var INK_WEIGHT = 1;
  var INK_DISTANCE = INK_WEIGHT / 2;
  var INK_OPACITY = 0.4;
  var ccode = "";

  function reset() {
    angle = 0;
    leftX = CENTER_X + RADIUS/2;
    leftY = CENTER_Y;
    rightX = CENTER_X - RADIUS/2;
    rightY = CENTER_Y;
    penX = 0;
    penY = 0;
    penState = false;
    trackState = false;
    ccode = "";
  }

  function round(n) {
    return n > 0x7FFF ? n - 0x10000 : n;
  }

  function updateObj(obj) {
    objCodeMirror.setValue(obj);
  }

  function update(obj, src, pool) {
    reset();
    exports.src = src;
    exports.pool = pool;
    exports.obj = obj;
    var c, i = 0;
    var data = [];
    while (i < obj.length) {
      switch ((c = obj.charAt(i++))) {
      case "S":
        switch ((c = obj.charAt(i++))) {
        case "S":
          lsteps = round(parseInt(obj.substring(i, i + 4), 16));
          rsteps = round(parseInt(obj.substring(i + 4, i + 8), 16));
          i += 8;
          data = data.concat(step(lsteps, rsteps));
          break;
        case "T":
          trackState = true;
          break;
        }
        break;
      case "P":
        switch ((c = obj.charAt(i++))) {
        case "U":
          penUp();
          break;
        case "D":
          penDown();
          break;
        }
        break;
      }
    }

    updateObj(JSON.stringify(obj.json, null, 2));
    $("#graff-view").html('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">');
    var svg = d3.select("#graff-view svg");
    var circle = svg.selectAll("circle")
      .data(data);

    circle.exit().remove();
    
    circle.enter().append("circle")
      .attr("r", 1);
    
    circle
      .attr("cx", function(d) { return d.cx; })
      .attr("cy", function(d) { return d.cy; })
      .attr("r", function(d) { return d.r; })
      .style("fill", function(d) { return d.fill; })
      .style("stroke", function(d) { return d.stroke; });


//    var bbox = $("#graff-view svg")[0].getBBox();
//    $("#graff-view svg").attr("height", (bbox.height + 40) + "px");
//    $("#graff-view svg").attr("width", (bbox.width + 40) + "px");

    console.log(ccode);
  }

  // Each step taken needs to be relative to the position and direction of the
  // current state.
  function step(lsteps, rsteps) {
    ccode += "step(" + lsteps + ", " + rsteps + ");\n";
    var dirL = lsteps < 0 ? 1 : -1;
    var dirR = rsteps < 0 ? 1 : -1;
    lsteps = Math.abs(lsteps);
    rsteps = Math.abs(rsteps);
    var points = [];
    var offset = 0;
    var delta = 0;
    var args = [];
    if (lsteps >= rsteps) {
      if (rsteps > 0) {
        delta = (lsteps - rsteps) / rsteps;  // 3
        for ( ; rsteps > 0; ) {
          offset += delta;  // Each lstep is equal to rstep plus delta.
          stepOneLeft(dirL);
          stepOneRight(dirR);
          lsteps--;
          rsteps--;
          ink(args);
          for(; offset >= 1; offset--) {  // 3 * 0 | 3 * 1
            stepOneLeft(dirL);
            lsteps--;
            ink(args);
          }
        }
      }
      // rsteps === 0. only lsteps left
      for(; lsteps > 0; lsteps--) {  // 3 * 0 | 3 * 1
        stepOneLeft(dirL);
        ink(args);
      }
    } else {
      if (lsteps > 0) {
        delta = (rsteps - lsteps) / lsteps;
        for ( ; lsteps > 0; ) {
          offset += delta;
          stepOneLeft(dirL);
          stepOneRight(dirR);
          lsteps--;
          rsteps--;
          ink(args);
          for(; offset >= 1; offset--) {  // 3 * 0 | 3 * 1
            stepOneRight(dirR);
            rsteps--;
            ink(args);
          }
        }
      }
      // lsteps === 0. only rsteps left
      for(; rsteps > 0; rsteps--) {  // 3 * 0 | 3 * 1
        stepOneRight(dirR);
        ink(args);
      }
    }
    return args;

    function checkInk() {
      var dx = penX - lastInkX;
      var dy = penY - lastInkY;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > INK_DISTANCE) {
        needsInk = true;
        lastInkX = penX;
        lastInkY = penY;
      } else {
        needsInk = false;
      }
    }

    function ink(args) {
      checkInk();
      if (penState && needsInk) {
        args.push({
          "tag": "ellipse",
          "cx": penX,
          "cy": penY,
          "r": INK_WEIGHT,
          "fill": "rgba(0,100,200," + INK_OPACITY + ")",
          "stroke": "rgba(0,0,0,0)",
        });
      }
      if (trackState) {
        args.push({
          "tag": "ellipse",
          "cx": leftX,
          "cy": leftY,
          "r": .5,
          "fill": "rgba(255,0,0,.1)",
          "stroke": "rgba(0,0,0,0)",
        }, {
          "tag": "ellipse",
          "cx": rightX,
          "cy": rightY,
          "r": .5,
          "fill": "rgba(0,255,0,.1)",
          "stroke": "rgba(0,0,0,0)",
        });
      }
    }
  }

  function stepOneLeft(dir) {
    angle -= dir * STEP_LENGTH / RADIUS;
    var dx = RADIUS * Math.cos(angle);
    var dy = RADIUS * Math.sin(angle);
    leftX = rightX + dx;
    leftY = rightY + dy;
    penX = rightX + dx/2;
    penY = rightY + dy/2;
  }

  function stepOneRight(dir) {
    angle += dir * STEP_LENGTH / RADIUS;
    var dx = RADIUS * Math.cos(Math.PI + angle);
    var dy = RADIUS * Math.sin(Math.PI + angle);
    rightX = leftX + dx;
    rightY = leftY + dy;
    penX = leftX + dx/2;
    penY = leftY + dy/2;
  }

  function penUp() {
    ccode += "penUp();\n";
    penState = false;
  }

  function penDown() {
    ccode += "penDown();\n";
    penState = true;
  }

  function showTrack() {
    trackState = true;
  }

  function capture() {

    // My SVG file as s string.
    var mySVG = $("#graff-view").html();
    // Create a Data URI.
    // Load up our image.

    // Set up our canvas on the page before doing anything.
    var old = document.getElementById('graff-view').children[0];
    var myCanvas = document.createElement('canvas');
    myCanvas.width = 640;
    myCanvas.height = 360;

    document.getElementById('graff-view').replaceChild(myCanvas, old);
    // Get drawing context for the Canvas
    var myCanvasContext = myCanvas.getContext('2d');
    // Load up our image.
    // Render our SVG image to the canvas once it loads.
    var source = new Image();
    source.src = "data:image/svg+xml;base64," + window.btoa(mySVG);
    myCanvasContext.drawImage(source,0,0);
    var dataURL = myCanvas.toDataURL();
    return '<html><img class="thumbnail" src="' + dataURL + '"/></html>';
  }

  return {
    update: update,
    capture: capture,
  };
})();
