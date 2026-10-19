// The resolver decides the whole graph. If it drifts, every sheet is wrong.
import { strict as assert } from "node:assert";
import { packageOf, resolve, resolveJs, moduleId, langOf } from "../src/extract.mjs";

const known = new Set([
  "fastapi", "fastapi/applications", "fastapi/routing", "fastapi/openapi",
  "fastapi/openapi/utils", "fastapi/security/oauth2", "pkg/sub/deep",
]);
const to = (file, dots, path) =>
  resolve({ dots, path }, packageOf(file), moduleId(file), known);

// moduleId
assert.equal(moduleId("fastapi/__init__.py"), "fastapi");
assert.equal(moduleId("fastapi/routing.py"), "fastapi/routing");

// packageOf: a package's __init__ IS the package; a module is its parent dir.
assert.deepEqual(packageOf("fastapi/__init__.py"), ["fastapi"]);
assert.deepEqual(packageOf("fastapi/routing.py"), ["fastapi"]);
assert.deepEqual(packageOf("fastapi/openapi/utils.py"), ["fastapi", "openapi"]);

// The bug this file exists for: `from .applications import X` in fastapi/__init__.py
assert.equal(to("fastapi/__init__.py", 1, "applications"), "fastapi/applications");

// Relative imports from a regular module resolve against its package.
assert.equal(to("fastapi/routing.py", 1, "applications"), "fastapi/applications");
assert.equal(to("fastapi/openapi/utils.py", 2, "routing"), "fastapi/routing");

// Absolute imports.
assert.equal(to("fastapi/routing.py", 0, "fastapi.openapi.utils"), "fastapi/openapi/utils");

// A dotted tail that is a symbol, not a module, falls back to the longest real prefix.
assert.equal(to("fastapi/routing.py", 0, "fastapi.applications.FastAPI"), "fastapi/applications");

// External imports and self-imports produce no edge.
assert.equal(to("fastapi/routing.py", 0, "starlette.routing"), null);
assert.equal(to("fastapi/routing.py", 0, "fastapi.routing"), null);

// --- JavaScript / TypeScript ---------------------------------------------

assert.equal(langOf("src/app.ts"), "js");
assert.equal(langOf("src/app.py"), "py");
assert.equal(langOf("README.md"), null);

// An entry file names its directory, in either language.
assert.equal(moduleId("src/core/index.ts"), "src/core");
assert.equal(moduleId("src/core/Axios.js"), "src/core/Axios");

const jsKnown = new Set(["src/core", "src/core/Axios", "src/helpers/bind", "src/utils", "src/index"]);
const jsTo = (file, spec) => resolveJs(spec, file, jsKnown);

assert.equal(jsTo("src/axios.js", "./core/Axios"), "src/core/Axios");
assert.equal(jsTo("src/axios.js", "./utils"), "src/utils");
assert.equal(jsTo("src/core/Axios.js", "../helpers/bind"), "src/helpers/bind");

// A directory import resolves to that directory's entry file.
assert.equal(jsTo("src/axios.js", "./core"), "src/core");

// ESM source often writes ".js" for a file that is really ".ts".
assert.equal(jsTo("src/axios.js", "./utils.js"), "src/utils");

// Bare specifiers are packages, never internal modules.
assert.equal(jsTo("src/axios.js", "follow-redirects"), null);
assert.equal(jsTo("src/axios.js", "node:fs"), null);
assert.equal(jsTo("src/axios.js", "@scope/pkg"), null);

// Self-import produces no edge.
assert.equal(jsTo("src/utils.js", "./utils"), null);

// A relative path that does not exist in the repo is not an edge.
assert.equal(jsTo("src/axios.js", "./nope"), null);

console.log("resolve: all assertions passed");
