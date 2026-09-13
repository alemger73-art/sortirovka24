#!/usr/bin/env node
/**
 * Run: node scripts/check-i18n.mjs [--self-test]
 * Read-only: interprets the dictionary AST, never imports/executes application code.
 * Requires the frontend's existing TypeScript devDependency. No network access.
 * Main dictionaries are followed through imports/spreads/Object.assign from the
 * default export of src/i18n/translations.ts; unconnected dictionaries do not
 * satisfy lookups. Unsupported dictionary expressions fail explicitly.
 * Translator identity comes from LanguageContextType.t, with alias, function
 * argument and JSX prop propagation. A callback merely named t/st is not i18n.
 * Store translations are a separate local ru-source -> kz object, inspected by
 * AST only. Neither the store hook nor its runtime dependencies are executed.
 * Unresolved dynamic keys are counted, not claimed to be fully validated.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Exact keys AND languages only. This optional hero fragment is intentionally empty.
const ALLOWED_EMPTY = new Map([
  ['hero.foodDeliveryTitleRest', new Set(['ru', 'kz'])],
]);
const LANGUAGES = ['ru', 'kz'];
// Named and positional parameters, including {0}; preserve multiplicity.
const parameters = text => [...text.matchAll(/\{([A-Za-z0-9_][A-Za-z0-9_.-]*)\}/g)].map(m => m[1]).sort();
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = (file) => path.resolve(file).replaceAll('\\', '/');

function audit(program, root, report = () => {}) {
  report("Binding TypeScript symbols");
  const checker = program.getTypeChecker();
  const errors = new Set();
  const src = canonical(path.join(root, 'src')) + '/';
  const files = program.getSourceFiles().filter(f => !f.isDeclarationFile && canonical(f.fileName).startsWith(src));
  const locate = node => {
    const f = node.getSourceFile();
    const p = f.getLineAndCharacterOfPosition(node.getStart(f));
    return `${path.relative(root, f.fileName).replaceAll('\\', '/')}:${p.line + 1}:${p.character + 1}`;
  };
  const fail = (node, message) => errors.add(`${locate(node)} ${message}`);
  const visit = (node, fn) => { fn(node); ts.forEachChild(node, child => visit(child, fn)); };
  // Cache negative lookups too: most project expressions are not translators.
  const aliasCache = new Map(), symbolCache = new WeakMap(), typeCache = new WeakMap();
  const unalias = symbol => {
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Alias)) return symbol;
    if (!aliasCache.has(symbol)) aliasCache.set(symbol, checker.getAliasedSymbol(symbol));
    return aliasCache.get(symbol);
  };
  const symbolOf = node => {
    if (!symbolCache.has(node)) symbolCache.set(node, unalias(checker.getSymbolAtLocation(node)));
    return symbolCache.get(node);
  };
  const typeOf = node => {
    if (!typeCache.has(node)) typeCache.set(node, checker.getTypeAtLocation(node));
    return typeCache.get(node);
  };
  const unwrap = node => {
    while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
    return node;
  };
  const cache = new Map(), evaluationErrors = new Map(), evaluating = new Set(), dictionarySources = new Set();
  let checkingDictionaries = true;
  function evaluate(node) {
    node = unwrap(node);
    if (!node) throw Error('Missing expression');
    if (checkingDictionaries) dictionarySources.add(node.getSourceFile());
    if (cache.has(node)) return cache.get(node);
    if (evaluationErrors.has(node)) throw evaluationErrors.get(node);
    if (evaluating.has(node)) throw Error(`Cyclic dictionary expression at ${locate(node)}`);
    evaluating.add(node);
    try {
      const result = evaluateInner(node);
      cache.set(node, result);
      return result;
    } catch (error) {
      evaluationErrors.set(node, error);
      throw error;
    } finally { evaluating.delete(node); }
  }
  function add(target, key, entry) {
    if (checkingDictionaries && target.has(key)) fail(entry.node, `Duplicate property ${JSON.stringify(key)}; first defined at ${locate(target.get(key).node)}`);
    target.set(key, entry);
  }
  function merge(target, object, node) {
    if (!(object instanceof Map)) throw Error(`Expected a dictionary object at ${locate(node)}`);
    for (const [key, entry] of object) add(target, key, entry);
  }
  function evaluateInner(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isObjectLiteralExpression(node)) {
      const result = new Map();
      for (const p of node.properties) {
        if (ts.isSpreadAssignment(p)) { merge(result, evaluate(p.expression), p); continue; }
        if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) throw Error(`Unsupported dictionary member at ${locate(p)}`);
        const key = ts.isComputedPropertyName(p.name) ? evaluate(p.name.expression) : p.name.text;
        if (typeof key !== 'string' && typeof key !== 'number') throw Error(`Non-static property name at ${locate(p)}`);
        const value = ts.isShorthandPropertyAssignment(p)
          ? evaluateDeclaration(checker.getShorthandAssignmentValueSymbol(p), p)
          : evaluate(p.initializer);
        add(result, String(key), { value, node: p });
      }
      return result;
    }
    if (ts.isIdentifier(node)) return evaluateDeclaration(symbolOf(node), node);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      // Resolve namespace imports and re-exports before ordinary object fields.
      const symbol = symbolOf(ts.isPropertyAccessExpression(node) ? node.name : node);
      if (symbol?.declarations?.some(d => ts.isVariableDeclaration(d) || ts.isExportAssignment(d))) return evaluateDeclaration(symbol, node);
      const object = evaluate(node.expression);
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : evaluate(node.argumentExpression);
      if (object instanceof Map && object.has(String(key))) return object.get(String(key)).value;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = evaluate(node.left), right = evaluate(node.right);
      if (['string', 'number'].includes(typeof left) && ['string', 'number'].includes(typeof right)) return left + right;
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = evaluate(span.expression);
        if (!['string', 'number'].includes(typeof part)) throw Error(`Non-static template at ${locate(span)}`);
        value += part + span.literal.text;
      }
      return value;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText() === 'Object' && node.expression.name.text === 'assign') {
      const result = new Map();
      for (const arg of node.arguments) merge(result, evaluate(arg), arg);
      return result;
    }
    throw Error(`Unsupported/non-static expression at ${locate(node)}: ${node.getText().slice(0, 100)}`);
  }
  function evaluateDeclaration(symbol, node) {
    symbol = unalias(symbol);
    for (const d of symbol?.declarations || []) {
      if (ts.isVariableDeclaration(d) && d.initializer) {
        if (!(d.parent.flags & ts.NodeFlags.Const)) throw Error(`Dictionary references a mutable binding at ${locate(d)}`);
        return evaluate(d.initializer);
      }
      if (ts.isExportAssignment(d)) return evaluate(d.expression);
    }
    throw Error(`Cannot resolve static binding at ${locate(node)}: ${node.getText()}`);
  }

  for (const d of program.getSyntacticDiagnostics().filter(d => d.file && files.includes(d.file))) {
    const p = d.file.getLineAndCharacterOfPosition(d.start || 0);
    errors.add(`${path.relative(root, d.file.fileName)}:${p.line + 1}:${p.character + 1} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  }
  const dictionaryFile = files.find(f => canonical(f.fileName) === canonical(path.join(root, 'src/i18n/translations.ts')));
  let dictionary;
  if (!dictionaryFile) errors.add('Missing src/i18n/translations.ts');
  else {
    try {
      const exported = checker.getExportsOfModule(checker.getSymbolAtLocation(dictionaryFile)).find(s => s.name === 'default');
      dictionary = evaluateDeclaration(exported, dictionaryFile);
      if (!(dictionary instanceof Map)) throw Error('The default translations export must be an object');
      if (!dictionary.size) errors.add('The final translations dictionary is empty');
    } catch (error) { errors.add(`Dictionary: ${error.message}`); }
  }
  // This module exports a hook, not the dictionary. Evaluate ONLY its local const.
  // Imports such as foodCheckoutGuards/useLanguage are never executed or merged.
  const storeFile = files.find(f => canonical(f.fileName) === canonical(path.join(root, 'src/i18n/storeTranslations.ts')));
  let storeDictionary;
  if (!storeFile) errors.add('Missing src/i18n/storeTranslations.ts');
  else {
    const declarations = storeFile.statements.filter(ts.isVariableStatement)
      .flatMap(statement => [...statement.declarationList.declarations])
      .filter(d => ts.isIdentifier(d.name) && d.name.text === 'storeTranslations');
    if (declarations.length !== 1) fail(storeFile, 'Expected exactly one local storeTranslations declaration');
    else {
      try {
        storeDictionary = evaluateDeclaration(symbolOf(declarations[0].name), declarations[0]);
        if (!(storeDictionary instanceof Map)) throw Error('storeTranslations must be a ru-source -> kz object');
        if (!storeDictionary.size) fail(declarations[0], 'storeTranslations is empty');
        for (const [ru, {value: kz, node}] of storeDictionary) {
          if (!ru.trim()) fail(node, 'storeTranslations: empty Russian source key');
          if (typeof kz !== 'string' || !kz.trim()) fail(node, 'storeTranslations: empty/non-string Kazakh value for ' + JSON.stringify(ru));
          if (typeof kz === 'string' && JSON.stringify(parameters(ru)) !== JSON.stringify(parameters(kz))) {
            fail(node, 'storeTranslations: placeholder mismatch for ' + JSON.stringify(ru) + ' ru=' + JSON.stringify(parameters(ru)) + ' kz=' + JSON.stringify(parameters(kz)));
          }
        }
      } catch (error) { errors.add('Store dictionary: ' + error.message); }
    }
  }
  // A declarative AST evaluator must not silently ignore imperative mutations.
  // Only dictionary dependency modules are inspected here, before UI evaluation.
  for (const source of dictionarySources) {
    for (const statement of source.statements) {
      if (ts.isExpressionStatement(statement) && !ts.isStringLiteral(statement.expression)) {
        fail(statement, 'Unsupported top-level dictionary side effect; compose the default export with object spreads or an Object.assign(...) initializer/expression');
      }
    }
  }
  if (dictionary instanceof Map) {
    for (const [key, {value: entry, node}] of dictionary) {
      if (!(entry instanceof Map)) { fail(node, `${key}: expected { ru, kz } object`); continue; }
      for (const lang of LANGUAGES) {
        const value = entry.get(lang)?.value;
        if (typeof value !== 'string') fail(node, `${key}.${lang}: missing language or non-string value`);
        else if (!value.trim() && !(value === '' && ALLOWED_EMPTY.get(key)?.has(lang))) fail(node, `${key}.${lang}: empty translation (not explicitly allowed)`);
      }
      const ru = entry.get('ru')?.value, kz = entry.get('kz')?.value;
      // Compare multisets: losing a repeated placeholder is also an error.
      if (typeof ru === 'string' && typeof kz === 'string' && JSON.stringify(parameters(ru)) !== JSON.stringify(parameters(kz))) {
        fail(node, `${key}: placeholder mismatch ru=${JSON.stringify(parameters(ru))} kz=${JSON.stringify(parameters(kz))}`);
      }
    }
  }

  report("Main/store dictionary validation complete; indexing translation references");
  checkingDictionaries = false;
  const translators = new Set();
  const contextFile = files.find(f => canonical(f.fileName) === canonical(path.join(root, 'src/contexts/LanguageContext.tsx')));
  if (contextFile) visit(contextFile, n => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === 'LanguageContextType') {
      const member = checker.getTypeAtLocation(n).getProperty('t');
      if (member) translators.add(member);
    }
  });
  if (!translators.size) errors.add('Cannot identify LanguageContextType.t; update translator provenance detection');
  const storeHooks = new Set(), storeSymbols = new Set(), storeSignatures = new Set();
  // Match export symbols in the known store modules, not arbitrary functions
  // named useStoreLanguage. Import aliases and re-exports resolve to these symbols.
  const hookFiles = files.filter(f => f === storeFile || ['src/hooks/useStoreLanguage.ts', 'src/hooks/useStoreLanguage.tsx'].some(name => canonical(f.fileName) === canonical(path.join(root, name))));
  for (const source of hookFiles) {
    const module = checker.getSymbolAtLocation(source);
    for (const exported of module ? checker.getExportsOfModule(module) : []) {
      if (!['useStoreTranslations', 'useStoreLanguage'].includes(exported.name)) continue;
      const hook = unalias(exported);
      storeHooks.add(hook);
      const type = checker.getTypeOfSymbolAtLocation(hook, source);
      for (const signature of type.getCallSignatures()) {
        const returned = checker.getReturnTypeOfSignature(signature);
        for (const call of returned.getCallSignatures()) if (call.declaration) storeSignatures.add(call.declaration);
        const st = returned.getProperty('st');
        if (st) storeSymbols.add(unalias(st));
      }
    }
  }
  if (storeFile && !storeHooks.size) fail(storeFile, 'Cannot identify useStoreTranslations/useStoreLanguage export');

  // Build expression/symbol dependencies once, then propagate two provenance bits.
  // An edge is processed at most twice (main=1, store=2), irrespective of alias
  // chain length. Lazy argument/prop edges resolve signatures only AFTER their
  // source is proven to be a translator. No fixed-point scans of the project.
  const MAIN = 1, STORE = 2;
  const vertices = new Map(), expansion = [], signals = [];
  const graphStats = { astPasses: 1, vertices: 0, edges: 0, signalBits: 0, signatureResolutions: 0, jsxResolutions: 0 };
  const signatureCache = new WeakMap(), jsxPropsCache = new WeakMap();
  function mark(vertex, mask) {
    if (!vertex) return;
    const added = mask & ~vertex.mask;
    if (!added) return;
    vertex.mask |= added;
    signals.push([vertex, added]);
    graphStats.signalBits += (added & MAIN ? 1 : 0) + (added & STORE ? 1 : 0);
  }
  function vertex(key, kind) {
    if (!key) return null;
    if (!vertices.has(key)) {
      const entry = { key, kind, mask: 0, edges: new Set(), listeners: [] };
      vertices.set(key, entry);
      expansion.push(entry);
      if (kind === 'symbol') {
        if (translators.has(key)) mark(entry, MAIN);
        if (storeSymbols.has(key)) mark(entry, STORE);
      }
    }
    return vertices.get(key);
  }
  const expressionVertex = node => vertex(unwrap(node), 'expression');
  const symbolVertex = symbol => vertex(unalias(symbol), 'symbol');
  function connect(from, to) {
    if (!from || !to || from === to || from.edges.has(to)) return;
    from.edges.add(to);
    graphStats.edges++;
    mark(to, from.mask);
  }
  function watch(source, listener) {
    if (!source) return;
    source.listeners.push(listener);
    if (source.mask) listener();
  }
  function expand(entry) {
    const node = entry.key;
    if (entry.kind === 'expression') {
      if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        connect(symbolVertex(symbolOf(ts.isPropertyAccessExpression(node) ? node.name : node)), entry);
      } else if (ts.isCallExpression(node) && storeHooks.has(symbolOf(node.expression))) {
        // Type inspection is limited to known hooks, not every expression/arg.
        if (typeOf(node).getCallSignatures().length) mark(entry, STORE);
      } else if (ts.isConditionalExpression(node)) {
        connect(expressionVertex(node.whenTrue), entry);
        connect(expressionVertex(node.whenFalse), entry);
      } else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
        connect(expressionVertex(node.left), entry);
        connect(expressionVertex(node.right), entry);
      }
      return;
    }
    for (const d of node.declarations || []) {
      if (ts.isVariableDeclaration(d) && d.initializer) connect(expressionVertex(d.initializer), entry);
      else if (ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent)) {
        const property = (d.propertyName || d.name).getText().replace(/^['"]|['"]$/g, '');
        const owner = d.parent.parent;
        connect(symbolVertex(typeOf(owner.initializer || d.parent).getProperty(property)), entry);
      } else if (ts.isPropertyAssignment(d)) connect(expressionVertex(d.initializer), entry);
      else if (ts.isShorthandPropertyAssignment(d)) connect(symbolVertex(checker.getShorthandAssignmentValueSymbol(d)), entry);
      // Explicit ReturnType<typeof storeHook> parameters can be checked even in
      // helpers without a call site. Never inspect all arbitrary expression types.
      if ((ts.isParameter(d) || ts.isPropertySignature(d)) && d.type && !ts.isFunctionTypeNode(d.type) && storeSignatures.size) {
        if (typeOf(d).getCallSignatures().some(sig => storeSignatures.has(sig.declaration))) mark(entry, STORE);
      }
    }
  }
  function resolvedSignature(call) {
    if (!signatureCache.has(call)) {
      signatureCache.set(call, checker.getResolvedSignature(call));
      graphStats.signatureResolutions++;
    }
    return signatureCache.get(call);
  }
  function jsxProperty(element, name) {
    if (!jsxPropsCache.has(element)) {
      const signature = typeOf(element.tagName).getCallSignatures()[0];
      jsxPropsCache.set(element, signature?.parameters[0] ? checker.getTypeOfSymbolAtLocation(signature.parameters[0], element) : undefined);
      graphStats.jsxResolutions++;
    }
    return jsxPropsCache.get(element)?.getProperty(name);
  }
  const candidate = node => {
    node = unwrap(node);
    return node && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
      || ts.isCallExpression(node) || ts.isConditionalExpression(node) || ts.isBinaryExpression(node));
  };
  const calls = [];
  for (const file of files) visit(file, node => {
    if (ts.isCallExpression(node)) {
      calls.push({ node, callee: expressionVertex(node.expression) });
      node.arguments.forEach((arg, i) => {
        if (!candidate(arg)) return;
        const source = expressionVertex(arg);
        let linked = false;
        watch(source, () => {
          if (linked) return;
          linked = true;
          const parameter = resolvedSignature(node)?.parameters[i];
          connect(source, symbolVertex(parameter));
          // Generic instantiations can expose a transient parameter symbol.
          for (const declaration of parameter?.declarations || []) {
            if (declaration.name && ts.isIdentifier(declaration.name)) connect(source, symbolVertex(symbolOf(declaration.name)));
          }
        });
      });
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || !attr.initializer || !ts.isJsxExpression(attr.initializer) || !candidate(attr.initializer.expression)) continue;
        const source = expressionVertex(attr.initializer.expression);
        let linked = false;
        watch(source, () => {
          if (linked) return;
          linked = true;
          connect(source, symbolVertex(jsxProperty(node, attr.name.getText())));
        });
      }
    }
  });
  report('Indexed ' + calls.length + ' calls in one AST pass; resolving the memoized provenance graph');
  let expanded = 0, processed = 0, lastReport = performance.now();
  while (expanded < expansion.length || processed < signals.length) {
    if (expanded < expansion.length) expand(expansion[expanded++]);
    else {
      const [source, mask] = signals[processed++];
      for (const target of source.edges) mark(target, mask);
      for (const listener of source.listeners) listener();
    }
    if (performance.now() - lastReport >= 2000) {
      report('Provenance graph: ' + expanded + ' nodes expanded; ' + processed + ' changes processed; ' + graphStats.signatureResolutions + ' relevant call signatures resolved');
      lastReport = performance.now();
    }
  }
  graphStats.vertices = vertices.size;
  report('Provenance complete: ' + graphStats.vertices + ' nodes, ' + graphStats.edges + ' edges, ' + graphStats.signatureResolutions + ' relevant signatures; checking keys');
  const emptyCounts = () => ({ translatorCalls: 0, staticCalls: 0, dynamicCalls: 0, used: new Set() });
  const mainCounts = emptyCounts(), storeCounts = emptyCounts();
  const keyCache = new WeakMap();
  function staticKeys(arg) {
    if (keyCache.has(arg)) return keyCache.get(arg);
    let keys;
    try { const key = evaluate(arg); if (typeof key === 'string') keys = [key]; } catch { /* Try finite literal type below. */ }
    if (!keys) {
      const type = typeOf(arg);
      const types = type.isUnion() ? type.types : [type];
      if (types.length && types.every(t => t.isStringLiteral())) keys = types.map(t => t.value);
    }
    keyCache.set(arg, keys);
    return keys;
  }
  for (const {node: call, callee} of calls) {
    if (!callee?.mask) continue;
    for (const [mask, counts, target, label] of [[MAIN, mainCounts, dictionary, 'translation'], [STORE, storeCounts, storeDictionary, 'store translation']]) {
      if (!(callee.mask & mask)) continue;
      counts.translatorCalls++;
      const arg = call.arguments[0];
      if (!arg) { fail(call, 'Translation call without a key'); continue; }
      const keys = staticKeys(arg);
      if (!keys) { counts.dynamicCalls++; continue; }
      counts.staticCalls++;
      for (const key of keys) {
        counts.used.add(key);
        if (target instanceof Map && !target.has(key)) fail(call, 'Missing ' + label + ' key ' + JSON.stringify(key) + ' in ' + (mask === STORE ? 'local storeTranslations' : 'the final dictionary'));
      }
    }
  }
  const summarize = ({used, ...counts}) => ({...counts, usedKeys: used.size});
  return { errors: [...errors].sort(), files: files.length, keys: dictionary instanceof Map ? dictionary.size : 0, ...summarize(mainCounts), store: { keys: storeDictionary instanceof Map ? storeDictionary.size : 0, ...summarize(storeCounts) }, graph: graphStats };

}

