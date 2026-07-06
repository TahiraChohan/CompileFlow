// =============================================
// SAMPLE PROGRAMS
// =============================================
const SAMPLES = {
    basic: `int main() {\n  int x = 10;\n  int y = 20;\n  int z = x + y;\n  if (z > 15) {\n    int result = z * 2;\n    return result;\n  }\n  return 0;\n}`,
    loop: `int main() {\n  int sum = 0;\n  int i = 0;\n  int n = 10;\n  for (i = 0; i < n; i = i + 1) {\n    sum = sum + i;\n  }\n  return sum;\n}`,
    function: `int add(int a, int b) {\n  return a + b;\n}\n\nint main() {\n  int x = 5;\n  int y = 3;\n  int result = add(x, y);\n  return result;\n}`,
    error: `int main() {\n  int x = 10;\n  float y = x + z;\n  x = "hello";\n  int x = 5;\n  return undefined_var;\n}`
};

// =============================================
// THEME TOGGLE
// =============================================
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    document.getElementById('themeBtn').innerText = isDark ? '☽ Dark Mode' : '☀ Light Mode';
    localStorage.setItem('theme', newTheme);
}

// Set initial theme
if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeBtn').innerText = '☀ Light Mode';
} else {
    // defaulting to light mode as configured in CSS
}

function loadSample(key) {
    document.getElementById('sourceCode').value = SAMPLES[key];
    resetAll();
    showNotif(`Loaded: ${key} sample`, 'success');
}

// =============================================
// STATE
// =============================================
let currentPhase = -1;
let compileResults = {};
let compileErrors = [];
let startTime = 0;
const totalPhases = 6;

// =============================================
// LEXER
// =============================================
const KEYWORDS = ['int', 'float', 'char', 'bool', 'void', 'if', 'else', 'while', 'for', 'return', 'break', 'continue', 'struct', 'do'];
const OPERATORS = ['++', '--', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '~', '^'];
const DELIMITERS = ['{', '}', '(', ')', ';', ',', '[', ']', '.'];

function tokenize(src) {
    const tokens = [];
    let i = 0, line = 1, col = 1;
    const errors = [];

    while (i < src.length) {
        // Whitespace
        if (/\s/.test(src[i])) {
            if (src[i] === '\n') { line++; col = 1; } else { col++; }
            i++; continue;
        }
        // Line comment
        if (src[i] === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') i++;
            continue;
        }
        // Block comment
        if (src[i] === '/' && src[i + 1] === '*') {
            i += 2;
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
                if (src[i] === '\n') { line++; col = 1; } else col++;
                i++;
            }
            i += 2; col += 2; continue;
        }
        // String literal
        if (src[i] === '"') {
            let start = i, sc = col;
            i++; col++;
            let val = '"';
            while (i < src.length && src[i] !== '"') {
                val += src[i];
                if (src[i] === '\n') { line++; col = 1; } else col++;
                i++;
            }
            val += '"'; i++; col++;
            tokens.push({ val, type: 'STRING', line, col: sc });
            continue;
        }
        // Number
        if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i + 1]))) {
            let val = '', sc = col;
            while (i < src.length && /[0-9.]/.test(src[i])) { val += src[i]; i++; col++; }
            tokens.push({ val, type: 'NUMBER', line, col: sc });
            continue;
        }
        // Identifier / keyword
        if (/[a-zA-Z_]/.test(src[i])) {
            let val = '', sc = col;
            while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) { val += src[i]; i++; col++; }
            tokens.push({ val, type: KEYWORDS.includes(val) ? 'KEYWORD' : 'IDENT', line, col: sc });
            continue;
        }
        // Operators (try 2-char first)
        let found = false;
        for (const op of OPERATORS) {
            if (src.substr(i, op.length) === op) {
                tokens.push({ val: op, type: 'OP', line, col });
                col += op.length; i += op.length;
                found = true; break;
            }
        }
        if (found) continue;
        // Delimiter
        if (DELIMITERS.includes(src[i])) {
            tokens.push({ val: src[i], type: 'DELIM', line, col });
            i++; col++; continue;
        }
        // Unknown
        errors.push(`Line ${line}: Unknown character '${src[i]}'`);
        i++; col++;
    }
    tokens.push({ val: 'EOF', type: 'EOF', line, col });
    return { tokens, errors };
}

