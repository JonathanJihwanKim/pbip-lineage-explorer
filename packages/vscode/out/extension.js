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
  const col = { name, dataType: "", sourceColumn: "", expression: null, isHidden: false };
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
    if (trimmed === "isHidden") {
      col.isHidden = true;
      i++;
      continue;
    }
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
    if (trimmed === "isHidden") {
      props.isHidden = true;
      i++;
      continue;
    }
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
  const cleanExpr = mExpression.replace(/\/\*[\s\S]*?\*\//g, "");
  const sqlMatch = cleanExpr.match(/Sql\.Database\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/i);
  if (sqlMatch) {
    result.type = "SQL";
    result.server = sqlMatch[1];
    result.database = sqlMatch[2];
  }
  if (result.server && result.server.includes(".fabric.microsoft.com")) {
    result.type = "Fabric/Lakehouse";
  }
  const schemaItemMatch = cleanExpr.match(/\{[^}]*Schema\s*=\s*"([^"]+)"[^}]*Item\s*=\s*"([^"]+)"[^}]*\}/i);
  if (schemaItemMatch) {
    result.schema = schemaItemMatch[1];
    result.sourceTable = schemaItemMatch[2];
  }
  if (!result.sourceTable && !/GoogleBigQuery/i.test(cleanExpr)) {
    const nameMatch = cleanExpr.match(/\{[^}]*Name\s*=\s*"([^"]+)"[^}]*\}/i);
    if (nameMatch) {
      result.sourceTable = nameMatch[1];
    }
  }
  const bqMatch = cleanExpr.match(/GoogleBigQuery\.Database\s*\(\s*(?:"([^"]*)"|\[([^\]]*)\]|(\w+))/i);
  if (bqMatch && !result.type) {
    result.type = "BigQuery";
    result.server = bqMatch[1] || bqMatch[2] || bqMatch[3] || null;
  }
  if (/Value\.NativeQuery/i.test(cleanExpr)) {
    const nativeQueryMatch = cleanExpr.match(/Value\.NativeQuery\s*\([^,]*,\s*"([\s\S]*?)"\s*[,)]/i);
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
    }
    if (!result.sourceTable) {
      const tableInBackticks = cleanExpr.match(/\.([A-Za-z_][A-Za-z0-9_]+)\.([A-Za-z_][A-Za-z0-9_]+)`/);
      if (tableInBackticks) {
        result.database = result.database || tableInBackticks[1];
        result.sourceTable = tableInBackticks[2];
      }
    }
    if (!result.type && (result.database || result.sourceTable)) {
      result.type = "BigQuery";
    }
  }
  if (bqMatch && !result.sourceTable) {
    const nameMatches = [...cleanExpr.matchAll(/\{\s*\[(?:[^[\]]*,\s*)?Name\s*=\s*"([^"]+)"[^\]]*\]\s*\}/gi)];
    if (nameMatches.length >= 3) {
      result.server = result.server || nameMatches[0][1];
      result.database = nameMatches[nameMatches.length - 2][1];
      result.sourceTable = nameMatches[nameMatches.length - 1][1];
    } else if (nameMatches.length === 2) {
      result.database = nameMatches[0][1];
      result.sourceTable = nameMatches[1][1];
    } else if (nameMatches.length === 1) {
      result.sourceTable = nameMatches[0][1];
    }
    const bqSchemaItem = cleanExpr.match(/\{[^}]*Schema\s*=\s*"([^"]+)"[^}]*Item\s*=\s*"([^"]+)"[^}]*\}/i);
    if (bqSchemaItem) {
      result.database = bqSchemaItem[1];
      result.sourceTable = bqSchemaItem[2];
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
      const literalMatch = firstPart.match(/^"([^"]*)"(\s*meta\s*\[.*\])?\s*$/);
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
      const isParameterExpr = /IsParameterQuery\s*=\s*true/i.test(mExpression) || /^#datetime\s*\(/i.test(mExpression) || /^#date\s*\(/i.test(mExpression) || /^\d+(\.\d+)?\s*(meta\b|$)/i.test(mExpression);
      const exprKind = !mExpression || isParameterExpr ? "parameter" : "expression";
      expressions.push({ name, mExpression, kind: exprKind });
      if (isParameterExpr) {
        const quotedVal = mExpression.match(/^"([^"]*)"/);
        if (quotedVal) {
          parameters.set(name, quotedVal[1]);
        }
      } else if (!mExpression.includes("\n") && mExpression.startsWith('"') && mExpression.endsWith('"')) {
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
        width: config.width || config.defaultSize?.width || 1280,
        height: config.height || config.defaultSize?.height || 720,
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
  const isGroup = !!config.visualGroup;
  const visualType = isGroup ? "group" : visual.visualType || visual.type || config.visualType || "unknown";
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
    } else if (titleArr?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr.properties.text.expr.Literal.Value.replace(/^'|'$/g, "");
    }
  }
  if (!title && visual.visualContainerObjects?.title) {
    const titleArr = visual.visualContainerObjects.title;
    if (Array.isArray(titleArr) && titleArr[0]?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, "");
    } else if (titleArr?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr.properties.text.expr.Literal.Value.replace(/^'|'$/g, "");
    }
  }
  const fields = extractFieldReferences(visual, config);
  const isHidden = config.isHidden === true || visual.isHidden === true;
  const parentGroupName = config.parentGroupName || null;
  if (isGroup && !title && config.visualGroup?.displayName) {
    title = config.visualGroup.displayName;
  }
  return {
    id,
    type: visualType,
    visualType,
    page: pageName,
    pageId: pageName,
    title,
    fields,
    position: config.position || null,
    isHidden,
    parentGroupName
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
    const rowPattern = /\(\s*"([^"]+)"\s*,\s*NAMEOF\s*\(\s*(?:'([^']+)'\s*\[([^\]]+)\]|\[([^\]]+)\])\s*\)\s*,\s*(\d+)\s*\)/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(src)) !== null) {
      const displayName = rowMatch[1];
      const refTable = rowMatch[2];
      const refField = rowMatch[3] || rowMatch[4];
      const ordinal = parseInt(rowMatch[5], 10);
      if (refTable && refField) {
        nameofFields.push({ name: refField, reference: `'${refTable}'[${refField}]`, displayName, ordinal });
      } else if (refField) {
        nameofFields.push({ name: refField, reference: `[${refField}]`, displayName, ordinal });
      }
    }
    let m;
    nameofPattern.lastIndex = 0;
    while ((m = nameofPattern.exec(src)) !== null) {
      const refField = m[2] || m[3];
      if (refField && !nameofFields.some((f) => f.name === refField)) {
        if (m[1] && m[2]) {
          nameofFields.push({ name: m[2], reference: `'${m[1]}'[${m[2]}]` });
        } else if (m[3]) {
          nameofFields.push({ name: m[3], reference: `[${m[3]}]` });
        }
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
            expression: col.expression,
            isHidden: col.isHidden || false
          }));
          edges.push(createEdge(colId, tableId, EDGE_TYPES.COLUMN_TO_TABLE));
        }
      }
      if (table.measures) {
        for (const measure of table.measures) {
          const measureId = `measure::${table.name}.${measure.name}`;
          nodes.set(measureId, createNode(measureId, measure.name, NODE_TYPES.MEASURE, {
            table: table.name,
            expression: measure.expression,
            description: measure.description || "",
            isHidden: measure.isHidden || false
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
        const trimmedSource = partition.sourceExpression.trim();
        let linkedExprName = null;
        let linkedExpr = null;
        const simpleRefMatch = trimmedSource.match(/^(\w+)$/);
        if (simpleRefMatch && expressionMap.has(simpleRefMatch[1])) {
          linkedExprName = simpleRefMatch[1];
          linkedExpr = expressionMap.get(linkedExprName);
        }
        if (!linkedExpr) {
          let fallbackExprName = null;
          let fallbackExpr = null;
          for (const [exprName, exprObj] of expressionMap) {
            if (exprObj.kind === "parameter") continue;
            const escaped = exprName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const refRegex = new RegExp(`(?<!["''\\w])` + escaped + `(?!["''\\w])`);
            if (refRegex.test(trimmedSource)) {
              const assignRegex = new RegExp("(?:Source\\s*=|:=)\\s*" + escaped + "\\b");
              if (assignRegex.test(trimmedSource)) {
                linkedExprName = exprName;
                linkedExpr = exprObj;
                break;
              }
              if (!fallbackExprName) {
                fallbackExprName = exprName;
                fallbackExpr = exprObj;
              }
            }
          }
          if (!linkedExpr && fallbackExprName) {
            linkedExprName = fallbackExprName;
            linkedExpr = fallbackExpr;
          }
        }
        let effectiveDs = ds;
        let effectiveExpr = resolvedExpr;
        if (!effectiveDs && linkedExpr) {
          effectiveExpr = resolveParameters(linkedExpr.mExpression);
          effectiveDs = extractMDataSource(effectiveExpr);
        }
        if (effectiveDs) {
          const sourceKey = effectiveDs.database ? `${(effectiveDs.server || "").toLowerCase()}/${effectiveDs.database}` : (effectiveDs.server || "").toLowerCase();
          if (sourceKey) {
            const sourceId = `source::${sourceKey}`;
            if (!sourceNodeCache.has(sourceId)) {
              const displayName = effectiveDs.database || effectiveDs.server || sourceKey;
              nodes.set(sourceId, createNode(sourceId, displayName, NODE_TYPES.SOURCE, {
                server: effectiveDs.server,
                database: effectiveDs.database,
                sourceType: effectiveDs.type
              }));
              sourceNodeCache.set(sourceId, true);
            }
            const tableId = `table::${table.name}`;
            edges.push(createEdge(tableId, sourceId, EDGE_TYPES.TABLE_TO_SOURCE));
            const tableNode = nodes.get(tableId);
            if (tableNode) {
              tableNode.metadata.dataSource = {
                server: effectiveDs.server,
                database: effectiveDs.database,
                schema: effectiveDs.schema,
                sourceTable: effectiveDs.sourceTable,
                sourceType: effectiveDs.type,
                mode: partition.mode
              };
              let renameMap = extractRenameColumns(resolvedExpr);
              if (renameMap.size === 0 && effectiveExpr !== resolvedExpr) {
                renameMap = extractRenameColumns(effectiveExpr);
              }
              if (renameMap.size > 0) {
                tableNode.metadata.renameMap = Object.fromEntries(renameMap);
              }
            }
          }
        }
        if (linkedExprName && linkedExpr) {
          const exprId = `expression::${linkedExprName}`;
          if (nodes.has(exprId)) {
            edges.push(createEdge(`table::${table.name}`, exprId, EDGE_TYPES.TABLE_TO_EXPRESSION));
          }
        }
      }
    }
  }
  if (parsedModel && parsedModel.tables) {
    for (const table of parsedModel.tables) {
      const tableId = `table::${table.name}`;
      const tableNode = nodes.get(tableId);
      let ds = tableNode?.metadata?.dataSource;
      let renameMap = tableNode?.metadata?.renameMap || {};
      if (!ds || Object.keys(renameMap).length === 0) {
        const tableUp = function buildAdj() {
          const up = [];
          for (const edge of edges) {
            if (edge.source === tableId && (edge.type === EDGE_TYPES.TABLE_TO_EXPRESSION || edge.type === EDGE_TYPES.TABLE_TO_SOURCE)) {
              up.push(edge.target);
            }
          }
          return up;
        }();
        for (const upId of tableUp) {
          const upNode = nodes.get(upId);
          if (!ds && upNode?.metadata?.dataSource) {
            ds = upNode.metadata.dataSource;
          }
          if (Object.keys(renameMap).length === 0 && upNode?.type === "expression" && upNode.metadata?.mExpression) {
            const exprRenames = extractRenameColumns(upNode.metadata.mExpression);
            if (exprRenames.size > 0) {
              renameMap = Object.fromEntries(exprRenames);
            }
          }
        }
      }
      if (!ds) continue;
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
          const fullTableWithDb = ds.database ? `${ds.database}.${fullTable}` : fullTable;
          colNode.metadata.sourceTableFull = `${fullTableWithDb}.${originalCol}`;
          colNode.metadata.sourceTablePath = fullTableWithDb;
        }
      }
    }
  }
  if (parsedReport) {
    if (parsedReport.pages) {
      for (const page of parsedReport.pages) {
        const pageId = `page::${page.id}`;
        nodes.set(pageId, createNode(pageId, page.name, NODE_TYPES.PAGE, {
          pageId: page.id,
          width: page.width || 1280,
          height: page.height || 720,
          ordinal: page.order ?? 0
        }));
      }
    }
    if (parsedReport.visuals) {
      for (const visual of parsedReport.visuals) {
        const visualId = `visual::${visual.pageId}/${visual.id}`;
        nodes.set(visualId, createNode(visualId, visual.title || visual.visualType, NODE_TYPES.VISUAL, {
          visualType: visual.visualType,
          pageId: visual.pageId,
          title: visual.title || "",
          position: visual.position || null,
          isHidden: visual.isHidden || false,
          parentGroupName: visual.parentGroupName || null
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
        const fpDisplayNames = {};
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
            if (field.displayName) {
              fpDisplayNames[targetId] = field.displayName;
            }
          }
        }
        if (tableNode && Object.keys(fpDisplayNames).length > 0) {
          tableNode.metadata.fpDisplayNames = fpDisplayNames;
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
    let fpDisplayName = "";
    const upNeighbors = graph2.adjacency.upstream.get(nodeId) || [];
    for (const upId of upNeighbors) {
      const upNode = graph2.nodes.get(upId);
      if (upNode && (upNode.enrichment?.type === "field_parameter" || upNode.metadata?.isFieldParameter)) {
        bindingType = "fieldParameter";
        fieldParameterTable = upNode.metadata?.table || upNode.name;
        const displayNames = upNode.metadata?.fpDisplayNames;
        if (displayNames && displayNames[measureNode.id]) {
          fpDisplayName = displayNames[measureNode.id];
        }
        break;
      }
    }
    visuals.push({
      page: pageName,
      visualType: node.metadata?.visualType || node.name,
      title: node.metadata?.title || node.name,
      id: node.id,
      metricDisplayName: fpDisplayName || measureNode.name,
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
  const fpDisplayNameMap = /* @__PURE__ */ new Map();
  for (const fpTableId of referencedFpTableIds) {
    const fpTable = graph2.nodes.get(fpTableId);
    const displayNames = fpTable?.metadata?.fpDisplayNames;
    if (displayNames) {
      for (const [measureId, displayName] of Object.entries(displayNames)) {
        fpDisplayNameMap.set(measureId, displayName);
      }
    }
  }
  const measures = Array.from(directMeasureIds).map((measureId) => {
    const node = graph2.nodes.get(measureId);
    return {
      measureId,
      measureName: node?.name || measureId,
      fpDisplayName: fpDisplayNameMap.get(measureId) || "",
      lineage: traceMeasureLineage(measureId, graph2)
    };
  });
  const fpMeasures = Array.from(fieldParamMeasureIds).filter((id) => !directMeasureIds.has(id)).map((measureId) => {
    const node = graph2.nodes.get(measureId);
    return {
      measureId,
      measureName: node?.name || measureId,
      fpDisplayName: fpDisplayNameMap.get(measureId) || "",
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
    description: node.metadata?.description || "",
    children: [],
    // sub-measures
    columns: [],
    // leaf column references
    useRelationships: []
    // USERELATIONSHIP references
  };
  for (const edge of graph2.edges) {
    if (edge.type === EDGE_TYPES.MEASURE_TO_USERELATIONSHIP && edge.source === measureNodeId) {
      const colNode = graph2.nodes.get(edge.target);
      if (colNode) {
        result.useRelationships.push({
          column: colNode.name,
          table: colNode.metadata?.table || ""
        });
      }
    }
  }
  if (result.useRelationships.length > 0) {
    const relTables = new Set(result.useRelationships.map((ur) => ur.table));
    for (const edge of graph2.edges) {
      if (edge.type === "table_relationship") {
        const srcNode = graph2.nodes.get(edge.source);
        const tgtNode = graph2.nodes.get(edge.target);
        if (srcNode && tgtNode && relTables.has(srcNode.name) && relTables.has(tgtNode.name)) {
          result.useRelationships.crossFilter = edge.metadata?.crossFilter || "single";
          result.useRelationships.fromTable = srcNode.name;
          result.useRelationships.toTable = tgtNode.name;
        }
      }
    }
  }
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
        sourceTablePath: upNode.metadata?.sourceTablePath || "",
        isHidden: upNode.metadata?.isHidden || false
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
      let srcTable = col.sourceTablePath || "";
      let srcColumn = col.sourceTableFull || col.sourceColumn || col.name;
      if (tableNode) {
        const tableUp = graph2.adjacency.upstream.get(tableNodeId) || [];
        for (const upId of tableUp) {
          const upNode = graph2.nodes.get(upId);
          if (upNode && upNode.type === "expression") {
            if (upNode.metadata?.dataSource?.sourceTable && !srcTable) {
              const exprDs = upNode.metadata.dataSource;
              const exprFullTable = exprDs.schema ? `${exprDs.schema}.${exprDs.sourceTable}` : exprDs.sourceTable;
              srcTable = exprDs.database ? `${exprDs.database}.${exprFullTable}` : exprFullTable;
            }
          } else if (upNode && upNode.type === "source") {
            if (!srcTable && upNode.metadata?.database) {
              srcTable = `${upNode.metadata.database}.*`;
            }
          }
        }
      }
      if (srcTable && srcColumn && !srcColumn.includes(".")) {
        srcColumn = `${srcTable}.${srcColumn}`;
      }
      const mode = tableNode?.metadata?.dataSource?.mode || "";
      rows.push({
        daxReference: `${parentMeasure || chain.name}`,
        pbiTable: col.table,
        pbiColumn: col.name,
        dataType: col.dataType || "",
        isHidden: col.isHidden || false,
        sourceColumn: col.sourceColumn || col.name,
        originalSourceColumn: col.originalSourceColumn || "",
        sourceTable: srcTable,
        sourceColumnFull: srcColumn,
        renamed: col.wasRenamed,
        renameChain: col.wasRenamed ? { sourceName: col.originalSourceColumn || "", pqName: col.sourceColumn || "", pbiName: col.name } : null,
        mode
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

// ../core/src/diff/changeTypes.js
function createChange({ type, scope, target, description, impact = [], details = {} }) {
  return { type, scope, target, description, impact, details };
}
var CHANGE_TYPES, CHANGE_SCOPES;
var init_changeTypes = __esm({
  "../core/src/diff/changeTypes.js"() {
    CHANGE_TYPES = {
      DEFAULT_PAGE_CHANGED: "default_page_changed",
      PAGE_ADDED: "page_added",
      PAGE_REMOVED: "page_removed",
      FILTER_ADDED: "filter_added",
      FILTER_REMOVED: "filter_removed",
      FILTER_CHANGED: "filter_changed",
      MEASURE_CHANGED: "measure_changed",
      MEASURE_ADDED: "measure_added",
      MEASURE_REMOVED: "measure_removed",
      VISUAL_VISIBILITY_CHANGED: "visual_visibility_changed",
      VISUAL_FILTER_ADDED: "visual_filter_added",
      VISUAL_FILTER_REMOVED: "visual_filter_removed",
      VISUAL_FILTER_CHANGED: "visual_filter_changed",
      VISUAL_BOOKMARK_CHANGED: "visual_bookmark_changed",
      VISUAL_ADDED: "visual_added",
      VISUAL_REMOVED: "visual_removed",
      VISUAL_FIELD_CHANGED: "visual_field_changed",
      BOOKMARK_CHANGED: "bookmark_changed",
      CALC_ITEM_CHANGED: "calc_item_changed",
      CALC_ITEM_ADDED: "calc_item_added",
      CALC_ITEM_REMOVED: "calc_item_removed"
    };
    CHANGE_SCOPES = {
      PAGE: "page",
      REPORT: "report",
      VISUAL: "visual",
      MEASURE: "measure",
      BOOKMARK: "bookmark"
    };
  }
});

// ../core/src/diff/filterDiff.js
function diffFilters(beforeFilters, afterFilters, context) {
  const changes = [];
  const { scope, target, locationLabel } = context;
  const beforeMap = /* @__PURE__ */ new Map();
  for (const f of beforeFilters) {
    if (f.name) beforeMap.set(f.name, f);
  }
  const afterMap = /* @__PURE__ */ new Map();
  for (const f of afterFilters) {
    if (f.name) afterMap.set(f.name, f);
  }
  for (const [name, filter] of afterMap) {
    if (!beforeMap.has(name)) {
      const filterDesc = describeFilter(filter);
      const changeType = scope === CHANGE_SCOPES.VISUAL ? CHANGE_TYPES.VISUAL_FILTER_ADDED : CHANGE_TYPES.FILTER_ADDED;
      changes.push(createChange({
        type: changeType,
        scope,
        target: { ...target, filterName: name },
        description: `Added filter on ${filterDesc} to ${locationLabel}`,
        details: { after: summarizeFilter(filter) }
      }));
    }
  }
  for (const [name, filter] of beforeMap) {
    if (!afterMap.has(name)) {
      const filterDesc = describeFilter(filter);
      const changeType = scope === CHANGE_SCOPES.VISUAL ? CHANGE_TYPES.VISUAL_FILTER_REMOVED : CHANGE_TYPES.FILTER_REMOVED;
      changes.push(createChange({
        type: changeType,
        scope,
        target: { ...target, filterName: name },
        description: `Removed filter on ${filterDesc} from ${locationLabel}`,
        details: { before: summarizeFilter(filter) }
      }));
    }
  }
  for (const [name, afterFilter] of afterMap) {
    const beforeFilter = beforeMap.get(name);
    if (!beforeFilter) continue;
    const beforeSummary = summarizeFilter(beforeFilter);
    const afterSummary = summarizeFilter(afterFilter);
    if (JSON.stringify(beforeSummary) !== JSON.stringify(afterSummary)) {
      const filterDesc = describeFilter(afterFilter);
      const changeType = scope === CHANGE_SCOPES.VISUAL ? CHANGE_TYPES.VISUAL_FILTER_CHANGED : CHANGE_TYPES.FILTER_CHANGED;
      let description = `Changed filter on ${filterDesc} in ${locationLabel}`;
      const valueDiff = describeValueChange(beforeFilter, afterFilter);
      if (valueDiff) description += `: ${valueDiff}`;
      changes.push(createChange({
        type: changeType,
        scope,
        target: { ...target, filterName: name },
        description,
        details: { before: beforeSummary, after: afterSummary }
      }));
    }
  }
  return changes;
}
function detectReportFilterChanges(beforeFiles, afterFiles) {
  const beforeReport = findReportJson(beforeFiles);
  const afterReport = findReportJson(afterFiles);
  if (!beforeReport && !afterReport) return [];
  try {
    const beforeConfig = beforeReport ? JSON.parse(beforeReport) : {};
    const afterConfig = afterReport ? JSON.parse(afterReport) : {};
    const beforeFilters = extractReportFilters(beforeConfig);
    const afterFilters = extractReportFilters(afterConfig);
    return diffFilters(beforeFilters, afterFilters, {
      scope: CHANGE_SCOPES.REPORT,
      target: {},
      locationLabel: "filters on all pages"
    });
  } catch {
    return [];
  }
}
function extractReportFilters(config) {
  if (config.filterConfig?.filters) return config.filterConfig.filters;
  const filters = [];
  if (config.filters && Array.isArray(config.filters)) {
    return config.filters;
  }
  return filters;
}
function describeFilter(filter) {
  const field = filter.field;
  if (!field) return `"${filter.name || "unknown"}"`;
  let entity = "";
  let property = "";
  if (field.Column) {
    entity = field.Column.Expression?.SourceRef?.Entity || "";
    property = field.Column.Property || "";
  } else if (field.Measure) {
    entity = field.Measure.Expression?.SourceRef?.Entity || "";
    property = field.Measure.Property || "";
  }
  if (entity && property) return `${entity}[${property}]`;
  if (entity) return entity;
  if (property) return property;
  return `"${filter.name || "unknown"}"`;
}
function summarizeFilter(filter) {
  const summary = {
    entity: "",
    property: "",
    type: filter.type || "",
    isHiddenInViewMode: filter.isHiddenInViewMode || false
  };
  const field = filter.field;
  if (field?.Column) {
    summary.entity = field.Column.Expression?.SourceRef?.Entity || "";
    summary.property = field.Column.Property || "";
  } else if (field?.Measure) {
    summary.entity = field.Measure.Expression?.SourceRef?.Entity || "";
    summary.property = field.Measure.Property || "";
  }
  summary.values = extractFilterValues(filter);
  return summary;
}
function extractFilterValues(filter) {
  const values = [];
  const where = filter.filter?.Where;
  if (!Array.isArray(where)) return values;
  for (const clause of where) {
    const inExpr = clause.Condition?.In;
    if (inExpr?.Values) {
      for (const valArr of inExpr.Values) {
        for (const val of valArr) {
          if (val.Literal?.Value) {
            values.push(val.Literal.Value.replace(/^'|'$/g, ""));
          }
        }
      }
    }
    const notExpr = clause.Condition?.Not?.Expression?.In;
    if (notExpr?.Values) {
      for (const valArr of notExpr.Values) {
        for (const val of valArr) {
          if (val.Literal?.Value) {
            values.push("NOT: " + val.Literal.Value.replace(/^'|'$/g, ""));
          }
        }
      }
    }
    const comparison = clause.Condition?.Comparison || clause.Condition?.comparison;
    if (comparison) {
      const op = comparison.ComparisonKind ?? "";
      const right = comparison.Right?.Literal?.Value;
      if (right !== void 0) {
        values.push(`${op} ${String(right).replace(/^'|'$/g, "")}`);
      }
    }
  }
  return values;
}
function describeValueChange(beforeFilter, afterFilter) {
  const beforeValues = extractFilterValues(beforeFilter);
  const afterValues = extractFilterValues(afterFilter);
  if (beforeValues.length === 0 && afterValues.length === 0) return "";
  const added = afterValues.filter((v) => !beforeValues.includes(v));
  const removed = beforeValues.filter((v) => !afterValues.includes(v));
  const parts = [];
  if (added.length > 0) parts.push(`selected ${added.map((v) => `"${v}"`).join(", ")}`);
  if (removed.length > 0) parts.push(`deselected ${removed.map((v) => `"${v}"`).join(", ")}`);
  return parts.join("; ");
}
function findReportJson(files) {
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.endsWith("/report.json") || lower === "definition/report.json") {
      return content;
    }
  }
  return null;
}
var init_filterDiff = __esm({
  "../core/src/diff/filterDiff.js"() {
    init_changeTypes();
  }
});

// ../core/src/diff/pageDiff.js
function detectPageChanges(beforeFiles, afterFiles) {
  const changes = [];
  changes.push(...detectActivePageChange(beforeFiles, afterFiles));
  changes.push(...detectPageAddRemove(beforeFiles, afterFiles));
  changes.push(...detectPageFilterChanges(beforeFiles, afterFiles));
  return changes;
}
function detectActivePageChange(beforeFiles, afterFiles) {
  const changes = [];
  const beforePages = findPagesJson(beforeFiles);
  const afterPages = findPagesJson(afterFiles);
  if (!beforePages || !afterPages) return changes;
  try {
    const beforeConfig = JSON.parse(beforePages);
    const afterConfig = JSON.parse(afterPages);
    if (beforeConfig.activePageName !== afterConfig.activePageName) {
      const beforePageName = resolvePageDisplayName(beforeConfig.activePageName, beforeFiles);
      const afterPageName = resolvePageDisplayName(afterConfig.activePageName, afterFiles);
      changes.push(createChange({
        type: CHANGE_TYPES.DEFAULT_PAGE_CHANGED,
        scope: CHANGE_SCOPES.REPORT,
        target: { pageId: afterConfig.activePageName, pageName: afterPageName },
        description: `Default page changed from "${beforePageName}" to "${afterPageName}"`,
        details: {
          before: { pageId: beforeConfig.activePageName, pageName: beforePageName },
          after: { pageId: afterConfig.activePageName, pageName: afterPageName }
        }
      }));
    }
  } catch {
  }
  return changes;
}
function detectPageAddRemove(beforeFiles, afterFiles) {
  const changes = [];
  const beforePageIds = extractPageIds(beforeFiles);
  const afterPageIds = extractPageIds(afterFiles);
  for (const pageId of afterPageIds) {
    if (!beforePageIds.has(pageId)) {
      const pageName = resolvePageDisplayName(pageId, afterFiles);
      changes.push(createChange({
        type: CHANGE_TYPES.PAGE_ADDED,
        scope: CHANGE_SCOPES.PAGE,
        target: { pageId, pageName },
        description: `Page "${pageName}" was added`
      }));
    }
  }
  for (const pageId of beforePageIds) {
    if (!afterPageIds.has(pageId)) {
      const pageName = resolvePageDisplayName(pageId, beforeFiles);
      changes.push(createChange({
        type: CHANGE_TYPES.PAGE_REMOVED,
        scope: CHANGE_SCOPES.PAGE,
        target: { pageId, pageName },
        description: `Page "${pageName}" was removed`
      }));
    }
  }
  return changes;
}
function detectPageFilterChanges(beforeFiles, afterFiles) {
  const changes = [];
  const beforePageFiles = findAllPageJsonFiles(beforeFiles);
  const afterPageFiles = findAllPageJsonFiles(afterFiles);
  const allPageIds = /* @__PURE__ */ new Set([...beforePageFiles.keys(), ...afterPageFiles.keys()]);
  for (const pageId of allPageIds) {
    const beforeContent = beforePageFiles.get(pageId);
    const afterContent = afterPageFiles.get(pageId);
    if (!beforeContent && !afterContent) continue;
    try {
      const beforeConfig = beforeContent ? JSON.parse(beforeContent) : {};
      const afterConfig = afterContent ? JSON.parse(afterContent) : {};
      const pageName = afterConfig.displayName || beforeConfig.displayName || pageId;
      const beforeFilters = beforeConfig.filterConfig?.filters || [];
      const afterFilters = afterConfig.filterConfig?.filters || [];
      const filterChanges = diffFilters(beforeFilters, afterFilters, {
        scope: CHANGE_SCOPES.PAGE,
        target: { pageId, pageName },
        locationLabel: `page "${pageName}"`
      });
      changes.push(...filterChanges);
    } catch {
    }
  }
  return changes;
}
function findPagesJson(files) {
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.endsWith("/pages/pages.json") || lower === "definition/pages/pages.json") {
      return content;
    }
  }
  return null;
}
function extractPageIds(files) {
  const pageIds = /* @__PURE__ */ new Set();
  for (const [path] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.endsWith("/page.json")) {
      const parts = path.replace(/\\/g, "/").split("/");
      const pagesIdx = parts.findIndex((p) => p.toLowerCase() === "pages");
      if (pagesIdx !== -1 && pagesIdx + 1 < parts.length) {
        pageIds.add(parts[pagesIdx + 1]);
      }
    }
  }
  return pageIds;
}
function findAllPageJsonFiles(files) {
  const pageFiles = /* @__PURE__ */ new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.endsWith("/page.json")) {
      const parts = path.replace(/\\/g, "/").split("/");
      const pagesIdx = parts.findIndex((p) => p.toLowerCase() === "pages");
      if (pagesIdx !== -1 && pagesIdx + 1 < parts.length) {
        const pageId = parts[pagesIdx + 1];
        pageFiles.set(pageId, content);
      }
    }
  }
  return pageFiles;
}
function resolvePageDisplayName(pageId, files) {
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.endsWith("/page.json") && path.replace(/\\/g, "/").includes(`/${pageId}/`)) {
      try {
        const config = JSON.parse(content);
        return config.displayName || config.name || pageId;
      } catch {
      }
    }
  }
  return pageId;
}
var init_pageDiff = __esm({
  "../core/src/diff/pageDiff.js"() {
    init_changeTypes();
    init_filterDiff();
  }
});

// ../core/src/diff/measureDiff.js
function detectMeasureChanges(beforeFiles, afterFiles) {
  const changes = [];
  const beforeModel = parseModelFromFiles(beforeFiles);
  const afterModel = parseModelFromFiles(afterFiles);
  if (!beforeModel || !afterModel) return changes;
  const beforeMeasures = buildMeasureMap(beforeModel.tables);
  const afterMeasures = buildMeasureMap(afterModel.tables);
  for (const [key, measure] of afterMeasures) {
    if (!beforeMeasures.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.MEASURE_ADDED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { measureName: measure.name, tableName: measure.tableName },
        description: `Measure [${measure.name}] added to table "${measure.tableName}"`,
        details: { after: { expression: measure.expression } }
      }));
    }
  }
  for (const [key, measure] of beforeMeasures) {
    if (!afterMeasures.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.MEASURE_REMOVED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { measureName: measure.name, tableName: measure.tableName },
        description: `Measure [${measure.name}] removed from table "${measure.tableName}"`,
        details: { before: { expression: measure.expression } }
      }));
    }
  }
  for (const [key, afterMeasure] of afterMeasures) {
    const beforeMeasure = beforeMeasures.get(key);
    if (!beforeMeasure) continue;
    const beforeExpr = normalizeExpression(beforeMeasure.expression);
    const afterExpr = normalizeExpression(afterMeasure.expression);
    if (beforeExpr !== afterExpr) {
      changes.push(createChange({
        type: CHANGE_TYPES.MEASURE_CHANGED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { measureName: afterMeasure.name, tableName: afterMeasure.tableName },
        description: `Measure [${afterMeasure.name}] expression changed in table "${afterMeasure.tableName}"`,
        details: {
          before: { expression: beforeMeasure.expression },
          after: { expression: afterMeasure.expression }
        }
      }));
    }
  }
  changes.push(...detectCalcItemChanges(beforeModel.tables, afterModel.tables));
  return changes;
}
function detectCalcItemChanges(beforeTables, afterTables) {
  const changes = [];
  const beforeCalcItems = buildCalcItemMap(beforeTables);
  const afterCalcItems = buildCalcItemMap(afterTables);
  for (const [key, item] of afterCalcItems) {
    if (!beforeCalcItems.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.CALC_ITEM_ADDED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { calcGroupName: item.tableName, calcItemName: item.name },
        description: `Calculation item [${item.name}] added to calculation group "${item.tableName}"`,
        details: { after: { expression: item.expression } }
      }));
    }
  }
  for (const [key, item] of beforeCalcItems) {
    if (!afterCalcItems.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.CALC_ITEM_REMOVED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { calcGroupName: item.tableName, calcItemName: item.name },
        description: `Calculation item [${item.name}] removed from calculation group "${item.tableName}"`,
        details: { before: { expression: item.expression } }
      }));
    }
  }
  for (const [key, afterItem] of afterCalcItems) {
    const beforeItem = beforeCalcItems.get(key);
    if (!beforeItem) continue;
    if (normalizeExpression(beforeItem.expression) !== normalizeExpression(afterItem.expression)) {
      changes.push(createChange({
        type: CHANGE_TYPES.CALC_ITEM_CHANGED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { calcGroupName: afterItem.tableName, calcItemName: afterItem.name },
        description: `Calculation item [${afterItem.name}] expression changed in "${afterItem.tableName}"`,
        details: {
          before: { expression: beforeItem.expression },
          after: { expression: afterItem.expression }
        }
      }));
    }
  }
  return changes;
}
function parseModelFromFiles(files) {
  const structure = identifyProjectStructure(files);
  if (!structure.tmdlFiles || structure.tmdlFiles.length === 0) return null;
  return parseTmdlModel(structure.tmdlFiles, structure.relationshipFiles || []);
}
function buildMeasureMap(tables) {
  const map = /* @__PURE__ */ new Map();
  for (const table of tables) {
    for (const measure of table.measures || []) {
      const key = `${table.name}.${measure.name}`;
      map.set(key, {
        name: measure.name,
        tableName: table.name,
        expression: measure.expression || ""
      });
    }
  }
  return map;
}
function buildCalcItemMap(tables) {
  const map = /* @__PURE__ */ new Map();
  for (const table of tables) {
    if (!table.calculationGroup || !table.calculationItems) continue;
    for (const item of table.calculationItems) {
      const key = `${table.name}.${item.name}`;
      map.set(key, {
        name: item.name,
        tableName: table.name,
        expression: item.expression || ""
      });
    }
  }
  return map;
}
function normalizeExpression(expr) {
  if (!expr) return "";
  return expr.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
}
var init_measureDiff = __esm({
  "../core/src/diff/measureDiff.js"() {
    init_changeTypes();
    init_tmdlParser();
    init_projectStructure();
  }
});

// ../core/src/diff/visualDiff.js
function detectVisualChanges(beforeFiles, afterFiles) {
  const changes = [];
  const beforeVisuals = findAllVisualFiles(beforeFiles);
  const afterVisuals = findAllVisualFiles(afterFiles);
  for (const [visualId, info] of afterVisuals) {
    if (!beforeVisuals.has(visualId)) {
      const config = parseJson(info.content);
      const title = extractVisualTitle(config) || visualId;
      const pageId = info.pageId;
      const pageName = resolvePageName(pageId, afterFiles);
      changes.push(createChange({
        type: CHANGE_TYPES.VISUAL_ADDED,
        scope: CHANGE_SCOPES.VISUAL,
        target: { visualId, visualName: title, pageId, pageName },
        description: `Visual "${title}" added to page "${pageName}"`
      }));
    }
  }
  for (const [visualId, info] of beforeVisuals) {
    if (!afterVisuals.has(visualId)) {
      const config = parseJson(info.content);
      const title = extractVisualTitle(config) || visualId;
      const pageId = info.pageId;
      const pageName = resolvePageName(pageId, beforeFiles);
      changes.push(createChange({
        type: CHANGE_TYPES.VISUAL_REMOVED,
        scope: CHANGE_SCOPES.VISUAL,
        target: { visualId, visualName: title, pageId, pageName },
        description: `Visual "${title}" removed from page "${pageName}"`
      }));
    }
  }
  for (const [visualId, afterInfo] of afterVisuals) {
    const beforeInfo = beforeVisuals.get(visualId);
    if (!beforeInfo) continue;
    if (beforeInfo.content === afterInfo.content) continue;
    const beforeConfig = parseJson(beforeInfo.content);
    const afterConfig = parseJson(afterInfo.content);
    if (!beforeConfig || !afterConfig) continue;
    const title = extractVisualTitle(afterConfig) || extractVisualTitle(beforeConfig) || visualId;
    const pageId = afterInfo.pageId;
    const pageName = resolvePageName(pageId, afterFiles);
    const target = { visualId, visualName: title, pageId, pageName };
    changes.push(...detectVisibilityChange(beforeConfig, afterConfig, target));
    changes.push(...detectBookmarkRefChange(beforeConfig, afterConfig, target));
    changes.push(...detectVisualFilterChanges(beforeConfig, afterConfig, target));
    changes.push(...detectFieldBindingChanges(beforeConfig, afterConfig, target));
  }
  return changes;
}
function detectVisibilityChange(beforeConfig, afterConfig, target) {
  const beforeHidden = beforeConfig.isHidden === true;
  const afterHidden = afterConfig.isHidden === true;
  if (beforeHidden === afterHidden) return [];
  return [createChange({
    type: CHANGE_TYPES.VISUAL_VISIBILITY_CHANGED,
    scope: CHANGE_SCOPES.VISUAL,
    target,
    description: afterHidden ? `Visual "${target.visualName}" was hidden in page "${target.pageName}"` : `Visual "${target.visualName}" was unhidden in page "${target.pageName}"`,
    details: { before: { isHidden: beforeHidden }, after: { isHidden: afterHidden } }
  })];
}
function detectBookmarkRefChange(beforeConfig, afterConfig, target) {
  const beforeRefs = extractBookmarkRefs(beforeConfig);
  const afterRefs = extractBookmarkRefs(afterConfig);
  if (beforeRefs.length === 0 && afterRefs.length === 0) return [];
  const beforeSet = new Set(beforeRefs);
  const afterSet = new Set(afterRefs);
  const added = afterRefs.filter((r) => !beforeSet.has(r));
  const removed = beforeRefs.filter((r) => !afterSet.has(r));
  if (added.length === 0 && removed.length === 0) return [];
  return [createChange({
    type: CHANGE_TYPES.VISUAL_BOOKMARK_CHANGED,
    scope: CHANGE_SCOPES.VISUAL,
    target,
    description: `Button/bookmark reference changed in visual "${target.visualName}" on page "${target.pageName}"`,
    details: { before: beforeRefs, after: afterRefs }
  })];
}
function detectVisualFilterChanges(beforeConfig, afterConfig, target) {
  const beforeFilters = beforeConfig.filterConfig?.filters || [];
  const afterFilters = afterConfig.filterConfig?.filters || [];
  if (beforeFilters.length === 0 && afterFilters.length === 0) return [];
  return diffFilters(beforeFilters, afterFilters, {
    scope: CHANGE_SCOPES.VISUAL,
    target,
    locationLabel: `visual "${target.visualName}" on page "${target.pageName}"`
  });
}
function detectFieldBindingChanges(beforeConfig, afterConfig, target) {
  const beforeFields = extractFieldsSimple(beforeConfig);
  const afterFields = extractFieldsSimple(afterConfig);
  const beforeSet = new Set(beforeFields.map((f) => `${f.type}|${f.table}|${f.field}`));
  const afterSet = new Set(afterFields.map((f) => `${f.type}|${f.table}|${f.field}`));
  const added = afterFields.filter((f) => !beforeSet.has(`${f.type}|${f.table}|${f.field}`));
  const removed = beforeFields.filter((f) => !afterSet.has(`${f.type}|${f.table}|${f.field}`));
  if (added.length === 0 && removed.length === 0) return [];
  const parts = [];
  if (added.length > 0) {
    parts.push(`added ${added.map((f) => `${f.table}[${f.field}]`).join(", ")}`);
  }
  if (removed.length > 0) {
    parts.push(`removed ${removed.map((f) => `${f.table}[${f.field}]`).join(", ")}`);
  }
  return [createChange({
    type: CHANGE_TYPES.VISUAL_FIELD_CHANGED,
    scope: CHANGE_SCOPES.VISUAL,
    target,
    description: `Field bindings changed in visual "${target.visualName}" on page "${target.pageName}": ${parts.join("; ")}`,
    details: { added, removed }
  })];
}
function extractFieldsSimple(config) {
  const fields = [];
  const seen = /* @__PURE__ */ new Set();
  function add(type, table, field) {
    const key = `${type}|${table}|${field}`;
    if (!seen.has(key) && table && field) {
      seen.add(key);
      fields.push({ type, table, field });
    }
  }
  const visual = config.visual || config;
  const query = visual.prototypeQuery || visual.query;
  const aliasMap = {};
  if (query?.From) {
    for (const from of query.From) {
      if (from.Name && from.Entity) aliasMap[from.Name] = from.Entity;
    }
  }
  if (query?.Select) {
    for (const item of query.Select) {
      if (item.Column) {
        const entity = item.Column.Expression?.SourceRef?.Entity || aliasMap[item.Column.Expression?.SourceRef?.Source] || "";
        add("column", entity, item.Column.Property || "");
      }
      if (item.Measure) {
        const entity = item.Measure.Expression?.SourceRef?.Entity || aliasMap[item.Measure.Expression?.SourceRef?.Source] || "";
        add("measure", entity, item.Measure.Property || "");
      }
    }
  }
  const queryState = visual.query?.queryState || visual.queryState;
  if (queryState) {
    for (const roleState of Object.values(queryState)) {
      if (!roleState?.projections) continue;
      for (const proj of roleState.projections) {
        const f = proj?.field;
        if (f?.Column) {
          add("column", f.Column.Expression?.SourceRef?.Entity || "", f.Column.Property || "");
        }
        if (f?.Measure) {
          add("measure", f.Measure.Expression?.SourceRef?.Entity || "", f.Measure.Property || "");
        }
      }
    }
  }
  return fields;
}
function extractBookmarkRefs(config) {
  const refs = [];
  const bookmarkPattern = /Bookmark[a-f0-9]{20,}/g;
  const json = JSON.stringify(config);
  let match;
  while ((match = bookmarkPattern.exec(json)) !== null) {
    if (!refs.includes(match[0])) refs.push(match[0]);
  }
  return refs;
}
function extractVisualTitle(config) {
  if (!config) return "";
  const visual = config.visual || config;
  if (visual.title) {
    return typeof visual.title === "string" ? visual.title : visual.title.text || "";
  }
  if (visual.vcObjects?.title) {
    const arr = visual.vcObjects.title;
    if (Array.isArray(arr) && arr[0]?.properties?.text?.expr?.Literal?.Value) {
      return arr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, "");
    }
  }
  if (visual.visualContainerObjects?.title) {
    const arr = visual.visualContainerObjects.title;
    if (Array.isArray(arr) && arr[0]?.properties?.text?.expr?.Literal?.Value) {
      return arr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, "");
    }
  }
  return config.name || "";
}
function findAllVisualFiles(files) {
  const visuals = /* @__PURE__ */ new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.includes("/visuals/") && lower.endsWith("/visual.json")) {
      const parts = path.replace(/\\/g, "/").split("/");
      const visualsIdx = parts.findLastIndex((p) => p.toLowerCase() === "visuals");
      if (visualsIdx !== -1 && visualsIdx + 1 < parts.length) {
        const visualId = parts[visualsIdx + 1];
        const pagesIdx = parts.findIndex((p) => p.toLowerCase() === "pages");
        const pageId = pagesIdx !== -1 && pagesIdx + 1 < parts.length ? parts[pagesIdx + 1] : "";
        visuals.set(visualId, { content, pageId, path });
      }
    }
  }
  return visuals;
}
function resolvePageName(pageId, files) {
  if (!pageId) return "unknown";
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.endsWith("/page.json") && path.replace(/\\/g, "/").includes(`/${pageId}/`)) {
      try {
        const config = JSON.parse(content);
        return config.displayName || config.name || pageId;
      } catch {
      }
    }
  }
  return pageId;
}
function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
var init_visualDiff = __esm({
  "../core/src/diff/visualDiff.js"() {
    init_changeTypes();
    init_filterDiff();
  }
});

// ../core/src/diff/bookmarkDiff.js
function detectBookmarkChanges(beforeFiles, afterFiles) {
  const changes = [];
  const beforeBookmarks = findAllBookmarkFiles(beforeFiles);
  const afterBookmarks = findAllBookmarkFiles(afterFiles);
  for (const [id, info] of afterBookmarks) {
    if (!beforeBookmarks.has(id)) {
      const config = parseJson2(info.content);
      const name = config?.displayName || id;
      changes.push(createChange({
        type: CHANGE_TYPES.BOOKMARK_CHANGED,
        scope: CHANGE_SCOPES.BOOKMARK,
        target: { bookmarkId: id, bookmarkName: name },
        description: `Bookmark "${name}" was added`,
        details: { after: summarizeBookmark(config) }
      }));
    }
  }
  for (const [id, info] of beforeBookmarks) {
    if (!afterBookmarks.has(id)) {
      const config = parseJson2(info.content);
      const name = config?.displayName || id;
      changes.push(createChange({
        type: CHANGE_TYPES.BOOKMARK_CHANGED,
        scope: CHANGE_SCOPES.BOOKMARK,
        target: { bookmarkId: id, bookmarkName: name },
        description: `Bookmark "${name}" was removed`,
        details: { before: summarizeBookmark(config) }
      }));
    }
  }
  for (const [id, afterInfo] of afterBookmarks) {
    const beforeInfo = beforeBookmarks.get(id);
    if (!beforeInfo || beforeInfo.content === afterInfo.content) continue;
    const beforeConfig = parseJson2(beforeInfo.content);
    const afterConfig = parseJson2(afterInfo.content);
    if (!beforeConfig || !afterConfig) continue;
    const name = afterConfig.displayName || beforeConfig.displayName || id;
    const beforeSummary = summarizeBookmark(beforeConfig);
    const afterSummary = summarizeBookmark(afterConfig);
    if (JSON.stringify(beforeSummary) !== JSON.stringify(afterSummary)) {
      const descParts = [];
      if (beforeSummary.activeSection !== afterSummary.activeSection) {
        descParts.push(`active section changed`);
      }
      if (JSON.stringify(beforeSummary.targetVisuals) !== JSON.stringify(afterSummary.targetVisuals)) {
        descParts.push(`target visuals changed`);
      }
      if (JSON.stringify(beforeSummary.filterOverrides) !== JSON.stringify(afterSummary.filterOverrides)) {
        descParts.push(`filter overrides changed`);
      }
      const description = descParts.length > 0 ? `Bookmark "${name}" changed: ${descParts.join(", ")}` : `Bookmark "${name}" was modified`;
      changes.push(createChange({
        type: CHANGE_TYPES.BOOKMARK_CHANGED,
        scope: CHANGE_SCOPES.BOOKMARK,
        target: { bookmarkId: id, bookmarkName: name },
        description,
        details: { before: beforeSummary, after: afterSummary }
      }));
    }
  }
  return changes;
}
function summarizeBookmark(config) {
  if (!config) return {};
  const summary = {
    displayName: config.displayName || "",
    activeSection: config.explorationState?.activeSection || "",
    targetVisuals: config.options?.targetVisualNames || [],
    applyOnlyToTargets: config.options?.applyOnlyToTargetVisuals || false,
    filterOverrides: []
  };
  const filters = config.explorationState?.filters;
  if (filters) {
    if (filters.byName) {
      for (const [name, state] of Object.entries(filters.byName)) {
        summary.filterOverrides.push({ name, type: "byName", ...state });
      }
    }
    if (filters.byExpr) {
      for (const entry of Array.isArray(filters.byExpr) ? filters.byExpr : []) {
        summary.filterOverrides.push({ type: "byExpr", ...entry });
      }
    }
  }
  return summary;
}
function findAllBookmarkFiles(files) {
  const bookmarks = /* @__PURE__ */ new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.endsWith(".bookmark.json")) {
      const parts = path.replace(/\\/g, "/").split("/");
      const fileName = parts[parts.length - 1];
      const bookmarkId = fileName.replace(".bookmark.json", "");
      bookmarks.set(bookmarkId, { content, path });
    }
  }
  return bookmarks;
}
function parseJson2(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
var init_bookmarkDiff = __esm({
  "../core/src/diff/bookmarkDiff.js"() {
    init_changeTypes();
  }
});

// ../core/src/diff/impactResolver.js
function resolveImpact(measureName, tableName, graph2) {
  if (!graph2) return [];
  const impacts = [];
  const seen = /* @__PURE__ */ new Set();
  const measureNodeId = `measure::${tableName}.${measureName}`;
  const measureNode = graph2.nodes.get(measureNodeId);
  if (!measureNode) return impacts;
  const directVisuals = findDownstreamVisuals(measureNodeId, graph2);
  for (const visual of directVisuals) {
    const key = `direct:${visual.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      impacts.push({
        type: "direct",
        visualId: visual.id,
        visualName: visual.name || visual.id,
        pageId: visual.metadata?.pageId || "",
        pageName: resolvePageNameFromGraph(visual.metadata?.pageId, graph2),
        reason: `directly uses measure [${measureName}]`
      });
    }
  }
  const fpImpacts = resolveFieldParameterImpact(measureName, tableName, graph2);
  for (const impact of fpImpacts) {
    const key = `fp:${impact.visualId}`;
    if (!seen.has(key)) {
      seen.add(key);
      impacts.push(impact);
    }
  }
  const cgImpacts = resolveCalcGroupImpact(measureNodeId, graph2);
  for (const impact of cgImpacts) {
    const key = `cg:${impact.visualId}`;
    if (!seen.has(key)) {
      seen.add(key);
      impacts.push(impact);
    }
  }
  return impacts;
}
function findDownstreamVisuals(nodeId, graph2) {
  const visuals = [];
  const visited = /* @__PURE__ */ new Set();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    const downstream = graph2.adjacency.downstream.get(current) || [];
    for (const neighbor of downstream) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      const node = graph2.nodes.get(neighbor);
      if (node?.type === NODE_TYPES.VISUAL) {
        visuals.push(node);
      } else {
        queue.push(neighbor);
      }
    }
  }
  return visuals;
}
function resolveFieldParameterImpact(measureName, tableName, graph2) {
  const impacts = [];
  for (const node of graph2.nodes.values()) {
    if (node.metadata?.enrichmentType !== ENRICHMENT_TYPES.FIELD_PARAMETER) continue;
    const fpFields = node.metadata?.fieldParameter?.fields || [];
    const fpTableName = node.metadata?.table || node.name;
    const isReferenced = fpFields.some((field) => {
      if (field.reference) {
        const ref = field.reference;
        if (ref.includes(`'${tableName}'[${measureName}]`)) return true;
        if (ref === `[${measureName}]`) return true;
      }
      return field.name === measureName;
    });
    if (!isReferenced) continue;
    const fpTableNodeId = `table::${fpTableName}`;
    const fpVisuals = findDownstreamVisuals(fpTableNodeId, graph2);
    for (const visual of fpVisuals) {
      impacts.push({
        type: "field_parameter",
        visualId: visual.id,
        visualName: visual.name || visual.id,
        pageId: visual.metadata?.pageId || "",
        pageName: resolvePageNameFromGraph(visual.metadata?.pageId, graph2),
        reason: `uses field parameter "${fpTableName}" which references [${measureName}]`
      });
    }
  }
  return impacts;
}
function resolveCalcGroupImpact(measureNodeId, graph2) {
  const impacts = [];
  const directVisuals = findDownstreamVisuals(measureNodeId, graph2);
  for (const visual of directVisuals) {
    const upstream = graph2.adjacency.upstream.get(visual.id) || [];
    for (const upId of upstream) {
      const upNode = graph2.nodes.get(upId);
      if (upNode?.metadata?.enrichmentType === ENRICHMENT_TYPES.CALCULATION_GROUP) {
        impacts.push({
          type: "calculation_group",
          visualId: visual.id,
          visualName: visual.name || visual.id,
          pageId: visual.metadata?.pageId || "",
          pageName: resolvePageNameFromGraph(visual.metadata?.pageId, graph2),
          reason: `applies calculation group "${upNode.name || upNode.id}" to this measure`
        });
      }
    }
  }
  return impacts;
}
function resolvePageNameFromGraph(pageId, graph2) {
  if (!pageId) return "unknown";
  const pageNodeId = `page::${pageId}`;
  const pageNode = graph2.nodes.get(pageNodeId);
  return pageNode?.name || pageId;
}
var init_impactResolver = __esm({
  "../core/src/diff/impactResolver.js"() {
    init_constants();
  }
});

