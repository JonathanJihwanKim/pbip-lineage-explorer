var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../core/src/parser/tmdlParser.js
function parseTmdlModel(tmdlFiles, relationshipFiles = []) {
  const tables = [];
  const relationships = [];
  for (const { content, path } of tmdlFiles) {
    const parsed = parseTableFile(content, path);
    if (parsed && parsed.name) {
      tables.push(parsed);
    }
  }
  for (const { content } of relationshipFiles) {
    const rels = parseRelationships(content);
    relationships.push(...rels);
  }
  return { tables, relationships };
}
function getIndentLevel(line) {
  const match = line.match(/^(\t*)/);
  if (match && match[1].length > 0) {
    return match[1].length;
  }
  const spaceMatch = line.match(/^( +)/);
  if (spaceMatch) {
    return Math.floor(spaceMatch[1].length / 4) || (spaceMatch[1].length > 0 ? 1 : 0);
  }
  return 0;
}
function unquoteName(name) {
  if (name && name.startsWith("'") && name.endsWith("'")) {
    return name.slice(1, -1);
  }
  return name || "";
}
function parseTableFile(content, fileName) {
  const lines = content.split("\n").map((l) => l.replace(/\r$/, ""));
  const result = { name: "", columns: [], measures: [], calculatedColumns: [], partitions: [] };
  let tableName = "";
  for (const line of lines) {
    const tableMatch = line.match(/^table\s+(.+)$/);
    if (tableMatch) {
      tableName = unquoteName(tableMatch[1].trim());
      break;
    }
  }
  if (!tableName) {
    const pathParts = fileName.replace(/\\/g, "/").split("/");
    const file = pathParts[pathParts.length - 1];
    tableName = file.replace(/\.tmdl$/, "");
  }
  result.name = tableName;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = getIndentLevel(line);
    if (indent === 1 || indent === 0 && !trimmed.startsWith("table ")) {
      const colMatch = trimmed.match(/^column\s+(.+)$/);
      if (colMatch) {
        const col = parseColumnBlock(lines, i, unquoteName(colMatch[1].trim()));
        if (col.expression) {
          result.calculatedColumns.push(col);
        } else {
          result.columns.push(col);
        }
        i++;
        continue;
      }
      const measureMatch = trimmed.match(/^measure\s+(.+?)\s*=\s*(.*)$/);
      if (measureMatch) {
        const measureName = unquoteName(measureMatch[1].trim());
        const firstPart = measureMatch[2].trim();
        const daxExpr = extractDaxExpression(lines, i);
        result.measures.push({
          name: measureName,
          expression: daxExpr || firstPart,
          ...parseMeasureProperties(lines, i)
        });
        i++;
        continue;
      }
      const partMatch = trimmed.match(/^partition\s+(.+)$/);
      if (partMatch) {
        const partRaw = partMatch[1].trim();
        const partEqMatch = partRaw.match(/^(.+?)\s*=\s*(.*)$/);
        const partName = unquoteName((partEqMatch ? partEqMatch[1] : partRaw).trim());
        const partType = partEqMatch ? partEqMatch[2].trim().toLowerCase() : "";
        const partition = parsePartitionBlock(lines, i, partName, partType);
        result.partitions.push(partition);
        i++;
        continue;
      }
      if (trimmed === "refreshPolicy") {
        const rpSource = parseRefreshPolicyBlock(lines, i);
        if (rpSource) {
          result.refreshPolicySource = rpSource;
        }
        i++;
        continue;
      }
      if (trimmed === "calculationGroup") {
        result.calculationGroup = true;
        result.calculationItems = [];
        const cgIndent = indent;
        let j = i + 1;
        while (j < lines.length) {
          const cgLine = lines[j];
          const cgTrimmed = cgLine.trim();
          if (!cgTrimmed) {
            j++;
            continue;
          }
          const cgLineIndent = getIndentLevel(cgLine);
          if (cgLineIndent <= cgIndent) break;
          const ciMatch = cgTrimmed.match(/^calculationItem\s+(.+?)\s*=\s*(.*)$/);
          if (ciMatch) {
            const ciName = unquoteName(ciMatch[1].trim());
            const ciExpr = extractDaxExpression(lines, j);
            result.calculationItems.push({
              name: ciName,
              expression: ciExpr || ciMatch[2].trim()
            });
          }
          j++;
        }
        i = j;
        continue;
      }
    }
    i++;
  }
  return result;
}
function parseColumnBlock(lines, startIndex, name) {
  const col = { name, dataType: "", sourceColumn: "", expression: null };
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;
    const propMatch = trimmed.match(/^(\w+)\s*[:=]\s*(.+)$/);
    if (propMatch) {
      const key = propMatch[1].toLowerCase();
      const value = propMatch[2].trim();
      if (key === "datatype") col.dataType = value;
      else if (key === "sourcecolumn") col.sourceColumn = value;
      else if (key === "expression") col.expression = value;
    }
    i++;
  }
  return col;
}
function parseMeasureProperties(lines, startIndex) {
  const props = {};
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;
    const propMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
    if (propMatch) {
      const key = propMatch[1];
      props[key] = propMatch[2].trim();
    }
    i++;
  }
  return props;
}
function extractDaxExpression(lines, startIndex) {
  const startLine = lines[startIndex];
  const trimmed = startLine.trim();
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) return "";
  const firstPart = trimmed.substring(eqIndex + 1).trim();
  const baseIndent = getIndentLevel(startLine);
  const parts = [firstPart];
  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    const lineTrimmed = line.trim();
    if (!lineTrimmed) {
      i++;
      continue;
    }
    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;
    if (lineTrimmed.match(/^\w+\s*:/)) break;
    parts.push(lineTrimmed);
    i++;
  }
  return parts.join("\n").trim();
}
function parsePartitionBlock(lines, startIndex, name, type) {
  const partition = { name, type: type || "", mode: "", sourceExpression: null };
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;
    const modeMatch = trimmed.match(/^mode\s*[:=]\s*(.+)$/i);
    if (modeMatch) {
      partition.mode = modeMatch[1].trim().toLowerCase();
      i++;
      continue;
    }
    const sourceMatch = trimmed.match(/^source\s*=\s*(.*)$/i);
    if (sourceMatch) {
      const firstPart = sourceMatch[1].trim();
      const parts = firstPart ? [firstPart] : [];
      const sourceIndent = getIndentLevel(line);
      let j = i + 1;
      while (j < lines.length) {
        const sLine = lines[j];
        const sTrimmed = sLine.trim();
        if (!sTrimmed) {
          j++;
          continue;
        }
        const sIndent = getIndentLevel(sLine);
        if (sIndent <= sourceIndent) break;
        parts.push(sTrimmed);
        j++;
      }
      partition.sourceExpression = parts.join("\n").trim() || null;
      i = j;
      continue;
    }
    i++;
  }
  return partition;
}
function extractRenameColumns(mExpression) {
  const renameMap = /* @__PURE__ */ new Map();
  if (!mExpression) return renameMap;
  const renameBlockMatch = mExpression.match(/Table\.RenameColumns\s*\([^,]+,\s*\{([\s\S]*?)\}\s*\)/i);
  if (!renameBlockMatch) return renameMap;
  const block = renameBlockMatch[1];
  const pairPattern = /\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = pairPattern.exec(block)) !== null) {
    const oldName = m[1];
    const newName = m[2];
    renameMap.set(newName, oldName);
  }
  return renameMap;
}
function parseRefreshPolicyBlock(lines, startIndex) {
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;
    const sourceMatch = trimmed.match(/^sourceExpression\s*[:=]\s*(.*)$/i);
    if (sourceMatch) {
      const firstPart = sourceMatch[1].trim();
      const parts = firstPart ? [firstPart] : [];
      const sourceIndent = getIndentLevel(line);
      let j = i + 1;
      while (j < lines.length) {
        const sLine = lines[j];
        const sTrimmed = sLine.trim();
        if (!sTrimmed) {
          j++;
          continue;
        }
        const sIndent = getIndentLevel(sLine);
        if (sIndent <= sourceIndent) break;
        parts.push(sTrimmed);
        j++;
      }
      return parts.join("\n").trim() || null;
    }
    i++;
  }
  return null;
}
function extractMDataSource(mExpression) {
  if (!mExpression) return null;
  const result = { server: null, database: null, schema: null, sourceTable: null, type: null };
  const sqlMatch = mExpression.match(/Sql\.Database\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/i);
  if (sqlMatch) {
    result.type = "SQL";
    result.server = sqlMatch[1];
    result.database = sqlMatch[2];
  }
  if (result.server && result.server.includes(".fabric.microsoft.com")) {
    result.type = "Fabric/Lakehouse";
  }
  const schemaItemMatch = mExpression.match(/\{[^}]*Schema\s*=\s*"([^"]+)"[^}]*Item\s*=\s*"([^"]+)"[^}]*\}/i);
  if (schemaItemMatch) {
    result.schema = schemaItemMatch[1];
    result.sourceTable = schemaItemMatch[2];
  }
  if (!result.sourceTable) {
    const nameMatch = mExpression.match(/\{[^}]*Name\s*=\s*"([^"]+)"[^}]*\}/i);
    if (nameMatch) {
      result.sourceTable = nameMatch[1];
    }
  }
  if (!result.type) {
    const bqMatch = mExpression.match(/GoogleBigQuery\.Database\s*\(\s*(?:"([^"]*)"|\[([^\]]*)\]|(\w+))/i);
    if (bqMatch) {
      result.type = "BigQuery";
      result.server = bqMatch[1] || bqMatch[2] || bqMatch[3] || null;
      const nameMatches = [...mExpression.matchAll(/\{\s*\[\s*(?:Name|Schema)\s*=\s*"([^"]+)"\s*\]\s*\}/gi)];
      if (nameMatches.length >= 2) {
        result.database = nameMatches[0][1];
        result.sourceTable = nameMatches[1][1];
      } else if (nameMatches.length === 1) {
        result.database = nameMatches[0][1];
      }
      const bqSchemaItem = mExpression.match(/\{[^}]*Schema\s*=\s*"([^"]+)"[^}]*Item\s*=\s*"([^"]+)"[^}]*\}/i);
      if (bqSchemaItem) {
        result.database = bqSchemaItem[1];
        result.sourceTable = bqSchemaItem[2];
      }
    }
  }
  if (!result.sourceTable) {
    const nativeQueryMatch = mExpression.match(/Value\.NativeQuery\s*\([^,]*,\s*"([\s\S]*?)"\s*[,)]/i);
    if (nativeQueryMatch) {
      const sql = nativeQueryMatch[1];
      const fromMatch = sql.match(/FROM\s+`?([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2})`?/i);
      if (fromMatch) {
        const parts = fromMatch[1].split(".");
        if (parts.length === 3) {
          result.server = result.server || parts[0];
          result.database = parts[1];
          result.sourceTable = parts[2];
        } else if (parts.length === 2) {
          result.database = parts[0];
          result.sourceTable = parts[1];
        }
      }
      if (!result.type && (result.database || result.sourceTable)) {
        result.type = result.type || "SQL/NativeQuery";
      }
    }
  }
  if (!result.server) {
    const webMatch = mExpression.match(/Web\.Contents\s*\(\s*"([^"]+)"/i);
    if (webMatch) {
      result.type = "Web";
      result.server = webMatch[1];
    }
  }
  if (!result.type) {
    const fileMatch = mExpression.match(/(Excel\.Workbook|Csv\.Document|File\.Contents)\s*\(/i);
    if (fileMatch) {
      result.type = fileMatch[1].split(".")[0];
    }
  }
  return result.server || result.database || result.sourceTable ? result : null;
}
function parseExpressions(content) {
  const lines = content.split("\n").map((l) => l.replace(/\r$/, ""));
  const expressions = [];
  const parameters = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const exprMatch = trimmed.match(/^expression\s+(.+?)\s*=\s*(.*)$/);
    if (exprMatch) {
      const name = unquoteName(exprMatch[1].trim());
      const firstPart = exprMatch[2].trim();
      const literalMatch = firstPart.match(/^"([^"]*)"$/);
      if (literalMatch) {
        parameters.set(name, literalMatch[1]);
        expressions.push({ name, mExpression: literalMatch[1], kind: "parameter" });
        i++;
        continue;
      }
      const baseIndent = getIndentLevel(line);
      const parts = [];
      if (firstPart && firstPart !== "m") {
        parts.push(firstPart);
      }
      let j = i + 1;
      while (j < lines.length) {
        const eLine = lines[j];
        const eTrimmed = eLine.trim();
        if (!eTrimmed) {
          j++;
          continue;
        }
        const eIndent = getIndentLevel(eLine);
        if (eIndent <= baseIndent) {
          const propMatch = eTrimmed.match(/^(\w+)\s*[:=]/);
          if (propMatch && eIndent === baseIndent + 1) {
            j++;
            continue;
          }
          break;
        }
        if (eTrimmed.match(/^(annotation|lineageTag|queryGroup|description)\s*[:=]/i)) {
          j++;
          continue;
        }
        parts.push(eTrimmed);
        j++;
      }
      const mExpression = parts.join("\n").trim();
      expressions.push({ name, mExpression, kind: mExpression ? "expression" : "parameter" });
      if (!mExpression.includes("\n") && mExpression.startsWith('"') && mExpression.endsWith('"')) {
        parameters.set(name, mExpression.slice(1, -1));
      }
      i = j;
      continue;
    }
    i++;
  }
  return { expressions, parameters };
}
function parseRelationships(content) {
  const lines = content.split("\n").map((l) => l.replace(/\r$/, ""));
  const relationships = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = getIndentLevel(line);
    const relMatch = trimmed.match(/^relationship\s+(.+)$/);
    if (relMatch) {
      if (current) relationships.push(current);
      current = {
        name: unquoteName(relMatch[1].trim()),
        fromTable: "",
        fromColumn: "",
        toTable: "",
        toColumn: "",
        crossFilter: "single"
      };
      continue;
    }
    if (!current) continue;
    const inlineMatch = trimmed.match(/^(\w[\w\s']*)\[(\w[\w\s']*)\]\s*->\s*(\w[\w\s']*)\[(\w[\w\s']*)\]/);
    if (inlineMatch) {
      current.fromTable = unquoteName(inlineMatch[1].trim());
      current.fromColumn = unquoteName(inlineMatch[2].trim());
      current.toTable = unquoteName(inlineMatch[3].trim());
      current.toColumn = unquoteName(inlineMatch[4].trim());
      continue;
    }
    const propMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
    if (propMatch && indent > 0) {
      const key = propMatch[1].toLowerCase();
      const value = propMatch[2].trim();
      if (key === "fromtable") current.fromTable = unquoteName(value);
      else if (key === "totable") current.toTable = unquoteName(value);
      else if (key === "crossfilteringbehavior" || key === "crossfilter") current.crossFilter = value;
    }
    const fromColMatch = trimmed.match(/^fromColumn:\s*(.+)$/i);
    if (fromColMatch) {
      const ref = fromColMatch[1].trim();
      const bracketMatch = ref.match(/^(\w[\w\s']*)\[(\w[\w\s']*)\]/);
      const dotMatch = ref.match(/^(.+)\.(\w+)$/);
      if (bracketMatch) {
        current.fromTable = unquoteName(bracketMatch[1].trim());
        current.fromColumn = unquoteName(bracketMatch[2].trim());
      } else if (dotMatch) {
        current.fromTable = unquoteName(dotMatch[1].trim());
        current.fromColumn = unquoteName(dotMatch[2].trim());
      } else {
        current.fromColumn = unquoteName(ref);
      }
    }
    const toColMatch = trimmed.match(/^toColumn:\s*(.+)$/i);
    if (toColMatch) {
      const ref = toColMatch[1].trim();
      const bracketMatch = ref.match(/^(\w[\w\s']*)\[(\w[\w\s']*)\]/);
      const dotMatch = ref.match(/^(.+)\.(\w+)$/);
      if (bracketMatch) {
        current.toTable = unquoteName(bracketMatch[1].trim());
        current.toColumn = unquoteName(bracketMatch[2].trim());
      } else if (dotMatch) {
        current.toTable = unquoteName(dotMatch[1].trim());
        current.toColumn = unquoteName(dotMatch[2].trim());
      } else {
        current.toColumn = unquoteName(ref);
      }
    }
  }
  if (current) relationships.push(current);
  return relationships;
}
var init_tmdlParser = __esm({
  "../core/src/parser/tmdlParser.js"() {
  }
});

