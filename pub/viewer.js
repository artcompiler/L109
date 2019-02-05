/* copyright (c) 2014, Jeff Dyer */
window.gcexports.viewer = (function () {
  var height;
  var contextMenuShowing = false;
  var view = window.gcexports.view;
  function clickThumbnail(e, id) {
    showWorkspace();
    $.get("https://"+location.host+"/code/"+id, function (data) {
      updateSrc(data[0].id, data[0].src);
    });
  }
  function getWindowSize() {
    var width = window.innerWidth
      || document.documentElement.clientWidth
      || document.body.clientWidth;
    
    var height =
      window.gcexports.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      document.body.clientHeight;
    return {
      width: width - 20,
      height: height,
    };
  }

  function hideItem(id) {
    $.ajax({
      type: "PUT",
      url: "/label",
      data: {
        id: id,
        label: "hide",
      },
      dataType: "text",
      success: function(data) {
        $(".item" + id).attr("opacity", "0.5");
      },
      error: function(xhr, msg, err) {
        console.log(msg + " " + err);
      }
    });
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
  var RECT = "<svg xmlns='https://www.w3.org/2000/svg'><g><rect width='0px' height='0px'/></g></svg>";
  var ITEM_COUNT = 200;

  function loadItems(list, data, resume) {
    var sublist = list.slice(0, ITEM_COUNT);
    $.ajax({
      type: "GET",
      url: "/items",
      data : {list: sublist},
      dataType: "json",
      success: function(dd) {
        for (var i = 0; i < dd.length; i++) {
          data.push(dd[i]);
        }
        list = list.slice(ITEM_COUNT);
        if (list.length > 0) {
          loadItems(list, data, resume);
        } else {
          resume(data);
        }
      },
      error: function(xhr, msg, err) {
        console.log(msg+" "+err);
      }
    });
  }
  
  // {
  //   name
  //   child1
  //   child2
  //   child3
  // }

  // {
  //   name
  //   children
  //   size
  // }

  function getAlphaNumericPrefix(str) {
    var code, i, len;
    var result = "";
    for (i = 0, len = str.length; i < len; i++) {
      code = str.charCodeAt(i);
      if (!(code === 45) && // dash (-)
          !(code > 47 && code < 58) && // numeric (0-9)
          !(code > 64 && code < 91) && // upper alpha (A-Z)
          !(code > 96 && code < 123)) { // lower alpha (a-z)
        return result;
      }
      result += str.charAt(i);
    }
    return result;
  }

  function getRootName(str) {
    // data "CCSS.Math.Content.8"
    obj = str.split(",");
    return obj[0];
  }

  function getNodeFromPool(name, pool, parent) {
    var node;
    if (!(node = pool[name])) {
      // Add a node to the pool.
      node = pool[name] = {
        name: name,
        children: [],
        names: {},
        size: SIZE,
        svg: RECT,
      };
      parent.push(node);
    }
    return node;
  }

  function parseItemName(src, str, pool, parent) {
    // #CCSS.Math.Content.8.EE.C.7
    // A pool is an hash table, aka object.
    var rootName = getRootName(src);
    var start = str.indexOf(rootName);
    var rootParts = rootName.split(".");
    str = str.substring(start);
    var good =
      rootParts.length < 2 && str.substring(rootName.length).charAt(0) !== "." ||
      rootParts.every(function (p) {
      if (str.charAt(0) === ".") {
        str = str.substring(1);
      }
      var name = getAlphaNumericPrefix(str);
      if (name !== p) {
        // Don't have an exact match, so skip this one.
        return false;
      }
      str = str.substring(name.length);
      return true;
    });
    if (!good) {
      return null;
    }
    var name = rootName;
    var node = getNodeFromPool(name, pool, parent);
    while (str.charAt(0) === ".") {
      str = str.substring(1);
      var part = getAlphaNumericPrefix(str);
      name += "." + part;
      node = getNodeFromPool(name, pool, node.children);
      str = str.substring(part.length);
    }
    return node;
  }

  var langID = 108;
  function update(el, obj, source, pool) {
    if (typeof obj === "string") {
      obj = JSON.parse(obj);
    }
    var height = window.gcexports.height = +obj.height;
    var items = obj.items;
    langID = obj.use && +obj.use || 108;
    source = obj.src ? obj.src : source;
    loadItems(obj.items, [], function (items) {
      var c, i = 0;
      var data = [];
      var children = [];
      var names = {};
      Object.keys(items).forEach(function (name) {
        var val = items[name];
        if (val.language !== "L106" && val.language !== "L108" && val.language !== "L110") {
          return;
        }
        var item = val.id;
        var src = val.src;
        var srcObj = parseSrc(val.src);
        var method = srcObj.method;
        var value = srcObj.arg2 ? srcObj.arg1 : null;
        var response = srcObj.arg2 ? srcObj.arg2 : srcObj.arg1;
        var node = parseItemName(source, src, names, children);
        if (node === null) {
          return;
        }
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
          if (method === "calculate ") {
            value = response;
            response = objObj.result;
          }
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
            node.children.push(n);
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
          e = e;
        }
      });
      if (children.length === 1) {
        children[0].height = +height;
        children[0].name = "[" + items.length + "] " + children[0].name;
        render(el, children[0], obj.labels);
      } else {
        render(el, {
          name: "[" + items.length + "] " + source,
          height: height,
          parent: null,
          children: children,
          svg: RECT,
        }, obj.labels);
      }
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
          if ((method.indexOf("is") >= 0 || method.indexOf("calculate") === 0) &&
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

  function render(el, root, labels) {
    d3.select(el).selectAll("g").remove();
    var size = getWindowSize(),
        w = size.width,
        h = root.height ? root.height : size.height,
        x = d3.scale.linear().range([0, w]),
        y = d3.scale.linear().range([0, h]);

    d3.select(el)
      .attr("width", w)
      .attr("height", h)

    var partition = d3.layout.partition().sort((a, b) => {
          let ai = a.name && a.name.slice(a.name.lastIndexOf(".") + 1) || 0;
          let bi = b.name && b.name.slice(b.name.lastIndexOf(".") + 1) || 0;
          if (isNaN(+ai) || isNaN(+bi)) {
            return ai < bi ? -1 : 1;
          } else {
            return +ai < +bi ? -1 : 1;
          }
      })
      .value(function(d) {
        return d.size;
      });

    var g = d3.select(el).selectAll("g")
      .data(partition.nodes(root))
      .enter().append("svg:g")
      .attr("transform", function(d) { return "translate(" + x(d.y) + "," + y(d.x) + ")"; })
      .attr("class", function(d) {
        if (d.item) {
          return "item" + d.item;
        } else {
          return "parent";
        }
      })
      .on("click", click)
    
    var kx = w / root.dx,
    ky = h / 1;

    function contextMenu() {
      var height,
          width, 
          margin = 0.1, // fraction of width
          items = [], 
          rescale = false, 
          style = {
            'rect': {
                'mouseout': {
                    'fill': 'rgb(244,244,244)', 
                    'stroke': 'white', 
                    'stroke-width': '1px'
                }, 
                'mouseover': {
                    'fill': 'rgb(200,200,200)'
                }
            }, 
            'text': {
                'fill': 'steelblue', 
                'font-size': '13'
            }
          }; 
    
      function menu(data, x, y) {
        d3.select('.context-menu').remove();
        scaleItems();

        // Draw the menu
        d3.select(".item" + data.item)
          .append('g').attr('class', 'context-menu')
          .selectAll('tmp')
          .data(items).enter()
          .append('g').attr('class', 'menu-entry')
          .style({'cursor': 'pointer'})
          .on('mouseover', function(){ 
            d3.select(this).select('rect').style(style.rect.mouseover) })
          .on('mouseout', function(){ 
            d3.select(this).select('rect').style(style.rect.mouseout) });
        
        d3.selectAll('.menu-entry')
          .append('rect')
          .attr('x', x)
          .attr('y', function(d, i){ return y - height / 2 + (i * height); })
          .attr('width', width)
          .attr('height', height)
          .style(style.rect.mouseout);
        
        d3.selectAll('.menu-entry')
          .append('text')
          .text(function(d){ return d; })
          .attr('x', x)
          .attr('y', function(d, i){ return y - height / 2 + (i * height); })
          .attr('dy', height - margin / 2)
          .attr('dx', margin)
          .style(style.text);

        // Other interactions
//        d3.select('body')
//          .on('click', function () { click(data) });

        contextMenuShowing = true;
      }
    
      menu.items = function(e) {
        if (!arguments.length) return items;
        for (i in arguments) items.push(arguments[i]);
        rescale = true;
        return menu;
      }

      // Automatically set width, height, and margin;
      function scaleItems() {
        if (rescale) {
          d3.select('svg').selectAll('tmp')
            .data(items).enter()
            .append('text')
            .text(function(d){ return d; })
            .style(style.text)
            .attr('x', -1000)
            .attr('y', -1000)
            .attr('class', 'tmp');
          var z = d3.selectAll('.tmp')[0]
            .map(function(x){ return x.getBBox(); });
          width = d3.max(z.map(function(x){ return x.width; }));
          margin = margin * width;
          width =  width + 2 * margin;
          height = d3.max(z.map(function(x){ return x.height + margin / 2; }));
          
          // cleanup
          d3.selectAll('.tmp').remove();
          rescale = false;
        }
      }

      return menu;
    }

    var menu = contextMenu().items('Hide');
    
    const CLEAR = "#FEFEFE";
    const YELLOW = "#E7B416";
    const RED = "#CC3232";
    const GREEN = "#2DC937";
    g.append("svg:rect")
      .on('contextmenu', function(data) { 
        d3.event.preventDefault();
        menu(data, d3.mouse(this)[0], d3.mouse(this)[1]);
      })
      .attr("width", root.dy * kx)
      .attr("height", function(d) { return d.dx * ky; })
      .attr("class", function(d) {
        return d.children ? "parent" : "child";
      })
      .style("fill-opacity", "0.4")
      .style("fill", function(d) {
        var strokeColor;
        if (d.name ===  "root") {
          c = CLEAR; //"#DDD";
        } else {
          switch (d.score) {
          case 1:
          case true:
            c = GREEN; //"rgb(150, 255, 150)";
            break;
          case -1:
          case false:
            c = RED; //"rgb(255, 150, 150)";
            break;
          default:
            // Some red, some green
            c = CLEAR; //"#EEE";
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
            return "/item?id=" + window.gcexports.encodeID([langID, +d.item, 0]) + "\n" + d.src;
          } else {
            return "";
          }
        })

    g.append("image")
      .on('contextmenu', function(data) { 
        d3.event.preventDefault();
        menu(data, d3.mouse(this)[0], d3.mouse(this)[1]);
      })
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
            return "/item?id=" + window.gcexports.encodeID([langID, +d.item, 0]) + "\n" + d.src;
          } else {
            return "";
          }
        })
 
    g.append("svg:text")
      .on('contextmenu', function(data){ 
        d3.event.preventDefault();
        menu(data, d3.mouse(this)[0], d3.mouse(this)[1]);
      })
      .attr("transform", transform)
      .attr("dy", ".35em")
      .style("opacity", function(d) { return d.dx * ky > 12 ? 1 : 0; })
      .text(function(d) {
        if (getWidth(d.svg)) {
          return "";
        }
        if (labels && labels[d.name]) {
          return labels[d.name];
        } else {
          return d.name;
        }
        return d.name;
      })
      .append("svg:title")
        .text(function(d) {
          if (!d.children) {
            return "/item?id=" + window.gcexports.encodeID([langID, +d.item, 0]) + "\n" + d.src;
          } else {
            return "";
          }
        })


//    d3.select(window)
//      .on("click", function() { click(root); })


    function click(d) {

      if (contextMenuShowing) {
        d3.event.preventDefault();
        d3.event.stopPropagation();
        var item = d3.event.currentTarget.className.baseVal;
        item = item.substring("item".length);
        hideItem(item);
        d3.select('.context-menu').remove();
        contextMenuShowing = false;
        return;
      }

      if (!d.children && d.item) {
        window.open("/" + view + "?id=" + window.gcexports.encodeID([langID, +d.item, 0]), "L106");
        return;
      }

      var t = countLeaves(d) * 20;
      var size = getWindowSize();
      h = size.height; //t > 600 ? t : 600;
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