// ../core/src/diff/changeDetector.js
function detectChanges(beforeFiles, afterFiles, graph2 = null) {
  const allChanges = [];
  const beforeReport = filterReportFiles(beforeFiles);
  const afterReport = filterReportFiles(afterFiles);
  const beforeModel = filterModelFiles(beforeFiles);
  const afterModel = filterModelFiles(afterFiles);
  allChanges.push(...detectPageChanges(beforeReport, afterReport));
  allChanges.push(...detectReportFilterChanges(beforeReport, afterReport));
  allChanges.push(...detectVisualChanges(beforeReport, afterReport));
  allChanges.push(...detectBookmarkChanges(beforeReport, afterReport));
  allChanges.push(...detectMeasureChanges(beforeModel, afterModel));
  if (graph2) {
    for (const change of allChanges) {
      if (change.type === CHANGE_TYPES.MEASURE_CHANGED || change.type === CHANGE_TYPES.MEASURE_ADDED || change.type === CHANGE_TYPES.MEASURE_REMOVED) {
        const { measureName, tableName } = change.target;
        if (measureName && tableName) {
          change.impact = resolveImpact(measureName, tableName, graph2);
        }
      }
    }
  }
  const summary = buildSummary(allChanges);
  return { changes: allChanges, summary };
}
function buildSummary(changes) {
  const byType = {};
  const byScope = {};
  for (const change of changes) {
    byType[change.type] = (byType[change.type] || 0) + 1;
    byScope[change.scope] = (byScope[change.scope] || 0) + 1;
  }
  return {
    totalChanges: changes.length,
    byType,
    byScope
  };
}
function filterReportFiles(files) {
  const filtered = /* @__PURE__ */ new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.includes(".report/") || lower.includes("/definition/pages/") || lower.includes("/definition/bookmarks/") || lower.endsWith("/report.json") || lower.endsWith("/pages.json") || lower.endsWith("/page.json") || lower.endsWith("/visual.json") || lower.endsWith(".bookmark.json") || lower.endsWith(".pbir")) {
      filtered.set(path, content);
    }
  }
  if (filtered.size === 0) return files;
  return filtered;
}
function filterModelFiles(files) {
  const filtered = /* @__PURE__ */ new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (lower.includes(".semanticmodel/") || lower.endsWith(".tmdl")) {
      filtered.set(path, content);
    }
  }
  if (filtered.size === 0) return files;
  return filtered;
}
var init_changeDetector = __esm({
  "../core/src/diff/changeDetector.js"() {
    init_pageDiff();
    init_filterDiff();
    init_measureDiff();
    init_visualDiff();
    init_bookmarkDiff();
    init_impactResolver();
    init_changeTypes();
  }
});