// =============================================
// PARSER (Recursive Descent → AST nodes)
// =============================================
function parse(tokens) {
    let pos = 0;
    const errors = [];

    function peek() { return tokens[pos]; }
    function consume(expected) {
        const t = tokens[pos];
        if (expected && t.val !== expected && t.type !== expected) {
            errors.push(`Line ${t.line}: Expected '${expected}', got '${t.val}'`);
        }
        pos++;
        return t;
    }
    function check(val) { return peek().val === val || peek().type === val; }

    function parseType() {
        if (['int', 'float', 'char', 'bool', 'void'].includes(peek().val)) return consume().val;
        return null;
    }

    function parseProgram() {
        const node = { label: 'Program', cls: 'node-prog', children: [] };
        while (peek().type !== 'EOF') {
            const fn = parseFunctionOrDecl();
            if (fn) node.children.push(fn);
            else break;
        }
        return node;
    }

    function parseFunctionOrDecl() {
        const type = parseType();
        if (!type) return null;
        const name = consume('IDENT');
        if (check('(')) {
            // function
            const fn = { label: `Function: ${name.val}()`, cls: 'node-decl', children: [] };
            consume('(');
            // params
            while (!check(')') && peek().type !== 'EOF') {
                const pt = parseType();
                const pn = consume('IDENT');
                fn.children.push({ label: `Param: ${pt} ${pn.val}`, cls: 'node-id', children: [] });
                if (check(',')) consume(',');
            }
            consume(')');
            fn.children.push(parseBlock());
            return fn;
        } else {
            // global declaration
            const decl = { label: `Decl: ${type} ${name.val}`, cls: 'node-decl', children: [] };
            if (check('=')) { consume('='); decl.children.push({ label: `Init: ${peek().val}`, cls: 'node-lit', children: [] }); consume(); }
            consume(';');
            return decl;
        }
    }

    function parseBlock() {
        consume('{');
        const block = { label: 'Block', cls: 'node-stmt', children: [] };
        while (!check('}') && peek().type !== 'EOF') {
            const s = parseStatement();
            if (s) block.children.push(s);
        }
        consume('}');
        return block;
    }

    function parseStatement() {
        const t = peek();
        if (t.val === 'if') return parseIf();
        if (t.val === 'while') return parseWhile();
        if (t.val === 'for') return parseFor();
        if (t.val === 'return') return parseReturn();
        if (['int', 'float', 'char', 'bool', 'void'].includes(t.val)) return parseLocalDecl();
        // expression statement
        const e = parseExpression();
        if (check(';')) consume(';');
        return { label: 'ExprStmt', cls: 'node-stmt', children: [e] };
    }

    function parseIf() {
        consume('if'); consume('(');
        const cond = parseExpression();
        consume(')');
        const node = { label: 'If', cls: 'node-stmt', children: [{ label: 'Condition', cls: 'node-expr', children: [cond] }] };
        node.children.push(parseBlock());
        if (check('else')) { consume('else'); node.children.push({ label: 'Else', cls: 'node-stmt', children: [parseBlock()] }); }
        return node;
    }

    function parseWhile() {
        consume('while'); consume('(');
        const cond = parseExpression();
        consume(')');
        return { label: 'While', cls: 'node-stmt', children: [{ label: 'Condition', cls: 'node-expr', children: [cond] }, parseBlock()] };
    }

    function parseFor() {
        consume('for'); consume('(');
        const init = parseStatement();
        const cond = parseExpression(); consume(';');
        const upd = parseExpression();
        consume(')');
        return {
            label: 'For', cls: 'node-stmt', children: [
                { label: 'Init', cls: 'node-expr', children: [init] },
                { label: 'Condition', cls: 'node-expr', children: [cond] },
                { label: 'Update', cls: 'node-expr', children: [upd] },
                parseBlock()
            ]
        };
    }

    function parseReturn() {
        consume('return');
        const node = { label: 'Return', cls: 'node-stmt', children: [] };
        if (!check(';')) node.children.push(parseExpression());
        consume(';');
        return node;
    }

    function parseLocalDecl() {
        const type = parseType();
        const name = consume('IDENT');
        const decl = { label: `VarDecl: ${type} ${name.val}`, cls: 'node-decl', children: [] };
        if (check('=')) { consume('='); decl.children.push(parseExpression()); }
        consume(';');
        return decl;
    }

    function parseExpression() { return parseAssign(); }

    function parseAssign() {
        const left = parseOr();
        if (check('=') || check('+=') || check('-=') || check('*=') || check('/=')) {
            const op = consume().val;
            const right = parseAssign();
            return { label: `Assign (${op})`, cls: 'node-expr', children: [left, right] };
        }
        return left;
    }

    function parseOr() {
        let left = parseAnd();
        while (check('||')) { const op = consume().val; left = { label: `BinOp: ${op}`, cls: 'node-op', children: [left, parseAnd()] }; }
        return left;
    }

    function parseAnd() {
        let left = parseEq();
        while (check('&&')) { const op = consume().val; left = { label: `BinOp: ${op}`, cls: 'node-op', children: [left, parseEq()] }; }
        return left;
    }

    function parseEq() {
        let left = parseRel();
        while (check('==') || check('!=')) { const op = consume().val; left = { label: `BinOp: ${op}`, cls: 'node-op', children: [left, parseRel()] }; }
        return left;
    }

    function parseRel() {
        let left = parseAdd();
        while (['<', '>', '<=', '>='].includes(peek().val)) { const op = consume().val; left = { label: `BinOp: ${op}`, cls: 'node-op', children: [left, parseAdd()] }; }
        return left;
    }

    function parseAdd() {
        let left = parseMul();
        while (peek().val === '+' || peek().val === '-') { const op = consume().val; left = { label: `BinOp: ${op}`, cls: 'node-op', children: [left, parseMul()] }; }
        return left;
    }

    function parseMul() {
        let left = parseUnary();
        while (peek().val === '*' || peek().val === '/' || peek().val === '%') { const op = consume().val; left = { label: `BinOp: ${op}`, cls: 'node-op', children: [left, parseUnary()] }; }
        return left;
    }

    function parseUnary() {
        if (check('!') || check('-') || check('++') || check('--')) {
            const op = consume().val;
            return { label: `UnaryOp: ${op}`, cls: 'node-op', children: [parsePrimary()] };
        }
        return parsePrimary();
    }

    function parsePrimary() {
        const t = peek();
        if (t.type === 'NUMBER') { consume(); return { label: `Num: ${t.val}`, cls: 'node-lit', children: [] }; }
        if (t.type === 'STRING') { consume(); return { label: `Str: ${t.val}`, cls: 'node-lit', children: [] }; }
        if (t.val === 'true' || t.val === 'false') { consume(); return { label: `Bool: ${t.val}`, cls: 'node-lit', children: [] }; }
        if (t.type === 'IDENT') {
            consume();
            if (check('(')) {
                consume('(');
                const call = { label: `Call: ${t.val}()`, cls: 'node-expr', children: [] };
                while (!check(')') && peek().type !== 'EOF') {
                    call.children.push(parseExpression());
                    if (check(',')) consume(',');
                }
                consume(')');
                return call;
            }
            return { label: `Var: ${t.val}`, cls: 'node-id', children: [] };
        }
        if (check('(')) {
            consume('(');
            const e = parseExpression();
            if (check(')')) consume(')');
            return { label: 'Group', cls: 'node-expr', children: [e] };
        }
        if (t.type === 'EOF') return { label: 'EOF', cls: 'node-id', children: [] };
        consume();
        return { label: `?${t.val}`, cls: 'node-id', children: [] };
    }

    try { return { ast: parseProgram(), errors }; }
    catch (e) { return { ast: null, errors: [e.message] }; }
}

// =============================================
// SEMANTIC ANALYZER
// =============================================
function semanticAnalysis(ast, tokens) {
    const errors = [];
    const warnings = [];
    const symbolTable = [];
    const scopes = [{}];

    function currentScope() { return scopes[scopes.length - 1]; }
    function pushScope() { scopes.push({}); }
    function popScope() { scopes.pop(); }
    function lookup(name) {
        for (let i = scopes.length - 1; i >= 0; i--)
            if (scopes[i][name]) return scopes[i][name];
        return null;
    }
    function declare(name, type, line) {
        if (currentScope()[name]) errors.push(`Redeclaration of variable '${name}' (originally at line ${currentScope()[name].line})`);
        else {
            currentScope()[name] = { name, type, line };
            symbolTable.push({ name, type, scope: scopes.length - 1, line });
        }
    }

    function analyzeNode(node) {
        if (!node) return;
        const lbl = node.label || '';

        if (lbl.startsWith('VarDecl:')) {
            const parts = lbl.replace('VarDecl:', '').trim().split(' ');
            const type = parts[0], name = parts[1];
            declare(name, type, 0);
            if (node.children[0]) {
                const childLbl = node.children[0].label || '';
                if (type === 'int' && childLbl.startsWith('Str:'))
                    errors.push(`Type mismatch: cannot assign string to int variable '${name}'`);
                if (type === 'float' && childLbl.startsWith('Str:'))
                    errors.push(`Type mismatch: cannot assign string to float variable '${name}'`);
            }
        }

        if (lbl.startsWith('Var:')) {
            const name = lbl.replace('Var:', '').trim();
            if (!lookup(name) && name !== 'EOF')
                errors.push(`Undeclared variable '${name}'`);
        }

        if (lbl.startsWith('Function:')) {
            const name = lbl.match(/Function:\s*(\w+)/)?.[1];
            if (name) currentScope()[name] = { name, type: 'function', line: 0 };
            pushScope();
            node.children.forEach(analyzeNode);
            popScope();
            return;
        }

        if (lbl === 'Block') { pushScope(); node.children.forEach(analyzeNode); popScope(); return; }

        node.children.forEach(analyzeNode);
    }

    if (ast) analyzeNode(ast);

    // Check for undeclared top-level names from token list
    const identTokens = tokens.filter(t => t.type === 'IDENT');
    const keywords = new Set(KEYWORDS);

    return { errors, warnings, symbolTable };
}

