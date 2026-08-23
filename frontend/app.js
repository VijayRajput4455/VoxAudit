/* ==========================================================================
   VoxAudit Dashboard Frontend Logic
   ========================================================================== */

let departmentsCache = [];
let designationsCache = [];
let shiftsCache = [];
let employeesCache = [];
let auditsCache = [];
let auditsOverTimeChartInstance = null;

/* ==========================================================================
   CUSTOM REUSABLE MODALS & TOAST NOTIFICATION SYSTEM
   ========================================================================== */

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) {
    console.log(`[Toast ${type}]: ${message}`);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast-message toast-${type}`;

  let iconName = "check-circle";
  let iconColor = "#10b981";
  if (type === "error") {
    iconName = "alert-circle";
    iconColor = "#ef4444";
  } else if (type === "info") {
    iconName = "info";
    iconColor = "#3b82f6";
  }

  toast.innerHTML = `<i data-lucide="${iconName}" style="color:${iconColor}; width:18px; height:18px;"></i> <span>${message}</span>`;
  container.appendChild(toast);

  if (window.lucide) setTimeout(() => lucide.createIcons(), 20);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showConfirmModal({ title = "Confirm Action", message = "Are you sure you want to proceed?", confirmText = "Confirm", isDanger = true }) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");
    const titleEl = document.getElementById("confirmModalTitle");
    const msgEl = document.getElementById("confirmModalMessage");
    const btnSubmit = document.getElementById("confirmModalSubmitBtn");
    const btnCancel = document.getElementById("confirmModalCancelBtn");
    const iconEl = document.getElementById("confirmModalIcon");

    if (!modal) return resolve(false);

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (btnSubmit) {
      btnSubmit.textContent = confirmText;
      btnSubmit.style.background = isDanger ? "#ef4444" : "#1d61e7";
      btnSubmit.style.borderColor = isDanger ? "#ef4444" : "#1d61e7";
    }
    if (iconEl) {
      iconEl.innerHTML = isDanger ? `<i data-lucide="alert-triangle" style="color: #ef4444; width: 44px; height: 44px;"></i>` : `<i data-lucide="help-circle" style="color: #1d61e7; width: 44px; height: 44px;"></i>`;
    }

    modal.classList.add("active");
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);

    const cleanup = (result) => {
      modal.classList.remove("active");
      btnSubmit.onclick = null;
      btnCancel.onclick = null;
      resolve(result);
    };

    btnSubmit.onclick = () => cleanup(true);
    btnCancel.onclick = () => cleanup(false);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // Initialize All 3 Charts
  initAuditsOverTimeChart();
  initAuditsStatusChart();
  initCategoryShareChart();

  // Load Initial API Data
  loadDatabaseStats();
  loadEmployees();
  loadCallAudits();
  setupFormHandlers();
});

/* ==========================================================================
   INTERACTIVE DASHBOARD TOGGLES
   ========================================================================== */
function switchDashboardPeriod(period, btnEl) {
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }

  const totalEl = document.getElementById("stat-total-audits");
  const accEl = document.getElementById("stat-avg-accuracy");
  const passEl = document.getElementById("stat-pass-rate");
  const issueEl = document.getElementById("stat-issues-found");

  if (period === "WEEK") {
    if (totalEl) totalEl.textContent = "124";
    if (accEl) accEl.textContent = "92%";
    if (passEl) passEl.textContent = "89%";
    if (issueEl) issueEl.textContent = "16";
    updateChartData([22, 40, 30, 60, 52, 42, 32], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  } else if (period === "MONTH") {
    if (totalEl) totalEl.textContent = "486";
    if (accEl) accEl.textContent = "94%";
    if (passEl) passEl.textContent = "91%";
    if (issueEl) issueEl.textContent = "42";
    updateChartData([95, 110, 130, 151], ["W1", "W2", "W3", "W4"]);
  } else if (period === "YEAR") {
    if (totalEl) totalEl.textContent = "5,420";
    if (accEl) accEl.textContent = "95%";
    if (passEl) passEl.textContent = "93%";
    if (issueEl) issueEl.textContent = "380";
    updateChartData([350, 410, 480, 520, 590, 640, 710, 780, 840, 920, 990, 1050], ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  }
}

function updateChartPeriod(range, btnEl) {
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }

  if (range === "7D") {
    updateChartData([22, 40, 30, 60, 52, 42, 32], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  } else if (range === "30D") {
    updateChartData([12, 18, 25, 30, 35, 42, 48, 55, 62, 70, 75, 80, 86, 92, 100], ["1", "3", "5", "7", "9", "11", "13", "15", "17", "19", "21", "23", "25", "27", "29"]);
  } else if (range === "90D") {
    updateChartData([120, 180, 240, 310, 390, 450], ["M1", "M2", "M3", "M4", "M5", "M6"]);
  }
}

function filterDashboardAudits(status, btnEl) {
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }

  if (status === "ALL") {
    renderDashboardAuditsTable(auditsCache);
  } else {
    renderDashboardAuditsTable(auditsCache.filter((c) => c.status === status));
  }
}

/* ==========================================================================
   VIEW SWITCHER
   ========================================================================== */
function showView(viewName, e) {
  if (e) e.preventDefault();

  document.querySelectorAll(".sidebar-nav .nav-item").forEach((el) => el.classList.remove("active"));
  const targetNav = document.getElementById(`nav-${viewName}`);
  if (targetNav) targetNav.classList.add("active");

  document.querySelectorAll(".page-view").forEach((el) => el.classList.remove("active"));
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add("active");

  const titleEl = document.getElementById("page-title");
  const subEl = document.getElementById("page-subtitle");

  switch (viewName) {
    case "dashboard":
      titleEl.textContent = "Dashboard";
      subEl.textContent = "Welcome back, Admin! Here's what's happening today.";
      loadDatabaseStats();
      break;
    case "audits":
      titleEl.textContent = "Calls & Audits";
      subEl.textContent = "Inspect call recordings, speaker diarization, and transcripts.";
      loadCallAudits();
      break;
    case "employees":
      titleEl.textContent = "Employees & Agents Directory";
      subEl.textContent = "Manage staff profiles, department mappings, designations, and shifts.";
      loadEmployees();
      break;
    case "departments":
      titleEl.textContent = "Departments Management";
      subEl.textContent = "Create, edit, and organize organizational departments.";
      loadDepartments();
      break;
    case "designations":
      titleEl.textContent = "Designations & Roles";
      subEl.textContent = "Manage job titles, role codes, and department mappings.";
      loadDesignations();
      break;
    case "shifts":
      titleEl.textContent = "Work Shifts & Rosters";
      subEl.textContent = "Manage shift schedules, start/end times, and timezones.";
      loadShifts();
      break;
    case "voice-enrollment":
      titleEl.textContent = "Voice Enrollment Studio";
      subEl.textContent = "Register employee voice data, extract ECAPA-VoxCeleb vectors, and run speaker verification tests.";
      loadVoiceEnrollmentPage();
      break;
    default:
      titleEl.textContent = "Dashboard";
      subEl.textContent = "AI-Powered Call Analysis & Voice Audit";
  }

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

/* ==========================================================================
   CHARTS INITIALIZATION
   ========================================================================== */
function initAuditsOverTimeChart() {
  const ctx = document.getElementById("auditsOverTimeChart");
  if (!ctx) return;

  const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, "rgba(29, 97, 231, 0.25)");
  gradient.addColorStop(1, "rgba(29, 97, 231, 0.0)");

  auditsOverTimeChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      datasets: [
        {
          data: [22, 40, 30, 60, 52, 42, 32],
          borderColor: "#1d61e7",
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: [4, 4, 4, 6, 4, 4, 4],
          pointBackgroundColor: "#1d61e7",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#94a3b8", font: { size: 11 } } },
        y: { min: 0, max: 100, grid: { color: "#f1f5f9" }, ticks: { color: "#94a3b8", font: { size: 11 } } },
      },
    },
  });
}

function updateChartData(data, labels) {
  if (!auditsOverTimeChartInstance) return;
  auditsOverTimeChartInstance.data.labels = labels;
  auditsOverTimeChartInstance.data.datasets[0].data = data;
  auditsOverTimeChartInstance.update();
}

function initAuditsStatusChart() {
  const ctx = document.getElementById("auditsStatusChart");
  if (!ctx) return;

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Completed", "Pending", "Failed / Issues"],
      datasets: [
        {
          data: [89, 18, 17],
          backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "78%",
      plugins: { legend: { display: false } },
    },
  });
}

function initCategoryShareChart() {
  const ctx = document.getElementById("categoryShareChart");
  if (!ctx) return;

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Agent Comm.", "Customer Exp.", "Compliance", "Product Knowl."],
      datasets: [
        {
          data: [32, 28, 24, 20],
          backgroundColor: ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "78%",
      plugins: { legend: { display: false } },
    },
  });
}

/* ==========================================================================
   LIVE API LOADERS & DEPARTMENTS / DESIGNATIONS / SHIFTS CRUD
   ========================================================================== */
async function loadDatabaseStats() {
  try {
    const res = await fetch("/api/v1/voice-samples/summary/all");
    if (!res.ok) return;
    const data = await res.json();
    if (data.total_voice_samples !== undefined) {
      const el = document.getElementById("stat-total-audits");
      if (el) el.textContent = data.total_voice_samples > 0 ? data.total_voice_samples : "124";
    }
  } catch (err) {}
}

async function loadEmployees() {
  try {
    const res = await fetch("/api/v1/employees/");
    if (!res.ok) return;
    employeesCache = await res.json();

    const enrollSelect = document.getElementById("enrollEmployeeSelect");
    const auditSelect = document.getElementById("auditEmployeeSelect");
    const options = employeesCache.map((e) => `<option value="${e.id}">${e.first_name} ${e.last_name || ""} (${e.employee_code})</option>`).join("");

    if (enrollSelect) enrollSelect.innerHTML = options || `<option value="">No employees found</option>`;
    if (auditSelect) auditSelect.innerHTML = `<option value="">-- Open Identification (Milvus Auto-Match) --</option>` + options;
  } catch (err) {}
}

/* DEPARTMENTS */
async function loadDepartments() {
  const tbody = document.getElementById("departmentsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/api/v1/departments/");
    if (!res.ok) throw new Error("Failed");
    departmentsCache = await res.json();
    renderDepartmentsTable(departmentsCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: #ef4444; text-align: center;">Error loading departments</td></tr>`;
  }
}

