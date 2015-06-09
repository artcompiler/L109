/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil; tab-width: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* copyright (c) 2014, Jeff Dyer */
window.exports.viewer = (function () {
  var height;
  function clickThumbnail(e, id) {
    showWorkspace();
    $.get("http://"+location.host+"/code/"+id, function (data) {
      updateSrc(data[0].id, data[0].src);
    });
  }

  function hideThumbnail(e, id) {
    $.ajax({
      type: "PUT",
      url: "/label",
      data: {
        id: id,
        label: "hide",
      },
      dataType: "text",
      success: function(data) {
        hideItem(id);
      },
      error: function(xhr, msg, err) {
        console.log(msg + " " + err);
      }
    });
  }

  function hideItem(id) {
    $(".gallery-panel #" + id).hide();
  }

  function stripHTML(src) {
    var start = src.indexOf("<html>") + "<html>".length;
    var stop = src.indexOf("</html>");
    return src.substring(start, stop);
  }

  function escapeStr(str) {
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/{/g, "\{")
      .replace(/}/g, "\}")
  }

  function stripNewlines(str) {
    return String(str)
      .replace(/\n/g, " ")
  }

  var SIZE = 100;
  var RECT = "<svg xmlns='http://www.w3.org/2000/svg'><g><rect width='0px' height='0px'/></g></svg>";

  function update(el, obj, src, pool) {
    obj = JSON.parse(obj);
    var c, i = 0;
    var data = [];
    var children = [];
    var names = {};
    Object.keys(obj).forEach(function (name) {
      var val = obj[name];
      if (val.label !== "show") {
        return;
      }
      var item = val.id;
      var src = val.src;
      var srcObj = parseSrc(src);
      var method = srcObj.method;
      var value = srcObj.arg2 ? srcObj.arg1 : null;
      var response = srcObj.arg2 ? srcObj.arg2 : srcObj.arg1;
      try {
        var objectCode = val.obj;
        if (!objectCode) {
          return;
        }
        var objStr = escapeStr(unescapeXML(objectCode));
        var objObj = JSON.parse(objStr);
        var valueSVG = objObj.valueSVG;
        var responseSVG = objObj.responseSVG;
        var score = objObj.score;
        var n;
        if (!(n = names[response])) {
          // Add a node to the pool.
          names[response] = n = {
            name: response,
            svg: unescapeXML(responseSVG ? responseSVG : RECT),
            parent: "root",
            children: [],
            names: {},
            size: SIZE,
          };
          children.push(n);
        }
        if (value) {
          var o = {
          };
          o[method] = {
            name: value,
            score: score,
            size: SIZE,
            svg: unescapeXML(valueSVG ? valueSVG : RECT),
            src: src,
            item: item,
          };
          n.children = n.children.concat(objToTree(o, response, n.names));
        } else {
          n.children = n.children.concat({
            name: method,
            parent: response,
            score: score,
            size: SIZE,
            svg: RECT,
            src: src,
            item: item,
          });
        }
        breadth++;
      } catch (e) {
      }
    });
    render(el, {
      name: src,
      parent: null,
      children: children,
      svg: RECT,
    });
  }

  var START   = 1;
  var METHOD  = 2;
  var OPTION  = 3;
  var STRING1 = 4;
  var STRING2 = 5;
  var END     = 6;

  function parseSrc(str) {
    if (!str) {
      return;
    }
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
          if (method.indexOf("is") >= 0 &&
              method.indexOf("isUnit") < 0) {
            // One argument function
            state = END;
            continue;
          } else {
            state = STRING2;
            continue; // Found end of string.
          }
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
          svg: RECT,
          size: SIZE,
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
          size: SIZE,
          svg: obj[name].svg,
          src: obj[name].src,
          item: obj[name].item,
        });
      }
      breadth++;
    });
    return nodes;
  }

  function unescapeXML(str) {
    return String(str)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "'");
  }

  function capture(el) {
    return d3.select(el.parentNode).html();
  }

  var EX = 6; // px
  function getWidth(str) {
    var unit = 1;
    var begin = str.indexOf("width=") + 7;  // width="
    str = str.substring(begin);
    var end = str.indexOf("px");
    if (end < 0) {
      end = str.indexOf("ex");
      unit = EX;
    }
    str = str.substring(0, end);
    return +str * unit;
  }

  function getHeight(str) {
    var unit = 1;
    var begin = str.indexOf("height") + 8;  // height="
    str = str.substring(begin);
    var end = str.indexOf("px");
    if (end < 0) {
      end = str.indexOf("ex");
      unit = EX;
    }
    str = str.substring(0, end);
    return +str * unit;
  }

  return {
    update: update,
    capture: capture,
  };

  function countLeaves(obj) {
    var count = 0;
    if (obj.children) {
      obj.children.forEach(function (o) {
        count += countLeaves(o);
      });
    } else {
      count = 1;
    }
    return count;
  }

  var MIN_HEIGHT = 20;

  function render(el, root) {
    d3.selectAll("g").remove();
    var w = 1400,
        h = countLeaves(root) * 20,
        x = d3.scale.linear().range([0, w]),
        y = d3.scale.linear().range([0, h]);

    d3.select(el)
      .attr("width", w)
      .attr("height", h)

    var partition = d3.layout.partition()
        .value(function(d) {
          return d.size;
        });

    var g = d3.select(el).selectAll("g")
      .data(partition.nodes(root))
      .enter().append("svg:g")
      .attr("transform", function(d) { return "translate(" + x(d.y) + "," + y(d.x) + ")"; })
      .on("click", click);

    
    var kx = w / root.dx,
    ky = h / 1;

    g.append("svg:rect")
      .attr("width", root.dy * kx)
      .attr("height", function(d) { return d.dx * ky; })
      .attr("class", function(d) { return d.children ? "parent" : "child"; })
	    .style("fill", function(d) {
        var strokeColor;
        if (d.name ===  "root") {
          c = "#DDD";
        } else {
          switch (d.score) {
          case 1:
            c = "rgb(150, 255, 150)";
            break;
          case -1:
            c = "rgb(255, 150, 150)";
            break;
          default:
            // Some red, some green
            c = "#EEE";
            break;
          }
        }
        return c;
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
          return isNaN(score) ? -1 : score;
        }
      })
      .append("svg:title")
        .text(function(d) {
          if (!d.children) {
            return "/item?id=" + d.item + "\n\n" + d.src;
          } else {
            return "";
          }
        });

    g.append("image")
      .attr("width", function (d) {
        return (d.width = getWidth(d.svg));
      })
      .attr("height", function(d) {
        return (d.height = getHeight(d.svg));
      })
      .attr("transform", transformImage)
      .style("opacity", function(d) {
        return d.dx * ky > d.height ? 1 : 0;
      })
      .attr("xlink:href", function (d) {
        return "data:image/svg+xml;utf8," + d.svg;
      })
      .append("svg:title")
        .text(function(d) {
          if (!d.children) {
            return "/item?id=" + d.item + "\n\n" + d.src;
          } else {
            return "";
          }
        });

    g.append("svg:text")
      .attr("transform", transform)
      .attr("dy", ".35em")
      .style("opacity", function(d) { return d.dx * ky > 12 ? 1 : 0; })
      .text(function(d) {
        if (getWidth(d.svg)) {
          return "";
        }
        return d.name;
      })
      .append("svg:title")
        .text(function(d) {
          if (!d.children) {
            return "/item?id=" + d.item + "\n\n" + d.src;
          } else {
            return "";
          }
        });

    d3.select(window)
      .on("click", function() { click(root); })

    function click(d) {
      if (!d.children) {
        window.open("/item?id=" + d.item, "L106");
        return;
      }

      var t = countLeaves(d) * 20;
      h = t > 600 ? t : 600;
      y = d3.scale.linear().range([0, h]);
      ky = h / 1;

      d3.select(el)
        .attr("height", h)

      kx = (d.y ? w - 40 : w) / (1 - d.y);
      ky = h / d.dx;
      x.domain([d.y, 1]).range([d.y ? 40 : 0, w]);
      y.domain([d.x, d.x + d.dx]);

      var t = g.transition()
        .duration(d3.event.altKey ? 7500 : 750)
        .attr("transform", function(d) { return "translate(" + x(d.y) + "," + y(d.x) + ")"; });

      t.select("rect")
        .attr("width", d.dy * kx)
        .attr("height", function(d) { return d.dx * ky; });

      t.select("text")
        .attr("transform", transform)
        .style("opacity", function(d) { return d.dx * ky > 12 ? 1 : 0; });

      t.select("image")
        .attr("transform", transformImage)
        .style("opacity", function(d) {
          return d.dx * ky > d.height ? 1 : 0;
        });

      d3.event.stopPropagation();
    }

    function transform(d) {
      return "translate(8," + d.dx * ky / 2 + ")";
    }

    function transformImage(d) {
      return "translate(8," + (d.dx * ky / 2 - d.height / 2) + ")";
    }
  }
})();

