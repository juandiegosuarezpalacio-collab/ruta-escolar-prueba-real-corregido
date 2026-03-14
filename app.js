
const appState = {
  routes: {},
  barrios: [],
  currentRoute: "Bachillerato 1",
  currentBarrio: "Turbay Ayala",
  messageType: "alistamiento",
  tray: [],
  status: "Sistema listo para pruebas.",
  driverIndex: 0,
  sendMode: "auto",
  search: ""
};

const ui = {
  routeName: document.getElementById("routeName"),
  currentBarrioLabel: document.getElementById("currentBarrioLabel"),
  progressLabel: document.getElementById("progressLabel"),
  progressLabelInline: document.getElementById("progressLabelInline"),
  routeTabs: document.getElementById("routeTabs"),
  barrioSelect: document.getElementById("barrioSelect"),
  sendMode: document.getElementById("sendMode"),
  channelLabel: document.getElementById("channelLabel"),
  statusText: document.getElementById("statusText"),
  preview: document.getElementById("preview"),
  studentList: document.getElementById("studentList"),
  diagnosticsList: document.getElementById("diagnosticsList"),
  tray: document.getElementById("tray"),
  searchInput: document.getElementById("searchInput"),
  btnNext: document.getElementById("btnNext"),
  btnSendCurrent: document.getElementById("btnSendCurrent"),
  btnCopyMessage: document.getElementById("btnCopyMessage"),
  btnViewLink: document.getElementById("btnViewLink"),
  btnClearTray: document.getElementById("btnClearTray")
};

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("No se pudo cargar " + url + " (" + response.status + ").");
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    throw new Error(
      "La ruta " + url + " devolvio HTML en lugar de JSON. Revisa que abras la carpeta raiz con Live Server o un servidor local y que exista /data."
    );
  }

  if (contentType && !contentType.includes("json")) {
    throw new Error(
      "La ruta " + url + " no devolvio JSON. Content-Type recibido: " + contentType
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("JSON invalido en " + url + ": " + error.message);
  }
}

async function init() {
  try {
    const [studentsData, barriosData] = await Promise.all([
      loadJson("./data/estudiantes.json"),
      loadJson("./data/barrios.json")
    ]);
    appState.routes = studentsData;
    appState.barrios = barriosData;
    bindEvents();
    render();
  } catch (error) {
    ui.statusText.textContent = "Error cargando datos: " + error.message;
    console.error(error);
  }
}

function getStudents() {
  return appState.routes[appState.currentRoute] || [];
}

function getCurrentStudent() {
  return getStudents()[appState.driverIndex] || null;
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("57")) return digits;
  if (digits.length === 10) return "57" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "57" + digits.slice(1);
  return digits;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function resolvedSendMode() {
  if (appState.sendMode === "auto") {
    return isMobileDevice() ? "app" : "web";
  }
  return appState.sendMode;
}

function buildStudentMessage(student) {
  if (!student) return "No hay estudiante seleccionado.";
  return "💬 Hola, " + student.acudiente + ". La ruta va en camino por " + student.barrio + " para recoger a " + student.nombre + ".";
}

function buildMessage(type = appState.messageType) {
  const students = getStudents();
  const currentStudent = getCurrentStudent();

  if (type === "alistamiento") {
    return "🚌 " + appState.currentRoute + "\n\nLa ruta se está alistando.\n\nOrden de recogida:\n\n" +
      students.map((s) => s.orden + ". " + s.nombre + " - " + s.barrio).join("\n") +
      "\n\nPor favor preparar a los estudiantes.";
  }
  if (type === "barrio") {
    return "📍 La ruta está ingresando al barrio " + appState.currentBarrio + ".\n\nPor favor alistar a los estudiantes de este sector.";
  }
  if (type === "colegio") {
    return "🏫 La ruta llegó al colegio.\n\nLos estudiantes han llegado correctamente.";
  }
  return buildStudentMessage(currentStudent);
}

function getWhatsAppUrl(phone, msg) {
  const clean = normalizePhone(phone);
  if (!clean) return "";
  const encoded = encodeURIComponent(msg);
  if (resolvedSendMode() === "web") {
    return "https://web.whatsapp.com/send?phone=" + clean + "&text=" + encoded;
  }
  return "https://wa.me/" + clean + "?text=" + encoded;
}

function addTray(title, text, type = "text") {
  appState.tray.unshift({
    title,
    text,
    type,
    id: Date.now() + Math.random()
  });
  appState.tray = appState.tray.slice(0, 12);
  renderTray();
}

function setStatus(text) {
  appState.status = text;
  ui.statusText.textContent = text;
}