function loadProgram(root, report = () => {}) {
  report("Reading tsconfig.app.json");
  const configFile = path.join(root, 'tsconfig.app.json');
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw Error(parsed.errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  report("Parsing " + parsed.fileNames.length + " project files and their dependencies");
  return ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true, incremental: false } });
}

function selfTest() {
  // In-memory fixtures: do not touch application sources or create fixture files.
  const root = path.resolve(frontend, '__i18n_virtual_test__');
  const context = 'export interface LanguageContextType { t: (key: string) => string }; export declare function useLanguage(): LanguageContextType;';
  const run = (dictionary, ui = '', extra = {}) => {
    const sources = new Map(Object.entries({
      'src/i18n/translations.ts': dictionary,
      'src/contexts/LanguageContext.tsx': context,
      'src/i18n/storeTranslations.ts': `const storeTranslations = {'Сумма {0}': 'Сома {0}'}; export declare function useStoreTranslations(): (source: string, values?: unknown[]) => string;`,
      'src/Test.tsx': `import { useLanguage } from './contexts/LanguageContext';\n${ui}`,
      ...extra,
    }).map(([file, text]) => [canonical(path.join(root, file)), text]));
    const options = { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve, noLib: true, noEmit: true };
    const host = ts.createCompilerHost(options);
    host.fileExists = file => sources.has(canonical(file));
    host.readFile = file => sources.get(canonical(file));
    host.directoryExists = dir => [...sources.keys()].some(f => f.startsWith(canonical(dir) + '/'));
    host.getSourceFile = (file, version) => sources.has(canonical(file)) ? ts.createSourceFile(file, sources.get(canonical(file)), version, true) : undefined;
    host.realpath = file => file;
    return audit(ts.createProgram({rootNames: [...sources.keys()], options, host}), root);
  };
  const good = `export default { ok: {ru: 'Да {count}', kz: 'Иә {count}'}, 'hero.foodDeliveryTitleRest': {ru: '', kz: ''} };`;
  let result = run(good, `
    const {t: translate} = useLanguage(); const alias = translate; alias('ok');
    const language = useLanguage(); language.t('ok');
    function callback(t: (s: string) => string) { t('not.a.translation'); }
    function nested() { const t = (s: string) => s; t('also.not.i18n'); }
    const unrelated = {t: (s: string) => s}; unrelated.t('not.i18n.either');
    function helper(t: (s: string) => string) { t('ok'); }
    helper(translate);
    interface Props { t: (s: string) => string }
    function Card({t}: Props) { t('ok'); return null; }
    const card = <Card t={translate} />;
  `);
  assert.deepEqual(result.errors, []); assert.equal(result.translatorCalls, 4);
  result = run(good, `const {t} = useLanguage(); t('missing');`);
  assert(result.errors.some(e => e.includes('Missing translation key "missing"')));
  result = run(`export default { x:{ru:'a',kz:'b'}, x:{ru:'c',kz:'d'}, y:{ru:'a',ru:'b',kz:'c'} };`);
  assert.equal(result.errors.filter(e => e.includes('Duplicate property')).length, 2);
  result = run(`import {publicTranslations as publicDict} from './publicTranslations'; import admin from './adminTranslations'; const all = {...publicDict, ...admin}; export default all;`, `const {t} = useLanguage(); t('public.ok'); t('admin.ok');`, {
    'src/i18n/publicTranslations.ts': `export const publicTranslations = {'public.ok':{ru:'Да',kz:'Иә'}};`,
    'src/i18n/adminTranslations.ts': `export default {'admin.ok':{ru:'Да',kz:'Иә'}};`,
  });
  assert.deepEqual(result.errors, []); assert.equal(result.keys, 2);
  result = run(`import extra from './publicTranslations'; export default Object.assign({}, extra, {ok:{ru:'a',kz:'b'}});`, '', {
    'src/i18n/publicTranslations.ts': `export default {ok:{ru:'c',kz:'d'}};`,
  });
  assert(result.errors.some(e => e.includes('Duplicate property "ok"')));
  result = run(`import extra from './publicTranslations'; export default {...extra, ok:{ru:'a',kz:'b'}};`, '', {
    'src/i18n/publicTranslations.ts': `export default {ok:{ru:'c',kz:'d'}};`,
  });
  assert(result.errors.some(e => e.includes('Duplicate property "ok"')));
  result = run(`const dictionary={ok:{ru:'a',kz:'b'}}; Object.assign(dictionary, {more:{ru:'c',kz:'d'}}); export default dictionary;`);
  assert(result.errors.some(e => e.includes('Unsupported top-level dictionary side effect')));
  result = run(good, `const {t} = useLanguage(); t('pending');`, {'src/i18n/publicTranslations.ts': `export default {pending:{ru:'a',kz:'b'}};`});
  assert(result.errors.some(e => e.includes('Missing translation key "pending"')));
  result = run(`export default {a:{ru:'',kz:' '},b:{ru:'a'},c:{ru:'{count} {count}',kz:'{count}'},d:{ru:'a',kz:42}};`);
  assert.equal(result.errors.length, 5);
  result = run(`export default buildTranslations();`);
  assert(result.errors.some(e => e.includes('Unsupported/non-static')));
  result = run(good, `const {t} = useLanguage(); declare const key: string; t(key);`);
  assert.equal(result.dynamicCalls, 1); assert.deepEqual(result.errors, []);
  result = run(good, `
    import {useStoreTranslations as useShop} from './i18n/storeTranslations';
    const st = useShop(); const alias = st; st('Сумма {0}', [1]); alias('Сумма {0}', [2]);
    function helper(st: (s: string) => string) { st('Сумма {0}'); } helper(st);
    interface Props { stprops: (s: string) => string }
    function Legacy({stprops: local}: Props) { local('Сумма {0}'); return null; }
    const legacy = <Legacy stprops={st} />;
    function Other(props: Props) { props.stprops('Сумма {0}'); return null; }
    const other = <Other stprops={st} />;
    function callback(st: (s: string) => string) { st('not a store translation'); }
    const unrelated = {st: (s: string) => s}; unrelated.st('not store either');
    const {t} = useLanguage(); t('ok');
  `);
  assert.deepEqual(result.errors, []); assert.equal(result.store.translatorCalls, 5); assert.equal(result.translatorCalls, 1);
  result = run(good, `import {useStoreTranslations} from './i18n/storeTranslations'; const st = useStoreTranslations(); st('Нет перевода');`);
  assert(result.errors.some(e => e.includes('Missing store translation key "Нет перевода"')));
  result = run(good, '', {'src/i18n/storeTranslations.ts': `
    const storeTranslations = {'':'Бос', 'Пусто':' ', 'Тип':42, 'Цена {0}':'Баға {1}', 'Повтор {0} {0}':'Қайталау {0}', 'Ключ':'Бір', 'Ключ':'Екі'};
    export declare function useStoreTranslations(): (source: string) => string;
  `});
  assert.equal(result.errors.length, 6);
  result = run(good, `
    import {useStoreLanguage} from './i18n/storeTranslations';
    const {st: translate} = useStoreLanguage(); translate('Цена {0}', [1]);
  `, {'src/i18n/storeTranslations.ts': `
    import {useLanguage} from '../contexts/LanguageContext';
    const storeTranslations = {'Цена {0}':'Баға {0}'};
    export declare function useStoreLanguage(): {st: (source: string, values?: unknown[]) => string};
    function mustNeverRun() { throw new Error('Runtime code must not execute'); }
  `});
  assert.deepEqual(result.errors, []); assert.equal(result.store.staticCalls, 1);
  result = run(good, '', {'src/i18n/storeTranslations.ts': `const storeTranslations={}; export declare function useStoreTranslations(): (source: string) => string;`});
  assert(result.errors.some(e => e.includes('storeTranslations is empty')));
  // Regression: a long reverse-ordered alias chain must use a work queue, not
  // recursion or repeated scans. The graph's signal budget is linear in vertices.
  const chainLength = 1200;
  const chain = Array.from({length: chainLength}, (_, i) => 'const alias' + (chainLength-i) + ' = alias' + (chainLength-i-1) + ';').join('\n');
  const bulkKeys = Array.from({length: 3000}, (_, i) => '"bulk.' + i + '":{ru:"Да",kz:"Иә"}').join(',');
  result = run('export default {' + bulkKeys + '};', chain + '\nconst {t:alias0} = useLanguage(); alias' + chainLength + '("bulk.2999");');
  assert.deepEqual(result.errors, []); assert.equal(result.staticCalls, 1);
  assert.equal(result.graph.astPasses, 1);
  assert(result.graph.signalBits <= result.graph.vertices * 2);
  assert.equal(result.graph.signatureResolutions, 0);
  // Alias cycles without a translator seed must terminate and remain unrelated.
  result = run(good, 'const a = b; const b = a; a("not.i18n");');
  assert.deepEqual(result.errors, []); assert.equal(result.translatorCalls, 0);
  console.log('PASS: self-test (main/store dictionaries, placeholders, missing keys, aliases/cycles, unrelated callbacks, legacy props, 3000-key dictionary and 1200-link linear provenance graph).');
}

