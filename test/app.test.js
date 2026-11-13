const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
function makeFile(name, content = "") {
  const handle = {
    kind: "file",
    name,
    _content: content,
    lastModified: Date.now(),
    async getFile() {
      let value = this._content;
      return {
        name: this.name,
        size: Buffer.byteLength(value),
        lastModified: this.lastModified,
        text: async () => value,
      };
    },
    async createWritable() {
      let value = "";
      return {
        write: async (x) => {
          value =
            typeof x === "string"
              ? x
              : x && typeof x.text === "function"
                ? await x.text()
                : String(x);
        },
        close: async () => {
          handle._content = value;
          handle.lastModified = Date.now();
        },
      };
    },
  };
  return handle;
}
function makeDirectory(name, children = []) {
  const handle = {
    kind: "directory",
    name,
    _entries: new Map(children.map((x) => [x.name, x])),
    async *entries() {
      yield* handle._entries.entries();
    },
    async getFileHandle(child, options = {}) {
      let found = handle._entries.get(child);
      if (found && found.kind !== "file")
        throw Object.assign(new Error("Not a file"), {
          name: "TypeMismatchError",
        });
      if (!found && options.create) {
        found = makeFile(child);
        handle._entries.set(child, found);
      }
      if (!found)
        throw Object.assign(new Error("Not found"), { name: "NotFoundError" });
      return found;
    },
    async getDirectoryHandle(child, options = {}) {
      let found = handle._entries.get(child);
      if (found && found.kind !== "directory")
        throw Object.assign(new Error("Not a directory"), {
          name: "TypeMismatchError",
        });
      if (!found && options.create) {
        found = makeDirectory(child);
        handle._entries.set(child, found);
      }
      if (!found)
        throw Object.assign(new Error("Not found"), { name: "NotFoundError" });
      return found;
    },
  };
  return handle;
}
async function setup() {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, "index.html"), "utf8"),
    {
      url: "http://localhost/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    },
  );
  const { window } = dom;
  const hello = makeFile("hello.txt", "original text"),
    nested = makeDirectory("Subfolder", [makeFile("inside.md", "# nested")]),
    directory = makeDirectory("TestRoot", [
      hello,
      nested,
      makeFile("<unsafe>.txt", "safe text"),
    ]);
  window.showDirectoryPicker = async () => directory;
  window.showOpenFilePicker = async () => [makeFile("import.txt", "imported")];
  window.showSaveFilePicker = async () => makeFile("saved.txt", "");
  window.confirm = () => true;
  window.prompt = (label, initial) => initial || "Created.txt";
  const opened = [];
  window.open = (...args) => {
    let tab = { opener: {} };
    opened.push({ args, tab });
    return tab;
  };
  window.eval(fs.readFileSync(path.join(root, "app.js"), "utf8"));
  return { dom, window, directory, hello, nested, opened };
}
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function openExplorer(window) {
  window.document.querySelector('.desktop-icon[data-app="explorer"]').click();
  await wait();
  return window.document.querySelector('.app-window[data-app="explorer"]');
}