function openWhatsApp(phone, msg, label = "Abrir WhatsApp") {
  const url = getWhatsAppUrl(phone, msg);
  if (!url) {
    setStatus("Número inválido.");
    addTray("Error", "No se pudo generar un enlace válido para WhatsApp.", "error");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  setStatus("Intentando abrir WhatsApp.");
  addTray(label, url, "link");
}

async function copyToClipboard(text, successMessage, errorMessage, trayTitle, type = "text") {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
    addTray(trayTitle, text, type);
  } catch (error) {
    setStatus(errorMessage);
    addTray("Error", errorMessage, "error");
  }
}

function diagnostics() {
  const issues = [];
  const students = getStudents();

  if (!students.length) {
    issues.push({ text: "La ruta actual no tiene estudiantes.", kind: "warn" });
  }

  const invalidPhones = students.filter((s) => normalizePhone(s.telefono).length < 12);
  if (invalidPhones.length) {
    issues.push({ text: "Hay " + invalidPhones.length + " teléfono(s) inválido(s) o incompletos.", kind: "warn" });
  }

  const noBarrio = students.filter((s) => !s.barrio);
  if (noBarrio.length) {
    issues.push({ text: "Hay " + noBarrio.length + " estudiante(s) sin barrio.", kind: "warn" });
  }

  const duplicatedOrders = students.filter((s, index, arr) => arr.findIndex((x) => x.orden === s.orden) !== index);
  if (duplicatedOrders.length) {
    issues.push({ text: "Hay órdenes de recogida repetidos.", kind: "warn" });
  }

  if (!issues.length) {
    issues.push({ text: "No se detectaron errores críticos en esta ruta.", kind: "ok" });
  }

  issues.push({ text: "Si pruebas dentro de un preview embebido, WhatsApp puede no abrir por restricciones del entorno.", kind: "info" });
  issues.push({ text: "En navegador real, usa WhatsApp Web en PC y wa.me en celular.", kind: "info" });
  issues.push({ text: "El backend solo será necesario cuando quieras envío automático sin tocar WhatsApp.", kind: "info" });

  return issues;
}

function render() {
  renderHero();
  renderRouteTabs();
  renderBarrioSelect();
  renderChannel();
  renderPreview();
  renderStudents();
  renderDiagnostics();
  renderTray();
  ui.searchInput.value = appState.search;
}

function renderHero() {
  ui.routeName.textContent = appState.currentRoute;
  ui.currentBarrioLabel.textContent = appState.currentBarrio;
  const progress = getStudents().length
    ? "Estudiante " + (appState.driverIndex + 1) + " de " + getStudents().length
    : "Sin estudiantes";
  ui.progressLabel.textContent = progress;
  ui.progressLabelInline.textContent = progress;
  ui.statusText.textContent = appState.status;
}

function renderRouteTabs() {
  ui.routeTabs.innerHTML = Object.keys(appState.routes).map((route) => {
    const active = route === appState.currentRoute ? "active" : "";
    return '<button class="btn route-btn ' + active + '" data-route="' + route + '">' + route + "</button>";
  }).join("");
  ui.routeTabs.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.currentRoute = btn.dataset.route;
      appState.driverIndex = 0;
      appState.messageType = "alistamiento";
      setStatus("Ruta cambiada a " + btn.dataset.route + ".");
      render();
    });
  });
}

function renderBarrioSelect() {
  ui.barrioSelect.innerHTML = appState.barrios.map((b) => '<option value="' + b + '">' + b + "</option>").join("");
  ui.barrioSelect.value = appState.currentBarrio;
}

function renderChannel() {
  const mode = resolvedSendMode();
  const label = mode === "app" ? "WhatsApp móvil" : "WhatsApp Web";
  const device = mode === "app" ? "Celular detectado" : "PC detectado";
  ui.channelLabel.innerHTML = 'Canal activo: <strong>' + label + "</strong> · " + device;
  ui.sendMode.value = appState.sendMode;
}

function renderPreview() {
  ui.preview.textContent = buildMessage();
}

function renderStudents() {
  const query = appState.search.toLowerCase();
  const students = getStudents().filter((s) =>
    (s.nombre + " " + s.barrio + " " + s.acudiente).toLowerCase().includes(query)
  );

  ui.studentList.innerHTML = students.length
    ? students.map((s) => {
        const idx = getStudents().findIndex((x) => x.nombre === s.nombre && x.orden === s.orden);
        const active = idx === appState.driverIndex ? "active" : "";
        return `
          <div class="student-item ${active}">
            <div class="student-info">
              <strong>${s.orden}. ${s.nombre}</strong>
              <span>${s.barrio} · ${s.acudiente}</span>
              <span>+${normalizePhone(s.telefono)}</span>
            </div>
            <button class="btn success small" data-student-index="${idx}">Avisar</button>
          </div>
        `;
      }).join("")
    : '<div class="empty">No hay resultados para esa búsqueda.</div>';

  ui.studentList.querySelectorAll("[data-student-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.driverIndex = Number(btn.dataset.studentIndex);
      appState.messageType = "estudiante";
      const student = getCurrentStudent();
      setStatus("Estudiante seleccionado: " + student.nombre);
      renderPreview();
      openWhatsApp(student.telefono, buildStudentMessage(student), "WhatsApp por estudiante");
      renderStudents();
      renderHero();
    });
  });
}