try {
  if (process.argv.slice(2).some(arg => arg !== '--self-test')) throw Error('Usage: node scripts/check-i18n.mjs [--self-test]');
  if (process.argv.includes('--self-test')) selfTest();
  else {
    const started = performance.now();
    const report = message => console.log('[i18n +' + ((performance.now() - started) / 1000).toFixed(1) + 's] ' + message);
    report('Starting read-only main/store audit');
    const result = audit(loadProgram(frontend, report), frontend, report);
    report('Audit finished');
    console.log(`i18n: ${result.files} source files; ${result.keys} final keys; ${result.translatorCalls} translator calls (${result.staticCalls} statically resolved, ${result.dynamicCalls} dynamic/unresolved); ${result.usedKeys} referenced keys.`);
    console.log(`store i18n: ${result.store.keys} local ru-source -> kz entries; ${result.store.translatorCalls} translator calls (${result.store.staticCalls} statically resolved, ${result.store.dynamicCalls} dynamic/unresolved); ${result.store.usedKeys} referenced source strings.`);
    if (result.dynamicCalls || result.store.dynamicCalls) console.log('NOTE: unresolved dynamic keys require runtime/domain review; they are not included in static coverage.');
    if (result.errors.length) {
      for (const error of result.errors) console.error(error);
      console.error(`FAIL: ${result.errors.length} i18n error(s).`);
      process.exitCode = 1;
    } else console.log('PASS: main/store dictionary structure, duplicate keys, ru/kz values, allowed empties, placeholders and static i18n calls.');
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