// ../core/src/index.js
var src_exports = {};
__export(src_exports, {
  CHANGE_SCOPES: () => CHANGE_SCOPES,
  CHANGE_TYPES: () => CHANGE_TYPES,
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
  detectChanges: () => detectChanges,
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
  resolveImpact: () => resolveImpact,
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
    init_changeDetector();
    init_changeTypes();
    init_impactResolver();
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

// src/providers/changeTreeProvider.js
var require_changeTreeProvider = __commonJS({
  "src/providers/changeTreeProvider.js"(exports2, module2) {
    var vscode2 = require("vscode");
    var ChangeTreeProvider2 = class {
      constructor() {
        this._onDidChangeTreeData = new vscode2.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._scanResults = [];
        this._flatChanges = [];
      }
      /**
       * Update the tree with new scan results.
       * @param {Array} scanResults - From commitScanner.scanRecentChanges()
       */
      setResults(scanResults) {
        this._scanResults = scanResults || [];
        this._flatChanges = [];
        for (const result of this._scanResults) {
          for (const change of result.changes) {
            this._flatChanges.push({
              ...change,
              commitHash: result.toCommit.hash.substring(0, 7),
              commitMessage: result.toCommit.message,
              commitDate: result.toCommit.date
            });
          }
        }
        this._onDidChangeTreeData.fire();
      }
      /**
       * Get the change count for a specific page (for badge display).
       * @param {string} pageName
       * @returns {number}
       */
      getPageChangeCount(pageName) {
        return this._flatChanges.filter(
          (c) => (c.target?.pageName || c.target?.pageId) === pageName
        ).length;
      }
      /**
       * Get the change count for a specific measure.
       * @param {string} measureName
       * @returns {number}
       */
      getMeasureChangeCount(measureName) {
        return this._flatChanges.filter((c) => c.target?.measureName === measureName).length;
      }
      /**
       * Get total number of changes.
       * @returns {number}
       */
      getTotalChangeCount() {
        return this._flatChanges.length;
      }
      getTreeItem(element) {
        return element;
      }
      getChildren(element) {
        if (!element) {
          if (this._scanResults.length === 0) {
            return [this._createInfoItem("No changes detected in recent commits")];
          }
          return this._scanResults.map((result, index) => {
            const hash = result.toCommit.hash.substring(0, 7);
            const msg = result.toCommit.message || "No message";
            const count = result.changes.length;
            const item = new vscode2.TreeItem(
              `${hash} \u2014 ${msg}`,
              vscode2.TreeItemCollapsibleState.Expanded
            );
            item.description = `${count} change${count !== 1 ? "s" : ""}`;
            item.iconPath = new vscode2.ThemeIcon("git-commit");
            item.contextValue = "commit";
            item._resultIndex = index;
            return item;
          });
        }
        if (element._resultIndex !== void 0) {
          const result = this._scanResults[element._resultIndex];
          if (!result) return [];
          const groups = /* @__PURE__ */ new Map();
          for (const change of result.changes) {
            const scope = change.scope || "other";
            if (!groups.has(scope)) groups.set(scope, []);
            groups.get(scope).push(change);
          }
          const scopeIcons = {
            report: "file",
            page: "file-text",
            visual: "symbol-misc",
            measure: "symbol-method",
            bookmark: "bookmark"
          };
          const scopeLabels = {
            report: "Report",
            page: "Page",
            visual: "Visual",
            measure: "Measure",
            bookmark: "Bookmark"
          };
          return [...groups.entries()].map(([scope, changes]) => {
            const item = new vscode2.TreeItem(
              scopeLabels[scope] || scope,
              vscode2.TreeItemCollapsibleState.Expanded
            );
            item.description = `${changes.length}`;
            item.iconPath = new vscode2.ThemeIcon(scopeIcons[scope] || "circle-outline");
            item._resultIndex = element._resultIndex;
            item._scope = scope;
            return item;
          });
        }
        if (element._scope !== void 0 && element._resultIndex !== void 0) {
          const result = this._scanResults[element._resultIndex];
          if (!result) return [];
          const changes = result.changes.filter((c) => c.scope === element._scope);
          return changes.map((change) => this._createChangeItem(change));
        }
        if (element._change?.impact?.length > 0) {
          return element._change.impact.map((impact) => {
            const item = new vscode2.TreeItem(
              `${impact.visualName} (${impact.pageName})`,
              vscode2.TreeItemCollapsibleState.None
            );
            item.description = impact.reason;
            item.iconPath = new vscode2.ThemeIcon(
              impact.type === "field_parameter" ? "references" : impact.type === "calculation_group" ? "symbol-operator" : "arrow-right"
            );
            return item;
          });
        }
        return [];
      }
      _createChangeItem(change) {
        const hasImpact = change.impact && change.impact.length > 0;
        const item = new vscode2.TreeItem(
          change.description,
          hasImpact ? vscode2.TreeItemCollapsibleState.Collapsed : vscode2.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode2.ThemeIcon(this._getChangeIcon(change.type));
        item.tooltip = this._buildTooltip(change);
        item.contextValue = "change";
        item._change = change;
        if (hasImpact) {
          item.description = `${change.impact.length} visual${change.impact.length !== 1 ? "s" : ""} impacted`;
        }
        return item;
      }
      _getChangeIcon(type) {
        const icons = {
          default_page_changed: "home",
          page_added: "add",
          page_removed: "trash",
          filter_added: "filter",
          filter_removed: "close",
          filter_changed: "filter",
          measure_changed: "edit",
          measure_added: "add",
          measure_removed: "trash",
          visual_visibility_changed: "eye",
          visual_filter_added: "filter",
          visual_filter_removed: "close",
          visual_filter_changed: "filter",
          visual_bookmark_changed: "bookmark",
          visual_added: "add",
          visual_removed: "trash",
          visual_field_changed: "symbol-field",
          bookmark_changed: "bookmark",
          calc_item_changed: "symbol-operator",
          calc_item_added: "add",
          calc_item_removed: "trash"
        };
        return icons[type] || "circle-outline";
      }
      _buildTooltip(change) {
        const parts = [change.description];
        if (change.impact && change.impact.length > 0) {
          parts.push("");
          parts.push(`Impacted visuals (${change.impact.length}):`);
          for (const impact of change.impact) {
            parts.push(`  - ${impact.visualName} on ${impact.pageName}`);
            parts.push(`    ${impact.reason}`);
          }
        }
        if (change.details?.before !== void 0 && change.details?.after !== void 0) {
          parts.push("");
          if (typeof change.details.before === "object") {
            parts.push(`Before: ${JSON.stringify(change.details.before, null, 2).substring(0, 200)}`);
            parts.push(`After: ${JSON.stringify(change.details.after, null, 2).substring(0, 200)}`);
          } else {
            parts.push(`Before: ${String(change.details.before).substring(0, 200)}`);
            parts.push(`After: ${String(change.details.after).substring(0, 200)}`);
          }
        }
        return new vscode2.MarkdownString(parts.join("\n"));
      }
      _createInfoItem(message) {
        const item = new vscode2.TreeItem(message, vscode2.TreeItemCollapsibleState.None);
        item.iconPath = new vscode2.ThemeIcon("info");
        return item;
      }
    };
    module2.exports = { ChangeTreeProvider: ChangeTreeProvider2 };
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

// src/git/gitHistory.js
var require_gitHistory = __commonJS({
  "src/git/gitHistory.js"(exports2, module2) {
    var { execFile } = require("child_process");
    function runGit(cwd, args) {
      return new Promise((resolve, reject) => {
        execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`git ${args[0]} failed: ${stderr || err.message}`));
          } else {
            resolve(stdout);
          }
        });
      });
    }
    async function getRecentCommits(cwd, limit = 10, paths = []) {
      const args = ["log", `--max-count=${limit}`, "--format=%H|%s|%ai"];
      if (paths.length > 0) {
        args.push("--");
        args.push(...paths);
      }
      const output = await runGit(cwd, args);
      return output.trim().split("\n").filter(Boolean).map((line) => {
        const [hash, message, date] = line.split("|");
        return { hash, message, date };
      });
    }
    async function getChangedFiles(cwd, fromHash, toHash) {
      const output = await runGit(cwd, ["diff", "--name-only", fromHash, toHash]);
      return output.trim().split("\n").filter(Boolean);
    }
    async function getFileAtCommit(cwd, hash, filePath) {
      try {
        return await runGit(cwd, ["show", `${hash}:${filePath}`]);
      } catch {
        return null;
      }
    }
    async function buildFileMap(cwd, hash, filePaths) {
      const map = /* @__PURE__ */ new Map();
      const relevantExts = [".json", ".tmdl", ".pbir"];
      const relevantFiles = filePaths.filter((p) => {
        const lower = p.toLowerCase();
        if (lower.includes(".pbi/")) return false;
        if (lower.includes("cache.abf")) return false;
        return relevantExts.some((ext) => lower.endsWith(ext));
      });
      for (let i = 0; i < relevantFiles.length; i += 20) {
        const batch = relevantFiles.slice(i, i + 20);
        const results = await Promise.all(
          batch.map(async (filePath) => {
            const content = await getFileAtCommit(cwd, hash, filePath);
            return { filePath, content };
          })
        );
        for (const { filePath, content } of results) {
          if (content !== null) {
            map.set(filePath, content);
          }
        }
      }
      return map;
    }
    async function isGitRepo(cwd) {
      try {
        await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
        return true;
      } catch {
        return false;
      }
    }
    async function getRepoRoot(cwd) {
      const output = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
      return output.trim();
    }
    module2.exports = {
      getRecentCommits,
      getChangedFiles,
      getFileAtCommit,
      buildFileMap,
      isGitRepo,
      getRepoRoot
    };
  }
});

// src/git/commitScanner.js
var require_commitScanner = __commonJS({
  "src/git/commitScanner.js"(exports2, module2) {
    var { getRecentCommits, getChangedFiles, buildFileMap, isGitRepo, getRepoRoot } = require_gitHistory();
    var { detectChanges: detectChanges2 } = (init_src(), __toCommonJS(src_exports));
    async function scanRecentChanges2(workspacePath, graph2 = null, maxCommits = 10) {
      if (!await isGitRepo(workspacePath)) {
        return [];
      }
      const repoRoot = await getRepoRoot(workspacePath);
      const results = [];
      const commits = await getRecentCommits(repoRoot, maxCommits + 1, [
        "*.tmdl",
        "*.json",
        "*.pbir"
      ]);
      if (commits.length < 2) return results;
      for (let i = 0; i < commits.length - 1; i++) {
        const toCommit = commits[i];
        const fromCommit = commits[i + 1];
        try {
          const changedFiles = await getChangedFiles(repoRoot, fromCommit.hash, toCommit.hash);
          const relevantChanged = changedFiles.filter((p) => {
            const lower = p.toLowerCase();
            if (lower.includes(".pbi/")) return false;
            if (lower.includes("cache.abf")) return false;
            return lower.endsWith(".json") || lower.endsWith(".tmdl") || lower.endsWith(".pbir");
          });
          if (relevantChanged.length === 0) continue;
          const [beforeFiles, afterFiles] = await Promise.all([
            buildFileMap(repoRoot, fromCommit.hash, relevantChanged),
            buildFileMap(repoRoot, toCommit.hash, relevantChanged)
          ]);
          const { changes, summary } = detectChanges2(beforeFiles, afterFiles, graph2);
          if (changes.length > 0) {
            results.push({
              fromCommit,
              toCommit,
              changes,
              summary
            });
          }
        } catch (err) {
          console.warn(`Failed to scan commits ${fromCommit.hash}..${toCommit.hash}:`, err.message);
        }
      }
      return results;
    }
    async function getAllRecentChanges(workspacePath, graph2 = null, maxCommits = 10) {
      const scanResults = await scanRecentChanges2(workspacePath, graph2, maxCommits);
      const allChanges = [];
      for (const result of scanResults) {
        for (const change of result.changes) {
          allChanges.push({
            ...change,
            commitHash: result.toCommit.hash.substring(0, 7),
            commitMessage: result.toCommit.message,
            commitDate: result.toCommit.date
          });
        }
      }
      return allChanges;
    }
    function groupChangesByPage(changes) {
      const grouped = /* @__PURE__ */ new Map();
      for (const change of changes) {
        const pageName = change.target?.pageName || change.target?.pageId || "_report";
        if (!grouped.has(pageName)) grouped.set(pageName, []);
        grouped.get(pageName).push(change);
      }
      return grouped;
    }
    function groupChangesByScope(changes) {
      const grouped = /* @__PURE__ */ new Map();
      for (const change of changes) {
        const scope = change.scope || "other";
        if (!grouped.has(scope)) grouped.set(scope, []);
        grouped.get(scope).push(change);
      }
      return grouped;
    }
    module2.exports = {
      scanRecentChanges: scanRecentChanges2,
      getAllRecentChanges,
      groupChangesByPage,
      groupChangesByScope
    };
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
var { ChangeTreeProvider } = require_changeTreeProvider();
var { showLineagePanel } = require_lineagePanel();
var { scanRecentChanges } = require_commitScanner();
var graph = null;
var enrichments = null;
var orphanIds = /* @__PURE__ */ new Set();
var statusBarItem = null;
var measureTree = new MeasureTreeProvider();
var orphanTree = new OrphanTreeProvider();
var statsTree = new StatsTreeProvider();
var codeLensProvider = new TmdlCodeLensProvider();
var changeTree = new ChangeTreeProvider();
function activate(context) {
  console.log("PBIP Lineage Explorer activated");
  vscode.window.registerTreeDataProvider("pbipLineage.measures", measureTree);
  vscode.window.registerTreeDataProvider("pbipLineage.orphans", orphanTree);
  vscode.window.registerTreeDataProvider("pbipLineage.stats", statsTree);
  vscode.window.registerTreeDataProvider("pbipLineage.changes", changeTree);
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
    vscode.commands.registerCommand("pbipLineage.refresh", handleRefresh),
    vscode.commands.registerCommand("pbipLineage.scanChanges", handleScanChanges)
  );
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.tmdl");
  watcher.onDidChange(() => loadProject());
  watcher.onDidCreate(() => loadProject());
  watcher.onDidDelete(() => loadProject());
  context.subscriptions.push(watcher);
  const gitWatcher = vscode.workspace.createFileSystemWatcher("**/.git/HEAD");
  gitWatcher.onDidChange(() => scanChangesQuiet());
  context.subscriptions.push(gitWatcher);
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
    scanChangesQuiet();
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
async function handleScanChanges() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage("No workspace folder open.");
    return;
  }
  const folder = workspaceFolders[0].uri.fsPath;
  try {
    const results = await scanRecentChanges(folder, graph, 10);
    changeTree.setResults(results);
    const totalChanges = changeTree.getTotalChangeCount();
    if (totalChanges > 0) {
      vscode.window.showInformationMessage(
        `Found ${totalChanges} change${totalChanges !== 1 ? "s" : ""} in recent commits.`
      );
      vscode.commands.executeCommand("pbipLineage.changes.focus");
    } else {
      vscode.window.showInformationMessage("No changes detected in recent commits.");
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Change scan failed: ${err.message}`);
  }
}
async function scanChangesQuiet() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return;
  try {
    const folder = workspaceFolders[0].uri.fsPath;
    const results = await scanRecentChanges(folder, graph, 10);
    changeTree.setResults(results);
  } catch {
  }
}
function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
}
module.exports = { activate, deactivate };
//# sourceMappingURL=extension.js.map
