document.addEventListener('DOMContentLoaded', function () {

    // ── DOM refs ──────────────────────────────────────────────────
    const runBtn      = document.getElementById('run-btn');
    const clearBtn    = document.getElementById('clear-btn');
    const copyBtn     = document.getElementById('copy-btn');
    const saveBtn     = document.getElementById('save-btn');
    const clearOutBtn = document.getElementById('clear-output-btn');
    const outputEl    = document.getElementById('output');
    const errorEl     = document.getElementById('error-output');
    const placeholder = document.getElementById('placeholder');
    const inputArea   = document.getElementById('input-prompt-area');
    const statusLabel = document.getElementById('status-label');

    // ── Editor setup ──────────────────────────────────────────────
    const editor = CodeMirror.fromTextArea(document.getElementById('code'), {
        lineNumbers:       true,
        mode:              'python',
        theme:             'dracula',
        indentUnit:        4,
        smartIndent:       true,
        matchBrackets:     true,
        autoCloseBrackets: true,
        lineWrapping:      true,
        extraKeys: {
            'Ctrl-Enter': () => compileCode(),
            'Cmd-Enter':  () => compileCode(),
        }
    });

    editor.setValue("# Press Ctrl+Enter or click Run\nprint('Hello, World!')");

    // ── Status helper ─────────────────────────────────────────────
    function setStatus(state, text) {
        statusLabel.className = 'status-label status-' + state;
        statusLabel.innerHTML = state === 'running'
            ? `<span class="spinner"></span>${text}`
            : `● ${text}`;
    }

    // ── Output helpers ────────────────────────────────────────────
    function showOutput(stdout, stderr) {
        placeholder.classList.add('hidden');
        inputArea.classList.add('hidden');
        inputArea.innerHTML = '';

        if (stdout) {
            outputEl.textContent = stdout;
            outputEl.classList.remove('hidden');
        } else {
            outputEl.classList.add('hidden');
        }

        if (stderr) {
            errorEl.textContent = stderr;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.classList.add('hidden');
        }
    }

    function resetOutput() {
        outputEl.classList.add('hidden');
        errorEl.classList.add('hidden');
        inputArea.classList.add('hidden');
        placeholder.classList.remove('hidden');
        outputEl.textContent = '';
        errorEl.textContent  = '';
        inputArea.innerHTML  = '';
        setStatus('idle', 'ready');
    }

    // ── Pyodide runtime load ──────────────────────────────────────
    let pyodide = null;

    async function loadPyodideRuntime() {
        runBtn.disabled = true;
        runBtn.classList.add('running');
        runBtn.innerHTML = '<span class="spinner"></span> Loading…';
        setStatus('running', 'loading Python runtime…');
        try {
            pyodide = await loadPyodide({
                indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/'
            });
            // Bootstrap micropip so we can install PyPI packages later
            await pyodide.loadPackage('micropip');
            setStatus('idle', 'ready');
        } catch (err) {
            setStatus('error', 'failed to load runtime');
            showOutput('', `Failed to load Python runtime: ${err.message}`);
        } finally {
            runBtn.disabled = false;
            runBtn.classList.remove('running');
            runBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run';
        }
    }

    loadPyodideRuntime();

    // ── Package resolution ────────────────────────────────────────
    // Packages built into Pyodide — loaded via pyodide.loadPackage() (fast, no network install)
    const PYODIDE_PACKAGES = new Set([
        'numpy', 'pandas', 'matplotlib', 'scipy', 'scikit-learn', 'sklearn',
        'sympy', 'networkx', 'pillow', 'PIL', 'lxml', 'beautifulsoup4', 'bs4',
        'requests', 'cryptography', 'regex', 'pytz', 'pydantic', 'attrs',
        'hypothesis', 'sqlite3', 'openpyxl', 'pytest', 'jinja2',
        'pygments', 'six', 'dateutil', 'packaging', 'toolz', 'cytoolz',
        'statsmodels', 'patsy', 'joblib', 'threadpoolctl', 'xarray',
        'pyyaml', 'yaml', 'toml', 'ujson', 'msgpack',
    ]);

    // Map import names → install names where they differ
    const PACKAGE_NAME_MAP = {
        'sklearn':         'scikit-learn',
        'PIL':             'pillow',
        'bs4':             'beautifulsoup4',
        'yaml':            'pyyaml',
        'dateutil':        'python-dateutil',
        'cv2':             'opencv-python',
        'Image':           'pillow',
    };

    // Stdlib modules — never try to install these
    const STDLIB = new Set([
        'abc', 'ast', 'asyncio', 'base64', 'binascii', 'builtins', 'calendar',
        'cmath', 'codecs', 'collections', 'contextlib', 'copy', 'csv',
        'dataclasses', 'datetime', 'decimal', 'difflib', 'enum', 'errno',
        'fractions', 'functools', 'gc', 'glob', 'hashlib', 'heapq', 'hmac',
        'html', 'http', 'inspect', 'io', 'itertools', 'json', 'logging',
        'math', 'operator', 'os', 'pathlib', 'pickle', 'platform', 'pprint',
        'queue', 'random', 're', 'shutil', 'signal', 'socket', 'sqlite3',
        'statistics', 'string', 'struct', 'subprocess', 'sys', 'tempfile',
        'textwrap', 'threading', 'time', 'timeit', 'traceback', 'types',
        'typing', 'unicodedata', 'unittest', 'urllib', 'uuid', 'warnings',
        'weakref', 'xml', 'xmlrpc', 'zipfile', 'zlib', '_thread',
    ]);

    // Extract top-level import names from code
    function extractImports(code) {
        const imports = new Set();
        const patterns = [
            /^import\s+([\w]+)/gm,               // import numpy
            /^import\s+([\w]+)\s+as\s+\w+/gm,    // import numpy as np
            /^from\s+([\w]+)\s+import/gm,         // from pandas import ...
        ];
        for (const re of patterns) {
            let m;
            while ((m = re.exec(code)) !== null) {
                imports.add(m[1]);
            }
        }
        return imports;
    }

    // Install all third-party packages detected in the code
    async function installPackages(code) {
        const imports = extractImports(code);
        const toInstall = [];

        for (const name of imports) {
            if (STDLIB.has(name)) continue;           // skip stdlib
            if (name.startsWith('_')) continue;       // skip private/internal

            const installName = PACKAGE_NAME_MAP[name] || name;

            // Check if already loaded in this session
            try {
                await pyodide.runPythonAsync(`import ${name}`);
                continue; // already available, skip
            } catch (_) {}

            toInstall.push({ importName: name, installName });
        }

        if (toInstall.length === 0) return;

        for (const pkg of toInstall) {
            setStatus('running', `installing ${pkg.installName}…`);
            try {
                if (PYODIDE_PACKAGES.has(pkg.importName) || PYODIDE_PACKAGES.has(pkg.installName)) {
                    // Use Pyodide's prebuilt wheels (faster)
                    await pyodide.loadPackage(pkg.installName);
                } else {
                    // Fall back to micropip for pure-Python PyPI packages
                    const micropip = pyodide.pyimport('micropip');
                    await micropip.install(pkg.installName);
                }
            } catch (err) {
                // Non-fatal: let Python itself throw the ImportError with a clear message
                console.warn(`Could not install ${pkg.installName}:`, err.message);
            }
        }
    }

    // ── Code execution ────────────────────────────────────────────
    async function executeCode(code) {
        setStatus('running', 'running…');
        runBtn.classList.add('running');
        runBtn.disabled = true;

        try {
            // Auto-install any imported packages before running
            await installPackages(code);

            setStatus('running', 'running…');

            await pyodide.runPythonAsync(`
import sys, io, builtins

_captured_stdout = io.StringIO()
_captured_stderr = io.StringIO()
sys.stdout = _captured_stdout
sys.stderr = _captured_stderr

def _js_input(prompt=''):
    import js
    result = js.prompt(str(prompt))
    if result is None:
        result = ''
    sys.stdout.write(str(prompt) + str(result) + '\\n')
    return result

builtins.input = _js_input
`);

            await pyodide.runPythonAsync(code);

            const stdout = pyodide.globals.get('_captured_stdout').getvalue();
            const stderr = pyodide.globals.get('_captured_stderr').getvalue();

            showOutput(stdout || (stderr ? '' : '(no output)'), stderr);
            setStatus(stderr ? 'error' : 'success', stderr ? 'error' : 'done');

        } catch (err) {
            showOutput('', err.message || String(err));
            setStatus('error', 'error');
        } finally {
            try {
                await pyodide.runPythonAsync(`
import sys, builtins
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
builtins.input = input
`);
            } catch (_) {}
            runBtn.classList.remove('running');
            runBtn.disabled = false;
        }
    }

    // ── Main compile handler ──────────────────────────────────────
    function compileCode() {
        const code = editor.getValue().trim();
        if (!code) return;
        executeCode(code);
    }

    // ── Button listeners ──────────────────────────────────────────
    runBtn.addEventListener('click', compileCode);

    clearBtn.addEventListener('click', () => {
        editor.setValue('');
        editor.focus();
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(editor.getValue()).then(() => {
            copyBtn.title = 'Copied!';
            setTimeout(() => (copyBtn.title = 'Copy code'), 1500);
        });
    });

    saveBtn.addEventListener('click', () => {
        const stdout  = outputEl.textContent;
        const stderr  = errorEl.textContent;
        const content = [stdout, stderr].filter(Boolean).join('\n\n--- stderr ---\n\n');
        if (!content) return;
        const blob = new Blob([content], { type: 'text/plain' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = 'output.txt';
        a.click();
        URL.revokeObjectURL(a.href);
    });

    clearOutBtn.addEventListener('click', resetOutput);

});
