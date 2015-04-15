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
      .replace(/\\/g, "\\\\")
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
        var objStr = escapeStr(obj[name].obj);
//        console.log("update() objStr=" + objStr);
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
        var o = {
        };
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
          svgText: obj[name].svgText,
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

  var EX = 7;
  function getWidth(str) {
    var begin = str.indexOf("width") + 12;  // width=&quot;
    str = str.substring(begin);
    var end = str.indexOf("ex");
    str = str.substring(0, end);
    return +str * EX;
  }

  function getHeight(str) {
    var begin = str.indexOf("height") + 13; // height=&quot;
    str = str.substring(begin);
    var end = str.indexOf("ex");
    str = str.substring(0, end);
    return +str * EX;
  }

  function render(root) {
    // ************** Generate the tree diagram	 *****************
	  var width = 1960 - margin.right - margin.left;
	  var height = (breadth * 14 * 2) - margin.top - margin.bottom;
	  
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
	    'stroke: #eee;' +
	    'stroke-width: 1px;' +
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

    function getScore(d) {
      // Get the current score or the average of the children's scores.
      if (d.children === undefined) {
        return d.score;
      }
      var score = 0;
      d.children.forEach(function (c) {
        score += getScore(c);
      });
      score = score / d.children.length;
      return isNaN(score) ? undefined : score;
    }

    function update(source) {

      // Compute the new tree layout.
      var nodes = tree.nodes(root).reverse(),
	    links = tree.links(nodes);

      // Normalize for fixed-depth.
      var lastHeight = 0;
      nodes.forEach(function(d) {
        d.y = d.depth * 280;
      });

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
          var strokeColor;
          switch (getScore(d)) {
          case 1:
            strokeColor = "rgb(100, 255, 100)";
            break;
          case 0:
          case -1:
            strokeColor = "rgb(255, 100, 100)";
            break;
          case undefined:
            strokeColor = "lightsteelblue";
            break;
          default:
            // Some red, some green
            strokeColor = "rgb(255, 255, 100)";
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
        .attr("width", function (d) {
          if (d.svgText) {
            return getWidth(d.svgText);
          }
          return 0;
        })
        .attr("height", function (d) {
          if (d.svgText) {
            var h = getHeight(d.svgText);
            return h;
          }
          return 0;
        })
        .attr("x", function (d) {
          if (d.svgText) {
            return -10 - getWidth(d.svgText);
          }
          return 0;
        })
        .attr("y", function (d) {
          if (d.svgText) {
            return -getHeight(d.svgText) / 2;
          }
          return 0;
        });

      nodeEnter.append("text")
	      .attr("x", function(d) { return d.children || d._children ? -13 : 13; })
	      .attr("dy", ".35em")
	      .attr("text-anchor", function(d) { return d.children || d._children ? "end" : "start"; })
	      .text(function(d) {
          if (!d.svgText) {
            return d.name;
          }
          return "";
        })
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

  function capture() {
    // My SVG file as a string.
    var mySVG = $("#graff-view svg").html();
    // Create a Data URI.
    // Load up our image.
    // Set up our canvas on the page before doing anything.
    var old = document.getElementById('graff-view').children[0];
    var myCanvas = document.createElement('canvas');
    var bbox = $("#graff-view svg g")[0].getBBox();
    myCanvas.height = bbox.height + 12;
    myCanvas.width = bbox.width + 40;
    document.getElementById('graff-view').replaceChild(myCanvas, old);
    // Get drawing context for the Canvas
    var myCanvasContext = myCanvas.getContext('2d');
    // Load up our image.
    // Render our SVG image to the canvas once it loads.
    var source = new Image();
    source.src = "data:image/svg+xml," + mySVG;
    myCanvasContext.drawImage(source,0,0);
    var dataURL = myCanvas.toDataURL();
    document.getElementById('graff-view').replaceChild(old, myCanvas);
    return '<html><img class="thumbnail" src="' + dataURL + '"/></html>';
//    var dataURL = "data:image/svg+xml," + mySVG;
//    return '<html><img class="thumbnail" src="' + dataURL + '"/></html>';
  }

  return {
    update: update,
    capture: capture,
  };
})();