// ../core/src/parser/daxParser.js
function stripStringsAndComments(dax) {
  return dax.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\r\n]*/g, " ").replace(/"(?:[^"\\]|"")*"/g, " ");
}
function extractColumnRefs(dax) {
  const clean = stripStringsAndComments(dax);
  const pattern = /(?:'([^']+)'|([A-Za-z_]\w*))\[([^\]]+)\]/g;
  const refs = [];
  const seen = /* @__PURE__ */ new Set();
  let m;
  while ((m = pattern.exec(clean)) !== null) {
    const table = m[1] || m[2];
    const column = m[3];
    const key = `${table}[${column}]`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ table, column });
    }
  }
  return refs;
}
function extractMeasureRefs(dax) {
  const clean = stripStringsAndComments(dax);
  const pattern = /(?<![\w'])\[([^\]]+)\]/g;
  const refs = [];
  const seen = /* @__PURE__ */ new Set();
  let m;
  while ((m = pattern.exec(clean)) !== null) {
    const measure = m[1];
    if (!seen.has(measure)) {
      seen.add(measure);
      refs.push({ measure });
    }
  }
  return refs;
}
function extractTableRefs(dax) {
  const clean = stripStringsAndComments(dax);
  const funcList = TABLE_FUNCTIONS.join("|");
  const pattern = new RegExp(
    `(?:${funcList})\\s*\\(\\s*(?:'([^']+)'|([A-Za-z_]\\w*))`,
    "gi"
  );
  const refs = [];
  const seen = /* @__PURE__ */ new Set();
  let m;
  while ((m = pattern.exec(clean)) !== null) {
    const table = m[1] || m[2];
    if (table && !seen.has(table) && !isDAXKeyword(table)) {
      seen.add(table);
      refs.push(table);
    }
  }
  return refs;
}
function isDAXKeyword(name) {
  const keywords = /* @__PURE__ */ new Set([
    "TRUE",
    "FALSE",
    "BLANK",
    "NOT",
    "AND",
    "OR",
    "IN",
    "VAR",
    "RETURN",
    "IF",
    "SWITCH",
    "SELECTEDVALUE"
  ]);
  return keywords.has(name.toUpperCase());
}
function extractUseRelationshipRefs(dax) {
  const clean = stripStringsAndComments(dax);
  const pattern = /USERELATIONSHIP\s*\(\s*(?:'([^']+)'|([A-Za-z_]\w*))\[([^\]]+)\]\s*,\s*(?:'([^']+)'|([A-Za-z_]\w*))\[([^\]]+)\]\s*\)/gi;
  const refs = [];
  let m;
  while ((m = pattern.exec(clean)) !== null) {
    refs.push({
      fromTable: m[1] || m[2],
      fromColumn: m[3],
      toTable: m[4] || m[5],
      toColumn: m[6]
    });
  }
  return refs;
}
function parseDaxExpression(daxExpression) {
  if (!daxExpression || typeof daxExpression !== "string") {
    return { tableRefs: [], columnRefs: [], measureRefs: [], useRelationshipRefs: [] };
  }
  const columnRefs = extractColumnRefs(daxExpression);
  const measureRefs = extractMeasureRefs(daxExpression);
  const tableRefs = extractTableRefs(daxExpression);
  const useRelationshipRefs = extractUseRelationshipRefs(daxExpression);
  const tableSet = new Set(tableRefs);
  for (const col of columnRefs) {
    if (!tableSet.has(col.table)) {
      tableSet.add(col.table);
      tableRefs.push(col.table);
    }
  }
  return { tableRefs, columnRefs, measureRefs, useRelationshipRefs };
}
var TABLE_FUNCTIONS;
var init_daxParser = __esm({
  "../core/src/parser/daxParser.js"() {
    TABLE_FUNCTIONS = [
      "CALCULATE",
      "CALCULATETABLE",
      "FILTER",
      "SUMX",
      "AVERAGEX",
      "COUNTX",
      "MAXX",
      "MINX",
      "RANKX",
      "ADDCOLUMNS",
      "SELECTCOLUMNS",
      "RELATEDTABLE",
      "ALL",
      "ALLEXCEPT",
      "VALUES",
      "DISTINCT",
      "TOPN",
      "GENERATE",
      "TABLEOF",
      "NAMEOF",
      "SAMEPERIODLASTYEAR",
      "DATEADD",
      "DATESYTD",
      "DATESMTD",
      "DATESQTD"
    ];
  }
});

// ../core/src/parser/pbirParser.js
function parsePbirReport(visualFiles, pageFiles) {
  const pages = [];
  const visuals = [];
  for (const { path, content } of pageFiles) {
    try {
      const config = JSON.parse(content);
      const pageFolderId = extractPageIdFromPath(path);
      const pageName = extractPageName(path, config);
      pages.push({
        id: pageFolderId || pageName,
        name: pageName,
        displayName: config.displayName || config.name || pageName,
        order: config.ordinal ?? config.order ?? pages.length,
        path
      });
    } catch (err) {
      const pageName = extractPageName(path, null);
      const pageFolderId2 = extractPageIdFromPath(path);
      if (pageName) {
        pages.push({
          id: pageFolderId2 || pageName,
          name: pageName,
          displayName: pageName,
          order: pages.length,
          path
        });
      }
    }
  }
  for (const { path, content } of visualFiles) {
    try {
      const config = JSON.parse(content);
      const pageId = extractPageIdFromPath(path);
      const parsed = parseVisualConfig(config, pageId);
      parsed.path = path;
      visuals.push(parsed);
    } catch (err) {
      console.warn(`Failed to parse visual config: ${path}`, err);
    }
  }
  return { pages, visuals };
}
function extractPageName(path, config) {
  if (config && (config.displayName || config.name)) {
    return config.displayName || config.name;
  }
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const pageIdx = parts.findIndex((p) => p.toLowerCase() === "pages");
  if (pageIdx !== -1 && pageIdx + 1 < parts.length) {
    return parts[pageIdx + 1];
  }
  const jsonIdx = parts.length - 1;
  return parts[Math.max(0, jsonIdx - 1)];
}
function extractPageIdFromPath(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const pagesIdx = parts.findIndex((p) => p.toLowerCase() === "pages");
  if (pagesIdx !== -1 && pagesIdx + 1 < parts.length) {
    return parts[pagesIdx + 1];
  }
  return "";
}
function parseVisualConfig(config, pageName) {
  const visual = config.visual || config;
  const id = visual.id || config.id || config.name || "";
  const visualType = visual.visualType || visual.type || config.visualType || "unknown";
  let title = "";
  if (visual.title) {
    title = typeof visual.title === "string" ? visual.title : visual.title.text || "";
  }
  if (!title && visual.objects?.title?.properties?.text) {
    const textProp = visual.objects.title.properties.text;
    if (typeof textProp === "string") title = textProp;
    else if (textProp.expr?.Literal?.Value) title = textProp.expr.Literal.Value.replace(/^'|'$/g, "");
  }
  if (!title && visual.vcObjects?.title) {
    const titleArr = visual.vcObjects.title;
    if (Array.isArray(titleArr) && titleArr[0]?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, "");
    }
  }
  if (!title && visual.visualContainerObjects?.title) {
    const titleArr = visual.visualContainerObjects.title;
    if (Array.isArray(titleArr) && titleArr[0]?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, "");
    }
  }
  const fields = extractFieldReferences(visual, config);
  return {
    id,
    type: visualType,
    visualType,
    page: pageName,
    pageId: pageName,
    title,
    fields
  };
}
function extractFieldReferences(visualConfig, fullConfig) {
  const fields = [];
  const seen = /* @__PURE__ */ new Set();
  function addField(field) {
    const key = `${field.type}|${field.table}|${field.column || ""}|${field.measure || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      fields.push(field);
    }
  }
  const query = visualConfig.prototypeQuery || visualConfig.query;
  const sourceAliasMap = {};
  if (query?.From) {
    for (const from of query.From) {
      if (from.Name && from.Entity) {
        sourceAliasMap[from.Name] = from.Entity;
      }
    }
  }
  if (query?.Select) {
    for (const selectItem of query.Select) {
      const ref = extractFromSelectItem(selectItem, sourceAliasMap);
      if (ref) addField(ref);
    }
  }
  const queryState = visualConfig.query?.queryState || visualConfig.queryState;
  if (queryState) {
    for (const [role, roleState] of Object.entries(queryState)) {
      if (!roleState || typeof roleState !== "object") continue;
      const projections = roleState.projections;
      if (Array.isArray(projections)) {
        for (const proj of projections) {
          const ref = extractFromPbirProjection(proj, role);
          if (ref) addField(ref);
        }
      }
      const fieldParams = roleState.fieldParameters;
      if (Array.isArray(fieldParams)) {
        for (const fp of fieldParams) {
          const paramExpr = fp.parameterExpr || fp.ParameterExpr;
          if (!paramExpr) continue;
          const col = paramExpr.Column || paramExpr.column;
          if (!col) continue;
          const sourceRef = col.Expression?.SourceRef || col.expression?.sourceRef;
          const entity = sourceRef?.Entity || sourceRef?.entity || "";
          if (entity) {
            addField({ type: "fieldParameter", table: entity, column: null, measure: null, role });
          }
        }
      }
    }
  }
  const bindings = visualConfig.dataRoleBindings || visualConfig.columnBindings;
  if (bindings) {
    for (const [role, binding] of Object.entries(bindings)) {
      const items = Array.isArray(binding) ? binding : binding.items || binding.bindings || [binding];
      for (const item of items) {
        const ref = extractFromBinding(item, role);
        if (ref) addField(ref);
      }
    }
  }
  const filterConfig = fullConfig?.filterConfig?.filters || visualConfig.filterConfig?.filters || [];
  for (const filter of filterConfig) {
    if (filter.field) {
      const ref = extractFromPbirField(filter.field, "filter");
      if (ref) addField(ref);
    }
  }
  deepSearchForRefs(visualConfig.vcObjects, addField);
  deepSearchForRefs(visualConfig.visualContainerObjects, addField);
  deepSearchForRefs(visualConfig.dataTransforms, addField);
  return fields;
}
function extractFromPbirProjection(proj, role) {
  const field = proj?.field;
  if (!field) return null;
  return extractFromPbirField(field, role);
}
function extractFromPbirField(field, role) {
  if (!field) return null;
  if (field.Measure) {
    const entity = field.Measure.Expression?.SourceRef?.Entity || "";
    const property = field.Measure.Property || "";
    if (entity || property) {
      return { type: "measure", table: entity, column: null, measure: property, role: role || "" };
    }
  }
  if (field.Column) {
    const entity = field.Column.Expression?.SourceRef?.Entity || "";
    const property = field.Column.Property || "";
    if (entity || property) {
      return { type: "column", table: entity, column: property, measure: null, role: role || "" };
    }
  }
  if (field.Aggregation) {
    const expr = field.Aggregation.Expression;
    if (expr?.Column) {
      const entity = expr.Column.Expression?.SourceRef?.Entity || "";
      const property = expr.Column.Property || "";
      if (entity || property) {
        return { type: "column", table: entity, column: property, measure: null, role: role || "" };
      }
    }
  }
  return null;
}
function extractFromSelectItem(selectItem, sourceAliasMap = {}) {
  function resolveEntity(sourceRef) {
    if (!sourceRef) return "";
    if (sourceRef.Entity) return sourceRef.Entity;
    if (sourceRef.Source && sourceAliasMap[sourceRef.Source]) {
      return sourceAliasMap[sourceRef.Source];
    }
    return sourceRef.Source || "";
  }
  if (selectItem.Column) {
    const col = selectItem.Column;
    const entity = resolveEntity(col.Expression?.SourceRef);
    const property = col.Property || col.Name || "";
    if (entity || property) {
      return {
        type: "column",
        table: entity,
        column: property,
        measure: null,
        role: selectItem.Name || ""
      };
    }
  }
  if (selectItem.Measure) {
    const meas = selectItem.Measure;
    const entity = resolveEntity(meas.Expression?.SourceRef);
    const property = meas.Property || meas.Name || "";
    if (entity || property) {
      return {
        type: "measure",
        table: entity,
        column: null,
        measure: property,
        role: selectItem.Name || ""
      };
    }
  }
  if (selectItem.Aggregation) {
    const agg = selectItem.Aggregation;
    const expr = agg.Expression;
    if (expr?.Column) {
      const entity = resolveEntity(expr.Column.Expression?.SourceRef);
      const property = expr.Column.Property || "";
      if (entity || property) {
        return {
          type: "column",
          table: entity,
          column: property,
          measure: null,
          role: selectItem.Name || ""
        };
      }
    }
  }
  return null;
}
function extractFromBinding(item, role) {
  if (!item || typeof item !== "object") return null;
  if (item.table && (item.column || item.measure)) {
    return {
      type: item.measure ? "measure" : "column",
      table: item.table,
      column: item.column || null,
      measure: item.measure || null,
      role
    };
  }
  const expr = item.Expression || item.expression || item;
  if (expr?.SourceRef?.Entity) {
    return {
      type: item.measure || item.Measure ? "measure" : "column",
      table: expr.SourceRef.Entity,
      column: item.Property || item.column || null,
      measure: item.Property || item.measure || null,
      role
    };
  }
  return null;
}
function deepSearchForRefs(obj, addField, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 15) return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepSearchForRefs(item, addField, depth + 1);
    }
    return;
  }
  if (obj.SourceRef?.Entity && obj.Property) {
    addField({
      type: "column",
      // default; caller context may override
      table: obj.SourceRef.Entity,
      column: obj.Property,
      measure: null,
      role: ""
    });
  }
  if (obj.Column?.Expression?.SourceRef?.Entity) {
    addField({
      type: "column",
      table: obj.Column.Expression.SourceRef.Entity,
      column: obj.Column.Property || "",
      measure: null,
      role: obj.Name || ""
    });
  }
  if (obj.Measure?.Expression?.SourceRef?.Entity) {
    addField({
      type: "measure",
      table: obj.Measure.Expression.SourceRef.Entity,
      column: null,
      measure: obj.Measure.Property || "",
      role: obj.Name || ""
    });
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      deepSearchForRefs(value, addField, depth + 1);
    }
  }
}
var init_pbirParser = __esm({
  "../core/src/parser/pbirParser.js"() {
  }
});

// ../core/src/utils/constants.js
var NODE_TYPES, EDGE_TYPES, ENRICHMENT_TYPES, LAYER_COLORS;
var init_constants = __esm({
  "../core/src/utils/constants.js"() {
    NODE_TYPES = {
      TABLE: "table",
      COLUMN: "column",
      MEASURE: "measure",
      VISUAL: "visual",
      PAGE: "page",
      SOURCE: "source",
      EXPRESSION: "expression"
    };
    EDGE_TYPES = {
      VISUAL_TO_FIELD: "visual_to_field",
      MEASURE_TO_MEASURE: "measure_to_measure",
      MEASURE_TO_COLUMN: "measure_to_column",
      COLUMN_TO_TABLE: "column_to_table",
      TABLE_RELATIONSHIP: "table_relationship",
      VISUAL_TO_PAGE: "visual_to_page",
      FIELD_PARAM_TO_FIELD: "field_param_to_field",
      TABLE_TO_SOURCE: "table_to_source",
      CALC_COLUMN_TO_COLUMN: "calc_column_to_column",
      CALC_COLUMN_TO_MEASURE: "calc_column_to_measure",
      MEASURE_TO_USERELATIONSHIP: "measure_to_userelationship",
      TABLE_TO_EXPRESSION: "table_to_expression",
      EXPRESSION_TO_SOURCE: "expression_to_source",
      COLUMN_TO_SOURCE_COLUMN: "column_to_source_column"
    };
    ENRICHMENT_TYPES = {
      FIELD_PARAMETER: "field_parameter",
      CALCULATION_GROUP: "calculation_group"
    };
    LAYER_COLORS = {
      visual: "#4caf50",
      measure: "#ff9800",
      subMeasure: "#ffb74d",
      column: "#9c27b0",
      expression: "#795548",
      source: "#607d8b"
    };
  }
});

// ../core/src/parser/enrichment.js
function detectFieldParameter(table) {
  const result = { isFieldParam: false, referencedFields: [], switchMeasure: null };
  if (!table) return result;
  const columns = table.columns || [];
  const measures = table.measures || [];
  const nameofPattern = /NAMEOF\s*\(\s*(?:'([^']+)'\s*\[([^\]]+)\]|\[([^\]]+)\])\s*\)/gi;
  const nameofFields = [];
  for (const col of columns) {
    const expr = col.expression || col.daxExpression || "";
    let m;
    nameofPattern.lastIndex = 0;
    while ((m = nameofPattern.exec(expr)) !== null) {
      if (m[1] && m[2]) {
        nameofFields.push({ name: m[2], reference: `'${m[1]}'[${m[2]}]` });
      } else if (m[3]) {
        nameofFields.push({ name: m[3], reference: `[${m[3]}]` });
      }
    }
  }
  const partitions = table.partitions || [];
  for (const partition of partitions) {
    const src = partition.sourceExpression || "";
    let m;
    nameofPattern.lastIndex = 0;
    while ((m = nameofPattern.exec(src)) !== null) {
      if (m[1] && m[2]) {
        nameofFields.push({ name: m[2], reference: `'${m[1]}'[${m[2]}]` });
      } else if (m[3]) {
        nameofFields.push({ name: m[3], reference: `[${m[3]}]` });
      }
    }
  }
  if (nameofFields.length === 0) return result;
  result.isFieldParam = true;
  result.referencedFields = nameofFields;
  for (const measure of measures) {
    const expr = measure.expression || measure.daxExpression || "";
    if (/SWITCH\s*\(\s*SELECTEDVALUE\s*\(/i.test(expr)) {
      result.switchMeasure = measure.name;
      const switchBranchPattern = /,\s*(?:\d+|"[^"]*")\s*,\s*(?:'([^']+)'\s*\[([^\]]+)\]|\[([^\]]+)\])/g;
      let branchMatch;
      while ((branchMatch = switchBranchPattern.exec(expr)) !== null) {
        const name = branchMatch[2] || branchMatch[3];
        let reference;
        if (branchMatch[1] && branchMatch[2]) {
          reference = `'${branchMatch[1]}'[${branchMatch[2]}]`;
        } else if (branchMatch[3]) {
          reference = `[${branchMatch[3]}]`;
        }
        if (name && !result.referencedFields.some((f) => f.name === name)) {
          result.referencedFields.push({ name, reference });
        }
      }
      break;
    }
  }
  return result;
}
function detectCalculationGroup(table) {
  const result = { isCalcGroup: false, calculationItems: [] };
  if (!table) return result;
  const props = table.properties || {};
  if (props.calculationGroup || table.calculationGroup) {
    result.isCalcGroup = true;
  }
  const allExprs = [
    ...(table.columns || []).map((c) => c.expression || c.daxExpression || ""),
    ...(table.measures || []).map((m) => m.expression || m.daxExpression || "")
  ];
  for (const expr of allExprs) {
    if (/CALCULATIONGROUP\s*\(/i.test(expr)) {
      result.isCalcGroup = true;
      break;
    }
  }
  if (table.calculationItems && Array.isArray(table.calculationItems)) {
    result.isCalcGroup = true;
    result.calculationItems = table.calculationItems.map((item) => ({
      name: item.name || "",
      expression: item.expression || item.daxExpression || ""
    }));
  }
  return result;
}
function detectEnrichments(tables, measures) {
  const fieldParameters = [];
  const calculationGroups = [];
  if (!tables || !Array.isArray(tables)) {
    return { fieldParameters, calculationGroups };
  }
  for (const table of tables) {
    const fpResult = detectFieldParameter(table);
    if (fpResult.isFieldParam) {
      fieldParameters.push({
        tableName: table.name,
        fields: fpResult.referencedFields,
        switchMeasure: fpResult.switchMeasure
      });
    }
    const cgResult = detectCalculationGroup(table);
    if (cgResult.isCalcGroup) {
      calculationGroups.push({
        tableName: table.name,
        items: cgResult.calculationItems
      });
    }
  }
  return { fieldParameters, calculationGroups };
}
function applyEnrichments(graph2, enrichments2) {
  if (!graph2 || !enrichments2) return graph2;
  const { fieldParameters = [], calculationGroups = [] } = enrichments2;
  const fpMap = /* @__PURE__ */ new Map();
  for (const fp of fieldParameters) {
    fpMap.set(fp.tableName, fp);
  }
  const cgMap = /* @__PURE__ */ new Map();
  for (const cg of calculationGroups) {
    cgMap.set(cg.tableName, cg);
  }
  for (const node of graph2.nodes.values()) {
    const tableName = node.metadata?.table || node.name || node.id;
    if (fpMap.has(tableName)) {
      const fp = fpMap.get(tableName);
      node.metadata = node.metadata || {};
      node.metadata.enrichmentType = ENRICHMENT_TYPES.FIELD_PARAMETER;
      node.metadata.badge = "FP";
      node.metadata.fieldParameter = {
        fields: fp.fields,
        switchMeasure: fp.switchMeasure
      };
    }
    if (cgMap.has(tableName)) {
      const cg = cgMap.get(tableName);
      node.metadata = node.metadata || {};
      node.metadata.enrichmentType = ENRICHMENT_TYPES.CALCULATION_GROUP;
      node.metadata.badge = "CG";
      node.metadata.calculationGroup = {
        items: cg.items
      };
    }
  }
  return graph2;
}
var init_enrichment = __esm({
  "../core/src/parser/enrichment.js"() {
    init_constants();
  }
});

// ../core/src/parser/projectStructure.js
function identifyProjectStructure(files) {
  const tmdlFiles = [];
  const visualFiles = [];
  const pageFiles = [];
  const relationshipFiles = [];
  const expressionFiles = [];
  for (const [path, content] of files) {
    const lowerPath = path.toLowerCase();
    if (lowerPath.endsWith(".tmdl")) {
      if (lowerPath.includes("relationship")) {
        relationshipFiles.push({ path, content });
      } else if (lowerPath.endsWith("/expressions.tmdl") || lowerPath === "expressions.tmdl" || lowerPath.endsWith("\\expressions.tmdl")) {
        expressionFiles.push({ path, content });
      } else {
        tmdlFiles.push({ path, content });
      }
    } else if (lowerPath.endsWith(".json")) {
      if (lowerPath.includes("/visuals/") && lowerPath.endsWith("visual.json")) {
        visualFiles.push({ path, content });
      } else if (lowerPath.endsWith("/page.json") || lowerPath.includes("/pages/") && lowerPath.endsWith(".json")) {
        pageFiles.push({ path, content });
      } else if (lowerPath.endsWith("/report.json") || lowerPath.endsWith("/definition.pbir")) {
        pageFiles.push({ path, content });
      }
    } else if (lowerPath.endsWith(".pbir")) {
      pageFiles.push({ path, content });
    }
  }
  return { tmdlFiles, visualFiles, pageFiles, relationshipFiles, expressionFiles };
}
function findDefinitionPbir(files) {
  for (const [path] of files) {
    if (path.toLowerCase() === "definition.pbir" || path.toLowerCase().endsWith("/definition.pbir")) {
      return path;
    }
  }
  return null;
}
function parseSemanticModelReference(content) {
  try {
    const config = JSON.parse(content);
    const byPath = config?.datasetReference?.byPath?.path;
    if (byPath) return byPath;
    return null;
  } catch {
    return null;
  }
}
function isRelevantFile(filename) {
  const ext = filename.includes(".") ? "." + filename.split(".").pop().toLowerCase() : "";
  return RELEVANT_EXTENSIONS.has(ext);
}
var RELEVANT_EXTENSIONS;
var init_projectStructure = __esm({
  "../core/src/parser/projectStructure.js"() {
    RELEVANT_EXTENSIONS = /* @__PURE__ */ new Set([".tmdl", ".json", ".pbir", ".platform"]);
  }
});

// ../core/src/graph/graphBuilder.js
function createNode(id, name, type, metadata = {}) {
  return { id, name, type, metadata, enrichment: null };
}
function createEdge(sourceId, targetId, type) {
  return { source: sourceId, target: targetId, type };
}
function extractDaxReferences(expression, currentTable, allNodes) {
  if (!expression) return [];
  const refs = [];
  const qualifiedPattern = /'?([^'[\]]+)'?\[([^\]]+)\]/g;
  let match;
  while ((match = qualifiedPattern.exec(expression)) !== null) {
    const table = match[1].trim();
    const field = match[2].trim();
    const colId = `column::${table}.${field}`;
    const measureId = `measure::${table}.${field}`;
    if (allNodes.has(measureId)) {
      refs.push(measureId);
    } else if (allNodes.has(colId)) {
      refs.push(colId);
    }
  }
  const unqualifiedPattern = /(?<!'[^']*)\[([^\]]+)\]/g;
  while ((match = unqualifiedPattern.exec(expression)) !== null) {
    const field = match[1].trim();
    const measureId = `measure::${currentTable}.${field}`;
    const colId = `column::${currentTable}.${field}`;
    if (allNodes.has(measureId) && !refs.includes(measureId)) {
      refs.push(measureId);
    } else if (allNodes.has(colId) && !refs.includes(colId)) {
      refs.push(colId);
    } else {
      let found = false;
      for (const [nodeId, node] of allNodes) {
        if (node.type === "measure" && node.name === field && nodeId !== `measure::${currentTable}.${field}`) {
          if (!refs.includes(nodeId)) {
            refs.push(nodeId);
            found = true;
            break;
          }
        }
      }
      if (!found) {
        for (const [nodeId, node] of allNodes) {
          if (node.type === "column" && node.name === field && nodeId !== `column::${currentTable}.${field}`) {
            if (!refs.includes(nodeId)) {
              refs.push(nodeId);
              break;
            }
          }
        }
      }
    }
  }
  return refs;
}
function buildAdjacency(edges) {
  const upstream = /* @__PURE__ */ new Map();
  const downstream = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (!upstream.has(edge.source)) upstream.set(edge.source, []);
    upstream.get(edge.source).push(edge.target);
    if (!downstream.has(edge.target)) downstream.set(edge.target, []);
    downstream.get(edge.target).push(edge.source);
  }
  return { upstream, downstream };
}
function buildGraph(parsedModel, parsedReport, enrichments2) {
  const nodes = /* @__PURE__ */ new Map();
  const edges = [];
  if (parsedModel && parsedModel.tables) {
    let resolveParameters = function(mExpr) {
      if (!mExpr || pqParameters.size === 0) return mExpr;
      let resolved = mExpr;
      for (const [paramName, paramValue] of pqParameters) {
        const paramRegex = new RegExp(`(?<![\\w"'])\\b${paramName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?![\\w"'])`, "g");
        resolved = resolved.replace(paramRegex, `"${paramValue}"`);
      }
      return resolved;
    };
    for (const table of parsedModel.tables) {
      const tableId = `table::${table.name}`;
      nodes.set(tableId, createNode(tableId, table.name, NODE_TYPES.TABLE, { table: table.name }));
      if (table.columns) {
        for (const col of table.columns) {
          const colId = `column::${table.name}.${col.name}`;
          nodes.set(colId, createNode(colId, col.name, NODE_TYPES.COLUMN, {
            table: table.name,
            dataType: col.dataType,
            sourceColumn: col.sourceColumn,
            expression: col.expression
          }));
          edges.push(createEdge(colId, tableId, EDGE_TYPES.COLUMN_TO_TABLE));
        }
      }
      if (table.measures) {
        for (const measure of table.measures) {
          const measureId = `measure::${table.name}.${measure.name}`;
          nodes.set(measureId, createNode(measureId, measure.name, NODE_TYPES.MEASURE, {
            table: table.name,
            expression: measure.expression
          }));
        }
      }
    }
    for (const table of parsedModel.tables) {
      if (table.measures) {
        for (const measure of table.measures) {
          const measureId = `measure::${table.name}.${measure.name}`;
          const refs = extractDaxReferences(measure.expression, table.name, nodes);
          for (const refId of refs) {
            if (refId === measureId) continue;
            const refNode = nodes.get(refId);
            if (refNode) {
              const edgeType = refNode.type === NODE_TYPES.MEASURE ? EDGE_TYPES.MEASURE_TO_MEASURE : EDGE_TYPES.MEASURE_TO_COLUMN;
              edges.push(createEdge(measureId, refId, edgeType));
            }
          }
          const urRefs = extractUseRelationshipRefs(measure.expression || "");
          for (const ur of urRefs) {
            const fromColId = `column::${ur.fromTable}.${ur.fromColumn}`;
            const toColId = `column::${ur.toTable}.${ur.toColumn}`;
            if (nodes.has(fromColId)) {
              edges.push(createEdge(measureId, fromColId, EDGE_TYPES.MEASURE_TO_USERELATIONSHIP));
            }
            if (nodes.has(toColId)) {
              edges.push(createEdge(measureId, toColId, EDGE_TYPES.MEASURE_TO_USERELATIONSHIP));
            }
          }
        }
      }
      if (table.columns) {
        for (const col of table.columns) {
          if (col.expression) {
            const colId = `column::${table.name}.${col.name}`;
            const refs = extractDaxReferences(col.expression, table.name, nodes);
            for (const refId of refs) {
              if (refId === colId) continue;
              if (nodes.has(refId)) {
                const refNode = nodes.get(refId);
                const edgeType = refNode.type === NODE_TYPES.MEASURE ? EDGE_TYPES.CALC_COLUMN_TO_MEASURE : EDGE_TYPES.CALC_COLUMN_TO_COLUMN;
                edges.push(createEdge(colId, refId, edgeType));
              }
            }
          }
        }
      }
    }
    if (parsedModel.relationships) {
      for (const rel of parsedModel.relationships) {
        const fromTable = `table::${rel.fromTable}`;
        const toTable = `table::${rel.toTable}`;
        if (nodes.has(fromTable) && nodes.has(toTable)) {
          edges.push(createEdge(fromTable, toTable, EDGE_TYPES.TABLE_RELATIONSHIP));
        }
      }
    }
    const pqParameters = parsedModel.parameters || /* @__PURE__ */ new Map();
    const expressionMap = /* @__PURE__ */ new Map();
    if (parsedModel.expressions) {
      for (const expr of parsedModel.expressions) {
        if (expr.kind === "expression") {
          const exprId = `expression::${expr.name}`;
          nodes.set(exprId, createNode(exprId, expr.name, NODE_TYPES.EXPRESSION, {
            mExpression: expr.mExpression
          }));
          expressionMap.set(expr.name, expr);
          const resolvedExpr = resolveParameters(expr.mExpression);
          const ds = extractMDataSource(resolvedExpr);
          if (ds) {
            const sourceKey = ds.database ? `${(ds.server || "").toLowerCase()}/${ds.database}` : (ds.server || "").toLowerCase();
            if (sourceKey) {
              const sourceId = `source::${sourceKey}`;
              if (!nodes.has(sourceId)) {
                const displayName = ds.database || ds.server || sourceKey;
                nodes.set(sourceId, createNode(sourceId, displayName, NODE_TYPES.SOURCE, {
                  server: ds.server,
                  database: ds.database,
                  sourceType: ds.type
                }));
              }
              edges.push(createEdge(exprId, sourceId, EDGE_TYPES.EXPRESSION_TO_SOURCE));
            }
            const exprNode = nodes.get(exprId);
            if (exprNode) {
              exprNode.metadata.dataSource = ds;
            }
          }
        }
      }
    }
    const sourceNodeCache = /* @__PURE__ */ new Map();
    for (const table of parsedModel.tables) {
      const sourceExpressions = [];
      for (const partition of table.partitions || []) {
        if (partition.sourceExpression) {
          sourceExpressions.push(partition);
        }
      }
      if (sourceExpressions.length === 0 && table.refreshPolicySource) {
        sourceExpressions.push({ sourceExpression: table.refreshPolicySource, mode: "import" });
      }
      for (const partition of sourceExpressions) {
        if (!partition.sourceExpression) continue;
        const resolvedExpr = resolveParameters(partition.sourceExpression);
        const ds = extractMDataSource(resolvedExpr);
        if (!ds) continue;
        const sourceKey = ds.database ? `${(ds.server || "").toLowerCase()}/${ds.database}` : (ds.server || "").toLowerCase();
        if (!sourceKey) continue;
        const sourceId = `source::${sourceKey}`;
        if (!sourceNodeCache.has(sourceId)) {
          const displayName = ds.database || ds.server || sourceKey;
          nodes.set(sourceId, createNode(sourceId, displayName, NODE_TYPES.SOURCE, {
            server: ds.server,
            database: ds.database,
            sourceType: ds.type
          }));
          sourceNodeCache.set(sourceId, true);
        }
        const tableId = `table::${table.name}`;
        edges.push(createEdge(tableId, sourceId, EDGE_TYPES.TABLE_TO_SOURCE));
        const tableNode = nodes.get(tableId);
        if (tableNode) {
          tableNode.metadata.dataSource = {
            server: ds.server,
            database: ds.database,
            schema: ds.schema,
            sourceTable: ds.sourceTable,
            sourceType: ds.type,
            mode: partition.mode
          };
          const renameMap = extractRenameColumns(resolvedExpr);
          if (renameMap.size > 0) {
            tableNode.metadata.renameMap = Object.fromEntries(renameMap);
          }
        }
        const exprRefMatch = partition.sourceExpression.match(/^\s*(\w[\w_]*)\s*$/);
        if (exprRefMatch && expressionMap.has(exprRefMatch[1])) {
          const exprId = `expression::${exprRefMatch[1]}`;
          if (nodes.has(exprId)) {
            edges.push(createEdge(tableId, exprId, EDGE_TYPES.TABLE_TO_EXPRESSION));
          }
        }
      }
    }
  }
  if (parsedModel && parsedModel.tables) {
    for (const table of parsedModel.tables) {
      const tableId = `table::${table.name}`;
      const tableNode = nodes.get(tableId);
      if (!tableNode?.metadata?.dataSource) continue;
      const renameMap = tableNode.metadata.renameMap || {};
      const ds = tableNode.metadata.dataSource;
      for (const col of table.columns || []) {
        const colId = `column::${table.name}.${col.name}`;
        const colNode = nodes.get(colId);
        if (!colNode) continue;
        const sourceCol = col.sourceColumn || col.name;
        const originalCol = renameMap[sourceCol] || sourceCol;
        colNode.metadata.sourceColumn = sourceCol;
        colNode.metadata.originalSourceColumn = originalCol;
        colNode.metadata.wasRenamed = originalCol !== sourceCol;
        if (ds.sourceTable) {
          const fullTable = ds.schema ? `${ds.schema}.${ds.sourceTable}` : ds.sourceTable;
          colNode.metadata.sourceTableFull = `${fullTable}.${originalCol}`;
          colNode.metadata.sourceTablePath = fullTable;
        }
      }
    }
  }
  if (parsedReport) {
    if (parsedReport.pages) {
      for (const page of parsedReport.pages) {
        const pageId = `page::${page.id}`;
        nodes.set(pageId, createNode(pageId, page.name, NODE_TYPES.PAGE, { pageId: page.id }));
      }
    }
    if (parsedReport.visuals) {
      for (const visual of parsedReport.visuals) {
        const visualId = `visual::${visual.pageId}/${visual.id}`;
        nodes.set(visualId, createNode(visualId, visual.title || visual.visualType, NODE_TYPES.VISUAL, {
          visualType: visual.visualType,
          pageId: visual.pageId
        }));
        const pageId = `page::${visual.pageId}`;
        if (nodes.has(pageId)) {
          edges.push(createEdge(visualId, pageId, EDGE_TYPES.VISUAL_TO_PAGE));
        }
        const pageNode = nodes.get(pageId);
        if (pageNode) {
          const vNode = nodes.get(visualId);
          if (vNode) vNode.metadata.pageName = pageNode.name;
        }
        if (visual.fields) {
          for (const field of visual.fields) {
            let fieldId;
            if (field.type === "fieldParameter" && field.table) {
              const fpTableId = `table::${field.table}`;
              if (nodes.has(fpTableId)) {
                edges.push(createEdge(visualId, fpTableId, EDGE_TYPES.VISUAL_TO_FIELD));
              }
              continue;
            } else if (field.type === "measure" && field.table && field.measure) {
              fieldId = `measure::${field.table}.${field.measure}`;
            } else if (field.table && field.column) {
              fieldId = `column::${field.table}.${field.column}`;
            }
            if (fieldId) {
              if (!nodes.has(fieldId)) {
                const placeholderName = field.measure || field.column || "unknown";
                const placeholderType = field.type === "measure" ? NODE_TYPES.MEASURE : NODE_TYPES.COLUMN;
                nodes.set(fieldId, createNode(fieldId, placeholderName, placeholderType, {
                  table: field.table,
                  placeholder: true
                }));
                const tableId = `table::${field.table}`;
                if (field.table && !nodes.has(tableId)) {
                  nodes.set(tableId, createNode(tableId, field.table, NODE_TYPES.TABLE, {
                    table: field.table,
                    placeholder: true
                  }));
                }
                if (field.table && placeholderType === NODE_TYPES.COLUMN) {
                  edges.push(createEdge(fieldId, tableId, EDGE_TYPES.COLUMN_TO_TABLE));
                }
              }
              edges.push(createEdge(visualId, fieldId, EDGE_TYPES.VISUAL_TO_FIELD));
            }
          }
        }
      }
    }
  }
  if (enrichments2) {
    if (enrichments2.fieldParameters) {
      for (const fp of enrichments2.fieldParameters) {
        const tableId = `table::${fp.tableName}`;
        const tableNode = nodes.get(tableId);
        if (tableNode) {
          tableNode.enrichment = { type: "field_parameter", data: fp };
        }
        const refPattern = /'([^']+)'\[([^\]]+)\]/;
        for (const field of fp.fields || []) {
          const refMatch = field.reference?.match(refPattern);
          if (!refMatch) continue;
          const refTable = refMatch[1];
          const refField = refMatch[2];
          const colId = `column::${refTable}.${refField}`;
          const measureId = `measure::${refTable}.${refField}`;
          const targetId = nodes.has(measureId) ? measureId : nodes.has(colId) ? colId : null;
          if (targetId) {
            edges.push(createEdge(tableId, targetId, EDGE_TYPES.FIELD_PARAM_TO_FIELD));
          }
        }
      }
    }
    if (enrichments2.calculationGroups) {
      for (const cg of enrichments2.calculationGroups) {
        const nodeId = `table::${cg.tableName}`;
        const node = nodes.get(nodeId);
        if (node) {
          node.enrichment = { type: "calculation_group", data: cg };
        }
      }
    }
  }
  const adjacency = buildAdjacency(edges);
  const graph2 = { nodes, edges, adjacency };
  graph2.stats = computeStats(graph2);
  return graph2;
}
function computeStats(graph2) {
  const counts = { tables: 0, columns: 0, measures: 0, visuals: 0, pages: 0, sources: 0, expressions: 0 };
  for (const node of graph2.nodes.values()) {
    switch (node.type) {
      case NODE_TYPES.TABLE:
        counts.tables++;
        break;
      case NODE_TYPES.COLUMN:
        counts.columns++;
        break;
      case NODE_TYPES.MEASURE:
        counts.measures++;
        break;
      case NODE_TYPES.VISUAL:
        counts.visuals++;
        break;
      case NODE_TYPES.PAGE:
        counts.pages++;
        break;
      case NODE_TYPES.SOURCE:
        counts.sources++;
        break;
      case NODE_TYPES.EXPRESSION:
        counts.expressions++;
        break;
    }
  }
  let orphanedMeasures = 0;
  const downstream = graph2.adjacency ? graph2.adjacency.downstream : /* @__PURE__ */ new Map();
  for (const node of graph2.nodes.values()) {
    if (node.type === NODE_TYPES.MEASURE) {
      if (!downstream.has(node.id) || downstream.get(node.id).length === 0) {
        orphanedMeasures++;
      }
    }
  }
  return {
    tables: counts.tables,
    columns: counts.columns,
    measures: counts.measures,
    visuals: counts.visuals,
    pages: counts.pages,
    sources: counts.sources,
    edges: graph2.edges.length,
    orphanedMeasures
  };
}
var init_graphBuilder = __esm({
  "../core/src/graph/graphBuilder.js"() {
    init_constants();
    init_tmdlParser();
    init_daxParser();
  }
});

