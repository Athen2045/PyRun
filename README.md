# PyRun — Online Python Compiler

> A zero-install, browser-native Python compiler powered by WebAssembly. Write, run, and experiment with Python entirely in your browser — no server, no setup, no limits.

&nbsp;

## Demo:

**[https://pythoncomplier.netlify.app/](https://pythoncomplier.netlify.app/)**

&nbsp;

## Overview:

PyRun is a client-side Python execution environment built with vanilla HTML, CSS, and JavaScript. It embeds a full Python 3.11 runtime directly in the browser using [Pyodide](https://pyodide.org/) (CPython compiled to WebAssembly), meaning code runs **locally on the user's machine** — no backend, no API keys, no network round-trips after the initial load.

The project started as a simple code-runner and evolved into a feature-complete playground with auto package installation, real-time `input()` handling, stderr/stdout separation, and a professional split-panel IDE layout.

&nbsp;

## Features:

| Feature | Details |
|---|---|
| **In-browser Python runtime** | Full CPython 3.11 via Pyodide + WebAssembly — runs offline after first load |
| **Syntax-highlighted editor** | CodeMirror 6 with the Dracula theme, line numbers, bracket matching, and auto-indent |
| **Keyboard shortcut** | `Ctrl + Enter` / `Cmd + Enter` to run — no mouse needed |
| **Auto package installation** | Detects `import` statements and installs packages via `pyodide.loadPackage()` or `micropip` before execution |
| **Live `input()` support** | Python's `input()` is intercepted and routed to a native browser prompt — works in loops, conditionals, any pattern |
| **Stdout / stderr separation** | Output and tracebacks are displayed distinctly — green for output, red for errors |
| **Save output** | Download execution output as a `.txt` file |
| **Copy code** | One-click copy of the editor contents to clipboard |
| **Status bar** | Real-time feedback: idle → loading runtime → installing packages → running → done/error |
| **Responsive layout** | Split-panel IDE layout that stacks vertically on mobile |

&nbsp;

## Stack Used:

- **HTML5 / CSS3 / Vanilla JavaScript** — no frameworks, no build step
- **[Pyodide v0.27.5](https://pyodide.org/)** — CPython compiled to WebAssembly; runs Python natively in the browser
- **[micropip](https://micropip.pyodide.org/)** — installs pure-Python packages from PyPI at runtime
- **[CodeMirror 6](https://codemirror.net/)** — embedded code editor with Python syntax highlighting
- **[Netlify](https://netlify.com/)** — static site hosting with zero configuration

&nbsp;

## Supported Libraries:

PyRun auto-detects and installs third-party packages before running your code. No `pip install` needed.

**Bundled with Pyodide** *(fast, precompiled wheels)*

`numpy` · `pandas` · `matplotlib` · `scipy` · `scikit-learn` · `sympy` · `networkx` · `Pillow` · `beautifulsoup4` · `requests` · `cryptography` · `statsmodels` · `xarray` · `openpyxl` · `pydantic` · and more

**Via micropip** *(pure-Python PyPI packages)*

Any package without C extensions can be installed on demand — just `import` it and PyRun handles the rest.

> **Note:** Packages with compiled C extensions not built for WASM (e.g. `torch`, `tensorflow`, `opencv-python`) are not supported in the browser environment.

&nbsp;

## How Start:

### Run locally

```bash
# Clone the repository
git clone https://github.com/yourusername/pyrun-compiler.git

# Navigate into the project
cd pyrun-compiler

# Open in your browser — no build step required
open index.html
```

No package manager, no dependencies to install. The project is entirely static.

### Deploy your own

Since PyRun is a pure static site, it can be deployed to any static host:

```bash
# Netlify (drag-and-drop or CLI)
netlify deploy --prod --dir .

# GitHub Pages
# Push to a repo and enable Pages from Settings → Pages → Deploy from branch
```

&nbsp;

## How to Use:

1. **Write** — Type your Python code in the left editor panel
2. **Run** — Click **Run** or press `Ctrl+Enter`
3. **Input** — If your code calls `input()`, a browser prompt will appear for each call
4. **View output** — Results appear in the right panel; errors are highlighted in red
5. **Save** — Click the download icon to save output as `output.txt`

### Example — works out of the box

```python
import numpy as np

arr = np.array([1, 2, 3, 4, 5])
print("Mean:", np.mean(arr))
print("Std: ", np.std(arr))
```

```python
name = input("What's your name? ")
age  = input("How old are you? ")
print(f"Hello {name}, you are {age} years old!")
```

&nbsp;

## Project Structure:

```
pyrun-compiler/
├── index.html      # App shell — layout, toolbar, panels
├── style.css       # Full visual design system (CSS variables, dark theme, responsive)
└── script.js       # All runtime logic — Pyodide init, package resolution, execution, UI
```

&nbsp;

## Customization Options:

**Change the default editor code**

In `script.js`, find and edit the `editor.setValue(...)` line:

```js
editor.setValue("# Your default code here\nprint('Hello, World!')");
```

**Add more known packages to the Pyodide set**

In `script.js`, extend `PYODIDE_PACKAGES`:

```js
const PYODIDE_PACKAGES = new Set([
    'numpy', 'pandas', /* add your package here */
]);
```

**Theme / colors**

All design tokens live in the `:root` block in `style.css`:

```css
:root {
    --accent:  #7c6af5;   /* primary color */
    --green:   #3ddc84;   /* stdout color  */
    --red:     #ff6b6b;   /* stderr color  */
    /* ... */
}
```

&nbsp;

## Known Limitations:

- **Matplotlib plots** — graphical output (`plt.show()`) does not render in the browser canvas; use `print()` based output or save figures to a buffer instead
- **C-extension packages** — libraries like `torch`, `tensorflow`, and `opencv-python` require native compilation and are not supported in the WASM environment
- **File system access** — browser sandboxing means no access to the local file system; `open()` calls work with Pyodide's in-memory virtual filesystem only
- **First load time** — Pyodide's WASM bundle is ~10 MB; subsequent loads are served from cache

&nbsp;

## Contributing

Contributions are welcome! To get started:

```bash
# Fork the repo, then clone your fork
git clone https://github.com/yourusername/pyrun-compiler.git

# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes, then open a pull request
```

Please keep PRs focused — one feature or fix per pull request.

&nbsp;

## License:

This project is open source and available under the [MIT License](LICENSE).

&nbsp;

## Acknowledgments:

- **[Pyodide](https://pyodide.org/)** — for making a full Python runtime possible in the browser
- **[CodeMirror](https://codemirror.net/)** — for the powerful, extensible code editor
- **[micropip](https://micropip.pyodide.org/)** — for enabling PyPI package installs in WASM
- **[Netlify](https://netlify.com/)** — for frictionless static site hosting

&nbsp;

---

<p align="center">Built with 🐍 and WebAssembly · <a href="https://pythoncomplier.netlify.app/">Live Demo</a></p>
