document.addEventListener('DOMContentLoaded', function () {

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
    const runBtn        = document.getElementById('run-btn');
    const clearBtn      = document.getElementById('clear-btn');
    const copyBtn       = document.getElementById('copy-btn');
    const saveBtn       = document.getElementById('save-btn');
    const clearOutBtn   = document.getElementById('clear-output-btn');
    const outputEl      = document.getElementById('output');
    const errorEl       = document.getElementById('error-output');
    const placeholder   = document.getElementById('placeholder');
    const inputArea     = document.getElementById('input-prompt-area');
    const statusLabel   = document.getElementById('status-label');

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
        setStatus('idle', 'idle');
    }

    // ── Piston API execution ──────────────────────────────────────
    async function executeCode(code, stdinValue = '') {
        setStatus('running', 'running…');
        runBtn.classList.add('running');

        try {
            const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: 'python',
                    version:  '3.10.0',
                    files:    [{ content: code }],
                    stdin:    stdinValue
                })
            });

            if (!response.ok) throw new Error(`API error ${response.status}`);

            const result = await response.json();
            const stdout = result.run.stdout || '';
            const stderr = result.run.stderr || '';

            showOutput(stdout || (stderr ? '' : '(no output)'), stderr);
            setStatus(stderr ? 'error' : 'success', stderr ? 'error' : `done`);

        } catch (err) {
            showOutput('', `Network error: ${err.message}`);
            setStatus('error', 'error');
        } finally {
            runBtn.classList.remove('running');
        }
    }

    // ── Input detection & prompt UI ───────────────────────────────
    //  Uses the Piston `stdin` field — feeds a newline-separated string
    //  so real Python input() works correctly (no source rewriting).
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
        submitBtn.className = 'submit-inputs-btn';
        submitBtn.textContent = 'Submit & Run';
        inputArea.appendChild(submitBtn);

        // Focus first input for usability
        if (fields[0]) fields[0].focus();

        submitBtn.addEventListener('click', () => {
            const stdin = fields.map(f => f.value).join('\n');
            executeCode(editor.getValue(), stdin);
        });

        // Allow Enter key on last input to submit
        if (fields.length > 0) {
            fields[fields.length - 1].addEventListener('keydown', e => {
                if (e.key === 'Enter') submitBtn.click();
            });
        }
    }

    // ── Detect input() calls (labels only, no source surgery) ─────
    function getInputPrompts(code) {
        const re = /input\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
        const prompts = [];
        let m;
        while ((m = re.exec(code)) !== null) {
            prompts.push(m[1] || '');
        }
        return prompts;
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
        const stdout = outputEl.textContent;
        const stderr = errorEl.textContent;
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