// ../core/src/graph/impactAnalysis.js
function bfsTraverse(startId, adjacencyMap) {
  const visited = /* @__PURE__ */ new Set();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = adjacencyMap.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && neighbor !== startId) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited;
}
function getUpstream(nodeId, adjacency) {
  return bfsTraverse(nodeId, adjacency.upstream);
}
function getDownstream(nodeId, adjacency) {
  return bfsTraverse(nodeId, adjacency.downstream);
}
function analyzeImpact(nodeId, graph2) {
  const node = graph2.nodes.get(nodeId) || null;
  const upstream = getUpstream(nodeId, graph2.adjacency);
  const downstream = getDownstream(nodeId, graph2.adjacency);
  return { upstream, downstream, node };
}
function findOrphans(graph2) {
  const orphans = [];
  for (const node of graph2.nodes.values()) {
    if (node.type === "measure") {
      const downstream = getDownstream(node.id, graph2.adjacency);
      const reachesVisual = [...downstream].some((id) => {
        const n = graph2.nodes.get(id);
        return n && n.type === "visual";
      });
      if (!reachesVisual) {
        orphans.push(node.id);
      }
    }
  }
  return orphans;
}
function exportImpactReport(nodeId, graph2, format = "json") {
  const { upstream, downstream, node } = analyzeImpact(nodeId, graph2);
  const upstreamNodes = [...upstream].map((id) => {
    const n = graph2.nodes.get(id);
    return n ? { id: n.id, name: n.name, type: n.type } : { id };
  });
  const downstreamNodes = [...downstream].map((id) => {
    const n = graph2.nodes.get(id);
    return n ? { id: n.id, name: n.name, type: n.type } : { id };
  });
  if (format === "markdown") {
    const lines = [];
    lines.push(`# Impact Report: ${node ? node.name : nodeId}`);
    lines.push("");
    if (node) {
      lines.push(`- **Type**: ${node.type}`);
      lines.push(`- **ID**: ${node.id}`);
      lines.push("");
    }
    lines.push(`## Upstream Dependencies (${upstreamNodes.length})`);
    lines.push("");
    if (upstreamNodes.length === 0) {
      lines.push("_None_");
    } else {
      for (const n of upstreamNodes) {
        lines.push(`- \`${n.type || "unknown"}\` **${n.name || n.id}**`);
      }
    }
    lines.push("");
    lines.push(`## Downstream Dependents (${downstreamNodes.length})`);
    lines.push("");
    if (downstreamNodes.length === 0) {
      lines.push("_None_");
    } else {
      for (const n of downstreamNodes) {
        lines.push(`- \`${n.type || "unknown"}\` **${n.name || n.id}**`);
      }
    }
    return lines.join("\n");
  }
  return {
    node: node ? { id: node.id, name: node.name, type: node.type, metadata: node.metadata } : null,
    upstream: upstreamNodes,
    downstream: downstreamNodes,
    summary: {
      upstreamCount: upstreamNodes.length,
      downstreamCount: downstreamNodes.length
    }
  };
}
var init_impactAnalysis = __esm({
  "../core/src/graph/impactAnalysis.js"() {
    init_graphBuilder();
  }
});

