const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND" || !parent || !request.startsWith(".")) throw error;
    const typescriptPath = path.resolve(path.dirname(parent.filename), `${request}.ts`);
    if (fs.existsSync(typescriptPath)) return typescriptPath;
    throw error;
  }
};

require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  module._compile(output, filename);
};