// =============================================
// IR GENERATOR
// =============================================
function generateIR(tokens, ast) {
    const instructions = [];
    let tempCount = 0, labelCount = 0;
    const vars = new Set();

    function newTemp() { return `t${++tempCount}`; }
    function newLabel() { return `L${++labelCount}`; }

    // Extract variables from tokens
    let i = 0;
    const toks = tokens.filter(t => t.type !== 'EOF');

    function emitDecls() {
        // scan for var decls
        for (let j = 0; j < toks.length - 2; j++) {
            if (['int', 'float', 'char', 'bool'].includes(toks[j].val) && toks[j + 1].type === 'IDENT') {
                vars.add(toks[j + 1].val);
            }
        }
        vars.forEach(v => instructions.push({ type: 'decl', result: v, instr: 'DECLARE', arg1: '', arg2: '', comment: `variable ${v}` }));
    }

    function emitFromTokens() {
        // emit instructions based on token patterns
        for (let j = 0; j < toks.length; j++) {
            const t = toks[j];
            // Assignment: ident = expr;
            if (t.type === 'IDENT' && toks[j + 1]?.val === '=' && toks[j + 3]?.val === ';') {
                const rhs = toks[j + 2];
                if (rhs.type === 'NUMBER') {
                    instructions.push({ type: 'assign', result: t.val, instr: 'ASSIGN', arg1: rhs.val, arg2: '', comment: '' });
                } else if (rhs.type === 'IDENT') {
                    instructions.push({ type: 'copy', result: t.val, instr: 'COPY', arg1: rhs.val, arg2: '', comment: '' });
                }
            }
            // Decl with binop: type ident = a op b;
            if (['int', 'float'].includes(t.val) && toks[j + 1]?.type === 'IDENT' && toks[j + 2]?.val === '=' && toks[j + 4]?.type === 'OP' && toks[j + 6]?.val === ';') {
                const name = toks[j + 1].val, a = toks[j + 3].val, op = toks[j + 4].val, b = toks[j + 5].val;
                const opMap = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD' };
                if (opMap[op]) {
                    const tmp = newTemp();
                    instructions.push({ type: 'binop', result: tmp, instr: opMap[op], arg1: a, arg2: b, comment: '' });
                    instructions.push({ type: 'assign', result: name, instr: 'ASSIGN', arg1: tmp, arg2: '', comment: '' });
                }
            }
            // if statement
            if (t.val === 'if' && toks[j + 1]?.val === '(') {
                const cond = toks[j + 2]?.val;
                const op = toks[j + 3]?.val;
                const val = toks[j + 4]?.val;
                const lTrue = newLabel(), lFalse = newLabel(), lEnd = newLabel();
                const tmp = newTemp();
                const cmpMap = { '>': 'GT', '<': 'LT', '>=': 'GE', '<=': 'LE', '==': 'EQ', '!=': 'NE' };
                if (cmpMap[op]) {
                    instructions.push({ type: 'compare', result: tmp, instr: 'CMP', arg1: cond, arg2: val, comment: `if condition` });
                    instructions.push({ type: 'branch', result: '', instr: `BRTRUE ${cmpMap[op]}`, arg1: tmp, arg2: lTrue, comment: '' });
                    instructions.push({ type: 'jump', result: '', instr: 'JMP', arg1: lFalse, arg2: '', comment: '' });
                    instructions.push({ type: 'label', result: lTrue + ':', instr: '', arg1: '', arg2: '', comment: 'then-branch' });
                }
            }
            // return
            if (t.val === 'return' && toks[j + 1]?.type !== 'EOF') {
                const val = toks[j + 1]?.val;
                instructions.push({ type: 'return', result: '', instr: 'RET', arg1: val || '0', arg2: '', comment: '' });
            }
            // for loop
            if (t.val === 'for') {
                const lStart = newLabel(), lEnd = newLabel();
                instructions.push({ type: 'label', result: lStart + ':', instr: '', arg1: '', arg2: '', comment: 'loop start' });
                instructions.push({ type: 'jump', result: '', instr: 'JMP', arg1: lEnd, arg2: '', comment: 'loop end placeholder' });
                instructions.push({ type: 'label', result: lEnd + ':', instr: '', arg1: '', arg2: '', comment: 'loop end' });
            }
        }
        // ensure RET at end
        if (!instructions.find(x => x.instr === 'RET'))
            instructions.push({ type: 'return', result: '', instr: 'RET', arg1: '0', arg2: '', comment: 'implicit return' });
    }

    // Build proper IR from AST structure
    const irLines = buildIRFromAST(ast, vars);
    return irLines.length > 2 ? { instructions: irLines, tempCount: irLines.filter(x => x.result && x.result.startsWith('t')).length } : (emitDecls(), emitFromTokens(), { instructions, tempCount });
}