// ../core/src/graph/lineageTracer.js
function traceMeasureLineage(measureNodeId, graph2) {
  const measureNode = graph2.nodes.get(measureNodeId);
  if (!measureNode) return null;
  const impact = analyzeImpact(measureNodeId, graph2);
  const visuals = traceVisuals(measureNode, impact, graph2);
  const measureChain = buildMeasureChain(measureNodeId, graph2, /* @__PURE__ */ new Set());
  const sourceTable = buildSourceTable(measureChain, graph2);
  const summaryTrees = buildSummaryTrees(measureNode, visuals, measureChain, sourceTable, graph2);
  return { visuals, measureChain, sourceTable, summaryTrees };
}
function traceVisuals(measureNode, impact, graph2) {
  const visuals = [];
  for (const nodeId of impact.downstream) {
    const node = graph2.nodes.get(nodeId);
    if (!node || node.type !== "visual") continue;
    let pageName = node.metadata?.pageName || "";
    if (!pageName) {
      const upNeighborsForPage = graph2.adjacency.upstream.get(nodeId) || [];
      for (const nId of upNeighborsForPage) {
        const n = graph2.nodes.get(nId);
        if (n && n.type === "page") {
          pageName = n.name;
          break;
        }
      }
    }
    let bindingType = "direct";
    let fieldParameterTable = "";
    const upNeighbors = graph2.adjacency.upstream.get(nodeId) || [];
    for (const upId of upNeighbors) {
      const upNode = graph2.nodes.get(upId);
      if (upNode && (upNode.enrichment?.type === "field_parameter" || upNode.metadata?.isFieldParameter)) {
        bindingType = "fieldParameter";
        fieldParameterTable = upNode.metadata?.table || upNode.name;
        break;
      }
    }
    visuals.push({
      page: pageName,
      visualType: node.metadata?.visualType || node.name,
      title: node.metadata?.title || node.name,
      id: node.id,
      metricDisplayName: measureNode.name,
      metricDaxName: `${measureNode.metadata?.table || ""}.${measureNode.name}`,
      bindingType,
      fieldParameterTable
    });
  }
  visuals.sort((a, b) => (a.page + a.title).localeCompare(b.page + b.title));
  return visuals;
}
function traceVisualLineage(visualNodeId, graph2) {
  const visualNode = graph2.nodes.get(visualNodeId);
  if (!visualNode) return null;
  let pageName = visualNode.metadata?.pageName || "";
  if (!pageName) {
    const upNeighborsForPage = graph2.adjacency.upstream.get(visualNodeId) || [];
    for (const nId of upNeighborsForPage) {
      const n = graph2.nodes.get(nId);
      if (n && n.type === "page") {
        pageName = n.name;
        break;
      }
    }
  }
  const directMeasureIds = /* @__PURE__ */ new Set();
  const fieldParamMeasureIds = /* @__PURE__ */ new Set();
  const upNeighbors = graph2.adjacency.upstream.get(visualNodeId) || [];
  for (const upId of upNeighbors) {
    const upNode = graph2.nodes.get(upId);
    if (!upNode) continue;
    if (upNode.type === "measure") {
      directMeasureIds.add(upId);
    } else if (upNode.type === "column") {
      const parentTableId = `table::${upNode.metadata?.table || ""}`;
      const parentTable = graph2.nodes.get(parentTableId);
      const isFieldParam = parentTable?.enrichment?.type === "field_parameter" || upNode.enrichment?.type === "field_parameter" || upNode.metadata?.isFieldParameter;
      if (isFieldParam && parentTableId) {
        const fpUp = graph2.adjacency.upstream.get(parentTableId) || [];
        for (const fpId of fpUp) {
          const fpNode = graph2.nodes.get(fpId);
          if (fpNode?.type === "measure") fieldParamMeasureIds.add(fpId);
        }
      } else {
        const colUp = graph2.adjacency.upstream.get(upId) || [];
        for (const cId of colUp) {
          const cNode = graph2.nodes.get(cId);
          if (cNode?.type === "measure") directMeasureIds.add(cId);
        }
      }
    } else if (upNode.type === "table") {
      const isFieldParam = upNode.enrichment?.type === "field_parameter";
      if (isFieldParam) {
        const fpUp = graph2.adjacency.upstream.get(upId) || [];
        for (const fpId of fpUp) {
          const fpNode = graph2.nodes.get(fpId);
          if (fpNode?.type === "measure") fieldParamMeasureIds.add(fpId);
        }
      }
    }
  }
  const referencedFpTableIds = /* @__PURE__ */ new Set();
  for (const upId of upNeighbors) {
    const upNode = graph2.nodes.get(upId);
    if (!upNode) continue;
    if (upNode.type === "table" && upNode.enrichment?.type === "field_parameter") {
      referencedFpTableIds.add(upId);
    } else if (upNode.type === "column") {
      const parentTableId = `table::${upNode.metadata?.table || ""}`;
      const parentTable = graph2.nodes.get(parentTableId);
      if (parentTable?.enrichment?.type === "field_parameter") {
        referencedFpTableIds.add(parentTableId);
      }
    }
  }
  for (const edge of graph2.edges) {
    if (edge.type === EDGE_TYPES.FIELD_PARAM_TO_FIELD && referencedFpTableIds.has(edge.source)) {
      const targetNode = graph2.nodes.get(edge.target);
      if (targetNode?.type === "measure") fieldParamMeasureIds.add(edge.target);
    }
  }
  const measures = Array.from(directMeasureIds).map((measureId) => {
    const node = graph2.nodes.get(measureId);
    return {
      measureId,
      measureName: node?.name || measureId,
      lineage: traceMeasureLineage(measureId, graph2)
    };
  });
  const fpMeasures = Array.from(fieldParamMeasureIds).filter((id) => !directMeasureIds.has(id)).map((measureId) => {
    const node = graph2.nodes.get(measureId);
    return {
      measureId,
      measureName: node?.name || measureId,
      lineage: traceMeasureLineage(measureId, graph2)
    };
  });
  return {
    visual: {
      id: visualNodeId,
      title: visualNode.metadata?.title || visualNode.name || "",
      type: visualNode.metadata?.visualType || visualNode.name || "visual",
      page: pageName,
      objectId: visualNodeId.split("/").pop() || visualNodeId
    },
    measures,
    fpMeasures,
    fieldParameterMeasures: Array.from(fieldParamMeasureIds).map((id) => {
      const n = graph2.nodes.get(id);
      return { id, name: n?.name || id, table: n?.metadata?.table || "" };
    })
  };
}
function buildMeasureChain(measureNodeId, graph2, visited) {
  if (visited.has(measureNodeId)) {
    const node2 = graph2.nodes.get(measureNodeId);
    return {
      id: measureNodeId,
      name: node2?.name || measureNodeId,
      table: node2?.metadata?.table || "",
      expression: "(circular reference)",
      children: [],
      columns: []
    };
  }
  visited.add(measureNodeId);
  const node = graph2.nodes.get(measureNodeId);
  if (!node) return null;
  const result = {
    id: measureNodeId,
    name: node.name,
    table: node.metadata?.table || "",
    expression: node.metadata?.expression || "",
    children: [],
    // sub-measures
    columns: []
    // leaf column references
  };
  const upNeighbors = graph2.adjacency.upstream.get(measureNodeId) || [];
  for (const upId of upNeighbors) {
    const upNode = graph2.nodes.get(upId);
    if (!upNode) continue;
    if (upNode.type === "measure") {
      const child = buildMeasureChain(upId, graph2, visited);
      if (child) result.children.push(child);
    } else if (upNode.type === "column") {
      result.columns.push({
        id: upId,
        name: upNode.name,
        table: upNode.metadata?.table || "",
        dataType: upNode.metadata?.dataType || "",
        sourceColumn: upNode.metadata?.sourceColumn || "",
        originalSourceColumn: upNode.metadata?.originalSourceColumn || "",
        wasRenamed: upNode.metadata?.wasRenamed || false,
        sourceTableFull: upNode.metadata?.sourceTableFull || "",
        sourceTablePath: upNode.metadata?.sourceTablePath || ""
      });
    }
  }
  return result;
}
function buildSourceTable(measureChain, graph2) {
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  function collectColumns(chain, parentMeasure) {
    if (!chain) return;
    for (const col of chain.columns) {
      if (seen.has(col.id)) continue;
      seen.add(col.id);
      const tableNodeId = `table::${col.table}`;
      const tableNode = graph2.nodes.get(tableNodeId);
      let pqExpression = "";
      let srcTable = col.sourceTablePath || "";
      let srcColumn = col.sourceTableFull || col.sourceColumn || col.name;
      if (tableNode) {
        const tableUp = graph2.adjacency.upstream.get(tableNodeId) || [];
        for (const upId of tableUp) {
          const upNode = graph2.nodes.get(upId);
          if (upNode && upNode.type === "expression") {
            pqExpression = upNode.name;
            if (upNode.metadata?.dataSource?.sourceTable) {
              srcTable = srcTable || `${upNode.metadata.dataSource.database || ""}.${upNode.metadata.dataSource.sourceTable}`;
            }
          } else if (upNode && upNode.type === "source") {
            if (!srcTable && upNode.metadata?.database) {
              srcTable = `${upNode.metadata.database}.*`;
            }
          }
        }
      }
      rows.push({
        daxReference: `${parentMeasure || chain.name}`,
        pbiTable: col.table,
        pbiColumn: col.name,
        sourceColumn: col.sourceColumn || col.name,
        originalSourceColumn: col.originalSourceColumn || "",
        pqExpression,
        sourceTable: srcTable,
        sourceColumnFull: srcColumn,
        renamed: col.wasRenamed,
        renameChain: col.wasRenamed ? { sourceName: col.originalSourceColumn || "", pqName: col.sourceColumn || "", pbiName: col.name } : null
      });
    }
    for (const child of chain.children) {
      collectColumns(child, chain.name);
    }
  }
  collectColumns(measureChain, "");
  return rows;
}
function buildSummaryTrees(measureNode, visuals, measureChain, sourceTable, graph2) {
  const colSourceMap = /* @__PURE__ */ new Map();
  for (const row of sourceTable) {
    const key = `${row.pbiTable}.${row.pbiColumn}`;
    colSourceMap.set(key, row);
  }
  function buildChainSummary(chain, indent) {
    const prefix = "  ".repeat(indent);
    const lines = [];
    const daxShort = chain.expression ? chain.expression.split("\n")[0].substring(0, 80) + (chain.expression.length > 80 ? "..." : "") : "";
    lines.push(`${prefix}[${chain.name}] = ${daxShort}`);
    for (const child of chain.children) {
      lines.push(...buildChainSummary(child, indent + 2));
    }
    for (const col of chain.columns) {
      const key = `${col.table}.${col.name}`;
      const source = colSourceMap.get(key);
      let colLine = `${prefix}    ${col.table}[${col.name}]`;
      if (source?.pqExpression) colLine += ` -> PQ: ${source.pqExpression}`;
      if (source?.sourceTable) colLine += ` -> Source: ${source.sourceTable}.${source.sourceColumnFull}`;
      if (source?.renamed) colLine += " (renamed)";
      lines.push(colLine);
    }
    return lines;
  }
  return visuals.map((v) => {
    const lines = [];
    lines.push(`Visual: ${v.visualType} "${v.title}" (${v.id.split("/").pop() || v.id})`);
    lines.push(`  Metric Display Name: ${v.metricDisplayName}`);
    lines.push(`  Metric DAX Name: ${v.metricDaxName}`);
    lines.push(...buildChainSummary(measureChain, 1));
    return lines.join("\n");
  });
}
var init_lineageTracer = __esm({
  "../core/src/graph/lineageTracer.js"() {
    init_impactAnalysis();
    init_constants();
  }
});