function renderDiagnostics() {
  ui.diagnosticsList.innerHTML = diagnostics().map((item) => {
    return '<div class="diag-item ' + item.kind + '">' + item.text + "</div>";
  }).join("");
}

function renderTray() {
  ui.tray.innerHTML = appState.tray.length
    ? appState.tray.map((t) => {
        if (t.type === "link") {
          return `
            <div class="tray-item link">
              <div class="tray-title">${t.title}</div>
              <div class="link-box">
                <a href="${t.text}" target="_blank" rel="noopener noreferrer">${t.text}</a>
                <div class="link-actions">
                  <button class="btn ok small" data-open-link="${t.id}">Abrir enlace</button>
                  <button class="btn dark small" data-copy-link="${t.id}">Copiar enlace</button>
                </div>
                <div class="note">Si no abre aquí, copia el enlace y pégalo manualmente en el navegador.</div>
              </div>
            </div>
          `;
        }
        const klass = t.type === "error" ? "error" : t.type === "success" ? "success" : "text";
        return `
          <div class="tray-item ${klass}">
            <div class="tray-title">${t.title}</div>
            <div>${String(t.text).replaceAll("\n", "<br>")}</div>
          </div>
        `;
      }).join("")
    : '<div class="empty">Vacía</div>';

  ui.tray.querySelectorAll("[data-open-link]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = appState.tray.find((x) => String(x.id) === btn.dataset.openLink);
      if (item) window.open(item.text, "_blank", "noopener,noreferrer");
    });
  });

  ui.tray.querySelectorAll("[data-copy-link]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = appState.tray.find((x) => String(x.id) === btn.dataset.copyLink);
      if (item) {
        await copyToClipboard(item.text, "Enlace copiado al portapapeles.", "No se pudo copiar el enlace.", "Enlace copiado", "link");
      }
    });
  });
}

function bindEvents() {
  ui.barrioSelect.addEventListener("change", (e) => {
    appState.currentBarrio = e.target.value;
    renderHero();
    renderPreview();
  });

  ui.sendMode.addEventListener("change", (e) => {
    appState.sendMode = e.target.value;
    setStatus("Canal actualizado.");
    renderChannel();
  });

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.messageType = btn.dataset.action;
      const labels = {
        alistamiento: "Mensaje de alistamiento generado.",
        barrio: "Mensaje de barrio generado.",
        colegio: "Mensaje de llegada generado."
      };
      setStatus(labels[btn.dataset.action] || "Mensaje generado.");
      addTray("Vista previa", buildMessage(btn.dataset.action), "text");
      renderPreview();
    });
  });

  ui.btnNext.addEventListener("click", () => {
    if (!getStudents().length) return;
    appState.driverIndex = (appState.driverIndex + 1) % getStudents().length;
    appState.messageType = "estudiante";
    const student = getCurrentStudent();
    setStatus("Siguiente estudiante: " + student.nombre);
    addTray("Siguiente estudiante", student.nombre + " - " + student.barrio, "text");
    renderHero();
    renderPreview();
    renderStudents();
  });

  ui.btnSendCurrent.addEventListener("click", () => {
    const student = getCurrentStudent();
    if (!student) {
      setStatus("No hay estudiante seleccionado.");
      return;
    }
    openWhatsApp(student.telefono, buildMessage(), "Abrir WhatsApp");
  });

  ui.btnCopyMessage.addEventListener("click", async () => {
    await copyToClipboard(buildMessage(), "Mensaje copiado al portapapeles.", "No se pudo copiar el mensaje.", "Mensaje copiado", "text");
  });

  ui.btnViewLink.addEventListener("click", () => {
    const student = getCurrentStudent();
    if (!student) {
      setStatus("No hay estudiante seleccionado.");
      return;
    }
    addTray("Enlace", getWhatsAppUrl(student.telefono, buildMessage()), "link");
  });

  ui.btnClearTray.addEventListener("click", () => {
    appState.tray = [];
    renderTray();
  });

  ui.searchInput.addEventListener("input", (e) => {
    appState.search = e.target.value;
    renderStudents();
  });
}

init();