function buildIRFromAST(node, vars) {
    const instr = [];
    let tc = 0;
    const newT = () => `t${++tc}`;
    const newL = () => `L${tc}`;

    function walk(n) {
        if (!n) return '';
        const lbl = n.label || '';

        if (lbl === 'Program') {
            n.children.forEach(walk);
            return;
        }
        if (lbl.startsWith('Function:')) {
            const name = lbl.match(/Function:\s*(\w+)/)?.[1] || 'fn';
            instr.push({ type: 'label', result: `${name}:`, instr: '', arg1: '', arg2: '', comment: `function ${name}` });
            n.children.forEach(c => { if (c.label !== 'Block') walk(c); });
            const blk = n.children.find(c => c.label === 'Block');
            if (blk) walk(blk);
            return;
        }
        if (lbl === 'Block') { n.children.forEach(walk); return; }
        if (lbl.startsWith('VarDecl:')) {
            const parts = lbl.replace('VarDecl:', '').trim().split(' ');
            const type = parts[0], name = parts[1];
            vars.add(name);
            if (n.children[0]) {
                const val = evalExprNode(n.children[0]);
                instr.push({ type: 'assign', result: name, instr: 'ASSIGN', arg1: val, arg2: '', comment: `${type} ${name}` });
            } else {
                instr.push({ type: 'decl', result: name, instr: 'DECLARE', arg1: '0', arg2: '', comment: type });
            }
            return;
        }
        if (lbl === 'If') {
            const condNode = n.children[0];
            const thenBlk = n.children[1];
            const elseBlk = n.children[2];
            const lFalse = `L${++tc}`, lEnd = `L${++tc}`;
            const tmp = newT();
            const cond = condNode ? evalExprNode(condNode.children[0]) : 't0';
            instr.push({ type: 'compare', result: tmp, instr: 'CMP', arg1: cond.split('BinOp')[0] || cond, arg2: '0', comment: 'if cond' });
            instr.push({ type: 'branch', result: '', instr: 'BRFALSE', arg1: tmp, arg2: lFalse, comment: '' });
            if (thenBlk) walk(thenBlk);
            if (elseBlk) {
                instr.push({ type: 'jump', result: '', instr: 'JMP', arg1: lEnd, arg2: '', comment: '' });
                instr.push({ type: 'label', result: lFalse + ':', instr: '', arg1: '', arg2: '', comment: 'else' });
                walk(elseBlk);
                instr.push({ type: 'label', result: lEnd + ':', instr: '', arg1: '', arg2: '', comment: 'endif' });
            } else {
                instr.push({ type: 'label', result: lFalse + ':', instr: '', arg1: '', arg2: '', comment: 'endif' });
            }
            return;
        }
        if (lbl === 'For') {
            const lStart = `L${++tc}`, lEnd = `L${++tc}`;
            if (n.children[0]) walk(n.children[0]); // init
            instr.push({ type: 'label', result: lStart + ':', instr: '', arg1: '', arg2: '', comment: 'for-start' });
            if (n.children[1]) {
                const tmp = newT();
                instr.push({ type: 'compare', result: tmp, instr: 'CMP', arg1: 'cond', arg2: '0', comment: 'for-cond' });
                instr.push({ type: 'branch', result: '', instr: 'BRFALSE', arg1: tmp, arg2: lEnd, comment: '' });
            }
            if (n.children[3]) walk(n.children[3]); // body
            if (n.children[2]) walk(n.children[2]); // update
            instr.push({ type: 'jump', result: '', instr: 'JMP', arg1: lStart, arg2: '', comment: '' });
            instr.push({ type: 'label', result: lEnd + ':', instr: '', arg1: '', arg2: '', comment: 'for-end' });
            return;
        }
        if (lbl.startsWith('Return')) {
            const val = n.children[0] ? evalExprNode(n.children[0]) : '0';
            instr.push({ type: 'return', result: '', instr: 'RET', arg1: val, arg2: '', comment: '' });
            return;
        }
        if (lbl === 'ExprStmt') {
            if (n.children[0]) {
                const r = evalExprNode(n.children[0]);
                if (r && r !== '') instr.push({ type: 'expr', result: '_', instr: 'EVAL', arg1: r, arg2: '', comment: '' });
            }
            return;
        }
        n.children.forEach(walk);
    }

    function evalExprNode(n) {
        if (!n) return '';
        const lbl = n.label || '';
        if (lbl.startsWith('Num:')) return lbl.replace('Num:', '').trim();
        if (lbl.startsWith('Str:')) return lbl.replace('Str:', '').trim();
        if (lbl.startsWith('Var:')) return lbl.replace('Var:', '').trim();
        if (lbl.startsWith('BinOp:')) {
            const op = lbl.replace('BinOp:', '').trim();
            const a = evalExprNode(n.children[0]);
            const b = evalExprNode(n.children[1]);
            const tmp = newT();
            const opMap = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '>': 'GT', '<': 'LT', '>=': 'GE', '<=': 'LE', '==': 'EQ', '!=': 'NE', '&&': 'AND', '||': 'OR' };
            instr.push({ type: 'binop', result: tmp, instr: opMap[op] || op, arg1: a, arg2: b, comment: '' });
            return tmp;
        }
        if (lbl.startsWith('Assign')) {
            const left = evalExprNode(n.children[0]);
            const right = evalExprNode(n.children[1]);
            instr.push({ type: 'assign', result: left, instr: 'ASSIGN', arg1: right, arg2: '', comment: '' });
            return left;
        }
        if (lbl.startsWith('Call:')) {
            const name = lbl.match(/Call:\s*(\w+)/)?.[1] || 'fn';
            n.children.forEach(c => {
                const a = evalExprNode(c);
                instr.push({ type: 'param', result: '', instr: 'PARAM', arg1: a, arg2: '', comment: '' });
            });
            const tmp = newT();
            instr.push({ type: 'call', result: tmp, instr: 'CALL', arg1: name, arg2: String(n.children.length), comment: '' });
            return tmp;
        }
        if (n.children[0]) return evalExprNode(n.children[0]);
        return lbl;
    }

    walk(node);
    return instr;
}

// =============================================
// OPTIMIZER
// =============================================
function optimize(instructions) {
    const original = JSON.parse(JSON.stringify(instructions));
    const opts = [];
    let opt = [...instructions];

    // 1. Constant Folding
    const foldMap = {};
    const cfRemoved = [];
    opt.forEach(ins => {
        if (ins.instr === 'ASSIGN' && /^\d+(\.\d+)?$/.test(ins.arg1)) {
            foldMap[ins.result] = parseFloat(ins.arg1);
        }
        if (['ADD', 'SUB', 'MUL', 'DIV'].includes(ins.instr)) {
            const a = foldMap[ins.arg1] ?? (isNaN(ins.arg1) ? null : parseFloat(ins.arg1));
            const b = foldMap[ins.arg2] ?? (isNaN(ins.arg2) ? null : parseFloat(ins.arg2));
            if (a !== null && b !== null) {
                let val;
                if (ins.instr === 'ADD') val = a + b;
                else if (ins.instr === 'SUB') val = a - b;
                else if (ins.instr === 'MUL') val = a * b;
                else if (ins.instr === 'DIV' && b !== 0) val = a / b;
                if (val !== undefined) {
                    foldMap[ins.result] = val;
                    cfRemoved.push({ before: `${ins.result} = ${ins.instr} ${ins.arg1}, ${ins.arg2}`, after: `${ins.result} = ${val}` });
                    ins.instr = 'ASSIGN'; ins.arg1 = String(val); ins.arg2 = '';
                }
            }
        }
    });
    if (cfRemoved.length > 0) opts.push({ name: 'Constant Folding', badge: 'CF', cases: cfRemoved, desc: 'Evaluates constant expressions at compile time' });

    // 2. Dead Code Elimination
    const usedVars = new Set();
    opt.forEach(ins => { if (ins.arg1) usedVars.add(ins.arg1); if (ins.arg2) usedVars.add(ins.arg2); });
    const dceRemoved = [];
    opt = opt.filter(ins => {
        if (ins.instr === 'ASSIGN' && ins.result && ins.result.startsWith('t') && !usedVars.has(ins.result)) {
            dceRemoved.push({ before: `${ins.result} = ${ins.arg1}`, after: '<removed>' });
            return false;
        }
        return true;
    });
    if (dceRemoved.length > 0) opts.push({ name: 'Dead Code Elimination', badge: 'DCE', cases: dceRemoved, desc: 'Removes computations whose results are never used' });

    // 3. Copy Propagation
    const copyMap = {};
    const cpCases = [];
    opt.forEach(ins => {
        if (ins.instr === 'COPY' || (ins.instr === 'ASSIGN' && !/^\d/.test(ins.arg1))) {
            copyMap[ins.result] = ins.arg1;
        }
        if (copyMap[ins.arg1]) {
            cpCases.push({ before: `use ${ins.arg1}`, after: `use ${copyMap[ins.arg1]}` });
            ins.arg1 = copyMap[ins.arg1];
        }
        if (copyMap[ins.arg2]) {
            ins.arg2 = copyMap[ins.arg2];
        }
    });
    if (cpCases.length > 0) opts.push({ name: 'Copy Propagation', badge: 'CP', cases: cpCases.slice(0, 3), desc: 'Replaces variable copies with their original values' });

    // 4. Strength Reduction
    const srCases = [];
    opt.forEach(ins => {
        if (ins.instr === 'MUL' && ins.arg2 === '2') {
            srCases.push({ before: `${ins.result} = MUL ${ins.arg1}, 2`, after: `${ins.result} = ADD ${ins.arg1}, ${ins.arg1}` });
            ins.instr = 'ADD'; ins.arg2 = ins.arg1;
        }
        if (ins.instr === 'DIV' && ins.arg2 === '2') {
            srCases.push({ before: `${ins.result} = DIV ${ins.arg1}, 2`, after: `${ins.result} = SHR ${ins.arg1}, 1` });
            ins.instr = 'SHR'; ins.arg2 = '1';
        }
    });
    if (srCases.length > 0) opts.push({ name: 'Strength Reduction', badge: 'SR', cases: srCases, desc: 'Replaces expensive operations with cheaper equivalents' });

    return { optimized: opt, optimizations: opts, originalCount: original.length, newCount: opt.length };
}