// ../core/src/index.js
var src_exports = {};
__export(src_exports, {
  EDGE_TYPES: () => EDGE_TYPES,
  ENRICHMENT_TYPES: () => ENRICHMENT_TYPES,
  LAYER_COLORS: () => LAYER_COLORS,
  NODE_TYPES: () => NODE_TYPES,
  RELEVANT_EXTENSIONS: () => RELEVANT_EXTENSIONS,
  analyze: () => analyze,
  analyzeFromFiles: () => analyzeFromFiles,
  analyzeImpact: () => analyzeImpact,
  applyEnrichments: () => applyEnrichments,
  buildAdjacency: () => buildAdjacency,
  buildGraph: () => buildGraph,
  computeStats: () => computeStats,
  createEdge: () => createEdge,
  createNode: () => createNode,
  detectEnrichments: () => detectEnrichments,
  exportImpactReport: () => exportImpactReport,
  extractColumnRefs: () => extractColumnRefs,
  extractMDataSource: () => extractMDataSource,
  extractMeasureRefs: () => extractMeasureRefs,
  extractRenameColumns: () => extractRenameColumns,
  extractTableRefs: () => extractTableRefs,
  extractUseRelationshipRefs: () => extractUseRelationshipRefs,
  findDefinitionPbir: () => findDefinitionPbir,
  findOrphans: () => findOrphans,
  identifyProjectStructure: () => identifyProjectStructure,
  isRelevantFile: () => isRelevantFile,
  parseDaxExpression: () => parseDaxExpression,
  parseExpressions: () => parseExpressions,
  parsePbirReport: () => parsePbirReport,
  parseSemanticModelReference: () => parseSemanticModelReference,
  parseTmdlModel: () => parseTmdlModel,
  traceMeasureLineage: () => traceMeasureLineage,
  traceVisualLineage: () => traceVisualLineage
});
function analyze({ modelStructure, reportStructure }) {
  const tmdlFiles = modelStructure?.tmdlFiles || [];
  const relationshipFiles = modelStructure?.relationshipFiles || [];
  const expressionFiles = modelStructure?.expressionFiles || [];
  const model = parseTmdlModel(tmdlFiles, relationshipFiles);
  const parsedExpressions = { expressions: [], parameters: /* @__PURE__ */ new Map() };
  for (const { content } of expressionFiles) {
    const result = parseExpressions(content);
    parsedExpressions.expressions.push(...result.expressions);
    for (const [k, v] of result.parameters) parsedExpressions.parameters.set(k, v);
  }
  model.expressions = parsedExpressions.expressions;
  model.parameters = parsedExpressions.parameters;
  for (const table of model.tables) {
    for (const measure of table.measures || []) {
      if (measure.expression) measure.daxDeps = parseDaxExpression(measure.expression);
    }
    for (const col of table.calculatedColumns || []) {
      if (col.expression) col.daxDeps = parseDaxExpression(col.expression);
    }
  }
  const report = reportStructure ? parsePbirReport(reportStructure.visualFiles || [], reportStructure.pageFiles || []) : { visuals: [], pages: [] };
  const enrichments2 = detectEnrichments(model.tables);
  let graph2 = buildGraph(model, report, enrichments2);
  graph2 = applyEnrichments(graph2, enrichments2);
  const stats = computeStats(graph2);
  return { graph: graph2, stats, enrichments: enrichments2, model, report };
}
function analyzeFromFiles({ modelFiles, reportFiles }) {
  const modelStructure = identifyProjectStructure(modelFiles);
  const reportStructure = reportFiles ? identifyProjectStructure(reportFiles) : null;
  return analyze({ modelStructure, reportStructure });
}
var init_src = __esm({
  "../core/src/index.js"() {
    init_tmdlParser();
    init_daxParser();
    init_pbirParser();
    init_enrichment();
    init_projectStructure();
    init_graphBuilder();
    init_lineageTracer();
    init_impactAnalysis();
    init_constants();
  }
});