test("desktop contains no fabricated catalogue and discloses its browser boundary", async () => {
  const { dom, window } = await setup();
  try {
    assert.match(window.document.title, /Рабочий стол/);
    assert.doesNotMatch(
      window.document.body.textContent,
      /184 ГБ свободно|Переменная облачность|Microsoft Store|Корзина/,
    );
    assert.match(
      window.document.body.textContent,
      /Доступ к файлам выдаётся вами|Данные остаются на вашем устройстве/,
    );
  } finally {
    dom.window.close();
  }
});
test("folder picker lists granted entries, navigates, and handles cancel safely", async () => {
  const { dom, window, nested } = await setup();
  try {
    const win = await openExplorer(window);
    assert.match(win.querySelector("#fileList").textContent, /Выберите папку/);
    win.querySelector('[data-fs="choose"]').click();
    await wait(30);
    assert.match(win.querySelector("#explorerPath").textContent, /TestRoot/);
    assert.deepEqual(
      [...win.querySelectorAll(".file-row .entry-name b")].map(
        (e) => e.textContent,
      ),
      ["Subfolder", "<unsafe>.txt", "hello.txt"],
    );
    assert.equal(
      win.querySelector("#fileList img"),
      null,
      "file names are inserted as text, not HTML",
    );
    const rows = [...win.querySelectorAll(".file-row")];
    rows[0].dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    await wait();
    assert.equal(win.querySelector(".file-row.selected")?.dataset.entry, "0");
    assert.equal(
      window.document.querySelector('.app-window[data-app="notes"]'),
      null,
      "single click selects but does not open",
    );
    rows[0].dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
    await wait(30);
    assert.match(win.querySelector("#explorerPath").textContent, /Subfolder/);
    assert.ok(nested._entries.has("inside.md"));
    window.showDirectoryPicker = async () => {
      throw Object.assign(new Error("cancel"), { name: "AbortError" });
    };
    win.querySelector('[data-fs="choose"]').click();
    await wait(20);
    assert.match(
      win.querySelector("#explorerPath").textContent,
      /Subfolder/,
      "cancel leaves current folder unchanged",
    );
    win.querySelector('[data-fs="up"]').click();
    await wait(20);
    assert.match(win.querySelector("#explorerPath").textContent, /TestRoot/);
  } finally {
    dom.window.close();
  }
});
test("text files open for real editing and autosave to the selected handle", async () => {
  const { dom, window, hello } = await setup();
  try {
    const win = await openExplorer(window);
    win.querySelector('[data-fs="choose"]').click();
    await wait(30);
    const row = [...win.querySelectorAll(".file-row")].find((x) =>
      x.textContent.includes("hello.txt"),
    );
    row.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
    await wait(30);
    const editor = window.document.querySelector(
      '.app-window[data-app="notes"] .notes-editor',
    );
    assert.equal(editor.value, "original text");
    editor.value = "saved from test";
    editor.dispatchEvent(new window.Event("input", { bubbles: true }));
    await wait(800);
    assert.equal(hello._content, "saved from test");
    assert.equal(
      window.localStorage.getItem("local-desktop-draft"),
      null,
      "opened file content is not copied into browser draft storage",
    );
    assert.match(
      window.document.querySelector("#noteFileLabel").textContent,
      /hello.txt/,
    );
  } finally {
    dom.window.close();
  }
});
test("file creation, folder creation, and import affect only the selected directory", async () => {
  const { dom, window, directory } = await setup();
  try {
    const win = await openExplorer(window);
    win.querySelector('[data-fs="choose"]').click();
    await wait(30);
    window.prompt = (label, initial) =>
      label.includes("файл") ? "created.txt" : "CreatedFolder";
    win.querySelector('[data-fs="newfile"]').click();
    await wait(30);
    assert.equal((await directory.getFileHandle("created.txt"))._content, "");
    win.querySelector('[data-fs="newfolder"]').click();
    await wait(30);
    assert.equal(
      (await directory.getDirectoryHandle("CreatedFolder")).kind,
      "directory",
    );
    win.querySelector('[data-fs="import"]').click();
    await wait(30);
    assert.equal(
      (await directory.getFileHandle("import.txt"))._content,
      "imported",
    );
  } finally {
    dom.window.close();
  }
});
test("existing file is preserved unless overwrite is confirmed", async () => {
  const { dom, window, hello } = await setup();
  try {
    const win = await openExplorer(window);
    win.querySelector('[data-fs="choose"]').click();
    await wait(30);
    window.prompt = () => "hello.txt";
    window.confirm = () => false;
    win.querySelector('[data-fs="newfile"]').click();
    await wait(30);
    assert.equal(hello._content, "original text");
  } finally {
    dom.window.close();
  }
});
test("calculator computes and clears arithmetic results", async () => {
  const { dom, window } = await setup();
  try {
    window.document.querySelector('.pinned-app[data-app="calculator"]').click();
    const win = window.document.querySelector(
      '.app-window[data-app="calculator"]',
    );
    for (const key of ["2", "＋", "3", "="])
      win.querySelector(`[data-calc="${key}"]`).click();
    assert.equal(win.querySelector(".calc-display").textContent, "5");
    win.querySelector('[data-calc="C"]').click();
    assert.equal(win.querySelector(".calc-display").textContent, "0");
  } finally {
    dom.window.close();
  }
});
test("notes draft persists locally and internet shortcut opens an external website", async () => {
  const { dom, window, opened } = await setup();
  try {
    window.document.querySelector('.pinned-app[data-app="notes"]').click();
    const editor = window.document.querySelector(".notes-editor");
    editor.value = "local draft";
    editor.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.equal(
      window.localStorage.getItem("local-desktop-draft"),
      "local draft",
    );
    window.document.querySelector('[data-action="internet"]').click();
    assert.equal(opened[0].args[0], "https://www.google.com");
    assert.equal(opened[0].args[1], "_blank");
    assert.equal(opened[0].tab.opener, null);
  } finally {
    dom.window.close();
  }
});
test("diagnostics use browser-reported values and no fabricated capacity", async () => {
  const { dom, window } = await setup();
  try {
    window.document.querySelector('.pinned-app[data-app="settings"]').click();
    const text = window.document.querySelector("#systemFacts").textContent;
    assert.ok(text.includes(window.navigator.language));
    assert.ok(text.includes(Intl.DateTimeFormat().resolvedOptions().timeZone));
    assert.doesNotMatch(text, /184 ГБ|256 ГБ|Administrator|100%/);
  } finally {
    dom.window.close();
  }
});
test("unsupported file APIs fail clearly instead of showing pretend contents", async () => {
  const { dom, window } = await setup();
  try {
    delete window.showDirectoryPicker;
    const win = await openExplorer(window);
    win.querySelector('[data-fs="choose"]').click();
    await wait(20);
    assert.match(
      window.document.querySelector("#toast").textContent,
      /поддерживается/,
    );
    assert.match(win.querySelector("#explorerPath").textContent, /не выбрана/);
  } finally {
    dom.window.close();
  }
});
test("unsafe path-like names are rejected before filesystem writes", async () => {
  const { dom, window, directory } = await setup();
  try {
    const win = await openExplorer(window);
    win.querySelector('[data-fs="choose"]').click();
    await wait(30);
    window.prompt = () => "../escape.txt";
    win.querySelector('[data-fs="newfile"]').click();
    await wait(20);
    assert.equal(directory._entries.has("../escape.txt"), false);
    assert.match(
      window.document.querySelector("#toast").textContent,
      /без символов/,
    );
  } finally {
    dom.window.close();
  }
});
test("import preserves an existing file when overwrite is declined", async () => {
  const { dom, window, hello } = await setup();
  try {
    const win = await openExplorer(window);
    win.querySelector('[data-fs="choose"]').click();
    await wait(30);
    window.showOpenFilePicker = async () => [
      makeFile("hello.txt", "replacement"),
    ];
    window.confirm = () => false;
    win.querySelector('[data-fs="import"]').click();
    await wait(30);
    assert.equal(hello._content, "original text");
  } finally {
    dom.window.close();
  }
});
test("calculator reports division by zero as an error", async () => {
  const { dom, window } = await setup();
  try {
    window.document.querySelector('.pinned-app[data-app="calculator"]').click();
    let w = window.document.querySelector('.app-window[data-app="calculator"]');
    for (const key of ["8", "÷", "0", "="])
      w.querySelector(`[data-calc="${key}"]`).click();
    assert.equal(w.querySelector(".calc-display").textContent, "Ошибка");
  } finally {
    dom.window.close();
  }
});
test("window controls minimize, restore from taskbar, and close", async () => {
  const { dom, window } = await setup();
  try {
    window.document.querySelector('.pinned-app[data-app="calculator"]').click();
    let win = window.document.querySelector(
      '.app-window[data-app="calculator"]',
    );
    win.querySelector('[data-window="minimize"]').click();
    assert.equal(win.style.display, "none");
    window.document.querySelector('[data-running="calculator"]').click();
    assert.equal(win.style.display, "flex");
    win.querySelector('[data-window="close"]').click();
    assert.equal(
      window.document.querySelector('.app-window[data-app="calculator"]'),
      null,
    );
  } finally {
    dom.window.close();
  }
});