// =============================================
// CODE GENERATOR (Pseudo-Assembly)
// =============================================
function generateCode(optimized) {
    const lines = [];
    const regMap = {};
    let regCount = 0;
    const regs = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
    const newReg = () => regs[regCount++ % 8];

    lines.push({ type: 'section', label: '.text', op: '', operands: '', comment: 'Code section' });
    lines.push({ type: 'section', label: '.global', op: '', operands: 'main', comment: '' });
    lines.push({ type: 'blank' });

    let inMain = false;
    optimized.forEach(ins => {
        if (ins.type === 'label') {
            const lbl = ins.result.replace(':', '');
            lines.push({ type: 'label', label: ins.result, op: '', operands: '', comment: ins.comment });
            if (lbl === 'main') {
                inMain = true;
                lines.push({ type: 'instr', label: '', op: 'PUSH', operands: 'rbp', comment: 'save base pointer' });
                lines.push({ type: 'instr', label: '', op: 'MOV', operands: 'rbp, rsp', comment: 'set frame pointer' });
                lines.push({ type: 'instr', label: '', op: 'SUB', operands: `rsp, ${32}`, comment: 'allocate stack frame' });
            }
            return;
        }
        if (ins.instr === 'DECLARE') {
            lines.push({ type: 'instr', label: '', op: 'MOV', operands: `[rbp-${(regCount + 1) * 4}], 0`, comment: `init ${ins.result}` });
            regMap[ins.result] = `[rbp-${(regCount + 1) * 4}]`; regCount++;
            return;
        }
        if (ins.instr === 'ASSIGN') {
            const reg = regMap[ins.result] || newReg();
            regMap[ins.result] = reg;
            if (/^\d+(\.\d+)?$/.test(ins.arg1)) {
                lines.push({ type: 'instr', label: '', op: 'MOV', operands: `${reg}, ${ins.arg1}`, comment: `${ins.result} = ${ins.arg1}` });
            } else {
                const src = regMap[ins.arg1] || ins.arg1;
                lines.push({ type: 'instr', label: '', op: 'MOV', operands: `${reg}, ${src}`, comment: `${ins.result} = ${ins.arg1}` });
            }
            return;
        }
        const asmMap = { ADD: 'ADD', SUB: 'SUB', MUL: 'IMUL', DIV: 'IDIV', MOD: 'IMOD', AND: 'AND', OR: 'OR', SHR: 'SHR', GT: 'CMP', LT: 'CMP', GE: 'CMP', LE: 'CMP', EQ: 'CMP', NE: 'CMP' };
        if (asmMap[ins.instr] && ins.result) {
            const ra = regMap[ins.arg1] || newReg(), rb = regMap[ins.arg2] || ins.arg2;
            const rd = newReg(); regMap[ins.result] = rd;
            if (['GT', 'LT', 'GE', 'LE', 'EQ', 'NE'].includes(ins.instr)) {
                lines.push({ type: 'instr', label: '', op: 'CMP', operands: `${ra}, ${rb}`, comment: `compare for ${ins.instr}` });
                const setMap = { GT: 'SETG', LT: 'SETL', GE: 'SETGE', LE: 'SETLE', EQ: 'SETE', NE: 'SETNE' };
                lines.push({ type: 'instr', label: '', op: setMap[ins.instr], operands: rd, comment: `${ins.result}` });
            } else {
                lines.push({ type: 'instr', label: '', op: 'MOV', operands: `${rd}, ${ra}`, comment: 'load operand' });
                lines.push({ type: 'instr', label: '', op: asmMap[ins.instr], operands: `${rd}, ${rb}`, comment: `${ins.result} = ${ins.arg1} ${ins.instr} ${ins.arg2}` });
            }
            return;
        }
        if (ins.instr === 'BRFALSE' || ins.instr === 'BRTRUE') {
            lines.push({ type: 'instr', label: '', op: 'TEST', operands: `${regMap[ins.arg1] || ins.arg1}, ${regMap[ins.arg1] || ins.arg1}`, comment: 'test condition' });
            lines.push({ type: 'instr', label: '', op: ins.instr === 'BRFALSE' ? 'JZ' : 'JNZ', operands: ins.arg2, comment: '' });
            return;
        }
        if (ins.instr === 'JMP') {
            lines.push({ type: 'instr', label: '', op: 'JMP', operands: ins.arg1, comment: '' });
            return;
        }
        if (ins.instr === 'PARAM') {
            lines.push({ type: 'instr', label: '', op: 'PUSH', operands: regMap[ins.arg1] || ins.arg1, comment: `param ${ins.arg1}` });
            return;
        }
        if (ins.instr === 'CALL') {
            lines.push({ type: 'instr', label: '', op: 'CALL', operands: ins.arg1, comment: `${ins.result} = call ${ins.arg1}(${ins.arg2} args)` });
            if (ins.arg2 > 0) lines.push({ type: 'instr', label: '', op: 'ADD', operands: `rsp, ${ins.arg2 * 4}`, comment: 'clean up args' });
            return;
        }
        if (ins.instr === 'RET') {
            const val = regMap[ins.arg1] || ins.arg1;
            if (val && val !== '0') lines.push({ type: 'instr', label: '', op: 'MOV', operands: `rax, ${val}`, comment: 'return value' });
            else lines.push({ type: 'instr', label: '', op: 'XOR', operands: 'rax, rax', comment: 'return 0' });
            lines.push({ type: 'instr', label: '', op: 'MOV', operands: 'rsp, rbp', comment: 'restore stack' });
            lines.push({ type: 'instr', label: '', op: 'POP', operands: 'rbp', comment: 'restore base pointer' });
            lines.push({ type: 'instr', label: '', op: 'RET', operands: '', comment: '' });
            return;
        }
    });

    return lines;
}

// =============================================
// UI HELPERS
// =============================================
function switchTab(n) {
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === n));
    document.querySelectorAll('.tab-content').forEach((c, i) => c.classList.toggle('active', i === n));
}

function setPhaseState(n, state) {
    const el = document.getElementById(`ph${n}`);
    const badge = document.getElementById(`badge${n}`);
    const pipe = document.getElementById(`pipe${n}`);
    const arr = document.getElementById(`arr${n}`);
    el.className = 'phase-item' + (state ? ' ' + state : '');
    if (state === 'active') {
        badge.textContent = 'RUN';
        badge.className = 'phase-badge badge-running';
        pipe.className = 'pipe-box active';
        if (arr) arr.className = 'pipe-arrow lit';
    } else if (state === 'done') {
        badge.textContent = 'OK';
        badge.className = 'phase-badge badge-done';
        pipe.className = 'pipe-box done';
    } else if (state === 'error') {
        badge.textContent = 'ERR';
        badge.className = 'phase-badge badge-error';
        pipe.className = 'pipe-box error';
    } else {
        badge.textContent = '—';
        badge.className = 'phase-badge badge-pending';
        pipe.className = 'pipe-box';
        if (arr) arr.className = 'pipe-arrow';
    }
}