// src/vscodeReader.js
var require_vscodeReader = __commonJS({
  "src/vscodeReader.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var { isRelevantFile: isRelevantFile2, identifyProjectStructure: identifyProjectStructure2, findDefinitionPbir: findDefinitionPbir2, parseSemanticModelReference: parseSemanticModelReference2 } = (init_src(), __toCommonJS(src_exports));
    async function walkDirectory(dirUri, basePath = "") {
      const files = /* @__PURE__ */ new Map();
      const entries = await vscode2.workspace.fs.readDirectory(dirUri);
      for (const [name, type] of entries) {
        const childUri = vscode2.Uri.joinPath(dirUri, name);
        const relativePath = basePath ? `${basePath}/${name}` : name;
        if (type === vscode2.FileType.Directory) {
          if (name.startsWith(".") || name === "node_modules") continue;
          const subFiles = await walkDirectory(childUri, relativePath);
          for (const [path, content] of subFiles) {
            files.set(path, content);
          }
        } else if (type === vscode2.FileType.File) {
          if (isRelevantFile2(name)) {
            try {
              const raw = await vscode2.workspace.fs.readFile(childUri);
              const content = Buffer.from(raw).toString("utf-8");
              files.set(relativePath, content);
            } catch (err) {
              console.warn(`Failed to read file: ${relativePath}`, err);
            }
          }
        }
      }
      return files;
    }
    async function loadProjectFromWorkspace2() {
      const workspaceFolders = vscode2.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return { reportName: null, reportStructure: null, modelName: null, modelStructure: null, semanticModelPath: null };
      }
      for (const folder of workspaceFolders) {
        const rootUri = folder.uri;
        const rootName = folder.name.toLowerCase();
        let reportUri = null;
        let modelUri = null;
        let reportName = null;
        let modelName = null;
        if (rootName.endsWith(".report")) {
          reportUri = rootUri;
          reportName = folder.name;
        } else if (rootName.endsWith(".semanticmodel")) {
          modelUri = rootUri;
          modelName = folder.name;
        } else {
          try {
            const entries = await vscode2.workspace.fs.readDirectory(rootUri);
            for (const [name, type] of entries) {
              if (type !== vscode2.FileType.Directory) continue;
              const lowerName = name.toLowerCase();
              if (lowerName.endsWith(".report") && !reportUri) {
                reportUri = vscode2.Uri.joinPath(rootUri, name);
                reportName = name;
              } else if (lowerName.endsWith(".semanticmodel") && !modelUri) {
                modelUri = vscode2.Uri.joinPath(rootUri, name);
                modelName = name;
              }
            }
          } catch {
            continue;
          }
        }
        let reportStructure = null;
        let semanticModelPath = null;
        if (reportUri) {
          const reportFiles = await walkDirectory(reportUri, "");
          reportStructure = identifyProjectStructure2(reportFiles);
          const pbirPath = findDefinitionPbir2(reportFiles);
          if (pbirPath) {
            semanticModelPath = parseSemanticModelReference2(reportFiles.get(pbirPath));
          }
        }
        let modelStructure = null;
        if (modelUri) {
          const modelFiles = await walkDirectory(modelUri, "");
          modelStructure = identifyProjectStructure2(modelFiles);
        }
        if (reportStructure || modelStructure) {
          return { reportName, reportStructure, modelName, modelStructure, semanticModelPath };
        }
      }
      return { reportName: null, reportStructure: null, modelName: null, modelStructure: null, semanticModelPath: null };
    }
    module2.exports = { walkDirectory, loadProjectFromWorkspace: loadProjectFromWorkspace2 };
  }
});

