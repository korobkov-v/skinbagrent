#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();

function removeFileIfExists(targetPath) {
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    fs.rmSync(targetPath, { force: true });
    return true;
  }
  return false;
}

function removeDirIfExists(targetPath) {
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

function walkAndRemoveDsStore(dirPath) {
  let removed = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      removed += walkAndRemoveDsStore(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name === ".DS_Store") {
      fs.rmSync(fullPath, { force: true });
      removed += 1;
    }
  }

  return removed;
}

function removeDbFiles(dataDir) {
  if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
    return 0;
  }

  let removed = 0;
  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name.endsWith(".db") || entry.name.includes(".db-")) {
      fs.rmSync(path.join(dataDir, entry.name), { force: true });
      removed += 1;
    }
  }
  return removed;
}

const removedDist = removeDirIfExists(path.join(root, "dist"));
const removedDbFiles = removeDbFiles(path.join(root, "data"));
const removedDsStore = walkAndRemoveDsStore(root);

console.log(
  JSON.stringify(
    {
      removedDist,
      removedDbFiles,
      removedDsStore
    },
    null,
    2
  )
);
