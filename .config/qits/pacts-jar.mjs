#!/usr/bin/env node
// pacts-jar.mjs jar <tree> <out.jar> | pom <groupId> <artifactId> <version> | unpack <jar> <dir>
//
// THE PACT JAR, BUILT WITH WHAT node-base HAS (epic qits-546). The release step that publishes
// `eu.wohlben.qits:qits-landing-pacts-qits-projects` runs on node-base: node:24-alpine plus bash,
// curl and git. No zip, no JDK `jar`, no python3, no maven. A jar is a zip, and node has crc32, so
// this file writes one itself. The pom is a minimal one, printed.
//
//   jar <tree> <out.jar>   a zip of <tree> under the same relative path (`pacts/` in the repository
//                          is `pacts/` on the classpath), plus META-INF/MANIFEST.MF. Every
//                          directory gets its own entry: a class loader finds `pacts/` inside a jar
//                          only when the jar carries that entry, and qits-projects'
//                          ClasspathPactLoader asks for exactly that directory.
//   pom <g> <a> <v>        the pom, on stdout.
//   unpack <jar> <dir>     the reverse, for published-tree-changed.sh on an image with no unzip.
//                          Reads stored and deflated entries.
//
// THE JAR IS DETERMINISTIC: entries in byte order, stored (not deflated), every timestamp
// 1980-01-01 00:00. The same tree gives the same bytes. That matters twice. The maven store answers
// a re-PUT of identical bytes with an idempotent 201 and different bytes with a 403, so a re-run
// of a release can PUT again. And the change gate compares trees, so nothing here may depend on
// when or where the jar was built.
import { crc32, inflateRawSync } from 'node:zlib';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const die = (message) => {
  process.stderr.write(`pacts-jar: ${message}\n`);
  process.exit(1);
};

// 1980-01-01 00:00, the zip epoch, in DOS time and date.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8 = 0x0800;

/** Every file and directory under `tree`, as zip names (`/`-separated, directories end in `/`). */
function walk(tree) {
  const out = [];
  const visit = (dir) => {
    out.push({ name: `${dir.split(sep).join('/')}/`, data: Buffer.alloc(0) });
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) visit(path);
      else out.push({ name: path.split(sep).join('/'), data: readFileSync(path) });
    }
  };
  visit(tree);
  return out;
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    // extra, comment, disk, internal attributes, external attributes: all zero
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function jar(tree, out) {
  tree = tree.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!tree || tree.startsWith('/') || tree.split('/').includes('..')) {
    die(`the tree '${tree}' must be a relative, downward path`);
  }
  let files;
  try {
    files = walk(tree);
  } catch (e) {
    die(`cannot read ${tree}: ${e.message}`);
  }
  if (!files.some((f) => !f.name.endsWith('/'))) die(`${tree} holds no files`);
  const entries = [
    { name: 'META-INF/', data: Buffer.alloc(0) },
    { name: 'META-INF/MANIFEST.MF', data: Buffer.from('Manifest-Version: 1.0\r\n\r\n', 'utf8') },
    ...files,
  ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  writeFileSync(out, zip(entries));
}

function pom(groupId, artifactId, version) {
  for (const [what, value] of Object.entries({ groupId, artifactId, version })) {
    if (!/^[A-Za-z0-9._+-]+$/.test(value ?? '')) die(`'${value}' is not a ${what}`);
  }
  process.stdout.write(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<project xmlns="http://maven.apache.org/POM/4.0.0"',
      '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">',
      '  <modelVersion>4.0.0</modelVersion>',
      `  <groupId>${groupId}</groupId>`,
      `  <artifactId>${artifactId}</artifactId>`,
      `  <version>${version}</version>`,
      '  <packaging>jar</packaging>',
      '  <description>qits-landing\'s consumer pact with qits-projects: pacts/qits-landing-qits-projects.json on the classpath.</description>',
      '</project>',
      '',
    ].join('\n'),
  );
}

function unpack(jarFile, dir) {
  const bytes = readFileSync(jarFile);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) die(`${jarFile} is not a zip: no end of central directory`);
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const root = resolve(dir);
  for (let n = 0; n < count; n++) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) die(`${jarFile}: a broken central directory`);
    const method = bytes.readUInt16LE(at + 10);
    const compressed = bytes.readUInt32LE(at + 20);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const localAt = bytes.readUInt32LE(at + 42);
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    const target = resolve(root, name);
    if (target !== root && !target.startsWith(root + sep)) die(`${jarFile}: '${name}' escapes`);
    if (name.endsWith('/')) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    const dataAt =
      localAt + 30 + bytes.readUInt16LE(localAt + 26) + bytes.readUInt16LE(localAt + 28);
    const raw = bytes.subarray(dataAt, dataAt + compressed);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw);
    else die(`${jarFile}: '${name}' uses compression method ${method}`);
    if (data.length !== size) die(`${jarFile}: '${name}' is ${data.length} bytes, not ${size}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === 'jar' && args.length === 2) jar(args[0], args[1]);
else if (command === 'pom' && args.length === 3) pom(args[0], args[1], args[2]);
else if (command === 'unpack' && args.length === 2) unpack(args[0], args[1]);
else die('usage: pacts-jar.mjs jar <tree> <out.jar> | pom <groupId> <artifactId> <version> | unpack <jar> <dir>');
