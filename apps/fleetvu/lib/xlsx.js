import { deflateRawSync, inflateRawSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let crc = n;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  CRC_TABLE[n] = crc >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function writeZip(files, method = 0) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data));
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const checksum = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

function unzip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let eocd = -1;
  const min = Math.max(0, buf.length - 66000);
  for (let index = buf.length - 22; index >= min; index -= 1) {
    if (buf.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("That file is not an Excel workbook.");
  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cursor + 10);
    const compSize = buf.readUInt32LE(cursor + 20);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.slice(cursor + 46, cursor + 46 + nameLen).toString("utf8").replace(/\\/g, "/");
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.slice(start, start + compSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    if (!data) throw new Error("That Excel file uses a compression FleetVu cannot read.");
    files.set(name, data);
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function xml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function columnName(index) {
  let number = index + 1;
  let name = "";
  while (number > 0) {
    const rem = (number - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, column) => {
      if (value == null || value === "") return "";
      const ref = `${columnName(column)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="42" customWidth="1"/>
    <col min="2" max="4" width="28" customWidth="1"/>
  </cols>
  <sheetData>${body}</sheetData>
</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`;

export function buildWorkbook(sheets, method = 0) {
  const sheetFiles = sheets.map((sheet, index) => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    data: sheetXml(sheet.rows),
  }));
  const sheetTags = sheets.map((sheet, index) => {
    return `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
  }).join("");
  const sheetRels = sheets.map((_, index) => {
    return `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`;
  }).join("");
  const overrides = sheets.map((_, index) => {
    return `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join("");
  const files = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${overrides}
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetTags}</sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES },
    ...sheetFiles,
  ];
  return writeZip(files, method);
}

export function buildUnitsTemplate() {
  return buildWorkbook([
    {
      name: "How to fill this",
      rows: [
        ["How to add your units"],
        ["Use the Units sheet. Put one unit on each row. Save the file, upload it, and click Submit."],
        [""],
        ["1. Manufacturer"],
        ["Type Howen, Stonkam, or the company name printed on the unit."],
        [""],
        ["2. Model"],
        ["Type the model printed on the unit."],
        [""],
        ["3. Device ID"],
        ["Copy the device ID from the unit. Do not invent one."],
        [""],
        ["4. IMEI"],
        ["Type the IMEI from the unit label. It is 14 to 16 digits."],
      ],
    },
    {
      name: "Units",
      rows: [["Manufacturer", "Model", "Device ID", "IMEI"]],
    },
  ]);
}

function textOf(xmlText) {
  return [...String(xmlText).matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
}

function columnIndex(ref) {
  const letters = /^[A-Z]+/i.exec(ref || "A")?.[0].toUpperCase() || "A";
  let number = 0;
  for (const char of letters) number = number * 26 + (char.charCodeAt(0) - 64);
  return number - 1;
}

function sheetRows(sheetXmlText, shared) {
  const rows = [];
  for (const rowMatch of String(sheetXmlText).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    const cells = [...rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)];
    for (const cell of cells) {
      const attrs = cell[1];
      const body = cell[2] || "";
      const ref = /r="([^"]+)"/.exec(attrs)?.[1] || "";
      const index = ref ? columnIndex(ref) : values.length;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] || "";
      let value = "";
      if (type === "inlineStr") value = textOf(body);
      else if (type === "s") {
        const pointer = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || "");
        value = shared[pointer] || "";
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || "");
        if (/^\d+\.0+$/.test(value)) value = value.replace(/\.0+$/, "");
      }
      values[index] = value;
    }
    rows.push(Array.from(values, (value) => value || ""));
  }
  return rows;
}

function workbookSheets(files) {
  const workbook = files.get("xl/workbook.xml")?.toString("utf8") || "";
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const relMap = new Map();
  for (const tag of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(tag[0])?.[1];
    const target = /Target="([^"]+)"/.exec(tag[0])?.[1];
    if (!id || !target) continue;
    const clean = decodeXml(target).replace(/\\/g, "/");
    const path = clean.startsWith("/") ? clean.slice(1) : clean.startsWith("xl/") ? clean : `xl/${clean.replace(/^\.\//, "")}`;
    relMap.set(id, path);
  }
  const sheets = [];
  for (const tag of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(/name="([^"]+)"/.exec(tag[0])?.[1] || "");
    const id = /r:id="([^"]+)"/.exec(tag[0])?.[1];
    const path = relMap.get(id);
    if (path && files.has(path)) sheets.push({ name, xml: files.get(path).toString("utf8") });
  }
  return sheets;
}

export function readUnitRows(buffer) {
  const files = unzip(buffer);
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1]));
  const sheets = workbookSheets(files);
  if (sheets.length === 0) throw new Error("That workbook has no sheets.");
  const units = sheets.find((sheet) => sheet.name.trim().toLowerCase() === "units") || sheets[0];
  return sheetRows(units.xml, shared);
}