test("desktop and core application views pass automated WCAG A/AA accessibility rules", async () => {
  const axe = require("axe-core");
  const { dom, window } = await setup();
  try {
    window.HTMLCanvasElement.prototype.getContext = () => null;
    window.eval(axe.source);
    const violations = [];
    const auditView = async (name) => {
      const results = await window.axe.run(window.document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
        rules: { "color-contrast": { enabled: false } },
      });
      violations.push(
        ...results.violations.map((v) => ({
          app: name,
          id: v.id,
          help: v.help,
          nodes: v.nodes.map((n) => n.target),
        })),
      );
    };
    await auditView("desktop");
    for (const [name, button] of [
      ["start menu", "#startButton"],
      ["search panel", "#searchButton"],
      ["calendar panel", "#clockButton"],
      ["quick settings", "#quickButton"],
    ]) {
      window.document.querySelector(button).click();
      await wait(10);
      await auditView(name);
      window.document.querySelector(button).click();
    }
    for (const app of ["explorer", "notes", "calculator", "settings"]) {
      window.document.querySelector(`[data-app="${app}"]`).click();
      await wait(25);
      await auditView(app);
      window.document
        .querySelector(`.app-window[data-app="${app}"] [data-window="close"]`)
        .click();
    }
    assert.equal(violations.length, 0, JSON.stringify(violations));
  } finally {
    dom.window.close();
  }
});