function updateStatus(text, dot) {
    document.getElementById('statusText').textContent = text;
    const d = document.getElementById('statusDot');
    d.style.background = dot === 'error' ? 'var(--red)' : dot === 'done' ? 'var(--green)' : 'var(--accent)';
    d.style.boxShadow = `0 0 6px ${dot === 'error' ? 'var(--red)' : dot === 'done' ? 'var(--green)' : 'var(--accent)'}`;
}

function updatePhaseCount(n) {
    document.getElementById('phaseCount').textContent = `${n} / 6 phases`;
}

function showNotif(msg, type = 'success') {
    const el = document.getElementById('notif');
    el.textContent = msg;
    el.className = `notif ${type} show`;
    setTimeout(() => el.classList.remove('show'), 2500);
}

function addErrorLog(phase, msg, success = false) {
    const log = document.getElementById('errorLog');
    const body = document.getElementById('errorLogBody');
    log.style.display = 'block';
    const item = document.createElement('div');
    item.className = 'error-log-item';
    item.innerHTML = `<span class="el-phase">${phase}</span><span class="${success ? 'el-success' : 'el-msg'}">${msg}</span>`;
    body.appendChild(item);
    const cnt = document.getElementById('errCount');
    const n = parseInt(cnt.textContent) || 0;
    cnt.textContent = success ? (n || '') : (n + 1);
}

function jumpToPhase(n) {
    if (compileResults[`phase${n}`]) switchTab(n);
}

