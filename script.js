document.addEventListener('DOMContentLoaded', function () {

    // ── Pyodide setup ─────────────────────────────────────────────
    // Python runs entirely in the browser via WebAssembly — no external API needed.
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

    // ── Status helper ─────────────────────────────────────────────
    function setStatus(state, text) {
        statusLabel.className = 'status-label status-' + state;
        statusLabel.innerHTML = state === 'running'
            ? `<span class="spinner"></span>${text}`
            : `● ${text}`;
    }

    // ── Show/hide output sections ─────────────────────────────────
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

    // ── Pyodide execution ─────────────────────────────────────────
    // Redirects sys.stdout/stderr into JS strings, then restores them.
    // Feeds stdin values via a custom Python input() override.
    async function executeCode(code, stdinValues = []) {
        if (!pyodide) {
            showOutput('', 'Python runtime is still loading. Please wait a moment and try again.');
            return;
        }

        setStatus('running', 'running…');
        runBtn.classList.add('running');

        try {
            let inputIndex = 0;

            // Override Python's input() to pull from our stdinValues array
            pyodide.globals.set('_js_stdin_values', pyodide.toPy(stdinValues));
            pyodide.globals.set('_js_stdin_index', 0);

            const setupCode = `
import sys
import io

_captured_stdout = io.StringIO()
_captured_stderr = io.StringIO()
sys.stdout = _captured_stdout
sys.stderr = _captured_stderr

_stdin_values = list(_js_stdin_values)
_stdin_idx = [0]

def _custom_input(prompt=''):
    if _stdin_idx[0] < len(_stdin_values):
        val = _stdin_values[_stdin_idx[0]]
        _stdin_idx[0] += 1
        sys.stdout.write(str(prompt) + str(val) + '\\n')
        return val
    return ''

import builtins
builtins.input = _custom_input
`;
            await pyodide.runPythonAsync(setupCode);
            await pyodide.runPythonAsync(code);

            const stdout = pyodide.globals.get('_captured_stdout').getvalue();
            const stderr = pyodide.globals.get('_captured_stderr').getvalue();

            showOutput(stdout || (stderr ? '' : '(no output)'), stderr);
            setStatus(stderr ? 'error' : 'success', stderr ? 'error' : 'done');

        } catch (err) {
            // Pyodide surfaces Python tracebacks as JS errors
            const traceback = err.message || String(err);
            showOutput('', traceback);
            setStatus('error', 'error');
        } finally {
            // Always restore real stdout/stderr
            try {
                await pyodide.runPythonAsync(`
import sys, io, builtins
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
builtins.input = input
`);
            } catch (_) {}
            runBtn.classList.remove('running');
        }
    }

    // ── Detect input() calls ──────────────────────────────────────
    function getInputPrompts(code) {
        const re = /input\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
        const prompts = [];
        let m;
        while ((m = re.exec(code)) !== null) {
            prompts.push(m[1] || '');
        }
        return prompts;
    }

    // ── Input prompt UI ───────────────────────────────────────────
    function buildInputUI(prompts) {
        placeholder.classList.add('hidden');
        outputEl.classList.add('hidden');
        errorEl.classList.add('hidden');
        inputArea.classList.remove('hidden');
        inputArea.innerHTML = '';

        const heading = document.createElement('p');
        heading.className = 'input-prompt-heading';
        heading.textContent = 'Input required';
        inputArea.appendChild(heading);

        const fields = [];
        prompts.forEach((prompt, i) => {
            const group = document.createElement('div');
            group.className = 'input-group';

            const label = document.createElement('label');
            label.setAttribute('for', `user-input-${i}`);
            label.textContent = prompt || `input ${i + 1}`;

            const input = document.createElement('input');
            input.type        = 'text';
            input.id          = `user-input-${i}`;
            input.className   = 'user-input';
            input.placeholder = 'Enter value…';

            group.appendChild(label);
            group.appendChild(input);
            inputArea.appendChild(group);
            fields.push(input);
        });

        const submitBtn = document.createElement('button');
        submitBtn.className   = 'submit-inputs-btn';
        submitBtn.textContent = 'Submit & Run';
        inputArea.appendChild(submitBtn);

        if (fields[0]) fields[0].focus();

        submitBtn.addEventListener('click', () => {
            const values = fields.map(f => f.value);
            executeCode(editor.getValue(), values);
        });

        if (fields.length > 0) {
            fields[fields.length - 1].addEventListener('keydown', e => {
                if (e.key === 'Enter') submitBtn.click();
            });
        }
    }

    // ── Main compile handler ──────────────────────────────────────
    function compileCode() {
        const code = editor.getValue().trim();
        if (!code) return;

        const prompts = getInputPrompts(code);
        if (prompts.length > 0) {
            buildInputUI(prompts);
            setStatus('idle', 'waiting for input');
        } else {
            executeCode(code);
        }
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