// src/providers/measureTreeProvider.js
var require_measureTreeProvider = __commonJS({
  "src/providers/measureTreeProvider.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var MeasureTreeProvider2 = class {
      constructor() {
        this._onDidChangeTreeData = new vscode2.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._graph = null;
        this._orphanIds = /* @__PURE__ */ new Set();
      }
      setGraph(graph2, orphanIds2 = /* @__PURE__ */ new Set()) {
        this._graph = graph2;
        this._orphanIds = orphanIds2;
        this._onDidChangeTreeData.fire();
      }
      getTreeItem(element) {
        return element;
      }
      getChildren(element) {
        if (!this._graph) return [];
        if (!element) {
          return this._getTableItems();
        }
        if (element.contextValue === "table") {
          return this._getMeasureItems(element.tableId);
        }
        return [];
      }
      _getTableItems() {
        const tableMap = /* @__PURE__ */ new Map();
        for (const [id, node] of this._graph.nodes) {
          if (node.type === "measure") {
            const tableName = node.metadata?.table || "Unknown";
            if (!tableMap.has(tableName)) {
              tableMap.set(tableName, { tableId: tableName, measures: [] });
            }
            tableMap.get(tableName).measures.push(node);
          }
        }
        const sorted = [...tableMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        return sorted.map(([tableName, { measures }]) => {
          const orphanCount = measures.filter((m) => this._orphanIds.has(m.id)).length;
          const label = orphanCount > 0 ? `${tableName} (${measures.length} measures, ${orphanCount} orphans)` : `${tableName} (${measures.length} measures)`;
          const item = new vscode2.TreeItem(label, vscode2.TreeItemCollapsibleState.Collapsed);
          item.contextValue = "table";
          item.tableId = tableName;
          item.iconPath = new vscode2.ThemeIcon("table");
          return item;
        });
      }
      _getMeasureItems(tableName) {
        const measures = [];
        for (const [id, node] of this._graph.nodes) {
          if (node.type === "measure" && (node.metadata?.table || "Unknown") === tableName) {
            measures.push(node);
          }
        }
        measures.sort((a, b) => a.name.localeCompare(b.name));
        return measures.map((node) => {
          const isOrphan = this._orphanIds.has(node.id);
          const item = new vscode2.TreeItem(node.name, vscode2.TreeItemCollapsibleState.None);
          item.contextValue = "measure";
          item.measureId = node.id;
          if (isOrphan) {
            item.description = "orphan";
            item.iconPath = new vscode2.ThemeIcon("warning", new vscode2.ThemeColor("problemsWarningIcon.foreground"));
          } else {
            item.iconPath = new vscode2.ThemeIcon("symbol-method");
          }
          if (node.metadata?.expression) {
            item.tooltip = new vscode2.MarkdownString(`**${node.name}**
\`\`\`dax
${node.metadata.expression}
\`\`\``);
          }
          item.command = {
            command: "pbipLineage.traceMeasure",
            title: "Trace Lineage",
            arguments: [node.id]
          };
          return item;
        });
      }
    };
    module2.exports = { MeasureTreeProvider: MeasureTreeProvider2 };
  }
});

// src/providers/orphanTreeProvider.js
var require_orphanTreeProvider = __commonJS({
  "src/providers/orphanTreeProvider.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var OrphanTreeProvider2 = class {
      constructor() {
        this._onDidChangeTreeData = new vscode2.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._graph = null;
        this._orphanIds = /* @__PURE__ */ new Set();
      }
      setGraph(graph2, orphanIds2 = /* @__PURE__ */ new Set()) {
        this._graph = graph2;
        this._orphanIds = orphanIds2;
        this._onDidChangeTreeData.fire();
      }
      getTreeItem(element) {
        return element;
      }
      getChildren(element) {
        if (!this._graph || element) return [];
        const orphans = [];
        for (const id of this._orphanIds) {
          const node = this._graph.nodes.get(id);
          if (node) orphans.push(node);
        }
        orphans.sort((a, b) => a.name.localeCompare(b.name));
        if (orphans.length === 0) {
          const item = new vscode2.TreeItem("No orphan measures found", vscode2.TreeItemCollapsibleState.None);
          item.iconPath = new vscode2.ThemeIcon("check", new vscode2.ThemeColor("testing.iconPassed"));
          return [item];
        }
        return orphans.map((node) => {
          const tableName = node.metadata?.table || "Unknown";
          const item = new vscode2.TreeItem(node.name, vscode2.TreeItemCollapsibleState.None);
          item.description = tableName;
          item.contextValue = "orphanMeasure";
          item.iconPath = new vscode2.ThemeIcon("warning", new vscode2.ThemeColor("problemsWarningIcon.foreground"));
          if (node.metadata?.expression) {
            item.tooltip = new vscode2.MarkdownString(`**${node.name}** (${tableName})
\`\`\`dax
${node.metadata.expression}
\`\`\`

*This measure is not referenced by any visual.*`);
          }
          item.command = {
            command: "pbipLineage.traceMeasure",
            title: "Trace Lineage",
            arguments: [node.id]
          };
          return item;
        });
      }
    };
    module2.exports = { OrphanTreeProvider: OrphanTreeProvider2 };
  }
});

// src/providers/statsTreeProvider.js
var require_statsTreeProvider = __commonJS({
  "src/providers/statsTreeProvider.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var StatsTreeProvider2 = class {
      constructor() {
        this._onDidChangeTreeData = new vscode2.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._stats = null;
        this._enrichments = null;
        this._orphanCount = 0;
      }
      setData(stats, enrichments2, orphanCount) {
        this._stats = stats;
        this._enrichments = enrichments2;
        this._orphanCount = orphanCount;
        this._onDidChangeTreeData.fire();
      }
      getTreeItem(element) {
        return element;
      }
      getChildren(element) {
        if (!this._stats || element) return [];
        const items = [];
        const addStat = (label, value, icon) => {
          const item = new vscode2.TreeItem(`${label}: ${value}`, vscode2.TreeItemCollapsibleState.None);
          item.iconPath = new vscode2.ThemeIcon(icon);
          items.push(item);
        };
        addStat("Tables", this._stats.tables, "table");
        addStat("Columns", this._stats.columns, "symbol-field");
        addStat("Measures", this._stats.measures, "symbol-method");
        addStat("Visuals", this._stats.visuals, "symbol-enum");
        addStat("Pages", this._stats.pages, "file");
        addStat("Sources", this._stats.sources, "database");
        const sep = new vscode2.TreeItem("", vscode2.TreeItemCollapsibleState.None);
        items.push(sep);
        if (this._orphanCount > 0) {
          const orphanItem = new vscode2.TreeItem(
            `Orphan Measures: ${this._orphanCount}`,
            vscode2.TreeItemCollapsibleState.None
          );
          orphanItem.iconPath = new vscode2.ThemeIcon("warning", new vscode2.ThemeColor("problemsWarningIcon.foreground"));
          orphanItem.tooltip = "Measures not referenced by any visual";
          items.push(orphanItem);
        } else {
          addStat("Orphan Measures", "0", "check");
        }
        const fpCount = this._enrichments?.fieldParameters?.length || 0;
        if (fpCount > 0) addStat("Field Parameters", fpCount, "symbol-parameter");
        const cgCount = this._enrichments?.calculationGroups?.length || 0;
        if (cgCount > 0) addStat("Calculation Groups", cgCount, "symbol-class");
        return items;
      }
    };
    module2.exports = { StatsTreeProvider: StatsTreeProvider2 };
  }
});

// src/providers/codelensProvider.js
var require_codelensProvider = __commonJS({
  "src/providers/codelensProvider.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var TmdlCodeLensProvider2 = class {
      constructor() {
        this._graph = null;
        this._orphanIds = /* @__PURE__ */ new Set();
        this._onDidChangeCodeLenses = new vscode2.EventEmitter();
        this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
      }
      setGraph(graph2, orphanIds2 = /* @__PURE__ */ new Set()) {
        this._graph = graph2;
        this._orphanIds = orphanIds2;
        this._onDidChangeCodeLenses.fire();
      }
      provideCodeLenses(document) {
        if (!this._graph) return [];
        const lenses = [];
        const text = document.getText();
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = line.match(/^\s*measure\s+(?:'([^']+)'|(\S+))\s*=/);
          if (!match) continue;
          const measureName = match[1] || match[2];
          const tableName = this._findTableName(lines, i);
          const measureId = tableName ? `measure::${tableName}::${measureName}` : null;
          if (!measureId) continue;
          const node = this._graph.nodes.get(measureId);
          if (!node) continue;
          const range = new vscode2.Range(i, 0, i, line.length);
          const deps = this._countDeps(measureId);
          const consumers = this._countConsumers(measureId);
          const isOrphan = this._orphanIds.has(measureId);
          let title = `$(graph) ${deps} deps | ${consumers} consumers`;
          if (isOrphan) {
            title += " | $(warning) orphan";
          }
          lenses.push(new vscode2.CodeLens(range, {
            title,
            command: "pbipLineage.traceMeasure",
            arguments: [measureId],
            tooltip: `Click to trace lineage for ${measureName}`
          }));
        }
        return lenses;
      }
      _findTableName(lines, measureLineIdx) {
        for (let i = measureLineIdx - 1; i >= 0; i--) {
          const match = lines[i].match(/^\s*table\s+(?:'([^']+)'|(\S+))/);
          if (match) return match[1] || match[2];
        }
        return null;
      }
      _countDeps(nodeId) {
        let count = 0;
        for (const edge of this._graph.edges) {
          if (edge.source === nodeId) count++;
        }
        return count;
      }
      _countConsumers(nodeId) {
        let count = 0;
        for (const edge of this._graph.edges) {
          if (edge.target === nodeId) count++;
        }
        return count;
      }
    };
    module2.exports = { TmdlCodeLensProvider: TmdlCodeLensProvider2 };
  }
});

