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
    depth = 0;
    breadth = 0;
  }

  function round(n) {
    return n > 0x7FFF ? n - 0x10000 : n;
  }

  function updateObj(obj) {
    console.log("updateObj() obj=" + JSON.stringify(obj));
    objCodeMirror.setValue(obj);
  }

  var START   = 1;
  var METHOD  = 2;
  var OPTION  = 3;
  var STRING1 = 4;
  var STRING2 = 5;
  var END     = 6;

  function parseSrc(str) {
    var c, brks = [0], state = START;
    var method = "";
    var option = "";
    var arg1 = "";
    var arg2 = "";
    var i = 0;
    while (i < str.length) {
      c = str[i++];
      switch (state) {
      case START:
        switch (c) {
        case " ":
        case "\n":
        case "\t":
          continue; // Eat whitespace.
        case "|":
          while ((c = str[i++]) !== "\n" && c) {
            // Eat comment.
          }
          continue;
        default:
          state = METHOD;
          method += c;
          continue;
        }
        break;
      case METHOD:
        switch (c) {
        case " ":
        case "\n":
        case "\t":
          state = OPTION;
          method += " ";
          continue; // Found end of method.
        case "|":
          while ((c = str[i++]) !== "\n" && c) {
            // Eat comment.
          }
          continue;
        case "\"":
          state = STRING1;
          continue; // Found end of method.
        default:
          method += c;
          continue;
        }
        break;
      case OPTION:
        switch (c) {
        case "\"":
          i--;
          state = STRING1;
          continue; // Found beginning of string.
        case "|":
          while ((c = str[i++]) !== "\n" && c) {
            // Eat comment.
          }
          continue;
        default:
          method += c;
          break;
        }
        break;
      case STRING1:
        switch (c) {
        case "\"":
          while ((c = str[i++]) !== "\"" && c) {
            arg1 += c;
          }
          state = STRING2;
          continue; // Found end of string.
        case "|":
          while ((c = str[i++]) !== "\n" && c) {
            // Eat comment.
          }
          continue;
        default:
          continue; // Eat whitespace.
        }
        break;
      case STRING2:
        switch (c) {
        case "\"":
          while ((c = str[i++]) !== "\"" && c) {
            arg2 += c;
          }
          state = END;
          continue; // Found end of string.
        case "|":
          while ((c = str[i++]) !== "\n" && c) {
            // Eat comment.
          }
          continue;
        default:
          continue; // Eat whitespace.
        }
        continue;
      case END:
        // Eat chars until done.
        break;
      }
    }
    return {
      method: method,
      arg1: arg1,
      arg2: arg2,
    };
  }

  function escapeStr(str) {
    return String(str)
      .replace(/&(?!\w+;)/g, "&amp;")
      .replace(/\n/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function update(obj, src, pool) {
    reset();
    exports.src = src;
    exports.pool = pool;
    exports.obj = obj;
    var c, i = 0;
    var data = [];
    var children = [];
    var obj = JSON.parse(obj);
    var names = {};
    Object.keys(obj).forEach(function (name) {
      if (obj[name].label === "hide") {
        return;
      }
      var src = parseSrc(obj[name].src);
      var method = src.method;
      var arg1 = src.arg1;
      var arg2 = src.arg2;
      try {
        var objStr = obj[name].obj;
        var objObj = JSON.parse(objStr);
        var value = objObj.valueSVG;
        var response = objObj.responseSVG;
        var score = objObj.score;
      } catch (e) {
//        console.log("update() stack=" + e.stack);
      }
      var n;
      if (!(n = names[arg1])) {
        // Add a node to the pool.
        names[arg1] = n = {
          name: arg1,
          svgText: value ? value : response,
          parent: "root",
          children: [],
          names: {},
        };
        children.push(n);
      }
      if (arg2) {
        var o = {};
        o[arg2] = {
          name: method,
          score: score,
          svgText: response,
        };
        n.children = n.children.concat(objToTree(o, arg1, n.names));
      } else {
        n.children = n.children.concat({
          name: method,
          parent: arg1,
          score: score,
          svgText: response,
        });
      }
      breadth++;
    });
    render({
      name: "root",
      parent: null,
      children: children,
    });
  }

  // obj in, tree of nodes out
  var depth = 0;
  var breadth = 0;
  function objToTree(obj, parent, names) {
    var nodes = [];
    Object.keys(obj).forEach(function (name) {
      var n;
      if (!(n = names[name])) {
        names[name] = n = {
          name: name,
          parent: parent,
          children: [],
          svgText: obj[name].svg,
        };
        nodes.push(n);
      }
      if (!obj[name].hasOwnProperty("score")) {
        n.children = n.children.concat(objToTree(obj[name], name));
      } else {
        n.children = n.children.concat({
          parent: name,
          name: String(obj[name].name),
          score: obj[name].score,
        });
      }
      breadth++;
    });
    return nodes;
  }

  var margin = {top: 20, right: 120, bottom: 20, left: 120};

  function render(root) {
    // ************** Generate the tree diagram	 *****************
	  var width = 1960 - margin.right - margin.left;
	  var height = (breadth * 14) - margin.top - margin.bottom;
	  
    var i = 0,
	  duration = 750,
	  root;

    var tree = d3.layout.tree()
	    .size([height, width]);

    var diagonal = d3.svg.diagonal()
	    .projection(function(d) { return [d.y, d.x]; });

    var svgStr =
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
      '<style type="text/css" >' +
      '<![CDATA[' +
      'circle {' +
      '  stroke: #006600;' +
      '  fill:   #00cc00;' +
      '}' +
	    '.node {' +
		  'cursor: pointer;' +
	    '}' +
	    '.node circle {' +
	    'fill: #fff;' +
	    'stroke: steelblue;' +
	    'stroke-width: 3px;' +
	    '}' +
	    '.node text {' +
	    'font: 12px sans-serif;' +
	    '}' +
	    '.link {' +
	    'fill: none;' +
	    'stroke: #ccc;' +
	    'stroke-width: 2px;' +
	    '}' +    
      ']]>' +
      '</style>' +
      '</svg>';

    $("#graff-view").html(svgStr);
    var svg = d3.select("#graff-view svg")
      .attr("width", width + margin.right + margin.left)
	    .attr("height", height + margin.top + margin.bottom)
      .append("g")
	    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    
    root.x0 = height / 2;
    root.y0 = 0;

    update(root);

    d3.select(self.frameElement).style("height", "500px");

    function unescapeXML(str) {
      return String(str)
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"");
    }

    function update(source) {

      // Compute the new tree layout.
      var nodes = tree.nodes(root).reverse(),
	    links = tree.links(nodes);

      // Normalize for fixed-depth.
      nodes.forEach(function(d) { d.y = d.depth * 180; });

      // Update the nodes…
      var node = svg.selectAll("g.node")
	      .data(nodes, function(d) { return d.id || (d.id = ++i); });

      // Enter any new nodes at the parent's previous position.
      var nodeEnter = node.enter().append("g")
	      .attr("class", "node")
	      .attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
	      .on("click", click);

      nodeEnter.append("circle")
	      .attr("r", 1e-6)
	      .style("stroke", function(d) {
          if (d.svgText) {
            d = d;
          }
          var strokeColor;
          switch (d.score) {
          case 1:
            strokeColor = "rgb(100, 255, 100)";
            break;
          case 0:
          case -1:
            strokeColor = "rgb(255, 100, 100)";
            break;
          default:
            strokeColor = "lightsteelblue";
            break;
          }
          return strokeColor;
        })
	      .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

      nodeEnter.append("image")
        .attr("xlink:href", function (d) {
          if (d.svgText) {
            console.log(unescapeXML(d.svgText));
            return "data:image/svg+xml;utf8," + unescapeXML(d.svgText);
          }
          return "";
        })
        .attr("width", "30")
        .attr("height", "30");
	      //.style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

      nodeEnter.append("text")
	      .attr("x", function(d) { return d.children || d._children ? -13 : 13; })
	      .attr("dy", ".35em")
	      .attr("text-anchor", function(d) { return d.children || d._children ? "end" : "start"; })
	      .text(function(d) { return d.name; })
	      .style("fill-opacity", 1e-6);

      // Transition nodes to their new position.
      var nodeUpdate = node.transition()
	      .duration(duration)
	      .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

      nodeUpdate.select("circle")
	      .attr("r", 4)
	      .style("fill", function(d) {
          return d._children ? "lightsteelblue" : "#fff";
        });

      nodeUpdate.select("text")
	      .style("fill-opacity", 1);

      // Transition exiting nodes to the parent's new position.
      var nodeExit = node.exit().transition()
	      .duration(duration)
	      .attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
	      .remove();

      nodeExit.select("circle")
	      .attr("r", 1e-6);

      nodeExit.select("text")
	      .style("fill-opacity", 1e-6);

      // Update the links…
      var link = svg.selectAll("path.link")
	      .data(links, function(d) { return d.target.id; });

      // Enter any new links at the parent's previous position.
      link.enter().insert("path", "g")
	      .attr("class", "link")
	      .attr("d", function(d) {
		      var o = {x: source.x0, y: source.y0};
		      return diagonal({source: o, target: o});
	      });

      // Transition links to their new position.
      link.transition()
	      .duration(duration)
	      .attr("d", diagonal);

      // Transition exiting nodes to the parent's new position.
      link.exit().transition()
	      .duration(duration)
	      .attr("d", function(d) {
		      var o = {x: source.x, y: source.y};
		      return diagonal({source: o, target: o});
	      })
	      .remove();

      // Stash the old positions for transition.
      nodes.forEach(function(d) {
	      d.x0 = d.x;
	      d.y0 = d.y;
      });
    }

    // Toggle children on click.
    function click(d) {
      if (d.children) {
	      d._children = d.children;
	      d.children = null;
      } else {
	      d.children = d._children;
	      d._children = null;
      }
      update(d);
    }
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
    // My SVG file as a string.
    var mySVG = $("#graff-view").html();
    var dataURL = "data:image/svg+xml;base64," + window.btoa(mySVG);
    return '<html><img class="thumbnail" src="' + dataURL + '"/></html>';
  }

  return {
    update: update,
    capture: capture,
  };
})();