function renderDepartmentsTable(list) {
  const tbody = document.getElementById("departmentsTableBody");
  
  const totalEl = document.getElementById("dept-stat-total");
  const activeEl = document.getElementById("dept-stat-active");
  const rolesEl = document.getElementById("dept-stat-roles");
  if (totalEl) totalEl.textContent = departmentsCache.length;
  if (activeEl) activeEl.textContent = departmentsCache.filter((d) => d.status === "ACTIVE").length;
  if (rolesEl) rolesEl.textContent = designationsCache.length || 0;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">No departments found. Click "+ Add Department" to create one.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((dept) => `
    <tr>
      <td><code>${dept.code}</code></td>
      <td><strong>${dept.name}</strong></td>
      <td>${dept.description || "N/A"}</td>
      <td><span class="status-pill ${dept.status === "ACTIVE" ? "badge-active" : "badge-inactive"}">${dept.status}</span></td>
      <td>
        <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditDepartmentModal('${dept.id}')">Edit</button>
        <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteDepartment('${dept.id}', '${dept.name}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

function filterDeptStatus(status, btnEl) {
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  if (status === "ALL") {
    renderDepartmentsTable(departmentsCache);
  } else {
    renderDepartmentsTable(departmentsCache.filter((d) => d.status === status));
  }
}

function openAddDepartmentModal() {
  document.getElementById("deptModalTitle").innerHTML = `<i data-lucide="building-2"></i> Add Department`;
  document.getElementById("deptId").value = "";
  document.getElementById("deptCode").value = "";
  document.getElementById("deptName").value = "";
  document.getElementById("deptStatus").value = "ACTIVE";
  document.getElementById("deptDescription").value = "";
  openModal("departmentModal");
}

function openEditDepartmentModal(id) {
  const dept = departmentsCache.find((d) => strId(d.id) === strId(id));
  if (!dept) return;
  document.getElementById("deptModalTitle").innerHTML = `<i data-lucide="edit"></i> Edit Department`;
  document.getElementById("deptId").value = dept.id;
  document.getElementById("deptCode").value = dept.code;
  document.getElementById("deptName").value = dept.name;
  document.getElementById("deptStatus").value = dept.status;
  document.getElementById("deptDescription").value = dept.description || "";
  openModal("departmentModal");
}

async function saveDepartment(e) {
  e.preventDefault();
  const id = document.getElementById("deptId").value;
  const payload = {
    code: document.getElementById("deptCode").value.trim(),
    name: document.getElementById("deptName").value.trim(),
    status: document.getElementById("deptStatus").value,
    description: document.getElementById("deptDescription").value.trim() || null,
  };
  try {
    const url = id ? `/api/v1/departments/${id}` : "/api/v1/departments/";
    const method = id ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Failed to save department");
    showToast(id ? "Department updated successfully" : "New department created", "success");
    closeModal("departmentModal");
    loadDepartments();
  } catch (err) { showToast("Error saving department: " + err.message, "error"); }
}

async function deleteDepartment(id, name) {
  const confirmed = await showConfirmModal({
    title: "Delete Department",
    message: `Are you sure you want to delete department '${name}'?`,
    confirmText: "Delete Department",
    isDanger: true
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/departments/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(`Department '${name}' deleted`, "success");
      loadDepartments();
    } else {
      showToast("Failed to delete department", "error");
    }
  } catch (err) { showToast("Error deleting department", "error"); }
}

/* DESIGNATIONS */
async function loadDesignations() {
  const tbody = document.getElementById("designationsTableBody");
  if (!tbody) return;
  try {
    if (departmentsCache.length === 0) {
      const deptRes = await fetch("/api/v1/departments/");
      if (deptRes.ok) departmentsCache = await deptRes.json();
    }
    const res = await fetch("/api/v1/designations/");
    if (!res.ok) throw new Error("Failed");
    designationsCache = await res.json();
    renderDesignationsTable(designationsCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: #ef4444; text-align: center;">Error loading designations</td></tr>`;
  }
}

function renderDesignationsTable(list) {
  const tbody = document.getElementById("designationsTableBody");

  const totalEl = document.getElementById("desig-stat-total");
  const activeEl = document.getElementById("desig-stat-active");
  const mappedEl = document.getElementById("desig-stat-mapped");
  const genEl = document.getElementById("desig-stat-general");
  if (totalEl) totalEl.textContent = designationsCache.length;
  if (activeEl) activeEl.textContent = designationsCache.filter((d) => d.status === "ACTIVE").length;
  if (mappedEl) mappedEl.textContent = designationsCache.filter((d) => d.department_id).length;
  if (genEl) genEl.textContent = designationsCache.filter((d) => !d.department_id).length;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">No designations found. Click "+ Add Designation" to create one.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((desig) => {
    const dept = departmentsCache.find((d) => strId(d.id) === strId(desig.department_id));
    return `
      <tr>
        <td><code>${desig.code}</code></td>
        <td><strong>${desig.name}</strong></td>
        <td>${dept ? dept.name : "General"}</td>
        <td>${desig.description || "N/A"}</td>
        <td><span class="status-pill ${desig.status === "ACTIVE" ? "badge-active" : "badge-inactive"}">${desig.status}</span></td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditDesignationModal('${desig.id}')">Edit</button>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteDesignation('${desig.id}', '${desig.name}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

function filterDesigStatus(status, btnEl) {
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  if (status === "ALL") {
    renderDesignationsTable(designationsCache);
  } else {
    renderDesignationsTable(designationsCache.filter((d) => d.status === status));
  }
}

function openAddDesignationModal() {
  document.getElementById("desigModalTitle").innerHTML = `<i data-lucide="award"></i> Add Designation`;
  document.getElementById("desigId").value = "";
  document.getElementById("desigCode").value = "";
  document.getElementById("desigName").value = "";
  document.getElementById("desigStatus").value = "ACTIVE";
  document.getElementById("desigDescription").value = "";
  openModal("designationModal");
}

function openEditDesignationModal(id) {
  const desig = designationsCache.find((d) => strId(d.id) === strId(id));
  if (!desig) return;
  document.getElementById("desigModalTitle").innerHTML = `<i data-lucide="edit"></i> Edit Designation`;
  document.getElementById("desigId").value = desig.id;
  document.getElementById("desigCode").value = desig.code;
  document.getElementById("desigName").value = desig.name;
  document.getElementById("desigStatus").value = desig.status;
  document.getElementById("desigDescription").value = desig.description || "";
  openModal("designationModal");
}

async function saveDesignation(e) {
  e.preventDefault();
  const id = document.getElementById("desigId").value;
  const payload = {
    code: document.getElementById("desigCode").value.trim(),
    name: document.getElementById("desigName").value.trim(),
    department_id: document.getElementById("desigDeptSelect").value || null,
    status: document.getElementById("desigStatus").value,
    description: document.getElementById("desigDescription").value.trim() || null,
  };
  try {
    const url = id ? `/api/v1/designations/${id}` : "/api/v1/designations/";
    const method = id ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Failed to save designation");
    showToast(id ? "Designation updated" : "New designation created", "success");
    closeModal("designationModal");
    loadDesignations();
  } catch (err) { showToast("Error saving designation", "error"); }
}

async function deleteDesignation(id, name) {
  const confirmed = await showConfirmModal({
    title: "Delete Designation",
    message: `Are you sure you want to delete designation '${name}'?`,
    confirmText: "Delete Designation",
    isDanger: true
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/designations/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(`Designation '${name}' deleted`, "success");
      loadDesignations();
    } else {
      showToast("Failed to delete designation", "error");
    }
  } catch (err) { showToast("Error deleting designation", "error"); }
}

/* SHIFTS */
async function loadShifts() {
  const tbody = document.getElementById("shiftsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/api/v1/shifts/");
    if (!res.ok) throw new Error("Failed");
    shiftsCache = await res.json();
    renderShiftsTable(shiftsCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error loading shifts</td></tr>`;
  }
}

function renderShiftsTable(list) {
  const tbody = document.getElementById("shiftsTableBody");

  const totalEl = document.getElementById("shift-stat-total");
  const activeEl = document.getElementById("shift-stat-active");
  if (totalEl) totalEl.textContent = shiftsCache.length;
  if (activeEl) activeEl.textContent = shiftsCache.filter((s) => s.status === "ACTIVE").length;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No shifts found. Click "+ Add Shift" or "Seed Defaults".</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((s) => `
    <tr>
      <td><code>${s.code}</code></td>
      <td><strong>${s.name}</strong></td>
      <td><span class="status-pill badge-active">🕒 ${s.start_time}</span></td>
      <td><span class="status-pill badge-inactive">🌙 ${s.end_time}</span></td>
      <td><small>${s.timezone}</small></td>
      <td><span class="status-pill ${s.status === "ACTIVE" ? "badge-active" : "badge-inactive"}">${s.status}</span></td>
      <td>
        <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditShiftModal('${s.id}')">Edit</button>
        <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteShift('${s.id}', '${s.name}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

function filterShiftStatus(status, btnEl) {
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  if (status === "ALL") {
    renderShiftsTable(shiftsCache);
  } else {
    renderShiftsTable(shiftsCache.filter((s) => s.status === status));
  }
}

function openAddShiftModal() {
  document.getElementById("shiftModalTitle").innerHTML = `<i data-lucide="clock"></i> Add Work Shift`;
  document.getElementById("shiftId").value = "";
  document.getElementById("shiftCode").value = "";
  document.getElementById("shiftName").value = "";
  document.getElementById("shiftStartTime").value = "09:00";
  document.getElementById("shiftEndTime").value = "17:00";
  document.getElementById("shiftTimezone").value = "UTC";
  document.getElementById("shiftStatus").value = "ACTIVE";
  openModal("shiftModal");
}

function openEditShiftModal(id) {
  const s = shiftsCache.find((x) => strId(x.id) === strId(id));
  if (!s) return;
  document.getElementById("shiftModalTitle").innerHTML = `<i data-lucide="edit"></i> Edit Work Shift`;
  document.getElementById("shiftId").value = s.id;
  document.getElementById("shiftCode").value = s.code;
  document.getElementById("shiftName").value = s.name;
  document.getElementById("shiftStartTime").value = s.start_time;
  document.getElementById("shiftEndTime").value = s.end_time;
  document.getElementById("shiftTimezone").value = s.timezone;
  document.getElementById("shiftStatus").value = s.status;
  openModal("shiftModal");
}

async function saveShift(e) {
  e.preventDefault();
  const id = document.getElementById("shiftId").value;
  const fmtTime = (t) => (t.length === 5 ? `${t}:00` : t);
  const payload = {
    code: document.getElementById("shiftCode").value.trim(),
    name: document.getElementById("shiftName").value.trim(),
    start_time: fmtTime(document.getElementById("shiftStartTime").value),
    end_time: fmtTime(document.getElementById("shiftEndTime").value),
    timezone: document.getElementById("shiftTimezone").value.trim() || "UTC",
    status: document.getElementById("shiftStatus").value,
  };
  try {
    const url = id ? `/api/v1/shifts/${id}` : "/api/v1/shifts/";
    const method = id ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Failed");
    showToast(id ? "Shift updated successfully" : "New shift created", "success");
    closeModal("shiftModal");
    loadShifts();
  } catch (err) { showToast("Error saving shift", "error"); }
}

async function deleteShift(id, name) {
  const confirmed = await showConfirmModal({
    title: "Delete Work Shift",
    message: `Are you sure you want to delete shift '${name}'?`,
    confirmText: "Delete Shift",
    isDanger: true
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/shifts/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(`Shift '${name}' deleted`, "success");
      loadShifts();
    } else {
      showToast("Failed to delete shift", "error");
    }
  } catch (err) { showToast("Error deleting shift", "error"); }
}

async function seedDefaultShifts() {
  try {
    await fetch("/api/v1/shifts/seed", { method: "POST" });
    loadShifts();
  } catch (err) {}
}

/* CALL AUDITS */
async function loadCallAudits() {
  const tbody = document.getElementById("auditsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/api/v1/calls/");
    if (!res.ok) throw new Error("Failed");
    auditsCache = await res.json();
    renderAuditsTable(auditsCache);
    renderDashboardAuditsTable(auditsCache);
  } catch (err) {}
}

function renderAuditsTable(list) {
  const tbody = document.getElementById("auditsTableBody");
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No call audits found. Click "New Audit" to submit a recording.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((c) => {
    const statusClass = c.status === "COMPLETED" ? "badge-completed" : c.status === "PROCESSING" ? "badge-pending" : "badge-failed";
    const agent = c.transcript_json?.speaker_mappings?.SPEAKER_AGENT || "Customer";
    return `
      <tr style="cursor: pointer;" onclick="openTranscriptModal('${c.id}')">
        <td><code>${c.id.substring(0, 8)}...</code></td>
        <td><strong>${c.duration_seconds ? c.duration_seconds + "s" : "--"}</strong></td>
        <td><small>${c.detected_language || "en"}</small></td>
        <td>${c.speakers_count || 2}</td>
        <td><strong>${agent}</strong></td>
        <td><span class="status-pill ${statusClass}">${c.status}</span></td>
        <td><button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="event.stopPropagation(); openTranscriptModal('${c.id}')">View</button></td>
      </tr>
    `;
  }).join("");
}

function renderDashboardAuditsTable(list) {
  const tbody = document.getElementById("dashAuditsBody");
  if (!tbody || !list || list.length === 0) return;

  tbody.innerHTML = list.slice(0, 5).map((c) => {
    const statusClass = c.status === "COMPLETED" ? "badge-completed" : c.status === "PROCESSING" ? "badge-pending" : "badge-failed";
    const agent = c.transcript_json?.speaker_mappings?.SPEAKER_AGENT || "Vijay Rajput";
    const created = c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently";
    return `
      <tr style="cursor: pointer;" onclick="openTranscriptModal('${c.id}')">
        <td><code>AUD-${c.id.substring(0, 6)}</code></td>
        <td><code>CALL-${c.id.substring(0, 6)}</code></td>
        <td><strong>${agent}</strong></td>
        <td><span class="status-pill ${statusClass}">${c.status}</span></td>
        <td><strong>${c.qa_score ? c.qa_score + "%" : "92%"}</strong></td>
        <td>${created}</td>
      </tr>
    `;
  }).join("");
}

async function openTranscriptModal(callId) {
  openModal("transcriptModal");
  const contentEl = document.getElementById("transcriptModalContent");
  contentEl.innerHTML = "<p>Loading speaker-attributed transcript...</p>";
  try {
    const res = await fetch(`/api/v1/calls/${callId}`);
    if (!res.ok) throw new Error("Failed");
    const call = await res.json();
    const turns = call.transcript_json?.turns || [];

    let html = `<div style="margin-bottom: 16px;"><h4>Call ID: <code>${call.id}</code></h4><p>Duration: ${call.duration_seconds || "--"}s | Language: ${call.detected_language || "en"}</p></div>`;
    if (turns.length > 0) {
      html += `<div style="display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto;">`;
      turns.forEach((t) => {
        const isAgent = t.speaker_name !== "Customer" && !t.speaker_name.startsWith("Customer");
        const color = isAgent ? "#1d61e7" : "#059669";
        html += `<div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 10px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <strong style="color: ${color}; font-size:12px;">${t.speaker_name}</strong>
            <small style="color:#94a3b8;">[${t.start}s - ${t.end}s]</small>
          </div>
          <p style="font-size:13.5px; color:#1e293b;">${t.text}</p>
        </div>`;
      });
      html += `</div>`;
    } else { html += `<p>No transcript turns available.</p>`; }
    contentEl.innerHTML = html;
  } catch (err) { contentEl.innerHTML = `<p style="color:#ef4444;">Error loading transcript</p>`; }
}

function openModal(id) { document.getElementById(id)?.classList.add("active"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("active"); }
function openEnrollmentModal(e) { if(e) e.preventDefault(); loadEmployees(); openModal("enrollmentModal"); }
function openAuditModal() { loadEmployees(); openModal("auditModal"); }
async function openVoiceSummaryModal(e) { if(e) e.preventDefault(); openModal("voiceSummaryModal"); }

function setupFormHandlers() {
  document.getElementById("auditForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("auditFile");
    const empSelect = document.getElementById("auditEmployeeSelect");
    if (!fileInput.files || fileInput.files.length === 0) return alert("Select file");
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    if (empSelect && empSelect.value) formData.append("expected_employee_id", empSelect.value);
    try {
      const res = await fetch("/api/v1/calls/process", { method: "POST", body: formData });
      if (res.ok) {
        alert("Call submitted for processing!");
        closeModal("auditModal");
        showView("audits");
      }
    } catch (err) { alert("Error connecting"); }
  });
}

function strId(id) { return id ? String(id).toLowerCase() : ""; }

/* ==========================================================================
   EMPLOYEE MANAGEMENT LOGIC
   ========================================================================== */

let voiceProfilesCache = [];
let callsCache = [];

async function loadEmployees() {
  const tbody = document.getElementById("employeesTableBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="loading-cell">Loading employees...</td></tr>`;

  try {
    const [empRes, deptRes, desigRes, shiftRes, voiceRes, callsRes] = await Promise.all([
      fetch("/api/v1/employees/"),
      fetch("/api/v1/departments/"),
      fetch("/api/v1/designations/"),
      fetch("/api/v1/shifts/"),
      fetch("/api/v1/voice-samples/summary/all"),
      fetch("/api/v1/calls/")
    ]);

    if (empRes.ok) employeesCache = await empRes.json();
    if (deptRes.ok) departmentsCache = await deptRes.json();
    if (desigRes.ok) designationsCache = await desigRes.json();
    if (shiftRes.ok) shiftsCache = await shiftRes.json();
    if (voiceRes.ok) {
      const summary = await voiceRes.json();
      voiceProfilesCache = summary.profiles || [];
    }
    if (callsRes.ok) callsCache = await callsRes.json();

    populateDropdowns();
    renderEmployeesTable(employeesCache);
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="color: #ef4444; text-align: center;">Error loading employees</td></tr>`;
  }
}

function populateDropdowns() {
  const empDeptSel = document.getElementById("empDeptSelect");
  if (empDeptSel) {
    empDeptSel.innerHTML = `<option value="">-- Select Department --</option>` +
      departmentsCache.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join("");
  }

  const empDesigSel = document.getElementById("empDesigSelect");
  if (empDesigSel) {
    empDesigSel.innerHTML = `<option value="">-- Select Designation --</option>` +
      designationsCache.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join("");
  }

  const empShiftSel = document.getElementById("empShiftSelect");
  if (empShiftSel) {
    empShiftSel.innerHTML = `<option value="">-- Select Shift --</option>` +
      shiftsCache.map(s => `<option value="${s.id}">${s.name} (${s.code})</option>`).join("");
  }

  const empDeptFilter = document.getElementById("empDeptFilter");
  if (empDeptFilter) {
    empDeptFilter.innerHTML = `<option value="">All Departments</option>` +
      departmentsCache.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  }

  const empDesigFilter = document.getElementById("empDesigFilter");
  if (empDesigFilter) {
    empDesigFilter.innerHTML = `<option value="">All Roles</option>` +
      designationsCache.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  }

  const auditEmpSel = document.getElementById("auditEmployeeSelect");
  if (auditEmpSel) {
    auditEmpSel.innerHTML = `<option value="">-- Open Identification (Milvus Auto-Match) --</option>` +
      employeesCache.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name || ""} (${e.employee_code})</option>`).join("");
  }
  const enrollEmpSel = document.getElementById("enrollEmployeeSelect");
  if (enrollEmpSel) {
    enrollEmpSel.innerHTML = `<option value="">-- Select Employee --</option>` +
      employeesCache.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name || ""} (${e.employee_code})</option>`).join("");
  }
}

function renderEmployeesTable(list) {
  const tbody = document.getElementById("employeesTableBody");
  if (!tbody) return;

  const totalEl = document.getElementById("empMetricTotal");
  const activeEl = document.getElementById("empMetricActive");
  const voiceEl = document.getElementById("empMetricVoice");
  const deptsEl = document.getElementById("empMetricDepts");

  if (totalEl) totalEl.textContent = list.length;
  if (activeEl) activeEl.textContent = list.filter(e => e.status === "ACTIVE").length;
  if (voiceEl) voiceEl.textContent = voiceProfilesCache.filter(v => v.total_samples > 0).length;
  if (deptsEl) deptsEl.textContent = new Set(list.map(e => e.department_id).filter(Boolean)).size;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="loading-cell">No employees found. Click "+ Add Employee" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(emp => {
    const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "--";
    const desig = designationsCache.find(d => strId(d.id) === strId(emp.designation_id))?.name || "--";
    const shift = shiftsCache.find(s => strId(s.id) === strId(emp.shift_id))?.name || "--";
    const fullName = `${emp.first_name} ${emp.last_name || ""}`.trim();
    const initials = `${emp.first_name[0] || ""}${emp.last_name ? emp.last_name[0] : ""}`.toUpperCase() || "EP";
    const contactInfo = emp.email || emp.phone || "--";
    const statusClass = emp.status === "ACTIVE" ? "badge-completed" : "badge-inactive";
    const subName = emp.father_name ? `<br><small style="color: #64748b; font-size: 11px;">S/o ${emp.father_name}</small>` : "";

    // Voice profile badge
    const vProf = voiceProfilesCache.find(v => strId(v.employee_id) === strId(emp.id));
    const sampleCount = vProf ? vProf.total_samples : 0;
    const voiceBadge = sampleCount > 0 
      ? `<span class="status-pill badge-completed" style="font-size:11px;"><i data-lucide="mic" style="width:11px;"></i> ${sampleCount} Clip(s)</span>`
      : `<span class="status-pill badge-inactive" style="font-size:11px;">No Voice</span>`;

    // QA Call Performance calculation
    const empCalls = callsCache.filter(c => strId(c.identified_employee_id) === strId(emp.id) || strId(c.expected_employee_id) === strId(emp.id));
    const qaScores = empCalls.map(c => c.qa_score).filter(s => s !== null && s !== undefined);
    const avgQa = qaScores.length > 0 ? Math.round(qaScores.reduce((a, b) => a + b, 0) / qaScores.length) : null;

    const qaBadge = avgQa !== null
      ? `<span class="status-pill badge-completed" style="font-size:11px;"><i data-lucide="award" style="width:11px;"></i> ${avgQa}% QA (${empCalls.length})</span>`
      : `<span class="status-pill badge-pending" style="font-size:11px;">No Audits</span>`;

    const avatarHtml = `
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:32px; height:32px; border-radius:8px; background:linear-gradient(135deg, #1d61e7, #3b82f6); color:#fff; font-size:11.5px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${initials}
        </div>
        <div>
          <strong>${fullName}</strong>${subName}
        </div>
      </div>
    `;

    return `
      <tr>
        <td><code>${emp.employee_code}</code></td>
        <td>${avatarHtml}</td>
        <td><small>${contactInfo}</small></td>
        <td>${dept}</td>
        <td>${desig}</td>
        <td>${shift}</td>
        <td>${qaBadge}</td>
        <td>${voiceBadge}</td>
        <td><span class="status-pill ${statusClass}">${emp.status}</span></td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEmployeeProfileModal('${emp.id}')">Profile</button>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditEmployeeModal('${emp.id}')">Edit</button>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteEmployee('${emp.id}', '${fullName}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

let currentEmpStatusFilter = "ALL";

function filterEmpStatus(status, btn) {
  currentEmpStatusFilter = status;
  document.querySelectorAll("#view-employees .time-range-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  filterEmployees();
}

function filterEmployees() {
  const query = document.getElementById("empSearchInput")?.value.toLowerCase().trim() || "";
  const deptFilter = document.getElementById("empDeptFilter")?.value || "";
  const desigFilter = document.getElementById("empDesigFilter")?.value || "";

  const filtered = employeesCache.filter(e => {
    const code = (e.employee_code || "").toLowerCase();
    const fname = (e.first_name || "").toLowerCase();
    const lname = (e.last_name || "").toLowerCase();
    const faname = (e.father_name || "").toLowerCase();
    const fullName = `${fname} ${lname}`.trim();
    const email = (e.email || "").toLowerCase();
    const phone = (e.phone || "").toLowerCase();
    const location = (e.location || "").toLowerCase();

    const deptName = (departmentsCache.find(d => strId(d.id) === strId(e.department_id))?.name || "").toLowerCase();
    const desigName = (designationsCache.find(d => strId(d.id) === strId(e.designation_id))?.name || "").toLowerCase();

    const matchQuery = !query ||
      code.includes(query) ||
      fname.includes(query) ||
      lname.includes(query) ||
      fullName.includes(query) ||
      faname.includes(query) ||
      email.includes(query) ||
      phone.includes(query) ||
      location.includes(query) ||
      deptName.includes(query) ||
      desigName.includes(query);

    const matchDept = !deptFilter || strId(e.department_id) === strId(deptFilter);
    const matchDesig = !desigFilter || strId(e.designation_id) === strId(desigFilter);
    const matchStatus = currentEmpStatusFilter === "ALL" || e.status === currentEmpStatusFilter;

    return matchQuery && matchDept && matchDesig && matchStatus;
  });

  renderEmployeesTable(filtered);
}

function exportEmployeesCSV() {
  if (!employeesCache || employeesCache.length === 0) {
    return showToast("No employees to export", "error");
  }

  const headers = ["Employee Code", "First Name", "Last Name", "Father Name", "Date of Birth", "Email", "Phone", "Date of Joining", "Department", "Designation", "Shift", "Location", "Status"];
  const rows = employeesCache.map(e => {
    const dept = departmentsCache.find(d => strId(d.id) === strId(e.department_id))?.name || "";
    const desig = designationsCache.find(d => strId(d.id) === strId(e.designation_id))?.name || "";
    const shift = shiftsCache.find(s => strId(s.id) === strId(e.shift_id))?.name || "";
    const dob = e.date_of_birth ? String(e.date_of_birth).split("T")[0] : "";
    const doj = e.date_of_joining ? String(e.date_of_joining).split("T")[0] : "";

    return [
      `"${e.employee_code || ''}"`,
      `"${e.first_name || ''}"`,
      `"${e.last_name || ''}"`,
      `"${e.father_name || ''}"`,
      `"${dob}"`,
      `"${e.email || ''}"`,
      `"${e.phone || ''}"`,
      `"${doj}"`,
      `"${dept}"`,
      `"${desig}"`,
      `"${shift}"`,
      `"${e.location || ''}"`,
      `"${e.status || ''}"`
    ].join(",");
  });

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `VoxAudit_Employees_Directory_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Employees directory exported to CSV", "success");
}

async function openEmployeeProfileModal(id) {
  const emp = employeesCache.find(e => strId(e.id) === strId(id));
  if (!emp) return;

  const fullName = `${emp.first_name} ${emp.last_name || ""}`.trim();
  const initials = `${emp.first_name[0] || ""}${emp.last_name ? emp.last_name[0] : ""}`.toUpperCase() || "EP";
  const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "--";
  const desig = designationsCache.find(d => strId(d.id) === strId(emp.designation_id))?.name || "--";
  const shift = shiftsCache.find(s => strId(s.id) === strId(emp.shift_id))?.name || "--";
  const dob = emp.date_of_birth ? String(emp.date_of_birth).split("T")[0] : "Not Specified";
  const doj = emp.date_of_joining ? String(emp.date_of_joining).split("T")[0] : "--";

  document.getElementById("empProfileAvatar").textContent = initials;
  document.getElementById("empProfileTitle").textContent = fullName;
  document.getElementById("empProfileCodeBadge").textContent = emp.employee_code || "AGNT-000000";

  const content = document.getElementById("employeeProfileContent");
  content.innerHTML = `<p style="text-align:center; padding: 20px; color:#64748b;">Loading profile details and voice embeddings...</p>`;

  openModal("employeeProfileModal");

  let voiceSamples = [];
  try {
    const res = await fetch(`/api/v1/voice-samples/employee/${emp.id}`);
    if (res.ok) voiceSamples = await res.json();
  } catch (err) {}

  const voiceCount = voiceSamples.length;
  const isEnrolled = voiceCount > 0;
  const voiceBadge = isEnrolled
    ? `<span class="status-pill badge-completed">ENROLLED (${voiceCount} Clips)</span>`
    : `<span class="status-pill badge-inactive">NOT ENROLLED</span>`;

  let samplesListHtml = isEnrolled
    ? voiceSamples.map(s => `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="font-size:13px; color:#1e293b;">${s.original_file_name || s.code}</strong>
            <div style="font-size:11px; color:#64748b;">Format: ${s.audio_format || "wav"} | Duration: ${s.duration_seconds ? Math.round(s.duration_seconds) + "s" : "--"} | Vector ID: <code>${s.embedding_id ? String(s.embedding_id).substring(0, 8) + "..." : "192D"}</code></div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="status-pill badge-completed" style="font-size:11px;">${s.status}</span>
            <button class="btn-secondary" style="padding:4px 8px; font-size:11px; color:#ef4444;" onclick="deleteSingleVoiceSample('${s.id}', '${s.original_file_name || s.code}', '${emp.id}', '${fullName}')">Delete Clip</button>
          </div>
        </div>
      `).join("")
    : `<p style="font-size:13px; color:#64748b; margin:0;">No voice samples enrolled yet. Go to Voice Enrollment tab to register voice samples.</p>`;

  content.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
      
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <h4 style="font-size:13px; font-weight:700; color:#1d61e7; margin-bottom:12px; display:flex; align-items:center; gap:6px;"><i data-lucide="user"></i> Personal & Contact Info</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size:12.5px;">
          <div><span style="color:#64748b;">Father's Name:</span><br><strong>${emp.father_name || "--"}</strong></div>
          <div><span style="color:#64748b;">Date of Birth:</span><br><strong>${dob}</strong></div>
          <div><span style="color:#64748b;">Email:</span><br><strong>${emp.email || "--"}</strong></div>
          <div><span style="color:#64748b;">Phone:</span><br><strong>${emp.phone || "--"}</strong></div>
          <div><span style="color:#64748b;">Location:</span><br><strong>${emp.location || "--"}</strong></div>
          <div><span style="color:#64748b;">Status:</span><br><strong style="color:${emp.status === 'ACTIVE' ? '#059669':'#ef4444'};">${emp.status}</strong></div>
        </div>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <h4 style="font-size:13px; font-weight:700; color:#1d61e7; margin-bottom:12px; display:flex; align-items:center; gap:6px;"><i data-lucide="building-2"></i> Organization Mapping</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size:12.5px;">
          <div><span style="color:#64748b;">Department:</span><br><strong>${dept}</strong></div>
          <div><span style="color:#64748b;">Designation:</span><br><strong>${desig}</strong></div>
          <div><span style="color:#64748b;">Shift Schedule:</span><br><strong>${shift}</strong></div>
          <div><span style="color:#64748b;">Joining Date:</span><br><strong>${doj}</strong></div>
        </div>
      </div>

    </div>

    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h4 style="font-size:13px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:6px;"><i data-lucide="mic"></i> Enrolled Voice Samples</h4>
        ${voiceBadge}
      </div>
      ${samplesListHtml}
    </div>

    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; padding-top:14px; border-top:1px solid #e2e8f0;">
      <button class="btn-secondary" onclick="closeModal('employeeProfileModal')">Close</button>
      <button class="btn-primary" onclick="closeModal('employeeProfileModal'); selectEmployeeForEnrollment('${emp.id}'); showView('voice-enrollment');">+ Add Voice Sample</button>
    </div>
  `;

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function openAddEmployeeModal() {
  document.getElementById("empModalTitle").innerHTML = `<i data-lucide="users"></i> Add Employee`;
  document.getElementById("empId").value = "";
  document.getElementById("empCode").value = "";
  document.getElementById("empFirstName").value = "";
  document.getElementById("empLastName").value = "";
  document.getElementById("empFatherName").value = "";
  document.getElementById("empDateOfBirth").value = "";
  document.getElementById("empEmail").value = "";
  document.getElementById("empPhone").value = "";
  document.getElementById("empDateJoining").value = new Date().toISOString().split("T")[0];
  document.getElementById("empLocation").value = "";
  document.getElementById("empStatus").value = "ACTIVE";

  populateDropdowns();
  openModal("employeeModal");
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function openEditEmployeeModal(id) {
  const emp = employeesCache.find(e => strId(e.id) === strId(id));
  if (!emp) return;

  document.getElementById("empModalTitle").innerHTML = `<i data-lucide="edit"></i> Edit Employee`;
  document.getElementById("empId").value = emp.id;
  document.getElementById("empCode").value = emp.employee_code || "";
  document.getElementById("empFirstName").value = emp.first_name || "";
  document.getElementById("empLastName").value = emp.last_name || "";
  document.getElementById("empFatherName").value = emp.father_name || "";
  document.getElementById("empDateOfBirth").value = emp.date_of_birth ? String(emp.date_of_birth).split("T")[0] : "";
  document.getElementById("empEmail").value = emp.email || "";
  document.getElementById("empPhone").value = emp.phone || "";
  document.getElementById("empDateJoining").value = emp.date_of_joining ? String(emp.date_of_joining).split("T")[0] : new Date().toISOString().split("T")[0];
  document.getElementById("empLocation").value = emp.location || "";
  document.getElementById("empStatus").value = emp.status || "ACTIVE";

  populateDropdowns();
  if (emp.department_id) document.getElementById("empDeptSelect").value = emp.department_id;
  if (emp.designation_id) document.getElementById("empDesigSelect").value = emp.designation_id;
  if (emp.shift_id) document.getElementById("empShiftSelect").value = emp.shift_id;

  openModal("employeeModal");
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

async function saveEmployee(e) {
  e.preventDefault();
  const id = document.getElementById("empId").value;
  const codeVal = document.getElementById("empCode").value.trim();

  const payload = {
    first_name: document.getElementById("empFirstName").value.trim(),
    last_name: document.getElementById("empLastName").value.trim() || null,
    father_name: document.getElementById("empFatherName").value.trim() || null,
    date_of_birth: document.getElementById("empDateOfBirth").value || null,
    email: document.getElementById("empEmail").value.trim() || null,
    phone: document.getElementById("empPhone").value.trim() || null,
    date_of_joining: document.getElementById("empDateJoining").value,
    department_id: document.getElementById("empDeptSelect").value || null,
    designation_id: document.getElementById("empDesigSelect").value || null,
    shift_id: document.getElementById("empShiftSelect").value || null,
    location: document.getElementById("empLocation").value.trim() || null,
    status: document.getElementById("empStatus").value,
  };

  if (codeVal) payload.employee_code = codeVal;

  try {
    const url = id ? `/api/v1/employees/${id}` : "/api/v1/employees/";
    const method = id ? "PATCH" : "POST";

    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.detail || "Failed to save employee");
    }
    closeModal("employeeModal");
    showToast(id ? "Employee profile updated" : "New employee added successfully", "success");
    loadEmployees();
  } catch (err) {
    showToast("Error saving employee: " + err.message, "error");
  }
}

async function deleteEmployee(id, name) {
  const confirmed = await showConfirmModal({
    title: "Delete Employee Profile",
    message: `Are you sure you want to delete employee '${name}'? This will also clean up associated voice embeddings.`,
    confirmText: "Delete Profile",
    isDanger: true
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/employees/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    showToast(`Employee profile '${name}' deleted`, "success");
    loadEmployees();
  } catch (err) {
    showToast("Error deleting employee profile", "error");
  }
}

/* ==========================================================================
   VOICE ENROLLMENT & BIOMETRICS STUDIO LOGIC
   ========================================================================== */

let enrollMode = "upload";
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let micTimerInterval = null;
let recordingSeconds = 0;

function setEnrollMode(mode) {
  enrollMode = mode;
  const btnUpload = document.getElementById("btnModeUpload");
  const btnMic = document.getElementById("btnModeMic");
  const uploadArea = document.getElementById("enrollUploadArea");
  const micArea = document.getElementById("enrollMicArea");

  if (mode === "upload") {
    if (btnUpload) btnUpload.classList.add("active");
    if (btnMic) btnMic.classList.remove("active");
    if (uploadArea) uploadArea.style.display = "block";
    if (micArea) micArea.style.display = "none";
  } else {
    if (btnMic) btnMic.classList.add("active");
    if (btnUpload) btnUpload.classList.remove("active");
    if (uploadArea) uploadArea.style.display = "none";
    if (micArea) micArea.style.display = "block";
  }
}

async function loadVoiceEnrollmentPage() {
  const tbody = document.getElementById("veDirectoryTableBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Loading enrolled voice directory...</td></tr>`;

  try {
    const [empRes, summaryRes, deptRes] = await Promise.all([
      fetch("/api/v1/employees/"),
      fetch("/api/v1/voice-samples/summary/all"),
      fetch("/api/v1/departments/")
    ]);

    if (empRes.ok) employeesCache = await empRes.json();
    if (deptRes.ok) departmentsCache = await deptRes.json();

    let summaryData = null;
    if (summaryRes.ok) summaryData = await summaryRes.json();

    populateVoiceEnrollmentDropdowns();
    renderVoiceEnrollmentDirectory(summaryData);
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error loading voice enrollment directory</td></tr>`;
  }
}

function populateVoiceEnrollmentDropdowns() {
  const veEmpSel = document.getElementById("veEmployeeSelect");
  if (veEmpSel) {
    veEmpSel.innerHTML = `<option value="">-- Select Target Employee --</option>` +
      employeesCache.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name || ""} (${e.employee_code})</option>`).join("");
  }

  const verTargetSel = document.getElementById("verifyTargetSelect");
  if (verTargetSel) {
    verTargetSel.innerHTML = `<option value="">-- Open Identification (1:N Search Across All) --</option>` +
      employeesCache.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name || ""} (${e.employee_code})</option>`).join("");
  }
}

function renderVoiceEnrollmentDirectory(summaryData) {
  const tbody = document.getElementById("veDirectoryTableBody");
  if (!tbody) return;

  const agentsMetric = document.getElementById("veMetricAgents");
  const samplesMetric = document.getElementById("veMetricSamples");
  const vectorsMetric = document.getElementById("veMetricVectors");
  const durationMetric = document.getElementById("veMetricDuration");

  if (!summaryData) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No voice enrollment summary data available.</td></tr>`;
    return;
  }

  const profiles = summaryData.profiles || [];

  let cumulativeDurationSec = 0;
  profiles.forEach(p => {
    (p.samples || []).forEach(s => {
      if (s.duration_seconds) cumulativeDurationSec += s.duration_seconds;
    });
  });

  if (agentsMetric) agentsMetric.textContent = summaryData.total_employees_enrolled || 0;
  if (samplesMetric) samplesMetric.textContent = summaryData.total_voice_samples || 0;
  if (vectorsMetric) vectorsMetric.textContent = summaryData.total_vectors || 0;
  if (durationMetric) {
    const totalSec = Math.round(cumulativeDurationSec);
    durationMetric.textContent = totalSec > 60 ? `${Math.floor(totalSec / 60)}m ${totalSec % 60}s` : `${totalSec}s`;
  }

  if (profiles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No employees registered. Go to Employees tab to create employees first.</td></tr>`;
    return;
  }

  tbody.innerHTML = profiles.map(prof => {
    const fullName = `${prof.first_name} ${prof.last_name || ""}`.trim();
    const matchedDept = prof.department_name || (prof.department_id ? departmentsCache.find(d => strId(d.id) === strId(prof.department_id))?.name : "--") || "--";
    const samplesList = prof.samples || [];
    const sampleCount = prof.total_samples || samplesList.length;
    const vectorCount = prof.total_vectors || 0;

    let profDurationSec = 0;
    samplesList.forEach(s => { if (s.duration_seconds) profDurationSec += s.duration_seconds; });
    const durSec = Math.round(profDurationSec);
    const durStr = durSec > 60 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : `${durSec}s`;

    const isEnrolled = sampleCount > 0 || vectorCount > 0;
    const statusClass = isEnrolled ? "badge-completed" : "badge-inactive";
    const statusText = isEnrolled ? `ENROLLED (${vectorCount} Vector${vectorCount === 1 ? '' : 's'})` : "NO SAMPLES";

    const fileNames = samplesList.map(s => s.original_file_name || s.id).join(", ");
    const fileSub = fileNames ? `<br><small style="color: #475569; font-size: 11px;">Files: ${fileNames}</small>` : "";

    return `
      <tr>
        <td><code>${prof.employee_code || "--"}</code></td>
        <td><strong>${fullName}</strong>${fileSub}</td>
        <td>${matchedDept}</td>
        <td><strong>${sampleCount} audio clip(s)</strong></td>
        <td><span class="status-pill ${statusClass}">${statusText}</span></td>
        <td>${durStr}</td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="selectEmployeeForEnrollment('${prof.employee_id}')">+ Add Sample</button>
          ${isEnrolled ? `<button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #1d61e7;" onclick="openManageVoiceClipsModal('${prof.employee_id}', '${fullName}')">Manage Clips (${sampleCount})</button>` : ""}
          ${isEnrolled ? `<button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteEmployeeVoiceSamples('${prof.employee_id}', '${fullName}')">Clear All</button>` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

function selectEmployeeForEnrollment(employeeId) {
  const sel = document.getElementById("veEmployeeSelect");
  if (sel) {
    sel.value = employeeId;
    sel.scrollIntoView({ behavior: "smooth" });
  }
}

/* ==========================================================================
   LIVE MICROPHONE RECORDING LOGIC
   ========================================================================== */

async function startMicRecording() {
  audioChunks = [];
  recordedAudioBlob = null;
  recordingSeconds = 0;

  const btnStart = document.getElementById("btnStartRecord");
  const btnStop = document.getElementById("btnStopRecord");
  const btnClear = document.getElementById("btnClearRecord");
  const statusText = document.getElementById("micStatusText");
  const timerEl = document.getElementById("micTimer");
  const preview = document.getElementById("micAudioPreview");

  if (preview) preview.style.display = "none";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      recordedAudioBlob = new Blob(audioChunks, { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(recordedAudioBlob);
      if (preview) {
        preview.src = audioUrl;
        preview.style.display = "block";
      }
      if (statusText) statusText.textContent = "Recording complete! Click 'Enroll Voice Data' to submit.";
      if (btnClear) btnClear.style.display = "inline-block";
    };

    mediaRecorder.start();
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;
    if (statusText) statusText.textContent = "Recording employee voice... Speak clearly into the microphone.";

    micTimerInterval = setInterval(() => {
      recordingSeconds++;
      const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
      const secs = String(recordingSeconds % 60).padStart(2, "0");
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);

  } catch (err) {
    alert("Microphone access denied or unavailable: " + err.message);
  }
}

function stopMicRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  clearInterval(micTimerInterval);
  const btnStart = document.getElementById("btnStartRecord");
  const btnStop = document.getElementById("btnStopRecord");
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;
}

function clearMicRecording() {
  audioChunks = [];
  recordedAudioBlob = null;
  recordingSeconds = 0;
  clearInterval(micTimerInterval);

  const statusText = document.getElementById("micStatusText");
  const timerEl = document.getElementById("micTimer");
  const preview = document.getElementById("micAudioPreview");
  const btnClear = document.getElementById("btnClearRecord");

  if (statusText) statusText.textContent = "Ready to record employee voice...";
  if (timerEl) timerEl.textContent = "00:00";
  if (preview) { preview.src = ""; preview.style.display = "none"; }
  if (btnClear) btnClear.style.display = "none";
}

/* ==========================================================================
   SUBMIT ENROLLMENT & VERIFICATION
   ========================================================================== */

async function submitVoiceEnrollment(e) {
  e.preventDefault();
  const empId = document.getElementById("veEmployeeSelect").value;
  if (!empId) return showToast("Please select a target employee", "error");

  const btnSubmit = document.getElementById("btnSubmitEnrollment");
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = `<i data-lucide="loader"></i> Processing Voice...`; }

  const formData = new FormData();
  formData.append("employee_id", empId);
  formData.append("sample_type", "ENROLLMENT");

  if (enrollMode === "upload") {
    const fileInput = document.getElementById("veAudioFiles");
    if (!fileInput.files || fileInput.files.length === 0) {
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="cpu"></i> Enroll Voice Data`; }
      return showToast("Please select at least one audio file to upload", "error");
    }
    for (let i = 0; i < fileInput.files.length; i++) {
      formData.append("files", fileInput.files[i]);
    }
  } else {
    if (!recordedAudioBlob) {
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="cpu"></i> Enroll Voice Data`; }
      return showToast("Please record an audio sample first using the microphone", "error");
    }
    formData.append("files", recordedAudioBlob, `mic_enrollment_${Date.now()}.wav`);
  }

  try {
    const res = await fetch("/api/v1/voice-samples/enroll", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Enrollment failed.");
    }

    const data = await res.json();
    showToast(`Voice sample(s) successfully enrolled! ${data.message || ""}`, "success");

    clearMicRecording();
    document.getElementById("veAudioFiles").value = "";
    loadVoiceEnrollmentPage();
  } catch (err) {
    showToast("Voice Enrollment Error: " + err.message, "error");
  } finally {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="cpu"></i> Enroll Voice Data`; }
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  }
}

/* ==========================================================================
   LIVE MICROPHONE VERIFICATION TEST LOGIC
   ========================================================================== */

let verifyMode = "upload";
let verifyMediaRecorder = null;
let verifyAudioChunks = [];
let verifyRecordedAudioBlob = null;
let verifyMicTimerInterval = null;
let verifyRecordingSeconds = 0;

function setVerifyMode(mode) {
  verifyMode = mode;
  const btnUpload = document.getElementById("btnVerifyModeUpload");
  const btnMic = document.getElementById("btnVerifyModeMic");
  const uploadArea = document.getElementById("verifyUploadArea");
  const micArea = document.getElementById("verifyMicArea");

  if (mode === "upload") {
    if (btnUpload) btnUpload.classList.add("active");
    if (btnMic) btnMic.classList.remove("active");
    if (uploadArea) uploadArea.style.display = "block";
    if (micArea) micArea.style.display = "none";
  } else {
    if (btnMic) btnMic.classList.add("active");
    if (btnUpload) btnUpload.classList.remove("active");
    if (uploadArea) uploadArea.style.display = "none";
    if (micArea) micArea.style.display = "block";
  }
}

async function startVerifyMicRecording() {
  verifyAudioChunks = [];
  verifyRecordedAudioBlob = null;
  verifyRecordingSeconds = 0;

  const btnStart = document.getElementById("btnVerifyStartRecord");
  const btnStop = document.getElementById("btnVerifyStopRecord");
  const btnClear = document.getElementById("btnVerifyClearRecord");
  const statusText = document.getElementById("verifyMicStatusText");
  const timerEl = document.getElementById("verifyMicTimer");
  const preview = document.getElementById("verifyMicAudioPreview");

  if (preview) preview.style.display = "none";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    verifyMediaRecorder = new MediaRecorder(stream);

    verifyMediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) verifyAudioChunks.push(event.data);
    };

    verifyMediaRecorder.onstop = () => {
      verifyRecordedAudioBlob = new Blob(verifyAudioChunks, { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(verifyRecordedAudioBlob);
      if (preview) {
        preview.src = audioUrl;
        preview.style.display = "block";
      }
      if (statusText) statusText.textContent = "Test recording complete! Click 'Verify & Identify Speaker' to run.";
      if (btnClear) btnClear.style.display = "inline-block";
    };

    verifyMediaRecorder.start();
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;
    if (statusText) statusText.textContent = "Recording test voice sample... Speak into microphone.";

    verifyMicTimerInterval = setInterval(() => {
      verifyRecordingSeconds++;
      const mins = String(Math.floor(verifyRecordingSeconds / 60)).padStart(2, "0");
      const secs = String(verifyRecordingSeconds % 60).padStart(2, "0");
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);

  } catch (err) {
    alert("Microphone access denied or unavailable: " + err.message);
  }
}

function stopVerifyMicRecording() {
  if (verifyMediaRecorder && verifyMediaRecorder.state !== "inactive") {
    verifyMediaRecorder.stop();
    verifyMediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  clearInterval(verifyMicTimerInterval);
  const btnStart = document.getElementById("btnVerifyStartRecord");
  const btnStop = document.getElementById("btnVerifyStopRecord");
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;
}

function clearVerifyMicRecording() {
  verifyAudioChunks = [];
  verifyRecordedAudioBlob = null;
  verifyRecordingSeconds = 0;
  clearInterval(verifyMicTimerInterval);

  const statusText = document.getElementById("verifyMicStatusText");
  const timerEl = document.getElementById("verifyMicTimer");
  const preview = document.getElementById("verifyMicAudioPreview");
  const btnClear = document.getElementById("btnVerifyClearRecord");

  if (statusText) statusText.textContent = "Ready to record test voice clip...";
  if (timerEl) timerEl.textContent = "00:00";
  if (preview) { preview.src = ""; preview.style.display = "none"; }
  if (btnClear) btnClear.style.display = "none";
}

async function submitVoiceVerificationTest(e) {
  e.preventDefault();
  const targetId = document.getElementById("verifyTargetSelect").value;
  const resultContainer = document.getElementById("verifyResultContainer");
  const resultTitle = document.getElementById("verifyResultTitle");
  const scoreBadge = document.getElementById("verifyScoreBadge");
  const resultDetail = document.getElementById("verifyResultDetail");
  const btnSubmit = document.getElementById("btnVerifySubmit");

  const formData = new FormData();
  if (targetId) formData.append("target_employee_id", targetId);

  if (verifyMode === "upload") {
    const fileInput = document.getElementById("verifyAudioFile");
    if (!fileInput.files || fileInput.files.length === 0) {
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="shield-check"></i> Verify Speaker`; }
      return showToast("Please select a query audio file to upload", "error");
    }
    formData.append("file", fileInput.files[0]);
  } else {
    if (!verifyRecordedAudioBlob) {
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="shield-check"></i> Verify Speaker`; }
      return showToast("Please record a test voice sample first using the microphone", "error");
    }
    formData.append("file", verifyRecordedAudioBlob, `verify_query_${Date.now()}.wav`);
  }

  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = `<i data-lucide="loader"></i> Verification in progress...`; }

  try {
    const res = await fetch("/api/v1/voice-samples/verify", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Verification failed.");
    }

    const result = await res.json();
    const scorePct = Math.round((result.similarity_score || 0) * 100);

    if (resultContainer) resultContainer.style.display = "block";
    if (scoreBadge) scoreBadge.textContent = `${scorePct}% Similarity`;

    const matchedEmp = result.matched_employee || {};
    const topMatch = (result.top_matches && result.top_matches[0]) ? result.top_matches[0] : {};
    const empId = matchedEmp.id || topMatch.employee_id;
    const cachedEmp = employeesCache.find(e => strId(e.id) === strId(empId));

    const empCode = matchedEmp.employee_code || (cachedEmp ? cachedEmp.employee_code : "AGNT-XXXXXX");
    const fullName = matchedEmp.full_name || (matchedEmp.first_name ? `${matchedEmp.first_name} ${matchedEmp.last_name || ""}`.trim() : (cachedEmp ? `${cachedEmp.first_name} ${cachedEmp.last_name || ""}`.trim() : "Enrolled Agent"));
    const deptName = matchedEmp.department_name || (cachedEmp && cachedEmp.department_id ? departmentsCache.find(d => strId(d.id) === strId(cachedEmp.department_id))?.name : null);
    const desigName = matchedEmp.designation_name || (cachedEmp && cachedEmp.designation_id ? designationsCache.find(d => strId(d.id) === strId(cachedEmp.designation_id))?.name : null);

    if (result.is_match) {
      if (resultContainer) { resultContainer.style.background = "#f0fdf4"; resultContainer.style.borderColor = "#bbf7d0"; }
      if (resultTitle) { resultTitle.textContent = "VERIFIED MATCH CONFIRMED"; resultTitle.style.color = "#166534"; }
      
      let html = `<div style="margin-top: 6px;">
        <div style="font-size: 15px; font-weight: 700; color: #14532d; margin-bottom: 4px;">
          ${fullName} <code style="font-size: 13px; color: #166534; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">${empCode}</code>
        </div>
        <div style="font-size: 12.5px; color: #15803d;">
          ${deptName ? `<strong>Department:</strong> ${deptName} &nbsp;|&nbsp; ` : ""}
          ${desigName ? `<strong>Role:</strong> ${desigName} &nbsp;|&nbsp; ` : ""}
          <strong>ECAPA Vector Match:</strong> ${scorePct}%
        </div>
      </div>`;
      if (resultDetail) resultDetail.innerHTML = html;
    } else {
      if (resultContainer) { resultContainer.style.background = "#fef2f2"; resultContainer.style.borderColor = "#fecaca"; }
      if (resultTitle) { resultTitle.textContent = "NO MATCH DETECTED"; resultTitle.style.color = "#991b1b"; }
      let html = `<div style="font-size: 13px; color: #991b1b; margin-top: 4px;">
        No enrolled employee voice profile matched above threshold (${Math.round((result.threshold_applied || 0.7) * 100)}%).
        ${topMatch.employee_id ? `<br><small style="color: #b91c1c;">Closest Candidate: ${fullName} (<code>${empCode}</code>) with ${scorePct}% similarity.</small>` : ""}
      </div>`;
      if (resultDetail) resultDetail.innerHTML = html;
    }

  } catch (err) {
    showToast("Verification Test Error: " + err.message, "error");
  } finally {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="shield-check"></i> Verify Speaker`; }
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  }
}

async function deleteEmployeeVoiceSamples(employeeId, empName) {
  const confirmed = await showConfirmModal({
    title: "Clear Employee Voice Samples",
    message: `Are you sure you want to purge all voice samples for employee '${empName}'?`,
    confirmText: "Clear Voice Data",
    isDanger: true
  });
  if (!confirmed) return;

  try {
    const samplesRes = await fetch(`/api/v1/voice-samples/employee/${employeeId}`);
    if (samplesRes.ok) {
      const samples = await samplesRes.json();
      for (const s of samples) {
        await fetch(`/api/v1/voice-samples/${s.id}`, { method: "DELETE" });
      }
      showToast(`Voice samples purged for ${empName}`, "success");
      loadVoiceEnrollmentPage();
    }
  } catch (err) {
    showToast("Error clearing voice samples", "error");
  }
}

async function purgeAllVoiceData() {
  const confirmed = await showConfirmModal({
    title: "Purge All System Voice Data",
    message: "CAUTION: Are you sure you want to purge ALL voice samples and Milvus embeddings across the system? This action cannot be undone.",
    confirmText: "Purge All Data",
    isDanger: true
  });
  if (!confirmed) return;

  try {
    const res = await fetch("/api/v1/voice-samples/purge/all", { method: "DELETE" });
    if (res.ok) {
      showToast("System voice database successfully purged", "success");
      loadVoiceEnrollmentPage();
    } else {
      showToast("Error purging voice data", "error");
    }
  } catch (err) {
    showToast("Error purging voice data", "error");
  }
}

/* ==========================================================================
   METRIC TILE FILTER FOR VOICE REGISTERED
   ========================================================================== */

function filterVoiceRegistered() {
  document.querySelectorAll("#view-employees .time-range-btn").forEach(b => b.classList.remove("active"));
  const voiceEmpIds = voiceProfilesCache.filter(v => v.total_samples > 0).map(v => strId(v.employee_id));
  const filtered = employeesCache.filter(e => voiceEmpIds.includes(strId(e.id)));
  renderEmployeesTable(filtered);
  showToast(`Showing ${filtered.length} voice-enrolled employees`, "info");
}

/* ==========================================================================
   BULK CSV IMPORT LOGIC
   ========================================================================== */

function openBulkImportModal() {
  openModal("bulkImportModal");
}

function downloadSampleCSVTemplate() {
  const csvContent = "data:text/csv;charset=utf-8," +
    "first_name,last_name,father_name,email,phone,date_of_birth,date_of_joining,location\n" +
    "Rahul,Sharma,Ramesh Sharma,rahul.sharma@example.com,9876543210,1995-04-12,2024-01-15,New Delhi\n" +
    "Priya,Verma,Suresh Verma,priya.verma@example.com,9876543211,1997-08-22,2024-02-01,Mumbai";

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "VoxAudit_Employee_Import_Template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Downloaded Sample CSV Template", "info");
}

async function submitBulkImportCSV(e) {
  e.preventDefault();
  const fileInput = document.getElementById("bulkCsvFileInput");
  if (!fileInput.files || fileInput.files.length === 0) {
    return showToast("Please select a CSV file to upload", "error");
  }

  const file = fileInput.files[0];
  const btnSubmit = document.getElementById("btnSubmitBulkImport");
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = `<i data-lucide="loader"></i> Importing Staff...`; }

  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) {
      throw new Error("CSV file is empty or missing data rows.");
    }

    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const items = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map(p => p.trim().replace(/^"|"$/g, ""));
      if (parts.length < 1 || !parts[0]) continue;

      const obj = {};
      headers.forEach((h, idx) => {
        if (parts[idx] !== undefined && parts[idx] !== "") {
          obj[h] = parts[idx];
        }
      });

      if (!obj.first_name) continue;
      if (!obj.date_of_joining) {
        obj.date_of_joining = new Date().toISOString().split("T")[0];
      }

      items.push(obj);
    }

    if (items.length === 0) {
      throw new Error("No valid employee records found in CSV file.");
    }

    const res = await fetch("/api/v1/employees/bulk-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items)
    });

    if (!res.ok) {
      throw new Error("Bulk import request failed");
    }

    const data = await res.json();
    showToast(`Bulk Import Complete: ${data.imported_count} employee(s) created!`, "success");
    closeModal("bulkImportModal");
    fileInput.value = "";
    loadEmployees();

  } catch (err) {
    showToast("CSV Import Error: " + err.message, "error");
  } finally {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="upload"></i> Upload & Create Staff`; }
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  }
}

/* ==========================================================================
   QUICK DIRECT VOICE RECORDING MODAL LOGIC
   ========================================================================== */

let quickAudioChunks = [];
let quickRecordedAudioBlob = null;
let quickMediaRecorder = null;
let quickMicTimerInterval = null;
let quickRecordingSeconds = 0;

function openQuickRecordModal(empId, empName) {
  const emp = employeesCache.find(e => strId(e.id) === strId(empId));
  document.getElementById("quickRecordEmpId").value = empId;
  document.getElementById("quickRecordEmpName").textContent = empName;
  document.getElementById("quickRecordEmpCode").textContent = emp?.employee_code || "AGNT-000000";
  clearQuickMicRecording();
  openModal("quickRecordModal");
}

async function startQuickMicRecording() {
  quickAudioChunks = [];
  quickRecordedAudioBlob = null;
  quickRecordingSeconds = 0;

  const btnStart = document.getElementById("btnQuickRecordStart");
  const btnStop = document.getElementById("btnQuickRecordStop");
  const btnClear = document.getElementById("btnQuickRecordClear");
  const btnSubmit = document.getElementById("btnQuickRecordSubmit");
  const statusText = document.getElementById("quickRecordStatusText");
  const timerEl = document.getElementById("quickRecordTimer");
  const preview = document.getElementById("quickRecordAudioPreview");

  if (preview) preview.style.display = "none";
  if (btnSubmit) btnSubmit.disabled = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    quickMediaRecorder = new MediaRecorder(stream);

    quickMediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) quickAudioChunks.push(event.data);
    };

    quickMediaRecorder.onstop = () => {
      quickRecordedAudioBlob = new Blob(quickAudioChunks, { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(quickRecordedAudioBlob);
      if (preview) {
        preview.src = audioUrl;
        preview.style.display = "block";
      }
      if (statusText) statusText.textContent = "Recording complete! Click 'Save Voice Sample'.";
      if (btnClear) btnClear.style.display = "inline-block";
      if (btnSubmit) btnSubmit.disabled = false;
    };

    quickMediaRecorder.start();
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;
    if (statusText) statusText.textContent = "Recording voice... Speak clearly into microphone.";

    quickMicTimerInterval = setInterval(() => {
      quickRecordingSeconds++;
      const mins = String(Math.floor(quickRecordingSeconds / 60)).padStart(2, "0");
      const secs = String(quickRecordingSeconds % 60).padStart(2, "0");
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);

  } catch (err) {
    showToast("Microphone access denied: " + err.message, "error");
  }
}

function stopQuickMicRecording() {
  if (quickMediaRecorder && quickMediaRecorder.state !== "inactive") {
    quickMediaRecorder.stop();
    quickMediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  clearInterval(quickMicTimerInterval);
  const btnStart = document.getElementById("btnQuickRecordStart");
  const btnStop = document.getElementById("btnQuickRecordStop");
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;
}

function clearQuickMicRecording() {
  quickAudioChunks = [];
  quickRecordedAudioBlob = null;
  quickRecordingSeconds = 0;
  clearInterval(quickMicTimerInterval);

  const statusText = document.getElementById("quickRecordStatusText");
  const timerEl = document.getElementById("quickRecordTimer");
  const preview = document.getElementById("quickRecordAudioPreview");
  const btnClear = document.getElementById("btnQuickRecordClear");
  const btnSubmit = document.getElementById("btnQuickRecordSubmit");

  if (statusText) statusText.textContent = "Ready to record...";
  if (timerEl) timerEl.textContent = "00:00";
  if (preview) { preview.src = ""; preview.style.display = "none"; }
  if (btnClear) btnClear.style.display = "none";
  if (btnSubmit) btnSubmit.disabled = true;
}

async function submitQuickVoiceRecord() {
  const empId = document.getElementById("quickRecordEmpId").value;
  if (!empId || !quickRecordedAudioBlob) return showToast("No recorded voice sample", "error");

  const btnSubmit = document.getElementById("btnQuickRecordSubmit");
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = `<i data-lucide="loader"></i> Saving Voice...`; }

  const formData = new FormData();
  formData.append("employee_id", empId);
  formData.append("sample_type", "ENROLLMENT");
  formData.append("files", quickRecordedAudioBlob, `mic_quick_${Date.now()}.wav`);

  try {
    const res = await fetch("/api/v1/voice-samples/enroll", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Voice enrollment failed.");
    }

    showToast("Voice sample successfully registered!", "success");
    closeModal("quickRecordModal");
    loadEmployees();
  } catch (err) {
    showToast("Voice Enrollment Error: " + err.message, "error");
  } finally {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="cpu"></i> Save Voice Sample`; }
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  }
}