// src/webview/lineagePanel.js
var require_lineagePanel = __commonJS({
  "src/webview/lineagePanel.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var TYPE_COLORS = {
      visual: "#4caf50",
      measure: "#ff9800",
      column: "#9c27b0",
      table: "#4285f4",
      source: "#757575",
      expression: "#795548",
      page: "#00bcd4"
    };
    var currentPanel = null;
    function showLineagePanel2(context, measureId, graph2, lineage) {
      const node = graph2.nodes.get(measureId);
      if (!node) return;
      const column = vscode2.ViewColumn.Beside;
      if (currentPanel) {
        currentPanel.reveal(column);
      } else {
        currentPanel = vscode2.window.createWebviewPanel(
          "pbipLineage",
          "PBIP Lineage",
          column,
          { enableScripts: false, retainContextWhenHidden: true }
        );
        currentPanel.onDidDispose(() => {
          currentPanel = null;
        });
      }
      currentPanel.title = `Lineage: ${node.name}`;
      currentPanel.webview.html = buildLineageHtml(node, graph2, lineage);
    }
    function buildLineageHtml(node, graph2, lineage) {
      const sections = [];
      sections.push(`
    <div class="header">
      <h1>${esc(node.name)}</h1>
      <span class="badge" style="background: ${TYPE_COLORS.measure}">${esc(node.metadata?.table || "Measure")}</span>
    </div>
  `);
      if (node.metadata?.expression) {
        sections.push(`
      <div class="section">
        <h2>DAX Expression</h2>
        <pre class="dax">${esc(node.metadata.expression)}</pre>
      </div>
    `);
      }
      if (lineage.visuals && lineage.visuals.length > 0) {
        sections.push(`
      <div class="section">
        <h2>Consuming Visuals (${lineage.visuals.length})</h2>
        ${lineage.visuals.map((v) => `
          <div class="dep-item">
            <span class="dot" style="background: ${TYPE_COLORS.visual}"></span>
            <strong>${esc(v.name || v.id)}</strong>
            ${v.page ? `<span class="meta">${esc(v.page)}</span>` : ""}
            ${v.visualType ? `<span class="meta type">${esc(v.visualType)}</span>` : ""}
          </div>
        `).join("")}
      </div>
    `);
      }
      if (lineage.measureChain) {
        const chain = lineage.measureChain;
        if (chain.children && chain.children.length > 0) {
          sections.push(`
        <div class="section">
          <h2>Measure Dependencies</h2>
          ${renderMeasureTree(chain.children, 0)}
        </div>
      `);
        }
        if (chain.columns && chain.columns.length > 0) {
          sections.push(`
        <div class="section">
          <h2>Column Dependencies</h2>
          ${chain.columns.map((col) => `
            <div class="dep-item">
              <span class="dot" style="background: ${TYPE_COLORS.column}"></span>
              <strong>${esc(col.name)}</strong>
              <span class="meta">${esc(col.table || "")}</span>
              ${col.sourceColumn ? `<span class="meta source">source: ${esc(col.sourceColumn)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      `);
        }
      }
      if (lineage.sourceTable && lineage.sourceTable.length > 0) {
        sections.push(`
      <div class="section">
        <h2>Source Column Mapping (${lineage.sourceTable.length})</h2>
        <table class="source-table">
          <thead><tr><th>PBI Column</th><th>Table</th><th>Source Column</th><th>Data Source</th></tr></thead>
          <tbody>
          ${lineage.sourceTable.map((row) => `
            <tr>
              <td>${esc(row.column || "")}</td>
              <td>${esc(row.table || "")}</td>
              <td>${esc(row.sourceColumn || row.column || "")}</td>
              <td>${esc(row.dataSource || "")}</td>
            </tr>
          `).join("")}
          </tbody>
        </table>
      </div>
    `);
      }
      sections.push(`
    <div class="sponsor">
      <a href="https://github.com/sponsors/JonathanJihwanKim">Sponsor PBIP Lineage Explorer</a>
      &mdash; free &amp; open source, built by Jihwan Kim (Microsoft MVP)
    </div>
  `);
      return `<!DOCTYPE html>
<html>
<head>
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
    line-height: 1.6;
  }
  .header { margin-bottom: 20px; }
  .header h1 { margin: 0 0 8px 0; font-size: 1.4em; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    color: white; font-size: 0.8em; font-weight: 600;
  }
  .section { margin-bottom: 20px; }
  .section h2 {
    font-size: 1.1em; margin: 0 0 8px 0; padding-bottom: 4px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .dep-item {
    padding: 4px 0; display: flex; align-items: center;
    flex-wrap: wrap; gap: 8px;
  }
  .dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .meta {
    font-size: 0.85em; color: var(--vscode-descriptionForeground);
  }
  .meta.source { font-style: italic; }
  .meta.type { opacity: 0.7; }
  pre.dax {
    background: var(--vscode-textBlockQuote-background);
    padding: 12px; border-radius: 4px; overflow-x: auto;
    font-size: 0.9em; white-space: pre-wrap; word-wrap: break-word;
  }
  pre.dax-small {
    background: var(--vscode-textBlockQuote-background);
    padding: 6px 10px; border-radius: 4px; overflow-x: auto;
    font-size: 0.8em; margin: 4px 0 0 0;
    white-space: pre-wrap; word-wrap: break-word;
  }
  .tree-indent { padding-left: 20px; border-left: 2px solid var(--vscode-widget-border); margin-left: 4px; }
  .source-table {
    width: 100%; border-collapse: collapse; font-size: 0.9em;
  }
  .source-table th, .source-table td {
    text-align: left; padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .source-table th {
    font-weight: 600; color: var(--vscode-descriptionForeground);
  }
  .sponsor {
    margin-top: 32px; padding-top: 16px;
    border-top: 1px solid var(--vscode-widget-border);
    font-size: 0.85em; color: var(--vscode-descriptionForeground);
  }
  .sponsor a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  .sponsor a:hover { text-decoration: underline; }
</style>
</head>
<body>
${sections.join("\n")}
</body>
</html>`;
    }
    function renderMeasureTree(children, depth) {
      if (!children || children.length === 0) return "";
      return children.map((dep) => `
    <div class="${depth > 0 ? "tree-indent" : ""}">
      <div class="dep-item">
        <span class="dot" style="background: ${depth === 0 ? TYPE_COLORS.measure : "#ffb74d"}"></span>
        <strong>${esc(dep.name)}</strong>
        <span class="meta">${esc(dep.table || "")}</span>
      </div>
      ${dep.expression && dep.expression !== "(circular reference)" ? `<pre class="dax-small">${esc(dep.expression)}</pre>` : ""}
      ${dep.expression === "(circular reference)" ? '<span class="meta" style="color: #ff5252;">circular reference</span>' : ""}
      ${dep.columns && dep.columns.length > 0 ? dep.columns.map((col) => `
        <div class="dep-item" style="padding-left: 20px;">
          <span class="dot" style="background: ${TYPE_COLORS.column}"></span>
          ${esc(col.name)} <span class="meta">${esc(col.table || "")}</span>
        </div>
      `).join("") : ""}
      ${renderMeasureTree(dep.children, depth + 1)}
    </div>
  `).join("");
    }
    function esc(str) {
      return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    module2.exports = { showLineagePanel: showLineagePanel2 };
  }
});

// src/extension.js
var vscode = require("vscode");
var { analyze: analyze2, computeStats: computeStats2, traceMeasureLineage: traceMeasureLineage2, findOrphans: findOrphans2 } = (init_src(), __toCommonJS(src_exports));
var { loadProjectFromWorkspace } = require_vscodeReader();
var { MeasureTreeProvider } = require_measureTreeProvider();
var { OrphanTreeProvider } = require_orphanTreeProvider();
var { StatsTreeProvider } = require_statsTreeProvider();
var { TmdlCodeLensProvider } = require_codelensProvider();
var { showLineagePanel } = require_lineagePanel();
var graph = null;
var enrichments = null;
var orphanIds = /* @__PURE__ */ new Set();
var statusBarItem = null;
var measureTree = new MeasureTreeProvider();
var orphanTree = new OrphanTreeProvider();
var statsTree = new StatsTreeProvider();
var codeLensProvider = new TmdlCodeLensProvider();
function activate(context) {
  console.log("PBIP Lineage Explorer activated");
  vscode.window.registerTreeDataProvider("pbipLineage.measures", measureTree);
  vscode.window.registerTreeDataProvider("pbipLineage.orphans", orphanTree);
  vscode.window.registerTreeDataProvider("pbipLineage.stats", statsTree);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { pattern: "**/*.tmdl" },
      codeLensProvider
    )
  );
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = "pbipLineage.showModelHealth";
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(
    vscode.commands.registerCommand("pbipLineage.traceMeasure", handleTraceMeasure),
    vscode.commands.registerCommand("pbipLineage.findOrphans", handleFindOrphans),
    vscode.commands.registerCommand("pbipLineage.showModelHealth", handleShowModelHealth),
    vscode.commands.registerCommand("pbipLineage.refresh", handleRefresh)
  );
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.tmdl");
  watcher.onDidChange(() => loadProject());
  watcher.onDidCreate(() => loadProject());
  watcher.onDidDelete(() => loadProject());
  context.subscriptions.push(watcher);
  loadProject();
}
async function loadProject() {
  try {
    const project = await loadProjectFromWorkspace();
    if (!project.modelStructure && !project.reportStructure) {
      statusBarItem.hide();
      return;
    }
    const result = analyze2({
      modelStructure: project.modelStructure,
      reportStructure: project.reportStructure
    });
    graph = result.graph;
    enrichments = result.enrichments;
    orphanIds = new Set(findOrphans2(graph));
    measureTree.setGraph(graph, orphanIds);
    orphanTree.setGraph(graph, orphanIds);
    statsTree.setData(result.stats, enrichments, orphanIds.size);
    codeLensProvider.setGraph(graph, orphanIds);
    const stats = result.stats;
    statusBarItem.text = `$(graph-line) ${stats.measures} measures`;
    if (orphanIds.size > 0) {
      statusBarItem.text += ` (${orphanIds.size} orphans)`;
    }
    statusBarItem.tooltip = `PBIP: ${stats.tables} tables, ${stats.measures} measures, ${stats.visuals} visuals`;
    statusBarItem.show();
  } catch (err) {
    console.error("PBIP Lineage Explorer: Failed to load project", err);
    statusBarItem.text = "$(graph-line) PBIP: Error";
    statusBarItem.tooltip = `Error: ${err.message}`;
    statusBarItem.show();
  }
}
async function handleTraceMeasure(measureId) {
  if (!graph) {
    vscode.window.showWarningMessage("No PBIP project loaded. Open a folder with .tmdl files.");
    return;
  }
  if (!measureId) {
    const measures = [];
    for (const [id, node] of graph.nodes) {
      if (node.type === "measure") {
        const tableName = node.metadata?.table || "";
        measures.push({
          label: node.name,
          description: tableName,
          detail: orphanIds.has(id) ? "$(warning) orphan" : "",
          id
        });
      }
    }
    measures.sort((a, b) => a.label.localeCompare(b.label));
    const picked = await vscode.window.showQuickPick(measures, {
      placeHolder: "Select a measure to trace lineage",
      matchOnDescription: true
    });
    if (!picked) return;
    measureId = picked.id;
  }
  try {
    const lineage = traceMeasureLineage2(measureId, graph);
    if (!lineage) {
      vscode.window.showWarningMessage(`Could not trace lineage for this measure.`);
      return;
    }
    showLineagePanel(null, measureId, graph, lineage);
  } catch (err) {
    vscode.window.showErrorMessage(`Lineage trace failed: ${err.message}`);
  }
}
function handleFindOrphans() {
  if (!graph) {
    vscode.window.showWarningMessage("No PBIP project loaded.");
    return;
  }
  if (orphanIds.size === 0) {
    vscode.window.showInformationMessage("No orphan measures found. All measures are referenced by at least one visual.");
  } else {
    vscode.window.showInformationMessage(`Found ${orphanIds.size} orphan measure(s). Check the "Orphan Measures" panel.`);
    vscode.commands.executeCommand("pbipLineage.orphans.focus");
  }
}
function handleShowModelHealth() {
  if (!graph) {
    vscode.window.showWarningMessage("No PBIP project loaded.");
    return;
  }
  vscode.commands.executeCommand("pbipLineage.stats.focus");
}
async function handleRefresh() {
  await loadProject();
  vscode.window.showInformationMessage("PBIP Lineage refreshed.");
}
function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
}
module.exports = { activate, deactivate };
//# sourceMappingURL=extension.js.map