test("key muted text meets WCAG AA contrast against white application surfaces", async () => {
  const { dom, window } = await setup();
  const luminance = (rgb) => {
    const channels = rgb
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  try {
    window.document.querySelector('[data-app="settings"]').click();
    const win = window.document.querySelector(
      '.app-window[data-app="settings"]',
    );
    const nodes = [
      win.querySelector(".settings-main > p"),
      ...win.querySelectorAll(".fact-row > span"),
    ];
    for (const node of nodes) {
      const contrast =
        1.05 / (luminance(window.getComputedStyle(node).color) + 0.05);
      assert.ok(
        contrast >= 4.5,
        `${node.textContent}: contrast ${contrast.toFixed(2)}:1`,
      );
    }
  } finally {
    dom.window.close();
  }
});

test("active SVG and document files download rather than execute as new pages", async () => {
  const { dom, window, directory, opened } = await setup();
  const downloads = [];
  try {
    directory._entries.set(
      "payload.svg",
      makeFile("payload.svg", "<svg><script>bad()</script></svg>"),
    );
    window.URL.createObjectURL = (file) => `blob:local/${file.name}`;
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {
      downloads.push({ href: this.href, name: this.download });
    };
    const win = await openExplorer(window);
    win.querySelector('[data-fs="choose"]').click();
    await wait(30);
    const row = [...win.querySelectorAll(".file-row")].find((r) =>
      r.textContent.includes("payload.svg"),
    );
    row.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
    await wait(20);
    assert.equal(
      opened.length,
      0,
      "untrusted active document is never opened as a page",
    );
    assert.equal(downloads[0].name, "payload.svg");
  } finally {
    dom.window.close();
  }
});

test("raster images use a real browser preview and detach their opener", async () => {
  const { dom, window, directory, opened } = await setup();
  try {
    directory._entries.set("photo.png", makeFile("photo.png", "image bytes"));
    window.URL.createObjectURL = (file) => `blob:local/${file.name}`;
    window.URL.revokeObjectURL = () => {};
    const win = await openExplorer(window);
    win.querySelector('[data-fs="choose"]').click();
    await wait(30);
    const row = [...win.querySelectorAll(".file-row")].find((r) =>
      r.textContent.includes("photo.png"),
    );
    row.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
    await wait(20);
    assert.equal(opened[0].args[0], "blob:local/photo.png");
    assert.equal(opened[0].tab.opener, null);
  } finally {
    dom.window.close();
  }
});

test("Notepad New flushes the current file before detaching a new draft", async () => {
  const { dom, window, hello } = await setup();
  try {
    const explorer = await openExplorer(window);
    explorer.querySelector('[data-fs="choose"]').click();
    await wait(30);
    const row = [...explorer.querySelectorAll(".file-row")].find((r) =>
      r.textContent.includes("hello.txt"),
    );
    row.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
    await wait(25);
    const notes = window.document.querySelector(
      '.app-window[data-app="notes"]',
    );
    const editor = notes.querySelector(".notes-editor");
    editor.value = "last edit to selected file";
    editor.dispatchEvent(new window.Event("input", { bubbles: true }));
    notes.querySelector('[data-note="new"]').click();
    await wait(30);
    assert.equal(hello._content, "last edit to selected file");
    assert.equal(editor.value, "");
    editor.value = "new local draft";
    editor.dispatchEvent(new window.Event("input", { bubbles: true }));
    await wait(800);
    assert.equal(
      hello._content,
      "last edit to selected file",
      "new draft must not keep writing to the previous file",
    );
    assert.equal(
      window.localStorage.getItem("local-desktop-draft"),
      "new local draft",
    );
  } finally {
    dom.window.close();
  }
});

test("calendar highlights the device's actual local date", async () => {
  const { dom, window } = await setup();
  try {
    window.document.querySelector("#clockButton").click();
    const today = window.document.querySelector("#calendarGrid .today");
    assert.ok(today);
    assert.equal(Number(today.textContent), new Date().getDate());
  } finally {
    dom.window.close();
  }
});

test("start search finds an actual file in the currently selected folder", async () => {
  const { dom, window } = await setup();
  try {
    const explorer = await openExplorer(window);
    explorer.querySelector('[data-fs="choose"]').click();
    await wait(30);
    window.document.querySelector("#startButton").click();
    const input = window.document.querySelector("#startSearch");
    input.value = "hello.txt";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await wait(25);
    const result = window.document.querySelector(
      "#startResults [data-searchfile]",
    );
    assert.equal(result?.dataset.searchfile, "hello.txt");
    result.click();
    await wait(30);
    assert.equal(
      window.document.querySelector(
        '.app-window[data-app="notes"] .notes-editor',
      ).value,
      "original text",
    );
  } finally {
    dom.window.close();
  }
});

test("Notepad open and save dialogs read and persist the selected file handle", async () => {
  const { dom, window } = await setup();
  const source = makeFile("dialog.txt", "dialog source");
  const destination = makeFile("saved.txt", "");
  try {
    window.showOpenFilePicker = async () => [source];
    window.showSaveFilePicker = async () => destination;
    window.document.querySelector('[data-app="notes"]').click();
    const win = window.document.querySelector('.app-window[data-app="notes"]');
    win.querySelector('[data-note="open"]').click();
    await wait(20);
    const editor = win.querySelector(".notes-editor");
    assert.equal(editor.value, "dialog source");
    editor.value = "dialog saved text";
    editor.dispatchEvent(new window.Event("input", { bubbles: true }));
    await wait(750);
    assert.equal(source._content, "dialog saved text");
    win.querySelector('[data-note="saveas"]').click();
    await wait(30);
    assert.equal(destination._content, "dialog saved text");
    assert.match(win.querySelector("#noteFileLabel").textContent, /saved.txt/);
  } finally {
    dom.window.close();
  }
});