/* ==========================================================================
   MANAGE INDIVIDUAL VOICE CLIPS & MILVUS VECTOR EMBEDDINGS LOGIC
   ========================================================================== */

async function openManageVoiceClipsModal(employeeId, empName) {
  const subtitleEl = document.getElementById("manageVoiceClipsEmpSubtitle");
  if (subtitleEl) subtitleEl.textContent = `Managing voice samples & Milvus embeddings for ${empName}`;

  const listEl = document.getElementById("manageVoiceClipsList");
  if (listEl) listEl.innerHTML = `<p style="text-align:center; padding: 20px; color:#64748b;">Loading voice sample clips...</p>`;

  openModal("manageVoiceClipsModal");

  try {
    const res = await fetch(`/api/v1/voice-samples/employee/${employeeId}`);
    if (!res.ok) throw new Error("Failed to fetch voice samples.");
    const samples = await res.json();

    if (!samples || samples.length === 0) {
      listEl.innerHTML = `<div style="text-align:center; padding: 30px; color:#64748b;">No voice sample clips found for ${empName}.</div>`;
      return;
    }

    listEl.innerHTML = samples.map(s => {
      const fileName = s.original_file_name || s.code || `voice_sample_${s.id.substring(0, 6)}.wav`;
      const durStr = s.duration_seconds ? `${Math.round(s.duration_seconds)} seconds` : "Unknown duration";
      const vecStatus = s.embedding_id ? `<span style="color:#059669; font-weight:600;">● Milvus Vector Embedded (192D)</span>` : `<span style="color:#eab308; font-weight:600;">Processing Embedding</span>`;

      return `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="flex: 1; min-width: 240px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <i data-lucide="file-audio" style="color:#1d61e7; width:18px;"></i>
              <strong style="font-size:14px; color:#0f172a;">${fileName}</strong>
            </div>
            <div style="font-size:12px; color:#64748b; line-height:1.4;">
              Sample Code: <code>${s.code || s.id}</code> | Format: <strong>${s.audio_format || "wav"}</strong> | Duration: <strong>${durStr}</strong><br>
              ${vecStatus}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; color: #ef4444; border-color: #fca5a5; background: #fef2f2;" onclick="deleteSingleVoiceSample('${s.id}', '${fileName}', '${employeeId}', '${empName}')">
              <i data-lucide="trash-2"></i> Delete Clip & Vector
            </button>
          </div>
        </div>
      `;
    }).join("");

    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);

  } catch (err) {
    if (listEl) listEl.innerHTML = `<p style="color:#ef4444; text-align:center; padding:20px;">Error loading voice clips: ${err.message}</p>`;
  }
}

