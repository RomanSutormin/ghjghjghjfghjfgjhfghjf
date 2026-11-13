const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const windowsRoot = $("#windows");
const appMeta = {
  explorer: ["Файлы", "📁"],
  notes: ["Блокнот", "📝"],
  calculator: ["Калькулятор", "＋"],
  settings: ["Сведения об устройстве", "ⓘ"],
};
let zIndex = 20,
  cascade = 0,
  monthCursor = new Date(),
  dirStack = [],
  appInstances = new Map();
const currentDir = () => dirStack.at(-1) || null;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3200);
}
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function humanSize(n) {
  if (n < 1024) return `${n} Б`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1048576).toFixed(1)} МБ`;
}
function fileIcon(name) {
  let x = name.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(x)) return "🖼️";
  if (["mp3", "wav", "ogg", "m4a"].includes(x)) return "🎵";
  if (["mp4", "mov", "webm"].includes(x)) return "🎞️";
  if (["pdf"].includes(x)) return "📕";
  if (["zip", "7z", "rar", "gz"].includes(x)) return "🗜️";
  if (["doc", "docx", "odt"].includes(x)) return "📘";
  return "📄";
}
function appBody(app) {
  if (app === "explorer")
    return `<div class="explorer-toolbar"><button class="navbtn" data-fs="up" title="Вверх" disabled>↑</button><div class="explorer-path" id="explorerPath">Папка не выбрана</div><button class="tool-button primary" data-fs="choose">Выбрать папку…</button></div><div class="file-actions"><button data-fs="newfile" disabled>＋ Новый текстовый файл</button><button data-fs="newfolder" disabled>▰ Новая папка</button><button data-fs="import" disabled>↑ Копировать файл сюда…</button><button data-fs="refresh" disabled>⟳ Обновить</button></div><div class="explorer-layout"><div class="explorer-main"><div class="file-list-head"><span>Имя</span><span>Тип</span><span>Размер</span><span>Изменён</span></div><div class="file-list" id="fileList"><div class="folder-empty"><div>📁</div><b>Выберите папку на своём устройстве</b><p>Файлы читаются и записываются только после вашего разрешения.<br/>Ничего не загружается на сервер.</p><button class="tool-button primary" data-fs="choose">Выбрать папку</button></div></div></div></div><div class="explorer-status" id="explorerStatus">Нет доступа к локальным файлам</div>`;
  if (app === "notes")
    return `<div class="notes-toolbar"><button data-note="new">Новый</button><button data-note="open">Открыть файл…</button><button data-note="save">Сохранить</button><button data-note="saveas">Сохранить как…</button><span id="noteFileLabel">Черновик хранится в этом браузере</span></div><textarea class="notes-editor" aria-label="Текст заметки" spellcheck="false" placeholder="Введите текст. Черновик сохраняется в локальном хранилище браузера."></textarea><div class="notes-status" id="notesStatus">Локальный черновик · Строка 1, столбец 1</div>`;
  if (app === "calculator")
    return `<div class="calculator"><div class="calc-mode">КАЛЬКУЛЯТОР</div><div class="calc-expression"></div><div class="calc-display" aria-live="polite">0</div><div class="calc-grid">${["%", "CE", "C", "⌫", "1/x", "x²", "√", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "＋", "±", "0", ".", "="].map((x) => `<button class="${["÷", "×", "−", "＋"].includes(x) ? "operator" : ""} ${x === "=" ? "equals" : ""}" data-calc="${x}">${x}</button>`).join("")}</div></div>`;
  if (app === "settings")
    return `<div class="settings-layout"><aside class="settings-nav"><div class="settings-user"><span class="avatar">ⓘ</span><span><b>Сведения об устройстве</b><small>Данные, которые сообщает браузер</small></span></div><div class="settings-nav-item active">ⓘ &nbsp; Система и браузер</div><p class="permission-note">Это не настройки Windows. Изменять параметры операционной системы из вкладки браузера нельзя.</p></aside><div class="settings-main"><h2>Сведения об устройстве</h2><p>Только доступные браузеру данные — без выдуманных значений.</p><div id="systemFacts" class="facts-list"></div><div class="settings-card"><div><b>Доступ к файлам</b><small>Выбранная папка доступна только в этой вкладке и до перезагрузки.</small></div><button data-fs="choose">Выбрать папку</button></div></div></div>`;
}
function openApp(app) {
  closePanels();
  if (!appMeta[app]) return;
  let old = appInstances.get(app);
  if (old?.isConnected) {
    old.style.display = "flex";
    old.classList.remove("minimized");
    focusWindow(old);
    return;
  }
  const [title, icon] = appMeta[app],
    win = document.createElement("section");
  win.className = "app-window focused";
  win.dataset.app = app;
  win.style.zIndex = ++zIndex;
  cascade = (cascade + 1) % 7;
  win.style.left = `calc(50% + ${cascade * 18 - 54}px)`;
  win.style.top = `calc(46% + ${cascade * 13 - 39}px)`;
  win.style.transform = "translate(-50%,-50%)";
  win.innerHTML = `<div class="window-titlebar"><div class="window-app-name"><span>${icon}</span>${title}</div><div class="window-controls"><button data-window="minimize" title="Свернуть">—</button><button data-window="maximize" title="Развернуть">□</button><button class="close" data-window="close" title="Закрыть">×</button></div></div><div class="window-body">${appBody(app)}</div>`;
  windowsRoot.appendChild(win);
  appInstances.set(app, win);
  focusWindow(win);
  addRunningButton(app, icon);
  wireWindow(win, app);
  if (app === "explorer") renderFiles();
  if (app === "notes") initNotes(win);
  if (app === "settings") renderSystemFacts(win);
}
function addRunningButton(app, icon) {
  let holder = $("#runningIcons");
  if ($(`[data-running="${app}"]`, holder)) return;
  let b = document.createElement("button");
  b.className = "taskbar-icon open-app";
  b.dataset.running = app;
  b.title = appMeta[app][0];
  b.textContent = icon;
  b.onclick = () => {
    let w = appInstances.get(app);
    if (w) {
      if (w.style.display === "none") {
        w.style.display = "flex";
        focusWindow(w);
      } else if (w.classList.contains("focused")) {
        w.style.display = "none";
        w.classList.add("minimized");
      } else focusWindow(w);
    }
  };
  holder.appendChild(b);
}
function focusWindow(win) {
  $$(".app-window").forEach((w) => w.classList.remove("focused"));
  win.classList.add("focused");
  win.style.zIndex = ++zIndex;
  $$("#runningIcons .taskbar-icon").forEach((b) =>
    b.classList.toggle("open-app", b.dataset.running === win.dataset.app),
  );
}
function wireWindow(win, app) {
  win.addEventListener("pointerdown", () => focusWindow(win));
  $$("[data-window]", win).forEach(
    (btn) =>
      (btn.onclick = (e) => {
        e.stopPropagation();
        let action = btn.dataset.window;
        if (action === "close") {
          if (app === "notes") {
            if (win.noteHandle) {
              clearTimeout(win.noteSaveTimer);
              writeNoteFile(win);
            } else saveDraft(win);
          }
          win.remove();
          appInstances.delete(app);
          $(`[data-running="${app}"]`)?.remove();
        }
        if (action === "minimize") {
          win.style.display = "none";
          win.classList.add("minimized");
        }
        if (action === "maximize") {
          if (win.classList.toggle("maximized")) {
            win.dataset.oldLeft = win.style.left;
            win.dataset.oldTop = win.style.top;
          } else {
            win.style.left = win.dataset.oldLeft || "50%";
            win.style.top = win.dataset.oldTop || "47%";
            win.style.transform = "translate(-50%,-50%)";
          }
        }
      }),
  );
  const bar = $(".window-titlebar", win);
  let drag = null;
  bar.addEventListener("pointerdown", (e) => {
    if (
      e.target.closest(".window-controls") ||
      win.classList.contains("maximized")
    )
      return;
    focusWindow(win);
    let r = win.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener("pointermove", (e) => {
    if (drag) {
      win.style.left = `${drag.left + e.clientX - drag.x}px`;
      win.style.top = `${drag.top + e.clientY - drag.y}px`;
      win.style.transform = "none";
    }
  });
  bar.addEventListener("pointerup", () => (drag = null));
  if (app === "explorer") {
    $$("[data-fs]", win).forEach(
      (b) => (b.onclick = () => fileAction(b.dataset.fs, win)),
    );
    $("#fileList", win).addEventListener("click", (e) => {
      let row = e.target.closest("[data-entry]");
      if (row) {
        $$(".file-row.selected", win).forEach((r) =>
          r.classList.remove("selected"),
        );
        row.classList.add("selected");
      }
    });
    $("#fileList", win).addEventListener("dblclick", (e) => {
      let row = e.target.closest("[data-entry]");
      if (row) activateEntry(row, win, true);
    });
    $("#fileList", win).addEventListener("keydown", (e) => {
      let row = e.target.closest("[data-entry]");
      if (row && e.key === "Enter") activateEntry(row, win, true);
    });
  }
  if (app === "notes") {
    $$("[data-note]", win).forEach(
      (b) => (b.onclick = () => noteAction(b.dataset.note, win)),
    );
    $(".notes-editor", win).addEventListener("input", () => {
      if (saveDraft(win)) updateNoteStatus(win);
      if (win.noteHandle) {
        clearTimeout(win.noteSaveTimer);
        win.noteSaveTimer = setTimeout(() => writeNoteFile(win), 700);
      }
    });
  }
  if (app === "calculator") wireCalculator(win);
  if (app === "settings") $("[data-fs]", win).onclick = () => chooseFolder();
}
function setFsButtons(win, enabled) {
  $$("[data-fs]", win).forEach((b) => {
    if (!["choose"].includes(b.dataset.fs)) b.disabled = !enabled;
  });
}
async function chooseFolder() {
  if (!("showDirectoryPicker" in window)) {
    toast(
      "Выбор папки поддерживается в актуальном Chrome или Edge по HTTPS/localhost.",
    );
    return;
  }
  try {
    let handle = await window.showDirectoryPicker({ mode: "readwrite" });
    dirStack = [handle];
    updateStartFolder();
    let w = appInstances.get("explorer");
    if (!w?.isConnected) {
      openApp("explorer");
      w = appInstances.get("explorer");
    }
    await renderFiles(w);
    toast(`Открыта папка: ${handle.name}`);
  } catch (e) {
    if (e.name !== "AbortError")
      toast(`Не удалось открыть папку: ${e.message}`);
  }
}
async function renderFiles(win = appInstances.get("explorer")) {
  if (!win?.isConnected) return;
  let list = $("#fileList", win);
  if (!currentDir()) {
    list.innerHTML = `<div class="folder-empty"><div>📁</div><b>Выберите папку на своём устройстве</b><p>Файлы остаются на вашем устройстве. Доступ выдаётся браузеру только после выбора папки.</p><button class="tool-button primary" data-fs="choose">Выбрать папку</button></div>`;
    list.querySelector("[data-fs=choose]").onclick = chooseFolder;
    $("#explorerPath", win).textContent = "Папка не выбрана";
    $("#explorerStatus", win).textContent = "Нет доступа к локальным файлам";
    setFsButtons(win, false);
    $$("[data-fs=choose]", win).forEach((b) => (b.disabled = false));
    return;
  }
  setFsButtons(win, true);
  $$("[data-fs=choose]", win).forEach((b) => (b.disabled = false));
  let items = [];
  try {
    for await (const [name, handle] of currentDir().entries()) {
      let meta = { name, handle };
      if (handle.kind === "file") {
        let f = await handle.getFile();
        meta.size = f.size;
        meta.modified = f.lastModified;
      }
      items.push(meta);
    }
  } catch (e) {
    $("#fileList", win).innerHTML =
      `<div class="folder-empty"><b>Не удалось прочитать содержимое</b><p>${esc(e.message)}</p></div>`;
    return;
  }
  items.sort((a, b) =>
    a.handle.kind === b.handle.kind
      ? a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      : a.handle.kind === "directory"
        ? -1
        : 1,
  );
  let path = dirStack.map((h) => h.name).join(" › ");
  $("#explorerPath", win).textContent = path;
  $("#explorerStatus", win).textContent =
    `${items.length} объектов · Папка: ${currentDir().name}`;
  $$("[data-fs=up]", win).disabled = dirStack.length < 2;
  list.innerHTML = items.length
    ? items
        .map(
          (it, i) =>
            `<button class="file-row" data-entry="${i}" title="${esc(it.name)}"><span class="entry-name"><span class="entry-icon">${it.handle.kind === "directory" ? "📁" : fileIcon(it.name)}</span><b>${esc(it.name)}</b></span><span>${it.handle.kind === "directory" ? "Папка" : esc(it.name.split(".").pop().toUpperCase() + " файл")}</span><span>${it.handle.kind === "directory" ? "—" : humanSize(it.size)}</span><span>${it.modified ? new Date(it.modified).toLocaleString() : "—"}</span></button>`,
        )
        .join("")
    : `<div class="folder-empty compact"><div>📂</div><b>Папка пуста</b><p>Создайте здесь файл или папку.</p></div>`;
  win.fileItems = items;
  updateStartFolder();
}
async function activateEntry(row, win, double) {
  let item = win.fileItems?.[Number(row.dataset.entry)];
  if (!item) return;
  if (item.handle.kind === "directory") {
    if (double) {
      dirStack.push(item.handle);
      await renderFiles(win);
    }
  } else {
    try {
      let file = await item.handle.getFile();
      if (
        /\.(txt|md|csv|json|html|css|js|xml|log|py|yaml|yml)$/i.test(file.name)
      ) {
        let text = await file.text();
        let notes = appInstances.get("notes");
        if (!notes?.isConnected) {
          openApp("notes");
          notes = appInstances.get("notes");
        }
        clearTimeout(notes.noteSaveTimer);
        if (notes.noteHandle) await writeNoteFile(notes);
        notes.noteHandle = item.handle;
        $(".notes-editor", notes).value = text;
        $("#noteFileLabel", notes).textContent = file.name;
        updateNoteStatus(notes);
        focusWindow(notes);
      } else {
        let url = URL.createObjectURL(file);
        let previewable =
          /\.(png|jpe?g|gif|webp|mp3|wav|ogg|m4a|mp4|webm|mov)$/i.test(
            file.name,
          );
        let tab = previewable ? window.open(url, "_blank") : null;
        if (tab) {
          tab.opener = null;
        } else {
          let a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      toast(`Ошибка чтения файла: ${e.message}`);
    }
  }
}
async function existsInDirectory(dir, name, kind = "file") {
  try {
    if (kind === "file") await dir.getFileHandle(name);
    else await dir.getDirectoryHandle(name);
    return true;
  } catch (e) {
    if (e.name === "NotFoundError") return false;
    throw e;
  }
}
async function fileAction(action, win) {
  try {
    if (action === "choose") {
      await chooseFolder();
      return;
    }
    if (action === "up") {
      if (dirStack.length > 1) dirStack.pop();
      await renderFiles(win);
      return;
    }
    if (action === "refresh") {
      await renderFiles(win);
      return;
    }
    if (!currentDir()) return;
    if (action === "newfile") {
      let name = prompt("Имя нового текстового файла", "Новый файл.txt");
      if (!name) return;
      if (name === "." || name === ".." || /[\\/]/.test(name)) {
        toast("Введите имя файла без символов / и \\");
        return;
      }
      if (
        (await existsInDirectory(currentDir(), name)) &&
        !confirm(`Файл «${name}» уже существует. Перезаписать его?`)
      )
        return;
      let h = await currentDir().getFileHandle(name, { create: true }),
        w = await h.createWritable();
      await w.write("");
      await w.close();
      await renderFiles(win);
      toast(`Создан файл ${name}`);
    }
    if (action === "newfolder") {
      let name = prompt("Имя новой папки");
      if (!name) return;
      if (name === "." || name === ".." || /[\\/]/.test(name)) {
        toast("Введите имя папки без символов / и \\");
        return;
      }
      await currentDir().getDirectoryHandle(name, { create: true });
      await renderFiles(win);
      toast(`Папка готова: ${name}`);
    }
    if (action === "import") {
      if (!("showOpenFilePicker" in window)) {
        toast("Импорт файлов не поддерживается этим браузером.");
        return;
      }
      let [fileHandle] = await showOpenFilePicker({ multiple: false });
      let file = await fileHandle.getFile();
      if (
        (await existsInDirectory(currentDir(), file.name)) &&
        !confirm(`Файл «${file.name}» уже существует. Перезаписать его?`)
      )
        return;
      let target = await currentDir().getFileHandle(file.name, {
          create: true,
        }),
        w = await target.createWritable();
      await w.write(file);
      await w.close();
      await renderFiles(win);
      toast(`Скопирован файл ${file.name}`);
    }
  } catch (e) {
    if (e.name !== "AbortError") toast(`Операция не выполнена: ${e.message}`);
  }
}
function updateStartFolder() {
  let hint = $("#startFileHint");
  if (hint)
    hint.textContent = currentDir()
      ? `Поиск в «${dirStack.map((handle) => handle.name).join(" › ")}»`
      : "Папка не выбрана";
}
function initNotes(win) {
  let ed = $(".notes-editor", win);
  try {
    ed.value = localStorage.getItem("local-desktop-draft") || "";
  } catch {
    ed.value = "";
    $("#notesStatus", win).textContent = "Локальное хранилище недоступно";
  }
}
function saveDraft(win) {
  let ed = $(".notes-editor", win);
  if (!ed) return false;
  if (win.noteHandle) return true;
  try {
    localStorage.setItem("local-desktop-draft", ed.value);
    return true;
  } catch (e) {
    let status = $("#notesStatus", win);
    if (status)
      status.textContent =
        "Черновик не сохранён: локальное хранилище недоступно";
    return false;
  }
}
function updateNoteStatus(win) {
  let ed = $(".notes-editor", win);
  if (!ed) return;
  let lines = ed.value.split("\n");
  $("#notesStatus", win).textContent =
    `${win.noteHandle ? "Файл · изменения автосохраняются" : "Локальный черновик"} · Строка ${lines.length}, столбец ${lines.at(-1).length + 1}`;
}
async function writeNoteFile(win) {
  const handle = win.noteHandle;
  if (!handle) return;
  const text = $(".notes-editor", win).value;
  const write = async () => {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    if (win.noteHandle === handle && $(".notes-editor", win).value === text)
      $("#noteFileLabel", win).textContent = handle.name + " · сохранено";
  };
  const pending = (win.noteWriteQueue || Promise.resolve())
    .catch(() => {})
    .then(write);
  win.noteWriteQueue = pending;
  try {
    await pending;
  } catch (e) {
    toast(`Автосохранение не выполнено: ${e.message}`);
  }
}
async function noteAction(action, win) {
  try {
    if (action === "new") {
      clearTimeout(win.noteSaveTimer);
      if (win.noteHandle) await writeNoteFile(win);
      win.noteHandle = null;
      $(".notes-editor", win).value = "";
      $("#noteFileLabel", win).textContent =
        "Черновик хранится в этом браузере";
      saveDraft(win);
      updateNoteStatus(win);
    }
    if (action === "open") {
      if (!("showOpenFilePicker" in window)) {
        toast(
          "Открытие файла поддерживается в Chrome/Edge по HTTPS или localhost.",
        );
        return;
      }
      let [h] = await showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Текстовые файлы",
            accept: {
              "text/*": [
                ".txt",
                ".md",
                ".csv",
                ".log",
                ".json",
                ".html",
                ".css",
                ".js",
              ],
            },
          },
        ],
      });
      let file = await h.getFile();
      clearTimeout(win.noteSaveTimer);
      if (win.noteHandle) await writeNoteFile(win);
      win.noteHandle = h;
      $(".notes-editor", win).value = await file.text();
      $("#noteFileLabel", win).textContent = file.name;
      updateNoteStatus(win);
    }
    if (action === "save") {
      if (win.noteHandle) {
        clearTimeout(win.noteSaveTimer);
        await writeNoteFile(win);
      } else {
        await noteAction("saveas", win);
      }
    }
    if (action === "saveas") {
      if ("showSaveFilePicker" in window) {
        let h = await showSaveFilePicker({
          suggestedName: win.noteHandle?.name || "Заметки.txt",
          types: [
            {
              description: "Текстовый файл",
              accept: { "text/plain": [".txt"] },
            },
          ],
        });
        clearTimeout(win.noteSaveTimer);
        win.noteHandle = h;
        await writeNoteFile(win);
        updateNoteStatus(win);
      } else {
        const blob = new Blob([$(".notes-editor", win).value], {
          type: "text/plain;charset=utf-8",
        });
        let a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "Заметки.txt";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("Файл скачан в папку загрузок браузера");
      }
    }
  } catch (e) {
    if (e.name !== "AbortError")
      toast(`Не удалось выполнить операцию: ${e.message}`);
  }
}
function wireCalculator(win) {
  let display = $(".calc-display", win),
    expr = $(".calc-expression", win),
    acc = null,
    operator = null,
    reset = false;
  const val = () => Number(display.textContent.replace(",", ".")) || 0;
  const show = (n) => {
    display.textContent = Number.isFinite(n)
      ? String(+n.toPrecision(12))
      : "Ошибка";
    reset = true;
  };
  $$("[data-calc]", win).forEach(
    (b) =>
      (b.onclick = () => {
        let x = b.dataset.calc;
        if (/^\d$/.test(x)) {
          display.textContent =
            reset || display.textContent === "0" ? x : display.textContent + x;
          reset = false;
          return;
        }
        if (x === ".") {
          if (reset) {
            display.textContent = "0.";
            reset = false;
          } else if (!display.textContent.includes("."))
            display.textContent += ".";
          return;
        }
        if (x === "C") {
          display.textContent = "0";
          expr.textContent = "";
          acc = null;
          operator = null;
          reset = false;
          return;
        }
        if (x === "CE") {
          display.textContent = "0";
          reset = false;
          return;
        }
        if (x === "⌫") {
          display.textContent =
            display.textContent.length > 1
              ? display.textContent.slice(0, -1)
              : "0";
          return;
        }
        if (x === "±") {
          show(-val());
          return;
        }
        if (x === "%") {
          show(val() / 100);
          return;
        }
        if (x === "1/x") {
          show(1 / val());
          return;
        }
        if (x === "x²") {
          show(val() ** 2);
          return;
        }
        if (x === "√") {
          show(Math.sqrt(val()));
          return;
        }
        if (x === "=") {
          if (operator) {
            let rhs = val(),
              result =
                operator === "＋"
                  ? acc + rhs
                  : operator === "−"
                    ? acc - rhs
                    : operator === "×"
                      ? acc * rhs
                      : acc / rhs;
            expr.textContent = `${acc} ${operator} ${rhs} =`;
            show(result);
            operator = null;
            acc = null;
          }
          return;
        }
        if (["＋", "−", "×", "÷"].includes(x)) {
          if (operator && !reset) {
            let rhs = val();
            acc =
              operator === "＋"
                ? acc + rhs
                : operator === "−"
                  ? acc - rhs
                  : operator === "×"
                    ? acc * rhs
                    : acc / rhs;
            display.textContent = String(acc);
          } else acc = val();
          operator = x;
          expr.textContent = `${acc} ${x}`;
          reset = true;
        }
      }),
  );
}
function closePanels(except) {
  ["startPanel", "searchPanel", "calendarPanel", "quickPanel"].forEach((id) => {
    let e = $("#" + id);
    if (e && id !== except) e.hidden = true;
  });
}
function togglePanel(id) {
  let e = $("#" + id),
    show = e.hidden;
  closePanels();
  e.hidden = !show;
  if (show) $("input", e)?.focus();
}
$("#startButton").onclick = () => togglePanel("startPanel");
$("#searchButton").onclick = () => togglePanel("searchPanel");
$("#clockButton").onclick = () => {
  togglePanel("calendarPanel");
  renderCalendar();
};
$("#quickButton").onclick = () => {
  togglePanel("quickPanel");
  renderDeviceStatus();
};
$("#showDesktop").onclick = () => {
  let vis = $$(".app-window").some((w) => w.style.display !== "none");
  $$(".app-window").forEach((w) => {
    w.style.display = vis ? "none" : "flex";
    w.classList.toggle("minimized", vis);
  });
};
$("#aboutButton").onclick = () =>
  toast(
    "Это веб-приложение. Windows не эмулируется и системные настройки не меняются.",
  );
document.addEventListener("click", (e) => {
  let app = e.target.closest("[data-app]");
  if (app) {
    e.preventDefault();
    openApp(app.dataset.app);
    return;
  }
  let action = e.target.closest("[data-action]");
  if (action?.dataset.action === "internet") {
    e.preventDefault();
    openInternet();
    closePanels();
  }
});
function openInternet() {
  let w = window.open("https://www.google.com", "_blank");
  if (w) w.opener = null;
  else
    toast(
      "Браузер заблокировал новую вкладку. Разрешите всплывающие окна или откройте https://www.google.com вручную.",
    );
}
function renderCalendar() {
  let yr = monthCursor.getFullYear(),
    mo = monthCursor.getMonth(),
    first = new Date(yr, mo, 1),
    start = (first.getDay() + 6) % 7,
    days = new Date(yr, mo + 1, 0).getDate(),
    prev = new Date(yr, mo, 0).getDate();
  $("#monthLabel").textContent = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(first);
  let cells = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(
    (d) => `<span class="weekday">${d}</span>`,
  );
  for (let i = 0; i < 42; i++) {
    let n = i - start + 1,
      day = n < 1 ? prev + n : n > days ? n - days : n,
      cls = n < 1 || n > days ? "muted-day" : "";
    if (new Date(yr, mo, n).toDateString() === new Date().toDateString())
      cls = "today";
    cells.push(`<span class="${cls}">${day}</span>`);
  }
  $("#calendarGrid").innerHTML = cells.join("");
}
function renderClock() {
  let d = new Date(),
    time = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  $("#clockTime").textContent = time;
  $("#clockDate").textContent = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  $("#calendarTime").textContent = time;
  $("#calendarDate").textContent = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
$("#prevMonth").onclick = () => {
  monthCursor.setMonth(monthCursor.getMonth() - 1);
  renderCalendar();
};
$("#nextMonth").onclick = () => {
  monthCursor.setMonth(monthCursor.getMonth() + 1);
  renderCalendar();
};
function renderDeviceStatus() {
  let online = navigator.onLine;
  $("#onlineStatus").textContent = online
    ? "Браузер сообщает: подключение доступно"
    : "Браузер сообщает: нет подключения";
  $("#onlineDot").classList.toggle("offline", !online);
  $("#trayOnline").style.color = online ? "#18864b" : "#c0392b";
  $("#screenStatus").textContent =
    `${screen.width} × ${screen.height} CSS-пикселей · ${navigator.language}`;
  if (navigator.getBattery)
    navigator
      .getBattery()
      .then(
        (b) =>
          ($("#batteryStatus").textContent =
            `${Math.round(b.level * 100)}%${b.charging ? " · заряжается" : ""}`),
      )
      .catch(() => {});
  $("#batteryStatus").textContent =
    $("#batteryStatus").textContent ||
    "Браузер не предоставляет данные о батарее";
}
function renderSystemFacts(win) {
  let facts = [
    [
      "Платформа",
      navigator.userAgentData?.platform ||
        navigator.platform ||
        "Не сообщается",
    ],
    [
      "Браузер",
      navigator.userAgentData?.brands
        ?.map((b) => `${b.brand} ${b.version}`)
        .join(", ") || navigator.userAgent,
    ],
    ["Язык", navigator.language],
    ["Часовой пояс", Intl.DateTimeFormat().resolvedOptions().timeZone],
    ["Экран", `${screen.width} × ${screen.height} CSS-пикселей`],
    ["Ядра процессора", navigator.hardwareConcurrency || "Браузер не сообщает"],
    ["Сеть", navigator.onLine ? "Подключение доступно" : "Нет подключения"],
  ];
  $("#systemFacts", win).innerHTML = facts
    .map(
      ([k, v]) =>
        `<div class="fact-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`,
    )
    .join("");
}
window.addEventListener("online", () => {
  renderDeviceStatus();
  toast("Браузер сообщает о подключении к сети");
});
window.addEventListener("offline", () => {
  renderDeviceStatus();
  toast("Браузер сообщает об отсутствии сети");
});
$("#startSearch").oninput = async (e) => {
  let q = e.target.value.trim().toLowerCase(),
    res = $("#startResults");
  let apps = Object.entries(appMeta).filter(([, m]) =>
    m[0].toLowerCase().includes(q),
  );
  let rows = apps.map(
    ([id, m]) =>
      `<button class="recommended-item" data-app="${id}"><span class="recommend-icon">${m[1]}</span><span><b>${esc(m[0])}</b><small>Приложение</small></span></button>`,
  );
  if (q && currentDir())
    try {
      for await (const [name, h] of currentDir().entries())
        if (name.toLowerCase().includes(q))
          rows.push(
            `<button class="recommended-item" data-searchfile="${esc(name)}"><span class="recommend-icon">${h.kind === "directory" ? "📁" : fileIcon(name)}</span><span><b>${esc(name)}</b><small>${h.kind === "directory" ? "Папка" : "Файл"}</small></span></button>`,
          );
    } catch {}
  res.innerHTML = rows.length
    ? rows.join("")
    : `<div class="empty-results">${q ? "Совпадений нет. Поиск охватывает имена в текущей папке." : "Введите запрос."}</div>`;
};
$("#startResults").addEventListener("click", async (e) => {
  let b = e.target.closest("[data-searchfile]");
  if (!b) return;
  let explorer = appInstances.get("explorer");
  if (!explorer?.isConnected) openApp("explorer");
  explorer = appInstances.get("explorer");
  let i = explorer.fileItems?.findIndex((x) => x.name === b.dataset.searchfile);
  if (i >= 0) await activateEntry({ dataset: { entry: i } }, explorer, true);
  closePanels();
});
$("#taskSearch").onkeydown = (e) => {
  if (e.key === "Enter" && e.target.value) {
    $("#startSearch").value = e.target.value;
    $("#startSearch").dispatchEvent(new Event("input"));
    togglePanel("startPanel");
  }
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanels();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    openApp("explorer");
  }
});
renderClock();
renderCalendar();
renderDeviceStatus();
setInterval(renderClock, 10000);