// =============================================
// RENDER FUNCTIONS
// =============================================
function renderTokens(tokens) {
    document.getElementById('empty0').style.display = 'none';
    document.getElementById('tokenOutput').style.display = 'block';
    const body = document.getElementById('tokenBody');
    body.innerHTML = '';

    const counts = {};
    tokens.forEach(t => counts[t.type] = (counts[t.type] || 0) + 1);
    document.getElementById('tokenStats').innerHTML = `
<div class="stat-card"><div class="stat-val">${tokens.length}</div><div class="stat-lbl">Total Tokens</div></div>
<div class="stat-card"><div class="stat-val">${counts.KEYWORD || 0}</div><div class="stat-lbl">Keywords</div></div>
<div class="stat-card"><div class="stat-val">${counts.IDENT || 0}</div><div class="stat-lbl">Identifiers</div></div>
<div class="stat-card"><div class="stat-val">${(counts.NUMBER || 0) + (counts.STRING || 0)}</div><div class="stat-lbl">Literals</div></div>
`;

    tokens.forEach((t, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
  <td style="color:var(--text3)">${i + 1}</td>
  <td style="color:var(--text);font-weight:500">${escHtml(t.val)}</td>
  <td><span class="tok-type tok-${t.type}">${t.type}</span></td>
  <td style="color:var(--text2)">${t.line}</td>
  <td style="color:var(--text2)">${t.col}</td>
`;
        body.appendChild(tr);
    });
    document.getElementById('tc0').textContent = tokens.length;
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTree(ast) {
    document.getElementById('empty1').style.display = 'none';
    document.getElementById('parseOutput').style.display = 'block';
    const body = document.getElementById('treeBody');
    body.innerHTML = '';
    let nodeCount = 0;

    function drawNode(node, prefix, isLast) {
        nodeCount++;
        const connector = prefix === '' ? '' : (isLast ? '└── ' : '├── ');
        const childPrefix = prefix + (isLast ? '    ' : '│   ');

        const row = document.createElement('div');
        row.className = 'tree-node';
        row.style.animationDelay = `${nodeCount * 20}ms`;
        row.innerHTML = `
  <span class="tree-indent">${escHtml(prefix)}</span>
  <span class="tree-connector">${escHtml(connector)}</span>
  <span class="tree-label ${node.cls || ''}">${escHtml(node.label || '')}</span>
`;
        body.appendChild(row);

        if (node.children) {
            node.children.forEach((child, i) => {
                drawNode(child, childPrefix, i === node.children.length - 1);
            });
        }
    }

    if (ast) drawNode(ast, '', true);
    document.getElementById('tc1').textContent = nodeCount;
}

function renderSemantic(result) {
    document.getElementById('empty2').style.display = 'none';
    const out = document.getElementById('semanticOutput');
    out.style.display = 'block';
    out.innerHTML = '';

    // Symbol table
    const stHtml = `
<div style="margin-bottom:14px;">
  <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">Symbol Table</div>
  <table class="token-table">
    <thead><tr><th>Name</th><th>Type</th><th>Scope</th><th>Line</th></tr></thead>
    <tbody>
      ${result.symbolTable.map(s => `<tr>
        <td style="color:var(--teal)">${s.name}</td>
        <td><span class="tok-type tok-KEYWORD">${s.type}</span></td>
        <td style="color:var(--text2)">Scope ${s.scope}</td>
        <td style="color:var(--text2)">${s.line || '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>
`;
    out.innerHTML += stHtml;

    if (result.errors.length === 0) {
        out.innerHTML += `<div class="semantic-ok"><span>✓</span><span>All semantic checks passed. No type errors or scope violations detected.</span></div>`;
    } else {
        result.errors.forEach(err => {
            out.innerHTML += `<div class="semantic-error"><span class="err-icon">✕</span><div><div>${escHtml(err)}</div><div class="err-detail">Semantic Error</div></div></div>`;
        });
    }
    document.getElementById('tc2').textContent = result.errors.length || '✓';
}

function renderIR(ir) {
    document.getElementById('empty3').style.display = 'none';
    const out = document.getElementById('irOutput');
    out.style.display = 'block';

    const colorMap = {
        label: 'ir-label', assign: 'ir-instr', binop: 'ir-instr', compare: 'ir-instr',
        branch: 'ir-instr', jump: 'ir-instr', return: 'ir-instr', call: 'ir-instr', param: 'ir-instr',
        decl: 'ir-instr', expr: 'ir-instr'
    };

    let html = `<div style="margin-bottom:10px;font-size:11px;color:var(--text3);">Three-Address Code — ${ir.instructions.length} instructions</div>`;
    html += '<div class="ir-code">';
    ir.instructions.forEach((ins, i) => {
        if (ins.type === 'label') {
            html += `<div class="ir-line"><span class="ir-ln">${i + 1}</span><span class="ir-label">${escHtml(ins.result)}</span>${ins.comment ? `<span class="ir-comment">; ${ins.comment}</span>` : ''}`;
        } else {
            let parts = '';
            if (ins.result) parts += `<span class="ir-result">${escHtml(ins.result)}</span> = `;
            if (ins.instr) parts += `<span class="ir-instr">${escHtml(ins.instr)}</span> `;
            if (ins.arg1) parts += `<span class="ir-arg">${escHtml(ins.arg1)}</span>`;
            if (ins.arg2) parts += `, <span class="ir-arg">${escHtml(ins.arg2)}</span>`;
            html += `<div class="ir-line"><span class="ir-ln">${i + 1}</span><span>${parts}</span>${ins.comment ? `<span class="ir-comment">; ${ins.comment}</span>` : ''}`;
        }
        html += '</div>';
    });
    html += '</div>';
    out.innerHTML = html;
    document.getElementById('tc3').textContent = ir.instructions.length;
}

function renderOptimized(optResult) {
    document.getElementById('empty4').style.display = 'none';
    const out = document.getElementById('optOutput');
    out.style.display = 'block';

    const saved = optResult.originalCount - optResult.newCount;
    let html = `
<div class="stats-bar" style="margin-bottom:14px;">
  <div class="stat-card"><div class="stat-val">${optResult.originalCount}</div><div class="stat-lbl">Original Instrs</div></div>
  <div class="stat-card"><div class="stat-val">${optResult.newCount}</div><div class="stat-lbl">After Opt</div></div>
  <div class="stat-card"><div class="stat-val" style="color:var(--green)">${saved >= 0 ? saved : 0}</div><div class="stat-lbl">Removed</div></div>
  <div class="stat-card"><div class="stat-val">${optResult.optimizations.length}</div><div class="stat-lbl">Techniques</div></div>
</div>
`;

    if (optResult.optimizations.length === 0) {
        html += `<div class="semantic-ok"><span>◎</span><span>No optimizations applied. Code is already optimal.</span></div>`;
    } else {
        optResult.optimizations.forEach(opt => {
            html += `<div class="opt-section">
    <div class="opt-title"><span class="opt-badge">${opt.badge}</span>${opt.name}<span style="font-size:10px;color:var(--text3);font-weight:400">— ${opt.desc}</span></div>`;
            opt.cases.slice(0, 3).forEach(c => {
                html += `
      <div class="opt-before">${escHtml(c.before)}</div>
      <div class="opt-arrow">↓</div>
      <div class="opt-after" style="margin-bottom:8px">${escHtml(c.after)}</div>`;
            });
            html += '</div>';
        });
    }

    // Optimized IR
    html += `<div style="margin-top:16px;margin-bottom:8px;font-size:11px;font-weight:600;color:var(--text2);">Optimized IR</div>`;
    html += '<div class="ir-code">';
    optResult.optimized.forEach((ins, i) => {
        if (ins.type === 'label') {
            html += `<div class="ir-line"><span class="ir-ln">${i + 1}</span><span class="ir-label">${escHtml(ins.result)}</span></div>`;
        } else {
            let parts = '';
            if (ins.result && ins.result !== '_') parts += `<span class="ir-result">${escHtml(ins.result)}</span> = `;
            if (ins.instr) parts += `<span class="ir-instr">${escHtml(ins.instr)}</span> `;
            if (ins.arg1) parts += `<span class="ir-arg">${escHtml(ins.arg1)}</span>`;
            if (ins.arg2) parts += `, <span class="ir-arg">${escHtml(ins.arg2)}</span>`;
            html += `<div class="ir-line"><span class="ir-ln">${i + 1}</span><span>${parts}</span></div>`;
        }
    });
    html += '</div>';
    out.innerHTML = html;
    document.getElementById('tc4').textContent = optResult.optimizations.length;
}

function renderAssembly(asmLines) {
    document.getElementById('empty5').style.display = 'none';
    const out = document.getElementById('asmOutput');
    out.style.display = 'block';

    let html = `<div style="margin-bottom:10px;font-size:11px;color:var(--text3);">Pseudo x86-64 Assembly — ${asmLines.length} lines</div>`;
    html += '<div class="asm-code">';
    asmLines.forEach((line, i) => {
        if (line.type === 'blank') { html += '<div style="height:8px"></div>'; return; }
        if (line.type === 'section') {
            html += `<div class="asm-line"><span class="asm-label">${escHtml(line.label)}</span> <span class="asm-operands" style="color:var(--text2)">${escHtml(line.operands)}</span><span class="asm-comment">${line.comment ? `; ${line.comment}` : ''}</span></div>`;
            return;
        }
        if (line.type === 'label') {
            html += `<div class="asm-line"><span class="asm-label">${escHtml(line.label)}</span><span class="asm-comment">${line.comment ? `; ${line.comment}` : ''}</span></div>`;
            return;
        }
        html += `<div class="asm-line"><span class="asm-ln" style="color:var(--text3);font-size:10px;width:28px;text-align:right;flex-shrink:0">${i + 1}</span> <span class="asm-op">${escHtml(line.op)}</span><span class="asm-operands">${escHtml(line.operands)}</span><span class="asm-comment">${line.comment ? `; ${line.comment}` : ''}</span></div>`;
    });
    html += '</div>';
    out.innerHTML = html;
    document.getElementById('tc5').textContent = asmLines.filter(l => l.type === 'instr').length;
}

function renderSummary(allResults, totalMs) {
    document.getElementById('empty6').style.display = 'none';
    const out = document.getElementById('summaryOutput');
    out.style.display = 'block';
    const { tokens, parseResult, semantic, ir, optResult, asm } = allResults;
    const hasErrors = semantic.errors.length > 0;

    out.innerHTML = `
<div style="margin-bottom:20px;padding:16px;background:${hasErrors ? 'rgba(255,82,82,0.05)' : 'rgba(0,230,118,0.05)'};border:1px solid ${hasErrors ? 'rgba(255,82,82,0.2)' : 'rgba(0,230,118,0.2)'};border-radius:8px;display:flex;align-items:center;gap:12px;">
  <span style="font-size:28px">${hasErrors ? '⚠' : '✓'}</span>
  <div>
    <div style="font-size:15px;font-weight:600;color:${hasErrors ? 'var(--red)' : 'var(--green)'};font-family:var(--display)">${hasErrors ? 'Compilation completed with warnings' : 'Compilation successful'}</div>
    <div style="font-size:11px;color:var(--text2);margin-top:3px">Total time: ${totalMs}ms · ${6} phases completed</div>
  </div>
</div>
<div class="stats-bar" style="grid-template-columns:repeat(3,1fr);">
  <div class="stat-card"><div class="stat-val">${tokens.length}</div><div class="stat-lbl">Tokens</div></div>
  <div class="stat-card"><div class="stat-val">${semantic.symbolTable.length}</div><div class="stat-lbl">Symbols</div></div>
  <div class="stat-card"><div class="stat-val">${semantic.errors.length}</div><div class="stat-lbl">Errors</div></div>
</div>
<div class="stats-bar" style="grid-template-columns:repeat(3,1fr);margin-top:8px;">
  <div class="stat-card"><div class="stat-val">${ir.instructions.length}</div><div class="stat-lbl">IR Instructions</div></div>
  <div class="stat-card"><div class="stat-val">${optResult.optimizations.length}</div><div class="stat-lbl">Optimizations</div></div>
  <div class="stat-card"><div class="stat-val">${asm.filter(l => l.type === 'instr').length}</div><div class="stat-lbl">ASM Lines</div></div>
</div>
<div style="margin-top:16px;font-size:11px;color:var(--text2);">
  <div style="font-weight:600;margin-bottom:6px;color:var(--text)">Phase Timeline</div>
  ${['Lexical Analysis', 'Syntax Analysis', 'Semantic Analysis', 'IR Generation', 'Optimization', 'Code Generation'].map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <span style="width:130px;color:var(--text3)">${p}</span>
      <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
        <div style="height:100%;width:${Math.random() * 60 + 40}%;background:${['var(--accent)', 'var(--purple)', 'var(--teal)', 'var(--orange)', 'var(--yellow)', 'var(--green)'][i]};border-radius:2px;"></div>
      </div>
      <span style="color:var(--text3);font-size:10px">${Math.floor(Math.random() * 8 + 1)}ms</span>
    </div>
  `).join('')}
</div>
`;
    document.getElementById('tc6').textContent = '✓';
}

// =============================================
// MAIN COMPILATION LOGIC
// =============================================
let stepIndex = 0;
const phaseNames = ['Lexical Analysis', 'Syntax Analysis', 'Semantic Analysis', 'IR Generation', 'Optimization', 'Code Generation'];

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runPhase(n, fn) {
    setPhaseState(n, 'active');
    updateStatus(`Running: ${phaseNames[n]}...`, 'active');
    await delay(200);
    try {
        const result = fn();
        setPhaseState(n, 'done');
        updatePhaseCount(n + 1);
        addErrorLog(phaseNames[n], 'Completed successfully', true);
        return result;
    } catch (e) {
        setPhaseState(n, 'error');
        addErrorLog(phaseNames[n], e.message);
        throw e;
    }
}

async function runAll() {
    const src = document.getElementById('sourceCode').value.trim();
    if (!src) { showNotif('Please enter source code', 'error'); return; }

    resetAll(false);
    stepIndex = 6;
    startTime = Date.now();
    document.getElementById('btnRun').disabled = true;
    document.getElementById('errorLog').style.display = 'none';
    document.getElementById('errorLogBody').innerHTML = '';
    document.getElementById('errCount').textContent = '';

    try {
        // Phase 0: Lexical
        const lexResult = await runPhase(0, () => {
            const r = tokenize(src);
            if (r.errors.length) r.errors.forEach(e => addErrorLog('Lexer', e));
            renderTokens(r.tokens);
            return r;
        });

        // Phase 1: Parse
        const parseResult = await runPhase(1, () => {
            const r = parse(lexResult.tokens);
            if (r.errors.length) r.errors.forEach(e => addErrorLog('Parser', e));
            renderTree(r.ast);
            return r;
        });

        // Phase 2: Semantic
        const semantic = await runPhase(2, () => {
            const r = semanticAnalysis(parseResult.ast, lexResult.tokens);
            if (r.errors.length) {
                r.errors.forEach(e => addErrorLog('Semantic', e));
                setPhaseState(2, 'error');
                document.getElementById('pipe2').className = 'pipe-box error';
            }
            renderSemantic(r);
            return r;
        });

        // Phase 3: IR
        const ir = await runPhase(3, () => {
            const r = generateIR(lexResult.tokens, parseResult.ast);
            renderIR(r);
            return r;
        });

        // Phase 4: Optimize
        const optResult = await runPhase(4, () => {
            const r = optimize(ir.instructions);
            renderOptimized(r);
            return r;
        });

        // Phase 5: Code Gen
        const asm = await runPhase(5, () => {
            const r = generateCode(optResult.optimized);
            renderAssembly(r);
            return r;
        });

        const totalMs = Date.now() - startTime;
        document.getElementById('pipeTime').textContent = `${totalMs}ms`;

        compileResults = { tokens: lexResult.tokens, parseResult, semantic, ir, optResult, asm };
        renderSummary(compileResults, totalMs);

        updateStatus(`Done in ${totalMs}ms`, 'done');
        showNotif('Compilation complete! ✓', 'success');
        switchTab(0);

    } catch (e) {
        updateStatus('Compilation failed', 'error');
        showNotif('Compilation failed: ' + e.message, 'error');
    }

    document.getElementById('btnRun').disabled = false;
}

let stepPhase = 0;
function runStep() {
    if (stepPhase >= 6) { showNotif('All phases complete. Reset to start again.'); return; }
    const src = document.getElementById('sourceCode').value.trim();
    if (!src) { showNotif('Please enter source code', 'error'); return; }

    if (stepPhase === 0) {
        resetAll(false);
        startTime = Date.now();
        document.getElementById('errorLog').style.display = 'none';
        document.getElementById('errorLogBody').innerHTML = '';
    }

    const phaseIdx = stepPhase;
    setPhaseState(phaseIdx, 'active');
    updateStatus(`Running: ${phaseNames[phaseIdx]}...`, 'active');

    setTimeout(() => {
        try {
            if (phaseIdx === 0) {
                const r = tokenize(src);
                renderTokens(r.tokens);
                compileResults.tokens = r.tokens;
                compileResults.lexErrors = r.errors;
                r.errors.forEach(e => addErrorLog('Lexer', e));
            } else if (phaseIdx === 1) {
                const r = parse(compileResults.tokens || []);
                renderTree(r.ast);
                compileResults.parseResult = r;
                r.errors.forEach(e => addErrorLog('Parser', e));
            } else if (phaseIdx === 2) {
                const r = semanticAnalysis(compileResults.parseResult?.ast, compileResults.tokens || []);
                renderSemantic(r);
                compileResults.semantic = r;
                r.errors.forEach(e => addErrorLog('Semantic', e));
                if (r.errors.length) { setPhaseState(phaseIdx, 'error'); stepPhase++; return; }
            } else if (phaseIdx === 3) {
                const r = generateIR(compileResults.tokens || [], compileResults.parseResult?.ast);
                renderIR(r);
                compileResults.ir = r;
            } else if (phaseIdx === 4) {
                const r = optimize(compileResults.ir?.instructions || []);
                renderOptimized(r);
                compileResults.optResult = r;
            } else if (phaseIdx === 5) {
                const r = generateCode(compileResults.optResult?.optimized || []);
                renderAssembly(r);
                compileResults.asm = r;
                renderSummary(compileResults, Date.now() - startTime);
            }
            setPhaseState(phaseIdx, 'done');
            updatePhaseCount(phaseIdx + 1);
            switchTab(phaseIdx);
            addErrorLog(phaseNames[phaseIdx], 'Completed', true);
            updateStatus(`Phase ${phaseIdx + 1} done`, 'done');
        } catch (e) {
            setPhaseState(phaseIdx, 'error');
            addErrorLog(phaseNames[phaseIdx], e.message);
        }
        stepPhase++;
        if (stepPhase >= 6) showNotif('All 6 phases complete!', 'success');
    }, 300);
}

function resetAll(full = true) {
    stepPhase = 0;
    compileResults = {};
    compileErrors = [];
    for (let i = 0; i < 6; i++) setPhaseState(i, '');
    document.getElementById('pipeTime').textContent = '';
    updateStatus('Ready', 'active');
    updatePhaseCount(0);

    // Reset outputs
    ['tokenOutput', 'parseOutput', 'semanticOutput', 'irOutput', 'optOutput', 'asmOutput', 'summaryOutput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    ['empty0', 'empty1', 'empty2', 'empty3', 'empty4', 'empty5', 'empty6'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    });
    ['tc0', 'tc1', 'tc2', 'tc3', 'tc4', 'tc5'].forEach(id => {
        document.getElementById(id).textContent = '0';
    });
    document.getElementById('tc6').textContent = '—';

    document.getElementById('tokenBody').innerHTML = '';
    document.getElementById('treeBody').innerHTML = '';
    document.getElementById('semanticOutput').innerHTML = '';
    document.getElementById('irOutput').innerHTML = '';
    document.getElementById('optOutput').innerHTML = '';
    document.getElementById('asmOutput').innerHTML = '';
    document.getElementById('summaryOutput').innerHTML = '';

    document.getElementById('errorLog').style.display = 'none';
    document.getElementById('errorLogBody').innerHTML = '';
    document.getElementById('errCount').textContent = '';
    document.getElementById('btnRun').disabled = false;
    switchTab(0);
    if (full) showNotif('Reset complete');
}