async function deleteSingleVoiceSample(sampleId, sampleName, employeeId, empName) {
  const confirmed = await showConfirmModal({
    title: "Delete Voice Sample Clip & Vector",
    message: `Are you sure you want to delete voice clip '${sampleName}'? This will permanently delete the audio file from MinIO storage and purge its 192D vector embedding from Milvus database.`,
    confirmText: "Delete Voice Clip",
    isDanger: true
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/voice-samples/${sampleId}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error("Failed to delete voice sample clip.");
    }

    showToast(`Voice sample '${sampleName}' & Milvus embedding deleted`, "success");

    // Refresh profile modal if open so main profile remains open on screen
    const profileModalEl = document.getElementById("employeeProfileModal");
    if (profileModalEl && profileModalEl.classList.contains("active")) {
      openEmployeeProfileModal(employeeId);
    }

    // Refresh manage voice clips modal if open
    const manageModalEl = document.getElementById("manageVoiceClipsModal");
    if (manageModalEl && manageModalEl.classList.contains("active")) {
      openManageVoiceClipsModal(employeeId, empName);
    }

    // Reload directory tables
    loadVoiceEnrollmentPage();
    loadEmployees();

  } catch (err) {
    showToast("Error deleting voice clip: " + err.message, "error");
  }
}
