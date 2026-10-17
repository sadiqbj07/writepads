
const editor = document.getElementById("editor");
const titleInput = document.getElementById("docTitle");
const saveStatus = document.getElementById("saveStatus");
const fileInput = document.getElementById("fileInput");
const recentList = document.getElementById("recentList");

const RECENTS_KEY = "writepad-recents-v2";
const THEME_KEY = "writepad-dark-v2";
const MAX_RECENTS = 20;

let currentId = null;
let savedSnapshot = "";
let dirty = false;
let installPrompt = null;

function getText() {
  return editor.innerText || "";
}

function safeTitle() {
  return (titleInput.value.trim() || "Untitled")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 100);
}

function getSnapshot() {
  return JSON.stringify({
    title: titleInput.value,
    html: editor.innerHTML
  });
}

function status(message) {
  saveStatus.textContent = message;
}

function updateCounts() {
  const text = getText();
  const words = text.trim()
    ? text.trim().split(/\s+/).length
    : 0;

  document.getElementById("wordCount").textContent =
    words + " words";

  document.getElementById("charCount").textContent =
    text.length + " characters";

  const lines = text ? text.split("\n").length : 1;

  document.getElementById("lineCount").textContent =
    lines + (lines === 1 ? " line" : " lines");
}

function markEdited() {
  dirty = getSnapshot() !== savedSnapshot;
  status(dirty ? "Unsaved changes" : "Saved");
  updateCounts();
}

function confirmDiscard() {
  return !dirty || confirm(
    "There are unsaved changes. Continue without saving?"
  );
}

