#!/usr/bin/env node
import { createRequire as __misterCleanCreateRequire } from "node:module";
const require = __misterCleanCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity2.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity2.isNode(ctrl) || identity2.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity2.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity2.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity2.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity2.isNode(ctrl) || identity2.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity2.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity2.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity2.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity2.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity2.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity2.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity2.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity2.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity2.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity2.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity2.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines2 = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity2.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity2.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines2.push(`%TAG ${handle} ${prefix}`);
        }
        return lines2.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity2.isScalar(ref.node) || identity2.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity2.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity2 = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity2.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity2.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity2 = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity2.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity2.isAlias(node) || identity2.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity2.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity2.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity2.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity2.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity2 = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity2.isDocument(value))
        value = value.contents;
      if (identity2.isNode(value))
        return value;
      if (identity2.isPair(value)) {
        const map = ctx.schema[identity2.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity2.MAP] : Symbol.iterator in Object(value) ? schema[identity2.SEQ] : schema[identity2.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity2 = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity2.isNode(it) || identity2.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity2.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity2.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity2.isScalar(node) ? node.value : node;
        else
          return identity2.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity2.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity2.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity2.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity2.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text2, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text2;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text2.length <= endStep)
        return text2;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text2, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text2[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text2[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text2, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text2[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text2[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text2;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text2;
      if (onFold)
        onFold();
      let res = text2.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text2.length;
        if (fold === 0)
          res = `
${indent}${text2.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text2[fold]}\\`;
          res += `
${indent}${text2.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text2, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text2[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text2[++i];
        } else {
          do {
            ch = text2[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text2[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity2 = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity2.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity2.isScalar(node) || identity2.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity2.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity2.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity2.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity2.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity2.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity2.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity2.isCollection(key) || !identity2.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity2.isCollection(key) || (identity2.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity2.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity2.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity2.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity2.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity2.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity2.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity2.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity2.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity2 = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity2.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity2.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity2 = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity2.NODE_TYPE, { value: identity2.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity2.isNode(key))
          key = key.clone(schema);
        if (identity2.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines2 = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity2.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines2.push("");
          addCommentBefore(ctx, lines2, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity2.isPair(item)) {
          const ik = identity2.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines2.push("");
            addCommentBefore(ctx, lines2, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines2.push(blockItemPrefix + str2);
      }
      let str;
      if (lines2.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines2[0];
        for (let i = 1; i < lines2.length; ++i) {
          const line = lines2[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines2 = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity2.isNode(item)) {
          if (item.spaceBefore)
            lines2.push("");
          addCommentBefore(ctx, lines2, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity2.isPair(item)) {
          const ik = identity2.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines2.push("");
            addCommentBefore(ctx, lines2, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity2.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines2.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines2.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines2.push(str);
        linesAtValue = lines2.length;
      }
      const { start, end } = flowChars;
      if (lines2.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines2.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines2)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines2.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines2, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines2.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity2 = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity2.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity2.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity2.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity2.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity2.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity2.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity2.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity2.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity2.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity2 = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity2.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity2.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity2.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity2.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity2.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines2 = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines2[i] = str.substr(o, lineWidth);
          }
          str = lines2.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity2.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity2.isPair(item))
            continue;
          else if (identity2.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity2.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity2.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity2.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity2.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity2.isPair(pair) ? identity2.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity2.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity2.MAP, { value: map.map });
        Object.defineProperty(this, identity2.SCALAR, { value: string.string });
        Object.defineProperty(this, identity2.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines2 = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines2.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines2.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines2.length !== 1)
          lines2.unshift("");
        const cs = commentString(doc.commentBefore);
        lines2.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity2.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines2.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines2.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines2[lines2.length - 1] === "---") {
          lines2[lines2.length - 1] = `--- ${body}`;
        } else
          lines2.push(body);
      } else {
        lines2.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines2.push("...");
            lines2.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines2.push(`... ${cs}`);
          }
        } else {
          lines2.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines2[lines2.length - 1] !== "")
            lines2.push("");
          lines2.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines2.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity2 = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity2.NODE_TYPE, { value: identity2.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity2.NODE_TYPE]: { value: identity2.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity2.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity2.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity2.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity2.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity2.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity2.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity2.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity2.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity2.isScalar(a) && identity2.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep8, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep8?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep8) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep8 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep8, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep8 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep8 + cb;
              sep8 = "";
              break;
            }
            case "newline":
              if (comment)
                sep8 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep8, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep8?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep8 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity2.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep8 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep8, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep8 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep8)
                for (const st of sep8) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep8, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity2.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar2, onError) {
      const start = scalar2.offset;
      const header = parseBlockScalarHeader(scalar2, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines2 = scalar2.source ? splitLines2(scalar2.source) : [];
      let chompStart = lines2.length;
      for (let i = lines2.length - 1; i >= 0; --i) {
        const content = lines2[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines2.length > 0 ? "\n".repeat(Math.max(1, lines2.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar2.source)
          end2 += scalar2.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar2.indent + header.indent;
      let offset = scalar2.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines2[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines2.length - 1; i >= chompStart; --i) {
        if (lines2[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep8 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines2[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines2[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep8 + indent.slice(trimIndent) + content;
          sep8 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep8 === " ")
            sep8 = "\n";
          else if (!prevMoreIndented && sep8 === "\n")
            sep8 = "\n\n";
          value += sep8 + indent.slice(trimIndent) + content;
          sep8 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep8 === "\n")
            value += "\n";
          else
            sep8 = "\n";
        } else {
          value += sep8 + content;
          sep8 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines2.length; ++i)
            value += "\n" + lines2[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar2.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines2(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines2 = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines2.push([split[i], split[i + 1]]);
      return lines2;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar2, strict, onError) {
      const { offset, type, source, end } = scalar2;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar2, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep8 = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep8 === "\n")
            res += sep8;
          else
            sep8 = "\n";
        } else {
          res += sep8 + match[1];
          sep8 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep8 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity2 = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity2.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity2.SCALAR];
      let scalar2;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar2 = identity2.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar2 = new Scalar.Scalar(value);
      }
      scalar2.range = range;
      scalar2.source = value;
      if (type)
        scalar2.type = type;
      if (tagName)
        scalar2.tag = tagName;
      if (tag.format)
        scalar2.format = tag.format;
      if (comment)
        scalar2.comment = comment;
      return scalar2;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity2.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity2.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity2.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity2.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity2 = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity2.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity2 = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity2.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity2.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep8, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep8)
        for (const st of sep8)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar2) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep8;
          if (scalar2.end) {
            sep8 = scalar2.end;
            sep8.push(this.sourceToken);
            delete scalar2.end;
          } else
            sep8 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar2.offset,
            indent: scalar2.indent,
            items: [{ start, key: scalar2, sep: sep8 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar2);
      }
      *blockScalar(scalar2) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar2.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar2.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep8 = it.sep;
                  sep8.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep8 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep8 = fc.end.splice(1, fc.end.length);
            sep8.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep8 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity2 = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity2.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity2 = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity2.isAlias;
    exports.isCollection = identity2.isCollection;
    exports.isDocument = identity2.isDocument;
    exports.isMap = identity2.isMap;
    exports.isNode = identity2.isNode;
    exports.isPair = identity2.isPair;
    exports.isScalar = identity2.isScalar;
    exports.isSeq = identity2.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/cli.ts
import { existsSync as existsSync4, readFileSync as readFileSync5, realpathSync as realpathSync2, statSync as statSync2, writeFileSync as writeFileSync3 } from "fs";
import { join as join3, relative as relative7, resolve as resolve7, sep as sep7 } from "path";
import { fileURLToPath as fileURLToPath2, pathToFileURL } from "url";

// src/closeout/bundle.ts
import { createHash as createHash3 } from "crypto";
import { execFile } from "child_process";
import { access, lstat, readFile, readdir, realpath } from "fs/promises";
import { basename as basename3, dirname as dirname3, isAbsolute as isAbsolute2, relative as relative3, resolve as resolve3, sep as sep3 } from "path";
import { promisify } from "util";

// src/closeout/records.ts
import { posix as pathPosix } from "path";

// src/closeout/normalization.ts
function foldCase(value) {
  let folded = value.normalize("NFKC");
  for (; ; ) {
    const next = folded.toLocaleUpperCase("und").toLocaleLowerCase("und");
    if (next === folded) return next;
    folded = next;
  }
}
function canonicalIdentity(value) {
  if (value === void 0 || value === null) return "";
  return foldCase(String(value).trim().split(/\s+/u).join(" "));
}

// src/closeout/records.ts
var DIMENSION_STATES = /* @__PURE__ */ new Set(["satisfied", "open", "blocked", "not_assessed", "not_applicable"]);
var CLAIM_STATES = /* @__PURE__ */ new Set(["established", "not_established", "not_assessed", "not_applicable"]);
var DEBT_STATES = /* @__PURE__ */ new Set(["satisfied", "accepted_exception", "open", "blocked", "deferred", "not_assessed"]);
var RECOMMENDATIONS = /* @__PURE__ */ new Set(["proceed", "proceed_with_conditions", "do_not_proceed", "not_assessed"]);
var MODES = /* @__PURE__ */ new Set(["AUDIT", "CLEAN", "CLOSE", "CONFORM", "GUARD"]);
var EXECUTION_STATES = /* @__PURE__ */ new Set(["authorized", "executed"]);
var MANIFEST_SCHEMA_VERSIONS = /* @__PURE__ */ new Set(["1.0", "1.1", "1.2"]);
var RISKS = /* @__PURE__ */ new Set(["reversible_local", "consequential_external", "unrecoverable"]);
var AUTH_STATES = /* @__PURE__ */ new Set(["granted"]);
var STANDING_AUTH_SOURCES = /* @__PURE__ */ new Set(["skill_invocation", "explicit_user", "explicit_operator"]);
var CONSEQUENT_ACTION_KINDS = /* @__PURE__ */ new Set([
  "git_push",
  "branch_delete_local",
  "branch_delete_remote",
  "worktree_remove",
  "process_signal",
  "tracker_write"
]);
var PROHIBITED_KINDS = /* @__PURE__ */ new Set([
  "history_rewrite",
  "force_push",
  "secret_destroy",
  "production_deploy",
  "production_mutation",
  "external_dispatch"
]);
var ALLOWED_ACTION_KINDS = /* @__PURE__ */ new Set([
  "agent_dispatch",
  "acceptance_execute",
  "local_edit",
  "local_move",
  "recoverable_delete",
  "format",
  "lint",
  "test",
  "build",
  "generate",
  "doc_update",
  "planning_record_update",
  "git_commit",
  "git_push",
  "stash_preserve",
  "stash_drop",
  "git_integrate",
  "branch_delete_local",
  "branch_delete_remote",
  "worktree_remove",
  "process_signal",
  "tracker_write",
  "historical_conform",
  "handoff_update"
]);
var ACTION_EVIDENCE_KINDS = /* @__PURE__ */ new Set([
  "git_change",
  "validation_result",
  "remote_ref_resolution",
  "process_observation",
  "tracker_receipt",
  "independent_qa_verdict"
]);
var DEBT_EVIDENCE_KINDS = /* @__PURE__ */ new Set(["acceptance_execution", "gate_result", "historical_record"]);
var DISPOSITIONS = /* @__PURE__ */ new Set(["autonomously_repair", "autonomously_validate", "accepted_exception", "decision_or_coordination_required"]);
var VERDICTS = /* @__PURE__ */ new Set(["CLEAN", "NOT_CLEAN"]);
var OPEN_DEBT_STATES = /* @__PURE__ */ new Set(["open", "blocked", "not_assessed"]);
var STALE_DOC_CLASSES = /* @__PURE__ */ new Set(["stale_doc", "stale_comment", "stale_documentation", "doc_drift"]);
var OPERATOR_ACTORS = /* @__PURE__ */ new Set(["operator", "principal"]);
var GENERIC_FILLER = /* @__PURE__ */ new Set(["measured", "fixture-value", "n/a", "na", "done", "ok", "verified", "pass", "true", "yes", "-", "tbd", "todo", "checked", "clean", "good"]);
var REQUIRED_DIMENSIONS = ["completion_debt", "repository_state", "planning_integrity", "verification", "handoff_readiness"];
var REQUIRED_CLAIMS = ["committed_locally", "pushed", "ci_green_on_push", "deployed", "independently_qa_accepted"];
var DIMENSION_EVIDENCE_KINDS = {
  completion_debt: /* @__PURE__ */ new Set(["debt_census", "acceptance_execution"]),
  repository_state: /* @__PURE__ */ new Set(["git_topology"]),
  planning_integrity: /* @__PURE__ */ new Set(["planning_census"]),
  verification: /* @__PURE__ */ new Set(["validation_summary"]),
  handoff_readiness: /* @__PURE__ */ new Set(["successor_readiness"])
};
var PLACEHOLDER = /<[^<>]+>/;
var LANE_ROLES = /* @__PURE__ */ new Set(["read_only", "writer", "integrator"]);
var LANE_STATES = /* @__PURE__ */ new Set(["queued", "active", "ready", "integrated", "retired", "blocked"]);
var EXECUTION_CLASSES = /* @__PURE__ */ new Set(["hosted", "local_inference"]);
var EVALUATION_MODES = /* @__PURE__ */ new Set(["none", "naturalistic", "controlled"]);
var CAS_RESULTS = /* @__PURE__ */ new Set(["applied", "rejected_target_moved", "rejected_regression", "not_run"]);
var COORDINATION_ACCESS = /* @__PURE__ */ new Set(["read", "write"]);
var COORDINATION_CAS_RESULTS = /* @__PURE__ */ new Set(["validated", "applied", "rejected_stale", "not_run"]);
var PUSH_INTENTS = /* @__PURE__ */ new Set(["coherent_wave", "minimal_ci_repair"]);
var GUARD_STATES = /* @__PURE__ */ new Set(["initialized", "collecting", "passed", "crossed", "invalidated"]);
var GUARD_ROLES = /* @__PURE__ */ new Set(["dev", "qa", "mister_clean", "holdout"]);
var GUARD_CONCLUSIONS = /* @__PURE__ */ new Set(["pass", "fail", "conditional", "not_run"]);
var GUARD_BARRIER_STATES = /* @__PURE__ */ new Set(["closed", "open", "crossed", "invalidated"]);
var LOCAL_MUTATION_KINDS = /* @__PURE__ */ new Set([
  "local_edit",
  "local_move",
  "recoverable_delete",
  "format",
  "generate",
  "doc_update",
  "planning_record_update",
  "historical_conform",
  "handoff_update"
]);
var REGRESSION_POLICY = "zero_open_run_introduced_debt";
var REGRESSION_COUNT_FIELDS = [
  "baseline_findings",
  "closing_findings",
  "baseline_paid",
  "baseline_open",
  "newly_discovered_preexisting_paid",
  "newly_discovered_preexisting_open",
  "concurrent_external_paid",
  "concurrent_external_open",
  "introduced_by_run_paid",
  "introduced_by_run_open",
  "action_checks"
];
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function array(value) {
  return Array.isArray(value) ? value : void 0;
}
function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isoTimestamp(value) {
  if (!nonempty(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zone = match[7] ?? "";
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  if (zone !== "Z") {
    const offset = zone.slice(1).replace(":", "");
    if (Number(offset.slice(0, 2)) > 23 || Number(offset.slice(2)) > 59) return false;
  }
  return !Number.isNaN(Date.parse(value));
}
function digestRef(value) {
  const ref = object(value);
  return !!ref && nonempty(ref.path) && typeof ref.sha256 === "string" && /^[0-9a-f]{64}$/.test(ref.sha256);
}
function requireKeys(value, keys, path, errors) {
  const record = object(value);
  if (!record) {
    errors.push(`${path}: expected object`);
    return;
  }
  for (const key of [...keys].sort()) if (!(key in record)) errors.push(`${path}.${key}: missing`);
}
function findPlaceholders(value, path = "$") {
  if (typeof value === "string") return PLACEHOLDER.test(value) ? [path] : [];
  const record = object(value);
  if (record) return Object.entries(record).flatMap(([key, item]) => findPlaceholders(item, `${path}.${key}`));
  const items = array(value);
  return items ? items.flatMap((item, index) => findPlaceholders(item, `${path}[${index}]`)) : [];
}
function meaningful(value) {
  if (typeof value === "string") return value.trim().length > 0;
  const record = object(value);
  if (record) return Object.values(record).some(meaningful);
  const items = array(value);
  if (items) return items.some(meaningful);
  return value !== null && value !== void 0;
}
function generic(value) {
  if (typeof value === "string") return GENERIC_FILLER.has(foldCase(value.trim())) || value.trim().length < 3;
  const items = array(value);
  if (items) return items.length === 0 || items.every(generic);
  const record = object(value);
  if (record) return !Object.values(record).some(meaningful);
  return false;
}
function normalizeActor(value) {
  return canonicalIdentity(value);
}
function criterionWaived(criterion) {
  const waiver = object(criterion.waiver);
  if (!waiver || !nonempty(waiver.actor) || !nonempty(waiver.ref)) return false;
  return !OPERATOR_ACTORS.has(String(criterion.source)) || OPERATOR_ACTORS.has(normalizeActor(waiver.actor));
}
function validateAuthorizationBasis(value, path, errors) {
  requireKeys(value, ["source", "ref", "scope", "standing"], path, errors);
  const basis = object(value);
  if (!basis) return;
  if (!STANDING_AUTH_SOURCES.has(String(basis.source))) errors.push(`${path}.source: expected skill_invocation, explicit_user, or explicit_operator`);
  if (!nonempty(basis.ref)) errors.push(`${path}.ref: required`);
  if (basis.scope !== "named_repository_and_current_task") errors.push(`${path}.scope: expected named_repository_and_current_task`);
  if (basis.standing !== true) errors.push(`${path}.standing: expected true`);
}
function validateRegressionControl(value, path, errors, clean, allowPlaceholders) {
  requireKeys(value, [
    "policy",
    "baseline_object",
    "closing_object",
    ...REGRESSION_COUNT_FIELDS,
    "evidence_ref"
  ], path, errors);
  const control = object(value);
  if (!control) return;
  if (control.policy !== REGRESSION_POLICY) errors.push(`${path}.policy: expected ${REGRESSION_POLICY}`);
  for (const field of ["baseline_object", "closing_object"]) {
    if (!nonempty(control[field])) errors.push(`${path}.${field}: required`);
  }
  for (const field of REGRESSION_COUNT_FIELDS) {
    if (!Number.isInteger(control[field]) || Number(control[field]) < 0) {
      errors.push(`${path}.${field}: required nonnegative integer`);
    }
  }
  const countsValid = REGRESSION_COUNT_FIELDS.every((field) => Number.isInteger(control[field]) && Number(control[field]) >= 0);
  if (countsValid) {
    const baseline = Number(control.baseline_findings);
    const expectedBaseline = Number(control.baseline_paid) + Number(control.baseline_open);
    if (baseline !== expectedBaseline) {
      errors.push(`${path}.baseline_findings (${baseline}) must equal baseline_paid + baseline_open (${expectedBaseline})`);
    }
    const closing = Number(control.closing_findings);
    const expectedClosing = Number(control.baseline_open) + Number(control.newly_discovered_preexisting_open) + Number(control.concurrent_external_open) + Number(control.introduced_by_run_open);
    if (closing !== expectedClosing) {
      errors.push(`${path}.closing_findings (${closing}) must equal all open origin buckets (${expectedClosing})`);
    }
  }
  const referenceHasPlaceholder = findPlaceholders(control.evidence_ref, `${path}.evidence_ref`).length > 0;
  if (!(allowPlaceholders && referenceHasPlaceholder) && !digestRef(control.evidence_ref)) {
    errors.push(`${path}.evidence_ref: required digest-bound regression-delta reference {path,sha256}`);
  }
  if (clean && control.introduced_by_run_open !== 0) {
    errors.push(`${path}.introduced_by_run_open: CLEAN requires zero cleanup-introduced open debt`);
  }
}
function validateEstablishedClaim(name, evidence, errors) {
  const objects = evidence.map(object).filter((entry) => !!entry);
  const required = {
    committed_locally: ["kind", "commit"],
    pushed: ["kind", "remote", "ref", "commit", "observed_at"],
    ci_green_on_push: ["kind", "provider", "run_id", "commit", "conclusion"],
    deployed: ["kind", "environment", "deployment_ref", "observed_state", "observed_at"],
    independently_qa_accepted: ["kind", "verdict_ref", "reviewer", "implementer", "conclusion"]
  };
  const fields = required[name] ?? [];
  if (!objects.some((item) => fields.every((field) => nonempty(item[field])))) {
    errors.push(`$.claims.${name}: evidence must include one object with ${[...fields].sort().join(", ")}`);
  }
  if (name === "ci_green_on_push" && !objects.some((item) => item.conclusion === "success")) errors.push("$.claims.ci_green_on_push: established requires conclusion=success");
  if (name === "ci_green_on_push" && !objects.some((item) => item.kind === "established_ci")) errors.push("$.claims.ci_green_on_push: established requires kind=established_ci");
  const expectedKind = { committed_locally: "git_commit", pushed: "remote_ref_resolution", deployed: "observed_deployment", independently_qa_accepted: "independent_qa_verdict" };
  if (expectedKind[name] && !objects.some((item) => item.kind === expectedKind[name])) errors.push(`$.claims.${name}: established requires kind=${expectedKind[name]}`);
  if (name === "deployed" && !objects.some((item) => item.observed_state === "active")) errors.push("$.claims.deployed: established requires observed_state=active");
  if (name === "independently_qa_accepted" && !objects.some((item) => item.kind === "independent_qa_verdict" && item.conclusion === "accepted" && nonempty(item.reviewer) && nonempty(item.implementer) && item.reviewer !== item.implementer)) {
    errors.push("$.claims.independently_qa_accepted: established requires accepted verdict and distinct reviewer/implementer");
  }
}
function validateReport(data, allowPlaceholders = false, bundleContext = false) {
  const errors = [];
  const report = object(data);
  requireKeys(data, ["record_type", "schema_version", "generated_at", "repo", "target_binding", "mode", "authorization_basis", "scope", "dimensions", "completion_debts", "claims", "actions", "residuals", "handoff_assessment", "regression_control", "verdict"], "$", errors);
  if (!report || errors.length > 0) return errors.map((error) => error.startsWith("$.") ? error : error.replace("$.", "$."));
  if (report.record_type !== "mister-clean.closeout") errors.push("$.record_type: expected mister-clean.closeout");
  if (report.schema_version !== "1.2") errors.push("$.schema_version: expected 1.2");
  if (!MODES.has(String(report.mode))) errors.push(`$.mode: unsupported value ${JSON.stringify(report.mode)}`);
  validateAuthorizationBasis(report.authorization_basis, "$.authorization_basis", errors);
  const repo = object(report.repo) ?? {};
  if (!allowPlaceholders) {
    if (!nonempty(repo.id)) errors.push("$.repo.id: required portable repository identity");
    if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id");
  }
  const target = object(report.target_binding);
  requireKeys(report.target_binding, ["target_ref", "target_commit", "candidate_commit", "merge_base", "target_commits_missing", "candidate_commits_ahead", "target_incorporated", "measured_at", "evidence"], "$.target_binding", errors);
  if (target) {
    for (const field of ["target_ref", "measured_at"]) if (!nonempty(target[field])) errors.push(`$.target_binding.${field}: required`);
    for (const field of ["target_commits_missing", "candidate_commits_ahead"]) if (typeof target[field] !== "number" || !Number.isInteger(target[field]) || target[field] < 0) errors.push(`$.target_binding.${field}: required nonnegative integer`);
    if (typeof target.target_incorporated !== "boolean") errors.push("$.target_binding.target_incorporated: required boolean");
    if (!Array.isArray(target.evidence) || target.evidence.length === 0) errors.push("$.target_binding.evidence: required nonempty array");
  }
  const dimensions = object(report.dimensions);
  requireKeys(report.dimensions, REQUIRED_DIMENSIONS, "$.dimensions", errors);
  if (dimensions) for (const name of REQUIRED_DIMENSIONS) {
    if (!(name in dimensions)) continue;
    const item = object(dimensions[name]);
    requireKeys(item, ["state", "evidence", "notes"], `$.dimensions.${name}`, errors);
    if (!item) continue;
    if (!DIMENSION_STATES.has(String(item.state))) errors.push(`$.dimensions.${name}.state: unsupported value ${JSON.stringify(item.state)}`);
    if (!Array.isArray(item.evidence)) errors.push(`$.dimensions.${name}.evidence: expected array`);
    else if (item.state === "satisfied" && item.evidence.length === 0) errors.push(`$.dimensions.${name}: satisfied requires evidence`);
  }
  const debts = array(report.completion_debts) ?? [];
  if (!Array.isArray(report.completion_debts)) errors.push("$.completion_debts: expected array");
  for (const [index, raw] of debts.entries()) {
    const path = `$.completion_debts[${index}]`;
    const debt = object(raw);
    requireKeys(raw, ["id", "procedure", "state", "evidence"], path, errors);
    if (!debt) continue;
    if (!DEBT_STATES.has(String(debt.state))) errors.push(`${path}.state: unsupported value ${JSON.stringify(debt.state)}`);
    if (debt.state === "blocked") {
      requireKeys(debt, ["blocker", "next_owner", "next_action"], path, errors);
      if (!array(debt.evidence)?.length) errors.push(`${path}.evidence: blocked debt requires evidence`);
      for (const field of ["blocker", "next_owner", "next_action"]) if (!nonempty(debt[field])) errors.push(`${path}.${field}: required for blocked debt`);
    }
    if (debt.state === "deferred") {
      const ruling = object(debt.ruling);
      requireKeys(ruling, ["actor", "date", "reason", "ref", "next_owner"], `${path}.ruling`, errors);
      if (ruling) {
        for (const field of ["actor", "date", "reason", "ref", "next_owner"]) if (!nonempty(ruling[field])) errors.push(`${path}.ruling.${field}: required for deferred debt`);
      }
    }
  }
  const claims = object(report.claims);
  requireKeys(report.claims, REQUIRED_CLAIMS, "$.claims", errors);
  if (claims) for (const name of REQUIRED_CLAIMS) {
    if (!(name in claims)) continue;
    const item = object(claims[name]);
    requireKeys(claims[name], ["state", "evidence"], `$.claims.${name}`, errors);
    if (!item) continue;
    if (!CLAIM_STATES.has(String(item.state))) errors.push(`$.claims.${name}.state: unsupported value ${JSON.stringify(item.state)}`);
    if (!Array.isArray(item.evidence)) errors.push(`$.claims.${name}.evidence: expected array`);
    else {
      if (item.state === "established" && item.evidence.length === 0) errors.push(`$.claims.${name}: established requires evidence`);
      if (item.state === "established") validateEstablishedClaim(name, item.evidence, errors);
    }
  }
  const assessment = object(report.handoff_assessment);
  requireKeys(report.handoff_assessment, ["recommendation", "reasons", "conditions"], "$.handoff_assessment", errors);
  const recommendation = assessment?.recommendation;
  if (!RECOMMENDATIONS.has(String(recommendation))) errors.push(`$.handoff_assessment.recommendation: unsupported value ${JSON.stringify(recommendation)}`);
  if (assessment) {
    if (["proceed", "proceed_with_conditions", "do_not_proceed"].includes(String(recommendation)) && !array(assessment.reasons)?.length) errors.push("$.handoff_assessment.reasons: recommendation requires reasons");
    if (recommendation === "proceed_with_conditions" && !array(assessment.conditions)?.length) errors.push("$.handoff_assessment.conditions: conditional recommendation requires conditions");
  }
  const debtStates = new Set(debts.map((debt) => object(debt)?.state));
  if (recommendation === "proceed" && ["open", "blocked", "deferred", "not_assessed"].some((state) => debtStates.has(state))) errors.push("$.handoff_assessment: unconditional proceed conflicts with unresolved or deferred completion debt");
  if (recommendation === "proceed" && dimensions) {
    const unresolved = REQUIRED_DIMENSIONS.filter((name) => ["open", "blocked", "not_assessed"].includes(String(object(dimensions[name])?.state)));
    if (unresolved.length) errors.push(`$.handoff_assessment: unconditional proceed conflicts with unresolved dimensions: ${unresolved.sort().join(", ")}`);
  }
  const verdict = report.verdict;
  if (!VERDICTS.has(String(verdict))) errors.push(`$.verdict: required, CLEAN or NOT_CLEAN (got ${JSON.stringify(verdict)})`);
  validateRegressionControl(report.regression_control, "$.regression_control", errors, verdict === "CLEAN", allowPlaceholders);
  if (verdict === "CLEAN" && !bundleContext) errors.push("$.verdict: CLEAN requires validation through a live-bound mister-clean.closure-bundle; a standalone report is structural evidence only");
  const seenIds = /* @__PURE__ */ new Set();
  const decisionRows = [];
  for (const [index, raw] of debts.entries()) {
    const path = `$.completion_debts[${index}]`;
    const debt = object(raw);
    if (!debt) {
      errors.push(`${path}: expected object`);
      continue;
    }
    if (!nonempty(debt.id)) errors.push(`${path}.id: required nonempty`);
    else if (seenIds.has(debt.id)) errors.push(`${path}.id: duplicate ${JSON.stringify(debt.id)}`);
    else seenIds.add(debt.id);
    if (!nonempty(debt.procedure)) errors.push(`${path}.procedure: required nonempty`);
    const disposition = debt.disposition;
    if (disposition === void 0) errors.push(`${path}.disposition: required (one of ${[...DISPOSITIONS].sort().join(", ")})`);
    else if (!DISPOSITIONS.has(String(disposition))) errors.push(`${path}.disposition: unsupported ${JSON.stringify(disposition)}`);
    if (disposition === "accepted_exception") {
      if (debt.state !== "accepted_exception") errors.push(`${path}: accepted_exception disposition requires state=accepted_exception (one row, one terminal bucket)`);
      const exception = object(debt.exception);
      requireKeys(exception, ["actor", "at", "ref", "scope", "rationale"], `${path}.exception`, errors);
      if (exception) {
        for (const key of ["actor", "scope", "rationale"]) if (!nonempty(exception[key])) errors.push(`${path}.exception.${key}: required for accepted_exception`);
        if (!isoTimestamp(exception.at)) errors.push(`${path}.exception.at: required timezone-aware ISO-8601 timestamp`);
        if (!digestRef(exception.ref)) errors.push(`${path}.exception.ref: required digest-bound evidence reference {path,sha256}`);
      }
    } else if (debt.state === "accepted_exception") errors.push(`${path}.disposition: state=accepted_exception requires disposition=accepted_exception`);
    if (STALE_DOC_CLASSES.has(String(debt.class)) && disposition === "accepted_exception") errors.push(`${path}.disposition: a reviewer-reported stale doc/comment is PAYABLE regardless of severity label -- accepted_exception is for irreparable historical limits only; fix the doc before CLEAN`);
    if (disposition === "decision_or_coordination_required") decisionRows.push(nonempty(debt.id) ? debt.id : `#${index}`);
    if (debt.state === "satisfied") {
      const typed = (array(debt.evidence) ?? []).map(object).filter((entry) => !!entry);
      const valid = typed.some((entry) => DEBT_EVIDENCE_KINDS.has(String(entry.kind)) && ["object", "command", "result"].every((key) => nonempty(entry[key])) && isoTimestamp(entry.observed_at) && digestRef(entry.evidence_ref));
      if (!valid) errors.push(`${path}.evidence: satisfied debt requires allowlisted, time-bound, digest-referenced execution evidence`);
    }
  }
  const residuals = array(report.residuals) ?? [];
  for (const [index, raw] of residuals.entries()) {
    const path = `$.residuals[${index}]`;
    const residual = object(raw);
    if (!residual) {
      errors.push(`${path}: expected object with kind (roadmap|accepted_exception|blocked)`);
      continue;
    }
    const kind = residual.kind;
    if (!["roadmap", "accepted_exception", "blocked"].includes(String(kind))) {
      errors.push(`${path}.kind: required, one of roadmap|accepted_exception|blocked`);
    } else if (kind === "accepted_exception") {
      for (const key of ["authority", "scope", "rationale"]) if (!nonempty(residual[key])) errors.push(`${path}.${key}: required for accepted_exception residual`);
    } else if (kind === "roadmap" && !nonempty(residual.represented_at)) {
      errors.push(`${path}.represented_at: roadmap residual must cite where it is consistently represented`);
    }
    if (STALE_DOC_CLASSES.has(String(residual.class))) errors.push(`${path}: a reviewer-reported stale doc/comment is payable debt, not a residual -- move it to completion_debts and fix it before CLEAN`);
  }
  for (const [index, raw] of (array(report.acceptance_criteria) ?? []).entries()) {
    const path = `$.acceptance_criteria[${index}]`;
    const criterion = object(raw);
    if (!criterion) {
      errors.push(`${path}: expected object`);
      continue;
    }
    if (!nonempty(criterion.id)) errors.push(`${path}.id: required`);
    if (typeof criterion.met !== "boolean") errors.push(`${path}.met: required boolean`);
    if (!nonempty(criterion.source)) errors.push(`${path}.source: required (who set the criterion, e.g. operator)`);
    if (criterion.waiver !== void 0 && (!object(criterion.waiver) || !nonempty(object(criterion.waiver)?.actor) || !nonempty(object(criterion.waiver)?.ref))) errors.push(`${path}.waiver: requires actor AND ref`);
    else if (object(criterion.waiver) && OPERATOR_ACTORS.has(String(criterion.source)) && !OPERATOR_ACTORS.has(normalizeActor(object(criterion.waiver)?.actor))) errors.push(`${path}.waiver: an operator-source criterion may be waived ONLY by the operator, not by a reviewer (${JSON.stringify(object(criterion.waiver)?.actor)})`);
  }
  if (verdict === "CLEAN") {
    if (target?.target_incorporated !== true) errors.push("$.target_binding: CLEAN requires target_incorporated=true");
    if (target?.target_commits_missing !== 0) errors.push("$.target_binding: CLEAN requires target_commits_missing=0");
    if (target?.candidate_commit !== repo.commit) errors.push("$.target_binding.candidate_commit: CLEAN requires equality with repo.commit");
    if (target?.merge_base !== target?.target_commit) errors.push("$.target_binding.merge_base: CLEAN requires current target to be an ancestor of the closing candidate");
    for (const [index, raw] of debts.entries()) {
      const debt = object(raw);
      if (!debt) continue;
      if (OPEN_DEBT_STATES.has(String(debt.state))) errors.push(`$.verdict: CLEAN forbidden -- completion_debts[${index}] (${debt.id ?? "?"}) is ${JSON.stringify(debt.state)} (payable debt remains)`);
      else if (debt.state === "deferred") errors.push(`$.verdict: CLEAN forbidden -- completion_debts[${index}] (${debt.id ?? "?"}) is deferred (unpaid work cannot be CLEAN regardless of disposition)`);
    }
    for (const [index, raw] of (array(report.acceptance_criteria) ?? []).entries()) {
      const criterion = object(raw);
      if (criterion?.met === false && !criterionWaived(criterion)) errors.push(`$.acceptance_criteria[${index}] (${criterion.id ?? "?"}): CLEAN/positive verdict is INVALID while an acceptance criterion is unmet -- an independent reviewer may not downgrade an operator criterion to a non-blocking nuance; pay it or record an explicit operator waiver (actor+ref)`);
    }
    if (decisionRows.length) errors.push(`$.verdict: CLEAN forbidden -- decision_or_coordination_required present: ${decisionRows.join(", ")}`);
    for (const [index, raw] of residuals.entries()) if (object(raw)?.kind === "blocked") errors.push(`$.verdict: CLEAN forbidden -- residuals[${index}] is blocked`);
    let notApplicable = 0;
    for (const name of REQUIRED_DIMENSIONS) {
      const dimension = object(dimensions?.[name]) ?? {};
      const state = dimension.state;
      if (state === "satisfied") {
        const typed = (array(dimension.evidence) ?? []).map(object).filter((entry) => !!entry);
        const allowed = DIMENSION_EVIDENCE_KINDS[name] ?? /* @__PURE__ */ new Set();
        if (!typed.some((entry) => allowed.has(String(entry.kind)) && ["object", "command", "result"].every((key) => nonempty(entry[key])) && isoTimestamp(entry.observed_at))) errors.push(`$.dimensions.${name}: CLEAN requires time-bound evidence kind ${[...allowed].sort().join(", ")} with object/command/result`);
      } else if (state === "not_applicable") {
        notApplicable++;
        if (!array(dimension.evidence)?.length && !nonempty(dimension.notes)) errors.push(`$.dimensions.${name}: CLEAN requires evidence/notes rationale for not_applicable`);
      } else errors.push(`$.dimensions.${name}: CLEAN requires satisfied (or evidenced not_applicable), got ${JSON.stringify(state)}`);
    }
    if (report.mode === "CLOSE" && notApplicable === REQUIRED_DIMENSIONS.length) errors.push("$.dimensions: CLEAN in CLOSE mode cannot mark every dimension not_applicable");
    for (const [name, raw] of Object.entries(claims ?? {})) {
      const claim = object(raw);
      if (!claim) continue;
      if (claim.state === void 0 || claim.state === "not_assessed") errors.push(`$.claims.${name}: CLEAN forbids an unassessed claim (state=${JSON.stringify(claim.state)}); establish it or mark not_applicable with policy_ref`);
      else if (claim.state === "established" && generic(claim.evidence)) errors.push(`$.claims.${name}: CLEAN requires SPECIFIC established evidence, not a generic token`);
    }
    const census = object(report.debt_census);
    if (!census) errors.push("$.debt_census: required for CLEAN (discovered/paid/accepted_exception ints; empty ledger is not a census)");
    else {
      const discovered = census.discovered, paid = census.paid, accepted = census.accepted_exception;
      if (![discovered, paid, accepted].every((value) => typeof value === "number" && Number.isInteger(value))) errors.push("$.debt_census: discovered/paid/accepted_exception must be integers");
      else {
        const d = discovered, p = paid, a = accepted;
        if (d !== p + a) errors.push(`$.debt_census: discovered (${d}) must equal paid (${p}) + accepted_exception (${a})`);
        if (d !== seenIds.size) errors.push(`$.debt_census.discovered (${d}) != unique completion_debts ledger entries (${seenIds.size})`);
        const satisfied = debts.filter((raw) => object(raw)?.state === "satisfied").length;
        const exceptions = debts.filter((raw) => object(raw)?.state === "accepted_exception").length;
        if (p !== satisfied) errors.push(`$.debt_census.paid (${p}) != satisfied ledger entries (${satisfied})`);
        if (a !== exceptions) errors.push(`$.debt_census.accepted_exception (${a}) != accepted_exception ledger entries (${exceptions})`);
      }
    }
    if (assessment?.recommendation !== "proceed") errors.push(`$.verdict: CLEAN requires handoff_assessment.recommendation 'proceed' (got ${JSON.stringify(assessment?.recommendation)})`);
  } else if (assessment?.recommendation === "proceed") errors.push("$.handoff_assessment.recommendation: unconditional proceed conflicts with NOT_CLEAN verdict");
  if (!allowPlaceholders) {
    if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id");
    for (const field of ["target_commit", "candidate_commit", "merge_base"]) if (typeof target?.[field] !== "string" || !/^[0-9a-f]{7,40}$/.test(target[field])) errors.push(`$.target_binding.${field}: required 7-40 char hex object id`);
    if (!isoTimestamp(report.generated_at)) errors.push("$.generated_at: required timezone-aware ISO-8601 timestamp");
  }
  const objectCommits = /* @__PURE__ */ new Map();
  for (const [name, raw] of Object.entries(claims ?? {})) {
    const claim = object(raw);
    if (!claim) continue;
    for (const event of array(claim.evidence) ?? []) {
      const evidence = object(event);
      if (evidence?.independence !== void 0 && !["established", "not_established", "legacy_unrecoverable"].includes(String(evidence.independence))) errors.push(`$.claims.${name}: independence must be established|not_established|legacy_unrecoverable`);
      else if (evidence?.independence === "legacy_unrecoverable") {
        for (const key of ["authority", "scope"]) if (!nonempty(evidence[key])) errors.push(`$.claims.${name}: legacy_unrecoverable requires ${key}`);
      }
      if (evidence?.kind === "independent_qa_verdict" && normalizeActor(evidence.reviewer) && normalizeActor(evidence.reviewer) === normalizeActor(evidence.implementer) && claim.state === "established") errors.push(`$.claims.${name}: reviewer and implementer normalize to the same actor (${JSON.stringify(evidence.reviewer)}) -- independence cannot be established`);
    }
    if (claim.state === "not_applicable" && (!nonempty(claim.na_reason) || !nonempty(claim.policy_ref))) errors.push(`$.claims.${name}: not_applicable requires na_reason AND policy_ref (a policy-bound citation, not generic rationale)`);
    if (claim.state === "established") {
      const evidence = (array(claim.evidence) ?? []).map(object).find((item) => !!item && nonempty(item.commit));
      if (evidence) objectCommits.set(name, evidence.commit);
    }
  }
  if (new Set(objectCommits.values()).size > 1) errors.push(`$.claims: same-object violation -- established claims bind different commits: ${[...objectCommits.entries()].sort().map(([name, commit]) => `${name}=${commit}`).join(", ")}`);
  if (verdict === "CLEAN") {
    for (const [name, commit] of objectCommits) if (repo.commit && commit !== repo.commit) errors.push(`$.claims.${name}: CLEAN requires claim commit ${JSON.stringify(commit)} to equal repo.commit ${JSON.stringify(repo.commit)}`);
    const actionIds = /* @__PURE__ */ new Set();
    for (const [index, raw] of (array(report.actions) ?? []).entries()) {
      const action = object(raw);
      if (!action) {
        errors.push(`$.actions[${index}]: expected object`);
        continue;
      }
      if (!nonempty(action.id)) errors.push(`$.actions[${index}].id: required`);
      else if (actionIds.has(action.id)) errors.push(`$.actions[${index}].id: duplicate ${JSON.stringify(action.id)}`);
      else actionIds.add(action.id);
      if (["planned", "failed", "blocked", void 0].includes(action.status)) errors.push(`$.actions[${index}]: CLEAN forbidden with unfinished/failed action (status=${JSON.stringify(action.status)})`);
      else if (action.status === "skipped" && !nonempty(action.skip_reason)) errors.push(`$.actions[${index}]: skipped action requires skip_reason`);
    }
    if (report.mode === "CLOSE" && Object.keys(claims ?? {}).length > 0 && Object.values(claims ?? {}).every((raw) => object(raw)?.state === "not_applicable")) errors.push("$.claims: CLEAN in CLOSE mode cannot mark every claim not_applicable");
  }
  if (!allowPlaceholders) for (const path of findPlaceholders(data)) errors.push(`${path}: unresolved template placeholder`);
  return errors;
}
function commitObject(value, allowPlaceholders) {
  return typeof value === "string" && (allowPlaceholders && PLACEHOLDER.test(value) || /^[0-9a-f]{7,40}$/.test(value));
}
function exactGitObject(value, allowPlaceholders) {
  return typeof value === "string" && (allowPlaceholders && PLACEHOLDER.test(value) || /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value));
}
function canonicalWriteRoot(value) {
  if (!nonempty(value)) return "";
  const normalized = pathPosix.normalize(value.replaceAll("\\", "/"));
  const wildcard = normalized.search(/[?*[\]{}]/);
  const root = wildcard < 0 ? normalized : normalized.slice(0, wildcard);
  return root.replace(/\/+$/, "");
}
function writeRootsOverlap(left, right) {
  if (!left || !right) return true;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
function targetWithinWritePaths(target, writePaths) {
  const normalized = pathPosix.normalize(target.replaceAll("\\", "/"));
  return writePaths.some((pattern) => {
    const root = canonicalWriteRoot(pattern);
    return root === "" || normalized === root || normalized.startsWith(`${root}/`);
  });
}
function digestRefOrPlaceholder(value, allowPlaceholders) {
  return digestRef(value) || allowPlaceholders && findPlaceholders(value).length > 0;
}
function normalizedStringSet(value) {
  const values = array(value);
  if (!values || values.some((item) => !nonempty(item))) return void 0;
  return [...new Set(values.map((item) => pathPosix.normalize(String(item).replaceAll("\\", "/"))))].sort();
}
function validatePlanningProjectionTransaction(action, lane, path, errors, allowPlaceholders) {
  requireKeys(action.projection_transaction, [
    "cause_key",
    "source_of_truth",
    "required_projections",
    "updated_projections",
    "atomic",
    "post_audit"
  ], `${path}.projection_transaction`, errors);
  const transaction = object(action.projection_transaction);
  if (!transaction) return;
  if (!nonempty(transaction.cause_key)) errors.push(`${path}.projection_transaction.cause_key: required stable debt/root-cause key`);
  if (!nonempty(transaction.source_of_truth)) errors.push(`${path}.projection_transaction.source_of_truth: required`);
  const required = normalizedStringSet(transaction.required_projections);
  const updated = normalizedStringSet(transaction.updated_projections);
  if (!required?.length) errors.push(`${path}.projection_transaction.required_projections: required nonempty exact projection set`);
  if (!updated?.length) errors.push(`${path}.projection_transaction.updated_projections: required nonempty exact projection set`);
  if (required && updated && JSON.stringify(required) !== JSON.stringify(updated)) {
    errors.push(`${path}.projection_transaction: required_projections must equal updated_projections atomically`);
  }
  if (transaction.atomic !== true) errors.push(`${path}.projection_transaction.atomic: expected true`);
  requireKeys(transaction.post_audit, ["status", "object", "evidence_ref"], `${path}.projection_transaction.post_audit`, errors);
  const audit = object(transaction.post_audit);
  if (audit) {
    if (audit.status !== "passed") errors.push(`${path}.projection_transaction.post_audit.status: expected passed`);
    if (audit.object !== action.after_object) errors.push(`${path}.projection_transaction.post_audit.object: must equal the operation after_object`);
    if (!digestRefOrPlaceholder(audit.evidence_ref, allowPlaceholders)) {
      errors.push(`${path}.projection_transaction.post_audit.evidence_ref: required digest-bound projection-coherence evidence`);
    }
  }
  const collisionKeys = new Set((array(lane?.collision_keys) ?? []).map(canonicalIdentity));
  const coordinationClaims = (array(lane?.coordination_claims) ?? []).map(object).filter((item) => !!item);
  const ownsPlanningDomain = coordinationClaims.some((claim) => canonicalIdentity(claim.key) === canonicalIdentity("planning-projections") && claim.access === "write");
  if (!collisionKeys.has(canonicalIdentity("planning-projections")) && !ownsPlanningDomain) {
    errors.push(`${path}.lane_id: planning_record_update requires a write claim on planning-projections`);
  }
}
function validatePushGate(action, lane, coordination, repo, parents, path, errors, allowPlaceholders) {
  if (lane?.role !== "integrator") errors.push(`${path}.lane_id: git_push requires the integrator lane`);
  requireKeys(action.push_gate, [
    "intent",
    "remote_ref",
    "candidate_commit",
    "expected_remote_commit",
    "observed_remote_commit",
    "observed_at",
    "writers_frozen",
    "worktree_clean",
    "review",
    "validation",
    "prior_remote_ci"
  ], `${path}.push_gate`, errors);
  const gate = object(action.push_gate);
  if (!gate) return;
  const intent = String(gate.intent);
  if (!PUSH_INTENTS.has(intent)) errors.push(`${path}.push_gate.intent: expected coherent_wave or minimal_ci_repair`);
  const coordinationTarget = object(coordination?.target);
  if (!nonempty(gate.remote_ref)) errors.push(`${path}.push_gate.remote_ref: required`);
  else if (coordinationTarget && gate.remote_ref !== coordinationTarget.ref) {
    errors.push(`${path}.push_gate.remote_ref: must equal coordination.target.ref`);
  }
  for (const field of ["candidate_commit", "expected_remote_commit", "observed_remote_commit"]) {
    if (!commitObject(gate[field], allowPlaceholders)) errors.push(`${path}.push_gate.${field}: required 7-40 char hex object id`);
  }
  if (gate.expected_remote_commit !== gate.observed_remote_commit) {
    errors.push(`${path}.push_gate: compare-and-swap precondition failed; observed remote differs from expected remote`);
  }
  if (gate.candidate_commit !== action.before_object || gate.candidate_commit !== action.after_object) {
    errors.push(`${path}.push_gate.candidate_commit: push must preserve the same local before/after candidate object`);
  }
  if (nonempty(repo.commit) && gate.candidate_commit !== repo.commit) {
    errors.push(`${path}.push_gate.candidate_commit: must equal repo.commit`);
  }
  if (!(allowPlaceholders && findPlaceholders(gate.observed_at).length > 0) && !isoTimestamp(gate.observed_at)) {
    errors.push(`${path}.push_gate.observed_at: required ISO timestamp`);
  }
  if (gate.writers_frozen !== true) errors.push(`${path}.push_gate.writers_frozen: expected true`);
  if (gate.worktree_clean !== true) errors.push(`${path}.push_gate.worktree_clean: expected true`);
  requireKeys(gate.review, ["state", "evidence_ref"], `${path}.push_gate.review`, errors);
  const review = object(gate.review);
  if (review) {
    if (review.state !== "accepted") errors.push(`${path}.push_gate.review.state: expected accepted`);
    if (!digestRefOrPlaceholder(review.evidence_ref, allowPlaceholders)) errors.push(`${path}.push_gate.review.evidence_ref: required digest-bound review`);
  }
  requireKeys(gate.validation, [
    "candidate_commit",
    "focused_state",
    "full_applicable_state",
    "known_failing_gates",
    "evidence_ref",
    "no_harm_evidence_ref"
  ], `${path}.push_gate.validation`, errors);
  const validation = object(gate.validation);
  if (validation) {
    if (validation.candidate_commit !== gate.candidate_commit) errors.push(`${path}.push_gate.validation.candidate_commit: must equal candidate_commit`);
    if (validation.focused_state !== "passed") errors.push(`${path}.push_gate.validation.focused_state: expected passed`);
    if (validation.full_applicable_state !== "passed") errors.push(`${path}.push_gate.validation.full_applicable_state: expected passed`);
    if (!Array.isArray(validation.known_failing_gates)) errors.push(`${path}.push_gate.validation.known_failing_gates: expected array`);
    else if (validation.known_failing_gates.length > 0) {
      errors.push(`${path}.push_gate.validation.known_failing_gates: push forbidden while any established gate is red, regardless of product/test-infrastructure classification`);
    }
    for (const field of ["evidence_ref", "no_harm_evidence_ref"]) {
      if (!digestRefOrPlaceholder(validation[field], allowPlaceholders)) errors.push(`${path}.push_gate.validation.${field}: required digest-bound evidence`);
    }
  }
  requireKeys(gate.prior_remote_ci, ["status", "commit", "evidence_ref"], `${path}.push_gate.prior_remote_ci`, errors);
  const priorCi = object(gate.prior_remote_ci);
  if (priorCi) {
    if (!(/* @__PURE__ */ new Set(["success", "failure", "not_configured"])).has(String(priorCi.status))) {
      errors.push(`${path}.push_gate.prior_remote_ci.status: expected success, failure, or not_configured`);
    }
    if (priorCi.commit !== gate.observed_remote_commit) errors.push(`${path}.push_gate.prior_remote_ci.commit: must equal observed_remote_commit`);
    if (!digestRefOrPlaceholder(priorCi.evidence_ref, allowPlaceholders)) errors.push(`${path}.push_gate.prior_remote_ci.evidence_ref: required digest-bound CI observation`);
    if (intent === "coherent_wave" && !["success", "not_configured"].includes(String(priorCi.status))) {
      errors.push(`${path}.push_gate.prior_remote_ci.status: coherent_wave requires the prior remote to be green or explicitly have no CI`);
    }
    if (intent === "minimal_ci_repair" && priorCi.status !== "failure") {
      errors.push(`${path}.push_gate.prior_remote_ci.status: minimal_ci_repair is reserved for a red remote baseline`);
    }
  }
  const parentMatches = intent === "coherent_wave" ? parents.some((parent) => parent.kind === "git_integrate" && parent.status === "executed" && object(parent.cas)?.result === "applied" && parent.after_object === gate.candidate_commit) : parents.some((parent) => parent.kind === "git_commit" && parent.status === "executed" && parent.after_object === gate.candidate_commit);
  if (!parentMatches) {
    errors.push(`${path}.parent_operation_ids: ${intent || "push"} requires the candidate-producing applied integration or minimal-repair commit as a direct parent`);
  }
  if ((action.status === "executed" || action.outcome !== void 0) && (array(object(action.outcome)?.evidence) ?? []).map(object).filter(Boolean).every((evidence) => evidence?.kind !== "remote_ref_resolution")) {
    errors.push(`${path}.outcome.evidence: git_push requires a remote_ref_resolution receipt`);
  }
}
function sha256(value, allowPlaceholders) {
  return typeof value === "string" && (allowPlaceholders && PLACEHOLDER.test(value) || /^[0-9a-f]{64}$/.test(value));
}
function validateCoordinationDomains(coordination, path, errors, allowPlaceholders) {
  const result = /* @__PURE__ */ new Map();
  const domains = array(coordination?.domains);
  if (!domains) {
    errors.push(`${path}.domains: schema 1.2 requires an array of versioned coordination domains`);
    return result;
  }
  for (const [index, raw] of domains.entries()) {
    const domainPath = `${path}.domains[${index}]`;
    requireKeys(raw, ["key", "version", "state_digest", "observed_at", "evidence_ref"], domainPath, errors);
    const domain = object(raw);
    if (!domain) continue;
    const key = canonicalIdentity(domain.key);
    if (!key) errors.push(`${domainPath}.key: required canonical coordination key`);
    else if (result.has(key)) errors.push(`${domainPath}.key: duplicate coordination domain ${JSON.stringify(key)}`);
    if (!Number.isInteger(domain.version) || Number(domain.version) < 0) {
      errors.push(`${domainPath}.version: required nonnegative monotonic integer`);
    }
    if (!sha256(domain.state_digest, allowPlaceholders)) {
      errors.push(`${domainPath}.state_digest: required SHA-256 of the invariant-bearing state`);
    }
    if (!(allowPlaceholders && findPlaceholders(domain.observed_at).length > 0) && !isoTimestamp(domain.observed_at)) {
      errors.push(`${domainPath}.observed_at: required ISO timestamp`);
    }
    if (!digestRefOrPlaceholder(domain.evidence_ref, allowPlaceholders)) {
      errors.push(`${domainPath}.evidence_ref: required digest-bound domain observation`);
    }
    if (key && Number.isInteger(domain.version) && sha256(domain.state_digest, allowPlaceholders)) {
      result.set(key, { version: Number(domain.version), stateDigest: String(domain.state_digest) });
    }
  }
  return result;
}
function coordinationClaimsCommute(left, right) {
  const leftClass = canonicalIdentity(left.operation_class);
  const rightClass = canonicalIdentity(right.operation_class);
  const leftAllows = new Set((array(left.commutes_with) ?? []).map(canonicalIdentity));
  const rightAllows = new Set((array(right.commutes_with) ?? []).map(canonicalIdentity));
  const leftRef = object(left.commutativity_ref);
  const rightRef = object(right.commutativity_ref);
  return !!leftClass && !!rightClass && leftAllows.has(rightClass) && rightAllows.has(leftClass) && digestRef(leftRef) && digestRef(rightRef) && leftRef?.sha256 === rightRef?.sha256;
}
function validateLaneCoordinationClaims(lane, lanePath, domains, errors, allowPlaceholders) {
  const rawClaims = array(lane.coordination_claims);
  if (!rawClaims) {
    errors.push(`${lanePath}.coordination_claims: schema 1.2 requires an array`);
    return [];
  }
  const claims = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [index, raw] of rawClaims.entries()) {
    const claimPath = `${lanePath}.coordination_claims[${index}]`;
    requireKeys(raw, [
      "key",
      "access",
      "expected_version",
      "expected_state_digest",
      "operation_class",
      "commutes_with",
      "commutativity_ref"
    ], claimPath, errors);
    const claim = object(raw);
    if (!claim) continue;
    const key = canonicalIdentity(claim.key);
    if (!key) errors.push(`${claimPath}.key: required canonical coordination key`);
    else if (seen.has(key)) errors.push(`${claimPath}.key: duplicate lane claim ${JSON.stringify(key)}`);
    else seen.add(key);
    if (!COORDINATION_ACCESS.has(String(claim.access))) {
      errors.push(`${claimPath}.access: expected read or write`);
    }
    if (!Number.isInteger(claim.expected_version) || Number(claim.expected_version) < 0) {
      errors.push(`${claimPath}.expected_version: required nonnegative integer`);
    }
    if (!sha256(claim.expected_state_digest, allowPlaceholders)) {
      errors.push(`${claimPath}.expected_state_digest: required SHA-256`);
    }
    if (!nonempty(claim.operation_class)) errors.push(`${claimPath}.operation_class: required`);
    if (!Array.isArray(claim.commutes_with)) errors.push(`${claimPath}.commutes_with: expected array`);
    else if (claim.commutes_with.some((item) => !nonempty(item))) errors.push(`${claimPath}.commutes_with: entries must be nonempty operation classes`);
    const commutes = array(claim.commutes_with) ?? [];
    if (commutes.length > 0 && !digestRefOrPlaceholder(claim.commutativity_ref, allowPlaceholders)) {
      errors.push(`${claimPath}.commutativity_ref: explicit commutativity requires digest-bound policy evidence`);
    }
    if (commutes.length === 0 && claim.commutativity_ref !== null) {
      errors.push(`${claimPath}.commutativity_ref: must be null when no commutativity is claimed`);
    }
    const domain = domains.get(key);
    if (!domain) errors.push(`${claimPath}.key: does not resolve to coordination.domains`);
    else {
      if (claim.expected_version !== domain.version) {
        errors.push(`${claimPath}.expected_version: stale plan; expected ${JSON.stringify(claim.expected_version)} but live domain is ${domain.version}`);
      }
      if (claim.expected_state_digest !== domain.stateDigest) {
        errors.push(`${claimPath}.expected_state_digest: stale plan; invariant state digest has changed`);
      }
    }
    if (key) claims.push(claim);
  }
  return claims;
}
function validateCoordination(value, path, errors, allowPlaceholders, schemaVersion, domains) {
  const requiredCoordinationKeys = [
    "dispatcher",
    "integrator",
    "write_policy",
    "integration_policy",
    "integration_mutex",
    "local_inference_max_concurrency",
    "target",
    "lanes"
  ];
  if (schemaVersion === "1.2") requiredCoordinationKeys.push("domains");
  requireKeys(value, requiredCoordinationKeys, path, errors);
  const coordination = object(value);
  const laneMap = /* @__PURE__ */ new Map();
  if (!coordination) return laneMap;
  for (const field of ["dispatcher", "integrator"]) {
    if (!nonempty(coordination[field])) errors.push(`${path}.${field}: required`);
  }
  if (coordination.write_policy !== "isolated_worktrees") {
    errors.push(`${path}.write_policy: expected isolated_worktrees`);
  }
  if (coordination.integration_policy !== "mutex_and_compare_and_swap") {
    errors.push(`${path}.integration_policy: expected mutex_and_compare_and_swap`);
  }
  requireKeys(coordination.integration_mutex, [
    "required",
    "kind",
    "scope",
    "max_lease_seconds"
  ], `${path}.integration_mutex`, errors);
  const integrationMutex = object(coordination.integration_mutex);
  if (integrationMutex) {
    if (integrationMutex.required !== true) errors.push(`${path}.integration_mutex.required: expected true`);
    if (integrationMutex.kind !== "lease_with_fencing") {
      errors.push(`${path}.integration_mutex.kind: expected lease_with_fencing`);
    }
    if (integrationMutex.scope !== "target_ref") {
      errors.push(`${path}.integration_mutex.scope: expected target_ref`);
    }
    if (!Number.isInteger(integrationMutex.max_lease_seconds) || Number(integrationMutex.max_lease_seconds) < 1 || Number(integrationMutex.max_lease_seconds) > 900) {
      errors.push(`${path}.integration_mutex.max_lease_seconds: expected integer from 1 through 900`);
    }
  }
  if (coordination.local_inference_max_concurrency !== 1) {
    errors.push(`${path}.local_inference_max_concurrency: expected 1`);
  }
  requireKeys(coordination.target, ["ref", "expected_commit", "observed_at"], `${path}.target`, errors);
  const target = object(coordination.target);
  if (target) {
    if (!nonempty(target.ref)) errors.push(`${path}.target.ref: required`);
    if (!commitObject(target.expected_commit, allowPlaceholders)) {
      errors.push(`${path}.target.expected_commit: required 7-40 char hex object id`);
    }
    if (!(allowPlaceholders && findPlaceholders(target.observed_at).length > 0) && !isoTimestamp(target.observed_at)) {
      errors.push(`${path}.target.observed_at: required ISO timestamp`);
    }
  }
  const lanes = array(coordination.lanes);
  if (!lanes) {
    errors.push(`${path}.lanes: expected array`);
    return laneMap;
  }
  const activeCollisionOwners = /* @__PURE__ */ new Map();
  const activeCoordinationClaims = /* @__PURE__ */ new Map();
  const activeWorktrees = /* @__PURE__ */ new Map();
  const activeBranches = /* @__PURE__ */ new Map();
  const activeWriteRoots = [];
  let activeIntegrators = 0;
  let activeLocalInference = 0;
  for (const [index, raw] of lanes.entries()) {
    const lanePath = `${path}.lanes[${index}]`;
    const requiredLaneKeys = [
      "id",
      "task_id",
      "owner",
      "role",
      "state",
      "execution_class",
      "model",
      "reasoning",
      "harness",
      "safe_context_limit_tokens",
      "estimated_context_tokens",
      "evaluation_mode",
      "routing_reason",
      "worktree",
      "branch",
      "baseline_commit",
      "read_paths",
      "write_paths",
      "dependencies",
      "invariants",
      "acceptance",
      "bootstrap",
      schemaVersion === "1.2" ? "coordination_claims" : "collision_keys"
    ];
    requireKeys(raw, requiredLaneKeys, lanePath, errors);
    const lane = object(raw);
    if (!lane) continue;
    const id = String(lane.id ?? "");
    if (!nonempty(lane.id)) errors.push(`${lanePath}.id: required`);
    else if (laneMap.has(id)) errors.push(`${lanePath}.id: duplicate ${JSON.stringify(id)}`);
    else laneMap.set(id, lane);
    for (const field of ["task_id", "owner", "routing_reason"]) {
      if (!nonempty(lane[field])) errors.push(`${lanePath}.${field}: required`);
    }
    if (!LANE_ROLES.has(String(lane.role))) errors.push(`${lanePath}.role: unsupported ${JSON.stringify(lane.role)}`);
    if (!LANE_STATES.has(String(lane.state))) errors.push(`${lanePath}.state: unsupported ${JSON.stringify(lane.state)}`);
    if (!EXECUTION_CLASSES.has(String(lane.execution_class))) errors.push(`${lanePath}.execution_class: unsupported ${JSON.stringify(lane.execution_class)}`);
    if (!EVALUATION_MODES.has(String(lane.evaluation_mode))) errors.push(`${lanePath}.evaluation_mode: unsupported ${JSON.stringify(lane.evaluation_mode)}`);
    for (const field of ["read_paths", "write_paths", "dependencies", "invariants", "acceptance"]) {
      if (!Array.isArray(lane[field])) errors.push(`${lanePath}.${field}: expected array`);
    }
    if (schemaVersion !== "1.2" && !Array.isArray(lane.collision_keys)) {
      errors.push(`${lanePath}.collision_keys: expected array`);
    }
    const laneClaims = schemaVersion === "1.2" ? validateLaneCoordinationClaims(lane, lanePath, domains, errors, allowPlaceholders) : [];
    if (["active", "ready", "integrated"].includes(String(lane.state))) {
      for (const field of ["model", "reasoning", "harness"]) {
        if (!nonempty(lane[field])) errors.push(`${lanePath}.${field}: required once a lane starts`);
      }
      if (!array(lane.read_paths)?.length) errors.push(`${lanePath}.read_paths: active lane requires a bounded read set`);
      if (!array(lane.invariants)?.length) errors.push(`${lanePath}.invariants: active lane requires protected invariants`);
      if (!array(lane.acceptance)?.length) errors.push(`${lanePath}.acceptance: active lane requires an acceptance boundary`);
    }
    const safe = lane.safe_context_limit_tokens;
    const estimated = lane.estimated_context_tokens;
    if (safe !== null && (!Number.isInteger(safe) || Number(safe) <= 0)) {
      errors.push(`${lanePath}.safe_context_limit_tokens: expected null or positive integer`);
    }
    if (!Number.isInteger(estimated) || Number(estimated) < 0) {
      errors.push(`${lanePath}.estimated_context_tokens: required nonnegative integer`);
    } else if (Number.isInteger(safe) && Number(estimated) > Number(safe)) {
      errors.push(`${lanePath}.estimated_context_tokens: exceeds verified safe context limit`);
    }
    const active = lane.state === "active";
    if (lane.execution_class === "local_inference" && active) {
      activeLocalInference += 1;
      if (!Number.isInteger(safe) || Number(safe) <= 0) {
        errors.push(`${lanePath}.safe_context_limit_tokens: active local inference requires a verified limit`);
      }
    }
    const modifying = lane.role === "writer" || lane.role === "integrator";
    if (modifying) {
      if (typeof lane.worktree !== "string" || !pathPosix.isAbsolute(lane.worktree)) {
        errors.push(`${lanePath}.worktree: modifying lane requires an absolute dedicated worktree`);
      }
      if (!nonempty(lane.branch)) errors.push(`${lanePath}.branch: modifying lane requires a branch`);
      if (!commitObject(lane.baseline_commit, allowPlaceholders)) {
        errors.push(`${lanePath}.baseline_commit: modifying lane requires a 7-40 char hex object id`);
      }
      if (!array(lane.write_paths)?.length) errors.push(`${lanePath}.write_paths: modifying lane requires a bounded write set`);
      if (schemaVersion === "1.2") {
        if (!laneClaims.some((claim) => claim.access === "write")) {
          errors.push(`${lanePath}.coordination_claims: modifying lane requires at least one versioned write claim`);
        }
      } else if (!array(lane.collision_keys)?.length) {
        errors.push(`${lanePath}.collision_keys: modifying lane requires semantic collision keys`);
      }
      for (const [writeIndex, rawPath] of (array(lane.write_paths) ?? []).entries()) {
        if (!nonempty(rawPath)) {
          errors.push(`${lanePath}.write_paths[${writeIndex}]: required nonempty repository-relative path or glob`);
          continue;
        }
        const normalized = pathPosix.normalize(rawPath.replaceAll("\\", "/"));
        if (pathPosix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized === ".git" || normalized.startsWith(".git/")) {
          errors.push(`${lanePath}.write_paths[${writeIndex}]: must be repository-relative, non-traversing, and outside .git`);
        }
        if (lane.role === "writer" && canonicalWriteRoot(rawPath) === "") {
          errors.push(`${lanePath}.write_paths[${writeIndex}]: writer lanes require a bounded root; repository-wide globs are integrator-only`);
        }
      }
      if (["active", "ready", "integrated"].includes(String(lane.state))) {
        requireKeys(lane.bootstrap, [
          "worktree",
          "branch",
          "head",
          "observed_at",
          "evidence_ref"
        ], `${lanePath}.bootstrap`, errors);
        const bootstrap = object(lane.bootstrap);
        if (bootstrap) {
          if (bootstrap.worktree !== lane.worktree) errors.push(`${lanePath}.bootstrap.worktree: must equal the assigned worktree`);
          if (bootstrap.branch !== lane.branch) errors.push(`${lanePath}.bootstrap.branch: must equal the assigned branch`);
          if (bootstrap.head !== lane.baseline_commit) errors.push(`${lanePath}.bootstrap.head: must equal the assigned baseline_commit`);
          if (!(allowPlaceholders && findPlaceholders(bootstrap.observed_at).length > 0) && !isoTimestamp(bootstrap.observed_at)) {
            errors.push(`${lanePath}.bootstrap.observed_at: required ISO timestamp`);
          }
          if (!(allowPlaceholders && findPlaceholders(bootstrap.evidence_ref).length > 0) && !digestRef(bootstrap.evidence_ref)) {
            errors.push(`${lanePath}.bootstrap.evidence_ref: required digest-bound cwd/HEAD/branch evidence`);
          }
        }
      }
    }
    if (active && schemaVersion === "1.2") {
      if (laneClaims.length === 0) errors.push(`${lanePath}.coordination_claims: active lane requires a bounded coordination domain`);
      for (const claim of laneClaims) {
        const key = canonicalIdentity(claim.key);
        const priorClaims = activeCoordinationClaims.get(key) ?? [];
        for (const prior of priorClaims) {
          const readRead = claim.access === "read" && prior.claim.access === "read";
          if (!readRead && !coordinationClaimsCommute(claim, prior.claim)) {
            errors.push(`${lanePath}.coordination_claims: active lanes ${prior.laneId} and ${id} overlap on ${JSON.stringify(key)} without symmetric, evidence-bound commutativity`);
          }
        }
        priorClaims.push({ laneId: id, claim });
        activeCoordinationClaims.set(key, priorClaims);
      }
    }
    if (active && modifying) {
      if (lane.role === "integrator") activeIntegrators += 1;
      if (typeof lane.worktree === "string") {
        const prior = activeWorktrees.get(lane.worktree);
        if (prior) errors.push(`${lanePath}.worktree: active modifying lanes ${prior} and ${id} share a worktree`);
        else activeWorktrees.set(lane.worktree, id);
      }
      if (nonempty(lane.branch)) {
        const prior = activeBranches.get(lane.branch);
        if (prior) errors.push(`${lanePath}.branch: active modifying lanes ${prior} and ${id} share a branch`);
        else activeBranches.set(lane.branch, id);
      }
      if (schemaVersion !== "1.2") {
        for (const rawKey of array(lane.collision_keys) ?? []) {
          const key = canonicalIdentity(rawKey);
          if (!key) {
            errors.push(`${lanePath}.collision_keys: entries must be nonempty`);
            continue;
          }
          const prior = activeCollisionOwners.get(key);
          if (prior) errors.push(`${lanePath}.collision_keys: active modifying lanes ${prior} and ${id} overlap on ${JSON.stringify(key)}`);
          else activeCollisionOwners.set(key, id);
        }
      }
      for (const rawPath of array(lane.write_paths) ?? []) {
        const root = canonicalWriteRoot(rawPath);
        for (const prior of activeWriteRoots) {
          if (writeRootsOverlap(root, prior.root)) {
            errors.push(`${lanePath}.write_paths: active modifying lanes ${prior.laneId} and ${id} overlap on write roots ${JSON.stringify(prior.root || "**/*")} and ${JSON.stringify(root || "**/*")}`);
          }
        }
        activeWriteRoots.push({ root, laneId: id });
      }
    }
  }
  if (activeIntegrators > 1) errors.push(`${path}.lanes: at most one integrator may be active`);
  if (activeLocalInference > 1) errors.push(`${path}.lanes: local inference is serialized; at most one model may be active`);
  return laneMap;
}
function validateCoordinationCas(action, lanes, domains, path, errors, allowPlaceholders) {
  requireKeys(action, ["source_lane_ids", "coordination_cas"], path, errors);
  const sourceLaneIds = array(action.source_lane_ids);
  if (!sourceLaneIds?.length) {
    errors.push(`${path}.source_lane_ids: schema 1.2 integration requires at least one source lane`);
    return;
  }
  const sourceLanes = /* @__PURE__ */ new Map();
  for (const [index, rawId] of sourceLaneIds.entries()) {
    const sourcePath = `${path}.source_lane_ids[${index}]`;
    if (!nonempty(rawId)) {
      errors.push(`${sourcePath}: required lane id`);
      continue;
    }
    const id = String(rawId);
    if (sourceLanes.has(id)) {
      errors.push(`${sourcePath}: duplicate source lane ${JSON.stringify(id)}`);
      continue;
    }
    const source = lanes.get(id);
    if (!source) errors.push(`${sourcePath}: does not resolve to coordination.lanes`);
    else if (source.role !== "writer") errors.push(`${sourcePath}: integration source must be a writer lane`);
    else sourceLanes.set(id, source);
  }
  const expectedClaims = /* @__PURE__ */ new Map();
  const writeOwners = /* @__PURE__ */ new Map();
  for (const [laneId, source] of sourceLanes) {
    for (const claim of (array(source.coordination_claims) ?? []).map(object).filter((item) => !!item)) {
      const key = canonicalIdentity(claim.key);
      const pair = `${laneId}\0${key}`;
      expectedClaims.set(pair, { laneId, claim });
      if (claim.access === "write") {
        const prior = writeOwners.get(key);
        if (prior) {
          errors.push(`${path}.source_lane_ids: source lanes ${prior} and ${laneId} both write ${JSON.stringify(key)}; combine them into one task or integrate as separate versioned transactions`);
        } else writeOwners.set(key, laneId);
      }
    }
  }
  const entries = array(action.coordination_cas);
  if (!entries) {
    errors.push(`${path}.coordination_cas: expected array`);
    return;
  }
  const seen = /* @__PURE__ */ new Set();
  const integrationApplied = object(action.cas)?.result === "applied";
  const pendingUpdates = /* @__PURE__ */ new Map();
  const startErrorCount = errors.length;
  for (const [index, raw] of entries.entries()) {
    const entryPath = `${path}.coordination_cas[${index}]`;
    requireKeys(raw, [
      "source_lane_id",
      "key",
      "access",
      "operation_class",
      "expected_version",
      "observed_version",
      "expected_state_digest",
      "observed_state_digest",
      "result",
      "result_version",
      "result_state_digest",
      "observed_at",
      "evidence_ref"
    ], entryPath, errors);
    const entry = object(raw);
    if (!entry) continue;
    const laneId = String(entry.source_lane_id ?? "");
    const key = canonicalIdentity(entry.key);
    const pair = `${laneId}\0${key}`;
    if (seen.has(pair)) errors.push(`${entryPath}: duplicate source-lane/domain check`);
    else seen.add(pair);
    const expected = expectedClaims.get(pair);
    if (!expected) errors.push(`${entryPath}: does not correspond to a source lane coordination claim`);
    else {
      for (const field of ["access", "operation_class", "expected_version", "expected_state_digest"]) {
        const claimField = field;
        if (entry[field] !== expected.claim[claimField]) errors.push(`${entryPath}.${field}: must equal the source lane claim`);
      }
    }
    if (!COORDINATION_ACCESS.has(String(entry.access))) errors.push(`${entryPath}.access: expected read or write`);
    if (!COORDINATION_CAS_RESULTS.has(String(entry.result))) errors.push(`${entryPath}.result: unsupported coordination CAS result`);
    for (const field of ["expected_version", "observed_version", "result_version"]) {
      if (!Number.isInteger(entry[field]) || Number(entry[field]) < 0) errors.push(`${entryPath}.${field}: required nonnegative integer`);
    }
    for (const field of ["expected_state_digest", "observed_state_digest", "result_state_digest"]) {
      if (!sha256(entry[field], allowPlaceholders)) errors.push(`${entryPath}.${field}: required SHA-256`);
    }
    if (!(allowPlaceholders && findPlaceholders(entry.observed_at).length > 0) && !isoTimestamp(entry.observed_at)) {
      errors.push(`${entryPath}.observed_at: required ISO timestamp`);
    }
    if (!digestRefOrPlaceholder(entry.evidence_ref, allowPlaceholders)) {
      errors.push(`${entryPath}.evidence_ref: required digest-bound live domain observation`);
    }
    const live = domains.get(key);
    if (!live) errors.push(`${entryPath}.key: does not resolve to a live coordination domain`);
    else {
      if (entry.observed_version !== live.version) errors.push(`${entryPath}.observed_version: must equal the freshly observed live domain version`);
      if (entry.observed_state_digest !== live.stateDigest) errors.push(`${entryPath}.observed_state_digest: must equal the freshly observed live domain digest`);
      const stale = entry.expected_version !== entry.observed_version || entry.expected_state_digest !== entry.observed_state_digest;
      if (integrationApplied && stale) {
        errors.push(`${entryPath}: stale plan cannot integrate; re-plan and re-attest against the live coordination domain`);
      }
      if (integrationApplied && entry.access === "read") {
        if (entry.result !== "validated") errors.push(`${entryPath}.result: applied integration requires validated for a read claim`);
        if (entry.result_version !== entry.observed_version || entry.result_state_digest !== entry.observed_state_digest) {
          errors.push(`${entryPath}: a read claim must preserve the observed domain version and digest`);
        }
      }
      if (integrationApplied && entry.access === "write") {
        if (entry.result !== "applied") errors.push(`${entryPath}.result: applied integration requires applied for a write claim`);
        if (entry.result_version !== Number(entry.observed_version) + 1) {
          errors.push(`${entryPath}.result_version: a write must advance the domain by exactly one`);
        }
        if (entry.result_state_digest === entry.observed_state_digest) {
          errors.push(`${entryPath}.result_state_digest: a version-advancing write requires changed invariant state`);
        }
        if (!stale && Number.isInteger(entry.result_version) && sha256(entry.result_state_digest, allowPlaceholders)) {
          pendingUpdates.set(key, { version: Number(entry.result_version), stateDigest: String(entry.result_state_digest) });
        }
      }
      if (!integrationApplied && entry.result === "rejected_stale" && !stale) {
        errors.push(`${entryPath}.result: rejected_stale requires a version or state-digest mismatch`);
      }
    }
  }
  for (const pair of expectedClaims.keys()) {
    if (!seen.has(pair)) errors.push(`${path}.coordination_cas: missing source-lane/domain check for ${JSON.stringify(pair.replace("\0", "@"))}`);
  }
  for (const pair of seen) {
    if (!expectedClaims.has(pair)) errors.push(`${path}.coordination_cas: contains an undeclared source-lane/domain check`);
  }
  if (integrationApplied && errors.length === startErrorCount) {
    for (const [key, state] of pendingUpdates) domains.set(key, state);
  }
}
function validateGuard(manifest, actions, lanes, errors, allowPlaceholders) {
  const guard = object(manifest.guard);
  requireKeys(manifest.guard, [
    "status",
    "baseline_commit",
    "candidate_tree",
    "minted_at",
    "staged_paths",
    "writers_frozen",
    "receipts",
    "deterministic_gates",
    "no_harm",
    "commit_barrier"
  ], "$.guard", errors);
  if (!guard) return;
  const status = String(guard.status);
  if (!GUARD_STATES.has(status)) errors.push(`$.guard.status: unsupported ${JSON.stringify(guard.status)}`);
  const repo = object(manifest.repo) ?? {};
  if (!commitObject(guard.baseline_commit, allowPlaceholders)) {
    errors.push("$.guard.baseline_commit: required 7-40 char baseline commit");
  } else if (nonempty(repo.commit) && guard.baseline_commit !== repo.commit) {
    errors.push("$.guard.baseline_commit: must equal repo.commit at GUARD initialization");
  }
  const candidateBound = status !== "initialized";
  if (candidateBound) {
    if (!exactGitObject(guard.candidate_tree, allowPlaceholders)) {
      errors.push("$.guard.candidate_tree: required exact 40- or 64-character staged-tree object");
    }
    if (!(allowPlaceholders && findPlaceholders(guard.minted_at).length > 0) && !isoTimestamp(guard.minted_at)) {
      errors.push("$.guard.minted_at: required timezone-aware candidate-mint timestamp");
    }
    if (guard.writers_frozen !== true) errors.push("$.guard.writers_frozen: candidate review requires frozen writers");
  } else {
    if (guard.candidate_tree !== null) errors.push("$.guard.candidate_tree: initialized GUARD must not claim a candidate tree");
    if (guard.minted_at !== null) errors.push("$.guard.minted_at: initialized GUARD must be null");
    if (guard.writers_frozen !== false) errors.push("$.guard.writers_frozen: initialized GUARD expects false until a tree is minted");
  }
  const stagedPaths = array(guard.staged_paths);
  if (!stagedPaths) errors.push("$.guard.staged_paths: expected array");
  else {
    const seenPaths = /* @__PURE__ */ new Set();
    for (const [index, rawPath] of stagedPaths.entries()) {
      const path = `$.guard.staged_paths[${index}]`;
      if (!nonempty(rawPath)) {
        errors.push(`${path}: required nonempty repository-relative path`);
        continue;
      }
      const normalized = pathPosix.normalize(rawPath.replaceAll("\\", "/"));
      if (pathPosix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized === ".git" || normalized.startsWith(".git/")) {
        errors.push(`${path}: must be repository-relative, non-traversing, and outside .git`);
      }
      if (seenPaths.has(normalized)) errors.push(`${path}: duplicate staged path ${JSON.stringify(normalized)}`);
      else seenPaths.add(normalized);
    }
  }
  const receipts = array(guard.receipts);
  const receiptById = /* @__PURE__ */ new Map();
  if (!receipts) errors.push("$.guard.receipts: expected array");
  else for (const [index, raw] of receipts.entries()) {
    const path = `$.guard.receipts[${index}]`;
    requireKeys(raw, [
      "id",
      "run_id",
      "round_id",
      "pod_id",
      "task_id",
      "role",
      "actor",
      "actual_model",
      "reasoning_level",
      "harness",
      "session_id",
      "baseline_commit",
      "candidate_tree",
      "prompt_sha256",
      "policy_sha256",
      "criteria_sha256",
      "checks_sha256",
      "started_at",
      "finished_at",
      "conclusion",
      "findings_total",
      "findings_paid",
      "unresolved",
      "repository_mutated",
      "mutation_owner_transfer",
      "evidence_ref"
    ], path, errors);
    const receipt = object(raw);
    if (!receipt) continue;
    const id = String(receipt.id ?? "");
    if (!nonempty(receipt.id)) errors.push(`${path}.id: required`);
    else if (receiptById.has(id)) errors.push(`${path}.id: duplicate ${JSON.stringify(id)}`);
    else receiptById.set(id, receipt);
    if (!GUARD_ROLES.has(String(receipt.role))) errors.push(`${path}.role: expected dev, qa, mister_clean, or holdout`);
    for (const field of [
      "run_id",
      "round_id",
      "pod_id",
      "task_id",
      "actor",
      "actual_model",
      "reasoning_level",
      "harness",
      "session_id"
    ]) {
      if (!nonempty(receipt[field])) errors.push(`${path}.${field}: required`);
    }
    if (receipt.baseline_commit !== guard.baseline_commit) errors.push(`${path}.baseline_commit: must equal guard baseline_commit`);
    if (receipt.candidate_tree !== guard.candidate_tree) errors.push(`${path}.candidate_tree: receipt is stale or bound to a different tree`);
    for (const field of ["prompt_sha256", "policy_sha256", "criteria_sha256", "checks_sha256"]) {
      if (!sha256(receipt[field], allowPlaceholders)) errors.push(`${path}.${field}: required SHA-256`);
    }
    for (const field of ["started_at", "finished_at"]) {
      if (!(allowPlaceholders && findPlaceholders(receipt[field]).length > 0) && !isoTimestamp(receipt[field])) {
        errors.push(`${path}.${field}: required timezone-aware ISO timestamp`);
      }
    }
    if (isoTimestamp(receipt.started_at) && isoTimestamp(receipt.finished_at) && Date.parse(String(receipt.started_at)) > Date.parse(String(receipt.finished_at))) {
      errors.push(`${path}: started_at cannot follow finished_at`);
    }
    if (!GUARD_CONCLUSIONS.has(String(receipt.conclusion))) {
      errors.push(`${path}.conclusion: expected pass, fail, conditional, or not_run`);
    }
    for (const field of ["findings_total", "findings_paid", "unresolved"]) {
      if (!Number.isInteger(receipt[field]) || Number(receipt[field]) < 0) {
        errors.push(`${path}.${field}: required nonnegative integer`);
      }
    }
    if (["findings_total", "findings_paid", "unresolved"].every((field) => Number.isInteger(receipt[field]))) {
      if (Number(receipt.findings_total) !== Number(receipt.findings_paid) + Number(receipt.unresolved)) {
        errors.push(`${path}: findings_total must equal findings_paid plus unresolved`);
      }
    }
    if (typeof receipt.repository_mutated !== "boolean") errors.push(`${path}.repository_mutated: expected boolean`);
    if (["qa", "holdout"].includes(String(receipt.role)) && receipt.repository_mutated !== false) {
      errors.push(`${path}.repository_mutated: QA and holdout are read-only exact-tree roles`);
    }
    if (receipt.repository_mutated === true) {
      if (!digestRefOrPlaceholder(receipt.mutation_owner_transfer, allowPlaceholders)) {
        errors.push(`${path}.mutation_owner_transfer: mutation requires a digest-bound custody transfer`);
      }
    } else if (receipt.mutation_owner_transfer !== null) {
      errors.push(`${path}.mutation_owner_transfer: must be null when the receipt did not mutate the repository`);
    }
    if (!digestRefOrPlaceholder(receipt.evidence_ref, allowPlaceholders)) {
      errors.push(`${path}.evidence_ref: required digest-bound exact-tree receipt`);
    }
  }
  const gates = object(guard.deterministic_gates);
  if (guard.deterministic_gates !== null) {
    requireKeys(guard.deterministic_gates, [
      "candidate_tree",
      "state",
      "required_count",
      "passed_count",
      "known_failures",
      "evidence_ref"
    ], "$.guard.deterministic_gates", errors);
    if (gates) {
      if (gates.candidate_tree !== guard.candidate_tree) errors.push("$.guard.deterministic_gates.candidate_tree: must equal guard candidate_tree");
      if (!(/* @__PURE__ */ new Set(["passed", "failed", "not_run"])).has(String(gates.state))) {
        errors.push("$.guard.deterministic_gates.state: expected passed, failed, or not_run");
      }
      for (const field of ["required_count", "passed_count"]) {
        if (!Number.isInteger(gates[field]) || Number(gates[field]) < 0) errors.push(`$.guard.deterministic_gates.${field}: required nonnegative integer`);
      }
      if (!Array.isArray(gates.known_failures)) errors.push("$.guard.deterministic_gates.known_failures: expected array");
      if (gates.state === "passed") {
        if (gates.required_count !== gates.passed_count) errors.push("$.guard.deterministic_gates: passed requires every required gate to pass");
        if ((array(gates.known_failures) ?? []).length > 0) errors.push("$.guard.deterministic_gates.known_failures: passed forbids known failures");
      }
      if (!digestRefOrPlaceholder(gates.evidence_ref, allowPlaceholders)) errors.push("$.guard.deterministic_gates.evidence_ref: required digest-bound gate receipt");
    }
  }
  const noHarm = object(guard.no_harm);
  if (guard.no_harm !== null) {
    requireKeys(guard.no_harm, ["candidate_tree", "state", "introduced_by_run_open", "evidence_ref"], "$.guard.no_harm", errors);
    if (noHarm) {
      if (noHarm.candidate_tree !== guard.candidate_tree) errors.push("$.guard.no_harm.candidate_tree: must equal guard candidate_tree");
      if (!(/* @__PURE__ */ new Set(["passed", "failed", "not_run"])).has(String(noHarm.state))) errors.push("$.guard.no_harm.state: expected passed, failed, or not_run");
      if (!Number.isInteger(noHarm.introduced_by_run_open) || Number(noHarm.introduced_by_run_open) < 0) {
        errors.push("$.guard.no_harm.introduced_by_run_open: required nonnegative integer");
      }
      if (noHarm.state === "passed" && noHarm.introduced_by_run_open !== 0) {
        errors.push("$.guard.no_harm.introduced_by_run_open: passed requires zero cleanup-introduced open debt");
      }
      if (!digestRefOrPlaceholder(noHarm.evidence_ref, allowPlaceholders)) errors.push("$.guard.no_harm.evidence_ref: required digest-bound comparator receipt");
    }
  }
  requireKeys(guard.commit_barrier, [
    "state",
    "approved_tree",
    "receipt_ids",
    "opened_at",
    "crossed_action_id"
  ], "$.guard.commit_barrier", errors);
  const barrier = object(guard.commit_barrier);
  if (!barrier) return;
  const barrierState = String(barrier.state);
  if (!GUARD_BARRIER_STATES.has(barrierState)) errors.push(`$.guard.commit_barrier.state: unsupported ${JSON.stringify(barrier.state)}`);
  if (status === "initialized" || status === "collecting") {
    if (barrierState !== "closed") errors.push("$.guard.commit_barrier.state: initialized or collecting GUARD must remain closed");
  } else if (status === "passed" && barrierState !== "open") {
    errors.push("$.guard.commit_barrier.state: passed GUARD requires an open barrier");
  } else if (status === "crossed" && barrierState !== "crossed") {
    errors.push("$.guard.commit_barrier.state: crossed GUARD requires a crossed barrier");
  } else if (status === "invalidated" && barrierState !== "invalidated") {
    errors.push("$.guard.commit_barrier.state: invalidated GUARD requires an invalidated barrier");
  }
  const selectedIds = array(barrier.receipt_ids);
  const selectedReceipts = [];
  if (!selectedIds) errors.push("$.guard.commit_barrier.receipt_ids: expected array");
  else {
    const seenIds = /* @__PURE__ */ new Set();
    for (const [index, rawId] of selectedIds.entries()) {
      const path = `$.guard.commit_barrier.receipt_ids[${index}]`;
      if (!nonempty(rawId)) {
        errors.push(`${path}: required receipt id`);
        continue;
      }
      const id = String(rawId);
      if (seenIds.has(id)) errors.push(`${path}: duplicate receipt id ${JSON.stringify(id)}`);
      else seenIds.add(id);
      const receipt = receiptById.get(id);
      if (!receipt) errors.push(`${path}: does not resolve to guard.receipts`);
      else selectedReceipts.push(receipt);
    }
  }
  const barrierReady = barrierState === "open" || barrierState === "crossed";
  if (barrierReady) {
    if (barrier.approved_tree !== guard.candidate_tree) errors.push("$.guard.commit_barrier.approved_tree: must equal guard candidate_tree");
    if (!(allowPlaceholders && findPlaceholders(barrier.opened_at).length > 0) && !isoTimestamp(barrier.opened_at)) {
      errors.push("$.guard.commit_barrier.opened_at: required timezone-aware timestamp");
    }
    if (selectedReceipts.length !== 4) errors.push("$.guard.commit_barrier.receipt_ids: exact-tree barrier requires exactly four final receipts");
    const byRole = /* @__PURE__ */ new Map();
    const actors = /* @__PURE__ */ new Set();
    const sessions = /* @__PURE__ */ new Set();
    const taskBindings = /* @__PURE__ */ new Set();
    for (const receipt of selectedReceipts) {
      const role = String(receipt.role);
      if (byRole.has(role)) errors.push(`$.guard.commit_barrier.receipt_ids: multiple selected receipts for ${role}`);
      else byRole.set(role, receipt);
      const actor = canonicalIdentity(receipt.actor);
      const session = canonicalIdentity(`${receipt.harness}:${receipt.session_id}`);
      taskBindings.add(JSON.stringify([
        receipt.run_id,
        receipt.round_id,
        receipt.pod_id,
        receipt.task_id
      ]));
      if (actors.has(actor)) errors.push("$.guard.commit_barrier.receipt_ids: DEV, QA, Mister Clean, and holdout must be distinct actors");
      else actors.add(actor);
      if (sessions.has(session)) errors.push("$.guard.commit_barrier.receipt_ids: final receipts must come from distinct harness/session identities");
      else sessions.add(session);
      if (receipt.candidate_tree !== guard.candidate_tree) errors.push("$.guard.commit_barrier.receipt_ids: selected receipt is bound to a different candidate tree");
      if (receipt.conclusion !== "pass") errors.push("$.guard.commit_barrier.receipt_ids: every selected role receipt must conclude pass");
      if (receipt.unresolved !== 0 || receipt.findings_total !== receipt.findings_paid) {
        errors.push("$.guard.commit_barrier.receipt_ids: every selected receipt requires zero unresolved findings and all findings paid");
      }
      if (receipt.repository_mutated !== false) {
        errors.push("$.guard.commit_barrier.receipt_ids: a receipt that mutated the repository is stale; mint a new tree and obtain a non-mutating final receipt");
      }
    }
    if (taskBindings.size !== 1) {
      errors.push("$.guard.commit_barrier.receipt_ids: all final receipts must bind the same run, round, pod, and task");
    }
    for (const role of GUARD_ROLES) if (!byRole.has(role)) errors.push(`$.guard.commit_barrier.receipt_ids: missing final ${role} receipt`);
    const dev = byRole.get("dev");
    const qa = byRole.get("qa");
    const clean = byRole.get("mister_clean");
    const holdout = byRole.get("holdout");
    if (dev && qa && isoTimestamp(dev.finished_at) && isoTimestamp(qa.started_at) && Date.parse(String(dev.finished_at)) > Date.parse(String(qa.started_at))) {
      errors.push("$.guard.commit_barrier.receipt_ids: QA must start after DEV finishes the exact candidate");
    }
    if (dev && clean && isoTimestamp(dev.finished_at) && isoTimestamp(clean.started_at) && Date.parse(String(dev.finished_at)) > Date.parse(String(clean.started_at))) {
      errors.push("$.guard.commit_barrier.receipt_ids: Mister Clean must start after DEV finishes the exact candidate");
    }
    for (const prior of [dev, qa, clean]) {
      if (prior && holdout && isoTimestamp(prior.finished_at) && isoTimestamp(holdout.started_at) && Date.parse(String(prior.finished_at)) > Date.parse(String(holdout.started_at))) {
        errors.push("$.guard.commit_barrier.receipt_ids: holdout must remain the final independent pass");
      }
    }
    if (gates?.state !== "passed") errors.push("$.guard.deterministic_gates.state: commit barrier requires passed exact-tree gates");
    if (noHarm?.state !== "passed" || noHarm?.introduced_by_run_open !== 0) {
      errors.push("$.guard.no_harm: commit barrier requires a passed exact-tree comparator with zero introduced debt");
    }
  } else {
    if (barrier.approved_tree !== null) errors.push("$.guard.commit_barrier.approved_tree: closed or invalidated barrier must not approve a tree");
    if ((selectedIds ?? []).length > 0) errors.push("$.guard.commit_barrier.receipt_ids: closed or invalidated barrier must not select final receipts");
    if (barrier.opened_at !== null) errors.push("$.guard.commit_barrier.opened_at: closed or invalidated barrier must be null");
  }
  const actionById = /* @__PURE__ */ new Map();
  const executedCommits = [];
  for (const [actionIndex, raw] of actions.entries()) {
    const action = object(raw);
    if (!action) continue;
    if (nonempty(action.id)) actionById.set(action.id, action);
    if (action.status === "executed" && LOCAL_MUTATION_KINDS.has(String(action.kind)) && isoTimestamp(action.recorded_at) && isoTimestamp(guard.minted_at) && Date.parse(String(action.recorded_at)) > Date.parse(String(guard.minted_at)) && status !== "invalidated") {
      errors.push(`$.guard: executed mutation ${String(action.id)} occurred after candidate mint; invalidate receipts and mint a new tree`);
    }
    if (action.kind === "git_commit") {
      requireKeys(action.guard_commit, [
        "candidate_tree",
        "commit",
        "commit_tree",
        "receipt_ids",
        "evidence_ref"
      ], `$.actions[${actionIndex}].guard_commit`, errors);
      const commitProof = object(action.guard_commit);
      const lane = lanes.get(String(action.lane_id));
      if (lane?.role !== "integrator") errors.push(`$.actions[${actionIndex}].lane_id: GUARD git_commit requires the integrator lane`);
      if (commitProof) {
        if (commitProof.candidate_tree !== guard.candidate_tree || commitProof.commit_tree !== guard.candidate_tree) {
          errors.push(`$.actions[${actionIndex}].guard_commit: candidate_tree and commit_tree must equal the approved guard tree`);
        }
        if (action.status === "executed" && commitProof.commit !== action.after_object) {
          errors.push(`$.actions[${actionIndex}].guard_commit.commit: must equal the executed action after_object`);
        }
        const expectedReceipts = [...new Set((selectedIds ?? []).map(String))].sort();
        const actualReceipts = [...new Set((array(commitProof.receipt_ids) ?? []).map(String))].sort();
        if (JSON.stringify(expectedReceipts) !== JSON.stringify(actualReceipts)) {
          errors.push(`$.actions[${actionIndex}].guard_commit.receipt_ids: must equal the commit-barrier receipts`);
        }
        if (!digestRefOrPlaceholder(commitProof.evidence_ref, allowPlaceholders)) {
          errors.push(`$.actions[${actionIndex}].guard_commit.evidence_ref: required digest-bound commit-tree proof`);
        }
      }
      if (action.status === "executed") executedCommits.push(action);
    }
    if (["git_integrate", "git_push"].includes(String(action.kind)) && action.status === "executed" && barrierState !== "crossed") {
      errors.push(`$.actions[${actionIndex}]: GUARD integration or push requires a crossed exact-tree commit barrier`);
    }
  }
  if (barrierState === "crossed") {
    if (!nonempty(barrier.crossed_action_id)) errors.push("$.guard.commit_barrier.crossed_action_id: crossed barrier requires the executed git_commit action id");
    const crossed = actionById.get(String(barrier.crossed_action_id));
    if (!crossed || crossed.kind !== "git_commit" || crossed.status !== "executed") {
      errors.push("$.guard.commit_barrier.crossed_action_id: must resolve to one executed git_commit action");
    }
    if (executedCommits.length !== 1 || executedCommits[0]?.id !== barrier.crossed_action_id) {
      errors.push("$.guard.commit_barrier.crossed_action_id: exactly one executed GUARD commit may cross the barrier");
    }
  } else {
    if (barrier.crossed_action_id !== null) errors.push("$.guard.commit_barrier.crossed_action_id: non-crossed barrier must be null");
    if (executedCommits.length > 0) errors.push("$.guard.commit_barrier.state: executed git_commit forbidden before the exact-tree barrier crosses");
  }
}
function validateManifest(data, allowPlaceholders = false) {
  const errors = [];
  const manifest = object(data);
  requireKeys(data, ["record_type", "schema_version", "execution_state", "repo", "mode", "request_ref", "authorization_basis", "policy_sources", "actions", "excluded_actions"], "$", errors);
  if (!manifest || errors.length > 0) return errors;
  if (manifest.record_type !== "mister-clean.action-manifest") errors.push("$.record_type: expected mister-clean.action-manifest");
  if (!MANIFEST_SCHEMA_VERSIONS.has(String(manifest.schema_version))) errors.push("$.schema_version: expected 1.0, 1.1, or 1.2");
  if (!EXECUTION_STATES.has(String(manifest.execution_state))) errors.push(`$.execution_state: unsupported value ${JSON.stringify(manifest.execution_state)}`);
  if (!["CLEAN", "CLOSE", "CONFORM", "GUARD"].includes(String(manifest.mode))) errors.push("$.mode: action manifest requires CLEAN, CLOSE, CONFORM, or GUARD");
  const repo = object(manifest.repo) ?? {};
  if (!allowPlaceholders) {
    if (!nonempty(repo.id)) errors.push("$.repo.id: required portable repository identity");
    if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id");
  }
  if (!nonempty(manifest.request_ref)) errors.push("$.request_ref: required");
  validateAuthorizationBasis(manifest.authorization_basis, "$.authorization_basis", errors);
  if (!Array.isArray(manifest.excluded_actions)) errors.push("$.excluded_actions: expected array");
  if (manifest.schema_version === "1.0" && manifest.legacy_schema_acknowledged !== true) {
    errors.push("$.legacy_schema_acknowledged: schema 1.0 omits coordination/CAS protections and requires explicit true acknowledgment");
  }
  const actions = array(manifest.actions);
  if (!actions) {
    errors.push("$.actions: expected array");
    return errors;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const [index, raw] of actions.entries()) {
    const path = `$.actions[${index}]`;
    const action = object(raw);
    requireKeys(raw, ["id", "kind", "target", "purpose", "risk", "authorization", "preconditions", "verification"], path, errors);
    if (!action) continue;
    if (!nonempty(action.id)) errors.push(`${path}.id: required`);
    else if (seen.has(action.id)) errors.push(`${path}.id: duplicate ${action.id}`);
    else seen.add(action.id);
    const kind = String(action.kind);
    if (PROHIBITED_KINDS.has(kind)) errors.push(`${path}: unrecoverable or prohibited action is outside Mister Clean`);
    else if (!ALLOWED_ACTION_KINDS.has(kind)) errors.push(`${path}.kind: unsupported action kind ${JSON.stringify(action.kind)}`);
    if (!nonempty(action.target)) errors.push(`${path}.target: required`);
    if (!nonempty(action.purpose)) errors.push(`${path}.purpose: required`);
    if (!RISKS.has(String(action.risk))) errors.push(`${path}.risk: unsupported value ${JSON.stringify(action.risk)}`);
    if (action.risk === "unrecoverable") errors.push(`${path}: unrecoverable or prohibited action is outside Mister Clean`);
    if (CONSEQUENT_ACTION_KINDS.has(kind) && action.risk !== "consequential_external") errors.push(`${path}.risk: ${kind} requires consequential_external`);
    if (!Array.isArray(action.preconditions)) errors.push(`${path}.preconditions: expected array`);
    if (!Array.isArray(action.verification)) errors.push(`${path}.verification: expected array`);
    const authorization = object(action.authorization);
    requireKeys(action.authorization, ["state", "source", "ref"], `${path}.authorization`, errors);
    if (!authorization) continue;
    if (!AUTH_STATES.has(String(authorization.state))) errors.push(`${path}.authorization.state: unsupported value ${JSON.stringify(authorization.state)}`);
    if (EXECUTION_STATES.has(String(manifest.execution_state)) && authorization.state !== "granted") errors.push(`${path}.authorization.state: ${manifest.execution_state} manifest requires granted`);
    if (CONSEQUENT_ACTION_KINDS.has(kind) || action.risk === "consequential_external") {
      if (authorization.state === "granted" && !STANDING_AUTH_SOURCES.has(String(authorization.source))) errors.push(`${path}.authorization.source: consequential action requires skill_invocation, explicit_user, or explicit_operator`);
      if (authorization.state === "granted" && !nonempty(authorization.ref)) errors.push(`${path}.authorization.ref: consequential action requires a reference`);
      if (!array(action.preconditions)?.length) errors.push(`${path}.preconditions: consequential action requires a bounded preflight`);
      if (!array(action.verification)?.length) errors.push(`${path}.verification: consequential action requires an exact postcondition`);
    }
    if (manifest.execution_state === "executed" && !array(action.verification)?.length) errors.push(`${path}.verification: executed action requires evidence`);
    if (manifest.execution_state === "executed") {
      const outcome = object(action.outcome);
      requireKeys(action.outcome, ["state", "evidence"], `${path}.outcome`, errors);
      if (outcome) {
        if (outcome.state !== "verified") errors.push(`${path}.outcome.state: executed action requires verified`);
        const typed = (array(outcome.evidence) ?? []).map(object).filter((entry) => !!entry);
        if (!typed.some((entry) => ACTION_EVIDENCE_KINDS.has(String(entry.kind)) && ["object", "command", "result"].every((key) => nonempty(entry[key])) && isoTimestamp(entry.observed_at) && digestRef(entry.evidence_ref))) errors.push(`${path}.outcome.evidence: executed action requires allowlisted, time-bound, digest-referenced execution evidence`);
      }
    }
  }
  const schemaVersion = String(manifest.schema_version);
  if (manifest.mode === "GUARD" && schemaVersion !== "1.2") {
    errors.push("$.schema_version: GUARD requires schema 1.2 exact-tree enforcement");
  }
  if (manifest.mode !== "GUARD" && manifest.guard !== void 0 && manifest.guard !== null) {
    errors.push("$.guard: exact-tree guard record is valid only in GUARD mode");
  }
  const coordination = object(manifest.coordination);
  const coordinationDomains = schemaVersion === "1.2" ? validateCoordinationDomains(coordination, "$.coordination", errors, allowPlaceholders) : /* @__PURE__ */ new Map();
  if (schemaVersion === "1.1" || schemaVersion === "1.2") {
    const lanes = validateCoordination(coordination, "$.coordination", errors, allowPlaceholders, schemaVersion, coordinationDomains);
    const mutexPolicy = object(coordination?.integration_mutex);
    const maxLeaseSeconds = Number(mutexPolicy?.max_lease_seconds);
    const priorLeaseByResource = /* @__PURE__ */ new Map();
    const recordedOperations = /* @__PURE__ */ new Map();
    let expectedTargetCommit = object(coordination?.target)?.expected_commit;
    for (const [index, raw] of actions.entries()) {
      const path = `$.actions[${index}]`;
      const action = object(raw);
      if (!action) continue;
      requireKeys(action, [
        "lane_id",
        "task_id",
        "parent_operation_ids",
        "before_object",
        "after_object",
        "recorded_at"
      ], path, errors);
      const lane = lanes.get(String(action.lane_id));
      if (!lane) errors.push(`${path}.lane_id: must resolve to a coordination lane`);
      else if (action.task_id !== lane.task_id) errors.push(`${path}.task_id: must equal the lane task_id`);
      if (!nonempty(action.task_id)) errors.push(`${path}.task_id: required`);
      if (!nonempty(action.before_object)) errors.push(`${path}.before_object: required`);
      if ((manifest.execution_state === "executed" || action.status === "executed") && !nonempty(action.after_object)) {
        errors.push(`${path}.after_object: executed operation requires the resulting object`);
      }
      if (!(allowPlaceholders && findPlaceholders(action.recorded_at).length > 0) && !isoTimestamp(action.recorded_at)) {
        errors.push(`${path}.recorded_at: required ISO timestamp`);
      }
      const parents = array(action.parent_operation_ids);
      const parentOperations = [];
      if (!parents) errors.push(`${path}.parent_operation_ids: expected array`);
      else for (const [parentIndex, parent] of parents.entries()) {
        if (!nonempty(parent)) errors.push(`${path}.parent_operation_ids[${parentIndex}]: required nonempty operation id`);
        else {
          const parentOperation = recordedOperations.get(parent);
          if (!parentOperation) errors.push(`${path}.parent_operation_ids[${parentIndex}]: parent must precede child in the append-only log`);
          else parentOperations.push(parentOperation);
        }
      }
      if (nonempty(action.id)) recordedOperations.set(action.id, action);
      if (LOCAL_MUTATION_KINDS.has(String(action.kind))) {
        if (lane?.role !== "writer" && lane?.role !== "integrator") {
          errors.push(`${path}.lane_id: ${action.kind} requires a modifying lane`);
        }
        if (nonempty(action.target) && lane && !targetWithinWritePaths(action.target, array(lane.write_paths) ?? [])) {
          errors.push(`${path}.target: must be contained by the lane write_paths`);
        }
      }
      if (action.kind === "planning_record_update") {
        validatePlanningProjectionTransaction(action, lane, path, errors, allowPlaceholders);
      }
      if (action.kind === "agent_dispatch" && lane) {
        if (!array(lane.invariants)?.length || !array(lane.acceptance)?.length) {
          errors.push(`${path}: dispatched lane requires explicit invariants and acceptance boundary`);
        }
      }
      if (action.kind === "git_integrate") {
        if (lane?.role !== "integrator") errors.push(`${path}.lane_id: git_integrate requires the integrator lane`);
        requireKeys(action.cas, [
          "compare_and_swap",
          "target_ref",
          "expected_target_commit",
          "observed_target_commit",
          "candidate_commit",
          "result",
          "result_commit",
          "mutex"
        ], `${path}.cas`, errors);
        const cas = object(action.cas);
        if (cas) {
          if (cas.compare_and_swap !== true) errors.push(`${path}.cas.compare_and_swap: expected true`);
          if (!nonempty(cas.target_ref)) errors.push(`${path}.cas.target_ref: required`);
          const coordinationTarget = object(coordination?.target);
          if (coordinationTarget && cas.target_ref !== coordinationTarget.ref) {
            errors.push(`${path}.cas.target_ref: must equal coordination.target.ref`);
          }
          if (commitObject(expectedTargetCommit, allowPlaceholders) && cas.expected_target_commit !== expectedTargetCommit) {
            errors.push(`${path}.cas.expected_target_commit: must equal the current operation-log target object`);
          }
          if (cas.expected_target_commit !== action.before_object) {
            errors.push(`${path}.before_object: git_integrate must equal cas.expected_target_commit`);
          }
          for (const field of ["expected_target_commit", "observed_target_commit", "candidate_commit"]) {
            if (!commitObject(cas[field], allowPlaceholders)) errors.push(`${path}.cas.${field}: required 7-40 char hex object id`);
          }
          if (!CAS_RESULTS.has(String(cas.result))) errors.push(`${path}.cas.result: unsupported ${JSON.stringify(cas.result)}`);
          if (cas.result === "applied") {
            if (action.status !== "executed") errors.push(`${path}.status: applied integration requires executed`);
            if (cas.expected_target_commit !== cas.observed_target_commit) {
              errors.push(`${path}.cas: applied integration requires observed target to equal expected target`);
            }
            if (!commitObject(cas.result_commit, allowPlaceholders)) {
              errors.push(`${path}.cas.result_commit: applied integration requires resulting commit`);
            }
            if (cas.result_commit !== action.after_object) {
              errors.push(`${path}.after_object: applied integration must equal cas.result_commit`);
            }
            expectedTargetCommit = cas.result_commit;
          }
          if (cas.result === "rejected_target_moved" && cas.expected_target_commit === cas.observed_target_commit) {
            errors.push(`${path}.cas: rejected_target_moved requires a changed target object`);
          }
          requireKeys(cas.mutex, [
            "resource",
            "holder_lane_id",
            "lease_id",
            "fencing_token",
            "acquired_at",
            "mutation_observed_at",
            "expires_at",
            "released_at"
          ], `${path}.cas.mutex`, errors);
          const mutex = object(cas.mutex);
          if (mutex) {
            if (!nonempty(mutex.resource) || mutex.resource !== cas.target_ref) {
              errors.push(`${path}.cas.mutex.resource: must equal the CAS target_ref`);
            }
            if (!nonempty(mutex.holder_lane_id) || mutex.holder_lane_id !== action.lane_id) {
              errors.push(`${path}.cas.mutex.holder_lane_id: must equal the integrator lane_id`);
            }
            if (!nonempty(mutex.lease_id)) errors.push(`${path}.cas.mutex.lease_id: required`);
            if (!Number.isInteger(mutex.fencing_token) || Number(mutex.fencing_token) < 1) {
              errors.push(`${path}.cas.mutex.fencing_token: required positive integer`);
            }
            const timestampFields = ["acquired_at", "mutation_observed_at", "expires_at", "released_at"];
            for (const field of timestampFields) {
              if (!(allowPlaceholders && findPlaceholders(mutex[field]).length > 0) && !isoTimestamp(mutex[field])) {
                errors.push(`${path}.cas.mutex.${field}: required ISO timestamp`);
              }
            }
            if (timestampFields.every((field) => isoTimestamp(mutex[field]))) {
              const acquired = Date.parse(String(mutex.acquired_at));
              const mutation = Date.parse(String(mutex.mutation_observed_at));
              const expires = Date.parse(String(mutex.expires_at));
              const released = Date.parse(String(mutex.released_at));
              if (!(acquired <= mutation && mutation <= expires)) {
                errors.push(`${path}.cas.mutex: CAS observation must occur inside the live lease`);
              }
              if (released < mutation) {
                errors.push(`${path}.cas.mutex.released_at: release cannot precede the CAS observation`);
              }
              if (Number.isInteger(maxLeaseSeconds) && (expires - acquired) / 1e3 > maxLeaseSeconds) {
                errors.push(`${path}.cas.mutex: lease exceeds coordination max_lease_seconds`);
              }
              const resource = String(mutex.resource);
              const fencingToken = Number(mutex.fencing_token);
              const effectiveEnd = Math.min(expires, released);
              const prior = priorLeaseByResource.get(resource);
              if (prior && acquired < prior.effectiveEnd) {
                errors.push(`${path}.cas.mutex: integration lease overlaps a prior lease for ${JSON.stringify(resource)}`);
              }
              if (prior && fencingToken <= prior.fencingToken) {
                errors.push(`${path}.cas.mutex.fencing_token: must increase monotonically for ${JSON.stringify(resource)}`);
              }
              if (nonempty(mutex.resource) && Number.isInteger(mutex.fencing_token)) {
                priorLeaseByResource.set(resource, { effectiveEnd, fencingToken });
              }
            }
          }
        }
        if (schemaVersion === "1.2") {
          validateCoordinationCas(action, lanes, coordinationDomains, path, errors, allowPlaceholders);
        }
      }
      if (action.kind === "git_push") {
        validatePushGate(action, lane, coordination, repo, parentOperations, path, errors, allowPlaceholders);
      }
    }
    if (manifest.mode === "GUARD" && schemaVersion === "1.2") {
      validateGuard(manifest, actions, lanes, errors, allowPlaceholders);
    }
  }
  if (!allowPlaceholders) for (const path of findPlaceholders(data)) errors.push(`${path}: unresolved template placeholder`);
  if (!Array.isArray(manifest.policy_sources)) errors.push("$.policy_sources: expected list");
  if (!Array.isArray(manifest.excluded_actions)) errors.push("$.excluded_actions: expected list");
  if (!allowPlaceholders) {
    if (!nonempty(manifest.request_ref)) errors.push("$.request_ref: required nonempty");
    const basis = object(manifest.authorization_basis);
    if (basis?.source === "skill_invocation" && !nonempty(basis.ref)) errors.push("$.authorization_basis.ref: required nonempty for skill_invocation");
  }
  const state = manifest.execution_state;
  if (state === "executed" && actions.length === 0) errors.push("$.execution_state: executed with zero actions is not an execution record");
  const destructive = /* @__PURE__ */ new Set(["stash_drop", "recoverable_delete", "branch_delete_local", "branch_delete_remote", "worktree_remove", "process_signal", "git_push"]);
  const local = /* @__PURE__ */ new Set(["local_edit", "local_move", "recoverable_delete", "doc_update", "planning_record_update", "historical_conform", "handoff_update"]);
  for (const [index, raw] of actions.entries()) {
    const action = object(raw);
    if (!action) continue;
    const path = `$.actions[${index}]`;
    if (action.status !== void 0 && !["planned", "executed", "failed", "blocked", "skipped"].includes(String(action.status))) errors.push(`${path}.status: unsupported ${JSON.stringify(action.status)}`);
    if ((state === "executed" || action.status === "executed") && !array(action.verification)?.some(meaningful)) errors.push(`${path}.verification: executed action requires meaningful evidence (not empty/null placeholders)`);
    if (!allowPlaceholders) {
      const target = action.target;
      if (local.has(String(action.kind)) && typeof target === "string") {
        const normalized = pathPosix.normalize(target.replaceAll("\\", "/"));
        if (pathPosix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized === ".git" || normalized.startsWith(".git/")) errors.push(`${path}.target: local mutation target must be repository-relative, non-traversing, and outside .git (got ${JSON.stringify(target)})`);
      }
      if (action.kind === "agent_dispatch" && !["in_session_subagent", "external_orchestrated_agent"].includes(String(action.mechanism))) errors.push(`${path}.mechanism: agent_dispatch requires in_session_subagent|external_orchestrated_agent (human/paid external dispatch is prohibited external_dispatch)`);
      const basis = object(manifest.authorization_basis);
      const authorization = object(action.authorization);
      if (authorization?.source === "skill_invocation" && authorization.ref !== basis?.ref) errors.push(`${path}.authorization.ref: must correlate with authorization_basis.ref for skill_invocation actions`);
    }
    if (destructive.has(String(action.kind))) {
      if (!array(action.preconditions)?.some(meaningful)) errors.push(`${path}.preconditions: ${action.kind} requires meaningful preflight facts`);
      if (!array(action.verification)?.some(meaningful)) errors.push(`${path}.verification: ${action.kind} requires recovery/postcondition proof`);
    }
  }
  return errors;
}

// src/closeout/repository.ts
import { createHash } from "crypto";
import { execFileSync, spawnSync } from "child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync
} from "fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
var PLANNING_DIRECTORY_NAMES = /* @__PURE__ */ new Set([
  "planning",
  "plans",
  "roadmap",
  "project-management",
  "work-items",
  "work_items",
  "tasks",
  "stories",
  "epics",
  "slices",
  "issues"
]);
var PLANNING_FILE_STEMS = /* @__PURE__ */ new Set([
  "backlog",
  "current",
  "milestones",
  "plan",
  "planning",
  "project-plan",
  "project_plan",
  "roadmap",
  "status",
  "tasks",
  "todo",
  "work-items",
  "work_items"
]);
var PLANNING_FILE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".yaml",
  ".yml"
]);
function isCanonicalPlanningFileName(path) {
  const name = basename(path);
  const extension = extname(name).toLocaleLowerCase("und");
  if (!PLANNING_FILE_EXTENSIONS.has(extension)) return false;
  const stem = name.slice(0, -extension.length).toLocaleLowerCase("und");
  return PLANNING_FILE_STEMS.has(stem);
}
var PLANNING_LANE_LIFECYCLES = /* @__PURE__ */ new Map([
  ["backlog", "preexecution"],
  ["todo", "preexecution"],
  ["to-do", "preexecution"],
  ["to_do", "preexecution"],
  ["ready", "preexecution"],
  ["planned", "preexecution"],
  ["active", "active"],
  ["doing", "active"],
  ["in-progress", "active"],
  ["in_progress", "active"],
  ["inprogress", "active"],
  ["failed", "active"],
  ["done", "done"],
  ["complete", "done"],
  ["completed", "done"],
  ["closed", "done"],
  ["history", "archived"],
  ["historical", "archived"],
  ["archive", "archived"],
  ["archived", "archived"],
  ["superseded", "archived"]
]);
var PLANNING_LANE_NAMES = new Set(PLANNING_LANE_LIFECYCLES.keys());
function planningLaneLifecycle(name) {
  return PLANNING_LANE_LIFECYCLES.get(name.toLocaleLowerCase("und"));
}
var PLANNING_IGNORED_NAMES = /* @__PURE__ */ new Set([
  "__fixtures__",
  ".git",
  "examples",
  "fixtures",
  "node_modules",
  "samples",
  "test-data",
  "testdata",
  "vendor",
  ".venv",
  "venv",
  "dist",
  "build",
  ".cache"
]);
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
function runGit(repository, args, allowedStatuses = [0]) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const status = result.status ?? 1;
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.error) throw result.error;
  if (!allowedStatuses.includes(status)) {
    throw new Error(stderr || `git ${args.join(" ")} exited ${status}`);
  }
  return { status, stdout, stderr };
}
function git(repository, ...args) {
  return runGit(repository, args).stdout;
}
function isGitAncestor(repository, ancestor, descendant) {
  return runGit(repository, ["merge-base", "--is-ancestor", ancestor, descendant], [0, 1]).status === 0;
}
function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}
function readJson(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected a JSON object`);
  }
  return value;
}
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
function packageRoot(fromUrl = import.meta.url) {
  const sourcePath = fileURLToPath(fromUrl);
  const here = dirname(existsSync(sourcePath) ? realpathSync(sourcePath) : sourcePath);
  const candidates = [resolve(here, "..", ".."), resolve(here, "..")];
  const found = candidates.find((candidate) => existsSync(join(candidate, "assets", "closure-bundle.json")));
  if (!found) throw new Error("Cannot locate Mister Clean package assets");
  return found;
}
function repositoryIdentity(repository) {
  const remote = runGit(repository, ["config", "--get", "remote.origin.url"], [0, 1]).stdout;
  if (remote && !remote.startsWith("/") && !remote.startsWith("file://")) {
    let value;
    if (remote.includes("://")) {
      value = new URL(remote).pathname.replace(/^\/+|\/+$/g, "");
    } else {
      value = remote.split(":", 2).at(-1) ?? remote;
    }
    value = value.replace(/\.git$/, "").replace(/\/+$/, "");
    if (value.includes("/")) return value;
  }
  return repository.split(sep).filter(Boolean).at(-1) ?? repository;
}
function childEntries(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}
function discoverPlanningRoots(repository) {
  const candidates = /* @__PURE__ */ new Set();
  function visit(directory) {
    const relativePath = relative(repository, directory);
    const name = directory.split(sep).at(-1)?.toLocaleLowerCase() ?? "";
    if (directory !== repository && PLANNING_DIRECTORY_NAMES.has(name)) {
      candidates.add(directory);
      return;
    }
    const entries = childEntries(directory).filter((entry) => !PLANNING_IGNORED_NAMES.has(entry.name));
    for (const entry of entries) {
      if ((entry.isFile() || entry.isSymbolicLink()) && isCanonicalPlanningFileName(entry.name)) {
        candidates.add(join(directory, entry.name));
      }
    }
    const names = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name);
    const laneCount = names.filter((child) => PLANNING_LANE_NAMES.has(child.toLocaleLowerCase())).length;
    if (laneCount >= 2 && relativePath !== "") {
      candidates.add(directory);
      return;
    }
    for (const child of names) visit(join(directory, child));
  }
  visit(repository);
  const ordered = [...candidates].sort((left, right) => {
    const depth = left.split(sep).length - right.split(sep).length;
    return depth || compareCodePoints(left, right);
  });
  const minimal = [];
  for (const candidate of ordered) {
    if (!minimal.some((root) => candidate === root || candidate.startsWith(`${root}${sep}`))) {
      minimal.push(candidate);
    }
  }
  return minimal.map((root) => relative(repository, root).split(sep).join("/")).sort();
}
function parseWorktrees(repository) {
  const output = git(repository, "worktree", "list", "--porcelain", "-z");
  if (!output) return [];
  const records = [];
  let current = {};
  for (const item of output.split("\0")) {
    if (!item) continue;
    if (item.startsWith("worktree ") && current.worktree) {
      records.push(current);
      current = {};
    }
    const separator = item.indexOf(" ");
    const rawKey = separator === -1 ? item : item.slice(0, separator);
    const key = rawKey === "HEAD" ? "head" : rawKey.toLocaleLowerCase();
    if (separator === -1) current[key] = "true";
    else current[key] = item.slice(separator + 1);
  }
  if (current.worktree) records.push(current);
  return records;
}
function listEntriesRecursively(root) {
  const entries = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path);
      else if (entry.isSymbolicLink()) entries.push({ kind: "symlink", path });
      else if (entry.isFile()) entries.push({ kind: "file", path });
      else entries.push({ kind: "other", path });
    }
  }
  visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}
function listFilesRecursively(root) {
  return listEntriesRecursively(root).filter((entry) => entry.kind === "file").map((entry) => entry.path);
}
function assertDirectory(path) {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`not a directory: ${path}`);
}

// src/closeout/planning.ts
var import_yaml = __toESM(require_dist(), 1);
import { createHash as createHash2 } from "crypto";
import { lstatSync as lstatSync2, readFileSync as readFileSync2 } from "fs";
import { basename as basename2, dirname as dirname2, extname as extname2, relative as relative2, resolve as resolve2, sep as sep2 } from "path";
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([".json", ".md", ".mdx", ".txt", ".yaml", ".yml"]);
var DONE = /* @__PURE__ */ new Set([
  "accept",
  "accepted",
  "approved",
  "closed",
  "complete",
  "completed",
  "dev complete",
  "done",
  "implemented",
  "merged",
  "pass",
  "passed",
  "shipped",
  "verified"
]);
var ACTIVE = /* @__PURE__ */ new Set([
  "active",
  "blocked",
  "claimed",
  "doing",
  "escalated",
  "executing",
  "failed",
  "in progress",
  "inprogress",
  "ready for acceptance",
  "ready for qa",
  "ready for review",
  "rejected",
  "revise",
  "underway"
]);
var PREEXECUTION = /* @__PURE__ */ new Set([
  "backlog",
  "draft",
  "not started",
  "notstarted",
  "pending",
  "planned",
  "ready",
  "to do",
  "todo",
  "unstarted"
]);
var ARCHIVED = /* @__PURE__ */ new Set(["archive", "archived", "historical", "history", "superseded"]);
var FAILED = /* @__PURE__ */ new Set(["deny", "denied", "fail", "failed", "reject", "rejected", "revise"]);
var PARTIAL = /* @__PURE__ */ new Set([
  "conditional",
  "conditional pass",
  "conditionally passed",
  "partial",
  "partially complete",
  "partially satisfied"
]);
var PASSED = /* @__PURE__ */ new Set([...DONE, "approve"]);
var UNRUN = /* @__PURE__ */ new Set([
  "backlog",
  "blocked",
  "not executed",
  "not run",
  "notexecuted",
  "notrun",
  "pending",
  "planned",
  "to do",
  "todo",
  "unexecuted",
  "unrun"
]);
var NOT_APPLICABLE = /* @__PURE__ */ new Set(["n/a", "na", "not applicable", "not required", "waived"]);
var NON_ARTIFACT_CLASSES = /* @__PURE__ */ new Set(["guidance", "non artifact", "reference", "schema", "template"]);
var ACCEPTANCE_KINDS = ["acceptance", "holdout", "qa", "review"];
var ACCEPTANCE_WORDS = new Set(ACCEPTANCE_KINDS);
var LEAF_ARTIFACT_TYPES = /* @__PURE__ */ new Set(["slice", "task"]);
var ROLLUP_ARTIFACT_TYPES = /* @__PURE__ */ new Set(["index", "rollup", "status_index"]);
var HIERARCHY_ARTIFACT_TYPES = /* @__PURE__ */ new Set(["epic", "feature", "slice", "story", "task", "work_item"]);
var PLANNING_ARTIFACT_TYPES = /* @__PURE__ */ new Set([
  ...HIERARCHY_ARTIFACT_TYPES,
  ...ROLLUP_ARTIFACT_TYPES,
  "acceptance",
  "dispatch",
  "finding",
  "holdout",
  "maintenance",
  "qa",
  "review"
]);
var CHILD_PARENTAGE_ROLE_ALIASES = /* @__PURE__ */ new Set(["child_parentage", "hierarchy", "parent", "parentage"]);
var ROLLUP_PROJECTION_ROLE_ALIASES = /* @__PURE__ */ new Set(["index", "projection", "rollup", "rollup_projection", "status_index"]);
var CANONICAL_PARENT_FIELDS = {
  feature: ["epic", "epic_id"],
  slice: ["story", "story_id", "feature", "feature_id", "epic", "epic_id"],
  story: ["feature", "feature_id", "epic", "epic_id"],
  task: ["slice", "slice_id", "story", "story_id", "feature", "feature_id", "epic", "epic_id"],
  work_item: ["story", "story_id", "feature", "feature_id", "epic", "epic_id"]
};
var ACCEPTANCE_VALUE_FIELDS = [
  "current_lifecycle",
  "current_phase",
  "current_stage",
  "current_state",
  "current_status",
  "implementation_status",
  "lifecycle",
  "outcome",
  "phase",
  "result",
  "stage",
  "state",
  "status",
  "verdict"
];
var ACCEPTANCE_OUTCOME_WORDS = /* @__PURE__ */ new Set([
  "lifecycle",
  "outcome",
  "phase",
  "result",
  "stage",
  "state",
  "status",
  "verdict"
]);
var EXPLICIT_ACCEPTANCE_FIELDS = [
  ...ACCEPTANCE_KINDS.flatMap((kind) => ACCEPTANCE_VALUE_FIELDS.map((field) => `${kind}_${field}`)),
  "outcome",
  "result",
  "verdict"
];
var DECISIVE_ACCEPTANCE_FIELDS = [
  ...ACCEPTANCE_KINDS.flatMap((kind) => ["outcome", "result", "verdict"].map((field) => `${kind}_${field}`)),
  "outcome",
  "result",
  "verdict"
];
var HISTORICAL_HEADINGS = /\b(archive|archived|changelog|historical|history|prior|previous|superseded)\b/i;
var PARENTAGE_TARGET_HEADERS = /* @__PURE__ */ new Set([
  "artifact",
  "artifact id",
  "artifacts",
  "child",
  "child id",
  "children",
  "epic",
  "epic id",
  "epics",
  "feature",
  "feature id",
  "features",
  "id",
  "ids",
  "item",
  "item id",
  "items",
  "planning artifact",
  "planning artifact id",
  "planning artifacts",
  "slice",
  "slice id",
  "slices",
  "stories",
  "story",
  "story id",
  "task",
  "task id",
  "tasks",
  "work item",
  "work item id",
  "work items"
]);
var ROLLUP_TARGET_HEADERS = /* @__PURE__ */ new Set([
  "artifact",
  "artifact id",
  "artifacts",
  "child",
  "child id",
  "children",
  "epic",
  "epic id",
  "epics",
  "feature",
  "feature id",
  "features",
  "id",
  "ids",
  "item",
  "item id",
  "items",
  "planning artifact",
  "planning artifact id",
  "planning artifacts",
  "slice",
  "slice id",
  "slices",
  "stories",
  "story",
  "story id",
  "task",
  "task id",
  "tasks",
  "work item",
  "work item id",
  "work items"
]);
var STRUCTURED_CHILD_KEYS = /* @__PURE__ */ new Set([
  "artifact",
  "artifact_ids",
  "artifacts",
  "artifacts_ids",
  "child",
  "child_ids",
  "children",
  "children_ids",
  "epic",
  "epic_ids",
  "epics",
  "epics_ids",
  "feature",
  "feature_ids",
  "features",
  "features_ids",
  "ids",
  "item",
  "item_ids",
  "items",
  "items_ids",
  "planning_artifact",
  "planning_artifact_ids",
  "planning_artifacts",
  "planning_artifacts_ids",
  "slice",
  "slice_ids",
  "slices",
  "slices_ids",
  "stories",
  "stories_ids",
  "story",
  "story_ids",
  "task",
  "task_ids",
  "tasks",
  "tasks_ids",
  "work_item",
  "work_item_ids",
  "work_items",
  "work_items_ids"
]);
var STRUCTURED_ID_KEYS = [
  "id",
  "artifact_id",
  "child_id",
  "epic_id",
  "feature_id",
  "item_id",
  "planning_artifact_id",
  "slice_id",
  "story_id",
  "task_id",
  "work_item_id"
];
var STRUCTURED_STATE_KEYS = [
  "current_lifecycle",
  "current_phase",
  "current_stage",
  "current_state",
  "current_status",
  "implementation_status",
  "lifecycle",
  "phase",
  "stage",
  "state",
  "status"
];
var STATE_HEADERS = new Set(STRUCTURED_STATE_KEYS.map(normalize));
var STATE_HEADER_WORDS = /* @__PURE__ */ new Set(["lifecycle", "phase", "stage", "state", "status"]);
var ACCEPTANCE_ID_FIELDS = ["acceptance_id", "holdout_id", "qa_id", "review_id"];
var FINDING_CODES = [
  "acceptance_cascade_unexecuted",
  "acceptance_failure_unpaid",
  "acceptance_gate_identity_conflict",
  "acceptance_gate_undiscovered",
  "acceptance_gate_unknown",
  "acceptance_partial_malformed",
  "acceptance_partial_unpaid",
  "archive_classification_conflict",
  "body_projection_conflict",
  "completed_parent_unexecuted_acceptance",
  "duplicate_artifact_id",
  "finding_state_unknown",
  "unfinished_completion_marker",
  "lane_status_conflict",
  "lifecycle_state_unknown",
  "maintenance_lifecycle_stale",
  "orphan_parent_reference",
  "parent_child_projection_conflict",
  "parent_completion_stale",
  "planning_input_unparsed",
  "planning_relationship_conflict",
  "planning_relationship_unresolved",
  "preexecution_parent_has_started_children",
  "remediation_finding_open",
  "remediation_finding_partial"
];
function object2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function normalize(value) {
  return foldCase(value.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z\d])([A-Z])/g, "$1 $2")).replace(/[`*"']/g, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}
function isNonArtifactPlanningClass(value) {
  return NON_ARTIFACT_CLASSES.has(normalize(value));
}
function normalizedId(value) {
  return foldCase(value).trim();
}
function keyToken(value) {
  return normalize(value).replace(/ /g, "_");
}
function scalar(value) {
  if (typeof value === "string") return value.trim() || void 0;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return void 0;
}
function unique(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizedId(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
function topEntries(metadata, keys) {
  const priorities = /* @__PURE__ */ new Map();
  for (const [index, key] of keys.entries()) {
    const token = keyToken(key);
    if (!priorities.has(token)) priorities.set(token, index);
  }
  return Object.entries(metadata).filter(([key]) => priorities.has(keyToken(key))).sort(([left], [right]) => (priorities.get(keyToken(left)) ?? Number.MAX_SAFE_INTEGER) - (priorities.get(keyToken(right)) ?? Number.MAX_SAFE_INTEGER) || keyToken(left).localeCompare(keyToken(right)) || left.localeCompare(right));
}
function lifecycle(value) {
  if (!value) return "unknown";
  const token = normalize(value);
  if (DONE.has(token)) return "done";
  if (ACTIVE.has(token)) return "active";
  if (PREEXECUTION.has(token)) return "preexecution";
  if (ARCHIVED.has(token)) return "archived";
  return "unknown";
}
function acceptance(value) {
  if (!value) return "unknown";
  const token = normalize(value);
  if (FAILED.has(token)) return "failed";
  if (PARTIAL.has(token)) return "partial";
  if (UNRUN.has(token)) return "unrun";
  if (NOT_APPLICABLE.has(token)) return "not_applicable";
  if (PASSED.has(token)) return "passed";
  return "unknown";
}
function acceptanceForArtifact(value, artifactType2, kind = artifactType2) {
  const exact = acceptance(value);
  if (exact !== "unknown") return exact;
  if (artifactType2 !== "review" && kind !== "review") return "unknown";
  const token = normalize(value ?? "");
  if (/^conditional accept\b/.test(token)) return "passed";
  if (/^(?:accept|accepted|approve|approved|pass|passed)\b/.test(token)) return "passed";
  if (/^(?:reject|rejected|fail|failed)\b/.test(token)) return "failed";
  return "unknown";
}
function findingState(value) {
  const token = normalize(value ?? "");
  if (/^partial(?:ly)?(?: resolved| complete)?\b/.test(token)) return "partial";
  if (/^open\b/.test(token)) return "open";
  if (/^fixed\b/.test(token)) return "fixed";
  if (/^resolved\b/.test(token)) return "resolved";
  return "unknown";
}
function findingStateProjection(metadata) {
  const aliases = scalarAliasValues(metadata, ["finding_status", "status"], "finding state");
  const states = aliases.values.map(findingState);
  const recognized = [...new Set(states.filter((state2) => state2 !== "unknown"))];
  const errors = [
    aliases.error,
    ...aliases.values.length === 0 ? ["finding state is missing"] : [],
    ...states.includes("unknown") ? [`finding state must begin with OPEN, FIXED, RESOLVED, or PARTIAL; received ${aliases.values.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...recognized.length > 1 ? [`finding state projections conflict: ${aliases.values.map((value) => JSON.stringify(value)).join(", ")}`] : []
  ].filter((error) => Boolean(error));
  const state = errors.length === 0 ? recognized[0] ?? "unknown" : "unknown";
  const lifecycleState = (/* @__PURE__ */ new Set(["fixed", "resolved"])).has(state) ? "done" : (/* @__PURE__ */ new Set(["open", "partial"])).has(state) ? "active" : "unknown";
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    lifecycle: lifecycleState,
    projection: {
      state: lifecycleState,
      states: lifecycleState === "unknown" ? ["unknown"] : [lifecycleState],
      values: aliases.values
    },
    state
  };
}
function operateTimeLegs(metadata) {
  const entries = topEntries(metadata, ["operate_time_legs"]);
  if (entries.length === 0) return { count: 0, errors: [] };
  const errors = [];
  const legs = entries.flatMap(([key, raw]) => {
    if (!Array.isArray(raw)) {
      errors.push(`${key} must be a nonempty array of typed pending legs`);
      return [];
    }
    return raw.map((value, index) => ({ ref: `${key}[${index}]`, value }));
  });
  if (legs.length === 0) errors.push("operate_time_legs must contain at least one pending leg");
  for (const leg of legs) {
    const item = object2(leg.value);
    if (!item) {
      errors.push(`${leg.ref} must be an object`);
      continue;
    }
    const state = scalarAliasValues(item, ["status", "state"], `${leg.ref} state`);
    const action = scalarAliasValues(item, ["required_next_action", "next_action", "action"], `${leg.ref} next action`);
    const owner = scalarAliasValues(item, ["owner", "owner_role"], `${leg.ref} owner`);
    const evidence = scalarAliasValues(item, ["evidence_required", "evidence"], `${leg.ref} evidence`);
    for (const scan of [state, action, owner, evidence]) if (scan.error) errors.push(scan.error);
    if (state.values.length !== 1 || acceptance(state.values[0]) !== "unrun") {
      errors.push(`${leg.ref} must declare exactly one pending or unrun state`);
    }
    if (action.values.length !== 1) errors.push(`${leg.ref} must declare exactly one required next action`);
    if (owner.values.length !== 1) errors.push(`${leg.ref} must declare exactly one owner`);
    if (evidence.values.length !== 1) errors.push(`${leg.ref} must declare exactly one evidence requirement`);
  }
  return { count: legs.length, errors };
}
function maintenanceEvidence(metadata, content) {
  const declared = scalarAliasValues(
    metadata,
    ["completion_commit", "implementation_commit", "resolved_commit"],
    "maintenance completion commit"
  ).values[0];
  const bodyMatch = /\bRESOLUTION\s*:\s*(?:landed|implemented|completed|fixed)(?:\s+at)?\s+([0-9a-f]{7,40})\b/i.exec(content);
  const candidate = declared ?? bodyMatch?.[1];
  const commit = candidate && /^[0-9a-f]{7,40}$/i.test(candidate) ? candidate : void 0;
  const terminalMetadata = scalarAliasValues(
    metadata,
    ["deliverable_status", "implementation_status", "verification_status"],
    "maintenance terminal evidence"
  ).values.some((value) => lifecycle(value) === "done" || acceptance(value) === "passed");
  return { ...commit ? { commit } : {}, terminal: Boolean(commit && (bodyMatch || terminalMetadata)) };
}
function stateProjection(values) {
  const orderedValues = unique(values).sort((left, right) => normalize(left).localeCompare(normalize(right)) || left.localeCompare(right));
  const states = [...new Set(orderedValues.map(lifecycle))].sort();
  return {
    state: states.length === 1 ? states[0] ?? "unknown" : "unknown",
    states,
    values: orderedValues
  };
}
function frontmatterRange(content) {
  const lines2 = content.split(/\r?\n/);
  let start = 0;
  while (start < lines2.length) {
    while (lines2[start]?.trim() === "") start += 1;
    if (lines2[start]?.trim().startsWith("<!--")) {
      while (start < lines2.length && !lines2[start]?.includes("-->")) start += 1;
      if (start < lines2.length) start += 1;
      continue;
    }
    break;
  }
  if (lines2[start]?.trim() !== "---") return void 0;
  for (let end = start + 1; end < lines2.length; end += 1) {
    if (lines2[end]?.trim() === "---") return { end, lines: lines2, start };
  }
  return void 0;
}
function parseStructured(content, kind) {
  try {
    if (kind === "json") (0, import_yaml.parse)(content);
    const value = kind === "json" ? JSON.parse(content) : (0, import_yaml.parse)(content);
    const metadata = object2(value);
    if (!metadata) return { metadata: {}, parseError: `${kind} root is not an object`, structured: false };
    return { metadata, structured: true };
  } catch (error) {
    const parseError = error instanceof Error ? error.message.split("\n", 1)[0] : void 0;
    return {
      metadata: {},
      parseError: parseError ?? `${kind} parse failed`,
      structured: false
    };
  }
}
function parseSource(source) {
  const extension = extname2(source.path).toLocaleLowerCase("und");
  if (extension === ".json") return parseStructured(source.content, "json");
  if (extension === ".yaml" || extension === ".yml") return parseStructured(source.content, "yaml");
  const range = frontmatterRange(source.content);
  if (!range) return { metadata: {}, structured: false };
  const raw = range.lines.slice(range.start + 1, range.end).join("\n");
  return parseStructured(raw, "yaml");
}
function topValues(metadata, keys) {
  const values = [];
  for (const [, value] of topEntries(metadata, keys)) {
    const item = scalar(value);
    if (item) values.push(item);
  }
  return unique(values);
}
function scalarAliasValues(metadata, keys, label) {
  const entries = topEntries(metadata, keys);
  const values = [];
  const invalid = [];
  for (const [key, raw] of entries) {
    const value = scalar(raw);
    if (value) values.push(value);
    else invalid.push(key);
  }
  return {
    ...invalid.length > 0 ? { error: `${label} aliases must each contain one nonempty scalar; invalid: ${invalid.map((key) => JSON.stringify(key)).join(", ")}` } : {},
    present: entries.length > 0,
    values: unique(values)
  };
}
function scalarListAliasValues(metadata, keys, label) {
  const entries = topEntries(metadata, keys);
  const values = [];
  const invalid = [];
  const add = (raw, ref) => {
    const value = scalar(raw);
    if (value) {
      values.push(value);
      return;
    }
    if (Array.isArray(raw) && raw.length > 0) {
      raw.forEach((entry, index) => add(entry, `${ref}[${index}]`));
      return;
    }
    invalid.push(ref);
  };
  for (const [key, raw] of entries) add(raw, key);
  return {
    ...invalid.length > 0 ? { error: `${label} entries must each contain one nonempty scalar; invalid: ${invalid.map((key) => JSON.stringify(key)).join(", ")}` } : {},
    present: entries.length > 0,
    values: unique(values)
  };
}
function lifecycleAliasProjection(metadata, label, allowAcceptance = false) {
  const aliases = scalarAliasValues(metadata, STRUCTURED_STATE_KEYS, label);
  const projection = stateProjection(aliases.values);
  const unsupported = aliases.values.filter((value) => lifecycle(value) === "unknown" && !(allowAcceptance && acceptance(value) !== "unknown"));
  const lifecycleStates = [...new Set(aliases.values.map(lifecycle).filter((state) => state !== "unknown"))];
  const errors = [
    aliases.error,
    ...unsupported.length > 0 ? [`${label} contains unsupported lifecycle values: ${unsupported.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...lifecycleStates.length > 1 ? [`${label} contains conflicting lifecycle values: ${aliases.values.map((value) => JSON.stringify(value)).join(", ")}`] : []
  ].filter((error) => Boolean(error));
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    projection
  };
}
function topLevelProjection(metadata) {
  const projection = scalarAliasValues(metadata, ["top_level"], "top_level");
  const normalized = projection.values.map(normalize);
  const supported = /* @__PURE__ */ new Set(["0", "1", "false", "no", "true", "yes"]);
  const errors = [
    projection.error,
    ...normalized.length > 1 ? [`top_level aliases conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...normalized.some((value) => !supported.has(value)) ? [`top_level must be one of true, false, yes, no, 1, or 0; received ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`] : []
  ].filter((error) => Boolean(error));
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    value: normalized.length === 1 && (/* @__PURE__ */ new Set(["1", "true", "yes"])).has(normalized[0] ?? "")
  };
}
function unsupportedStateAliasError(metadata, label, type) {
  const supported = /* @__PURE__ */ new Set([
    ...STRUCTURED_STATE_KEYS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken),
    "primary_state_column",
    ...type === "finding" ? ["finding_status"] : [],
    ...type === "story" ? ["story_review_status"] : []
  ]);
  const unsupported = Object.keys(metadata).filter((key) => {
    const token = keyToken(key);
    const words = normalize(key).split(" ");
    return words.some((word) => STATE_HEADER_WORDS.has(word)) && !supported.has(token);
  });
  return unsupported.length > 0 ? `${label} contains unsupported state-like aliases: ${unsupported.map((key) => JSON.stringify(key)).join(", ")}` : void 0;
}
function deepEntries(value, path = []) {
  const item = object2(value);
  if (item) {
    return Object.entries(item).flatMap(([key, child]) => deepEntries(child, [...path, keyToken(key)]));
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => deepEntries(child, [...path, String(index)]));
  }
  return [{ path, value }];
}
function hasRawPlanningSignal(metadata, type) {
  const keys = new Set(Object.keys(metadata).map(keyToken));
  const recognized = /* @__PURE__ */ new Set([
    ...STRUCTURED_CHILD_KEYS,
    ...STRUCTURED_ID_KEYS,
    ...STRUCTURED_STATE_KEYS,
    "child_relationship_role",
    "child_relationship_role_rationale",
    "child_target_column",
    "child_target_column_rationale",
    "non_relationship_table_columns",
    "non_relationship_table_rationale",
    "non_relationship_table_target_columns",
    "parent",
    "parent_id",
    "primary_state_column",
    "parent_ids",
    "parents",
    "parents_ids",
    "relationship_role",
    "relationship_role_rationale",
    "relationship_target_column",
    "relationship_target_column_rationale",
    "rollup_target_column",
    "rollup_target_column_rationale",
    "top_level",
    `${type}_id`
  ]);
  return [...keys].some((key) => recognized.has(key));
}
function pathLane(path) {
  for (const part of path.split("/")) {
    const state = planningLaneLifecycle(part);
    if (state) return state;
  }
  return "unknown";
}
function acceptanceDeclarationKinds(value) {
  const kinds = [];
  const visit = (current) => {
    const item = object2(current);
    if (!item) {
      if (Array.isArray(current)) current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      const token = keyToken(key);
      const identityKind = ACCEPTANCE_ID_FIELDS.find((field) => token === field)?.replace(/_id$/, "");
      if (identityKind) kinds.push(identityKind);
      if ((/* @__PURE__ */ new Set(["artifact_type", "kind", "type"])).has(token)) {
        const declaredType = keyToken(scalar(child) ?? "");
        if (ACCEPTANCE_WORDS.has(declaredType)) kinds.push(declaredType);
      }
      for (const kind of ACCEPTANCE_KINDS) {
        if (token === kind || token === `${kind}s` || ACCEPTANCE_VALUE_FIELDS.some((field) => token === `${kind}_${field}`)) {
          kinds.push(kind);
        }
      }
      visit(child);
    }
  };
  visit(value);
  return unique(kinds);
}
function hasNestedCanonicalPlanningSignal(metadata) {
  const semanticKeys = new Set([
    ...ACCEPTANCE_ID_FIELDS,
    ...EXPLICIT_ACCEPTANCE_FIELDS,
    ...STRUCTURED_STATE_KEYS,
    "artifact_id",
    "child_id",
    "epic_id",
    "feature_id",
    "parent",
    "parent_id",
    "parent_ids",
    "parents",
    "parents_ids",
    "planning_artifact_id",
    "review_of",
    "reviewed_id",
    "slice_id",
    "story_id",
    "subject_id",
    "target_id",
    "task_id",
    "top_level",
    "work_item_id"
  ].map(keyToken));
  return deepEntries(metadata).some((entry) => {
    if (entry.path.length < 2) return false;
    if (entry.path.some((part, index) => index > 0 && (semanticKeys.has(part) || ACCEPTANCE_WORDS.has(part) || ACCEPTANCE_WORDS.has(part.replace(/s$/, ""))))) return true;
    const last = entry.path.at(-1) ?? "";
    return (/* @__PURE__ */ new Set(["artifact_type", "kind", "type"])).has(last) && PLANNING_ARTIFACT_TYPES.has(keyToken(scalar(entry.value) ?? ""));
  });
}
function inferredArtifactType(path, metadata, declaredType) {
  const acceptanceKinds = ACCEPTANCE_ID_FIELDS.filter((key) => topEntries(metadata, [key]).length > 0).map((key) => key.replace(/_id$/, ""));
  const outcomeKinds = ACCEPTANCE_KINDS.filter((kind) => topEntries(
    metadata,
    ACCEPTANCE_VALUE_FIELDS.map((field) => `${kind}_${field}`)
  ).length > 0);
  const declarationKinds = acceptanceDeclarationKinds(metadata);
  const hasGenericOutcome = topEntries(metadata, ["outcome", "result", "verdict"]).length > 0;
  const reviewRelation = topEntries(metadata, ["review_of", "reviewed_id"]).length > 0;
  const genericRelation = topEntries(metadata, ["subject_id", "target_id"]).length > 0;
  const genericIds = scalarAliasValues(metadata, ["id"], "generic identity").values;
  const hierarchyRelationKeys = [
    "epic",
    "epic_id",
    "feature",
    "feature_id",
    "parent",
    "parent_id",
    "parent_ids",
    "slice",
    "slice_id",
    "story",
    "story_id",
    "task",
    "task_id",
    "work_item",
    "work_item_id"
  ];
  const hierarchyRelation = genericIds.length > 0 && topEntries(metadata, hierarchyRelationKeys).some(([, raw]) => {
    const value = scalar(raw);
    return !value || !genericIds.some((id) => normalizedId(id) === normalizedId(value));
  });
  const relationType = reviewRelation ? "review" : genericRelation || hierarchyRelation ? "acceptance" : void 0;
  const errors = [];
  const hierarchyAliases = [...HIERARCHY_ARTIFACT_TYPES].map((kind) => ({ kind, projection: scalarAliasValues(metadata, [`${kind}_id`], `${kind} identity`) })).filter((entry) => entry.projection.present);
  if (acceptanceKinds.length > 1) {
    errors.push(`acceptance identity aliases imply multiple artifact types: ${acceptanceKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (relationType && outcomeKinds.length > 1) {
    errors.push(`acceptance outcome aliases imply multiple artifact types: ${outcomeKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (relationType && declarationKinds.length > 1) {
    errors.push(`acceptance declarations imply multiple artifact types: ${declarationKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (reviewRelation && outcomeKinds.length === 1 && outcomeKinds[0] !== "review") {
    errors.push(`review parentage conflicts with ${JSON.stringify(outcomeKinds[0])} outcome aliases`);
  }
  const strongAcceptanceType = acceptanceKinds.length === 1 ? acceptanceKinds[0] : reviewRelation ? "review" : relationType && declarationKinds.length === 1 ? declarationKinds[0] : relationType && (hasGenericOutcome || declarationKinds.length > 0) ? relationType : void 0;
  let inferredHierarchyType;
  if (!strongAcceptanceType && hierarchyAliases.length > 0 && (!declaredType || !PLANNING_ARTIFACT_TYPES.has(declaredType))) {
    for (const entry of hierarchyAliases) if (entry.projection.error) errors.push(entry.projection.error);
    if (declaredType) {
      errors.push(`custom artifact type ${JSON.stringify(declaredType)} cannot silently reinterpret canonical hierarchy aliases: ${hierarchyAliases.map((entry) => JSON.stringify(`${entry.kind}_id`)).join(", ")}`);
    } else if (hierarchyAliases.length !== 1) {
      errors.push(`type-unresolved artifact declares multiple canonical hierarchy aliases: ${hierarchyAliases.map((entry) => JSON.stringify(`${entry.kind}_id`)).join(", ")}`);
    } else {
      const entry = hierarchyAliases[0];
      const values = entry?.projection.values ?? [];
      if (values.length !== 1) {
        errors.push(`type-unresolved artifact cannot resolve ${JSON.stringify(`${entry?.kind ?? "artifact"}_id`)} to one identity`);
      } else if (genericIds.length > 0 && !genericIds.some((id) => normalizedId(id) === normalizedId(values[0] ?? ""))) {
        errors.push(`type-unresolved artifact has ambiguous generic identity ${JSON.stringify(genericIds[0])} and canonical ${JSON.stringify(`${entry?.kind ?? "artifact"}_id`)} ${JSON.stringify(values[0])}`);
      } else {
        inferredHierarchyType = entry?.kind;
      }
    }
  }
  const pathParts = path.split("/").slice(0, -1).map(normalize);
  let pathType = "planning";
  if (pathParts.some((part) => (/* @__PURE__ */ new Set(["acceptance", "acceptances"])).has(part))) pathType = "acceptance";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["holdout", "holdouts"])).has(part))) pathType = "holdout";
  else if (pathParts.includes("qa")) pathType = "qa";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["review", "reviews", "story review", "story reviews"])).has(part))) pathType = "review";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["stories", "story"])).has(part))) pathType = "story";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["slices", "slice", "tasks", "task"])).has(part))) pathType = "slice";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["epics", "epic"])).has(part))) pathType = "epic";
  if (strongAcceptanceType) return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    strongAcceptanceType,
    type: strongAcceptanceType
  };
  if (inferredHierarchyType) return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    type: inferredHierarchyType
  };
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    type: pathType
  };
}
function artifactType(path, metadata) {
  const projection = scalarAliasValues(metadata, ["artifact_type", "kind", "type"], "artifact type");
  const types = unique(projection.values.map(keyToken).map((value) => value === "story_review" ? "review" : value));
  const inferred = inferredArtifactType(path, metadata, types.length === 1 ? types[0] : void 0);
  if (types.length === 0) {
    const errors2 = [projection.error, inferred.error].filter((error) => Boolean(error));
    return { ...errors2.length > 0 ? { error: errors2.join("; ") } : {}, type: inferred.type };
  }
  const acceptanceKinds = ACCEPTANCE_ID_FIELDS.filter((key) => topEntries(metadata, [key]).length > 0).map((key) => key.replace(/_id$/, ""));
  const errors = [
    projection.error,
    inferred.error,
    ...types.length > 1 ? [`artifact type projections conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...acceptanceKinds.some((kind) => kind !== types[0]) ? [`artifact type ${JSON.stringify(types[0])} conflicts with acceptance identity aliases for ${acceptanceKinds.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...inferred.strongAcceptanceType && inferred.strongAcceptanceType !== types[0] && !(inferred.strongAcceptanceType === "acceptance" && ACCEPTANCE_WORDS.has(types[0] ?? "")) ? [`artifact type ${JSON.stringify(types[0])} conflicts with acceptance-shaped metadata for ${JSON.stringify(inferred.strongAcceptanceType)}`] : []
  ].filter((error) => Boolean(error));
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    type: types[0] ?? inferred.type
  };
}
function artifactIdentity(path, type, metadata) {
  const projection = scalarAliasValues(
    metadata,
    type === "maintenance" ? ["maintenance_id", "maint_id", "id"] : [`${type}_id`, "id"],
    "artifact identity"
  );
  const ids = unique(projection.values);
  const errors = [
    projection.error,
    ...ids.length > 1 ? [`artifact identity projections conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`] : []
  ].filter((error) => Boolean(error));
  return ids.length > 0 ? {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    explicit: true,
    id: ids[0] ?? basename2(path, extname2(path))
  } : {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    explicit: false,
    id: basename2(path, extname2(path))
  };
}
function acceptanceArtifact(path, type) {
  if (/(^|_)(acceptance|holdout|qa|review)($|_)/.test(type)) return true;
  return path.split("/").slice(0, -1).map(normalize).some((part) => (/* @__PURE__ */ new Set([
    "acceptance",
    "acceptances",
    "holdout",
    "holdouts",
    "qa",
    "review",
    "reviews",
    "story review",
    "story reviews"
  ])).has(part));
}
function parentReferenceKeys(type, isAcceptance) {
  const keys = ["parent", "parent_id", "parent_ids", "parents", "parents_ids"];
  if (isAcceptance) {
    keys.push(...[
      ["review_of", "reviewed_id", "subject_id", "target_id"],
      ["story", "story_id"],
      ["feature", "feature_id", "slice", "slice_id", "task", "task_id", "work_item", "work_item_id"],
      ["epic", "epic_id"]
    ].flat());
  } else {
    keys.push(...CANONICAL_PARENT_FIELDS[type] ?? []);
  }
  return unique(keys);
}
function parentReferences(metadata, type, isAcceptance, path) {
  const keys = parentReferenceKeys(type, isAcceptance);
  const ids = [];
  const references = [];
  const errors = [];
  const referenceObjectKeys = [
    ...STRUCTURED_ID_KEYS,
    "epic",
    "feature",
    "item",
    "parent",
    "parent_id",
    "parent_ids",
    "parents",
    "parents_ids",
    "slice",
    "story",
    "task",
    "work_item"
  ];
  const parseEntry = (value, ref) => {
    const direct = scalar(value);
    if (direct) {
      ids.push(direct);
      references.push({ id: direct, ref, state: "unknown" });
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        errors.push({
          code: "planning_relationship_unresolved",
          detail: "parent reference declares an empty target collection",
          related: [ref]
        });
      }
      for (const [index, entry] of value.entries()) parseEntry(entry, `${ref}[${index}]`);
      return;
    }
    const item = object2(value);
    const unsupportedState = item ? unsupportedStateAliasError(item, "parent reference", "relationship") : void 0;
    if (unsupportedState) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: unsupportedState,
        related: [ref]
      });
    }
    const identityScan = item ? scalarAliasValues(item, referenceObjectKeys, "parent reference identity") : { present: false, values: [] };
    const candidates = identityScan.values;
    if (identityScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: identityScan.error,
        related: [ref]
      });
    }
    if (candidates.length === 1) {
      const id = candidates[0] ?? "";
      const stateScan = lifecycleAliasProjection(item ?? {}, "parent reference lifecycle");
      if (stateScan.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: stateScan.error,
          related: [ref]
        });
      }
      ids.push(id);
      references.push({ id, ref, state: stateScan.projection.state });
      return;
    }
    errors.push({
      code: candidates.length > 1 ? "planning_relationship_conflict" : "planning_relationship_unresolved",
      detail: candidates.length > 1 ? `parent reference resolves to ${candidates.length} identities` : "parent reference has no scalar or recognized identity",
      related: [ref]
    });
  };
  for (const [key, value] of topEntries(metadata, keys)) parseEntry(value, `${path}#${keyToken(key)}`);
  return { errors, ids: unique(ids), references };
}
function childRelationshipRole(metadata, type) {
  const defaultRole = ROLLUP_ARTIFACT_TYPES.has(type) ? "rollup_projection" : "child_parentage";
  const projection = scalarAliasValues(
    metadata,
    ["relationship_role", "child_relationship_role"],
    "relationship role"
  );
  const rationale = scalarAliasValues(metadata, [
    "relationship_role_rationale",
    "child_relationship_role_rationale"
  ], "relationship role rationale");
  const errors = [projection.error, rationale.error].filter((error) => Boolean(error));
  const values = projection.values;
  if (values.length === 0) {
    return { ...errors.length > 0 ? { error: errors.join("; ") } : {}, role: defaultRole };
  }
  const roles = /* @__PURE__ */ new Set();
  const unsupported = [];
  for (const value of values) {
    const token = keyToken(value);
    if (CHILD_PARENTAGE_ROLE_ALIASES.has(token)) {
      roles.add("child_parentage");
    } else if (ROLLUP_PROJECTION_ROLE_ALIASES.has(token)) {
      roles.add("rollup_projection");
    } else {
      unsupported.push(value);
    }
  }
  if (unsupported.length > 0 || roles.size !== 1) {
    errors.push(`relationship_role must resolve to exactly one of child_parentage or rollup_projection; received ${values.map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), role: defaultRole };
  }
  const role = [...roles][0] ?? defaultRole;
  if (role !== defaultRole && (HIERARCHY_ARTIFACT_TYPES.has(type) || ROLLUP_ARTIFACT_TYPES.has(type))) {
    errors.push(`${JSON.stringify(type)} has immutable relationship role ${JSON.stringify(defaultRole)}`);
    return { error: errors.join("; "), role: defaultRole };
  }
  if (role !== defaultRole && rationale.values.length === 0) {
    errors.push(`relationship_role overrides the ${JSON.stringify(defaultRole)} default without relationship_role_rationale`);
    return { error: errors.join("; "), role: defaultRole };
  }
  return { ...errors.length > 0 ? { error: errors.join("; ") } : {}, role };
}
function relationshipTargetHeaders(metadata, role) {
  const defaults = role === "rollup_projection" ? ROLLUP_TARGET_HEADERS : PARENTAGE_TARGET_HEADERS;
  const keys = role === "rollup_projection" ? ["relationship_target_column", "rollup_target_column"] : ["child_target_column", "relationship_target_column"];
  const projection = scalarAliasValues(metadata, keys, "relationship target column");
  const values = projection.values;
  const rationaleKeys = role === "rollup_projection" ? ["relationship_target_column_rationale", "rollup_target_column_rationale"] : ["child_target_column_rationale", "relationship_target_column_rationale"];
  const rationale = scalarAliasValues(metadata, rationaleKeys, "relationship target-column rationale");
  const errors = [projection.error, rationale.error].filter((error) => Boolean(error));
  if (values.length === 0) {
    return { ...errors.length > 0 ? { error: errors.join("; ") } : {}, headers: defaults };
  }
  if (values.length > 1) {
    errors.push(`relationship target column must resolve to exactly one header; received ${values.map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), headers: defaults };
  }
  if (rationale.values.length === 0) {
    errors.push(`custom relationship target column ${JSON.stringify(values[0])} requires a target-column rationale`);
    return { error: errors.join("; "), headers: defaults };
  }
  const custom = normalize(values[0] ?? "");
  if (STATE_HEADERS.has(custom)) {
    errors.push(`relationship target column ${JSON.stringify(values[0])} overlaps the lifecycle vocabulary`);
    return { error: errors.join("; "), headers: defaults };
  }
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    headers: /* @__PURE__ */ new Set([...defaults, custom])
  };
}
function nonRelationshipTableHeaders(metadata, role) {
  const projection = scalarListAliasValues(metadata, [
    "non_relationship_table_columns",
    "non_relationship_table_target_columns"
  ], "non-relationship table columns");
  const rationale = scalarAliasValues(
    metadata,
    ["non_relationship_table_rationale"],
    "non-relationship table rationale"
  );
  const errors = [projection.error, rationale.error].filter((error) => Boolean(error));
  if (!projection.present) {
    return { ...errors.length > 0 ? { error: errors.join("; ") } : {}, headers: /* @__PURE__ */ new Set() };
  }
  const values = projection.values.map(normalize);
  if (values.length === 0) {
    errors.push("non-relationship table classification declares no target columns");
    return { error: errors.join("; "), headers: /* @__PURE__ */ new Set() };
  }
  if (role !== "child_parentage") {
    errors.push("rollup artifacts cannot suppress state-bearing tables as non-relationship");
    return { error: errors.join("; "), headers: /* @__PURE__ */ new Set() };
  }
  if (rationale.values.length === 0) {
    errors.push("non-relationship table classification requires non_relationship_table_rationale");
    return { error: errors.join("; "), headers: /* @__PURE__ */ new Set() };
  }
  const overlaps = values.filter((value) => PARENTAGE_TARGET_HEADERS.has(value));
  const lifecycleOverlaps = values.filter((value) => STATE_HEADERS.has(value));
  if (overlaps.length > 0 || lifecycleOverlaps.length > 0) {
    errors.push(`relationship or lifecycle columns cannot be suppressed: ${[...overlaps, ...lifecycleOverlaps].map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), headers: /* @__PURE__ */ new Set() };
  }
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    headers: new Set(values)
  };
}
function primaryStateColumn(metadata) {
  const projection = scalarAliasValues(metadata, ["primary_state_column"], "primary state column");
  const errors = [projection.error].filter((error) => Boolean(error));
  if (projection.values.length > 1) {
    errors.push(`primary_state_column must resolve to exactly one header; received ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  const header = projection.values.length === 1 ? normalize(projection.values[0] ?? "") : void 0;
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    ...header ? { header } : {}
  };
}
function splitTableRow(line) {
  const trimmed = line.trim();
  const cells = [];
  let cell = "";
  let codeDelimiter = 0;
  let endedWithDelimiter = false;
  let index = 0;
  while (index < trimmed.length) {
    const character = trimmed[index] ?? "";
    if (character === "`") {
      let end = index + 1;
      while (trimmed[end] === "`") end += 1;
      const runLength = end - index;
      cell += trimmed.slice(index, end);
      if (codeDelimiter === 0) codeDelimiter = runLength;
      else if (codeDelimiter === runLength) codeDelimiter = 0;
      endedWithDelimiter = false;
      index = end;
      continue;
    }
    if (character === "\\" && codeDelimiter === 0) {
      let end = index + 1;
      while (trimmed[end] === "\\") end += 1;
      const runLength = end - index;
      const next = trimmed[end];
      if (next === "|" || next === "`") {
        cell += "\\".repeat(Math.floor(runLength / 2));
        if (runLength % 2 === 1) {
          cell += next;
          endedWithDelimiter = false;
          index = end + 1;
          continue;
        }
      } else {
        cell += "\\".repeat(runLength);
      }
      endedWithDelimiter = false;
      index = end;
      continue;
    }
    if (character === "|" && codeDelimiter === 0) {
      cells.push(cell.trim());
      cell = "";
      endedWithDelimiter = true;
      index += 1;
      continue;
    }
    cell += character;
    endedWithDelimiter = false;
    index += 1;
  }
  cells.push(cell.trim());
  if (trimmed.startsWith("|")) cells.shift();
  if (endedWithDelimiter) cells.pop();
  return cells;
}
function separatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}
function stateLikeHeader(value) {
  return STATE_HEADER_WORDS.has(normalize(value).split(" ").at(-1) ?? "");
}
function scanBody(content) {
  const range = frontmatterRange(content);
  const lines2 = range?.lines ?? content.split(/\r?\n/);
  const start = range ? range.end + 1 : 0;
  const scanned = [];
  let historicalLevel;
  let fence;
  let inHtmlComment = false;
  const visibleText = (raw) => {
    let remaining = raw;
    let visible = "";
    while (remaining.length > 0) {
      if (inHtmlComment) {
        const end = remaining.indexOf("-->");
        if (end < 0) return visible;
        inHtmlComment = false;
        remaining = remaining.slice(end + 3);
        continue;
      }
      const startComment = remaining.indexOf("<!--");
      if (startComment < 0) return visible + remaining;
      visible += remaining.slice(0, startComment);
      remaining = remaining.slice(startComment + 4);
      inHtmlComment = true;
    }
    return visible;
  };
  for (let index = start; index < lines2.length; index += 1) {
    const text2 = visibleText(lines2[index] ?? "");
    const fenceMarker = /^\s{0,3}(`{3,}|~{3,})/.exec(text2)?.[1];
    if (fenceMarker) {
      const character = fenceMarker[0] ?? "";
      if (!fence) fence = { character, length: fenceMarker.length };
      else if (character === fence.character && fenceMarker.length >= fence.length) fence = void 0;
      scanned.push({ historical: true, lineNumber: index + 1, text: "" });
      continue;
    }
    if (fence || inHtmlComment) {
      scanned.push({ historical: true, lineNumber: index + 1, text: "" });
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text2);
    if (heading) {
      const level = (heading[1] ?? "").length;
      if (historicalLevel !== void 0 && level <= historicalLevel) historicalLevel = void 0;
      if (historicalLevel === void 0 && HISTORICAL_HEADINGS.test(heading[2] ?? "")) {
        historicalLevel = level;
      }
    }
    scanned.push({ historical: historicalLevel !== void 0, lineNumber: index + 1, text: text2 });
  }
  return scanned;
}
function tableChildren(lines2, path, role, targetHeaders, nonRelationshipHeaders, primaryStateHeader) {
  const children = [];
  const errors = [];
  for (let index = 0; index + 1 < lines2.length; index += 1) {
    const header = lines2[index];
    const separator = lines2[index + 1];
    if (!header || !separator || header.historical || separator.historical) continue;
    const headerLine = header.text;
    const separatorLine = separator.text;
    if (!headerLine.includes("|") || !separatorLine.includes("|")) continue;
    const headers = splitTableRow(headerLine).map(normalize);
    const childIndexes = headers.flatMap((header2, headerIndex) => targetHeaders.has(header2) ? [headerIndex] : []);
    const stateIndexes = headers.flatMap((header2, headerIndex) => STATE_HEADERS.has(header2) ? [headerIndex] : []);
    const unsupportedStateIndexes = headers.flatMap((header2, headerIndex) => stateLikeHeader(header2) && !STATE_HEADERS.has(header2) ? [headerIndex] : []);
    const nonRelationshipIndexes = headers.flatMap((header2, headerIndex) => nonRelationshipHeaders.has(header2) ? [headerIndex] : []);
    const childIndex = childIndexes[0] ?? -1;
    const declaredStateIndexes = primaryStateHeader ? headers.flatMap((header2, headerIndex) => header2 === primaryStateHeader ? [headerIndex] : []) : [];
    const statusIndexes = headers.flatMap((header2, headerIndex) => header2 === "status" ? [headerIndex] : []);
    const authoritativeStateIndexes = primaryStateHeader ? declaredStateIndexes : statusIndexes.length === 1 ? statusIndexes : stateIndexes;
    const stateIndex = authoritativeStateIndexes[0] ?? -1;
    const hasSeparator = separatorRow(splitTableRow(separatorLine));
    const ambiguousState = primaryStateHeader ? declaredStateIndexes.length !== 1 : statusIndexes.length > 1 || statusIndexes.length === 0 && stateIndexes.length > 1;
    if (childIndexes.length === 0 && nonRelationshipIndexes.length === 1) continue;
    if (childIndexes.length === 0 && nonRelationshipIndexes.length > 1) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `non-relationship table classification is ambiguous across ${nonRelationshipIndexes.length} columns`,
        related: [`${path}#table-header-${header.lineNumber}`]
      });
      continue;
    }
    if (childIndex < 0) {
      if (role === "rollup_projection" && (stateIndex >= 0 || unsupportedStateIndexes.length > 0)) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `${role} table has a state column but no recognized or declared target column (${headers.map((header2) => JSON.stringify(header2)).join(", ")})`,
          related: [`${path}#table-header-${header.lineNumber}`]
        });
      }
      continue;
    }
    if (childIndexes.length > 1 || ambiguousState) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: primaryStateHeader ? `relationship table must contain exactly one declared primary state column ${JSON.stringify(primaryStateHeader)}; found ${declaredStateIndexes.length}` : `relationship table must have exactly one target column and one unambiguous authoritative lifecycle column; found ${childIndexes.length} targets and ${stateIndexes.length} lifecycle-like columns`,
        related: [`${path}#table-header-${header.lineNumber}`]
      });
    }
    if (unsupportedStateIndexes.length > 0 && stateIndex < 0) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `state-like table headers must use a recognized lifecycle column name; unsupported: ${unsupportedStateIndexes.map((headerIndex) => JSON.stringify(headers[headerIndex])).join(", ")}`,
        related: [`${path}#table-header-${header.lineNumber}`]
      });
    }
    let row = index + (hasSeparator ? 2 : 1);
    while (row < lines2.length && !lines2[row]?.historical && (lines2[row]?.text ?? "").includes("|")) {
      const bodyLine = lines2[row];
      const cells = splitTableRow(bodyLine?.text ?? "");
      const id = cells[childIndex]?.replace(/[`*]/g, "").trim();
      const ref = `${path}#table-row-${bodyLine?.lineNumber ?? row + 1}`;
      const stateValue = stateIndex < 0 ? void 0 : cells[stateIndex]?.trim();
      if (!id) {
        if (cells.some((cell) => cell.trim() !== "")) {
          errors.push({
            code: "planning_relationship_unresolved",
            detail: "relationship table row has no target identity",
            related: [ref]
          });
        }
        row += 1;
        continue;
      }
      const state = lifecycle(stateValue);
      if (stateIndex >= 0 && state === "unknown") {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `relationship table row has missing or unrecognized lifecycle ${JSON.stringify(stateValue ?? "")}`,
          related: [ref]
        });
      }
      children.push({ id, ref, state });
      row += 1;
    }
    index = row - 1;
  }
  const uniqueProjections = /* @__PURE__ */ new Map();
  for (const child of children) {
    const key = `${normalizedId(child.id)}\0${child.state}`;
    const prior = uniqueProjections.get(key);
    if (!prior || child.ref.localeCompare(prior.ref) < 0) uniqueProjections.set(key, child);
  }
  return {
    children: [...uniqueProjections.values()].sort((left, right) => normalizedId(left.id).localeCompare(normalizedId(right.id)) || left.state.localeCompare(right.state) || left.ref.localeCompare(right.ref)),
    errors
  };
}
function structuredChildren(metadata, path, parentKeys) {
  const children = [];
  const errors = [];
  const parseEntry = (value, ref) => {
    const direct = scalar(value);
    if (direct) {
      children.push({ id: direct, ref, state: "unknown" });
      return;
    }
    const item = object2(value);
    if (!item) {
      errors.push({
        code: "planning_relationship_unresolved",
        detail: "structured relationship entry has no scalar or recognized identity",
        related: [ref]
      });
      return;
    }
    const identityScan = scalarAliasValues(item, STRUCTURED_ID_KEYS, "structured relationship identity");
    const ids = identityScan.values;
    const unsupportedState = unsupportedStateAliasError(item, "structured relationship entry", "relationship");
    if (unsupportedState) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: unsupportedState,
        related: [ref]
      });
    }
    const nestedParentage = topEntries(item, [
      "artifact_type",
      "kind",
      "parent",
      "parent_id",
      "parent_ids",
      "parents",
      "parents_ids",
      "review_of",
      "reviewed_id",
      "subject_id",
      "target_id",
      "top_level",
      "type"
    ]);
    if (nestedParentage.length > 0) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `structured child projection cannot redeclare type, top-level status, or parentage: ${nestedParentage.map(([key]) => JSON.stringify(key)).join(", ")}`,
        related: [ref]
      });
    }
    if (identityScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: identityScan.error,
        related: [ref]
      });
    }
    if (ids.length !== 1) {
      errors.push({
        code: ids.length > 1 ? "planning_relationship_conflict" : "planning_relationship_unresolved",
        detail: ids.length > 1 ? `structured relationship entry resolves to ${ids.length} identities` : "structured relationship entry has no recognized identity",
        related: [ref]
      });
      return;
    }
    const stateScan = lifecycleAliasProjection(item, "structured relationship lifecycle");
    if (stateScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: stateScan.error,
        related: [ref]
      });
    }
    children.push({ id: ids[0] ?? "", ref, state: stateScan.projection.state });
  };
  for (const [key, value] of Object.entries(metadata)) {
    const token = keyToken(key);
    if (!STRUCTURED_CHILD_KEYS.has(token) || parentKeys.has(token)) continue;
    const ref = `${path}#${token}`;
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) parseEntry(entry, `${ref}[${index}]`);
      continue;
    }
    parseEntry(value, ref);
  }
  return { children, errors };
}
function bodyProjection(lines2) {
  const values = [];
  for (const line of lines2) {
    if (line.historical) continue;
    const match = /^\s*(?:>\s*)*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:\*\*)?(?:(?:current|implementation)[_ -]+)?(?:lifecycle|phase|stage|state|status)(?:\*\*)?\s*:\s*(.+?)\s*$/i.exec(line.text);
    if (match?.[1] && lifecycle(match[1]) !== "unknown") values.push(match[1]);
  }
  return stateProjection(values);
}
function bodyAcceptanceObservations(lines2, path) {
  const observations = [];
  const kindPattern = "(acceptance|holdout|qa|review)";
  const fieldPattern = "(?:(?:current|implementation)[ _-]+)?(?:lifecycle|outcome|phase|result|stage|state|status|verdict)";
  const label = new RegExp(`^${kindPattern}(?:\\s+${fieldPattern})?\\s*:\\s*(.+?)\\s*$`, "i");
  const acceptanceKind = (value) => ACCEPTANCE_KINDS.find((kind) => new RegExp(`\\b${kind}\\b`, "i").test(value));
  for (const line of lines2) {
    if (line.historical) continue;
    const visible = line.text.replace(/^\s*(?:>\s*)*/, "").replace(/^\s*#{1,6}\s*/, "").replace(/^\s*[-*+]\s*/, "");
    const plain = visible.replace(/\*\*|__|`/g, "").trim();
    const labelled = label.exec(plain);
    if (labelled?.[1] && labelled[2]) {
      observations.push({
        identity: `body:${path}:${normalize(labelled[1])}`,
        kind: normalize(labelled[1]),
        rationale: false,
        ref: `${path}#line-${line.lineNumber}`,
        strength: "explicit",
        state: acceptance(labelled[2])
      });
      continue;
    }
    if (/\bpending\b/i.test(plain)) {
      const kind = acceptanceKind(plain);
      if (kind) {
        observations.push({
          identity: `body:${path}:${kind}`,
          kind,
          rationale: false,
          ref: `${path}#line-${line.lineNumber}`,
          strength: "weak",
          state: "unrun"
        });
      }
    }
  }
  return observations;
}
function unfinishedCompletionMarkers(lines2, path) {
  const refs = [];
  for (const line of lines2) {
    if (line.historical) continue;
    const visible = line.text.replace(/^\s*(?:>\s*)*/, "").replace(/^\s*[-*+]\s*/, "");
    if (/^\[\s\]\s+\S/.test(visible)) refs.push(`${path}#line-${line.lineNumber}`);
  }
  return refs;
}
function validAcceptanceScope(value) {
  const direct = scalar(value);
  if (direct) return acceptance(direct) !== "unknown";
  if (Array.isArray(value)) return value.length > 0 && value.every(validAcceptanceScope);
  const item = object2(value);
  if (!item || Object.keys(item).length === 0) return false;
  const entries = Object.entries(item);
  const outcomeTokens = /* @__PURE__ */ new Set([
    ...ACCEPTANCE_VALUE_FIELDS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken)
  ]);
  const directOutcomes = entries.filter(([key]) => outcomeTokens.has(keyToken(key)));
  const decisiveTokens = new Set(DECISIVE_ACCEPTANCE_FIELDS.map(keyToken));
  const decisiveOutcomes = directOutcomes.filter(([key]) => decisiveTokens.has(keyToken(key)));
  const selectedOutcomes = decisiveOutcomes.length > 0 ? decisiveOutcomes : directOutcomes;
  const nestedScopes = entries.filter(([key]) => {
    const token = keyToken(key);
    return ACCEPTANCE_KINDS.some((kind) => token === kind || token === `${kind}s`);
  });
  if (selectedOutcomes.length > 0) {
    return selectedOutcomes.every(([, outcome]) => acceptance(scalar(outcome)) !== "unknown");
  }
  if (nestedScopes.length > 0) return true;
  const collectionEntries = entries.filter(([key]) => !(/* @__PURE__ */ new Set(["justification", "rationale", "reason"])).has(keyToken(key)));
  return collectionEntries.length > 0 && collectionEntries.every(([, child]) => object2(child) !== void 0 && validAcceptanceScope(child));
}
function unsupportedAcceptanceAliasError(metadata) {
  const supported = /* @__PURE__ */ new Set([
    ...ACCEPTANCE_VALUE_FIELDS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken)
  ]);
  const unsupported = Object.keys(metadata).filter((key) => {
    const token = keyToken(key);
    const words = normalize(key).split(" ");
    return words.some((word) => ACCEPTANCE_OUTCOME_WORDS.has(word)) && !supported.has(token);
  });
  return unsupported.length > 0 ? `acceptance scope contains unsupported outcome-like aliases: ${unsupported.map((key) => JSON.stringify(key)).join(", ")}` : void 0;
}
function acceptanceDeclarationErrors(metadata, path, artifactTypeValue, isAcceptance) {
  const errors = [];
  const fields = ACCEPTANCE_VALUE_FIELDS;
  const kinds = ACCEPTANCE_KINDS;
  const visit = (value, trail) => {
    const item = object2(value);
    if (!item) {
      if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, [...trail, String(index)]));
      return;
    }
    const trailWords = trail.flatMap((part) => normalize(part).split(" "));
    if (trailWords.some((word) => ACCEPTANCE_WORDS.has(word) || ACCEPTANCE_WORDS.has(word.replace(/s$/, "")))) {
      const unsupportedState = unsupportedStateAliasError(item, "acceptance scope", "acceptance");
      const unsupportedOutcome = unsupportedAcceptanceAliasError(item);
      if (unsupportedState) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: unsupportedState,
          related: [`${path}#${trail.join(".")}`]
        });
      }
      if (unsupportedOutcome) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: unsupportedOutcome,
          related: [`${path}#${trail.join(".")}`]
        });
      }
    }
    for (const [scopeKey, scopeValue] of Object.entries(item)) {
      const scope = keyToken(scopeKey);
      if (!kinds.some((kind) => scope === kind || scope === `${kind}s`)) continue;
      if (trail.length === 0 && scope === "reviews") continue;
      if (!validAcceptanceScope(scopeValue)) {
        errors.push({
          code: "planning_relationship_unresolved",
          detail: `acceptance scope ${JSON.stringify(scopeKey)} is empty or malformed`,
          related: [`${path}#${[...trail, scope].join(".")}`]
        });
      }
    }
    for (const kind of kinds) {
      const contextual = trailWords.some((word) => word === kind || word === `${kind}s`) || trail.length === 0 && isAcceptance && gateKind([artifactTypeValue, path]) === kind;
      const prefixedKeys = fields.map((field) => `${kind}_${field}`);
      const keys = contextual ? [...prefixedKeys, ...fields] : prefixedKeys;
      const decisiveKeys = contextual ? [`${kind}_outcome`, `${kind}_result`, `${kind}_verdict`, "outcome", "result", "verdict"] : [`${kind}_outcome`, `${kind}_result`, `${kind}_verdict`];
      const projection = scalarAliasValues(
        item,
        topEntries(item, decisiveKeys).length > 0 ? decisiveKeys : keys,
        `${kind} outcome`
      );
      const rationaleFields = ["justification", "rationale", "reason"];
      const prefixedRationaleKeys = rationaleFields.map((field) => `${kind}_${field}`);
      const rationaleKeys = contextual ? [...prefixedRationaleKeys, ...rationaleFields] : prefixedRationaleKeys;
      const rationale = scalarAliasValues(item, rationaleKeys, `${kind} rationale`);
      if (!projection.present && !rationale.present) continue;
      if (projection.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: projection.error,
          related: [`${path}#${[...trail, kind].join(".")}`]
        });
      }
      const unknownOutcomes = projection.values.filter((value2) => acceptanceForArtifact(value2, artifactTypeValue, kind) === "unknown");
      if (unknownOutcomes.length > 0) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `${kind} outcome contains unsupported values: ${unknownOutcomes.map((value2) => JSON.stringify(value2)).join(", ")}`,
          related: [`${path}#${[...trail, kind].join(".")}`]
        });
      }
      if (rationale.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: rationale.error,
          related: [`${path}#${[...trail, kind, "rationale"].join(".")}`]
        });
      }
    }
    for (const [key, child] of Object.entries(item)) visit(child, [...trail, keyToken(key)]);
  };
  visit(metadata, []);
  return errors;
}
var PLANNING_ROOT_DIRECTORY_NAMES = /* @__PURE__ */ new Set([
  "epics",
  "issues",
  "planning",
  "plans",
  "project management",
  "roadmap",
  "slices",
  "stories",
  "tasks",
  "work items"
]);
function implicitPlanningPolicy(source, metadata) {
  const extension = extname2(source.path).toLocaleLowerCase("und");
  if (!(/* @__PURE__ */ new Set([".yaml", ".yml"])).has(extension) || !basename2(source.path).startsWith("_")) return false;
  const parent = normalize(source.path.split("/").at(-2) ?? "");
  if (!PLANNING_ROOT_DIRECTORY_NAMES.has(parent)) return false;
  const declarationKeys = [
    "artifact_id",
    "artifact_type",
    "child_relationship_role",
    "epic_id",
    "feature_id",
    "id",
    "kind",
    "maint_id",
    "maintenance_id",
    "parent",
    "parent_id",
    "parent_ids",
    "relationship_role",
    "slice_id",
    "story_id",
    "task_id",
    "top_level",
    "type",
    "work_item_id"
  ];
  return topEntries(metadata, declarationKeys).length === 0;
}
function implicitPlanningEvidence(source, metadata) {
  const declarationKeys = [
    "artifact_id",
    "artifact_type",
    "epic_id",
    "feature_id",
    "holdout_id",
    "id",
    "kind",
    "maint_id",
    "maintenance_id",
    "parent",
    "parent_id",
    "parent_ids",
    "qa_id",
    "relationship_role",
    "review_id",
    "slice_id",
    "story_id",
    "task_id",
    "top_level",
    "type",
    "work_item_id"
  ];
  if (topEntries(metadata, declarationKeys).length > 0) return false;
  const parts = source.path.split("/").slice(0, -1).map(normalize);
  if (parts.some((part) => (/* @__PURE__ */ new Set(["evidence", "holdout evidence", "receipts", "verdict evidence"])).has(part))) return true;
  const stem = normalize(basename2(source.path, extname2(source.path)));
  return /(?:^| )(?:audit|readiness|verification report)$/.test(stem);
}
function emptyStateProjection() {
  return { state: "unknown", states: [], values: [] };
}
function parseArtifact(source) {
  const parsed = parseSource(source);
  const typeProjection = artifactType(source.path, parsed.metadata);
  const type = typeProjection.type;
  const isAcceptance = acceptanceArtifact(source.path, type);
  const lane = pathLane(source.path);
  const remediationState = type === "finding" ? findingStateProjection(parsed.metadata) : void 0;
  const declaredScan = remediationState ? {
    ...remediationState.error ? { error: remediationState.error } : {},
    projection: remediationState.projection
  } : lifecycleAliasProjection(parsed.metadata, "artifact lifecycle", isAcceptance);
  const unsupportedStateError = unsupportedStateAliasError(parsed.metadata, "artifact", type);
  const declaredProjection = declaredScan.projection;
  const declared = declaredProjection.state;
  const identity2 = artifactIdentity(source.path, type, parsed.metadata);
  const contextualPolicy = implicitPlanningPolicy(source, parsed.metadata);
  const contextualEvidence = implicitPlanningEvidence(source, parsed.metadata);
  const contextualCompound = Boolean(source.compoundEnvelope);
  const nonArtifactRequested = contextualPolicy || contextualEvidence || contextualCompound || isNonArtifactPlanningClass(source.declaredClass ?? "") || isNonArtifactPlanningClass(type);
  const classificationRationale = scalarAliasValues(
    parsed.metadata,
    ["classification_rationale", "justification", "non_artifact_rationale", "rationale", "reason"],
    "classification rationale"
  );
  const nonArtifactRationale = contextualPolicy || contextualEvidence || contextualCompound || Boolean(source.classificationRationale?.trim()) || classificationRationale.values.length > 0;
  const topLevelScan = topLevelProjection(parsed.metadata);
  const topLevel = topLevelScan.value;
  const extension = extname2(source.path).toLocaleLowerCase("und");
  const scannedBody = (/* @__PURE__ */ new Set([".md", ".mdx", ".txt"])).has(extension) ? scanBody(source.content) : [];
  const explicitRelationshipRole = topEntries(
    parsed.metadata,
    ["child_relationship_role", "relationship_role"]
  ).length > 0;
  const graphEligible = HIERARCHY_ARTIFACT_TYPES.has(type) || ROLLUP_ARTIFACT_TYPES.has(type) || lane !== "unknown" || explicitRelationshipRole;
  const currentBody = graphEligible ? bodyProjection(scannedBody) : emptyStateProjection();
  const bodyGateObservations = graphEligible || isAcceptance ? bodyAcceptanceObservations(scannedBody, source.path) : [];
  const unfinishedMarkers = graphEligible && !isAcceptance ? unfinishedCompletionMarkers(scannedBody, source.path) : [];
  const parentScan = parentReferences(parsed.metadata, type, isAcceptance, source.path);
  const parentIds = parentScan.ids;
  const relationshipRole = childRelationshipRole(parsed.metadata, type);
  const targetHeaders = relationshipTargetHeaders(parsed.metadata, relationshipRole.role);
  const nonRelationshipHeaders = nonRelationshipTableHeaders(parsed.metadata, relationshipRole.role);
  const primaryState = primaryStateColumn(parsed.metadata);
  const scannedTables = graphEligible ? tableChildren(
    scannedBody,
    source.path,
    relationshipRole.role,
    targetHeaders.headers,
    nonRelationshipHeaders.headers,
    primaryState.header
  ) : { children: [], errors: [] };
  const structuredRelationships = structuredChildren(
    parsed.metadata,
    source.path,
    new Set(parentReferenceKeys(type, isAcceptance).map(keyToken))
  );
  const acceptanceErrors = acceptanceDeclarationErrors(parsed.metadata, source.path, type, isAcceptance);
  const operateTime = operateTimeLegs(parsed.metadata);
  const acceptanceValues = topEntries(parsed.metadata, EXPLICIT_ACCEPTANCE_FIELDS);
  const selectedAcceptanceValues = acceptanceValues.length > 0 ? acceptanceValues : isAcceptance ? topEntries(parsed.metadata, ["status"]) : [];
  const acceptanceStates = [...new Set(selectedAcceptanceValues.map(([, value]) => acceptanceForArtifact(scalar(value), type, gateKind([type, source.path], type))))];
  const acceptanceState = acceptanceStates.length === 1 ? acceptanceStates[0] ?? "unknown" : "unknown";
  const maintenance = maintenanceEvidence(parsed.metadata, source.content);
  const relationshipErrors = [
    ...typeProjection.error ? [{ code: "planning_relationship_conflict", detail: typeProjection.error, related: [] }] : [],
    ...identity2.error ? [{ code: "planning_relationship_conflict", detail: identity2.error, related: [] }] : [],
    ...declaredScan.error && type !== "finding" ? [{ code: "planning_relationship_conflict", detail: declaredScan.error, related: [] }] : [],
    ...unsupportedStateError ? [{ code: "planning_relationship_conflict", detail: unsupportedStateError, related: [] }] : [],
    ...classificationRationale.error ? [{ code: "planning_relationship_conflict", detail: classificationRationale.error, related: [] }] : [],
    ...topLevelScan.error ? [{ code: "planning_relationship_conflict", detail: topLevelScan.error, related: [] }] : [],
    ...relationshipRole.error ? [{ code: "planning_relationship_conflict", detail: relationshipRole.error, related: [] }] : [],
    ...targetHeaders.error ? [{ code: "planning_relationship_conflict", detail: targetHeaders.error, related: [] }] : [],
    ...nonRelationshipHeaders.error ? [{ code: "planning_relationship_conflict", detail: nonRelationshipHeaders.error, related: [] }] : [],
    ...primaryState.error ? [{ code: "planning_relationship_conflict", detail: primaryState.error, related: [] }] : [],
    ...parentScan.errors,
    ...scannedTables.errors,
    ...structuredRelationships.errors,
    ...acceptanceErrors
  ];
  const table = [
    ...scannedTables.children,
    ...structuredRelationships.children
  ];
  const metadataHasAcceptanceSignal = deepEntries(parsed.metadata).some((entry) => [...ACCEPTANCE_WORDS].some((word) => entry.path.join("_").includes(word)));
  const nestedCanonicalPlanningSignal = hasNestedCanonicalPlanningSignal(parsed.metadata);
  const typedPlanningArtifact = PLANNING_ARTIFACT_TYPES.has(type);
  const hasPlanningSignals = lane !== "unknown" || declaredProjection.values.length > 0 || currentBody.values.length > 0 || identity2.explicit || isAcceptance || parentIds.length > 0 || table.length > 0 || bodyGateObservations.length > 0 || metadataHasAcceptanceSignal || nestedCanonicalPlanningSignal || topLevel || typedPlanningArtifact || relationshipErrors.length > 0 || hasRawPlanningSignal(parsed.metadata, type) || topEntries(parsed.metadata, [
    "child_relationship_role",
    "child_target_column",
    "relationship_role",
    "relationship_target_column",
    "rollup_target_column"
  ]).length > 0;
  const contextualNonArtifact = (contextualPolicy || contextualEvidence || contextualCompound) && parsed.parseError === void 0;
  const nonArtifact = contextualNonArtifact || nonArtifactRequested && nonArtifactRationale && !hasPlanningSignals;
  const structuredSurface = parsed.structured || table.length > 0 || currentBody.values.length > 0;
  const structured = parsed.parseError === void 0 && (nonArtifact || structuredSurface && hasPlanningSignals);
  const state = lane !== "unknown" ? lane : declaredProjection.values.length > 0 ? declared : currentBody.state;
  return {
    acceptance: isAcceptance,
    acceptanceState,
    bodyGateObservations,
    bodyProjection: currentBody,
    childRelationshipRole: relationshipRole.role,
    content: source.content,
    declared,
    declaredClass: lifecycle(source.declaredClass),
    declaredProjection,
    id: identity2.id,
    identityExplicit: identity2.explicit,
    lane,
    ...maintenance.commit ? { maintenanceCommit: maintenance.commit } : {},
    maintenanceTerminalEvidence: maintenance.terminal,
    metadata: parsed.metadata,
    nonArtifact,
    nonArtifactRationale,
    nonArtifactRequested,
    parentIds,
    parentReferences: parentScan.references,
    ...parsed.parseError === void 0 ? {} : { parseError: parsed.parseError },
    path: source.path,
    findingState: remediationState?.state ?? "unknown",
    operateTimeLegCount: operateTime.count,
    operateTimeLegErrors: operateTime.errors,
    relationshipErrors,
    state,
    structured,
    tableChildren: table,
    topLevel,
    type,
    unfinishedMarkers
  };
}
function finding(code, artifact, detail, related = []) {
  return { code, detail, path: artifact.path, related: [...new Set(related)].sort(), subject: artifact.id };
}
function affectedProjectionField(code) {
  if ((/* @__PURE__ */ new Set([
    "body_projection_conflict",
    "lane_status_conflict",
    "parent_child_projection_conflict",
    "preexecution_parent_has_started_children"
  ])).has(code)) return "lifecycle_projection";
  if ((/* @__PURE__ */ new Set([
    "parent_completion_stale",
    "completed_parent_unexecuted_acceptance",
    "unfinished_completion_marker"
  ])).has(code)) return "completion_rollup";
  if ((/* @__PURE__ */ new Set([
    "acceptance_cascade_unexecuted",
    "acceptance_failure_unpaid",
    "acceptance_partial_malformed",
    "acceptance_partial_unpaid",
    "acceptance_gate_undiscovered",
    "acceptance_gate_unknown"
  ])).has(code)) return "acceptance_execution";
  if (code === "acceptance_gate_identity_conflict") return "acceptance_identity";
  if ((/* @__PURE__ */ new Set([
    "orphan_parent_reference",
    "planning_relationship_conflict",
    "planning_relationship_unresolved"
  ])).has(code)) return "relationship_graph";
  if (code === "duplicate_artifact_id") return "artifact_identity";
  if (code === "archive_classification_conflict") return "archive_classification";
  if (code === "lifecycle_state_unknown") return "lifecycle_state";
  if ((/* @__PURE__ */ new Set([
    "finding_state_unknown",
    "remediation_finding_open",
    "remediation_finding_partial"
  ])).has(code)) return "remediation_state";
  if (code === "maintenance_lifecycle_stale") return "maintenance_lifecycle";
  return "planning_input";
}
function stablePlanningId(prefix, parts) {
  const digest = createHash2("sha256").update(parts.map((part) => part.trim()).join("\0")).digest("hex").slice(0, 20).toUpperCase();
  return `${prefix}-${digest}`;
}
function causalPlanningAccounting(findings, snapshot) {
  const rawFindings = findings.map((item) => ({
    ...item,
    detector: "planning_graph",
    evidence_refs: [.../* @__PURE__ */ new Set([item.path, ...item.related])].sort(),
    id: stablePlanningId("RAW-PLANNING", [
      "planning_graph",
      item.code,
      item.subject,
      item.path,
      item.detail.replaceAll(/\s+/g, " "),
      ...[...new Set(item.related)].sort()
    ]),
    snapshot
  }));
  const parents = rawFindings.map((_, index) => index);
  const findRoot = (index) => {
    let current = index;
    while ((parents[current] ?? current) !== current) current = parents[current] ?? current;
    let cursor = index;
    while ((parents[cursor] ?? cursor) !== current) {
      const next = parents[cursor] ?? cursor;
      parents[cursor] = current;
      cursor = next;
    }
    return current;
  };
  const unite = (left, right) => {
    const leftRoot = findRoot(left);
    const rightRoot = findRoot(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const firstByInvariantRef = /* @__PURE__ */ new Map();
  const boundSnapshot = snapshot !== "unbound";
  for (const [index, item] of rawFindings.entries()) {
    const invariant = affectedProjectionField(item.code);
    const refs = boundSnapshot ? item.evidence_refs.map((ref) => ref.split("#", 1)[0] ?? ref).filter((ref) => ref.includes("/") || /\.[A-Za-z0-9]+$/.test(ref)) : [item.path];
    for (const ref of [...new Set(refs)]) {
      const key = `${invariant}\0${ref}`;
      const prior = firstByInvariantRef.get(key);
      if (prior === void 0) firstByInvariantRef.set(key, index);
      else unite(prior, index);
    }
  }
  const groups = /* @__PURE__ */ new Map();
  for (const [index, item] of rawFindings.entries()) {
    const root = findRoot(index);
    const group = groups.get(root) ?? [];
    group.push(item);
    groups.set(root, group);
  }
  const orderedGroups = [...groups.values()].sort((left, right) => {
    const leftItem = left[0];
    const rightItem = right[0];
    return affectedProjectionField(leftItem?.code ?? "planning_input_unparsed").localeCompare(affectedProjectionField(rightItem?.code ?? "planning_input_unparsed")) || (leftItem?.path ?? "").localeCompare(rightItem?.path ?? "");
  });
  const rootDebts = orderedGroups.map((group) => {
    const projection = affectedProjectionField(group[0]?.code ?? "planning_input_unparsed");
    const classes = [...new Set(group.map((item) => item.code))].sort();
    const paths = [...new Set(group.flatMap((item) => [item.path, ...item.related].map((ref) => ref.split("#", 1)[0] ?? ref).filter((ref) => ref.includes("/") || /\.[A-Za-z0-9]+$/.test(ref))))].sort();
    const componentRefs = [...new Set(group.flatMap((item) => item.evidence_refs))].sort();
    const boundary = paths.length === 1 ? paths[0] ?? group[0]?.path ?? "unknown" : `${paths.length}-artifact connected component rooted at ${paths[0] ?? "unknown"}`;
    const causeKey = `planning:${projection}:${stablePlanningId("CAUSE", [
      projection,
      ...classes,
      ...componentRefs,
      ...group.map((item) => item.id).sort()
    ])}`;
    return {
      affected_paths: paths,
      affected_projection_field: projection,
      causal_evidence: {
        component_refs: componentRefs,
        kind: paths.length > 1 ? "connected_artifact_component" : "single_artifact",
        violated_invariant: projection
      },
      cause_key: causeKey,
      class: classes.join("+"),
      detector_family: "planning_graph",
      id: stablePlanningId("ROOT-PLANNING", [causeKey, ...group.map((item) => item.id).sort()]),
      observation_count: group.length,
      raw_finding_ids: group.map((item) => item.id).sort(),
      repair_boundary: boundary,
      snapshot
    };
  });
  return { rawFindings, rootDebts };
}
function gateKind(path, fallback = "acceptance") {
  const words = path.flatMap((part) => normalize(part).split(" "));
  for (const kind of ["holdout", "review", "qa", "acceptance"]) if (words.includes(kind)) return kind;
  return fallback;
}
function gateHasRationale(metadata, kind, outcomePath) {
  const outcomeContainer = outcomePath.slice(0, -1).join(".");
  return deepEntries(metadata).some((entry) => {
    const last = entry.path.at(-1) ?? "";
    const rationaleFields = /* @__PURE__ */ new Set(["justification", "rationale", "reason"]);
    const base = last.startsWith(`${kind}_`) ? last.slice(kind.length + 1) : last;
    if (!rationaleFields.has(base) || !scalar(entry.value)) return false;
    return entry.path.slice(0, -1).join(".") === outcomeContainer;
  });
}
function embeddedGateObservations(parent) {
  const candidates = [];
  const stateFields = /* @__PURE__ */ new Set([
    "current_lifecycle",
    "current_phase",
    "current_stage",
    "current_state",
    "current_status",
    "implementation_status",
    "lifecycle",
    "phase",
    "stage",
    "state",
    "status"
  ]);
  const outcomeFields = /* @__PURE__ */ new Set(["outcome", "result", "verdict"]);
  const identityFor = (kind) => {
    const ids = scalarAliasValues(parent.metadata, [`${kind}_id`], `${kind} identity`).values;
    return ids.length === 1 ? `id:${normalizedId(ids[0] ?? "")}` : `embedded:${parent.path}:${kind}`;
  };
  for (const entry of deepEntries(parent.metadata)) {
    const last = entry.path.at(-1) ?? "";
    const joined = entry.path.join("_");
    const hasAcceptance = [...ACCEPTANCE_WORDS].some((word) => joined.includes(word));
    const scopeKind = [...entry.path].reverse().flatMap((part) => [...ACCEPTANCE_WORDS].filter((word) => part === word || part === `${word}s`)).at(0);
    if (parent.type === "story" && entry.path.length === 1 && last === "story_review_status") {
      candidates.push({
        explicit: true,
        identity: identityFor("review"),
        kind: "review",
        rationale: gateHasRationale(parent.metadata, "review", entry.path),
        ref: `${parent.path}#story_review_status`,
        scope: `review\0`,
        strength: "structured",
        state: acceptanceForArtifact(scalar(entry.value), parent.type, "review")
      });
      continue;
    }
    if (scopeKind && (last === scopeKind || last === `${scopeKind}s` || /^\d+$/.test(last))) {
      candidates.push({
        explicit: true,
        identity: identityFor(scopeKind),
        kind: scopeKind,
        rationale: gateHasRationale(parent.metadata, scopeKind, entry.path),
        ref: `${parent.path}#${entry.path.join(".")}`,
        scope: `${scopeKind}\0${entry.path.slice(0, -1).join(".")}`,
        strength: "structured",
        state: acceptanceForArtifact(scalar(entry.value), parent.type, scopeKind)
      });
      continue;
    }
    const genericField = stateFields.has(last);
    const explicitField = outcomeFields.has(last) || [...ACCEPTANCE_WORDS].some((word) => (/* @__PURE__ */ new Set([...outcomeFields, ...stateFields])).has(last.replace(`${word}_`, "")) && last.startsWith(`${word}_`));
    const stateField = genericField || explicitField;
    if (!hasAcceptance || !stateField) continue;
    const kind = gateKind(entry.path);
    candidates.push({
      explicit: explicitField,
      identity: identityFor(kind),
      kind,
      rationale: gateHasRationale(parent.metadata, kind, entry.path),
      ref: `${parent.path}#${entry.path.join(".")}`,
      scope: `${kind}\0${entry.path.slice(0, -1).join(".")}`,
      strength: "structured",
      state: acceptanceForArtifact(scalar(entry.value), parent.type, kind)
    });
  }
  const explicitScopes = new Set(candidates.filter((candidate) => candidate.explicit).map((candidate) => candidate.scope));
  return candidates.filter((candidate) => candidate.explicit || !explicitScopes.has(candidate.scope)).map(({ identity: identity2, kind, rationale, ref, state, strength }) => ({ identity: identity2, kind, rationale, ref, state, strength }));
}
function artifactGateObservations(artifact) {
  const explicit = topEntries(artifact.metadata, EXPLICIT_ACCEPTANCE_FIELDS);
  const selected = explicit.length > 0 ? explicit : topEntries(artifact.metadata, ["status"]);
  const kind = gateKind([artifact.type, artifact.path], artifact.type);
  const identity2 = artifact.identityExplicit ? `id:${normalizedId(artifact.id)}` : `path:${artifact.path}`;
  const rationale = topValues(artifact.metadata, ["justification", "rationale", "reason"]).length > 0;
  const direct = selected.length === 0 ? [{ identity: identity2, kind, rationale, ref: artifact.path, state: "unknown", strength: "structured" }] : selected.map(([, value]) => ({
    identity: identity2,
    kind,
    rationale,
    ref: artifact.path,
    strength: "structured",
    state: acceptanceForArtifact(scalar(value), artifact.type, kind)
  }));
  const supporting = explicit.length > 0 ? embeddedGateObservations(artifact) : [...embeddedGateObservations(artifact), ...artifact.bodyGateObservations];
  return [...direct, ...supporting].map((observation) => ({ ...observation, identity: identity2 }));
}
function acceptanceGates(parent, artifacts) {
  const embeddedParentObservations = embeddedGateObservations(parent);
  const embeddedIdentitiesByKind = /* @__PURE__ */ new Map();
  for (const observation of embeddedParentObservations) {
    const identities = embeddedIdentitiesByKind.get(observation.kind) ?? /* @__PURE__ */ new Set();
    identities.add(observation.identity);
    embeddedIdentitiesByKind.set(observation.kind, identities);
  }
  const parentObservations = [
    ...embeddedParentObservations,
    ...parent.bodyGateObservations.map((observation) => {
      const identities = [...embeddedIdentitiesByKind.get(observation.kind) ?? []];
      return identities.length === 1 ? { ...observation, identity: identities[0] ?? observation.identity } : observation;
    })
  ];
  const childObservations = [];
  for (const artifact of artifacts) {
    if (!artifact.acceptance || artifact.state === "archived") continue;
    if (!artifact.parentIds.some((id) => normalizedId(id) === normalizedId(parent.id))) continue;
    childObservations.push(...artifactGateObservations(artifact));
  }
  const childIdentitiesByKind = /* @__PURE__ */ new Map();
  for (const observation of childObservations) {
    const identities = childIdentitiesByKind.get(observation.kind) ?? /* @__PURE__ */ new Set();
    identities.add(observation.identity);
    childIdentitiesByKind.set(observation.kind, identities);
  }
  const observations = [
    ...parentObservations.map((observation) => {
      if (!observation.identity.startsWith("embedded:") && !observation.identity.startsWith("body:")) return observation;
      const identities = [...childIdentitiesByKind.get(observation.kind) ?? []];
      return identities.length === 1 ? { ...observation, identity: identities[0] ?? observation.identity } : observation;
    }),
    ...childObservations
  ];
  const kindsWithStrongEvidence = new Set(observations.filter((observation) => observation.strength !== "weak").map((observation) => observation.kind));
  const eligibleObservations = observations.filter((observation) => observation.strength !== "weak" || !kindsWithStrongEvidence.has(observation.kind));
  const grouped = /* @__PURE__ */ new Map();
  for (const observation of eligibleObservations) {
    const key = `${observation.kind}\0${observation.identity}`;
    const current = grouped.get(key) ?? [];
    current.push(observation);
    grouped.set(key, current);
  }
  return [...grouped.entries()].map(([key, rawValues]) => {
    const [kind = "acceptance", identity2 = "unknown"] = key.split("\0", 2);
    const values = rawValues.some((value) => value.strength !== "weak") ? rawValues.filter((value) => value.strength !== "weak") : rawValues;
    const states = [...new Set(values.map((value) => value.state))].sort();
    const unreasonedExemption = values.some((value) => value.state === "not_applicable" && !value.rationale);
    const state = states.includes("failed") ? "failed" : states.includes("partial") ? "partial" : states.includes("unrun") ? "unrun" : states.includes("unknown") || unreasonedExemption ? "unknown" : states.includes("not_applicable") ? "not_applicable" : "passed";
    return {
      identity: identity2,
      kind,
      refs: unique(values.map((value) => value.ref)).sort(),
      state,
      states
    };
  }).sort((left, right) => left.kind.localeCompare(right.kind) || left.identity.localeCompare(right.identity));
}
function sameProjection(left, right) {
  return left === "unknown" || right === "unknown" || left === right;
}
function addRelationship(childrenByParent, parent, child) {
  const children = childrenByParent.get(parent) ?? /* @__PURE__ */ new Set();
  children.add(child);
  childrenByParent.set(parent, children);
}
function relationshipCycles(childrenByParent) {
  const nodes = /* @__PURE__ */ new Set();
  for (const [parent, children] of childrenByParent) {
    nodes.add(parent);
    for (const child of children) nodes.add(child);
  }
  const indexByNode = /* @__PURE__ */ new Map();
  const lowLink = /* @__PURE__ */ new Map();
  const onStack = /* @__PURE__ */ new Set();
  const stack = [];
  const cycles = [];
  let nextIndex = 0;
  const visit = (node) => {
    const nodeIndex = nextIndex;
    nextIndex += 1;
    indexByNode.set(node, nodeIndex);
    lowLink.set(node, nodeIndex);
    stack.push(node);
    onStack.add(node);
    const children = [...childrenByParent.get(node) ?? []].sort((left, right) => left.path.localeCompare(right.path));
    for (const child of children) {
      if (!indexByNode.has(child)) {
        visit(child);
        lowLink.set(node, Math.min(lowLink.get(node) ?? nodeIndex, lowLink.get(child) ?? nodeIndex));
      } else if (onStack.has(child)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? nodeIndex, indexByNode.get(child) ?? nodeIndex));
      }
    }
    if (lowLink.get(node) !== nodeIndex) return;
    const component = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (!member) break;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    const selfLoop = component.length === 1 && Boolean(childrenByParent.get(node)?.has(node));
    if (component.length > 1 || selfLoop) {
      cycles.push(component.sort((left, right) => left.path.localeCompare(right.path)));
    }
  };
  for (const node of [...nodes].sort((left, right) => left.path.localeCompare(right.path))) {
    if (!indexByNode.has(node)) visit(node);
  }
  return cycles.sort((left, right) => (left[0]?.path ?? "").localeCompare(right[0]?.path ?? ""));
}
function isPlanningTextPath(path) {
  return TEXT_EXTENSIONS.has(extname2(path).toLocaleLowerCase("und"));
}
function contextualizeDispatchPacketSources(sources) {
  const envelopeDirectories = new Set(sources.flatMap((source) => {
    if (basename2(source.path).toLocaleLowerCase("und") !== "dispatch.md") return [];
    const parsed = parseSource(source);
    if (parsed.parseError) return [];
    const declaredTypes = scalarAliasValues(parsed.metadata, ["artifact_type", "kind", "type"], "dispatch type").values.map(keyToken);
    return declaredTypes.length === 1 && declaredTypes[0] === "dispatch" ? [dirname2(source.path)] : [];
  }));
  const internalName = (path) => {
    const name = basename2(path).toLocaleLowerCase("und");
    return /^(?:execution-dag|ledger|manifest)(?:\.[^.]+)?\.(?:json|md|yaml|yml)$/.test(name) || /^(?:execution-dag|ledger|manifest)\.(?:json|md|yaml|yml)$/.test(name);
  };
  return sources.map((source) => {
    const envelope = dirname2(source.path);
    if (!envelopeDirectories.has(envelope) || !internalName(source.path)) return source;
    const parsed = parseSource(source);
    if (parsed.parseError) return source;
    return {
      ...source,
      classificationRationale: "Compound dispatch packet internal governed by its typed dispatch.md envelope.",
      compoundEnvelope: `${envelope}/dispatch.md`,
      declaredClass: "reference"
    };
  });
}
function auditPlanningArtifacts(sources, planningRootCount = sources.length > 0 ? 1 : 0, options = {}) {
  const artifacts = contextualizeDispatchPacketSources(sources).map(parseArtifact);
  const findings = [];
  for (const artifact of artifacts) {
    if (artifact.nonArtifactRequested && !artifact.nonArtifact) {
      findings.push(finding(
        "planning_input_unparsed",
        artifact,
        artifact.nonArtifactRationale ? "non-artifact classification conflicts with lifecycle, identity, relationship, table-child, or acceptance signals" : "non-artifact classification requires an explicit structured rationale and cannot be established by class label alone"
      ));
    } else if (!artifact.structured && !artifact.nonArtifact) {
      findings.push(finding(
        "planning_input_unparsed",
        artifact,
        `planning input could not be structurally interpreted: ${artifact.parseError ?? "no lifecycle, relationship, or explicit non-artifact classification"}`
      ));
    }
    if (artifact.structured && !artifact.nonArtifact) {
      for (const error of artifact.relationshipErrors) {
        findings.push(finding(
          error.code,
          artifact,
          error.detail,
          error.related
        ));
      }
    }
    if (artifact.structured && !artifact.nonArtifact && artifact.type === "finding") {
      if (artifact.findingState === "unknown") {
        findings.push(finding(
          "finding_state_unknown",
          artifact,
          "remediation finding must begin its state with OPEN, FIXED, RESOLVED, or PARTIAL"
        ));
      } else if (artifact.findingState === "open") {
        findings.push(finding(
          "remediation_finding_open",
          artifact,
          "remediation finding remains OPEN"
        ));
      } else if (artifact.findingState === "partial") {
        findings.push(finding(
          "remediation_finding_partial",
          artifact,
          "remediation finding is only PARTIALLY resolved"
        ));
      }
      continue;
    }
    if (artifact.structured && !artifact.nonArtifact && artifact.acceptance) {
      const malformedPartial = artifact.acceptanceState === "partial" && (artifact.operateTimeLegCount === 0 || artifact.operateTimeLegErrors.length > 0);
      const terminalWithPendingLeg = artifact.acceptanceState === "passed" && artifact.operateTimeLegCount > 0;
      if (malformedPartial || terminalWithPendingLeg || artifact.operateTimeLegErrors.length > 0) {
        findings.push(finding(
          "acceptance_partial_malformed",
          artifact,
          malformedPartial ? `PARTIAL requires at least one typed pending operate-time leg; ${artifact.operateTimeLegErrors.join("; ") || "none declared"}` : terminalWithPendingLeg ? "PASS cannot coexist with pending operate-time legs" : artifact.operateTimeLegErrors.join("; ")
        ));
      }
    }
    if (artifact.structured && !artifact.nonArtifact && artifact.type === "maintenance" && artifact.declared === "active" && artifact.maintenanceCommit && artifact.maintenanceTerminalEvidence && options.repository) {
      let landed = false;
      try {
        landed = isGitAncestor(options.repository, artifact.maintenanceCommit, "HEAD");
      } catch {
        landed = false;
      }
      if (landed) {
        findings.push(finding(
          "maintenance_lifecycle_stale",
          artifact,
          `maintenance remains active after its verified implementation commit ${artifact.maintenanceCommit} landed in the bound target`,
          [artifact.maintenanceCommit]
        ));
      }
    }
    if (artifact.declaredClass === "archived" && artifact.lane !== "archived" && artifact.declared !== "archived") {
      findings.push(finding(
        "archive_classification_conflict",
        artifact,
        "bundle class claims archive but neither physical lane nor artifact lifecycle proves archival state"
      ));
    }
    if (!artifact.structured || artifact.nonArtifact) continue;
    const declaredProjection = artifact.declaredProjection;
    const declaredStates = declaredProjection.states.filter((state) => state !== "unknown");
    if (declaredProjection.values.length > 0 && artifact.declared === "unknown") {
      findings.push(finding(
        "lifecycle_state_unknown",
        artifact,
        declaredStates.length > 1 ? `declared lifecycle fields have conflicting recognized projections: ${declaredStates.join(", ")}` : declaredStates.length === 1 ? `declared lifecycle fields mix recognized and unrecognized projections: ${declaredProjection.values.map((value) => JSON.stringify(value)).join(", ")}` : `declared lifecycle ${declaredProjection.values.map((value) => JSON.stringify(value)).join(", ")} is outside the recognized vocabulary`
      ));
    } else if (declaredProjection.values.length === 0 && artifact.state === "unknown" && !artifact.acceptance) {
      findings.push(finding(
        "lifecycle_state_unknown",
        artifact,
        "planning artifact has no recognized lifecycle in its lane, metadata, or current body"
      ));
    }
    if (artifact.lane !== "unknown" && artifact.declared !== "unknown" && !sameProjection(artifact.lane, artifact.declared)) {
      findings.push(finding(
        "lane_status_conflict",
        artifact,
        `physical lane is ${artifact.lane} but declared lifecycle is ${artifact.declared}`
      ));
    }
    const bodyProjection2 = artifact.bodyProjection;
    const bodyStates = bodyProjection2.states.filter((state) => state !== "unknown");
    if (bodyProjection2.values.length > 0 && bodyProjection2.state === "unknown") {
      findings.push(finding(
        "body_projection_conflict",
        artifact,
        bodyStates.length > 1 ? `current body has conflicting recognized lifecycle projections: ${bodyStates.join(", ")}` : `current body includes an unrecognized lifecycle projection: ${bodyProjection2.values.map((value) => JSON.stringify(value)).join(", ")}`
      ));
    } else if (bodyProjection2.state !== "unknown" && artifact.state !== "unknown" && !sameProjection(artifact.state, bodyProjection2.state)) {
      findings.push(finding(
        "body_projection_conflict",
        artifact,
        `effective lifecycle is ${artifact.state} but current body projects ${bodyProjection2.state}`
      ));
    }
    if (!artifact.acceptance && artifact.state === "done" && artifact.unfinishedMarkers.length > 0) {
      findings.push(finding(
        "unfinished_completion_marker",
        artifact,
        `completed artifact retains ${artifact.unfinishedMarkers.length} unchecked current marker${artifact.unfinishedMarkers.length === 1 ? "" : "s"}`,
        artifact.unfinishedMarkers
      ));
    }
  }
  const byId = /* @__PURE__ */ new Map();
  for (const artifact of artifacts) {
    if (!artifact.structured || artifact.nonArtifact) continue;
    const key = normalizedId(artifact.id);
    const current = byId.get(key) ?? [];
    current.push(artifact);
    byId.set(key, current);
  }
  for (const duplicates of byId.values()) {
    if (duplicates.length < 2) continue;
    for (const artifact of duplicates) {
      findings.push(finding(
        "duplicate_artifact_id",
        artifact,
        `artifact id ${JSON.stringify(artifact.id)} resolves from ${duplicates.length} artifacts`,
        duplicates.filter((item) => item !== artifact).map((item) => item.path)
      ));
    }
  }
  for (const artifact of artifacts) {
    if (!artifact.structured || artifact.acceptance || artifact.nonArtifact) continue;
    if (artifact.childRelationshipRole !== "child_parentage" || !LEAF_ARTIFACT_TYPES.has(artifact.type) || artifact.tableChildren.length === 0) continue;
    findings.push(finding(
      "planning_relationship_conflict",
      artifact,
      `leaf ${artifact.type} artifact declares ${artifact.tableChildren.length} child projection${artifact.tableChildren.length === 1 ? "" : "s"}`,
      artifact.tableChildren.map((child) => child.ref)
    ));
  }
  const childrenByParent = /* @__PURE__ */ new Map();
  const explicitParents = /* @__PURE__ */ new Map();
  const archiveBoundaryEdges = /* @__PURE__ */ new Set();
  const archiveCompatible = (parent, child, ref) => {
    const parentArchived = parent.state === "archived";
    const childArchived = child.state === "archived";
    if (parentArchived === childArchived) return true;
    const key = `${parent.path}\0${child.path}`;
    if (!archiveBoundaryEdges.has(key)) {
      archiveBoundaryEdges.add(key);
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `partial archive graph: child is ${childArchived ? "archived" : "live"} but parent ${JSON.stringify(parent.id)} is ${parentArchived ? "archived" : "live"}`,
        [parent.path, ref]
      ));
    }
    return false;
  };
  for (const child of artifacts) {
    if (!child.structured || child.acceptance || child.nonArtifact) continue;
    const resolved = /* @__PURE__ */ new Set();
    for (const observation of child.parentReferences) {
      const parentId = observation.id;
      const matches = (byId.get(normalizedId(parentId)) ?? []).filter((item) => !item.acceptance && !item.nonArtifact);
      if (matches.length === 0) {
        findings.push(finding(
          "orphan_parent_reference",
          child,
          `declared parent ${JSON.stringify(parentId)} does not resolve to an artifact`
        ));
        continue;
      }
      if (matches.length > 1) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `declared parent ${JSON.stringify(parentId)} resolves ambiguously to ${matches.length} artifacts`,
          matches.map((item) => item.path)
        ));
        continue;
      }
      const parent = matches[0];
      if (!parent) continue;
      if (observation.state !== "unknown" && parent.state !== "unknown" && !sameProjection(observation.state, parent.state)) {
        findings.push(finding(
          "parent_child_projection_conflict",
          child,
          `declared parent ${JSON.stringify(parent.id)} is ${parent.state} but the parent reference projects ${observation.state}`,
          [parent.path, observation.ref]
        ));
      }
      if (!archiveCompatible(parent, child, observation.ref)) continue;
      resolved.add(parent);
      addRelationship(childrenByParent, parent, child);
    }
    explicitParents.set(child, resolved);
    if (child.topLevel && child.parentReferences.length > 0) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        "top-level artifact also declares parentage",
        child.parentReferences.map((reference) => reference.ref)
      ));
    }
    if (resolved.size > 1) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `child resolves to ${resolved.size} distinct explicit parents`,
        [...resolved].map((item) => item.path)
      ));
    }
  }
  const reaches = (ancestor, descendant) => {
    const pending = [ancestor];
    const seen = /* @__PURE__ */ new Set();
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || seen.has(current)) continue;
      if (current === descendant) return true;
      seen.add(current);
      pending.push(...childrenByParent.get(current) ?? []);
    }
    return false;
  };
  const formsScopeChain = (parents) => parents.every((left, index) => parents.slice(index + 1).every((right) => reaches(left, right) || reaches(right, left)));
  for (const gate of artifacts) {
    if (!gate.structured || !gate.acceptance || gate.nonArtifact) continue;
    if (gate.parentIds.length === 0) {
      if (gate.type === "review" && topEntries(gate.metadata, ["reviews"]).length > 0) continue;
      findings.push(finding(
        "planning_relationship_unresolved",
        gate,
        "acceptance artifact is not paired to a parent"
      ));
      continue;
    }
    const matchedParents = /* @__PURE__ */ new Map();
    for (const observation of gate.parentReferences) {
      const matches = (byId.get(normalizedId(observation.id)) ?? []).filter((parent) => !parent.acceptance && !parent.nonArtifact);
      if (matches.length > 1) {
        findings.push(finding(
          "planning_relationship_conflict",
          gate,
          `acceptance parent ${JSON.stringify(observation.id)} resolves ambiguously to ${matches.length} artifacts`,
          matches.map((parent) => parent.path)
        ));
      }
      for (const parent of matches) {
        matchedParents.set(parent.path, parent);
        if (observation.state !== "unknown" && parent.state !== "unknown" && !sameProjection(observation.state, parent.state)) {
          findings.push(finding(
            "parent_child_projection_conflict",
            gate,
            `declared parent ${JSON.stringify(parent.id)} is ${parent.state} but the acceptance reference projects ${observation.state}`,
            [parent.path, observation.ref]
          ));
        }
      }
    }
    const eligibleParents = [...matchedParents.values()].filter((parent) => gate.state === "archived" || archiveCompatible(parent, gate, `${gate.path}#parent`)).sort((left, right) => left.path.localeCompare(right.path));
    if (matchedParents.size === 0) {
      findings.push(finding(
        "orphan_parent_reference",
        gate,
        `acceptance parent references do not resolve: ${gate.parentIds.map((id) => JSON.stringify(id)).join(", ")}`
      ));
    } else if (eligibleParents.length === 0) {
      findings.push(finding(
        "planning_relationship_unresolved",
        gate,
        "live acceptance artifact resolves only to archived parents",
        [...matchedParents.keys()].sort()
      ));
    } else if (eligibleParents.length > 1 && !formsScopeChain(eligibleParents)) {
      findings.push(finding(
        "planning_relationship_conflict",
        gate,
        `acceptance artifact resolves to ${eligibleParents.length} unrelated parent scopes`,
        eligibleParents.map((parent) => parent.path)
      ));
    }
  }
  for (const parent of artifacts) {
    if (!parent.structured || parent.acceptance || parent.nonArtifact) continue;
    for (const tableChild of parent.tableChildren) {
      const matches = (byId.get(normalizedId(tableChild.id)) ?? []).filter((item) => !item.acceptance && !item.nonArtifact);
      if (matches.length === 0) {
        findings.push(finding(
          "planning_relationship_unresolved",
          parent,
          `declared child ${JSON.stringify(tableChild.id)} does not resolve to an artifact`,
          [tableChild.ref]
        ));
        continue;
      }
      if (matches.length > 1) {
        findings.push(finding(
          "planning_relationship_conflict",
          parent,
          `declared child ${JSON.stringify(tableChild.id)} resolves ambiguously to ${matches.length} artifacts`,
          [tableChild.ref, ...matches.map((item) => item.path)]
        ));
        continue;
      }
      const child = matches[0];
      if (!child) continue;
      if (tableChild.state !== "unknown" && child.state !== "unknown" && !sameProjection(tableChild.state, child.state)) {
        findings.push(finding(
          "parent_child_projection_conflict",
          parent,
          `${child.id} is ${child.state} but the ${parent.childRelationshipRole === "rollup_projection" ? "rollup" : "parent"} projects ${tableChild.state}`,
          [child.path, tableChild.ref]
        ));
      }
      if (parent.childRelationshipRole === "rollup_projection") continue;
      if (!archiveCompatible(parent, child, tableChild.ref)) continue;
      if (child.topLevel) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `top-level artifact is projected as a child of ${JSON.stringify(parent.id)}`,
          [parent.path, tableChild.ref]
        ));
      }
      const parents = explicitParents.get(child) ?? /* @__PURE__ */ new Set();
      if (parents.size > 0 && !parents.has(parent)) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `${parent.id} projects this child but its explicit parent resolves elsewhere`,
          [parent.path, tableChild.ref, ...[...parents].map((item) => item.path)]
        ));
      }
      addRelationship(childrenByParent, parent, child);
    }
  }
  for (const cycle of relationshipCycles(childrenByParent)) {
    for (const member of cycle) {
      findings.push(finding(
        "planning_relationship_conflict",
        member,
        `planning relationship cycle contains ${cycle.length} artifact${cycle.length === 1 ? "" : "s"}`,
        cycle.filter((artifact) => artifact !== member).map((artifact) => artifact.path)
      ));
    }
  }
  for (const child of artifacts) {
    if (!child.structured || child.acceptance || child.nonArtifact || child.topLevel) continue;
    if (!LEAF_ARTIFACT_TYPES.has(child.type)) continue;
    const parents = [...childrenByParent.entries()].filter(([, children]) => children.has(child)).map(([parent]) => parent);
    if (parents.length === 0) {
      findings.push(finding(
        "planning_relationship_unresolved",
        child,
        "leaf planning artifact is not paired to exactly one parent; declare parent_id, place it in an exact parent child table, or mark top_level: true",
        child.parentIds
      ));
    } else if (parents.length > 1) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `leaf planning artifact resolves to ${parents.length} parents`,
        parents.map((parent) => parent.path)
      ));
    }
  }
  for (const parent of artifacts) {
    if (!parent.structured || parent.acceptance || parent.state === "archived" || parent.nonArtifact) continue;
    const children = [...childrenByParent.get(parent) ?? []].sort((left, right) => left.path.localeCompare(right.path));
    const started = children.filter((child) => (/* @__PURE__ */ new Set(["active", "done"])).has(child.state));
    const unfinished = children.filter((child) => child.state !== "done");
    if (parent.state === "done" && unfinished.length > 0) {
      findings.push(finding(
        "parent_child_projection_conflict",
        parent,
        `parent is done while ${unfinished.length}/${children.length} direct children are not done`,
        unfinished.map((child) => child.path)
      ));
    }
    if (parent.declared === "preexecution" && started.length > 0) {
      findings.push(finding(
        "preexecution_parent_has_started_children",
        parent,
        `parent is preexecution while ${started.length}/${children.length} direct children have started`,
        started.map((child) => child.path)
      ));
    }
    const gates = acceptanceGates(parent, artifacts);
    for (const gate of gates) {
      if (gate.states.length > 1) {
        findings.push(finding(
          "acceptance_gate_identity_conflict",
          parent,
          `${gate.kind} gate has conflicting projections: ${gate.states.join(", ")}`,
          gate.refs
        ));
      }
      if (gate.state === "unknown") {
        findings.push(finding(
          "acceptance_gate_unknown",
          parent,
          gate.states.includes("not_applicable") ? `${gate.kind} gate claims not_applicable without a structured rationale` : `${gate.kind} gate state is missing or outside the recognized vocabulary`,
          gate.refs
        ));
      }
    }
    const allChildrenDone = children.length > 0 && children.every((child) => child.state === "done");
    if (allChildrenDone && gates.length === 0) {
      findings.push(finding(
        "acceptance_gate_undiscovered",
        parent,
        `all ${children.length} direct children are done but no acceptance gate can be identified`,
        children.map((child) => child.path)
      ));
    }
    const unrun = gates.filter((gate) => gate.state === "unrun");
    const failed = gates.filter((gate) => gate.state === "failed");
    const partial = gates.filter((gate) => gate.state === "partial");
    if (allChildrenDone && unrun.length > 0) {
      findings.push(finding(
        "acceptance_cascade_unexecuted",
        parent,
        `all ${children.length} direct children are done but ${unrun.length}/${gates.length} acceptance gates are unexecuted`,
        unrun.flatMap((gate) => gate.refs)
      ));
    }
    if (failed.length > 0) {
      findings.push(finding(
        "acceptance_failure_unpaid",
        parent,
        `${failed.length}/${gates.length} acceptance gates record failure`,
        failed.flatMap((gate) => gate.refs)
      ));
    }
    if (partial.length > 0) {
      findings.push(finding(
        "acceptance_partial_unpaid",
        parent,
        `${partial.length}/${gates.length} acceptance gates are PARTIAL with named operate-time work remaining`,
        partial.flatMap((gate) => gate.refs)
      ));
    }
    if (!allChildrenDone && parent.state === "done" && unrun.length > 0) {
      findings.push(finding(
        "completed_parent_unexecuted_acceptance",
        parent,
        `completed parent has ${unrun.length}/${gates.length} unexecuted acceptance gates`,
        unrun.flatMap((gate) => gate.refs)
      ));
    }
    if (allChildrenDone && gates.length > 0 && gates.every((gate) => (/* @__PURE__ */ new Set(["not_applicable", "passed"])).has(gate.state)) && parent.declared !== "done") {
      findings.push(finding(
        "parent_completion_stale",
        parent,
        `all ${children.length} direct children and all ${gates.length} acceptance gates are complete but the parent is ${parent.declared}`,
        gates.flatMap((gate) => gate.refs)
      ));
    }
  }
  const ordered = findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path) || left.detail.localeCompare(right.detail));
  const counts = Object.fromEntries(
    FINDING_CODES.map((code) => [code, ordered.filter((item) => item.code === code).length])
  );
  const accounting = causalPlanningAccounting(ordered, options.snapshot ?? "unbound");
  const status = planningRootCount === 0 ? "not_applicable" : ordered.length > 0 ? "fail" : "pass";
  return {
    artifactCount: artifacts.length,
    candidate_probe_count: 0,
    counts,
    exitCode: ordered.length > 0 ? 1 : 0,
    findings: ordered,
    planningRootCount,
    raw_finding_count: accounting.rawFindings.length,
    raw_findings: accounting.rawFindings,
    root_debt_count: accounting.rootDebts.length,
    root_debts: accounting.rootDebts,
    status,
    structuredArtifactCount: artifacts.filter((artifact) => artifact.structured).length,
    suppressed_by_typed_nonartifact_count: artifacts.filter((artifact) => artifact.nonArtifact).length
  };
}
function auditPlanningRepository(repository) {
  const root = resolve2(repository);
  assertDirectory(root);
  const planningRoots = discoverPlanningRoots(root);
  const sources = [];
  const appendEntry = (entry) => {
    const relativePath = relative2(root, entry.path).split(sep2).join("/");
    if (entry.kind === "file" && basename2(entry.path) === ".gitkeep" && lstatSync2(entry.path).size === 0) return;
    if (entry.kind !== "file" || !isPlanningTextPath(entry.path)) {
      sources.push({ content: "", path: relativePath });
      return;
    }
    let content = "";
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync2(entry.path));
    } catch {
      sources.push({ content: "", path: relativePath });
      return;
    }
    sources.push({ content: content.includes("\0") ? "" : content, path: relativePath });
  };
  for (const rootText of planningRoots) {
    const rootPath = resolve2(root, rootText);
    const rootStat = lstatSync2(rootPath);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      appendEntry({ kind: rootStat.isFile() ? "file" : rootStat.isSymbolicLink() ? "symlink" : "other", path: rootPath });
      continue;
    }
    for (const entry of listEntriesRecursively(rootPath)) appendEntry(entry);
  }
  let snapshot = "unbound";
  try {
    snapshot = git(root, "rev-parse", "HEAD");
  } catch {
    snapshot = "unbound";
  }
  return auditPlanningArtifacts(sources, planningRoots.length, { repository: root, snapshot });
}

// src/closeout/bundle.ts
var execFileAsync = promisify(execFile);
var HEX64 = /^[0-9a-f]{64}$/;
var PLANNING_NAMES = /* @__PURE__ */ new Set([
  "planning",
  "plans",
  "roadmap",
  "project-management",
  "work-items",
  "work_items",
  "tasks",
  "stories",
  "epics",
  "slices",
  "issues"
]);
var PLANNING_KINDS = /* @__PURE__ */ new Set(["repo_files", "external_snapshot", "none"]);
var GATE_KINDS = /* @__PURE__ */ new Set([
  "isolated_clone",
  "repository_tests",
  "lint",
  "typecheck",
  "build",
  "planning_validation",
  "security_scan",
  "established_ci",
  "negative_control"
]);
var IGNORED_WALK = /* @__PURE__ */ new Set([".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", ".cache"]);
var LOCAL_ACTION_KINDS = /* @__PURE__ */ new Set([
  "local_edit",
  "local_move",
  "recoverable_delete",
  "doc_update",
  "planning_record_update",
  "historical_conform",
  "handoff_update"
]);
var EXTERNAL_CLAIMS = /* @__PURE__ */ new Set(["ci_green_on_push", "deployed", "independently_qa_accepted"]);
function object3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function array2(value) {
  return Array.isArray(value) ? value : [];
}
function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function identity(value) {
  return canonicalIdentity(value);
}
function owned(value) {
  const normalized = identity(value);
  return normalized.length > 0 && !(/* @__PURE__ */ new Set([
    "unknown",
    "unowned",
    "unassigned",
    "none",
    "n/a",
    "na",
    "tbd",
    "not assigned",
    "not-assigned"
  ])).has(normalized);
}
function iso(value) {
  return isoTimestamp(value);
}
function executedText(value) {
  if (!text(value)) return false;
  return !(/* @__PURE__ */ new Set(["not run", "not executed", "not measured", "claim", "anything", "pass"])).has(value.trim().split(/\s+/).join(" ").toLocaleLowerCase("und"));
}
function posix(path) {
  return path.split(sep3).join("/");
}
function compareCodePoints2(left, right) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
function sha2562(bytes) {
  return createHash3("sha256").update(bytes).digest("hex");
}
function stableEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => stableEqual(value, right[index]));
  }
  const leftObject = object3(left);
  const rightObject = object3(right);
  if (!leftObject || !rightObject) return false;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  return stableEqual(leftKeys, rightKeys) && leftKeys.every((key) => stableEqual(leftObject[key], rightObject[key]));
}
function requireObject(value, keys, path, errors) {
  const item = object3(value);
  if (!item) {
    errors.push(`${path}: expected object`);
    return void 0;
  }
  for (const key of [...keys].sort()) if (!(key in item)) errors.push(`${path}.${key}: missing`);
  return item;
}
var nodeFilePort = {
  async readBytes(path) {
    return new Uint8Array(await readFile(path));
  },
  async readText(path) {
    return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  },
  async exists(path) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  async isFile(path) {
    try {
      return (await lstat(path)).isFile();
    } catch {
      return false;
    }
  },
  async realpath(path) {
    return realpath(path);
  },
  async walk(root) {
    const rootPath = resolve3(root);
    const rows = [];
    async function visit(directory) {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_WALK.has(entry.name)) continue;
        const absolute = resolve3(directory, entry.name);
        const rel = posix(relative3(rootPath, absolute));
        if (entry.isSymbolicLink()) rows.push({ absolute, relative: rel, kind: "symlink" });
        else if (entry.isDirectory()) {
          rows.push({ absolute, relative: rel, kind: "directory" });
          await visit(absolute);
        } else if (entry.isFile()) rows.push({ absolute, relative: rel, kind: "file" });
      }
    }
    await visit(rootPath);
    return rows.sort((a, b) => compareCodePoints2(a.relative, b.relative));
  }
};
var nodeGitPort = {
  async run(repo, args, allowed = [0]) {
    try {
      const result = await execFileAsync("git", ["-C", repo, ...args], { encoding: "utf8" });
      return { code: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
    } catch (error) {
      const failure = error;
      const result = {
        code: typeof failure.code === "number" ? failure.code : 128,
        stdout: (failure.stdout ?? "").trim(),
        stderr: (failure.stderr ?? failure.message ?? "").trim()
      };
      if (!allowed.includes(result.code)) throw new Error(result.stderr || `git ${args.join(" ")} exited ${result.code}`);
      return result;
    }
  }
};
var nodeBundlePorts = { files: nodeFilePort, git: nodeGitPort };
async function contained(files, root, candidate) {
  if (!text(candidate) || isAbsolute2(candidate)) return void 0;
  const lexical = resolve3(root, candidate);
  const rel = relative3(resolve3(root), lexical);
  if (rel === ".." || rel.startsWith(`..${sep3}`) || isAbsolute2(rel)) return void 0;
  try {
    const rootReal = await files.realpath(root);
    let existing = lexical;
    const tail = [];
    while (!await files.exists(existing) && dirname3(existing) !== existing) {
      tail.unshift(basename3(existing));
      existing = dirname3(existing);
    }
    const targetReal = resolve3(await files.realpath(existing), ...tail);
    const realRel = relative3(rootReal, targetReal);
    if (realRel === ".." || realRel.startsWith(`..${sep3}`) || isAbsolute2(realRel)) return void 0;
    return targetReal;
  } catch {
    return lexical;
  }
}
async function loadBytesRef(files, base, value, path, errors, allowPlaceholders) {
  const ref = requireObject(value, ["path", "sha256"], path, errors);
  if (!ref) return {};
  if (allowPlaceholders && [ref.path, ref.sha256].some((entry) => typeof entry === "string" && entry.includes("<"))) return {};
  const target = await contained(files, base, ref.path);
  if (!target) {
    errors.push(`${path}.path: must resolve inside the bundle directory`);
    return {};
  }
  if (!await files.isFile(target)) {
    errors.push(`${path}.path: file not found or not a regular file: ${target}`);
    return { file: target };
  }
  const bytes = await files.readBytes(target);
  const digest = sha2562(bytes);
  if (!allowPlaceholders) {
    if (typeof ref.sha256 !== "string" || !HEX64.test(ref.sha256)) errors.push(`${path}.sha256: required lowercase SHA-256`);
    else if (digest !== ref.sha256) errors.push(`${path}.sha256: digest mismatch`);
  }
  return { bytes, digest, file: target };
}
async function loadRef(files, base, value, path, errors, allowPlaceholders) {
  const loaded = await loadBytesRef(files, base, value, path, errors, allowPlaceholders);
  const fileResult = loaded.file === void 0 ? {} : { file: loaded.file };
  if (!loaded.bytes) return fileResult;
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(loaded.bytes));
    if (!object3(parsed)) errors.push(`${path}.path: expected JSON object`);
    const data = object3(parsed);
    return data ? { ...fileResult, data } : fileResult;
  } catch (error) {
    errors.push(`${path}.path: ${error instanceof Error ? error.message : String(error)}`);
    return fileResult;
  }
}
async function evidenceRef(files, base, ref, path, errors, allowPlaceholders, recordType) {
  const loaded = await loadRef(files, base, ref, path, errors, allowPlaceholders);
  if (loaded.data && recordType && loaded.data.record_type !== recordType) {
    errors.push(`${path}: expected evidence record_type ${recordType}`);
  }
  return loaded.data;
}
async function repositoryIdentity2(repo, git2) {
  const remote = (await git2.run(repo, ["config", "--get", "remote.origin.url"], [0, 1])).stdout;
  if (remote && !remote.startsWith("/") && !remote.startsWith("file://")) {
    const path = remote.includes("://") ? new URL(remote).pathname.replace(/^\/+|\/+$/g, "") : remote.split(":", 2).at(-1) ?? "";
    const normalized = path.replace(/\.git$/, "").replace(/\/+$/, "");
    if (normalized.includes("/")) return normalized;
  }
  return basename3(repo);
}
async function discoverPlanningRoots2(repo, files) {
  const rows = await files.walk(repo);
  const directories = rows.filter((row) => row.kind === "directory");
  const childrenByDirectory = /* @__PURE__ */ new Map();
  for (const row of directories) {
    const parent = dirname3(row.relative);
    const children = childrenByDirectory.get(parent) ?? /* @__PURE__ */ new Set();
    children.add(basename3(row.relative).toLocaleLowerCase("und"));
    childrenByDirectory.set(parent, children);
  }
  const candidates = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (row.kind !== "directory" && isCanonicalPlanningFileName(row.relative)) {
      candidates.add(row.relative);
    }
  }
  for (const row of directories) {
    const parts = row.relative.split("/");
    if (PLANNING_NAMES.has(parts.at(-1)?.toLocaleLowerCase("und") ?? "")) candidates.add(row.relative);
    const children = childrenByDirectory.get(row.relative) ?? /* @__PURE__ */ new Set();
    if ([...children].filter((name) => PLANNING_LANE_NAMES.has(name)).length >= 2) candidates.add(row.relative);
  }
  const minimal = [...candidates].sort((a, b) => a.split("/").length - b.split("/").length || compareCodePoints2(a, b));
  return new Set(minimal.filter((candidate, index) => !minimal.slice(0, index).some((parent) => candidate === parent || candidate.startsWith(`${parent}/`))));
}
async function validateCriteria(bundle, report, base, files, clean, allowPlaceholders, errors) {
  const path = "$.criteria_discovery";
  const proof = requireObject(
    bundle.criteria_discovery,
    ["source_kind", "request_source", "source_refs", "request_sha256", "discovered_count", "none_found", "criteria_ids"],
    path,
    errors
  );
  if (!proof) return;
  if (!(/* @__PURE__ */ new Set(["exact_bytes", "reference_only"])).has(String(proof.source_kind))) errors.push(`${path}.source_kind: expected exact_bytes or reference_only`);
  if (clean && proof.source_kind !== "exact_bytes") errors.push(`${path}.source_kind: CLEAN requires exact operative request bytes`);
  if (proof.source_kind === "exact_bytes") {
    const ref = requireObject(proof.request_source, ["path", "sha256"], `${path}.request_source`, errors);
    if (ref && !(allowPlaceholders && String(ref.path).includes("<"))) {
      const request = await contained(files, base, ref.path);
      if (!request || !await files.isFile(request)) errors.push(`${path}.request_source.path: file not found, not a regular file, or outside bundle directory`);
      else {
        const digest = sha2562(await files.readBytes(request));
        if (digest !== ref.sha256) errors.push(`${path}.request_source.sha256: digest mismatch`);
        if (digest !== proof.request_sha256) errors.push(`${path}.request_source: exact request bytes do not match request_sha256`);
      }
    }
  } else if (proof.request_source !== null) errors.push(`${path}.request_source: reference_only requires null`);
  if (!Array.isArray(proof.criteria_ids) || !array2(proof.criteria_ids).every(text)) errors.push(`${path}.criteria_ids: required string array`);
  if (!Number.isInteger(proof.discovered_count) || Number(proof.discovered_count) < 0) errors.push(`${path}.discovered_count: required nonnegative integer`);
  if (typeof proof.none_found !== "boolean") errors.push(`${path}.none_found: required boolean`);
  const ids = array2(proof.criteria_ids).filter(text);
  const refs = array2(proof.source_refs);
  if (refs.length === 0) errors.push(`${path}.source_refs: required nonempty digest-bound evidence array`);
  if (!allowPlaceholders && (typeof proof.request_sha256 !== "string" || !HEX64.test(proof.request_sha256))) errors.push(`${path}.request_sha256: required lowercase SHA-256`);
  if (proof.discovered_count !== ids.length) errors.push(`${path}: discovered_count (${String(proof.discovered_count)}) != criteria_ids (${ids.length})`);
  if (proof.none_found !== (ids.length === 0)) errors.push(`${path}.none_found: must be true exactly when discovered_count is zero`);
  const reportIds = array2(report.acceptance_criteria).map((item) => object3(item)?.id).filter(text).sort();
  if (!stableEqual([...ids].sort(), reportIds)) errors.push(`${path}.criteria_ids: must equal report acceptance_criteria ids`);
  const records = await Promise.all(refs.map((ref, index) => evidenceRef(files, base, ref, `${path}.source_refs[${index}]`, errors, allowPlaceholders, "mister-clean.criteria-source")));
  for (const [index, record] of records.entries()) if (record && (!Array.isArray(record.criteria_ids) || !array2(record.criteria_ids).every(text))) {
    errors.push(`${path}.source_refs[${index}]: criteria-source record requires criteria_ids string array`);
  }
  if (!allowPlaceholders && !records.some((record) => record !== void 0 && record.request_ref === bundle.request_ref && record.request_sha256 === proof.request_sha256 && stableEqual([...array2(record.criteria_ids)].sort(), [...ids].sort()))) {
    errors.push(`${path}.source_refs: no bound source record matches request_ref, request_sha256, and criteria_ids`);
  }
}
async function validatePlanning(bundle, repo, files, clean, allowPlaceholders, errors) {
  const path = "$.planning_discovery";
  const planning = requireObject(bundle.planning_discovery, ["unknown", "systems"], path, errors);
  if (!planning) return;
  if (clean && planning.unknown !== false) errors.push(`${path}.unknown: CLEAN requires false`);
  const systems = array2(planning.systems);
  if (systems.length === 0) {
    errors.push(`${path}.systems: required nonempty array`);
    return;
  }
  const discovered = repo ? await discoverPlanningRoots2(repo, files) : /* @__PURE__ */ new Set();
  const declared = /* @__PURE__ */ new Set();
  const none = systems.filter((item) => object3(item)?.kind === "none");
  if (none.length && systems.length !== 1) errors.push(`${path}.systems: kind=none is only valid as the sole discovered planning system`);
  if (repo && none.length && discovered.size) errors.push(`${path}.systems: kind=none contradicts live planning candidates ${JSON.stringify([...discovered].sort())}`);
  const systemIds = /* @__PURE__ */ new Set();
  const globalArtifacts = /* @__PURE__ */ new Set();
  const planningSourcePaths = /* @__PURE__ */ new Set();
  const planningSources = [];
  for (const [index, raw] of systems.entries()) {
    const spath = `${path}.systems[${index}]`;
    const system = requireObject(raw, ["id", "kind", "sources", "schema_sources", "validators", "corpus"], spath, errors);
    if (!system) continue;
    if (!text(system.id)) errors.push(`${spath}.id: required`);
    else if (systemIds.has(system.id)) errors.push(`${spath}.id: duplicate ${JSON.stringify(system.id)}`);
    else systemIds.add(system.id);
    if (!PLANNING_KINDS.has(String(system.kind))) errors.push(`${spath}.kind: expected one of ${JSON.stringify([...PLANNING_KINDS].sort())}`);
    for (const field of ["sources", "schema_sources", "validators"]) {
      if (!Array.isArray(system[field]) || array2(system[field]).length === 0 || !array2(system[field]).every(text)) {
        errors.push(`${spath}.${field}: required nonempty string array`);
      }
    }
    const corpus = requireObject(system.corpus, ["roots", "include_globs", "total", "classified", "unclassified", "artifacts"], `${spath}.corpus`, errors);
    if (!corpus) continue;
    if (!Array.isArray(corpus.roots) || !array2(corpus.roots).every(text)) errors.push(`${spath}.corpus.roots: required string array`);
    if (!Array.isArray(corpus.include_globs) || !array2(corpus.include_globs).every(text)) errors.push(`${spath}.corpus.include_globs: required string array`);
    if (!Array.isArray(corpus.artifacts)) errors.push(`${spath}.corpus.artifacts: required array`);
    const roots = array2(corpus.roots).filter(text);
    const includeGlobs = array2(corpus.include_globs).filter(text);
    const artifacts = array2(corpus.artifacts);
    if (system.kind === "repo_files" && roots.length === 0) errors.push(`${spath}.corpus.roots: repo_files requires at least one repository root`);
    if (system.kind === "repo_files" && includeGlobs.length === 0) errors.push(`${spath}.corpus.include_globs: repo_files requires at least one discovery glob`);
    if (system.kind === "none" && (roots.length || includeGlobs.length)) errors.push(`${spath}.corpus: kind=none requires empty roots and include_globs`);
    if (system.kind === "repo_files") roots.forEach((root) => declared.add(root.replace(/\/$/, "")));
    const seen = /* @__PURE__ */ new Set();
    let unclassified = 0;
    for (const [artifactIndex, rawArtifact] of artifacts.entries()) {
      const apath = `${spath}.corpus.artifacts[${artifactIndex}]`;
      const artifact = requireObject(rawArtifact, ["path", "class", "sha256"], apath, errors);
      if (!artifact) continue;
      if (!text(artifact.path) || seen.has(artifact.path)) errors.push(`${apath}.path: required unique repository-relative path`);
      else {
        seen.add(artifact.path);
        if (globalArtifacts.has(artifact.path)) errors.push(`${apath}.path: artifact appears in more than one planning system`);
        globalArtifacts.add(artifact.path);
      }
      if (!text(artifact.class)) {
        errors.push(`${apath}.class: required explicit class`);
        unclassified += 1;
      } else if ((/* @__PURE__ */ new Set(["not assessed", "not_assessed", "unclassified", "unknown"])).has(identity(artifact.class))) {
        unclassified += 1;
      }
      if (text(artifact.class) && isNonArtifactPlanningClass(artifact.class) && !text(artifact.classification_rationale)) {
        errors.push(`${apath}.classification_rationale: non-artifact class requires an explicit rationale`);
      }
      if (!allowPlaceholders && (typeof artifact.sha256 !== "string" || !HEX64.test(artifact.sha256))) errors.push(`${apath}.sha256: required lowercase SHA-256`);
      if (repo && system.kind === "repo_files" && text(artifact.path)) {
        const target = await contained(files, repo, artifact.path);
        if (!target || !await files.isFile(target)) errors.push(`${apath}.path: missing, not a regular file, or outside repository`);
        else if (typeof artifact.sha256 === "string" && HEX64.test(artifact.sha256) && sha2562(await files.readBytes(target)) !== artifact.sha256) errors.push(`${apath}.sha256: live digest mismatch`);
      }
    }
    if (corpus.total !== seen.size) errors.push(`${spath}.corpus.total (${String(corpus.total)}) != unique artifacts (${seen.size})`);
    if (corpus.classified !== seen.size - unclassified) errors.push(`${spath}.corpus.classified (${String(corpus.classified)}) != classified artifact rows (${seen.size - unclassified})`);
    if (corpus.unclassified !== unclassified) errors.push(`${spath}.corpus.unclassified (${String(corpus.unclassified)}) != unclassified artifact rows (${unclassified})`);
    if (clean && corpus.unclassified !== 0) errors.push(`${spath}.corpus.unclassified: CLEAN requires zero`);
    if (repo && system.kind === "repo_files") {
      const live = /* @__PURE__ */ new Set();
      const repositoryRoot = await files.realpath(repo);
      for (const root of roots) {
        const target = await contained(files, repo, root);
        if (!target || !await files.exists(target)) {
          errors.push(`${spath}.corpus.roots: missing or outside repository: ${JSON.stringify(root)}`);
          continue;
        }
        if (await files.isFile(target)) live.add(posix(relative3(repositoryRoot, target)));
        else (await files.walk(target)).filter((row) => row.kind !== "directory").forEach((row) => live.add(posix(relative3(repositoryRoot, row.absolute))));
      }
      if (!stableEqual([...live].sort(), [...seen].sort())) errors.push(`${spath}.corpus: live census mismatch missing_from_bundle=${JSON.stringify([...live].filter((item) => !seen.has(item)).sort())} absent_from_live=${JSON.stringify([...seen].filter((item) => !live.has(item)).sort())}`);
      if (clean) {
        for (const rawArtifact of artifacts) {
          const artifact = object3(rawArtifact);
          if (!artifact || !text(artifact.path)) continue;
          if (!isPlanningTextPath(artifact.path)) {
            if (!text(artifact.class) || !isNonArtifactPlanningClass(artifact.class) || !text(artifact.classification_rationale)) {
              errors.push(`${spath}.corpus: unsupported planning entry ${artifact.path} requires an explicit non-artifact class and classification_rationale`);
            }
            continue;
          }
          const target = await contained(files, repo, artifact.path);
          if (!target || !await files.exists(target)) continue;
          let content;
          try {
            content = await files.readText(target);
          } catch {
            errors.push(`${spath}.corpus: planning entry ${artifact.path} is not valid UTF-8 text`);
            continue;
          }
          if (content.includes("\0")) {
            errors.push(`${spath}.corpus: planning entry ${artifact.path} contains binary NUL bytes`);
            continue;
          }
          const earlyDone = /\b(implementation|dev|code)\b/i.test(content) && /\b(done|complete|completed|merged)\b/i.test(content);
          const laterUnrun = /\b(review|qa|acceptance|holdout)\b/i.test(content) && /\b(not[_ -]?run|pending|todo|backlog|unexecuted)\b/i.test(content);
          if (earlyDone && laterUnrun) errors.push(`${spath}.corpus: ${artifact.path} contains an executed-early/unexecuted-later procedure and cannot be CLEAN`);
          if (planningSourcePaths.has(artifact.path)) continue;
          planningSourcePaths.add(artifact.path);
          planningSources.push({
            ...text(artifact.classification_rationale) ? { classificationRationale: artifact.classification_rationale } : {},
            content,
            declaredClass: String(artifact.class),
            path: artifact.path
          });
        }
      }
    }
  }
  if (clean && repo) {
    const audit = auditPlanningArtifacts(planningSources, declared.size);
    for (const finding2 of audit.findings) {
      errors.push(`${path}.corpus: ${finding2.code} at ${finding2.path} (${finding2.subject}): ${finding2.detail}; related=${JSON.stringify(finding2.related)}`);
    }
  }
  if (repo) {
    const uncovered = [...discovered].filter((candidate) => ![...declared].some((root) => candidate === root || candidate.startsWith(`${root}/`))).sort();
    if (uncovered.length) errors.push(`${path}.systems: independently discovered planning roots are not fully covered: ${JSON.stringify(uncovered)}`);
  }
}
async function validateChangeInventory(bundle, report, manifest, repo, git2, base, files, clean, allowPlaceholders, errors) {
  const path = "$.change_inventory";
  const inventory = requireObject(bundle.change_inventory, ["start_commit", "subject_commit", "changes"], path, errors);
  if (!inventory) return;
  const subject = object3(report.repo)?.commit;
  if (!allowPlaceholders && inventory.subject_commit !== subject) errors.push(`${path}.subject_commit: must equal report repo.commit`);
  const startSnapshot = object3(object3(object3(bundle.successor_readiness)?.snapshots)?.start)?.object;
  if (!allowPlaceholders && inventory.start_commit !== startSnapshot) errors.push(`${path}.start_commit: must equal start snapshot object`);
  const actions = new Map(array2(manifest.actions).map((raw) => object3(raw)).filter(Boolean).map((item) => [String(item.id), item]));
  const reported = /* @__PURE__ */ new Map();
  if (!Array.isArray(inventory.changes)) {
    errors.push(`${path}.changes: required array`);
    return;
  }
  for (const [index, raw] of array2(inventory.changes).entries()) {
    const cpath = `${path}.changes[${index}]`;
    const change = requireObject(raw, ["status", "path", "action_ids", "exclusion"], cpath, errors);
    if (!change || !text(change.path)) continue;
    if (isAbsolute2(change.path) || change.path.split(/[\\/]/).includes("..") || reported.has(change.path)) errors.push(`${cpath}.path: required unique repository-relative path`);
    reported.set(change.path, String(change.status));
    if (!(/* @__PURE__ */ new Set(["A", "M", "D", "T"])).has(String(change.status))) errors.push(`${cpath}.status: expected A, M, D, or T`);
    if (!Array.isArray(change.action_ids) || !array2(change.action_ids).every(text)) errors.push(`${cpath}.action_ids: required string array`);
    const ids = array2(change.action_ids).filter(text);
    for (const id of ids) {
      const action = actions.get(String(id));
      if (!action) errors.push(`${cpath}.action_ids: unknown action ${JSON.stringify(id)}`);
      else {
        const target = String(action.target ?? "");
        if (![change.path, ".", "repository"].includes(target) && !change.path.startsWith(`${target.replace(/\/$/, "")}/`)) errors.push(`${cpath}.action_ids: action ${JSON.stringify(id)} target does not cover ${change.path}`);
      }
    }
    if (clean && ids.length === 0) errors.push(`${cpath}: CLEAN requires an executed action mapping`);
    if (change.exclusion !== null) {
      const record = await evidenceRef(files, base, change.exclusion, `${cpath}.exclusion`, errors, allowPlaceholders, "mister-clean.change-exclusion");
      if (record && !allowPlaceholders) {
        const expected = {
          path: change.path,
          status: change.status,
          start_commit: inventory.start_commit,
          subject_commit: subject,
          request_sha256: object3(bundle.criteria_discovery)?.request_sha256
        };
        for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${cpath}.exclusion: bound exclusion disagrees on ${key}`);
        for (const key of ["actor", "scope", "rationale"]) if (!text(record[key])) errors.push(`${cpath}.exclusion: requires ${key}`);
      }
    }
  }
  if (repo && text(inventory.start_commit) && text(subject)) {
    const output = (await git2.run(repo, ["diff", "--name-status", "--no-renames", inventory.start_commit, subject])).stdout;
    const live = new Map(output.split("\n").filter(Boolean).map((line) => {
      const [status = "", path2 = ""] = line.split("	", 2);
      return [path2, status];
    }));
    if (!stableEqual([...live.entries()].sort(), [...reported.entries()].sort())) errors.push(`${path}.changes: live start-to-subject diff differs`);
  }
}
async function validateRegressionDelta(bundle, report, manifest, base, files, clean, allowPlaceholders, errors) {
  const path = "$.report.regression_control";
  const control = requireObject(report.regression_control, [
    "policy",
    "baseline_object",
    "closing_object",
    ...REGRESSION_COUNT_FIELDS,
    "evidence_ref"
  ], path, errors);
  if (!control) return;
  const record = await evidenceRef(
    files,
    base,
    control.evidence_ref,
    `${path}.evidence_ref`,
    errors,
    allowPlaceholders,
    "mister-clean.regression-delta"
  );
  if (!record) return;
  const recordPath = `${path}.evidence_ref`;
  requireObject(record, [
    "record_type",
    "schema_version",
    "policy",
    "baseline_object",
    "closing_object",
    ...REGRESSION_COUNT_FIELDS.filter((field) => field !== "action_checks"),
    "action_checks"
  ], recordPath, errors);
  if (record.schema_version !== "1.2") errors.push(`${recordPath}.schema_version: expected 1.2`);
  if (record.policy !== REGRESSION_POLICY) {
    errors.push(`${recordPath}.policy: expected ${REGRESSION_POLICY}`);
  }
  for (const field of ["policy", "baseline_object", "closing_object", ...REGRESSION_COUNT_FIELDS]) {
    const recordValue = field === "action_checks" ? array2(record.action_checks).length : record[field];
    if (control[field] !== recordValue) errors.push(`${recordPath}: bound regression record disagrees on ${field}`);
  }
  const snapshots = object3(object3(bundle.successor_readiness)?.snapshots);
  const startObject = object3(snapshots?.start)?.object;
  const endObject = object3(snapshots?.end)?.object;
  const closingObject = object3(report.repo)?.commit;
  if (record.baseline_object !== startObject) errors.push(`${recordPath}.baseline_object: must equal successor start snapshot`);
  if (record.closing_object !== endObject || record.closing_object !== closingObject) {
    errors.push(`${recordPath}.closing_object: must equal successor end snapshot and report repo.commit`);
  }
  for (const field of REGRESSION_COUNT_FIELDS.filter((name) => name !== "action_checks")) {
    if (!Number.isInteger(record[field]) || Number(record[field]) < 0) {
      errors.push(`${recordPath}.${field}: required nonnegative integer`);
    }
  }
  const countsValid = REGRESSION_COUNT_FIELDS.filter((field) => field !== "action_checks").every((field) => Number.isInteger(record[field]) && Number(record[field]) >= 0);
  if (countsValid) {
    const baselineExpected = Number(record.baseline_paid) + Number(record.baseline_open);
    if (record.baseline_findings !== baselineExpected) {
      errors.push(`${recordPath}.baseline_findings: must equal baseline_paid + baseline_open (${baselineExpected})`);
    }
    const closingExpected = Number(record.baseline_open) + Number(record.newly_discovered_preexisting_open) + Number(record.concurrent_external_open) + Number(record.introduced_by_run_open);
    if (record.closing_findings !== closingExpected) {
      errors.push(`${recordPath}.closing_findings: must equal all open origin buckets (${closingExpected})`);
    }
  }
  if (!Array.isArray(record.action_checks)) errors.push(`${recordPath}.action_checks: required array`);
  const checks = array2(record.action_checks);
  const manifestActions = array2(manifest.actions).map(object3).filter((item) => !!item);
  const expectedActionIds = manifestActions.filter((action) => manifest.execution_state === "executed" || action.status === "executed" || action.status === "failed").map((action) => action.id);
  const checkedActionIds = [];
  let introducedPaid = 0;
  let introducedOpen = 0;
  const interruptedAt = [];
  for (const [index, raw] of checks.entries()) {
    const checkPath = `${recordPath}.action_checks[${index}]`;
    const check = requireObject(raw, [
      "action_id",
      "before_object",
      "after_object",
      "comparators",
      "introduced",
      "paid_before_boundary",
      "open_at_boundary",
      "boundary_status",
      "observed_at"
    ], checkPath, errors);
    if (!check) continue;
    checkedActionIds.push(check.action_id);
    for (const field of ["action_id", "before_object", "after_object"]) {
      if (!text(check[field])) errors.push(`${checkPath}.${field}: required`);
    }
    if (!iso(check.observed_at)) errors.push(`${checkPath}.observed_at: required ISO-8601 timestamp`);
    for (const field of ["introduced", "paid_before_boundary", "open_at_boundary"]) {
      if (!Number.isInteger(check[field]) || Number(check[field]) < 0) errors.push(`${checkPath}.${field}: required nonnegative integer`);
    }
    if (Number.isInteger(check.introduced) && Number.isInteger(check.paid_before_boundary) && Number.isInteger(check.open_at_boundary)) {
      const accounted = Number(check.paid_before_boundary) + Number(check.open_at_boundary);
      if (check.introduced !== accounted) errors.push(`${checkPath}.introduced: must equal paid_before_boundary + open_at_boundary (${accounted})`);
    }
    if (!Array.isArray(check.comparators) || array2(check.comparators).length === 0) {
      errors.push(`${checkPath}.comparators: required nonempty array`);
    }
    const derivedIntroduced = /* @__PURE__ */ new Set();
    const derivedPaid = /* @__PURE__ */ new Set();
    const derivedOpen = /* @__PURE__ */ new Set();
    const comparatorIds = /* @__PURE__ */ new Set();
    for (const [comparatorIndex, rawComparator] of array2(check.comparators).entries()) {
      const comparatorPath = `${checkPath}.comparators[${comparatorIndex}]`;
      const comparator = requireObject(rawComparator, [
        "id",
        "command",
        "scope",
        "detector",
        "observations"
      ], comparatorPath, errors);
      if (!comparator) continue;
      for (const field of ["id", "command", "scope", "detector"]) {
        if (!text(comparator[field])) errors.push(`${comparatorPath}.${field}: required`);
      }
      const comparatorId = String(comparator.id ?? "");
      if (comparatorIds.has(comparatorId)) errors.push(`${comparatorPath}.id: duplicate within action check`);
      else comparatorIds.add(comparatorId);
      const observations = array2(comparator.observations);
      if (observations.length < 2) errors.push(`${comparatorPath}.observations: requires before and after observations`);
      const commandSha256 = sha2562(new TextEncoder().encode(String(comparator.command ?? "")));
      const detectorSha256 = sha2562(new TextEncoder().encode(String(comparator.detector ?? "")));
      const fingerprintsByObservation = [];
      let priorObservedAt = -Infinity;
      for (const [observationIndex, rawObservation] of observations.entries()) {
        const observationPath = `${comparatorPath}.observations[${observationIndex}]`;
        const observation = requireObject(rawObservation, [
          "phase",
          "object",
          "command_sha256",
          "detector_sha256",
          "result_sha256",
          "result_ref",
          "finding_fingerprints",
          "exit_code",
          "observed_at"
        ], observationPath, errors);
        if (!observation) continue;
        const phase = observation.phase;
        const expectedPhase = observationIndex === 0 ? "before" : observationIndex === observations.length - 1 ? "after" : "intermediate";
        if (phase !== expectedPhase) errors.push(`${observationPath}.phase: expected ${expectedPhase}`);
        if (!text(observation.object)) errors.push(`${observationPath}.object: required`);
        if (observationIndex === 0 && observation.object !== check.before_object) errors.push(`${observationPath}.object: must equal action-check before_object`);
        if (observationIndex === observations.length - 1 && observation.object !== check.after_object) errors.push(`${observationPath}.object: must equal action-check after_object`);
        for (const [field, expected] of [["command_sha256", commandSha256], ["detector_sha256", detectorSha256]]) {
          if (!(allowPlaceholders && text(observation[field]) && String(observation[field]).includes("<")) && observation[field] !== expected) {
            errors.push(`${observationPath}.${field}: must equal the SHA-256 of comparator ${field === "command_sha256" ? "command" : "detector"}`);
          }
        }
        if (!(allowPlaceholders && text(observation.result_sha256) && observation.result_sha256.includes("<")) && (typeof observation.result_sha256 !== "string" || !HEX64.test(observation.result_sha256))) {
          errors.push(`${observationPath}.result_sha256: required lowercase SHA-256 of exact comparator output`);
        }
        const comparatorResult = await loadBytesRef(
          files,
          base,
          observation.result_ref,
          `${observationPath}.result_ref`,
          errors,
          allowPlaceholders
        );
        if (comparatorResult.digest && !(allowPlaceholders && text(observation.result_sha256) && observation.result_sha256.includes("<")) && observation.result_sha256 !== comparatorResult.digest) {
          errors.push(`${observationPath}.result_sha256: must equal the digest-bound result_ref bytes`);
        }
        if (!Number.isInteger(observation.exit_code)) errors.push(`${observationPath}.exit_code: required integer`);
        if (!iso(observation.observed_at)) errors.push(`${observationPath}.observed_at: required ISO-8601 timestamp`);
        else {
          const observedAt = Date.parse(String(observation.observed_at));
          if (observedAt < priorObservedAt) errors.push(`${observationPath}.observed_at: observations must be chronological`);
          priorObservedAt = observedAt;
        }
        if (!Array.isArray(observation.finding_fingerprints)) {
          errors.push(`${observationPath}.finding_fingerprints: required array`);
          fingerprintsByObservation.push(/* @__PURE__ */ new Set());
          continue;
        }
        const rawFingerprints = array2(observation.finding_fingerprints);
        const fingerprints = rawFingerprints.filter((item) => typeof item === "string");
        if (fingerprints.length !== rawFingerprints.length || fingerprints.some((item) => !(allowPlaceholders && item.includes("<")) && !HEX64.test(item))) {
          errors.push(`${observationPath}.finding_fingerprints: entries must be lowercase SHA-256 values`);
        }
        if (new Set(fingerprints).size !== fingerprints.length) errors.push(`${observationPath}.finding_fingerprints: duplicates are forbidden`);
        if (!stableEqual(fingerprints, [...fingerprints].sort())) errors.push(`${observationPath}.finding_fingerprints: must be sorted`);
        fingerprintsByObservation.push(new Set(fingerprints));
      }
      if (fingerprintsByObservation.length === observations.length && observations.length >= 2) {
        const before = fingerprintsByObservation[0] ?? /* @__PURE__ */ new Set();
        const after = fingerprintsByObservation.at(-1) ?? /* @__PURE__ */ new Set();
        const introduced = new Set(fingerprintsByObservation.flatMap((set) => [...set]).filter((item) => !before.has(item)));
        for (const fingerprint of introduced) {
          const namespaced = `${comparatorId}\0${fingerprint}`;
          derivedIntroduced.add(namespaced);
          if (after.has(fingerprint)) derivedOpen.add(namespaced);
          else derivedPaid.add(namespaced);
        }
      }
    }
    if (Number.isInteger(check.introduced) && check.introduced !== derivedIntroduced.size) {
      errors.push(`${checkPath}.introduced: must equal fingerprint-derived total (${derivedIntroduced.size})`);
    }
    if (Number.isInteger(check.paid_before_boundary) && check.paid_before_boundary !== derivedPaid.size) {
      errors.push(`${checkPath}.paid_before_boundary: must equal fingerprint-derived total (${derivedPaid.size})`);
    }
    if (Number.isInteger(check.open_at_boundary) && check.open_at_boundary !== derivedOpen.size) {
      errors.push(`${checkPath}.open_at_boundary: must equal fingerprint-derived total (${derivedOpen.size})`);
    }
    introducedPaid += derivedPaid.size;
    introducedOpen += derivedOpen.size;
    if (check.boundary_status === "closed") {
      if (check.open_at_boundary !== 0) errors.push(`${checkPath}: closed boundary requires open_at_boundary=0`);
    } else if (check.boundary_status === "interrupted") {
      interruptedAt.push(index);
      if (check.open_at_boundary === 0) errors.push(`${checkPath}: interrupted boundary requires open_at_boundary>0`);
      if (clean) errors.push(`${checkPath}: CLEAN forbids an interrupted action boundary`);
      const action = manifestActions.find((candidate) => candidate.id === check.action_id);
      if (action?.status !== "failed") errors.push(`${checkPath}: interrupted boundary requires a failed action status`);
    } else errors.push(`${checkPath}.boundary_status: expected closed or interrupted`);
  }
  if (!stableEqual(checkedActionIds, expectedActionIds)) {
    errors.push(`${recordPath}.action_checks: ordered action ids must exactly cover every executed or failed action`);
  }
  if (interruptedAt.some((index) => index !== checks.length - 1) || interruptedAt.length > 1) {
    errors.push(`${recordPath}.action_checks: exactly one interrupted boundary may appear, and only as the final observed action`);
  }
  if (introducedPaid !== record.introduced_by_run_paid) {
    errors.push(`${recordPath}.introduced_by_run_paid: must equal action-check total (${introducedPaid})`);
  }
  if (introducedOpen !== record.introduced_by_run_open) {
    errors.push(`${recordPath}.introduced_by_run_open: must equal action-check total (${introducedOpen})`);
  }
  if (clean && record.introduced_by_run_open !== 0) {
    errors.push(`${recordPath}.introduced_by_run_open: CLEAN requires zero`);
  }
}
async function validateBoundExecutionRecords(bundle, report, manifest, repo, git2, base, files, allowPlaceholders, errors) {
  for (const [index, raw] of array2(manifest.actions).entries()) {
    const action = object3(raw);
    if (!action) continue;
    for (const [evidenceIndex, rawEvidence] of array2(object3(action.outcome)?.evidence).entries()) {
      const evidence = object3(rawEvidence);
      if (!evidence) continue;
      const epath = `$.manifest.actions[${JSON.stringify(action.id)}].outcome.evidence[${evidenceIndex}]`;
      const record = await evidenceRef(files, base, evidence.evidence_ref, `${epath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.action-result");
      if (record && !allowPlaceholders) {
        const expected = {
          action_id: action.id,
          kind: action.kind,
          target: action.target,
          object: evidence.object,
          command: evidence.command,
          result: evidence.result,
          observed_at: evidence.observed_at
        };
        for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${epath}: bound result disagrees on ${key}`);
      }
    }
  }
  for (const [index, raw] of array2(report.completion_debts).entries()) {
    const debt = object3(raw);
    if (!debt) continue;
    if (debt.state === "satisfied") {
      for (const [evidenceIndex, rawEvidence] of array2(debt.evidence).entries()) {
        const evidence = object3(rawEvidence);
        if (!evidence) continue;
        const epath = `$.report.completion_debts[${index}].evidence[${evidenceIndex}]`;
        const record = await evidenceRef(files, base, evidence.evidence_ref, `${epath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.debt-result");
        if (record && !allowPlaceholders) {
          const expected = {
            debt_id: debt.id,
            kind: evidence.kind,
            object: evidence.object,
            command: evidence.command,
            result: evidence.result,
            observed_at: evidence.observed_at
          };
          for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${epath}: bound debt result disagrees on ${key}`);
        }
      }
    }
    if (debt.state === "accepted_exception") {
      const exception = object3(debt.exception) ?? {};
      const epath = `$.report.completion_debts[${index}].exception.ref`;
      const record = await evidenceRef(files, base, exception.ref, epath, errors, allowPlaceholders, "mister-clean.operator-ruling");
      if (record && !allowPlaceholders) {
        for (const field of ["actor", "at", "scope", "rationale"]) if (record[field] !== exception[field]) errors.push(`${epath}: ruling disagrees on ${field}`);
        if (record.debt_id !== debt.id) errors.push(`${epath}: ruling debt_id mismatch`);
        if (record.request_sha256 !== object3(bundle.criteria_discovery)?.request_sha256) errors.push(`${epath}: ruling must bind the exact operative request`);
      }
    }
  }
  for (const [name, raw] of Object.entries(object3(report.claims) ?? {})) {
    const claim = object3(raw);
    if (claim?.state !== "established") continue;
    for (const [index, rawEvidence] of array2(claim.evidence).entries()) {
      const evidence = object3(rawEvidence);
      if (!evidence) continue;
      const epath = `$.report.claims.${name}.evidence[${index}]`;
      if (name === "committed_locally") {
        if (repo && !allowPlaceholders && (await git2.run(repo, ["cat-file", "-e", `${String(evidence.commit ?? "")}^{commit}`], [0, 128])).code !== 0) errors.push(`${epath}: commit does not exist in live repository`);
      } else if (name === "pushed" && evidence.kind === "remote_ref_resolution") {
        if (repo && !allowPlaceholders) {
          const result = await git2.run(repo, ["ls-remote", String(evidence.remote ?? ""), String(evidence.ref ?? "")], [0, 2, 128]);
          const observed = result.stdout.split("\n").filter(Boolean)[0]?.split(/\s+/, 1)[0] ?? "";
          if (observed !== evidence.commit || evidence.commit !== object3(report.repo)?.commit) errors.push(`${epath}: live remote resolution does not establish the subject commit`);
        }
      } else if (EXTERNAL_CLAIMS.has(name)) {
        errors.push(`${epath}: local closure bundles cannot establish external claim ${name}; use not_established/not_applicable until a trusted adapter is configured`);
      }
    }
  }
}
async function validateSuccessor(bundle, report, base, files, clean, allowPlaceholders, errors) {
  const path = "$.successor_readiness";
  const successor = requireObject(bundle.successor_readiness, ["snapshots", "target_observation", "topology", "current_state", "gates", "debris", "handoff", "final_review"], path, errors);
  if (!successor) return;
  const snapshots = requireObject(successor.snapshots, ["start", "end"], `${path}.snapshots`, errors);
  if (snapshots) {
    for (const name of ["start", "end"]) {
      const snapshot = requireObject(snapshots[name], ["kind", "object", "command", "result", "observed_at"], `${path}.snapshots.${name}`, errors);
      if (!snapshot) continue;
      if (snapshot.kind !== "repository_snapshot") errors.push(`${path}.snapshots.${name}.kind: expected repository_snapshot`);
      for (const field of ["object", "command", "result"]) if (!text(snapshot[field])) errors.push(`${path}.snapshots.${name}.${field}: required`);
      if (!allowPlaceholders && !executedText(snapshot.command)) errors.push(`${path}.snapshots.${name}.command: must describe an executed observation, not an assertion`);
      if (!allowPlaceholders && !iso(snapshot.observed_at)) errors.push(`${path}.snapshots.${name}.observed_at: required ISO-8601 timestamp`);
    }
  }
  const observation = requireObject(successor.target_observation, ["kind", "local_ref", "commit", "observed_at"], `${path}.target_observation`, errors);
  if (observation) {
    if (!(/* @__PURE__ */ new Set(["remote_ref_resolution", "local_ref_resolution"])).has(String(observation.kind))) errors.push(`${path}.target_observation.kind: unsupported`);
    if (!text(observation.local_ref)) errors.push(`${path}.target_observation.local_ref: required`);
    if (!text(observation.commit)) errors.push(`${path}.target_observation.commit: required`);
    if (!allowPlaceholders && !iso(observation.observed_at)) errors.push(`${path}.target_observation.observed_at: required ISO-8601 timestamp`);
    if (observation.kind === "remote_ref_resolution") {
      for (const field of ["remote", "remote_ref"]) if (!text(observation[field])) errors.push(`${path}.target_observation.${field}: required`);
    } else if (observation.kind === "local_ref_resolution") {
      await evidenceRef(files, base, observation.policy_evidence, `${path}.target_observation.policy_evidence`, errors, allowPlaceholders, "mister-clean.local-target-policy");
    }
  }
  const topology = requireObject(successor.topology, ["worktrees", "branches", "remote_refs", "stashes", "processes", "dirty", "unowned", "unmerged", "blocking_processes"], `${path}.topology`, errors);
  if (topology) {
    for (const field of ["worktrees", "branches", "remote_refs", "stashes", "processes"]) {
      if (!Array.isArray(topology[field])) errors.push(`${path}.topology.${field}: required array`);
    }
    let reportedUnowned = 0;
    const specs = {
      worktrees: ["path", "head", "branch", "dirty_count", "owner", "purpose", "disposition"],
      branches: ["name", "commit", "merged", "owner", "purpose", "disposition"],
      remote_refs: ["name", "commit", "merged", "owner", "purpose", "disposition"]
    };
    for (const [field, fields] of Object.entries(specs)) {
      for (const [index, raw] of array2(topology[field]).entries()) {
        const rpath = `${path}.topology.${field}[${index}]`;
        const row = requireObject(raw, fields, rpath, errors);
        if (!row) continue;
        if (!owned(row.owner)) {
          reportedUnowned += 1;
          if (clean) errors.push(`${rpath}.owner: CLEAN requires a named owner`);
        }
        for (const key of ["purpose", "disposition"]) if (!text(row[key])) errors.push(`${rpath}.${key}: required`);
        if (field === "worktrees") {
          if (!Number.isInteger(row.dirty_count) || Number(row.dirty_count) < 0) errors.push(`${rpath}.dirty_count: required nonnegative integer`);
          if (clean && Number(row.dirty_count) > 0) {
            errors.push(`${rpath}: unresolved topology row prevents CLEAN`);
            const record = await evidenceRef(files, base, row.policy_ref, `${rpath}.policy_ref`, errors, allowPlaceholders, "mister-clean.topology-policy");
            if (record && !allowPlaceholders) {
              const expected = {
                surface: field,
                identity: row.path,
                commit: row.head,
                request_sha256: object3(bundle.criteria_discovery)?.request_sha256
              };
              for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${rpath}.policy_ref: bound topology ruling disagrees on ${key}`);
              for (const key of ["actor", "scope", "rationale", "next_action"]) if (!text(record[key])) errors.push(`${rpath}.policy_ref: topology ruling requires ${key}`);
            }
          }
        } else {
          if (typeof row.merged !== "boolean") errors.push(`${rpath}.merged: required boolean`);
          if (clean && row.merged === false) {
            errors.push(`${rpath}: unresolved topology row prevents CLEAN`);
            const record = await evidenceRef(files, base, row.policy_ref, `${rpath}.policy_ref`, errors, allowPlaceholders, "mister-clean.topology-policy");
            if (record && !allowPlaceholders) {
              const expected = {
                surface: field,
                identity: row.name,
                commit: row.commit,
                request_sha256: object3(bundle.criteria_discovery)?.request_sha256
              };
              for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${rpath}.policy_ref: bound topology ruling disagrees on ${key}`);
              for (const key of ["actor", "scope", "rationale", "next_action"]) if (!text(record[key])) errors.push(`${rpath}.policy_ref: topology ruling requires ${key}`);
            }
          }
        }
      }
    }
    for (const [index, raw] of array2(topology.processes).entries()) {
      const ppath = `${path}.topology.processes[${index}]`;
      const process2 = requireObject(raw, ["identity", "owner", "purpose", "disposition", "blocking"], ppath, errors);
      if (!process2) continue;
      if (!text(process2.identity)) errors.push(`${ppath}.identity: required`);
      if (!owned(process2.owner)) {
        reportedUnowned += 1;
        if (clean) errors.push(`${ppath}.owner: CLEAN requires a named owner`);
      }
      for (const field of ["purpose", "disposition"]) if (!text(process2[field])) errors.push(`${ppath}.${field}: required`);
      if (typeof process2.blocking !== "boolean") errors.push(`${ppath}.blocking: required boolean`);
    }
    for (const field of ["dirty", "unowned", "unmerged", "blocking_processes"]) {
      if (!Number.isInteger(topology[field]) || Number(topology[field]) < 0) errors.push(`${path}.topology.${field}: required nonnegative integer`);
      else if (clean && topology[field] !== 0) errors.push(`${path}.topology.${field}: CLEAN requires zero`);
    }
    const reportedBlocking = array2(topology.processes).filter((raw) => object3(raw)?.blocking === true).length;
    if (topology.blocking_processes !== reportedBlocking) errors.push(`${path}.topology.blocking_processes: must equal blocking process rows (${reportedBlocking})`);
    if (topology.unowned !== reportedUnowned) errors.push(`${path}.topology.unowned: must equal unowned topology rows (${reportedUnowned})`);
    if (clean && array2(topology.stashes).length) errors.push(`${path}.topology.stashes: CLEAN requires zero stashes`);
  }
  const currentPath = `${path}.current_state`;
  const current = requireObject(successor.current_state, ["state", "path", "sha256", "commit", "generator", "designation"], currentPath, errors);
  if (current) {
    if (!(/* @__PURE__ */ new Set(["missing", "candidate_unverified", "designated"])).has(String(current.state))) errors.push(`${currentPath}.state: unsupported`);
    if (!text(current.commit) || !text(current.generator)) errors.push(`${currentPath}: commit and generator are required`);
    if (clean && current.state !== "designated") errors.push(`${currentPath}.state: CLEAN requires designated`);
    if (current.state === "missing") {
      if (current.path !== null || current.sha256 !== null || current.designation !== null) errors.push(`${currentPath}: missing state requires null path, sha256, and designation`);
    } else {
      if (!text(current.path)) errors.push(`${currentPath}.path: required`);
      if (!allowPlaceholders && (typeof current.sha256 !== "string" || !HEX64.test(current.sha256))) errors.push(`${currentPath}.sha256: required lowercase SHA-256`);
      if (current.state === "candidate_unverified" && current.designation !== null) errors.push(`${currentPath}.designation: candidate_unverified requires null`);
      if (current.state === "designated") {
        const record = await evidenceRef(files, base, current.designation, `${currentPath}.designation`, errors, allowPlaceholders, "mister-clean.current-state-designation");
        if (record && !allowPlaceholders) {
          for (const field of ["path", "sha256", "commit"]) if (record[field] !== current[field]) errors.push(`${currentPath}.designation: bound designation disagrees on ${field}`);
        }
      }
    }
  }
  if (!Array.isArray(successor.gates)) errors.push(`${path}.gates: required array`);
  const gates = array2(successor.gates);
  if (clean && gates.length === 0) errors.push(`${path}.gates: CLEAN requires nonempty array`);
  for (const [index, raw] of gates.entries()) {
    const gpath = `${path}.gates[${index}]`;
    const gate = requireObject(raw, ["id", "kind", "object", "command", "expected_status", "observed_status", "semantic_status", "verified", "total", "warnings", "debt", "skipped", "evidence_ref"], gpath, errors);
    if (!gate) continue;
    for (const field of ["id", "kind", "object", "command"]) if (!text(gate[field])) errors.push(`${gpath}.${field}: required`);
    if (!GATE_KINDS.has(String(gate.kind))) errors.push(`${gpath}.kind: unsupported gate kind`);
    if (!allowPlaceholders && !executedText(gate.command)) errors.push(`${gpath}.command: must describe an executed gate`);
    for (const field of ["expected_status", "observed_status"]) if (!Number.isInteger(gate[field])) errors.push(`${gpath}.${field}: required integer`);
    for (const field of ["verified", "total", "warnings", "debt", "skipped"]) if (!Number.isInteger(gate[field]) || Number(gate[field]) < 0) errors.push(`${gpath}.${field}: required nonnegative integer`);
    if (clean && gate.expected_status !== gate.observed_status) errors.push(`${gpath}: observed_status must equal expected_status`);
    if (clean && gate.semantic_status !== "pass") errors.push(`${gpath}.semantic_status: CLEAN requires pass`);
    if (clean && gate.total === 0) errors.push(`${gpath}.total: zero-scope gate cannot establish CLEAN`);
    if (clean && gate.verified !== gate.total) errors.push(`${gpath}: verified must equal total`);
    for (const field of ["warnings", "debt", "skipped"]) if (clean && gate[field] !== 0) errors.push(`${gpath}.${field}: CLEAN requires zero`);
    const record = await evidenceRef(files, base, gate.evidence_ref, `${gpath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.gate-result");
    if (record && !allowPlaceholders) {
      const expected = {
        gate_id: gate.id,
        object: gate.object,
        command: gate.command,
        observed_status: gate.observed_status,
        semantic_status: gate.semantic_status,
        verified: gate.verified,
        total: gate.total,
        warnings: gate.warnings,
        debt: gate.debt,
        skipped: gate.skipped
      };
      for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${gpath}.evidence_ref: bound gate record disagrees on ${key}`);
      if (!iso(record.observed_at)) errors.push(`${gpath}.evidence_ref: gate record requires timezone-aware observed_at`);
    }
  }
  if (clean && !gates.some((raw) => {
    const gate = object3(raw);
    return gate?.kind === "isolated_clone" && gate.object === object3(report.repo)?.commit;
  })) errors.push(`${path}.gates: CLEAN requires an isolated_clone gate bound to the subject commit`);
  const debris = requireObject(successor.debris, ["removed", "retained", "unclassified", "evidence"], `${path}.debris`, errors);
  if (debris) {
    for (const field of ["removed", "retained", "unclassified"]) {
      if (!Number.isInteger(debris[field]) || Number(debris[field]) < 0) errors.push(`${path}.debris.${field}: required nonnegative integer`);
    }
    if (clean && debris.unclassified !== 0) errors.push(`${path}.debris.unclassified: CLEAN requires zero`);
    if (!Array.isArray(debris.evidence) || array2(debris.evidence).length === 0) errors.push(`${path}.debris.evidence: required`);
    else {
      for (const [index, ref] of array2(debris.evidence).entries()) {
        const record = await evidenceRef(files, base, ref, `${path}.debris.evidence[${index}]`, errors, allowPlaceholders, "mister-clean.debris-census");
        if (record && !allowPlaceholders) for (const field of ["removed", "retained", "unclassified"]) {
          if (record[field] !== debris[field]) errors.push(`${path}.debris.evidence[${index}]: bound debris record disagrees on ${field}`);
        }
      }
    }
  }
  const handoff = requireObject(successor.handoff, ["entrypoints", "next_owner", "next_action"], `${path}.handoff`, errors);
  if (handoff) {
    if (!Array.isArray(handoff.entrypoints) || !array2(handoff.entrypoints).every(text)) errors.push(`${path}.handoff.entrypoints: required string array`);
    else if (clean && array2(handoff.entrypoints).length === 0) errors.push(`${path}.handoff.entrypoints: CLEAN requires at least one entrypoint`);
    for (const field of ["next_owner", "next_action"]) if (!text(handoff[field])) errors.push(`${path}.handoff.${field}: required`);
  }
  const review = requireObject(successor.final_review, ["mechanism", "status", "reviewer", "implementer", "reviewer_execution", "implementer_execution", "criteria_reviewed", "planning_reviewed", "findings_total", "findings_paid", "unresolved", "evidence_ref"], `${path}.final_review`, errors);
  if (review) {
    for (const field of ["mechanism", "reviewer", "implementer"]) if (!text(review[field])) errors.push(`${path}.final_review.${field}: required`);
    if (identity(review.reviewer) && identity(review.reviewer) === identity(review.implementer)) errors.push(`${path}.final_review: reviewer must differ from implementer`);
    const executionIdentities = [];
    for (const field of ["reviewer_execution", "implementer_execution"]) {
      const execution = requireObject(review[field], ["harness", "session_id", "receipt_id"], `${path}.final_review.${field}`, errors);
      if (!execution) continue;
      for (const key of ["harness", "session_id", "receipt_id"]) if (!text(execution[key])) errors.push(`${path}.final_review.${field}.${key}: required`);
      executionIdentities.push([identity(execution.harness), identity(execution.session_id), identity(execution.receipt_id)]);
    }
    if (executionIdentities.length === 2 && stableEqual(executionIdentities[0], executionIdentities[1])) errors.push(`${path}.final_review: reviewer and implementer require distinct execution identities`);
    for (const field of ["criteria_reviewed", "planning_reviewed"]) {
      if (typeof review[field] !== "boolean") errors.push(`${path}.final_review.${field}: required boolean`);
      else if (clean && review[field] !== true) errors.push(`${path}.final_review.${field}: CLEAN requires true`);
    }
    if (clean && review.status !== "passed") errors.push(`${path}.final_review.status: CLEAN requires passed`);
    for (const field of ["findings_total", "findings_paid", "unresolved"]) if (!Number.isInteger(review[field]) || Number(review[field]) < 0) errors.push(`${path}.final_review.${field}: required nonnegative integer`);
    if (clean && review.unresolved !== 0) errors.push(`${path}.final_review.unresolved: CLEAN requires zero`);
    if (clean && review.findings_total !== review.findings_paid) errors.push(`${path}.final_review: findings_total must equal findings_paid`);
    const record = await evidenceRef(files, base, review.evidence_ref, `${path}.final_review.evidence_ref`, errors, allowPlaceholders, "mister-clean.independent-review");
    if (record && !allowPlaceholders) {
      const criteria = object3(bundle.criteria_discovery);
      const planning = object3(bundle.planning_discovery);
      const expected = {
        mechanism: review.mechanism,
        status: review.status,
        reviewer: review.reviewer,
        implementer: review.implementer,
        reviewer_execution: review.reviewer_execution,
        implementer_execution: review.implementer_execution,
        candidate_commit: object3(report.repo)?.commit,
        criteria_ids: criteria?.criteria_ids,
        planning_system_ids: array2(planning?.systems).map((item) => object3(item)?.id).filter((item) => item !== void 0),
        findings_total: review.findings_total,
        findings_paid: review.findings_paid,
        unresolved: review.unresolved
      };
      for (const [key, value] of Object.entries(expected)) if (!stableEqual(record[key], value)) errors.push(`${path}.final_review.evidence_ref: bound review record disagrees on ${key}`);
      if (!iso(record.observed_at)) errors.push(`${path}.final_review.evidence_ref: review record requires timezone-aware observed_at`);
    }
  }
}
async function validateLive(bundle, report, manifest, bundlePath, repo, ports, errors) {
  const { files, git: git2 } = ports;
  if (!await files.exists(repo)) {
    errors.push(`$.live_repo: repository not found: ${repo}`);
    return;
  }
  try {
    const top = await files.realpath(resolve3((await git2.run(repo, ["rev-parse", "--show-toplevel"])).stdout));
    const requestedRoot = await files.realpath(resolve3(repo));
    if (top !== requestedRoot) errors.push(`$.live_repo: expected worktree root ${top}, got ${requestedRoot}`);
    const head = (await git2.run(repo, ["rev-parse", "HEAD"])).stdout;
    const subject = object3(report.repo)?.commit;
    if ((await git2.run(repo, ["cat-file", "-e", `${String(subject ?? "")}^{commit}`], [0, 128])).code !== 0) errors.push("$.report.repo.commit: subject commit does not exist in live repository");
    const custody = object3(bundle.custody) ?? {};
    if (custody.mode !== "sidecar") errors.push("$.custody.mode: only sidecar is supported");
    else if (head !== subject) errors.push(`$.custody: sidecar validation requires live HEAD ${head} == subject ${String(subject)}`);
    if (object3(report.repo)?.id !== await repositoryIdentity2(repo, git2)) errors.push("$.report.repo.id: does not match independently resolved live repository identity");
    if ((await git2.run(repo, ["status", "--porcelain=v1", "--untracked-files=all"])).stdout) errors.push("$.report.repo: CLEAN requires a clean live working tree");
    const successor = object3(bundle.successor_readiness) ?? {};
    const observation = object3(successor.target_observation) ?? {};
    const target = object3(report.target_binding) ?? {};
    if (observation.local_ref !== target.target_ref) errors.push("$.successor_readiness.target_observation.local_ref: must equal report target_binding.target_ref");
    const liveTarget = (await git2.run(repo, ["rev-parse", String(observation.local_ref ?? "")])).stdout;
    if (liveTarget !== target.target_commit) errors.push("$.report.target_binding.target_commit: live target differs");
    if (observation.commit !== liveTarget) errors.push("$.successor_readiness.target_observation.commit: must equal live target");
    const mergeBase = (await git2.run(repo, ["merge-base", liveTarget, String(subject ?? "")])).stdout;
    if (mergeBase !== target.merge_base) errors.push("$.report.target_binding.merge_base: live merge base differs");
    const divergence = (await git2.run(repo, ["rev-list", "--left-right", "--count", `${liveTarget}...${String(subject ?? "")}`])).stdout.split(/\s+/, 2).map(Number);
    if (divergence[0] !== target.target_commits_missing || divergence[1] !== target.candidate_commits_ahead) errors.push("$.report.target_binding: live left/right divergence differs");
    const upstream = (await git2.run(repo, ["rev-parse", "--symbolic-full-name", "@{upstream}"], [0, 128])).stdout;
    const remotes = (await git2.run(repo, ["remote"])).stdout.split("\n").filter(Boolean);
    if (observation.kind === "remote_ref_resolution") {
      const remote = String(observation.remote ?? "");
      const remoteRef = String(observation.remote_ref ?? "");
      const result = await git2.run(repo, ["ls-remote", "--heads", remote, remoteRef], [0, 2, 128]);
      const observed = result.stdout.split("\n").filter(Boolean)[0]?.split(/\s+/, 1)[0] ?? "";
      if (observed !== liveTarget) errors.push("$.successor_readiness.target_observation: remote ref differs from live target");
    }
    if (upstream && observation.kind !== "remote_ref_resolution") errors.push("$.successor_readiness.target_observation: configured upstream forbids local-only target proof");
    if (upstream) {
      if (observation.local_ref !== upstream) errors.push(`$.successor_readiness.target_observation.local_ref: must equal configured upstream ${upstream}`);
      const branch = String(object3(report.repo)?.branch ?? "");
      const remoteName = (await git2.run(repo, ["config", "--get", `branch.${branch}.remote`], [0, 1])).stdout;
      const mergeRef = (await git2.run(repo, ["config", "--get", `branch.${branch}.merge`], [0, 1])).stdout;
      if (observation.remote !== remoteName || observation.remote_ref !== mergeRef) errors.push("$.successor_readiness.target_observation: remote/ref tuple differs from configured upstream");
    } else if (remotes.length && observation.kind === "local_ref_resolution") errors.push("$.successor_readiness.target_observation: CLEAN cannot use local-only target proof while remotes exist");
    const topology = object3(successor.topology) ?? {};
    const worktreeOutput = (await git2.run(repo, ["worktree", "list", "--porcelain"])).stdout;
    const liveWorktrees = worktreeOutput.split(/\n\n+/).filter(Boolean).map((block) => {
      const row = {};
      for (const line of block.split("\n")) {
        const [key = "", ...rest] = line.split(" ");
        if ((/* @__PURE__ */ new Set(["worktree", "HEAD", "branch"])).has(key)) row[key.toLocaleLowerCase("und")] = rest.join(" ");
        else if (key === "detached") row.branch = "detached";
      }
      return row;
    });
    const reportedWorktrees = /* @__PURE__ */ new Map();
    for (const raw of array2(topology.worktrees)) {
      const row = object3(raw);
      if (row && text(row.path)) reportedWorktrees.set(await files.realpath(resolve3(row.path)), row);
    }
    const liveWorktreePaths = /* @__PURE__ */ new Set();
    let dirty = 0;
    let unowned = 0;
    let unmerged = 0;
    for (const row of liveWorktrees) {
      const livePath = await files.realpath(resolve3(row.worktree ?? ""));
      liveWorktreePaths.add(livePath);
      const reported = reportedWorktrees.get(livePath) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const dirtyCount = (await git2.run(livePath, ["status", "--porcelain=v1", "--untracked-files=all"])).stdout.split("\n").filter(Boolean).length;
      if (dirtyCount > 0) dirty += 1;
      if (reported.head !== row.head || reported.branch !== row.branch) errors.push(`$.successor_readiness.topology.worktrees[${JSON.stringify(livePath)}]: live head/branch differs`);
      if (reported.dirty_count !== dirtyCount) errors.push(`$.successor_readiness.topology.worktrees[${JSON.stringify(livePath)}].dirty_count: live count differs`);
      if ((await git2.run(repo, ["merge-base", "--is-ancestor", row.head ?? "", head], [0, 1])).code !== 0) unmerged += 1;
    }
    if (!stableEqual([...liveWorktreePaths].sort(), [...reportedWorktrees.keys()].sort())) errors.push("$.successor_readiness.topology.worktrees: live path set differs");
    const branchLines = (await git2.run(repo, ["for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads"])).stdout.split("\n").filter(Boolean);
    const liveBranches = new Map(branchLines.map((line) => line.split("	", 2)));
    const reportedBranches = new Map(array2(topology.branches).map(object3).filter(Boolean).map((row) => [String(row.name), row]));
    if (!stableEqual([...liveBranches.keys()].sort(), [...reportedBranches.keys()].sort())) errors.push("$.successor_readiness.topology.branches: live branch set differs");
    for (const [name, commit] of liveBranches) {
      const reported = reportedBranches.get(name) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const merged = (await git2.run(repo, ["merge-base", "--is-ancestor", commit, head], [0, 1])).code === 0;
      if (reported.commit !== commit || reported.merged !== merged) errors.push(`$.successor_readiness.topology.branches[${JSON.stringify(name)}]: live commit/merged differs`);
      if (!merged) unmerged += 1;
    }
    const remoteLines = (await git2.run(repo, ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes"])).stdout.split("\n").filter((line) => line && !line.split("	", 1)[0].endsWith("/HEAD"));
    const liveRemoteRefs = new Map(remoteLines.map((line) => line.split("	", 2)));
    const reportedRemoteRefs = new Map(array2(topology.remote_refs).map(object3).filter(Boolean).map((row) => [String(row.name), row]));
    if (!stableEqual([...liveRemoteRefs.keys()].sort(), [...reportedRemoteRefs.keys()].sort())) errors.push("$.successor_readiness.topology.remote_refs: live remote-ref set differs");
    for (const [name, commit] of liveRemoteRefs) {
      const reported = reportedRemoteRefs.get(name) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const merged = (await git2.run(repo, ["merge-base", "--is-ancestor", commit, String(subject ?? "")], [0, 1])).code === 0;
      if (reported.commit !== commit || reported.merged !== merged) errors.push(`$.successor_readiness.topology.remote_refs[${JSON.stringify(name)}]: live commit/merged differs`);
      if (!merged) unmerged += 1;
    }
    const liveStashes = (await git2.run(repo, ["stash", "list", "--format=%gd%09%H%09%gs"])).stdout.split("\n").filter(Boolean);
    if (!stableEqual(topology.stashes, liveStashes)) errors.push("$.successor_readiness.topology.stashes: live stash set differs");
    if (topology.dirty !== dirty || topology.unowned !== unowned || topology.unmerged !== unmerged) errors.push(`$.successor_readiness.topology: live counts dirty=${dirty} unowned=${unowned} unmerged=${unmerged} differ`);
    const current = object3(successor.current_state) ?? {};
    if (text(current.path)) {
      const relCurrent = current.path;
      const currentPath = await contained(files, repo, relCurrent);
      if (relCurrent === ".git" || relCurrent.startsWith(".git/")) errors.push("$.successor_readiness.current_state.path: Git metadata cannot be a successor entrypoint");
      else if (!currentPath || !await files.isFile(currentPath)) errors.push("$.successor_readiness.current_state.path: missing, not a file, or outside repository");
      else if (sha2562(await files.readBytes(currentPath)) !== current.sha256) errors.push("$.successor_readiness.current_state.sha256: live digest differs");
      else if ((await git2.run(repo, ["cat-file", "-e", `${String(subject)}:${relCurrent}`], [0, 128])).code !== 0) errors.push("$.successor_readiness.current_state.path: must exist in the subject commit");
    }
    if (current.commit !== subject) errors.push("$.successor_readiness.current_state.commit: must equal subject commit");
    for (const [index, entry] of array2(object3(successor.handoff)?.entrypoints).entries()) {
      const resolved = await contained(files, repo, entry);
      if (!text(entry) || isAbsolute2(entry) || entry === ".git" || entry.startsWith(".git/") || !resolved || !await files.isFile(resolved)) errors.push(`$.successor_readiness.handoff.entrypoints[${index}]: must be an existing repository-relative file outside .git`);
    }
    for (const name of ["start", "end"]) {
      const snapshot = object3(object3(successor.snapshots)?.[name]) ?? {};
      const commit = String(snapshot.object ?? "");
      if (!/^[0-9a-f]{40}$/.test(commit) || (await git2.run(repo, ["cat-file", "-e", `${commit}^{commit}`], [0, 128])).code !== 0) errors.push(`$.successor_readiness.snapshots.${name}.object: must be an existing full commit`);
    }
    if (object3(object3(successor.snapshots)?.end)?.object !== subject) errors.push("$.successor_readiness.snapshots.end.object: must equal subject commit");
    for (const [index, raw] of array2(manifest.actions).entries()) {
      const action = object3(raw);
      if (action && LOCAL_ACTION_KINDS.has(String(action.kind))) {
        const actionPath = await contained(files, repo, action.target);
        if (!actionPath) errors.push(`$.manifest.actions[${index}].target: resolves outside repository through traversal or symlink`);
      }
    }
    void bundlePath;
  } catch (error) {
    errors.push(`$.live_git: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function validateBundle(data, bundlePath, options = {}) {
  const errors = [];
  const allowPlaceholders = options.allowPlaceholders ?? false;
  const verifyLive = options.verifyLive ?? true;
  const ports = options.ports ?? nodeBundlePorts;
  const bundle = requireObject(data, ["record_type", "schema_version", "run_id", "request_ref", "report", "manifest", "custody", "criteria_discovery", "change_inventory", "planning_discovery", "successor_readiness"], "$", errors);
  if (!bundle) return { errors, ok: false };
  if (bundle.record_type !== "mister-clean.closure-bundle") errors.push("$.record_type: expected mister-clean.closure-bundle");
  if (bundle.schema_version !== "1.0") errors.push("$.schema_version: expected 1.0");
  for (const field of ["run_id", "request_ref"]) if (!text(bundle[field])) errors.push(`$.${field}: required`);
  const base = dirname3(resolve3(bundlePath));
  const reportLoad = await loadRef(ports.files, base, bundle.report, "$.report", errors, allowPlaceholders);
  const manifestLoad = await loadRef(ports.files, base, bundle.manifest, "$.manifest", errors, allowPlaceholders);
  const report = reportLoad.data;
  const manifest = manifestLoad.data;
  if (!report || !manifest) return { errors, ok: errors.length === 0 };
  errors.push(...validateReport(report, allowPlaceholders, true).map((error) => `$.report::${error}`));
  errors.push(...validateManifest(manifest, allowPlaceholders).map((error) => `$.manifest::${error}`));
  if (!allowPlaceholders && !iso(report.generated_at)) errors.push("$.report.generated_at: required ISO-8601 timestamp");
  if (!allowPlaceholders && !iso(object3(report.target_binding)?.measured_at)) errors.push("$.report.target_binding.measured_at: required ISO-8601 timestamp");
  if (bundle.request_ref !== object3(report.authorization_basis)?.ref) errors.push("$.request_ref: must equal report authorization_basis.ref");
  if (bundle.request_ref !== manifest.request_ref) errors.push("$.request_ref: must equal manifest request_ref");
  for (const field of ["id", "commit"]) if (object3(report.repo)?.[field] !== object3(manifest.repo)?.[field]) errors.push(`$.report/manifest.repo.${field}: must match`);
  if (report.mode !== manifest.mode) errors.push("$.report/manifest.mode: must match");
  const reportActions = array2(report.actions).map(object3).filter(Boolean);
  const manifestActions = array2(manifest.actions).map(object3).filter(Boolean);
  const reportIds = reportActions.map((item) => item.id);
  const manifestIds = manifestActions.map((item) => item.id);
  if (new Set(reportIds).size !== reportActions.length) errors.push("$.report.actions: every action requires a unique id");
  if (!stableEqual([...reportIds].sort(), [...manifestIds].sort())) errors.push("$.report/manifest.actions: exact action id sets must match");
  else if (!stableEqual(reportActions, manifestActions)) errors.push("$.report/manifest.actions: canonical action records must match exactly");
  const clean = report.verdict === "CLEAN";
  if (clean && manifestActions.length > 0 && manifest.execution_state !== "executed") errors.push("$.manifest.execution_state: CLEAN with actions requires executed");
  if (clean) {
    for (const action of reportActions) if (action.status !== "executed") errors.push(`$.report.actions[${JSON.stringify(action.id)}].status: CLEAN requires executed`);
  }
  const custody = requireObject(bundle.custody, ["mode", "subject_commit", "evidence_root", "evidence_paths"], "$.custody", errors);
  if (custody) {
    if (custody.mode !== "sidecar") errors.push("$.custody.mode: only sidecar is supported");
    if (!allowPlaceholders && custody.subject_commit !== object3(report.repo)?.commit) errors.push("$.custody.subject_commit: must equal report repo.commit");
    if (!Array.isArray(custody.evidence_paths) || !array2(custody.evidence_paths).every((entry) => text(entry) && !isAbsolute2(entry) && !entry.split(/[\\/]/).includes(".."))) errors.push("$.custody.evidence_paths: required repository-relative string array");
    if (custody.evidence_root !== null || !stableEqual(custody.evidence_paths, [])) errors.push("$.custody: sidecar mode requires null evidence_root and empty evidence_paths");
  }
  let repo = options.repoPath ? resolve3(options.repoPath) : void 0;
  if (verifyLive && !allowPlaceholders && !repo) {
    const probe = await ports.git.run(base, ["rev-parse", "--show-toplevel"], [0, 128]);
    if (probe.code === 0 && probe.stdout) repo = resolve3(probe.stdout);
    else errors.push("$.live_repo: pass --repo or store the bundle inside the repository");
  }
  const repoExists = repo ? await ports.files.exists(repo) : false;
  if (verifyLive && !allowPlaceholders && repo && !repoExists) errors.push(`$.live_repo: repository not found: ${repo}`);
  const structuralRepo = repoExists ? repo : void 0;
  await validateCriteria(bundle, report, base, ports.files, clean, allowPlaceholders, errors);
  await validateBoundExecutionRecords(bundle, report, manifest, structuralRepo, ports.git, base, ports.files, allowPlaceholders, errors);
  await validateChangeInventory(bundle, report, manifest, structuralRepo, ports.git, base, ports.files, clean, allowPlaceholders, errors);
  await validateRegressionDelta(bundle, report, manifest, base, ports.files, clean, allowPlaceholders, errors);
  await validatePlanning(bundle, structuralRepo, ports.files, clean, allowPlaceholders, errors);
  await validateSuccessor(bundle, report, base, ports.files, clean, allowPlaceholders, errors);
  if (!allowPlaceholders) for (const path of findPlaceholders(bundle)) errors.push(`${path}: unresolved template placeholder`);
  if (clean) {
    if (!verifyLive) errors.push("$.verdict: CLEAN requires live verification");
    else if (repo && repoExists) await validateLive(bundle, report, manifest, bundlePath, repo, ports, errors);
  }
  return { errors, ok: errors.length === 0 };
}
async function validateBundleFile(bundlePath, options = {}) {
  const ports = options.ports ?? nodeBundlePorts;
  try {
    const data = JSON.parse(await ports.files.readText(bundlePath));
    return validateBundle(data, bundlePath, { ...options, ports });
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], failureKind: "load", ok: false };
  }
}

// src/closeout/inspection.ts
import { createHash as createHash4 } from "crypto";
import {
  readFile as readFile2,
  readdir as readdir2,
  readlink,
  stat
} from "fs/promises";
import { basename as basename4, relative as relative4, resolve as resolve4, sep as sep4 } from "path";
var STACK_MARKERS = {
  node: ["package.json"],
  "node-bun": ["bun.lock", "bun.lockb"],
  "node-pnpm": ["pnpm-lock.yaml", "pnpm-workspace.yaml"],
  "node-npm": ["package-lock.json"],
  "node-yarn": ["yarn.lock"],
  typescript: ["tsconfig.json"],
  python: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile"],
  rust: ["Cargo.toml"],
  go: ["go.mod"],
  docker: ["Dockerfile", "docker-compose.yml", "compose.yaml"],
  "github-actions": [".github/workflows"]
};
var PUBLIC_SAFETY_EXCLUDED_PARTS = /* @__PURE__ */ new Set([
  ".git",
  ".venv",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules"
]);
var MANIFEST_EXCLUDED_DIRS = /* @__PURE__ */ new Set([
  ".git",
  ".wrangler",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules"
]);
var MANIFEST_EXCLUDED_FILES = /* @__PURE__ */ new Set([
  ".DS_Store",
  "MANIFEST.sha256",
  "src/generated-materials.ts"
]);
var PACKAGE_MANIFEST_EXCLUDED_DIRS = /* @__PURE__ */ new Set([
  ".git",
  ".wrangler",
  "__pycache__",
  "coverage",
  "node_modules"
]);
var PUBLIC_SAFETY_RULES = [
  ["posix-home-path", /\/(?:Users|home)\/[^/\s]+\//],
  ["windows-home-path", /\b[A-Za-z]:\\Users\\[^\\\s]+\\/],
  ["email-address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["file-url", /\bfile:\/\/[^\s)>'\"]+/i],
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  [
    "credential-assignment",
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{8,}/i
  ]
];
function toPosix(path) {
  return path.split(sep4).join("/");
}
function compareCodePoints3(left, right) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
function hasExcludedPart(path, excluded) {
  return path.split(/[\\/]/).some((part) => excluded.has(part));
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function walkFiles(root, excluded) {
  const absoluteRoot = resolve4(root);
  const files = [];
  async function visit(directory) {
    const entries = await readdir2(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (excluded.has(entry.name)) continue;
      const absolute = resolve4(directory, entry.name);
      const rel = toPosix(relative4(absoluteRoot, absolute));
      if (entry.isSymbolicLink()) {
        files.push({ absolute, relative: rel, symlink: true });
      } else if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push({ absolute, relative: rel, symlink: false });
      }
    }
  }
  await visit(absoluteRoot);
  return files.sort((left, right) => compareCodePoints3(left.relative, right.relative));
}
async function containsShellFile(root) {
  try {
    return (await walkFiles(root, /* @__PURE__ */ new Set([".git", "node_modules"]))).some((file) => file.relative.endsWith(".sh"));
  } catch {
    return false;
  }
}
async function detectStack(root) {
  const absoluteRoot = resolve4(root);
  const ecosystems = [];
  for (const [ecosystem, markers] of Object.entries(STACK_MARKERS)) {
    if ((await Promise.all(markers.map((marker) => exists(resolve4(absoluteRoot, marker))))).some(Boolean)) {
      ecosystems.push(ecosystem);
    }
  }
  if (await containsShellFile(absoluteRoot)) ecosystems.push("shell");
  return ecosystems.length > 0 ? { ecosystems, exitCode: 0, status: "detected" } : { ecosystems, exitCode: 3, status: "unknown" };
}
async function loadDenylist(path) {
  if (!path) return [];
  return (await readFile2(path, "utf8")).split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#"));
}
function lines(text2) {
  return text2.split(/\r\n|\n|\r/);
}
async function scanPublicSafety(root, customTerms = []) {
  const findings = [];
  const files = await walkFiles(root, PUBLIC_SAFETY_EXCLUDED_PARTS);
  for (const file of files) {
    let text2;
    if (file.symlink) {
      text2 = `SYMLINK_TARGET=${await readlink(file.absolute)}`;
    } else {
      const bytes = await readFile2(file.absolute);
      if (bytes.includes(0)) continue;
      try {
        text2 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        continue;
      }
    }
    for (const [index, line] of lines(text2).entries()) {
      for (const [rule, expression] of PUBLIC_SAFETY_RULES) {
        if (expression.test(line)) findings.push({ path: file.relative, line: index + 1, rule });
      }
      const folded = foldCase(line);
      for (const [termIndex, term] of customTerms.entries()) {
        if (folded.includes(foldCase(term))) {
          findings.push({ path: file.relative, line: index + 1, rule: `custom-denylist-${termIndex + 1}` });
        }
      }
    }
  }
  return findings.length === 0 ? { findings, exitCode: 0, status: "pass" } : { findings, exitCode: 1, status: "fail" };
}
async function generateManifest(root) {
  const absoluteRoot = resolve4(root);
  const entries = [];
  const files = await walkFiles(absoluteRoot, MANIFEST_EXCLUDED_DIRS);
  for (const file of files) {
    if (MANIFEST_EXCLUDED_FILES.has(file.relative)) continue;
    if (basename4(file.relative).endsWith(".pyc") || basename4(file.relative).endsWith(".skill")) continue;
    if (hasExcludedPart(file.relative, MANIFEST_EXCLUDED_DIRS)) continue;
    if (file.symlink && !(await stat(file.absolute)).isFile()) continue;
    const bytes = await readFile2(file.absolute);
    entries.push({
      path: `./${file.relative}`,
      sha256: createHash4("sha256").update(bytes).digest("hex")
    });
  }
  entries.sort((left, right) => compareCodePoints3(left.path, right.path));
  return {
    entries,
    content: entries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n") + (entries.length ? "\n" : ""),
    exitCode: 0
  };
}
function packagePatternExpression(pattern) {
  const normalized = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else {
      source += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`, "u");
}
async function generatePackageManifest(root) {
  const absoluteRoot = resolve4(root);
  const packageData = JSON.parse(await readFile2(resolve4(absoluteRoot, "package.json"), "utf8"));
  if (!Array.isArray(packageData.files) || packageData.files.some((entry) => typeof entry !== "string")) {
    throw new Error("package.json files must be an array of strings");
  }
  const patterns = packageData.files.filter((entry) => entry !== "MANIFEST.sha256").map(packagePatternExpression);
  const entries = [];
  const files = await walkFiles(absoluteRoot, PACKAGE_MANIFEST_EXCLUDED_DIRS);
  for (const file of files) {
    if (file.relative === "MANIFEST.sha256") continue;
    if (basename4(file.relative).endsWith(".pyc") || basename4(file.relative).endsWith(".skill")) continue;
    if (file.relative !== "package.json" && !patterns.some((pattern) => pattern.test(file.relative))) continue;
    if (file.symlink && !(await stat(file.absolute)).isFile()) continue;
    const bytes = await readFile2(file.absolute);
    entries.push({
      path: `./${file.relative}`,
      sha256: createHash4("sha256").update(bytes).digest("hex")
    });
  }
  entries.sort((left, right) => compareCodePoints3(left.path, right.path));
  return {
    entries,
    content: entries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n") + (entries.length ? "\n" : ""),
    exitCode: 0
  };
}

// src/closeout/prepare.ts
import { createHash as createHash6 } from "crypto";
import { existsSync as existsSync3, lstatSync as lstatSync4, mkdirSync, readFileSync as readFileSync4, writeFileSync as writeFileSync2 } from "fs";
import { join as join2, relative as relative6, resolve as resolve6, sep as sep6 } from "path";

// src/closeout/semantic.ts
import { createHash as createHash5 } from "crypto";
import { spawnSync as spawnSync2 } from "child_process";
import { existsSync as existsSync2, lstatSync as lstatSync3, readFileSync as readFileSync3, readlinkSync } from "fs";
import { basename as basename5, extname as extname3, isAbsolute as isAbsolute3, relative as relative5, resolve as resolve5, sep as sep5 } from "path";
var TEXT_EXTENSIONS2 = /* @__PURE__ */ new Set([".json", ".md", ".mdx", ".txt", ".yaml", ".yml"]);
var CONSTRUCTION_ASSERTION = /\b(choke point|construction[- ]enforced|redact(?:ion|or)?|safe by construction|saniti[sz](?:e|er|ation)|validator)\b/i;
var CRITICAL_BOUNDARY = /\b(auth(?:entication|orization)?|credential|privacy|policy|redact|secret|security|telemetry|token)\b/i;
var COMPOSITION_ROOT = /\b(app factory|bootstrap|composition root|production root|server factory)\b/i;
var ROOT_BEHAVIOR = /\b(consumer|guard|inject|mount|policy|register|sink|state|wire|wired|wiring)\b/i;
function object4(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function strings(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return void 0;
  return [...new Set(value.map((item) => String(item).trim()))].sort();
}
function argv(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return void 0;
  return value.map((item) => String(item).trim());
}
function evidenceRefs(value) {
  if (!Array.isArray(value) || value.length === 0) return void 0;
  const refs = [];
  for (const raw of value) {
    const ref = object4(raw);
    if (!ref || typeof ref.path !== "string" || !ref.path.trim() || isAbsolute3(ref.path) || ref.path === ".." || ref.path.startsWith("../") || typeof ref.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(ref.sha256)) return void 0;
    refs.push({ path: ref.path.trim().replaceAll("\\", "/"), sha256: ref.sha256 });
  }
  return refs.sort((left, right) => left.path.localeCompare(right.path) || left.sha256.localeCompare(right.sha256));
}
function isoTimestamp2(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}
function sha2563(value) {
  return createHash5("sha256").update(value).digest("hex");
}
function normalizeClaim(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("und");
}
function candidateId(kind, path, claim) {
  const prefix = kind === "construction_boundary" ? "CONSTRUCTION" : "COMPOSITION";
  return `SEM-${prefix}-${sha2563(`${kind}\0${path}\0${normalizeClaim(claim)}`).slice(0, 12).toUpperCase()}`;
}
function semanticCandidateSetSha256(candidates) {
  return sha2563(JSON.stringify(candidates.map((candidate) => ({
    evidence: candidate.evidence.map(normalizeClaim).sort(),
    id: candidate.id,
    kind: candidate.kind,
    path: candidate.path
  }))));
}
function semanticWorkingTreeSha256(repository, excludedPath) {
  const root = resolve5(repository);
  const excluded = excludedPath ? resolve5(excludedPath) : void 0;
  const listed = spawnSync2("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (listed.error) throw listed.error;
  if (listed.status !== 0) throw new Error(String(listed.stderr || "git ls-files failed"));
  const hash = createHash5("sha256");
  const paths = String(listed.stdout).split("\0").filter(Boolean).sort();
  for (const portablePath of paths) {
    const absolute = resolve5(root, portablePath);
    if (excluded && absolute === excluded) continue;
    hash.update(`${portablePath.length}:`);
    hash.update(portablePath);
    if (!existsSync2(absolute)) {
      hash.update("\0missing\0");
      continue;
    }
    const stat2 = lstatSync3(absolute);
    if (stat2.isSymbolicLink()) {
      hash.update("\0symlink\0");
      hash.update(readlinkSync(absolute));
    } else if (stat2.isFile()) {
      hash.update("\0file\0");
      hash.update(readFileSync3(absolute));
    } else {
      hash.update("\0other\0");
    }
  }
  return hash.digest("hex");
}
function visibleLines(content) {
  const result = [];
  let fence;
  let inComment = false;
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    let text2 = raw;
    if (inComment) {
      const end = text2.indexOf("-->");
      if (end < 0) continue;
      inComment = false;
      text2 = text2.slice(end + 3);
    }
    while (text2.includes("<!--")) {
      const start = text2.indexOf("<!--");
      const end = text2.indexOf("-->", start + 4);
      if (end < 0) {
        text2 = text2.slice(0, start);
        inComment = true;
        break;
      }
      text2 = `${text2.slice(0, start)}${text2.slice(end + 3)}`;
    }
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(text2)?.[1];
    if (marker) {
      const character = marker[0] ?? "";
      if (!fence) fence = { character, length: marker.length };
      else if (character === fence.character && marker.length >= fence.length) fence = void 0;
      continue;
    }
    if (!fence && text2.trim()) result.push({ line: index + 1, text: text2.trim() });
  }
  return result;
}
function discoverSemanticProbeCandidates(repository) {
  const root = resolve5(repository);
  assertDirectory(root);
  const groups = /* @__PURE__ */ new Map();
  const add = (kind, path, line, text2) => {
    const claim = normalizeClaim(text2);
    const key = `${kind}\0${path}\0${claim}`;
    const group = groups.get(key) ?? { claim, evidence: [], kind, path, refs: [] };
    group.refs.push(`${path}#line-${line}`);
    group.evidence.push(text2.slice(0, 240));
    groups.set(key, group);
  };
  for (const rootText of discoverPlanningRoots(root)) {
    const planningRoot = resolve5(root, rootText);
    const stat2 = lstatSync3(planningRoot);
    const entries = stat2.isFile() ? [{ kind: "file", path: planningRoot }] : listEntriesRecursively(planningRoot);
    for (const entry of entries) {
      if (entry.kind !== "file" || !TEXT_EXTENSIONS2.has(extname3(entry.path).toLocaleLowerCase("und"))) continue;
      let content;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync3(entry.path));
      } catch {
        continue;
      }
      if (content.includes("\0")) continue;
      const path = relative5(root, entry.path).split(sep5).join("/");
      for (const item of visibleLines(content)) {
        if (CONSTRUCTION_ASSERTION.test(item.text) && CRITICAL_BOUNDARY.test(item.text)) {
          add("construction_boundary", path, item.line, item.text);
        }
        if (COMPOSITION_ROOT.test(item.text) && (ROOT_BEHAVIOR.test(item.text) || CRITICAL_BOUNDARY.test(item.text))) {
          add("composition_root_reachability", path, item.line, item.text);
        }
      }
    }
  }
  return [...groups.values()].map((group) => ({
    evidence: [...new Set(group.evidence)].sort(),
    id: candidateId(group.kind, group.path, group.claim),
    kind: group.kind,
    path: group.path,
    refs: [...new Set(group.refs)].sort()
  })).sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
}
function invalidFinding(detail, refs = []) {
  return {
    candidate_id: "manifest",
    classification: "verification_debt",
    code: "semantic_probe_manifest_invalid",
    detail,
    kind: "construction_boundary",
    refs
  };
}
function parseManifest(manifestPath, manifestRef, repository, expectedCommit, expectedTreeSha256, expectedCandidateSetSha256) {
  let content = "";
  let raw;
  try {
    content = readFileSync3(manifestPath, "utf8");
    raw = JSON.parse(content);
  } catch (error) {
    return {
      definitions: [],
      errors: [invalidFinding(`cannot read semantic probe manifest: ${error instanceof Error ? error.message : String(error)}`, [manifestRef])],
      sha256: sha2563(content)
    };
  }
  const manifest = object4(raw);
  if (!manifest) return { definitions: [], errors: [invalidFinding("semantic probe manifest root must be an object", [manifestRef])], sha256: sha2563(content) };
  const errors = [];
  if (manifest.record_type !== "mister-clean.semantic-probes") errors.push(invalidFinding("record_type must be mister-clean.semantic-probes", [manifestRef]));
  if (manifest.schema_version !== "1.1") errors.push(invalidFinding("schema_version must be 1.1", [manifestRef]));
  if (manifest.subject_commit !== expectedCommit) errors.push(invalidFinding(`subject_commit must equal current HEAD ${expectedCommit}`, [manifestRef]));
  if (manifest.subject_tree_sha256 !== expectedTreeSha256) errors.push(invalidFinding("subject_tree_sha256 must equal the current non-ignored working-tree snapshot", [manifestRef]));
  if (manifest.candidate_set_sha256 !== expectedCandidateSetSha256) errors.push(invalidFinding("candidate_set_sha256 must equal the complete discovered semantic candidate set", [manifestRef]));
  if (!isoTimestamp2(manifest.observed_at)) errors.push(invalidFinding("observed_at must be a timezone-aware ISO timestamp", [manifestRef]));
  if (!Array.isArray(manifest.probes)) {
    errors.push(invalidFinding("probes must be an array", [manifestRef]));
    return { definitions: [], errors, ...isoTimestamp2(manifest.observed_at) ? { observedAt: String(manifest.observed_at) } : {}, sha256: sha2563(content) };
  }
  const definitions = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [index, rawProbe] of manifest.probes.entries()) {
    const path = `${manifestRef}#probes[${index}]`;
    const probe = object4(rawProbe);
    if (!probe) {
      errors.push(invalidFinding("probe must be an object", [path]));
      continue;
    }
    const candidate = typeof probe.candidate_id === "string" ? probe.candidate_id.trim() : "";
    const kind = probe.kind === "construction_boundary" || probe.kind === "composition_root_reachability" ? probe.kind : void 0;
    const contractRefs = strings(probe.contract_refs);
    const requiredCases = strings(probe.required_cases);
    const exercisedCases = strings(probe.exercised_cases);
    const disposition = probe.disposition === "operate_time_pending" || probe.disposition === "execute" || probe.disposition === "not_applicable" ? probe.disposition : void 0;
    const command = argv(probe.command);
    const timeout = probe.timeout_ms;
    const expectedStatus = probe.expected_status;
    const boundary = typeof probe.boundary === "string" ? probe.boundary.trim() : "";
    const endpoint = typeof probe.observed_endpoint === "string" ? probe.observed_endpoint.trim() : "";
    const localErrors = [];
    if (!candidate) localErrors.push("candidate_id is required");
    else if (seen.has(candidate)) localErrors.push(`duplicate candidate_id ${candidate}`);
    if (!kind) localErrors.push("kind must be construction_boundary or composition_root_reachability");
    if (!contractRefs?.length) localErrors.push("contract_refs must be a nonempty string array");
    if (disposition !== "not_applicable" && !requiredCases?.length) localErrors.push("required_cases must be a nonempty string array");
    if (disposition !== "not_applicable" && !exercisedCases) localErrors.push("exercised_cases must be a string array");
    if (!disposition) localErrors.push("disposition must explicitly be execute, operate_time_pending, or not_applicable");
    if (!boundary) localErrors.push("boundary is required");
    if (!endpoint) localErrors.push("observed_endpoint is required");
    if (disposition === "execute") {
      if (!command?.length) localErrors.push("command must be a nonempty argv array");
      if (!Number.isInteger(timeout) || Number(timeout) < 100 || Number(timeout) > 3e4) localErrors.push("timeout_ms must be an integer from 100 through 30000");
      if (expectedStatus !== 0) localErrors.push("expected_status must be 0; the probe harness must translate correct behavior to success");
    }
    const owner = typeof probe.owner === "string" ? probe.owner.trim() : "";
    const nextAction = typeof probe.required_next_action === "string" ? probe.required_next_action.trim() : "";
    const evidenceRequired = typeof probe.evidence_required === "string" ? probe.evidence_required.trim() : "";
    const notApplicableReason = typeof probe.not_applicable_reason === "string" ? probe.not_applicable_reason.trim() : "";
    const notApplicableEvidence = evidenceRefs(probe.not_applicable_evidence);
    if (disposition === "operate_time_pending" && (!owner || !nextAction || !evidenceRequired)) {
      localErrors.push("operate_time_pending requires owner, required_next_action, and evidence_required");
    }
    if (disposition === "not_applicable" && (!notApplicableReason || !notApplicableEvidence?.length)) {
      localErrors.push("not_applicable requires not_applicable_reason and nonempty portable digest-bound not_applicable_evidence");
    } else if (disposition === "not_applicable" && notApplicableEvidence) {
      for (const ref of notApplicableEvidence) {
        const evidencePath = resolve5(repository, ref.path);
        const relation = relative5(repository, evidencePath);
        if (relation === ".." || relation.startsWith(`..${sep5}`) || !existsSync2(evidencePath) || !lstatSync3(evidencePath).isFile()) {
          localErrors.push(`not_applicable_evidence path is missing or outside the repository: ${ref.path}`);
          continue;
        }
        if (createHash5("sha256").update(readFileSync3(evidencePath)).digest("hex") !== ref.sha256) {
          localErrors.push(`not_applicable_evidence digest mismatch: ${ref.path}`);
        }
      }
    }
    if (localErrors.length > 0 || !kind || !contractRefs || !disposition) {
      errors.push(invalidFinding(localErrors.join("; "), [path]));
      continue;
    }
    seen.add(candidate);
    definitions.push({
      boundary,
      candidateId: candidate,
      command: disposition === "execute" ? command ?? [] : [],
      contractRefs,
      disposition,
      ...evidenceRequired ? { evidenceRequired } : {},
      exercisedCases: exercisedCases ?? [],
      expectedStatus: disposition === "execute" ? Number(expectedStatus) : 0,
      kind,
      ...notApplicableEvidence?.length ? { notApplicableEvidence } : {},
      ...notApplicableReason ? { notApplicableReason } : {},
      ...nextAction ? { nextAction } : {},
      observedEndpoint: endpoint,
      ...owner ? { owner } : {},
      requiredCases: requiredCases ?? [],
      timeoutMs: disposition === "execute" ? Number(timeout) : 0
    });
  }
  return {
    definitions,
    errors,
    ...isoTimestamp2(manifest.observed_at) ? { observedAt: String(manifest.observed_at) } : {},
    sha256: sha2563(content)
  };
}
function sameStringSet(left, right) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}
function parseProbeReceipt(stdout, definition, candidate, subjectCommit, subjectTreeSha256, candidateSetSha256) {
  const lines2 = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const receiptRows = [];
  for (const line of lines2) {
    try {
      const value = object4(JSON.parse(line));
      if (value?.record_type === "mister-clean.semantic-probe-receipt") receiptRows.push({ raw: line, value });
    } catch {
    }
  }
  if (receiptRows.length !== 1) {
    return { error: `probe stdout must contain exactly one single-line mister-clean.semantic-probe-receipt; found ${receiptRows.length}`, receiptSha256: sha2563(stdout) };
  }
  const row = receiptRows[0];
  const receipt = row.value;
  const exercisedCases = strings(receipt.exercised_cases);
  const passedCases = strings(receipt.passed_cases) ?? [];
  const failedCases = strings(receipt.failed_cases) ?? [];
  const result = receipt.result === "pass" || receipt.result === "fail" ? receipt.result : void 0;
  const errors = [];
  if (receipt.schema_version !== "1.0") errors.push("schema_version must be 1.0");
  if (receipt.candidate_id !== candidate.id) errors.push("candidate_id does not match the executing candidate");
  if (receipt.subject_commit !== subjectCommit) errors.push("subject_commit does not match current HEAD");
  if (receipt.subject_tree_sha256 !== subjectTreeSha256) errors.push("subject_tree_sha256 does not match the bound working tree");
  if (receipt.candidate_set_sha256 !== candidateSetSha256) errors.push("candidate_set_sha256 does not match the complete discovered set");
  if (!exercisedCases || !sameStringSet(exercisedCases, definition.requiredCases)) errors.push("exercised_cases must exactly equal required_cases");
  if (!sameStringSet([...passedCases, ...failedCases], definition.requiredCases) || passedCases.some((item) => failedCases.includes(item))) {
    errors.push("passed_cases and failed_cases must be a disjoint exact partition of required_cases");
  }
  if (!result) errors.push("result must be pass or fail");
  if (result === "pass" && (failedCases.length > 0 || !sameStringSet(passedCases, definition.requiredCases))) {
    errors.push("pass requires every required case in passed_cases and zero failed_cases");
  }
  if (result === "fail" && failedCases.length === 0) errors.push("fail requires at least one failed case");
  if (errors.length > 0 || !result || !exercisedCases) {
    return { error: errors.join("; "), receiptSha256: sha2563(row.raw) };
  }
  return {
    receipt: {
      candidateId: candidate.id,
      candidateSetSha256,
      exercisedCases,
      failedCases,
      passedCases,
      result,
      subjectCommit,
      subjectTreeSha256
    },
    receiptSha256: sha2563(row.raw)
  };
}
function auditSemanticRepository(repository, options = {}) {
  const root = resolve5(repository);
  assertDirectory(root);
  const snapshot = git(root, "rev-parse", "HEAD");
  const manifestPath = options.manifestPath ? resolve5(root, options.manifestPath) : void 0;
  const manifestRelation = manifestPath ? relative5(root, manifestPath) : "";
  const manifestRef = manifestPath ? manifestRelation !== ".." && !manifestRelation.startsWith(`..${sep5}`) && !isAbsolute3(manifestRelation) ? manifestRelation.split(sep5).join("/") : `external-semantic-manifest/${basename5(manifestPath)}` : void 0;
  const workingTreeSha256 = semanticWorkingTreeSha256(root, manifestPath);
  const candidates = discoverSemanticProbeCandidates(root);
  const candidateSetSha256 = semanticCandidateSetSha256(candidates);
  const findings = [];
  const executions = [];
  const resolutions = [];
  let manifestSha256;
  let manifestObservedAt;
  if (!manifestPath || !manifestRef) {
    for (const candidate of candidates) {
      findings.push({
        candidate_id: candidate.id,
        classification: "verification_debt",
        code: "semantic_probe_unassigned",
        detail: "critical contract candidate has no bound construction or composition-root probe",
        kind: candidate.kind,
        refs: candidate.refs
      });
    }
  } else {
    const parsed = parseManifest(
      manifestPath,
      manifestRef,
      root,
      snapshot,
      workingTreeSha256,
      candidateSetSha256
    );
    manifestSha256 = parsed.sha256;
    manifestObservedAt = parsed.observedAt;
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const bindingErrors = [];
    if (parsed.errors.length > 0) {
      bindingErrors.push(...parsed.errors.map((error) => error.detail));
    } else {
      const definitions = new Map(parsed.definitions.map((definition) => [definition.candidateId, definition]));
      for (const definition of parsed.definitions) {
        if (!candidateIds.has(definition.candidateId)) bindingErrors.push(`probe ${definition.candidateId} does not match the bound candidate set`);
      }
      for (const candidate of candidates) {
        const definition = definitions.get(candidate.id);
        if (!definition) bindingErrors.push(`candidate ${candidate.id} is absent from the manifest`);
        else if (definition.kind !== candidate.kind || !candidate.refs.every((ref) => definition.contractRefs.includes(ref))) {
          bindingErrors.push(`candidate ${candidate.id} has incomplete kind or contract_refs coverage`);
        }
      }
    }
    if (bindingErrors.length > 0) {
      findings.push(invalidFinding(
        `semantic probe manifest requires one repair: ${[...new Set(bindingErrors)].sort().join(" | ")}`,
        [manifestRef]
      ));
    } else {
      const byCandidate = new Map(parsed.definitions.map((definition) => [definition.candidateId, definition]));
      for (const candidate of candidates) {
        const definition = byCandidate.get(candidate.id);
        if (definition.disposition === "not_applicable") {
          resolutions.push({
            candidate_id: candidate.id,
            disposition: "not_applicable",
            evidence_refs: definition.notApplicableEvidence ?? [],
            rationale: definition.notApplicableReason ?? ""
          });
          continue;
        }
        const missingCases = definition.requiredCases.filter((item) => !definition.exercisedCases.includes(item));
        if (missingCases.length > 0) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_incomplete",
            detail: `probe omits required cases: ${missingCases.join(", ")}`,
            kind: candidate.kind,
            refs: candidate.refs
          });
          continue;
        }
        if (definition.disposition === "operate_time_pending") {
          findings.push({
            candidate_id: candidate.id,
            classification: "operate_time_pending",
            code: "semantic_probe_operate_time_pending",
            detail: `${definition.nextAction}; owner=${definition.owner}; evidence=${definition.evidenceRequired}`,
            kind: candidate.kind,
            refs: candidate.refs
          });
          continue;
        }
        if (!options.execute) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_unexecuted",
            detail: "probe is defined but was not executed; rerun with --execute under CLOSE authority",
            kind: candidate.kind,
            refs: candidate.refs
          });
          continue;
        }
        const [command, ...args] = definition.command;
        if (!command) continue;
        const result = spawnSync2(command, args, {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            MISTER_CLEAN_CANDIDATE_ID: candidate.id,
            MISTER_CLEAN_CANDIDATE_SET_SHA256: candidateSetSha256,
            MISTER_CLEAN_REQUIRED_CASES_JSON: JSON.stringify(definition.requiredCases),
            MISTER_CLEAN_SUBJECT_COMMIT: snapshot,
            MISTER_CLEAN_SUBJECT_TREE_SHA256: workingTreeSha256
          },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: definition.timeoutMs
        });
        const stdout = String(result.stdout ?? "");
        const evidence = `${stdout}
${result.stderr ?? ""}`;
        if (result.error || result.status === null) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_execution_error",
            detail: result.error?.message ?? `probe ended without an exit status${result.signal ? ` (${result.signal})` : ""}`,
            kind: candidate.kind,
            refs: candidate.refs
          });
          continue;
        }
        const receiptResult = parseProbeReceipt(
          stdout,
          definition,
          candidate,
          snapshot,
          workingTreeSha256,
          candidateSetSha256
        );
        const changedTree = semanticWorkingTreeSha256(root, manifestPath) !== workingTreeSha256;
        const statusMismatch = receiptResult.receipt ? receiptResult.receipt.result === "pass" ? result.status !== 0 : result.status === 0 : false;
        const executionResult = receiptResult.error || changedTree || statusMismatch ? "error" : receiptResult.receipt.result;
        executions.push({
          candidate_id: candidate.id,
          command_sha256: sha2563(JSON.stringify(definition.command)),
          evidence_sha256: sha2563(evidence),
          executable: basename5(command),
          observed_status: result.status,
          receipt_sha256: receiptResult.receiptSha256,
          result: executionResult
        });
        if (executionResult === "error") {
          const detail = receiptResult.error ?? (changedTree ? "probe mutated the bound working tree" : "probe receipt result and process exit status disagree");
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_execution_error",
            detail,
            kind: candidate.kind,
            refs: candidate.refs
          });
          continue;
        }
        if (executionResult === "fail") {
          findings.push({
            candidate_id: candidate.id,
            classification: "confirmed_product_defect",
            code: candidate.kind === "construction_boundary" ? "construction_boundary_failure" : "mechanism_unwired_at_composition_root",
            detail: `${definition.boundary} -> ${definition.observedEndpoint} failed cases: ${receiptResult.receipt.failedCases.join(", ")}`,
            kind: candidate.kind,
            refs: candidate.refs
          });
        }
      }
    }
  }
  const status = candidates.length === 0 && findings.length === 0 ? "not_applicable" : findings.length > 0 ? "fail" : "pass";
  return {
    candidate_probe_count: candidates.length,
    candidate_set_sha256: candidateSetSha256,
    candidates,
    confirmed_failure_count: findings.filter((finding2) => finding2.classification === "confirmed_product_defect").length,
    executed_probe_count: executions.length,
    executions,
    exitCode: status === "fail" ? 1 : 0,
    findings,
    ...manifestObservedAt ? { manifest_observed_at: manifestObservedAt } : {},
    ...manifestSha256 ? { manifest_sha256: manifestSha256 } : {},
    pending_probe_count: findings.filter((finding2) => finding2.classification === "operate_time_pending").length,
    resolved_probe_count: resolutions.length,
    resolutions,
    snapshot,
    status,
    working_tree_sha256: workingTreeSha256
  };
}

// src/closeout/prepare.ts
function asObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value;
}
function sha2564(value) {
  return createHash6("sha256").update(value).digest("hex");
}
function isoTimestamp3(date) {
  return date.toISOString();
}
function planningClass(path) {
  const parts = path.split("/").map((part) => part.toLocaleLowerCase());
  for (const part of parts) if (PLANNING_LANE_NAMES.has(part)) return part;
  return "planning";
}
function loadTemplate(root, name) {
  return structuredClone(readJson(join2(root, "assets", name)));
}
function unique2(values) {
  return [...new Set(values)];
}
function splitLines(value) {
  return value ? value.split(/\r?\n/) : [];
}
function evidenceLabel(value) {
  return value.replaceAll("<", "\u2039").replaceAll(">", "\u203A");
}
function prepareCloseout(options) {
  if (options.requestSource !== void 0 && options.requestText !== void 0) {
    throw new Error("requestSource and requestText are mutually exclusive");
  }
  if (!options.runId.trim()) throw new Error("runId is required");
  if (!options.requestRef.trim()) throw new Error("requestRef is required");
  if (options.executeSemanticProbes && options.semanticManifestPath === void 0) {
    throw new Error("executeSemanticProbes requires semanticManifestPath");
  }
  const mode = options.mode ?? "CLOSE";
  if (!(/* @__PURE__ */ new Set(["CLOSE", "GUARD"])).has(mode)) throw new Error(`unsupported prepare mode: ${mode}`);
  const requestedRepository = resolve6(options.repo);
  const repository = resolve6(git(requestedRepository, "rev-parse", "--show-toplevel"));
  const bundleDirectory = join2(resolve6(options.evidenceHome), "mister-clean", options.runId);
  if (existsSync3(bundleDirectory)) {
    throw new Error(`refusing to overwrite existing run directory: ${bundleDirectory}`);
  }
  mkdirSync(bundleDirectory, { recursive: true });
  const templates = options.templateRoot ?? packageRoot();
  const now = isoTimestamp3((options.now ?? (() => /* @__PURE__ */ new Date()))());
  const head = git(repository, "rev-parse", "HEAD");
  const branch = git(repository, "branch", "--show-current") || "detached";
  const repoId = repositoryIdentity(repository);
  const upstream = runGit(
    repository,
    ["rev-parse", "--symbolic-full-name", "@{upstream}"],
    [0, 128]
  ).stdout;
  const targetRef = upstream || (branch === "detached" ? head : `refs/heads/${branch}`);
  const targetCommit = git(repository, "rev-parse", targetRef);
  const mergeBase = git(repository, "merge-base", targetCommit, head);
  const divergence = git(
    repository,
    "rev-list",
    "--left-right",
    "--count",
    `${targetCommit}...${head}`
  ).split(/\s+/);
  const left = Number(divergence[0] ?? 0);
  const right = Number(divergence[1] ?? 0);
  let requestBytes;
  if (options.requestSource !== void 0) requestBytes = readFileSync4(options.requestSource);
  else if (options.requestText !== void 0) requestBytes = Buffer.from(options.requestText, "utf8");
  else requestBytes = Buffer.from(options.requestRef, "utf8");
  const requestSha256 = sha2564(requestBytes);
  let requestSource = null;
  let sourceKind = "reference_only";
  if (options.requestSource !== void 0 || options.requestText !== void 0) {
    const path = join2(bundleDirectory, "operative-request.txt");
    writeFileSync2(path, requestBytes);
    requestSource = { path: "operative-request.txt", sha256: sha256File(path) };
    sourceKind = "exact_bytes";
  }
  const criteriaIds = unique2(options.criteria ?? []);
  writeJson(join2(bundleDirectory, "criteria-source.json"), {
    record_type: "mister-clean.criteria-source",
    request_ref: options.requestRef,
    request_sha256: requestSha256,
    criteria_ids: criteriaIds
  });
  const planningRoots = discoverPlanningRoots(repository);
  const planningAudit = auditPlanningRepository(repository);
  const unclassifiedPlanningPaths = new Set(
    planningAudit.findings.filter((finding2) => finding2.code === "planning_input_unparsed").map((finding2) => finding2.path)
  );
  writeJson(join2(bundleDirectory, "planning-audit.json"), planningAudit);
  const planningAuditRef = {
    path: "planning-audit.json",
    sha256: sha256File(join2(bundleDirectory, "planning-audit.json"))
  };
  const semanticAudit = auditSemanticRepository(repository, {
    execute: options.executeSemanticProbes ?? false,
    ...options.semanticManifestPath === void 0 ? {} : { manifestPath: options.semanticManifestPath }
  });
  writeJson(join2(bundleDirectory, "semantic-audit.json"), semanticAudit);
  const semanticAuditRef = {
    path: "semantic-audit.json",
    sha256: sha256File(join2(bundleDirectory, "semantic-audit.json"))
  };
  let planningSystems;
  if (planningRoots.length) {
    planningSystems = planningRoots.map((rootText, index) => {
      const root = join2(repository, ...rootText.split("/"));
      const rootStat = lstatSync4(root);
      const rootFiles = rootStat.isFile() ? [root] : rootStat.isDirectory() ? listFilesRecursively(root) : [];
      const artifacts = rootFiles.filter((path) => !relative6(repository, path).split(sep6).includes(".git")).map((path) => {
        const repoPath = relative6(repository, path).split(sep6).join("/");
        return {
          path: repoPath,
          class: unclassifiedPlanningPaths.has(repoPath) ? "unclassified" : planningClass(repoPath),
          sha256: sha256File(path)
        };
      });
      const unclassified = artifacts.filter((artifact) => artifact.class === "unclassified").length;
      return {
        id: `repository-planning-${index + 1}`,
        kind: "repo_files",
        sources: [rootText],
        schema_sources: ["repository lane/artifact convention; verify manually"],
        validators: ["mister-clean audit planning . --json", "mister-clean live planning census"],
        corpus: {
          roots: [rootText],
          include_globs: ["**/*"],
          total: artifacts.length,
          classified: artifacts.length - unclassified,
          unclassified,
          artifacts
        }
      };
    });
  } else {
    planningSystems = [
      {
        id: "no-repository-planning",
        kind: "none",
        sources: ["independent shallow root scan"],
        schema_sources: ["no planning schema found"],
        validators: ["mister-clean planning discovery"],
        corpus: {
          roots: [],
          include_globs: [],
          total: 0,
          classified: 0,
          unclassified: 0,
          artifacts: []
        }
      }
    ];
  }
  const worktrees = parseWorktrees(repository).map((row) => {
    const path = resolve6(row.worktree);
    const dirtyCount = splitLines(git(path, "status", "--porcelain=v1", "--untracked-files=all")).length;
    return {
      path,
      head: row.head ?? "",
      branch: row.branch ?? "detached",
      dirty_count: dirtyCount,
      owner: "unassigned",
      purpose: "discovered during closeout",
      disposition: "requires reconciliation"
    };
  });
  const branches = splitLines(
    git(repository, "for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads")
  ).map((line) => {
    const [name = "", commit = ""] = line.split("	", 2);
    return {
      name,
      commit,
      merged: isGitAncestor(repository, commit, head),
      owner: "unassigned",
      purpose: "discovered during closeout",
      disposition: "requires reconciliation"
    };
  });
  const remoteRefs = splitLines(
    git(repository, "for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes")
  ).map((line) => line.split("	", 2)).filter(([name]) => !name?.endsWith("/HEAD")).map(([name = "", commit = ""]) => ({
    name,
    commit,
    merged: isGitAncestor(repository, commit, head),
    owner: "unassigned",
    purpose: "discovered during closeout",
    disposition: "requires reconciliation"
  }));
  const stashes = splitLines(git(repository, "stash", "list", "--format=%gd%09%H%09%gs"));
  const currentCandidates = ["CURRENT-STATE.md", "docs/CURRENT-STATE.md", "_STATUS.md", "README.md"];
  const currentPath = currentCandidates.find((candidate) => existsSync3(join2(repository, candidate)));
  let policyRef = null;
  let targetObservation;
  if (upstream) {
    const remote = git(repository, "config", "--get", `branch.${branch}.remote`);
    const remoteRef = git(repository, "config", "--get", `branch.${branch}.merge`);
    targetObservation = {
      kind: "remote_ref_resolution",
      local_ref: upstream,
      remote,
      remote_ref: remoteRef,
      commit: targetCommit,
      observed_at: now
    };
  } else {
    writeJson(join2(bundleDirectory, "local-target-policy.json"), {
      record_type: "mister-clean.local-target-policy",
      policy_ref: "no configured upstream; current branch is the conservative local target"
    });
    policyRef = {
      path: "local-target-policy.json",
      sha256: sha256File(join2(bundleDirectory, "local-target-policy.json"))
    };
    targetObservation = {
      kind: "local_ref_resolution",
      local_ref: targetRef,
      commit: targetCommit,
      observed_at: now,
      policy_evidence: policyRef
    };
  }
  const report = loadTemplate(templates, "closeout-report.json");
  const validationDebtClasses = /* @__PURE__ */ new Set([
    "acceptance_cascade_unexecuted",
    "acceptance_gate_unknown",
    "completed_parent_unexecuted_acceptance"
  ]);
  const planningDebts = planningAudit.root_debts.map((debt) => ({
    id: debt.id.replace("ROOT-", "DEBT-"),
    class: debt.class,
    cause_key: debt.cause_key,
    observation_count: debt.observation_count,
    raw_finding_ids: debt.raw_finding_ids,
    affected_paths: debt.affected_paths,
    repair_boundary: debt.repair_boundary,
    causal_evidence: debt.causal_evidence,
    procedure: `Reconcile ${debt.affected_projection_field} across ${evidenceLabel(debt.repair_boundary)}`,
    state: "open",
    disposition: debt.class.split("+").some((code) => validationDebtClasses.has(code)) ? "autonomously_validate" : "autonomously_repair",
    evidence: [{
      kind: "planning_census",
      object: debt.cause_key,
      command: "mister-clean audit planning . --json",
      result: `${debt.observation_count} raw observations: ${debt.class}`,
      observed_at: now,
      evidence_ref: planningAuditRef
    }]
  }));
  const semanticCommand = options.semanticManifestPath === void 0 ? "mister-clean audit semantic . --json" : `mister-clean audit semantic . --manifest semantic-probe-manifest${options.executeSemanticProbes ? " --execute" : ""} --json`;
  const semanticDebts = semanticAudit.findings.map((finding2) => ({
    id: `DEBT-SEMANTIC-${sha2564(Buffer.from(`${finding2.candidate_id}\0${finding2.code}\0${finding2.refs.join("\0")}\0${finding2.detail.replaceAll(/\s+/g, " ")}`, "utf8")).slice(0, 16).toUpperCase()}`,
    class: finding2.code,
    cause_key: finding2.candidate_id,
    observation_count: 1,
    affected_paths: unique2(finding2.refs.map((ref) => ref.split("#line-", 1)[0] ?? ref)),
    procedure: finding2.classification === "confirmed_product_defect" ? `Repair ${finding2.kind.replaceAll("_", " ")} and rerun its bound semantic probe` : finding2.classification === "operate_time_pending" ? `Execute and record the owned operate-time proof for ${finding2.candidate_id}` : `Bind and execute complete adversarial coverage for ${finding2.candidate_id}`,
    state: "open",
    disposition: finding2.classification === "confirmed_product_defect" ? "autonomously_repair" : finding2.classification === "operate_time_pending" ? "decision_or_coordination_required" : "autonomously_validate",
    evidence: [{
      kind: "gate_result",
      object: head,
      command: semanticCommand,
      result: `${finding2.code}: ${finding2.detail}`,
      observed_at: now,
      evidence_ref: semanticAuditRef
    }]
  }));
  const completionDebts = [...planningDebts, ...semanticDebts];
  Object.assign(report, {
    generated_at: now,
    repo: { id: repoId, commit: head, branch },
    mode,
    actions: [],
    completion_debts: completionDebts,
    residuals: [],
    acceptance_criteria: criteriaIds.map((id) => ({
      id,
      source: "operator",
      met: false,
      evidence: ["not yet assessed"]
    })),
    verdict: "NOT_CLEAN",
    debt_census: { discovered: completionDebts.length, paid: 0, accepted_exception: 0 },
    planning_accounting: {
      raw_finding_count: planningAudit.raw_finding_count,
      root_debt_count: planningAudit.root_debt_count,
      suppressed_by_typed_nonartifact_count: planningAudit.suppressed_by_typed_nonartifact_count,
      candidate_probe_count: planningAudit.candidate_probe_count,
      evidence_ref: planningAuditRef
    },
    semantic_accounting: {
      candidate_probe_count: semanticAudit.candidate_probe_count,
      executed_probe_count: semanticAudit.executed_probe_count,
      resolved_probe_count: semanticAudit.resolved_probe_count,
      confirmed_failure_count: semanticAudit.confirmed_failure_count,
      pending_probe_count: semanticAudit.pending_probe_count,
      finding_count: semanticAudit.findings.length,
      evidence_ref: semanticAuditRef
    }
  });
  if (completionDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").completion_debt, "closeout-report.dimensions.completion_debt"), {
      state: "open",
      evidence: [{ kind: "debt_census", object: head, command: "mister-clean prepare closeout census", result: `${completionDebts.length} total root debts (${planningDebts.length} planning, ${semanticDebts.length} semantic)`, observed_at: now }],
      notes: ["Executable planning and semantic audits found payable successor-readiness debt."]
    });
  }
  if (planningDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").planning_integrity, "closeout-report.dimensions.planning_integrity"), {
      state: "open",
      evidence: [{ kind: "planning_census", object: head, command: "mister-clean audit planning . --json", result: `${planningAudit.raw_finding_count} raw findings / ${planningDebts.length} root debts`, observed_at: now }],
      notes: ["Physical lanes, structured metadata, exact parent projections, and acceptance-gate identity do not yet agree."]
    });
  }
  if (semanticDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").verification, "closeout-report.dimensions.verification"), {
      state: "open",
      evidence: [{ kind: "validation_summary", object: head, command: semanticCommand, result: `${semanticDebts.length} unproved, pending, or failed semantic probes`, observed_at: now }],
      notes: ["Critical construction and composition-root claims require bound, executed evidence; prose and isolated unit tests are insufficient."]
    });
  }
  asObject(report.authorization_basis, "closeout-report.authorization_basis").ref = options.requestRef;
  report.scope = { included: [`repository:${repoId}`], excluded: [], policy_sources: [] };
  report.target_binding = {
    target_ref: targetRef,
    target_commit: targetCommit,
    candidate_commit: head,
    merge_base: mergeBase,
    target_commits_missing: left,
    candidate_commits_ahead: right,
    target_incorporated: left === 0 && mergeBase === targetCommit,
    measured_at: now,
    evidence: [`git merge-base + rev-list --left-right --count => ${left}/${right}`]
  };
  const regressionCounts = {
    policy: REGRESSION_POLICY,
    baseline_object: head,
    closing_object: head,
    baseline_findings: completionDebts.length,
    closing_findings: completionDebts.length,
    baseline_paid: 0,
    baseline_open: completionDebts.length,
    newly_discovered_preexisting_paid: 0,
    newly_discovered_preexisting_open: 0,
    concurrent_external_paid: 0,
    concurrent_external_open: 0,
    introduced_by_run_paid: 0,
    introduced_by_run_open: 0
  };
  writeJson(join2(bundleDirectory, "regression-delta.json"), {
    record_type: "mister-clean.regression-delta",
    schema_version: "1.2",
    ...regressionCounts,
    action_checks: []
  });
  report.regression_control = {
    ...regressionCounts,
    action_checks: 0,
    evidence_ref: {
      path: "regression-delta.json",
      sha256: sha256File(join2(bundleDirectory, "regression-delta.json"))
    }
  };
  const manifest = loadTemplate(templates, "action-manifest.json");
  manifest.repo = { id: repoId, commit: head };
  manifest.request_ref = options.requestRef;
  asObject(manifest.authorization_basis, "action-manifest.authorization_basis").ref = options.requestRef;
  manifest.mode = mode;
  if (mode === "GUARD") {
    manifest.guard = {
      status: "initialized",
      baseline_commit: head,
      candidate_tree: null,
      minted_at: null,
      staged_paths: [],
      writers_frozen: false,
      receipts: [],
      deterministic_gates: null,
      no_harm: null,
      commit_barrier: {
        state: "closed",
        approved_tree: null,
        receipt_ids: [],
        opened_at: null,
        crossed_action_id: null
      }
    };
  }
  const coordination = asObject(manifest.coordination, "action-manifest.coordination");
  coordination.dispatcher = `mister-clean:${options.runId}`;
  coordination.integrator = `mister-clean:${options.runId}`;
  coordination.target = { ref: targetRef, expected_commit: targetCommit, observed_at: now };
  writeJson(join2(bundleDirectory, "debris-census.json"), {
    record_type: "mister-clean.debris-census",
    removed: 0,
    retained: 0,
    unclassified: 0
  });
  writeJson(join2(bundleDirectory, "independent-review.json"), {
    record_type: "mister-clean.independent-review",
    observed_at: now,
    mechanism: "not yet run",
    status: "not_run",
    reviewer: "not-assigned",
    implementer: `mister-clean:${options.runId}`,
    candidate_commit: head,
    reviewer_execution: { harness: "not-assigned", session_id: "not-assigned", receipt_id: "not-assigned" },
    implementer_execution: { harness: "local", session_id: options.runId, receipt_id: `prepare-${options.runId}` },
    criteria_ids: criteriaIds,
    planning_system_ids: planningSystems.map((item) => item.id),
    findings_total: 0,
    findings_paid: 0,
    unresolved: 0
  });
  const bundle = loadTemplate(templates, "closure-bundle.json");
  Object.assign(bundle, {
    run_id: options.runId,
    request_ref: options.requestRef,
    custody: { mode: "sidecar", subject_commit: head, evidence_root: null, evidence_paths: [] },
    criteria_discovery: {
      source_kind: sourceKind,
      request_source: requestSource,
      source_refs: [
        { path: "criteria-source.json", sha256: sha256File(join2(bundleDirectory, "criteria-source.json")) }
      ],
      request_sha256: requestSha256,
      discovered_count: criteriaIds.length,
      none_found: criteriaIds.length === 0,
      criteria_ids: criteriaIds
    },
    change_inventory: { start_commit: head, subject_commit: head, changes: [] },
    planning_discovery: { unknown: unclassifiedPlanningPaths.size > 0, systems: planningSystems }
  });
  bundle.successor_readiness = {
    snapshots: {
      start: {
        kind: "repository_snapshot",
        object: head,
        command: "git rev-parse HEAD plus full topology census",
        result: head,
        observed_at: now
      },
      end: {
        kind: "repository_snapshot",
        object: head,
        command: "initial scaffold; closing snapshot not yet taken",
        result: head,
        observed_at: now
      }
    },
    target_observation: targetObservation,
    topology: {
      worktrees,
      branches,
      remote_refs: remoteRefs,
      stashes,
      processes: [],
      dirty: worktrees.filter((item) => item.dirty_count > 0).length,
      unowned: worktrees.length + branches.length + remoteRefs.length,
      unmerged: [...branches, ...remoteRefs].filter((item) => !item.merged).length,
      blocking_processes: 0
    },
    current_state: currentPath ? {
      state: "candidate_unverified",
      path: currentPath,
      sha256: sha256File(join2(repository, currentPath)),
      commit: head,
      generator: "discovered candidate; requires explicit designation",
      designation: null
    } : {
      state: "missing",
      path: null,
      sha256: null,
      commit: head,
      generator: "not yet created",
      designation: null
    },
    gates: [],
    debris: {
      removed: 0,
      retained: 0,
      unclassified: 0,
      evidence: [
        { path: "debris-census.json", sha256: sha256File(join2(bundleDirectory, "debris-census.json")) }
      ]
    },
    handoff: {
      entrypoints: currentPath ? [currentPath] : [],
      next_owner: "unassigned-by-policy",
      next_action: "pay the first open debt discovered by Mister Clean"
    },
    final_review: {
      mechanism: "not yet run",
      status: "not_run",
      reviewer: "not-assigned",
      implementer: `mister-clean:${options.runId}`,
      reviewer_execution: { harness: "not-assigned", session_id: "not-assigned", receipt_id: "not-assigned" },
      implementer_execution: { harness: "local", session_id: options.runId, receipt_id: `prepare-${options.runId}` },
      criteria_reviewed: false,
      planning_reviewed: false,
      findings_total: 0,
      findings_paid: 0,
      unresolved: 0,
      evidence_ref: {
        path: "independent-review.json",
        sha256: sha256File(join2(bundleDirectory, "independent-review.json"))
      }
    }
  };
  writeJson(join2(bundleDirectory, "action-manifest.json"), manifest);
  writeJson(join2(bundleDirectory, "closeout-report.json"), report);
  bundle.manifest = {
    path: "action-manifest.json",
    sha256: sha256File(join2(bundleDirectory, "action-manifest.json"))
  };
  bundle.report = {
    path: "closeout-report.json",
    sha256: sha256File(join2(bundleDirectory, "closeout-report.json"))
  };
  const bundlePath = join2(bundleDirectory, "closure-bundle.json");
  writeJson(bundlePath, bundle);
  return { bundleDirectory, bundlePath };
}

// src/closeout/engine.ts
var nodeCloseoutEngine = {
  prepare: prepareCloseout,
  validateRecord(kind, data, allowPlaceholders = false) {
    return kind === "report" ? validateReport(data, allowPlaceholders) : validateManifest(data, allowPlaceholders);
  },
  validateBundle: validateBundleFile,
  detectStack,
  async auditPlanning(root) {
    return auditPlanningRepository(root);
  },
  async auditSemantic(root, options) {
    return auditSemanticRepository(root, options);
  },
  async scanPublicSafety(root, denylistPath) {
    return scanPublicSafety(root, await loadDenylist(denylistPath));
  },
  generateManifest,
  generatePackageManifest
};

// src/cli.ts
var UsageError = class extends Error {
};
function defaultIO() {
  return {
    stdout: (line) => process.stdout.write(`${line}
`),
    stderr: (line) => process.stderr.write(`${line}
`)
  };
}
function removeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}
function removeOption(args, option, required = false) {
  const index = args.indexOf(option);
  if (index < 0) {
    if (required) throw new UsageError(`${option} is required`);
    return void 0;
  }
  const value = args[index + 1];
  if (value === void 0 || value.startsWith("--")) throw new UsageError(`${option} requires a value`);
  args.splice(index, 2);
  return value;
}
function removeRepeatedOption(args, option) {
  const values = [];
  while (args.includes(option)) values.push(removeOption(args, option, true));
  return values;
}
function assertNoArgs(args) {
  if (args.length) throw new UsageError(`unexpected argument(s): ${args.join(" ")}`);
}
function inside(root, candidate) {
  const rootPath = resolve7(root);
  const candidatePath = resolve7(candidate);
  const relation = relative7(
    existsSync4(rootPath) ? realpathSync2(rootPath) : rootPath,
    existsSync4(candidatePath) ? realpathSync2(candidatePath) : candidatePath
  );
  return relation === "" || !relation.startsWith(`..${sep7}`) && relation !== ".." && !relation.startsWith("/");
}
function readJson2(path) {
  return JSON.parse(readFileSync5(path, "utf8"));
}
async function runPrepare(args, io) {
  const repo = removeOption(args, "--repo", true);
  const evidenceHome = removeOption(args, "--evidence-home", true);
  const runId = removeOption(args, "--run-id", true);
  const requestRef = removeOption(args, "--request-ref", true);
  const requestSource = removeOption(args, "--request-source");
  const requestText = removeOption(args, "--request-text");
  const rawMode = removeOption(args, "--mode")?.toLocaleUpperCase("und");
  if (rawMode !== void 0 && rawMode !== "CLOSE" && rawMode !== "GUARD") {
    throw new UsageError("--mode requires CLOSE or GUARD");
  }
  const semanticManifestPath = removeOption(args, "--semantic-manifest");
  const executeSemanticProbes = removeFlag(args, "--execute-semantic-probes");
  const criteria = removeRepeatedOption(args, "--criterion");
  assertNoArgs(args);
  if (requestSource !== void 0 && requestText !== void 0) {
    throw new UsageError("--request-source and --request-text are mutually exclusive");
  }
  if (executeSemanticProbes && semanticManifestPath === void 0) {
    throw new UsageError("--execute-semantic-probes requires --semantic-manifest");
  }
  const prepared = nodeCloseoutEngine.prepare({
    repo,
    evidenceHome,
    runId,
    requestRef,
    mode: rawMode ?? "CLOSE",
    ...requestSource === void 0 ? {} : { requestSource },
    ...requestText === void 0 ? {} : { requestText },
    ...semanticManifestPath === void 0 ? {} : { semanticManifestPath },
    executeSemanticProbes,
    criteria
  });
  io.stdout(prepared.bundleDirectory);
  return 0;
}
async function runValidate(args, io) {
  const kind = args.shift();
  const path = args.shift();
  if (!kind || !(/* @__PURE__ */ new Set(["report", "manifest", "bundle"])).has(kind)) {
    throw new UsageError("validate requires report, manifest, or bundle");
  }
  if (!path) throw new UsageError(`validate ${kind} requires a path`);
  const template = removeFlag(args, "--template");
  const structural = removeFlag(args, "--structural");
  const repo = removeOption(args, "--repo");
  assertNoArgs(args);
  if (kind !== "bundle" && (structural || repo !== void 0)) {
    throw new UsageError("--structural and --repo are only valid for bundle validation");
  }
  if (template && !inside(join3(packageRoot(import.meta.url), "assets"), path)) {
    io.stderr("ERROR: --template is only valid for the skill's bundled assets/ templates; a real record must validate without placeholders");
    return 2;
  }
  if (kind === "bundle") {
    const result = await nodeCloseoutEngine.validateBundle(path, {
      allowPlaceholders: template,
      verifyLive: !structural,
      ...repo === void 0 ? {} : { repoPath: repo }
    });
    if (!result.ok) {
      result.errors.forEach((error) => io.stderr(`ERROR: ${error}`));
      if (result.failureKind === "load") return 2;
      io.stderr(`FAIL errors=${result.errors.length}`);
      return 1;
    }
    io.stdout(`PASS kind=bundle path=${path} live=${!structural}`);
    return 0;
  }
  let data;
  try {
    data = readJson2(path);
  } catch (error) {
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const errors = nodeCloseoutEngine.validateRecord(kind === "report" ? "report" : "manifest", data, template);
  if (errors.length) {
    errors.forEach((error) => io.stderr(`ERROR: ${error}`));
    io.stderr(`FAIL errors=${errors.length}`);
    return 1;
  }
  io.stdout(`PASS kind=${kind} path=${path}`);
  return 0;
}
async function runDetect(args, io) {
  if (args.shift() !== "stack") throw new UsageError("detect requires stack");
  const root = args.shift();
  if (!root) throw new UsageError("detect stack requires a repository path");
  const listOnly = removeFlag(args, "--list");
  assertNoArgs(args);
  if (!existsSync4(root) || !statSync2(root).isDirectory()) {
    io.stderr(`ERROR: not a directory: ${resolve7(root)}`);
    return 2;
  }
  const result = await nodeCloseoutEngine.detectStack(root);
  if (result.status === "unknown") {
    io.stdout("NO KNOWN ECOSYSTEM DETECTED -- inspect manually; adapter checks may not be silently skipped");
    return result.exitCode;
  }
  io.stdout(`detected: ${result.ecosystems.join(" ")}`);
  if (listOnly) return 0;
  const reference = join3(packageRoot(import.meta.url), "references", "stack-adapters.md");
  if (!existsSync4(reference)) return 0;
  const text2 = readFileSync5(reference, "utf8");
  for (const ecosystem of result.ecosystems) {
    const header = `## ${ecosystem}`;
    const start = text2.indexOf(header);
    if (start < 0) continue;
    const next = text2.indexOf("\n## ", start + header.length);
    io.stdout(`
${text2.slice(start, next < 0 ? void 0 : next).trimEnd()}`);
  }
  return 0;
}
async function runAudit(args, io) {
  const kind = args.shift();
  if (!(/* @__PURE__ */ new Set(["planning", "public-safety", "semantic"])).has(String(kind))) {
    throw new UsageError("audit requires planning, public-safety, or semantic");
  }
  const root = args[0]?.startsWith("--") === false ? args.shift() : process.cwd();
  if (kind === "planning") {
    const json = removeFlag(args, "--json");
    assertNoArgs(args);
    const result2 = await nodeCloseoutEngine.auditPlanning(root);
    if (json) io.stdout(JSON.stringify(result2, null, 2));
    else {
      for (const finding2 of result2.findings) {
        io.stdout(`${finding2.code}	${finding2.path}	${finding2.subject}	${finding2.detail}`);
      }
      io.stdout(`planning: ${result2.status.toLocaleUpperCase("und")} artifacts=${result2.artifactCount} structured=${result2.structuredArtifactCount} findings=${result2.findings.length}`);
    }
    return result2.exitCode;
  }
  if (kind === "semantic") {
    const json = removeFlag(args, "--json");
    const execute = removeFlag(args, "--execute");
    const manifestPath = removeOption(args, "--manifest");
    assertNoArgs(args);
    if (execute && manifestPath === void 0) throw new UsageError("audit semantic --execute requires --manifest");
    const result2 = await nodeCloseoutEngine.auditSemantic(root, {
      execute,
      ...manifestPath === void 0 ? {} : { manifestPath }
    });
    if (json) io.stdout(JSON.stringify(result2, null, 2));
    else {
      for (const finding2 of result2.findings) {
        io.stdout(`${finding2.code}	${finding2.candidate_id}	${finding2.detail}`);
      }
      io.stdout(`semantic: ${result2.status.toLocaleUpperCase("und")} candidates=${result2.candidate_probe_count} executed=${result2.executed_probe_count} findings=${result2.findings.length}`);
    }
    return result2.exitCode;
  }
  const denylist = removeOption(args, "--denylist-file");
  assertNoArgs(args);
  const result = await nodeCloseoutEngine.scanPublicSafety(root, denylist);
  for (const finding2 of result.findings) io.stdout(`${finding2.path}:${finding2.line}: ${finding2.rule}`);
  if (result.status === "fail") io.stderr(`public-safety: FAIL (${result.findings.length} finding(s))`);
  else io.stdout("public-safety: PASS");
  return result.exitCode;
}
async function runManifest(args, io) {
  const root = args.shift() ?? packageRoot(import.meta.url);
  const check = removeFlag(args, "--check");
  const packageSurface = removeFlag(args, "--package");
  assertNoArgs(args);
  const result = packageSurface ? await nodeCloseoutEngine.generatePackageManifest(root) : await nodeCloseoutEngine.generateManifest(root);
  const path = join3(resolve7(root), "MANIFEST.sha256");
  if (check) {
    if (!existsSync4(path) || readFileSync5(path, "utf8") !== result.content) {
      io.stderr("manifest: FAIL (MANIFEST.sha256 is stale)");
      return 1;
    }
    io.stdout(`manifest: PASS (${result.entries.length} entries)`);
    return 0;
  }
  writeFileSync3(path, result.content, "utf8");
  io.stdout(`manifest: wrote ${result.entries.length} entries`);
  return 0;
}
function usage(io) {
  io.stderr("usage: mister-clean <prepare|validate|detect|audit|manifest> ... (audit: planning|public-safety|semantic)");
}
async function runCli(argv2, io = defaultIO()) {
  const args = [...argv2];
  const command = args.shift();
  try {
    if (command === "prepare") return await runPrepare(args, io);
    if (command === "validate") return await runValidate(args, io);
    if (command === "detect") return await runDetect(args, io);
    if (command === "audit") return await runAudit(args, io);
    if (command === "manifest") return await runManifest(args, io);
    usage(io);
    return 2;
  } catch (error) {
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof UsageError) usage(io);
    return 2;
  }
}
function isDirectInvocation(argvPath, moduleUrl) {
  if (!argvPath) return false;
  try {
    return realpathSync2(argvPath) === realpathSync2(fileURLToPath2(moduleUrl));
  } catch {
    const invokedPath = resolve7(argvPath);
    return invokedPath === fileURLToPath2(moduleUrl) || pathToFileURL(invokedPath).href === moduleUrl;
  }
}
if (isDirectInvocation(process.argv[1], import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
export {
  isDirectInvocation,
  runCli
};
