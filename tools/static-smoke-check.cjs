#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.cwd();
const failures = [];
const checks = [];

function readTextFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function runCheck(name, fn) {
  try {
    fn();
    checks.push(`OK: ${name}`);
  } catch (error) {
    failures.push(`FAIL: ${name}\n  ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function compileJs(relPath) {
  const source = readTextFile(relPath);
  new vm.Script(source, { filename: relPath });
}

function compileInlineMenuScript(menuPath) {
  const html = readTextFile(menuPath);
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert(scriptMatch, `${menuPath}: inline <script> block not found`);
  new Function(scriptMatch[1]);
}

function checkMenuIdReferences(menuPath) {
  const html = readTextFile(menuPath);
  const idSet = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const refs = [...html.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  const missing = [...new Set(refs.filter((id) => !idSet.has(id)))];
  assert(!missing.length, `${menuPath}: missing id(s): ${missing.join(", ")}`);
}

function isExternalRef(ref) {
  return /^(?:https?:|mailto:|tel:|#|javascript:|data:)/i.test(ref);
}

function resolveLocalRef(htmlRelPath, ref) {
  const cleanRef = ref.split("#")[0].split("?")[0];
  if (!cleanRef) return null;
  if (isExternalRef(cleanRef)) return null;

  if (cleanRef.startsWith("/")) {
    return path.join(ROOT, cleanRef.slice(1));
  }

  const htmlDir = path.dirname(path.join(ROOT, htmlRelPath));
  return path.resolve(htmlDir, cleanRef);
}

function checkLocalAssetRefs(htmlRelPath) {
  const html = readTextFile(htmlRelPath);
  const markupOnly = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const refs = [...markupOnly.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);

  refs.forEach((ref) => {
    const resolved = resolveLocalRef(htmlRelPath, ref);
    if (!resolved) return;
    if (!fs.existsSync(resolved)) {
      throw new Error(`${htmlRelPath}: missing local asset: ${ref}`);
    }
  });
}

const htmlPages = [
  "index.html",
  "rooms.html",
  "spa.html",
  "conference.html",
  "rules.html",
  "contacts.html",
  "Menu/menu.html",
];

runCheck("js/main.js syntax", () => compileJs("js/main.js"));
runCheck("js/rooms.js syntax", () => compileJs("js/rooms.js"));
runCheck("Menu inline script syntax", () => compileInlineMenuScript("Menu/menu.html"));
runCheck("Menu getElementById refs", () => checkMenuIdReferences("Menu/menu.html"));
runCheck("HTML local asset refs", () => {
  htmlPages.forEach(checkLocalAssetRefs);
});

if (failures.length) {
  failures.forEach((line) => console.error(line));
  process.exitCode = 1;
} else {
  checks.forEach((line) => console.log(line));
}