function getRecents() {
  try {
    const list = JSON.parse(
      localStorage.getItem(RECENTS_KEY) || "[]"
    );
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function setRecents(list) {
  try {
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(list.slice(0, MAX_RECENTS))
    );
    return true;
  } catch {
    status("Browser storage unavailable");
    return false;
  }
}

function createRecord(id) {
  return {
    id: id || (
      crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random()
    ),
    title: safeTitle(),
    html: editor.innerHTML,
    text: getText(),
    updatedAt: new Date().toISOString()
  };
}

function renderRecents() {
  recentList.replaceChildren();

  const records = getRecents();

  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "empty-recent";
    empty.textContent =
      "No recent documents. Create a note and tap Save.";
    recentList.appendChild(empty);
    return;
  }

  records.forEach(record => {
    const row = document.createElement("div");
    row.className = "recent-item";

    const openButton = document.createElement("button");
    openButton.className = "recent-open";
    openButton.type = "button";

    const title = document.createElement("strong");
    title.textContent = record.title || "Untitled";

    const date = document.createElement("small");
    date.textContent = record.updatedAt
      ? new Date(record.updatedAt).toLocaleString()
      : "Saved document";

    openButton.append(title, date);

    openButton.addEventListener("click", () => {
      if (!confirmDiscard()) return;
      loadRecord(record);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "recent-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "✕";
    deleteButton.setAttribute("aria-label", "Remove recent document");

    deleteButton.addEventListener("click", () => {
      if (!confirm("Remove this document from Recent Documents?")) {
        return;
      }

      setRecents(getRecents().filter(
        item => item.id !== record.id
      ));

      if (currentId === record.id) {
        currentId = null;
      }

      renderRecents();
    });

    row.append(openButton, deleteButton);
    recentList.appendChild(row);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br>");
}

function loadRecord(record) {
  currentId = record.id;
  titleInput.value = record.title || "Untitled";
  editor.innerHTML = record.html || escapeHtml(record.text || "");

  savedSnapshot = getSnapshot();
  dirty = false;

  status("Document opened");
  updateCounts();
  renderRecents();
}

function saveDocument() {
  const record = createRecord(currentId);
  const records = getRecents();

  const updated = [
    record,
    ...records.filter(item => item.id !== record.id)
  ];

  if (!setRecents(updated)) {
    alert("Could not save to browser storage. Export a backup instead.");
    return;
  }

  currentId = record.id;
  savedSnapshot = getSnapshot();
  dirty = false;

  status("Saved in browser");
  renderRecents();
}

function downloadFile(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function saveAsHtml() {
  const title = safeTitle();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body {
  max-width: 850px;
  margin: 30px auto;
  padding: 0 16px;
  font: 16px/1.7 Arial, sans-serif;
  overflow-wrap: anywhere;
}
img { max-width: 100%; }
</style>
</head>
<body>${editor.innerHTML}</body>
</html>`;

  downloadFile(
    html,
    "text/html;charset=utf-8",
    title + ".html"
  );

  saveDocument();
  status("HTML copy downloaded");
}

function exportText() {
  downloadFile(
    getText(),
    "text/plain;charset=utf-8",
    safeTitle() + ".txt"
  );

  status("TXT export requested");
}

function newDocument() {
  if (!confirmDiscard()) return;

  currentId = null;
  titleInput.value = "Untitled";
  editor.innerHTML = "";

  savedSnapshot = getSnapshot();
  dirty = false;

  status("New document");
  updateCounts();
  editor.focus();
}

function openDocument() {
  if (!confirmDiscard()) return;

  fileInput.value = "";
  fileInput.click();
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    const isHtml = /\.(html?|xhtml)$/i.test(file.name);

    titleInput.value =
      file.name.replace(/\.[^.]+$/, "") || "Untitled";

    if (isHtml) {
      // Import visible document content only.
      const parsed = new DOMParser().parseFromString(
        content, "text/html"
      );

      parsed.querySelectorAll(
        "script, iframe, object, embed, link, meta, base"
      ).forEach(node => node.remove());

      parsed.body.querySelectorAll("*").forEach(node => {
        [...node.attributes].forEach(attribute => {
          if (/^on/i.test(attribute.name)) {
            node.removeAttribute(attribute.name);
          }
        });
      });

      editor.innerHTML = parsed.body.innerHTML;
    } else {
      editor.innerHTML = escapeHtml(content);
    }

    currentId = null;
    savedSnapshot = getSnapshot();
    dirty = false;

    status("Opened " + file.name);
    updateCounts();
  } catch {
    alert("Could not open this file.");
  }
});

document.getElementById("newBtn")
  .addEventListener("click", newDocument);

document.getElementById("openBtn")
  .addEventListener("click", openDocument);

document.getElementById("saveBtn")
  .addEventListener("click", saveDocument);

document.getElementById("saveAsBtn")
  .addEventListener("click", saveAsHtml);

document.getElementById("exportBtn")
  .addEventListener("click", exportText);

document.getElementById("clearRecentBtn")
  .addEventListener("click", () => {
    if (!confirm("Clear all recent documents? Downloaded files will remain.")) {
      return;
    }

    setRecents([]);
    currentId = null;
    renderRecents();
  });

editor.addEventListener("input", markEdited);
titleInput.addEventListener("input", markEdited);

// Formatting toolbar
document.querySelectorAll("[data-command]").forEach(button => {
  button.addEventListener("mousedown", event => {
    event.preventDefault();
  });

  button.addEventListener("click", () => {
    editor.focus();
    document.execCommand(button.dataset.command, false, null);
    markEdited();
  });
});

document.getElementById("fontFamily")
  .addEventListener("change", event => {
    editor.focus();
    document.execCommand("fontName", false, event.target.value);
    markEdited();
  });

document.getElementById("fontSize")
  .addEventListener("change", event => {
    editor.focus();
    document.execCommand("fontSize", false, event.target.value);
    markEdited();
  });

document.getElementById("clearFormatBtn")
  .addEventListener("click", () => {
    editor.focus();
    document.execCommand("removeFormat", false, null);
    document.execCommand("unlink", false, null);
    markEdited();
  });

// Dark mode
function setTheme(dark) {
  document.body.classList.toggle("dark", dark);
  document.getElementById("themeBtn").textContent =
    dark ? "☀" : "☾";
}

document.getElementById("themeBtn")
  .addEventListener("click", () => {
    const dark = !document.body.classList.contains("dark");
    setTheme(dark);

    try {
      localStorage.setItem(THEME_KEY, String(dark));
    } catch {}
  });

// PWA installation prompt
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  document.getElementById("installBtn").hidden = false;
});

document.getElementById("installBtn")
  .addEventListener("click", async () => {
    if (!installPrompt) {
      alert(
        "If installation is supported, use your browser menu and choose Install app or Add to Home screen."
      );
      return;
    }

    installPrompt.prompt();
    await installPrompt.userChoice;

    installPrompt = null;
    document.getElementById("installBtn").hidden = true;
  });

window.addEventListener("appinstalled", () => {
  document.getElementById("installBtn").hidden = true;
  status("WritePad installed");
});

// Offline caching requires a secure origin.
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" ||
   location.hostname === "localhost" ||
   location.hostname === "127.0.0.1")
) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
      document.getElementById("offlineStatus").textContent =
        "Offline support ready";
    } catch (error) {
      document.getElementById("offlineStatus").textContent =
        "Offline setup failed";
      console.error(error);
    }
  });
} else {
  document.getElementById("offlineStatus").textContent =
    "HTTPS/localhost needed for offline mode";
}

// Restore saved theme and recent list.
try {
  setTheme(localStorage.getItem(THEME_KEY) === "true");
} catch {
  setTheme(false);
}

renderRecents();
updateCounts();
savedSnapshot = getSnapshot();
status("Ready");
