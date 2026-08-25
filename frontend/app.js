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
      subEl.textContent = "Register employee voice data, extract ECAPA 192d vectors, and run speaker verification tests.";
      loadVoiceEnrollmentPage();
      break;
    case "diarization":
      titleEl.textContent = "Speaker Diarization Studio";
      subEl.textContent = "Multi-speaker voice separation, turn-by-turn timeline analysis, and Milvus identification.";
      loadDiarizationPage();
      break;
    case "qa-analysis":
      titleEl.textContent = "QA Quality Test & Scorecards";
      subEl.textContent = "Automated AI quality evaluation, compliance checklist scoring, and agent performance insights.";
      loadQaAnalysisPage();
      break;
    case "chat-qa":
      titleEl.textContent = "Chat QA Audit Studio";
      subEl.textContent = "AI Quality Evaluation, CX Sentiment & Scorecards on JSON Chat Transcripts.";
      loadChatQaPage();
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
  } catch (err) { }
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
  } catch (err) { }
}

/* DEPARTMENTS */
async function loadDepartments() {
  const tbody = document.getElementById("departmentsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/api/v1/departments/");
    if (!res.ok) throw new Error("Failed");
    departmentsCache = await res.json();
    populateDeptFilterDropdowns();
    renderDepartmentsTable(departmentsCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: #ef4444; text-align: center;">Error loading departments</td></tr>`;
  }
}

function populateDeptFilterDropdowns() {
  const deptSelectFilter = document.getElementById("deptSelectFilter");
  if (deptSelectFilter) {
    const curr = deptSelectFilter.value;
    deptSelectFilter.innerHTML = `<option value="">All Departments</option>` +
      departmentsCache.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
    if (curr) deptSelectFilter.value = curr;
  }

  const deptCodeFilter = document.getElementById("deptCodeFilter");
  if (deptCodeFilter) {
    const curr = deptCodeFilter.value;
    deptCodeFilter.innerHTML = `<option value="">All Department Codes</option>` +
      departmentsCache.map(d => `<option value="${d.code}">${d.code}</option>`).join("");
    if (curr) deptCodeFilter.value = curr;
  }
}

let deptViewMode = "table";
let currentDeptStatusFilter = "ALL";

function switchDeptViewMode(mode, btn) {
  deptViewMode = mode;
  const btnTable = document.getElementById("btnDeptViewTable");
  const btnGrid = document.getElementById("btnDeptViewGrid");
  const tableView = document.getElementById("departmentsTableView");
  const gridView = document.getElementById("departmentsGridView");

  if (mode === "table") {
    if (btnTable) btnTable.classList.add("active");
    if (btnGrid) btnGrid.classList.remove("active");
    if (tableView) tableView.style.display = "block";
    if (gridView) gridView.style.display = "none";
  } else {
    if (btnGrid) btnGrid.classList.add("active");
    if (btnTable) btnTable.classList.remove("active");
    if (tableView) tableView.style.display = "none";
    if (gridView) gridView.style.display = "block";
  }
  filterDepartments();
}

function filterDeptStatus(status, btnEl) {
  currentDeptStatusFilter = status;
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  filterDepartments();
}

function filterDepartments() {
  const query = document.getElementById("deptSearchInput")?.value.toLowerCase().trim() || "";
  const deptSelectVal = document.getElementById("deptSelectFilter")?.value || "";
  const deptCodeVal = document.getElementById("deptCodeFilter")?.value || "";

  const filtered = departmentsCache.filter(dept => {
    const code = (dept.code || "").toLowerCase();
    const name = (dept.name || "").toLowerCase();
    const desc = (dept.description || "").toLowerCase();

    const matchQuery = !query || code.includes(query) || name.includes(query) || desc.includes(query);
    const matchDeptSelect = !deptSelectVal || strId(dept.id) === strId(deptSelectVal);
    const matchDeptCode = !deptCodeVal || (dept.code || "").toUpperCase() === deptCodeVal.toUpperCase();
    const matchStatus = currentDeptStatusFilter === "ALL" || dept.status === currentDeptStatusFilter;

    return matchQuery && matchDeptSelect && matchDeptCode && matchStatus;
  });

  renderDepartmentsTable(filtered);
}

async function toggleEmployeeStatus(empId, currentStatus, empName, event) {
  if (event) event.stopPropagation();

  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  const emp = employeesCache.find(e => strId(e.id) === strId(empId));
  if (emp) emp.status = newStatus;
  filterEmployees();

  try {
    const res = await fetch(`/api/v1/employees/${empId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error("Failed to update employee status");

    showToast(`${empName} status updated to ${newStatus}`, "success");
  } catch (err) {
    if (emp) emp.status = currentStatus;
    filterEmployees();
    showToast("Error updating status: " + err.message, "error");
  }
}

async function toggleDepartmentStatus(deptId, currentStatus, deptName, event) {
  if (event) event.stopPropagation();

  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  const dept = departmentsCache.find(d => strId(d.id) === strId(deptId));
  if (dept) dept.status = newStatus;
  filterDepartments();

  try {
    const res = await fetch(`/api/v1/departments/${deptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error("Failed to update department status");

    showToast(`${deptName} status updated to ${newStatus}`, "success");
  } catch (err) {
    if (dept) dept.status = currentStatus;
    filterDepartments();
    showToast("Error updating department status: " + err.message, "error");
  }
}

function renderDepartmentsTable(list) {
  populateDeptFilterDropdowns();
  const tbody = document.getElementById("departmentsTableBody");
  const gridContainer = document.getElementById("departmentsGridContainer");

  const totalEl = document.getElementById("dept-stat-total");
  const activeEl = document.getElementById("dept-stat-active");
  const rolesEl = document.getElementById("dept-stat-roles");
  if (totalEl) totalEl.textContent = departmentsCache.length;
  if (activeEl) activeEl.textContent = departmentsCache.filter((d) => d.status === "ACTIVE").length;
  if (rolesEl) rolesEl.textContent = designationsCache.length || 0;

  if (!list || list.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">No departments found. Click "+ Add Department" to create one.</td></tr>`;
    if (gridContainer) gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#64748b;">No departments found.</div>`;
    return;
  }

  // Populate Table View
  if (tbody) {
    tbody.innerHTML = list.map((dept) => {
      const empCount = employeesCache.filter(e => strId(e.department_id) === strId(dept.id)).length;
      return `
        <tr>
          <td><code>${dept.code}</code></td>
          <td><strong>${dept.name}</strong></td>
          <td>${dept.description || "N/A"}</td>
          <td><span class="status-pill badge-completed" style="font-size:11.5px;">${empCount} Staff</span></td>
          <td><span class="status-pill clickable-status ${dept.status === "ACTIVE" ? "badge-active" : "badge-inactive"}" title="Click to toggle status" onclick="toggleDepartmentStatus('${dept.id}', '${dept.status}', '${dept.name}')">${dept.status}</span></td>
          <td>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditDepartmentModal('${dept.id}')">Edit</button>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteDepartment('${dept.id}', '${dept.name}')">Delete</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Populate Grid View Cards
  if (gridContainer) {
    gridContainer.innerHTML = list.map((dept) => {
      const empCount = employeesCache.filter(e => strId(e.department_id) === strId(dept.id)).length;
      const desigCount = designationsCache.filter(d => strId(d.department_id) === strId(dept.id)).length;

      return `
        <div class="metric-card" style="padding: 22px; border-radius: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
          <!-- TOP ROW: ICON, CODE & STATUS -->
          <div class="metric-card-top" style="margin-bottom: 14px;">
            <div style="display: flex; gap: 14px; align-items: flex-start; min-width: 0; flex: 1;">
              <div style="width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #1d61e7, #3b82f6); color: #ffffff; font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 12px rgba(29, 97, 231, 0.2);">
                <i data-lucide="building-2"></i>
              </div>
              <div style="min-width: 0; flex: 1;">
                <code style="font-size: 11px; font-weight: 700; color: #1d61e7; background: #eff6ff; padding: 2px 8px; border-radius: 6px; display: inline-block; margin-bottom: 3px;">${dept.code}</code>
                <h3 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.25;">${dept.name}</h3>
              </div>
            </div>
            <span class="status-pill clickable-status ${dept.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}" style="font-size: 11px; flex-shrink: 0; margin-left: 8px;" title="Click to toggle status" onclick="toggleDepartmentStatus('${dept.id}', '${dept.status}', '${dept.name}')">${dept.status}</span>
          </div>

          <!-- DESCRIPTION -->
          <p style="font-size: 13px; color: #64748b; margin-bottom: 14px; line-height: 1.4; word-break: break-word;">${dept.description || 'No description provided.'}</p>

          <!-- DETAILS GRID: STAFF COUNT, MAPPED ROLES -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin: 12px 0;">
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">STAFF MEMBERS</span>
              <strong style="color:#0f172a; font-size:14px; display:block;">${empCount} Staff</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">MAPPED ROLES</span>
              <strong style="color:#0f172a; font-size:14px; display:block;">${desigCount} Roles</strong>
            </div>
          </div>

          <!-- FOOTER ACTION BUTTONS -->
          <div style="display: flex; align-items: center; gap: 10px; padding-top: 14px; border-top: 1px solid #f1f5f9;">
            <button class="btn-secondary" style="flex: 1; padding: 8px 14px; font-size: 12.5px; justify-content: center;" onclick="openEditDepartmentModal('${dept.id}')"><i data-lucide="edit-3" style="width: 14px;"></i> Edit</button>
            <button class="btn-secondary" style="padding: 8px 12px; font-size: 12.5px; color: #ef4444;" onclick="deleteDepartment('${dept.id}', '${dept.name}')"><i data-lucide="trash-2" style="width: 14px;"></i> Delete</button>
          </div>
        </div>
      `;
    }).join("");
  }

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
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
let desigViewMode = "table";
let currentDesigStatusFilter = "ALL";

function switchDesigViewMode(mode, btn) {
  desigViewMode = mode;
  const btnTable = document.getElementById("btnDesigViewTable");
  const btnGrid = document.getElementById("btnDesigViewGrid");
  const tableView = document.getElementById("designationsTableView");
  const gridView = document.getElementById("designationsGridView");

  if (mode === "table") {
    if (btnTable) btnTable.classList.add("active");
    if (btnGrid) btnGrid.classList.remove("active");
    if (tableView) tableView.style.display = "block";
    if (gridView) gridView.style.display = "none";
  } else {
    if (btnGrid) btnGrid.classList.add("active");
    if (btnTable) btnTable.classList.remove("active");
    if (tableView) tableView.style.display = "none";
    if (gridView) gridView.style.display = "block";
  }
  filterDesignations();
}

function populateDesigFilterDropdowns() {
  const desigDeptFilter = document.getElementById("desigDeptFilter");
  if (desigDeptFilter) {
    const curr = desigDeptFilter.value;
    desigDeptFilter.innerHTML = `<option value="">All Departments</option>` +
      departmentsCache.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
    if (curr) desigDeptFilter.value = curr;
  }

  const desigCodeFilter = document.getElementById("desigCodeFilter");
  if (desigCodeFilter) {
    const curr = desigCodeFilter.value;
    desigCodeFilter.innerHTML = `<option value="">All Role Codes</option>` +
      designationsCache.map(d => `<option value="${d.code}">${d.code}</option>`).join("");
    if (curr) desigCodeFilter.value = curr;
  }
}

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
    populateDesigFilterDropdowns();
    renderDesignationsTable(designationsCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error loading designations</td></tr>`;
  }
}

function filterDesigStatus(status, btnEl) {
  currentDesigStatusFilter = status;
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  filterDesignations();
}

function filterDesignations() {
  const query = document.getElementById("desigSearchInput")?.value.toLowerCase().trim() || "";
  const deptVal = document.getElementById("desigDeptFilter")?.value || "";
  const codeVal = document.getElementById("desigCodeFilter")?.value || "";

  const filtered = designationsCache.filter(desig => {
    const code = (desig.code || "").toLowerCase();
    const name = (desig.name || "").toLowerCase();
    const desc = (desig.description || "").toLowerCase();
    const deptObj = departmentsCache.find(d => strId(d.id) === strId(desig.department_id));
    const deptName = (deptObj ? deptObj.name : "general").toLowerCase();

    const matchQuery = !query || code.includes(query) || name.includes(query) || desc.includes(query) || deptName.includes(query);
    const matchDept = !deptVal || strId(desig.department_id) === strId(deptVal);
    const matchCode = !codeVal || (desig.code || "").toUpperCase() === codeVal.toUpperCase();
    const matchStatus = currentDesigStatusFilter === "ALL" || desig.status === currentDesigStatusFilter;

    return matchQuery && matchDept && matchCode && matchStatus;
  });

  renderDesignationsTable(filtered);
}

async function toggleDesignationStatus(desigId, currentStatus, desigName, event) {
  if (event) event.stopPropagation();

  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  const desig = designationsCache.find(d => strId(d.id) === strId(desigId));
  if (desig) desig.status = newStatus;
  filterDesignations();

  try {
    const res = await fetch(`/api/v1/designations/${desigId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error("Failed to update designation status");

    showToast(`${desigName} role status updated to ${newStatus}`, "success");
  } catch (err) {
    if (desig) desig.status = currentStatus;
    filterDesignations();
    showToast("Error updating designation status: " + err.message, "error");
  }
}

function renderDesignationsTable(list) {
  populateDesigFilterDropdowns();

  const tbody = document.getElementById("designationsTableBody");
  const gridContainer = document.getElementById("designationsGridContainer");

  const totalEl = document.getElementById("desig-stat-total");
  const activeEl = document.getElementById("desig-stat-active");
  const mappedEl = document.getElementById("desig-stat-mapped");
  const genEl = document.getElementById("desig-stat-general");
  if (totalEl) totalEl.textContent = designationsCache.length;
  if (activeEl) activeEl.textContent = designationsCache.filter((d) => d.status === "ACTIVE").length;
  if (mappedEl) mappedEl.textContent = designationsCache.filter((d) => d.department_id).length;
  if (genEl) genEl.textContent = designationsCache.filter((d) => !d.department_id).length;

  if (!list || list.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No designations found. Click "+ Add Designation" to create one.</td></tr>`;
    if (gridContainer) gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#64748b;">No designations found.</div>`;
    return;
  }

  // Populate Table View
  if (tbody) {
    tbody.innerHTML = list.map((desig) => {
      const dept = departmentsCache.find((d) => strId(d.id) === strId(desig.department_id));
      const empCount = employeesCache.filter(e => strId(e.designation_id) === strId(desig.id)).length;
      return `
        <tr>
          <td><code>${desig.code}</code></td>
          <td><strong>${desig.name}</strong></td>
          <td>${dept ? dept.name : "General"}</td>
          <td>${desig.description || "N/A"}</td>
          <td><span class="status-pill badge-completed" style="font-size:11.5px;">${empCount} Staff</span></td>
          <td><span class="status-pill clickable-status ${desig.status === "ACTIVE" ? "badge-active" : "badge-inactive"}" title="Click to toggle status" onclick="toggleDesignationStatus('${desig.id}', '${desig.status}', '${desig.name}', event)">${desig.status}</span></td>
          <td>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditDesignationModal('${desig.id}')">Edit</button>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteDesignation('${desig.id}', '${desig.name}')">Delete</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Populate Grid View Cards
  if (gridContainer) {
    gridContainer.innerHTML = list.map((desig) => {
      const dept = departmentsCache.find((d) => strId(d.id) === strId(desig.department_id));
      const empCount = employeesCache.filter(e => strId(e.designation_id) === strId(desig.id)).length;
      const deptName = dept ? dept.name : "General Role";

      return `
        <div class="metric-card" style="padding: 22px; border-radius: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
          <!-- TOP ROW: ICON, CODE & STATUS -->
          <div class="metric-card-top" style="margin-bottom: 14px;">
            <div style="display: flex; gap: 14px; align-items: flex-start; min-width: 0; flex: 1;">
              <div style="width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #1d61e7, #3b82f6); color: #ffffff; font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 12px rgba(29, 97, 231, 0.2);">
                <i data-lucide="award"></i>
              </div>
              <div style="min-width: 0; flex: 1;">
                <code style="font-size: 11px; font-weight: 700; color: #1d61e7; background: #eff6ff; padding: 2px 8px; border-radius: 6px; display: inline-block; margin-bottom: 3px;">${desig.code}</code>
                <h3 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.25; word-break: break-word;">${desig.name}</h3>
              </div>
            </div>
            <span class="status-pill clickable-status ${desig.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}" style="font-size: 11px; flex-shrink: 0; margin-left: 8px;" title="Click to toggle status" onclick="toggleDesignationStatus('${desig.id}', '${desig.status}', '${desig.name}', event)">${desig.status}</span>
          </div>

          <!-- DESCRIPTION -->
          <p style="font-size: 13px; color: #64748b; margin-bottom: 14px; line-height: 1.4; word-break: break-word;">${desig.description || 'No description provided.'}</p>

          <!-- DETAILS GRID: DEPARTMENT, STAFF COUNT -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin: 12px 0;">
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">DEPARTMENT</span>
              <strong style="color:#0f172a; font-size:13px; word-break:break-word; display:block;">${deptName}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">STAFF MEMBERS</span>
              <strong style="color:#0f172a; font-size:14px; display:block;">${empCount} Staff</strong>
            </div>
          </div>

          <!-- FOOTER ACTION BUTTONS -->
          <div style="display: flex; align-items: center; gap: 10px; padding-top: 14px; border-top: 1px solid #f1f5f9;">
            <button class="btn-secondary" style="flex: 1; padding: 8px 14px; font-size: 12.5px; justify-content: center;" onclick="openEditDesignationModal('${desig.id}')"><i data-lucide="edit-3" style="width: 14px;"></i> Edit</button>
            <button class="btn-secondary" style="padding: 8px 12px; font-size: 12.5px; color: #ef4444;" onclick="deleteDesignation('${desig.id}', '${desig.name}')"><i data-lucide="trash-2" style="width: 14px;"></i> Delete</button>
          </div>
        </div>
      `;
    }).join("");
  }

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

async function openAddDesignationModal() {
  if (departmentsCache.length === 0) {
    try {
      const res = await fetch("/api/v1/departments/");
      if (res.ok) departmentsCache = await res.json();
    } catch (e) { }
  }

  const deptSel = document.getElementById("desigDeptSelect");
  if (deptSel) {
    deptSel.innerHTML = `<option value="">-- None / General --</option>` +
      departmentsCache.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join("");
    deptSel.value = "";
  }

  document.getElementById("desigModalTitle").innerHTML = `<i data-lucide="award"></i> Add Designation`;
  document.getElementById("desigId").value = "";
  document.getElementById("desigCode").value = "";
  document.getElementById("desigName").value = "";
  document.getElementById("desigStatus").value = "ACTIVE";
  document.getElementById("desigDescription").value = "";
  openModal("designationModal");
}

async function openEditDesignationModal(id) {
  if (departmentsCache.length === 0) {
    try {
      const res = await fetch("/api/v1/departments/");
      if (res.ok) departmentsCache = await res.json();
    } catch (e) { }
  }

  const desig = designationsCache.find((d) => strId(d.id) === strId(id));
  if (!desig) return;

  const deptSel = document.getElementById("desigDeptSelect");
  if (deptSel) {
    deptSel.innerHTML = `<option value="">-- None / General --</option>` +
      departmentsCache.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join("");
    deptSel.value = desig.department_id || "";
  }

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
let shiftViewMode = "table";
let currentShiftStatusFilter = "ALL";

function switchShiftViewMode(mode, btn) {
  shiftViewMode = mode;
  const btnTable = document.getElementById("btnShiftViewTable");
  const btnGrid = document.getElementById("btnShiftViewGrid");
  const tableView = document.getElementById("shiftsTableView");
  const gridView = document.getElementById("shiftsGridView");

  if (mode === "table") {
    if (btnTable) btnTable.classList.add("active");
    if (btnGrid) btnGrid.classList.remove("active");
    if (tableView) tableView.style.display = "block";
    if (gridView) gridView.style.display = "none";
  } else {
    if (btnGrid) btnGrid.classList.add("active");
    if (btnTable) btnTable.classList.remove("active");
    if (tableView) tableView.style.display = "none";
    if (gridView) gridView.style.display = "block";
  }
  filterShifts();
}

function populateShiftFilterDropdowns() {
  const shiftCodeFilter = document.getElementById("shiftCodeFilter");
  if (shiftCodeFilter) {
    const curr = shiftCodeFilter.value;
    shiftCodeFilter.innerHTML = `<option value="">All Shift Codes</option>` +
      shiftsCache.map(s => `<option value="${s.code}">${s.code}</option>`).join("");
    if (curr) shiftCodeFilter.value = curr;
  }
}

async function loadShifts() {
  const tbody = document.getElementById("shiftsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/api/v1/shifts/");
    if (!res.ok) throw new Error("Failed");
    shiftsCache = await res.json();
    populateShiftFilterDropdowns();
    renderShiftsTable(shiftsCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color: #ef4444; text-align: center;">Error loading shifts</td></tr>`;
  }
}

function filterShiftStatus(status, btnEl) {
  currentShiftStatusFilter = status;
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  filterShifts();
}

function filterShifts() {
  const query = document.getElementById("shiftSearchInput")?.value.toLowerCase().trim() || "";
  const codeVal = document.getElementById("shiftCodeFilter")?.value || "";

  const filtered = shiftsCache.filter(shift => {
    const code = (shift.code || "").toLowerCase();
    const name = (shift.name || "").toLowerCase();
    const tz = (shift.timezone || "").toLowerCase();
    const times = `${shift.start_time} ${shift.end_time}`.toLowerCase();

    const matchQuery = !query || code.includes(query) || name.includes(query) || tz.includes(query) || times.includes(query);
    const matchCode = !codeVal || (shift.code || "").toUpperCase() === codeVal.toUpperCase();
    const matchStatus = currentShiftStatusFilter === "ALL" || shift.status === currentShiftStatusFilter;

    return matchQuery && matchCode && matchStatus;
  });

  renderShiftsTable(filtered);
}

async function toggleShiftStatus(shiftId, currentStatus, shiftName, event) {
  if (event) event.stopPropagation();

  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  const shift = shiftsCache.find(s => strId(s.id) === strId(shiftId));
  if (shift) shift.status = newStatus;
  filterShifts();

  try {
    const res = await fetch(`/api/v1/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error("Failed to update shift status");

    showToast(`${shiftName} status updated to ${newStatus}`, "success");
  } catch (err) {
    if (shift) shift.status = currentStatus;
    filterShifts();
    showToast("Error updating shift status: " + err.message, "error");
  }
}

function renderShiftsTable(list) {
  populateShiftFilterDropdowns();

  const tbody = document.getElementById("shiftsTableBody");
  const gridContainer = document.getElementById("shiftsGridContainer");

  const totalEl = document.getElementById("shift-stat-total");
  const activeEl = document.getElementById("shift-stat-active");
  if (totalEl) totalEl.textContent = shiftsCache.length;
  if (activeEl) activeEl.textContent = shiftsCache.filter((s) => s.status === "ACTIVE").length;

  if (!list || list.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No shifts found. Click "+ Add Shift" or "Seed Defaults".</td></tr>`;
    if (gridContainer) gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#64748b;">No shifts found.</div>`;
    return;
  }

  // Populate Table View
  if (tbody) {
    tbody.innerHTML = list.map((s) => {
      const empCount = employeesCache.filter(e => strId(e.shift_id) === strId(s.id)).length;
      return `
        <tr>
          <td><code>${s.code}</code></td>
          <td><strong>${s.name}</strong></td>
          <td><span class="status-pill badge-completed" style="font-size:11.5px;">🕒 ${s.start_time}</span></td>
          <td><span class="status-pill badge-inactive" style="font-size:11.5px;">🌙 ${s.end_time}</span></td>
          <td><small style="color: #64748b; font-weight:600;">${s.timezone}</small></td>
          <td><span class="status-pill badge-completed" style="font-size:11.5px;">${empCount} Staff</span></td>
          <td><span class="status-pill clickable-status ${s.status === "ACTIVE" ? "badge-active" : "badge-inactive"}" title="Click to toggle status" onclick="toggleShiftStatus('${s.id}', '${s.status}', '${s.name}', event)">${s.status}</span></td>
          <td>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditShiftModal('${s.id}')">Edit</button>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteShift('${s.id}', '${s.name}')">Delete</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Populate Grid View Cards
  if (gridContainer) {
    gridContainer.innerHTML = list.map((s) => {
      const empCount = employeesCache.filter(e => strId(e.shift_id) === strId(s.id)).length;
      return `
        <div class="metric-card" style="padding: 22px; border-radius: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
          <!-- TOP ROW: ICON, CODE & STATUS -->
          <div class="metric-card-top" style="margin-bottom: 14px;">
            <div style="display: flex; gap: 14px; align-items: flex-start; min-width: 0; flex: 1;">
              <div style="width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #1d61e7, #3b82f6); color: #ffffff; font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 12px rgba(29, 97, 231, 0.2);">
                <i data-lucide="clock"></i>
              </div>
              <div style="min-width: 0; flex: 1;">
                <code style="font-size: 11px; font-weight: 700; color: #1d61e7; background: #eff6ff; padding: 2px 8px; border-radius: 6px; display: inline-block; margin-bottom: 3px;">${s.code}</code>
                <h3 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.25; word-break: break-word;">${s.name}</h3>
              </div>
            </div>
            <span class="status-pill clickable-status ${s.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}" style="font-size: 11px; flex-shrink: 0; margin-left: 8px;" title="Click to toggle status" onclick="toggleShiftStatus('${s.id}', '${s.status}', '${s.name}', event)">${s.status}</span>
          </div>

          <!-- SHIFT TIMINGS BANNER -->
          <div style="font-size: 13.5px; font-weight: 700; color: #1d61e7; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
            <span><i data-lucide="clock" style="width: 14px; vertical-align: middle; margin-right: 4px;"></i> ${s.start_time} - ${s.end_time}</span>
            <span style="font-size: 11px; font-weight: 600; color: #3b82f6;">${s.timezone}</span>
          </div>

          <!-- DETAILS GRID: TIMINGS, TIMEZONE, ASSIGNED AGENTS -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin: 12px 0;">
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">TIMEZONE</span>
              <strong style="color:#0f172a; font-size:13px; word-break:break-word; display:block;">${s.timezone}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">ASSIGNED AGENTS</span>
              <strong style="color:#0f172a; font-size:14px; display:block;">${empCount} Staff</strong>
            </div>
          </div>

          <!-- FOOTER ACTION BUTTONS -->
          <div style="display: flex; align-items: center; gap: 10px; padding-top: 14px; border-top: 1px solid #f1f5f9;">
            <button class="btn-secondary" style="flex: 1; padding: 8px 14px; font-size: 12.5px; justify-content: center;" onclick="openEditShiftModal('${s.id}')"><i data-lucide="edit-3" style="width: 14px;"></i> Edit</button>
            <button class="btn-secondary" style="padding: 8px 12px; font-size: 12.5px; color: #ef4444;" onclick="deleteShift('${s.id}', '${s.name}')"><i data-lucide="trash-2" style="width: 14px;"></i> Delete</button>
          </div>
        </div>
      `;
    }).join("");
  }

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
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
  } catch (err) { }
}

/* CALL AUDITS */
let auditViewMode = "table";
let currentAuditStatusFilter = "ALL";

function switchAuditViewMode(mode, btn) {
  auditViewMode = mode;
  const btnTable = document.getElementById("btnAuditViewTable");
  const btnGrid = document.getElementById("btnAuditViewGrid");
  const tableView = document.getElementById("auditsTableView");
  const gridView = document.getElementById("auditsGridView");

  if (mode === "table") {
    if (btnTable) btnTable.classList.add("active");
    if (btnGrid) btnGrid.classList.remove("active");
    if (tableView) tableView.style.display = "block";
    if (gridView) gridView.style.display = "none";
  } else {
    if (btnGrid) btnGrid.classList.add("active");
    if (btnTable) btnTable.classList.remove("active");
    if (tableView) tableView.style.display = "none";
    if (gridView) gridView.style.display = "block";
  }
  filterAudits();
}

function populateAuditFilterDropdowns() {
  const auditDeptFilter = document.getElementById("auditDeptFilter");
  if (auditDeptFilter) {
    const curr = auditDeptFilter.value;
    auditDeptFilter.innerHTML = `<option value="">All Departments</option>` +
      departmentsCache.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
    if (curr) auditDeptFilter.value = curr;
  }

  const auditAgentFilter = document.getElementById("auditAgentFilter");
  if (auditAgentFilter) {
    const curr = auditAgentFilter.value;
    auditAgentFilter.innerHTML = `<option value="">All Agents</option>` +
      employeesCache.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name || ""} (${e.employee_code})</option>`).join("");
    if (curr) auditAgentFilter.value = curr;
  }
}

let auditsPollTimer = null;

async function loadCallAudits() {
  const tbody = document.getElementById("auditsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/api/v1/calls/");
    if (!res.ok) throw new Error("Failed");
    auditsCache = await res.json();
    populateAuditFilterDropdowns();
    renderAuditsTable(auditsCache);
    renderDashboardAuditsTable(auditsCache);

    // Auto-poll if any jobs are currently in PENDING or PROCESSING state
    const hasPending = auditsCache.some(c => c.status === "PENDING" || c.status === "PROCESSING");
    if (auditsPollTimer) clearTimeout(auditsPollTimer);
    if (hasPending) {
      auditsPollTimer = setTimeout(() => {
        const activeTab = document.querySelector(".nav-item.active")?.getAttribute("data-tab");
        if (!activeTab || activeTab === "audits" || activeTab === "dashboard") {
          loadCallAudits();
        }
      }, 3000);
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color: #ef4444; text-align: center;">Error loading call audits</td></tr>`;
  }
}

function filterAuditStatus(status, btnEl) {
  currentAuditStatusFilter = status;
  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll(".time-range-btn").forEach((b) => b.classList.remove("active"));
    btnEl.classList.add("active");
  }
  filterAudits();
}

function filterAudits() {
  const query = document.getElementById("auditSearchInput")?.value.toLowerCase().trim() || "";
  const deptVal = document.getElementById("auditDeptFilter")?.value || "";
  const agentVal = document.getElementById("auditAgentFilter")?.value || "";

  const filtered = auditsCache.filter(c => {
    const ref = (c.call_reference || c.id || "").toLowerCase();
    const filename = (c.audio_filename || "").toLowerCase();

    const identEmp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
    const identName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ""}`.toLowerCase() : "";

    const expEmp = employeesCache.find(e => strId(e.id) === strId(c.expected_employee_id));
    const expName = expEmp ? `${expEmp.first_name} ${expEmp.last_name || ""}`.toLowerCase() : "";

    const status = (c.status || "").toLowerCase();
    const qaScore = c.qa_score !== null && c.qa_score !== undefined ? `${c.qa_score}%` : "";

    const matchQuery = !query || ref.includes(query) || filename.includes(query) || identName.includes(query) || expName.includes(query) || status.includes(query) || qaScore.includes(query);

    const matchDept = !deptVal || (identEmp && strId(identEmp.department_id) === strId(deptVal)) || (expEmp && strId(expEmp.department_id) === strId(deptVal));
    const matchAgent = !agentVal || strId(c.identified_employee_id) === strId(agentVal) || strId(c.expected_employee_id) === strId(agentVal);

    let matchStatus = true;
    if (currentAuditStatusFilter === "PASSED") {
      matchStatus = c.qa_score !== null && c.qa_score !== undefined && c.qa_score >= 80;
    } else if (currentAuditStatusFilter === "FAILED") {
      matchStatus = c.qa_score !== null && c.qa_score !== undefined && c.qa_score < 80;
    } else if (currentAuditStatusFilter === "PROCESSING") {
      matchStatus = c.status === "PROCESSING" || c.status === "PENDING";
    }

    return matchQuery && matchDept && matchAgent && matchStatus;
  });

  renderAuditsTable(filtered);
}

async function deleteCallAudit(callId) {
  const confirmed = await showConfirmModal({
    title: "Delete Call Audit Record",
    message: "Are you sure you want to delete this call recording audit and its transcript?",
    confirmText: "Delete Call Audit",
    isDanger: true
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/calls/${callId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Call audit record deleted", "success");
      loadCallAudits();
    } else {
      showToast("Failed to delete call audit", "error");
    }
  } catch (err) {
    showToast("Error deleting call audit: " + err.message, "error");
  }
}

function renderAuditsTable(list) {
  populateAuditFilterDropdowns();

  const tbody = document.getElementById("auditsTableBody");
  const gridContainer = document.getElementById("auditsGridContainer");

  const totalEl = document.getElementById("audit-stat-total");
  const completedEl = document.getElementById("audit-stat-completed");
  const avgQaEl = document.getElementById("audit-stat-avg-qa");
  const identEl = document.getElementById("audit-stat-identified");

  if (totalEl) totalEl.textContent = auditsCache.length;
  if (completedEl) completedEl.textContent = auditsCache.filter(c => c.status === "COMPLETED").length;

  const validScores = auditsCache.map(c => c.qa_score).filter(s => s !== null && s !== undefined);
  const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
  if (avgQaEl) avgQaEl.textContent = `${avgScore}%`;

  if (identEl) identEl.textContent = auditsCache.filter(c => c.identified_employee_id).length;

  if (!list || list.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No call audits found. Click "Submit Call Recording" to submit an audio file.</td></tr>`;
    if (gridContainer) gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#64748b;">No call audits found.</div>`;
    return;
  }

  const fmtDuration = (sec) => {
    if (!sec) return "--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} Min`;
  };

  // Populate Table View
  if (tbody) {
    tbody.innerHTML = list.map((c) => {
      const statusClass = c.status === "COMPLETED" ? "badge-completed" : c.status === "PROCESSING" ? "badge-pending" : "badge-inactive";

      const identEmp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
      const identName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ""}` : "Unidentified";

      const qaBadge = c.qa_score !== null && c.qa_score !== undefined
        ? `<span class="status-pill ${c.qa_score >= 80 ? 'badge-completed' : 'badge-inactive'}" style="font-size:11.5px;">${c.qa_score}% QA</span>`
        : `<span class="status-pill badge-pending" style="font-size:11.5px;">Pending QA</span>`;

      const refText = c.call_reference || (c.id ? c.id.substring(0, 8) + "..." : "CALL-LOG");

      return `
        <tr style="cursor: pointer;" onclick="openTranscriptModal('${c.id}')">
          <td><code style="font-weight:700; color:#1d61e7; background:#eff6ff; padding:2px 6px; border-radius:4px;">${refText}</code></td>
          <td><strong>${fmtDuration(c.duration_seconds)}</strong></td>
          <td><small style="color:#64748b; font-weight:600; text-transform:uppercase;">${c.detected_language || "EN"}</small></td>
          <td><span class="status-pill badge-completed" style="font-size:11.5px;">${c.speakers_count || 2} Speakers</span></td>
          <td><strong>${identName}</strong></td>
          <td>${qaBadge}</td>
          <td><span class="status-pill ${statusClass}">${c.status}</span></td>
          <td>
            <button class="btn-primary" style="padding: 4px 10px; font-size: 11px;" onclick="event.stopPropagation(); openTranscriptModal('${c.id}')"><i data-lucide="file-text"></i> View</button>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="event.stopPropagation(); deleteCallAudit('${c.id}')"><i data-lucide="trash-2"></i></button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Populate Grid View Cards
  if (gridContainer) {
    gridContainer.innerHTML = list.map((c) => {
      const statusClass = c.status === "COMPLETED" ? "badge-completed" : c.status === "PROCESSING" ? "badge-pending" : "badge-inactive";

      const identEmp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
      const identName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ""}` : "Auto-Matching Speaker...";

      const expEmp = employeesCache.find(e => strId(e.id) === strId(c.expected_employee_id));
      const expName = expEmp ? `${expEmp.first_name} ${expEmp.last_name || ""}` : "Open Assignment";

      const deptName = (identEmp ? departmentsCache.find(d => strId(d.id) === strId(identEmp.department_id))?.name : null) || "General";

      const qaBadge = c.qa_score !== null && c.qa_score !== undefined
        ? `<span class="status-pill ${c.qa_score >= 80 ? 'badge-completed' : 'badge-inactive'}" style="font-size:11px;">${c.qa_score}% QA Score</span>`
        : `<span class="status-pill badge-pending" style="font-size:11px;">Processing QA...</span>`;

      const confText = c.identification_confidence !== null && c.identification_confidence !== undefined
        ? `${Math.round(c.identification_confidence * 100)}% Match`
        : "N/A";

      const refText = c.call_reference || (c.id ? c.id.substring(0, 8) + "..." : "CALL-LOG");

      return `
        <div class="metric-card" style="padding: 22px; border-radius: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
          <!-- TOP ROW: ICON, CALL REF & STATUS -->
          <div class="metric-card-top" style="margin-bottom: 14px;">
            <div style="display: flex; gap: 14px; align-items: flex-start; min-width: 0; flex: 1;">
              <div style="width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #1d61e7, #3b82f6); color: #ffffff; font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 12px rgba(29, 97, 231, 0.2);">
                <i data-lucide="file-audio"></i>
              </div>
              <div style="min-width: 0; flex: 1;">
                <code style="font-size: 11px; font-weight: 700; color: #1d61e7; background: #eff6ff; padding: 2px 8px; border-radius: 6px; display: inline-block; margin-bottom: 3px;">${refText}</code>
                <h3 style="font-size: 16.5px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.25; word-break: break-word;">${identName}</h3>
                <small style="color: #64748b; font-size: 12px; display: block; margin-top: 2px;">Assigned: ${expName}</small>
              </div>
            </div>
            <span class="status-pill ${statusClass}" style="font-size: 11px; flex-shrink: 0; margin-left: 8px;">${c.status}</span>
          </div>

          <!-- DETAILS GRID: QA SCORE, CONFIDENCE, DURATION, DEPT -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin: 12px 0;">
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">QA PERFORMANCE</span>
              ${qaBadge}
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">SPEAKER MATCH</span>
              <strong style="color:#0f172a; font-size:13px; display:block;">${confText}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">CALL DURATION</span>
              <strong style="color:#0f172a; font-size:13px; display:block;">${fmtDuration(c.duration_seconds)}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">DEPARTMENT</span>
              <strong style="color:#0f172a; font-size:13px; word-break:break-word; display:block;">${deptName}</strong>
            </div>
          </div>

          <!-- FOOTER ACTION BUTTONS -->
          <div style="display: flex; align-items: center; gap: 10px; padding-top: 14px; border-top: 1px solid #f1f5f9;">
            <button class="btn-primary" style="flex: 1; padding: 8px 14px; font-size: 12.5px; justify-content: center;" onclick="openTranscriptModal('${c.id}')"><i data-lucide="file-text" style="width: 14px;"></i> View Transcript & QA</button>
            <button class="btn-secondary" style="padding: 8px 12px; font-size: 12.5px; color: #ef4444;" onclick="deleteCallAudit('${c.id}')"><i data-lucide="trash-2" style="width: 14px;"></i></button>
          </div>
        </div>
      `;
    }).join("");
  }

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
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
function openEnrollmentModal(e) { if (e) e.preventDefault(); loadEmployees(); openModal("enrollmentModal"); }
function openAuditModal() { loadEmployees(); openModal("auditModal"); }
async function openVoiceSummaryModal(e) { if (e) e.preventDefault(); openModal("voiceSummaryModal"); }

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

  const empShiftFilter = document.getElementById("empShiftFilter");
  if (empShiftFilter) {
    empShiftFilter.innerHTML = `<option value="">All Shifts</option>` +
      shiftsCache.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
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

let empViewMode = "table";

function switchEmpViewMode(mode, btn) {
  empViewMode = mode;
  const btnTable = document.getElementById("btnEmpViewTable");
  const btnGrid = document.getElementById("btnEmpViewGrid");
  const tableView = document.getElementById("employeesTableView");
  const gridView = document.getElementById("employeesGridView");

  if (mode === "table") {
    if (btnTable) btnTable.classList.add("active");
    if (btnGrid) btnGrid.classList.remove("active");
    if (tableView) tableView.style.display = "block";
    if (gridView) gridView.style.display = "none";
  } else {
    if (btnGrid) btnGrid.classList.add("active");
    if (btnTable) btnTable.classList.remove("active");
    if (tableView) tableView.style.display = "none";
    if (gridView) gridView.style.display = "block";
  }
  filterEmployees();
}

function renderEmployeesTable(list) {
  const tbody = document.getElementById("employeesTableBody");
  const gridContainer = document.getElementById("employeesGridContainer");
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
    if (gridContainer) gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#64748b;">No employees found.</div>`;
    return;
  }

  // Populate Table View
  tbody.innerHTML = list.map(emp => {
    const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "--";
    const desig = designationsCache.find(d => strId(d.id) === strId(emp.designation_id))?.name || "--";
    const shift = shiftsCache.find(s => strId(s.id) === strId(emp.shift_id))?.name || "--";
    const fullName = `${emp.first_name} ${emp.last_name || ""}`.trim();
    const initials = `${emp.first_name[0] || ""}${emp.last_name ? emp.last_name[0] : ""}`.toUpperCase() || "EP";
    const contactInfo = emp.email || emp.phone || "--";
    const statusClass = emp.status === "ACTIVE" ? "badge-completed" : "badge-inactive";
    const subName = emp.father_name ? `<br><small style="color: #64748b; font-size: 11px;">S/o ${emp.father_name}</small>` : "";

    const vProf = voiceProfilesCache.find(v => strId(v.employee_id) === strId(emp.id));
    const sampleCount = vProf ? vProf.total_samples : 0;
    const voiceBadge = sampleCount > 0
      ? `<span class="status-pill badge-completed" style="font-size:11px;"><i data-lucide="mic" style="width:11px;"></i> ${sampleCount} Clip(s)</span>`
      : `<span class="status-pill badge-inactive" style="font-size:11px;">No Voice</span>`;

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
        <td><span class="status-pill clickable-status ${statusClass}" title="Click to toggle status" onclick="toggleEmployeeStatus('${emp.id}', '${emp.status}', '${fullName}')">${emp.status}</span></td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEmployeeProfileModal('${emp.id}')">Profile</button>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditEmployeeModal('${emp.id}')">Edit</button>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteEmployee('${emp.id}', '${fullName}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");

  // Populate Grid View Cards
  if (gridContainer) {
    gridContainer.innerHTML = list.map(emp => {
      const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "--";
      const desig = designationsCache.find(d => strId(d.id) === strId(emp.designation_id))?.name || "--";
      const shift = shiftsCache.find(s => strId(s.id) === strId(emp.shift_id))?.name || "--";
      const fullName = `${emp.first_name} ${emp.last_name || ""}`.trim();
      const initials = `${emp.first_name[0] || ""}${emp.last_name ? emp.last_name[0] : ""}`.toUpperCase() || "EP";
      const statusClass = emp.status === "ACTIVE" ? "badge-completed" : "badge-inactive";
      const subName = emp.father_name ? `S/o ${emp.father_name}` : "";

      const vProf = voiceProfilesCache.find(v => strId(v.employee_id) === strId(emp.id));
      const sampleCount = vProf ? vProf.total_samples : 0;
      const voiceBadge = sampleCount > 0
        ? `<span class="status-pill badge-completed" style="font-size:11px;"><i data-lucide="mic" style="width:11px;"></i> ${sampleCount} Clip(s)</span>`
        : `<span class="status-pill badge-inactive" style="font-size:11px;">No Voice</span>`;

      const empCalls = callsCache.filter(c => strId(c.identified_employee_id) === strId(emp.id) || strId(c.expected_employee_id) === strId(emp.id));
      const qaScores = empCalls.map(c => c.qa_score).filter(s => s !== null && s !== undefined);
      const avgQa = qaScores.length > 0 ? Math.round(qaScores.reduce((a, b) => a + b, 0) / qaScores.length) : null;

      const qaBadge = avgQa !== null
        ? `<span class="status-pill badge-completed" style="font-size:11px;"><i data-lucide="award" style="width:11px;"></i> ${avgQa}% QA (${empCalls.length})</span>`
        : `<span class="status-pill badge-pending" style="font-size:11px;">No Audits</span>`;

      const location = emp.location || "Main Branch";
      const email = emp.email || "--";
      const phone = emp.phone || "--";

      return `
        <div class="metric-card" style="padding: 22px; border-radius: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
          <!-- TOP ROW: AVATAR, NAME, CODE & STATUS -->
          <div class="metric-card-top" style="margin-bottom: 14px;">
            <div style="display: flex; gap: 14px; align-items: flex-start; min-width: 0; flex: 1;">
              <div style="width: 50px; height: 50px; border-radius: 14px; background: linear-gradient(135deg, #1d61e7, #3b82f6); color: #ffffff; font-size: 18px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 12px rgba(29, 97, 231, 0.2);">
                ${initials}
              </div>
              <div style="min-width: 0; flex: 1;">
                <code style="font-size: 11px; font-weight: 700; color: #1d61e7; background: #eff6ff; padding: 2px 8px; border-radius: 6px; display: inline-block; margin-bottom: 3px;">${emp.employee_code}</code>
                <h3 style="font-size: 16.5px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.25; word-break: break-word;">${fullName}</h3>
                ${subName ? `<small style="color: #64748b; font-size: 12px; display: block; margin-top: 2px;">${subName}</small>` : ""}
              </div>
            </div>
            <span class="status-pill clickable-status ${statusClass}" style="font-size: 11px; flex-shrink: 0; margin-left: 8px;" title="Click to toggle status" onclick="toggleEmployeeStatus('${emp.id}', '${emp.status}', '${fullName}')">${emp.status}</span>
          </div>

          <!-- ENRICHED 6-FIELD DETAILS GRID -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; font-size: 13px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin: 12px 0;">
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">DEPARTMENT</span>
              <strong style="color:#0f172a; font-size:13px; word-break:break-word; display:block;">${dept}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">DESIGNATION</span>
              <strong style="color:#0f172a; font-size:13px; word-break:break-word; display:block;">${desig}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">SHIFT TIMING</span>
              <strong style="color:#0f172a; font-size:13px; word-break:break-word; display:block;">${shift}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">LOCATION</span>
              <strong style="color:#0f172a; font-size:13px; word-break:break-word; display:block;">${location}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">EMAIL ADDRESS</span>
              <strong style="color:#0f172a; font-size:12px; word-break:break-all; display:block;">${email}</strong>
            </div>
            <div>
              <span style="color:#94a3b8; font-size:10.5px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:2px;">PHONE NUMBER</span>
              <strong style="color:#0f172a; font-size:12px; word-break:break-all; display:block;">${phone}</strong>
            </div>
          </div>

          <!-- BADGES ROW -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
            ${qaBadge}
            ${voiceBadge}
          </div>

          <!-- ENRICHED ACTION FOOTER -->
          <div style="display: flex; align-items: center; gap: 8px; padding-top: 14px; border-top: 1px solid #f1f5f9; flex-wrap: wrap;">
            <button class="btn-secondary" style="flex: 1; min-width: 80px; padding: 8px 10px; font-size: 12px; justify-content: center;" onclick="openEmployeeProfileModal('${emp.id}')"><i data-lucide="user" style="width: 14px;"></i> Profile</button>
            <button class="btn-secondary" style="padding: 8px 10px; font-size: 12px;" onclick="openManageVoiceClipsModal('${emp.id}', '${fullName}')"><i data-lucide="mic" style="width: 14px;"></i> Voice Clips</button>
            <button class="btn-secondary" style="padding: 8px 10px; font-size: 12px;" onclick="openEditEmployeeModal('${emp.id}')"><i data-lucide="edit-3" style="width: 14px;"></i> Edit</button>
            <button class="btn-secondary" style="padding: 8px 10px; font-size: 12px; color: #ef4444;" onclick="deleteEmployee('${emp.id}', '${fullName}')"><i data-lucide="trash-2" style="width: 14px;"></i></button>
          </div>
        </div>
      `;
    }).join("");
  }

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
  const shiftFilter = document.getElementById("empShiftFilter")?.value || "";

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
    const shiftName = (shiftsCache.find(s => strId(s.id) === strId(e.shift_id))?.name || "").toLowerCase();

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
      desigName.includes(query) ||
      shiftName.includes(query);

    const matchDept = !deptFilter || strId(e.department_id) === strId(deptFilter);
    const matchDesig = !desigFilter || strId(e.designation_id) === strId(desigFilter);
    const matchShift = !shiftFilter || strId(e.shift_id) === strId(shiftFilter);
    const matchStatus = currentEmpStatusFilter === "ALL" || e.status === currentEmpStatusFilter;

    return matchQuery && matchDept && matchDesig && matchShift && matchStatus;
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
  } catch (err) { }

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
          <div><span style="color:#64748b;">Status:</span><br><strong style="color:${emp.status === 'ACTIVE' ? '#059669' : '#ef4444'};">${emp.status}</strong></div>
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
    initVeDropzones();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error loading voice enrollment directory</td></tr>`;
  }
}

function populateVoiceEnrollmentDropdowns() {
  populateVeAgentDropdown();
  populateVerifyAgentDropdown();
}

/* ==========================================================================
   VOICE ENROLLMENT LUXURY DROPDOWN & DROPZONE
   ========================================================================== */

function populateVeAgentDropdown(filterText = "") {
  const listEl = document.getElementById("veAgentOptionsList");
  if (!listEl) return;

  const currentVal = document.getElementById("veEmployeeSelect")?.value || "";
  const query = filterText.toLowerCase().trim();

  let filtered = employeesCache;
  if (query) {
    filtered = employeesCache.filter(e => {
      const name = `${e.first_name} ${e.last_name || ""}`.toLowerCase();
      const code = (e.employee_code || "").toLowerCase();
      const dept = (departmentsCache.find(d => strId(d.id) === strId(e.department_id))?.name || "").toLowerCase();
      return name.includes(query) || code.includes(query) || dept.includes(query);
    });
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 12px;">No matching staff found</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(emp => {
    const isSel = strId(emp.id) === strId(currentVal);
    const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "General";
    const initials = `${emp.first_name.charAt(0)}${(emp.last_name || '').charAt(0)}`.toUpperCase();

    return `
      <div class="agent-option-row ${isSel ? 'selected' : ''}" onclick="selectVeAgentOption('${emp.id}')">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="agent-avatar-circle">
            ${initials || 'AG'}
          </div>
          <div>
            <strong style="font-size: 13px; color: #0f172a; display: block;">${emp.first_name} ${emp.last_name || ""}</strong>
            <small style="font-size: 11px; color: #64748b;">${emp.employee_code} • ${dept}</small>
          </div>
        </div>
        ${isSel ? '<i data-lucide="check" style="width: 14px; color: #2563eb;"></i>' : ''}
      </div>
    `;
  }).join("");

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function toggleVeAgentDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("veAgentMenu");
  const trigger = document.getElementById("veAgentTrigger");
  const chevron = document.getElementById("veTriggerChevron");
  if (!menu) return;

  const isOpen = menu.classList.contains("show");
  if (isOpen) {
    menu.classList.remove("show");
    trigger?.classList.remove("active");
    if (chevron) chevron.style.transform = "rotate(0deg)";
  } else {
    menu.classList.add("show");
    trigger?.classList.add("active");
    if (chevron) chevron.style.transform = "rotate(180deg)";
    populateVeAgentDropdown();
    setTimeout(() => {
      document.getElementById("veAgentSearchInput")?.focus();
    }, 50);
  }
}

function filterVeAgentDropdown(query) {
  populateVeAgentDropdown(query);
}

function selectVeAgentOption(empId) {
  const hiddenInput = document.getElementById("veEmployeeSelect");
  if (hiddenInput) hiddenInput.value = empId || "";

  const titleEl = document.getElementById("veTriggerTitle");
  const subEl = document.getElementById("veTriggerSubtitle");
  const avatarEl = document.getElementById("veTriggerAvatar");

  if (!empId) {
    if (titleEl) titleEl.textContent = "Choose Employee to Enroll...";
    if (subEl) subEl.textContent = "Select staff member from database";
    if (avatarEl) {
      avatarEl.style.background = "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)";
      avatarEl.innerHTML = '<i data-lucide="user" style="width: 16px;"></i>';
    }
  } else {
    const emp = employeesCache.find(e => strId(e.id) === strId(empId));
    if (emp) {
      const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "General";
      const initials = `${emp.first_name.charAt(0)}${(emp.last_name || '').charAt(0)}`.toUpperCase();

      if (titleEl) titleEl.textContent = `${emp.first_name} ${emp.last_name || ""} (${emp.employee_code})`;
      if (subEl) subEl.textContent = `Department: ${dept} • Voice Profile Ready`;
      if (avatarEl) {
        avatarEl.style.background = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
        avatarEl.textContent = initials || "AG";
      }
    }
  }

  // Close menu
  const menu = document.getElementById("veAgentMenu");
  const trigger = document.getElementById("veAgentTrigger");
  const chevron = document.getElementById("veTriggerChevron");
  menu?.classList.remove("show");
  trigger?.classList.remove("active");
  if (chevron) chevron.style.transform = "rotate(0deg)";

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

/* ==========================================================================
   SPEAKER VERIFICATION LUXURY DROPDOWN & DROPZONE
   ========================================================================== */

function populateVerifyAgentDropdown(filterText = "") {
  const listEl = document.getElementById("verifyAgentOptionsList");
  if (!listEl) return;

  const currentVal = document.getElementById("verifyTargetSelect")?.value || "";
  const query = filterText.toLowerCase().trim();

  let filtered = employeesCache;
  if (query) {
    filtered = employeesCache.filter(e => {
      const name = `${e.first_name} ${e.last_name || ""}`.toLowerCase();
      const code = (e.employee_code || "").toLowerCase();
      const dept = (departmentsCache.find(d => strId(d.id) === strId(e.department_id))?.name || "").toLowerCase();
      return name.includes(query) || code.includes(query) || dept.includes(query);
    });
  }

  let html = `
    <div class="agent-option-row ${!currentVal ? 'selected' : ''}" onclick="selectVerifyAgentOption('')">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="agent-avatar-circle" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
          <i data-lucide="globe" style="width: 14px;"></i>
        </div>
        <div>
          <strong style="font-size: 13px; color: #0f172a; display: block;">Open Identification (1:N Search Across All)</strong>
          <small style="font-size: 11px; color: #64748b;">Default • Matches against all enrolled profiles</small>
        </div>
      </div>
      <span class="status-pill badge-completed" style="font-size: 10px; padding: 2px 7px;">Default</span>
    </div>
  `;

  html += filtered.map(emp => {
    const isSel = strId(emp.id) === strId(currentVal);
    const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "General";
    const initials = `${emp.first_name.charAt(0)}${(emp.last_name || '').charAt(0)}`.toUpperCase();

    return `
      <div class="agent-option-row ${isSel ? 'selected' : ''}" onclick="selectVerifyAgentOption('${emp.id}')">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="agent-avatar-circle" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
            ${initials || 'AG'}
          </div>
          <div>
            <strong style="font-size: 13px; color: #0f172a; display: block;">${emp.first_name} ${emp.last_name || ""}</strong>
            <small style="font-size: 11px; color: #64748b;">${emp.employee_code} • ${dept}</small>
          </div>
        </div>
        ${isSel ? '<i data-lucide="check" style="width: 14px; color: #059669;"></i>' : ''}
      </div>
    `;
  }).join("");

  listEl.innerHTML = html;
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function toggleVerifyAgentDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("verifyAgentMenu");
  const trigger = document.getElementById("verifyAgentTrigger");
  const chevron = document.getElementById("verifyTriggerChevron");
  if (!menu) return;

  const isOpen = menu.classList.contains("show");
  if (isOpen) {
    menu.classList.remove("show");
    trigger?.classList.remove("active");
    if (chevron) chevron.style.transform = "rotate(0deg)";
  } else {
    menu.classList.add("show");
    trigger?.classList.add("active");
    if (chevron) chevron.style.transform = "rotate(180deg)";
    populateVerifyAgentDropdown();
    setTimeout(() => {
      document.getElementById("verifyAgentSearchInput")?.focus();
    }, 50);
  }
}

function filterVerifyAgentDropdown(query) {
  populateVerifyAgentDropdown(query);
}

function selectVerifyAgentOption(empId) {
  const hiddenInput = document.getElementById("verifyTargetSelect");
  if (hiddenInput) hiddenInput.value = empId || "";

  const titleEl = document.getElementById("verifyTriggerTitle");
  const subEl = document.getElementById("verifyTriggerSubtitle");
  const avatarEl = document.getElementById("verifyTriggerAvatar");

  if (!empId) {
    if (titleEl) titleEl.textContent = "Open Identification (1:N Search Across All)";
    if (subEl) subEl.textContent = "Matches against all enrolled employee profiles";
    if (avatarEl) {
      avatarEl.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)";
      avatarEl.innerHTML = '<i data-lucide="globe" style="width: 16px;"></i>';
    }
  } else {
    const emp = employeesCache.find(e => strId(e.id) === strId(empId));
    if (emp) {
      const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "General";
      const initials = `${emp.first_name.charAt(0)}${(emp.last_name || '').charAt(0)}`.toUpperCase();

      if (titleEl) titleEl.textContent = `${emp.first_name} ${emp.last_name || ""} (${emp.employee_code})`;
      if (subEl) subEl.textContent = `Department: ${dept} • Targeted 1:1 Verification`;
      if (avatarEl) {
        avatarEl.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)";
        avatarEl.textContent = initials || "AG";
      }
    }
  }

  // Close menu
  const menu = document.getElementById("verifyAgentMenu");
  const trigger = document.getElementById("verifyAgentTrigger");
  const chevron = document.getElementById("verifyTriggerChevron");
  menu?.classList.remove("show");
  trigger?.classList.remove("active");
  if (chevron) chevron.style.transform = "rotate(0deg)";

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function selectEmployeeForEnrollment(employeeId) {
  selectVeAgentOption(employeeId);
  const trigger = document.getElementById("veAgentTrigger");
  if (trigger) {
    trigger.scrollIntoView({ behavior: "smooth" });
  }
}

/* ==========================================================================
   DRAG AND DROP DROPZONES FOR ENROLLMENT & VERIFICATION
   ========================================================================== */

function initVeDropzones() {
  // Voice Enrollment Dropzone
  const veDropzone = document.getElementById("veDropzone");
  const veFileInput = document.getElementById("veAudioFiles");
  if (veDropzone && veFileInput) {
    ["dragenter", "dragover"].forEach(evt => {
      veDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); veDropzone.classList.add("drag-over"); }, false);
    });
    ["dragleave", "drop"].forEach(evt => {
      veDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); veDropzone.classList.remove("drag-over"); }, false);
    });
    veDropzone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        veFileInput.files = dt.files;
        handleVeFileSelect();
      }
    }, false);
  }

  // Speaker Verification Dropzone
  const verDropzone = document.getElementById("verifyDropzone");
  const verFileInput = document.getElementById("verifyAudioFile");
  if (verDropzone && verFileInput) {
    ["dragenter", "dragover"].forEach(evt => {
      verDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); verDropzone.classList.add("drag-over"); }, false);
    });
    ["dragleave", "drop"].forEach(evt => {
      verDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); verDropzone.classList.remove("drag-over"); }, false);
    });
    verDropzone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        verFileInput.files = dt.files;
        handleVerifyFileSelect();
      }
    }, false);
  }
}

function handleVeFileSelect(e) {
  const fileInput = document.getElementById("veAudioFiles");
  const previewCard = document.getElementById("veFilePreviewCard");
  const listContainer = document.getElementById("veFileListContainer");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    if (previewCard) previewCard.style.display = "none";
    if (listContainer) listContainer.innerHTML = "";
    return;
  }

  const files = Array.from(fileInput.files);
  if (listContainer) {
    listContainer.innerHTML = files.map((f) => {
      const mb = (f.size / (1024 * 1024)).toFixed(2);
      return `
        <div class="audio-file-row-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #ffffff; border: 1px solid #bfdbfe; border-radius: 10px; box-shadow: 0 2px 6px rgba(37,99,235,0.06);">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: #eff6ff; color: #1d4ed8; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i data-lucide="music" style="width: 16px; height: 16px;"></i>
            </div>
            <div style="min-width: 0;">
              <strong style="font-size: 12.5px; color: #0f172a; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;" title="${f.name}">${f.name}</strong>
              <small style="font-size: 11px; color: #64748b; font-family: monospace;">${mb} MB • Ready to enroll</small>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <div class="sound-bars">
              <div class="sound-bar"></div>
              <div class="sound-bar"></div>
              <div class="sound-bar"></div>
              <div class="sound-bar"></div>
            </div>
            <button type="button" class="btn-secondary" style="font-size: 11px; padding: 3px 8px; height: auto; color: #dc2626; border-color: #fca5a5; background: #ffffff;" onclick="clearVeSelectedFiles(event)">
              <i data-lucide="x" style="width: 11px;"></i> Remove
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  if (previewCard) previewCard.style.display = "block";
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function clearVeSelectedFiles(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const fileInput = document.getElementById("veAudioFiles");
  const previewCard = document.getElementById("veFilePreviewCard");
  const listContainer = document.getElementById("veFileListContainer");
  if (fileInput) fileInput.value = "";
  if (listContainer) listContainer.innerHTML = "";
  if (previewCard) previewCard.style.display = "none";
}

function handleVerifyFileSelect(e) {
  const fileInput = document.getElementById("verifyAudioFile");
  const previewCard = document.getElementById("verifyFilePreviewCard");
  const listContainer = document.getElementById("verifyFileListContainer");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    if (previewCard) previewCard.style.display = "none";
    if (listContainer) listContainer.innerHTML = "";
    return;
  }

  const file = fileInput.files[0];
  const mb = (file.size / (1024 * 1024)).toFixed(2);

  if (listContainer) {
    listContainer.innerHTML = `
      <div class="audio-file-row-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #ffffff; border: 1px solid #a7f3d0; border-radius: 10px; box-shadow: 0 2px 6px rgba(16,185,129,0.06);">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: #ecfdf5; color: #059669; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i data-lucide="music" style="width: 16px; height: 16px;"></i>
          </div>
          <div style="min-width: 0;">
            <strong style="font-size: 12.5px; color: #0f172a; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;" title="${file.name}">${file.name}</strong>
            <small style="font-size: 11px; color: #64748b; font-family: monospace;">${mb} MB • Ready to verify</small>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <div class="sound-bars">
            <div class="sound-bar" style="background: #059669;"></div>
            <div class="sound-bar" style="background: #059669;"></div>
            <div class="sound-bar" style="background: #059669;"></div>
            <div class="sound-bar" style="background: #059669;"></div>
          </div>
          <button type="button" class="btn-secondary" style="font-size: 11px; padding: 3px 8px; height: auto; color: #dc2626; border-color: #fca5a5; background: #ffffff;" onclick="clearVerifySelectedFile(event)">
            <i data-lucide="x" style="width: 11px;"></i> Remove
          </button>
        </div>
      </div>
    `;
  }

  if (previewCard) previewCard.style.display = "block";
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function clearVerifySelectedFile(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const fileInput = document.getElementById("verifyAudioFile");
  const previewCard = document.getElementById("verifyFilePreviewCard");
  const listContainer = document.getElementById("verifyFileListContainer");
  if (fileInput) fileInput.value = "";
  if (listContainer) listContainer.innerHTML = "";
  if (previewCard) previewCard.style.display = "none";
}

/* ==========================================================================
   VOICE ENROLLMENT DIRECTORY PAGINATION (5 PER PAGE)
   ========================================================================== */

let veDirectoryCurrentPage = 1;
const VE_DIRECTORY_PAGE_SIZE = 5;
let veSummaryCache = null;

function setVeDirectoryPage(pageNum) {
  veDirectoryCurrentPage = pageNum;
  renderVoiceEnrollmentDirectory();
}

function changeVeDirectoryPage(direction) {
  if (direction === "prev") {
    if (veDirectoryCurrentPage > 1) {
      veDirectoryCurrentPage--;
      renderVoiceEnrollmentDirectory();
    }
  } else if (direction === "next") {
    veDirectoryCurrentPage++;
    renderVoiceEnrollmentDirectory();
  }
}

function renderVoiceEnrollmentDirectory(summaryData = null) {
  const tbody = document.getElementById("veDirectoryTableBody");
  if (!tbody) return;

  if (summaryData) {
    veSummaryCache = summaryData;
  }

  const data = veSummaryCache;
  const paginationInfo = document.getElementById("veDirectoryPaginationInfo");
  const prevBtn = document.getElementById("veDirPrevBtn");
  const nextBtn = document.getElementById("veDirNextBtn");
  const pageNumbersContainer = document.getElementById("veDirectoryPageNumbers");

  if (!data) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No voice enrollment summary data available.</td></tr>`;
    if (paginationInfo) paginationInfo.innerHTML = "Showing <strong>0</strong> staff profiles";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
    return;
  }

  const profiles = data.profiles || [];

  const agentsMetric = document.getElementById("veMetricAgents");
  const samplesMetric = document.getElementById("veMetricSamples");
  const vectorsMetric = document.getElementById("veMetricVectors");
  const durationMetric = document.getElementById("veMetricDuration");

  let cumulativeDurationSec = 0;
  profiles.forEach(p => {
    (p.samples || []).forEach(s => {
      if (s.duration_seconds) cumulativeDurationSec += s.duration_seconds;
    });
  });

  if (agentsMetric) agentsMetric.textContent = data.total_employees_enrolled || 0;
  if (samplesMetric) samplesMetric.textContent = data.total_voice_samples || 0;
  if (vectorsMetric) vectorsMetric.textContent = data.total_vectors || 0;
  if (durationMetric) {
    const totalSec = Math.round(cumulativeDurationSec);
    durationMetric.textContent = totalSec > 60 ? `${Math.floor(totalSec / 60)}m ${totalSec % 60}s` : `${totalSec}s`;
  }

  const totalRecords = profiles.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / VE_DIRECTORY_PAGE_SIZE));

  if (veDirectoryCurrentPage > totalPages) {
    veDirectoryCurrentPage = totalPages;
  }
  if (veDirectoryCurrentPage < 1) {
    veDirectoryCurrentPage = 1;
  }

  if (totalRecords === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No employees registered. Go to Employees tab to create employees first.</td></tr>`;
    if (paginationInfo) paginationInfo.innerHTML = "Showing <strong>0</strong> staff profiles";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    return;
  }

  const startIndex = (veDirectoryCurrentPage - 1) * VE_DIRECTORY_PAGE_SIZE;
  const endIndex = Math.min(startIndex + VE_DIRECTORY_PAGE_SIZE, totalRecords);
  const pagedProfiles = profiles.slice(startIndex, endIndex);

  // Update Pagination Info
  if (paginationInfo) {
    paginationInfo.innerHTML = `Showing <strong>${startIndex + 1}</strong> - <strong>${endIndex}</strong> of <strong>${totalRecords}</strong> staff profiles`;
  }

  // Update Previous / Next Button States
  if (prevBtn) {
    const isPrevDisabled = veDirectoryCurrentPage <= 1;
    prevBtn.disabled = isPrevDisabled;
    prevBtn.style.opacity = isPrevDisabled ? "0.45" : "1";
    prevBtn.style.cursor = isPrevDisabled ? "not-allowed" : "pointer";
    prevBtn.style.background = isPrevDisabled ? "#f1f5f9" : "#ffffff";
    prevBtn.style.borderColor = isPrevDisabled ? "#e2e8f0" : "#cbd5e1";
    prevBtn.style.color = isPrevDisabled ? "#94a3b8" : "#1e293b";
  }

  if (nextBtn) {
    const isNextDisabled = veDirectoryCurrentPage >= totalPages;
    nextBtn.disabled = isNextDisabled;
    nextBtn.style.opacity = isNextDisabled ? "0.45" : "1";
    nextBtn.style.cursor = isNextDisabled ? "not-allowed" : "pointer";
    nextBtn.style.background = isNextDisabled ? "#f1f5f9" : "#ffffff";
    nextBtn.style.borderColor = isNextDisabled ? "#e2e8f0" : "#cbd5e1";
    nextBtn.style.color = isNextDisabled ? "#94a3b8" : "#1e293b";
  }

  // Update Page Number Buttons (1, 2, 3, 4...)
  if (pageNumbersContainer) {
    let pagesHtml = "";
    for (let p = 1; p <= totalPages; p++) {
      const isActive = p === veDirectoryCurrentPage;
      const baseStyle = "width: 40px; height: 40px; min-width: 40px; padding: 0; border-radius: 11px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; font-family: inherit; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);";
      const btnStyle = isActive
        ? `${baseStyle} border: 1px solid #1d61e7; background: linear-gradient(135deg, #1d61e7 0%, #174ebc 100%); color: #ffffff; font-weight: 700; box-shadow: 0 4px 14px rgba(29, 97, 231, 0.4); cursor: default; transform: scale(1.05);`
        : `${baseStyle} border: 1px solid #cbd5e1; background: #ffffff; color: #334155; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.04); cursor: pointer;`;

      pagesHtml += `
        <button type="button" class="diar-page-btn ${isActive ? 'active' : ''}" style="${btnStyle}" onclick="setVeDirectoryPage(${p})" title="Page ${p}">
          ${p}
        </button>
      `;
    }
    pageNumbersContainer.innerHTML = pagesHtml;
  }

  tbody.innerHTML = pagedProfiles.map(prof => {
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

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
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

  const fileInput = document.getElementById("veAudioFiles");
  if (!fileInput.files || fileInput.files.length === 0) {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="cpu"></i> Enroll Voice Data`; }
    return showToast("Please select at least one audio file to upload", "error");
  }
  for (let i = 0; i < fileInput.files.length; i++) {
    formData.append("files", fileInput.files[i]);
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
    clearVeSelectedFiles();
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

  const fileInput = document.getElementById("verifyAudioFile");
  if (!fileInput.files || fileInput.files.length === 0) {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<i data-lucide="shield-check"></i> Verify Speaker`; }
    return showToast("Please select a query audio file to upload", "error");
  }
  formData.append("file", fileInput.files[0]);

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

    const matchedEmp = result.matched_employee || {};
    const topMatch = (result.top_matches && result.top_matches[0]) ? result.top_matches[0] : {};
    const empId = matchedEmp.id || topMatch.employee_id;
    const cachedEmp = employeesCache.find(e => strId(e.id) === strId(empId));

    const empCode = matchedEmp.employee_code || (cachedEmp ? cachedEmp.employee_code : "AGNT-XXXXXX");
    const fullName = matchedEmp.full_name || (matchedEmp.first_name ? `${matchedEmp.first_name} ${matchedEmp.last_name || ""}`.trim() : (cachedEmp ? `${cachedEmp.first_name} ${cachedEmp.last_name || ""}`.trim() : "Enrolled Agent"));
    const deptName = matchedEmp.department_name || (cachedEmp && cachedEmp.department_id ? departmentsCache.find(d => strId(d.id) === strId(cachedEmp.department_id))?.name : null);
    const desigName = matchedEmp.designation_name || (cachedEmp && cachedEmp.designation_id ? designationsCache.find(d => strId(d.id) === strId(cachedEmp.designation_id))?.name : null);

    const isMatch = result.is_match;
    const titleEl = document.getElementById("modalVerifyTitle");
    const subEl = document.getElementById("modalVerifySubtitle");
    const iconBox = document.getElementById("modalVerifyIconBox");
    const bodyEl = document.getElementById("modalVerifyBody");

    if (isMatch) {
      if (titleEl) { titleEl.textContent = "VERIFIED MATCH CONFIRMED"; titleEl.style.color = "#0f172a"; }
      if (subEl) subEl.textContent = "Milvus Vector Biometric Verification Successful";
      if (iconBox) {
        iconBox.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)";
        iconBox.style.boxShadow = "0 8px 20px -4px rgba(16, 185, 129, 0.4)";
        iconBox.innerHTML = '<i data-lucide="shield-check" style="width: 26px; height: 26px;"></i>';
      }

      const initials = `${(matchedEmp.first_name || cachedEmp?.first_name || 'A').charAt(0)}${(matchedEmp.last_name || cachedEmp?.last_name || '').charAt(0)}`.toUpperCase();

      if (bodyEl) {
        bodyEl.innerHTML = `
          <!-- MATCH HIGHLIGHT BANNER -->
          <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #bbf7d0; border-radius: 16px; padding: 18px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.08); flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 48px; height: 48px; border-radius: 14px; background: #059669; color: #fff; font-size: 20px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);">
                ${initials || 'EM'}
              </div>
              <div>
                <span style="font-size: 10.5px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">AUTHENTICATED EMPLOYEE</span>
                <h3 style="font-size: 17px; font-weight: 800; color: #0f172a; margin: 0;">${fullName} <small style="font-size: 12px; color: #64748b;">(${empCode})</small></h3>
                <span style="font-size: 12px; color: #475569; font-weight: 600;">Department: ${deptName || 'General'}</span>
              </div>
            </div>
            <div style="text-align: right;">
              <span class="status-pill badge-completed" style="font-size: 13px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 4px;">
                <i data-lucide="check" style="width: 14px;"></i> ${scorePct}% Match
              </span>
            </div>
          </div>

          <!-- VERIFICATION METRICS GRID -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px;">
              <small style="color: #64748b; font-size: 11.5px; font-weight: 600; display: block; margin-bottom: 2px;">Assigned Role</small>
              <strong style="font-size: 13.5px; color: #0f172a;">${desigName || 'Staff Specialist'}</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px;">
              <small style="color: #64748b; font-size: 11.5px; font-weight: 600; display: block; margin-bottom: 2px;">Cosine Similarity Score</small>
              <strong style="font-size: 13.5px; color: #059669;">${scorePct}% (Passed Threshold)</strong>
            </div>
          </div>
        `;
      }
    } else {
      if (titleEl) { titleEl.textContent = "NO MATCH DETECTED"; titleEl.style.color = "#991b1b"; }
      if (subEl) subEl.textContent = "Audio sample did not meet minimum similarity threshold";
      if (iconBox) {
        iconBox.style.background = "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)";
        iconBox.style.boxShadow = "0 8px 20px -4px rgba(239, 68, 68, 0.4)";
        iconBox.innerHTML = '<i data-lucide="alert-triangle" style="width: 26px; height: 26px;"></i>';
      }

      if (bodyEl) {
        bodyEl.innerHTML = `
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 14px; padding: 18px; margin-bottom: 14px; text-align: center;">
            <strong style="color: #991b1b; font-size: 14.5px; display: block; margin-bottom: 4px;">Speaker Identity Unknown</strong>
            <p style="color: #7f1d1d; font-size: 13px; margin: 0; line-height: 1.5;">
              The provided query voice audio does not match any registered employee embedding above the required threshold (${Math.round((result.threshold_applied || 0.7) * 100)}%).
            </p>
            ${topMatch.employee_id ? `<div style="margin-top: 10px; font-size: 12px; color: #991b1b; background: #fee2e2; padding: 8px; border-radius: 8px;">Closest Candidate: <strong>${fullName}</strong> (${empCode}) with ${scorePct}% similarity.</div>` : ''}
          </div>
        `;
      }
    }

    openModal("speakerVerifyResultModal");

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

/* ==========================================================================
   2. SPEAKER DIARIZATION STUDIO LOGIC
   ========================================================================== */
let currentDiarMode = "upload";
let diarMediaRecorder = null;
let diarAudioChunks = [];
let diarRecordedBlob = null;
let diarMicTimerInterval = null;
let diarMicSeconds = 0;

function setDiarInputMode(mode) {
  currentDiarMode = mode;
  const btnUpload = document.getElementById("btnDiarModeUpload");
  const btnMic = document.getElementById("btnDiarModeMic");
  const btnDb = document.getElementById("btnDiarModeDb");

  const areaUpload = document.getElementById("diarUploadArea");
  const areaMic = document.getElementById("diarMicArea");
  const areaDb = document.getElementById("diarDbArea");

  if (btnUpload) btnUpload.classList.toggle("active", mode === "upload");
  if (btnMic) btnMic.classList.toggle("active", mode === "mic");
  if (btnDb) btnDb.classList.toggle("active", mode === "db");

  if (areaUpload) areaUpload.style.display = mode === "upload" ? "block" : "none";
  if (areaMic) areaMic.style.display = mode === "mic" ? "block" : "none";
  if (areaDb) areaDb.style.display = mode === "db" ? "block" : "none";
}

async function loadDiarizationPage() {
  try {
    const [callsRes, empRes] = await Promise.all([
      fetch("/api/v1/calls/"),
      fetch("/api/v1/employees/")
    ]);
    if (callsRes.ok) auditsCache = await callsRes.json();
    if (empRes.ok) employeesCache = await empRes.json();
  } catch (e) { }

  const selDb = document.getElementById("diarCallSelect");
  if (selDb) {
    selDb.innerHTML = `<option value="">-- Select Call Audit Recording --</option>` +
      auditsCache.map(c => `<option value="${c.id}">${c.call_reference || c.id.substring(0, 8)} - ${c.audio_filename || "Audio Clip"}</option>`).join("");
  }

  populateDiarAgentDropdown();

  const callsEl = document.getElementById("diar-stat-calls");
  const turnsEl = document.getElementById("diar-stat-turns");
  const matchedEl = document.getElementById("diar-stat-matched");
  if (callsEl) callsEl.textContent = auditsCache.length;
  if (turnsEl) turnsEl.textContent = auditsCache.reduce((a, b) => a + (b.speakers_count || 2) * 4, 0);
  if (matchedEl) matchedEl.textContent = auditsCache.filter(c => c.identified_employee_id).length;

  // Render Diarized Calls History Table
  renderDiarHistoryTable();

  // Sync any active pending or processing jobs from backend
  const activeBackendJobs = auditsCache.filter(c => c.status === "PENDING" || c.status === "PROCESSING");
  if (activeBackendJobs.length > 0) {
    activeBackendJobs.forEach(bJob => {
      if (!diarSessionQueue.some(q => q.id === bJob.id)) {
        diarSessionQueue.push({
          id: bJob.id,
          filename: bJob.audio_filename || bJob.original_file_name || "call_audio.wav",
          status: bJob.status,
          submittedAt: Date.now(),
          elapsed: 0,
          data: bJob
        });
      }
    });
    renderDiarQueueUI();
    startDiarQueuePolling();
  }

  initDiarDropzone();
}

function populateDiarAgentDropdown(filterText = "") {
  const listEl = document.getElementById("diarAgentOptionsList");
  if (!listEl) return;

  const currentVal = document.getElementById("diarExpectedEmpSelect")?.value || "";
  const query = filterText.toLowerCase().trim();

  let filtered = employeesCache;
  if (query) {
    filtered = employeesCache.filter(e => {
      const name = `${e.first_name} ${e.last_name || ""}`.toLowerCase();
      const code = (e.employee_code || "").toLowerCase();
      const dept = (departmentsCache.find(d => strId(d.id) === strId(e.department_id))?.name || "").toLowerCase();
      return name.includes(query) || code.includes(query) || dept.includes(query);
    });
  }

  let html = `
    <div class="agent-option-row ${!currentVal ? 'selected' : ''}" onclick="selectDiarAgentOption('')">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="agent-avatar-circle" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
          <i data-lucide="globe" style="width: 14px;"></i>
        </div>
        <div>
          <strong style="font-size: 13px; color: #0f172a; display: block;">Open Biometric 1:N Identification Across All Staff</strong>
          <small style="font-size: 11px; color: #64748b;">Default • Searches all voice biometric embeddings</small>
        </div>
      </div>
      <span class="status-pill badge-completed" style="font-size: 10px; padding: 2px 7px;">Default</span>
    </div>
  `;

  html += filtered.map(emp => {
    const isSel = strId(emp.id) === strId(currentVal);
    const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "General";
    const initials = `${emp.first_name.charAt(0)}${(emp.last_name || '').charAt(0)}`.toUpperCase();

    return `
      <div class="agent-option-row ${isSel ? 'selected' : ''}" onclick="selectDiarAgentOption('${emp.id}')">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="agent-avatar-circle">
            ${initials || 'AG'}
          </div>
          <div>
            <strong style="font-size: 13px; color: #0f172a; display: block;">${emp.first_name} ${emp.last_name || ""}</strong>
            <small style="font-size: 11px; color: #64748b;">${emp.employee_code} • ${dept}</small>
          </div>
        </div>
        ${isSel ? '<i data-lucide="check" style="width: 14px; color: #2563eb;"></i>' : ''}
      </div>
    `;
  }).join("");

  listEl.innerHTML = html;
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function toggleDiarAgentDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("diarAgentMenu");
  const trigger = document.getElementById("diarAgentTrigger");
  const chevron = document.getElementById("diarTriggerChevron");
  if (!menu) return;

  const isOpen = menu.classList.contains("show");
  if (isOpen) {
    menu.classList.remove("show");
    trigger?.classList.remove("active");
    if (chevron) chevron.style.transform = "rotate(0deg)";
  } else {
    menu.classList.add("show");
    trigger?.classList.add("active");
    if (chevron) chevron.style.transform = "rotate(180deg)";
    populateDiarAgentDropdown();
    setTimeout(() => {
      document.getElementById("diarAgentSearchInput")?.focus();
    }, 50);
  }
}

function filterDiarAgentDropdown(query) {
  populateDiarAgentDropdown(query);
}

function selectDiarAgentOption(empId) {
  const hiddenInput = document.getElementById("diarExpectedEmpSelect");
  if (hiddenInput) hiddenInput.value = empId || "";

  const titleEl = document.getElementById("diarTriggerTitle");
  const subEl = document.getElementById("diarTriggerSubtitle");
  const avatarEl = document.getElementById("diarTriggerAvatar");
  const badgeEl = document.getElementById("diarModeBadge");

  if (!empId) {
    if (titleEl) titleEl.textContent = "Open Biometric 1:N Identification Across All Staff";
    if (subEl) subEl.textContent = "Matches any enrolled employee voice in database";
    if (avatarEl) {
      avatarEl.style.background = "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)";
      avatarEl.innerHTML = '<i data-lucide="globe" style="width: 16px;"></i>';
    }
    if (badgeEl) {
      badgeEl.className = "status-pill badge-completed";
      badgeEl.textContent = "🌐 1:N Global Search (Default)";
    }
  } else {
    const emp = employeesCache.find(e => strId(e.id) === strId(empId));
    if (emp) {
      const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "General";
      const initials = `${emp.first_name.charAt(0)}${(emp.last_name || '').charAt(0)}`.toUpperCase();

      if (titleEl) titleEl.textContent = `${emp.first_name} ${emp.last_name || ""} (${emp.employee_code})`;
      if (subEl) subEl.textContent = `Department: ${dept} • Targeted Biometric Verification`;
      if (avatarEl) {
        avatarEl.style.background = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
        avatarEl.textContent = initials || "AG";
      }
      if (badgeEl) {
        badgeEl.className = "status-pill badge-processing";
        badgeEl.textContent = "🎯 1:1 Targeted Verification";
      }
    }
  }

  // Close menu
  const menu = document.getElementById("diarAgentMenu");
  const trigger = document.getElementById("diarAgentTrigger");
  const chevron = document.getElementById("diarTriggerChevron");
  menu?.classList.remove("show");
  trigger?.classList.remove("active");
  if (chevron) chevron.style.transform = "rotate(0deg)";

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

// Global click to close agent dropdowns when clicking outside
document.addEventListener("click", (e) => {
  // Diarization Dropdown
  const diarWrapper = document.getElementById("diarAgentDropdownWrapper");
  if (diarWrapper && !diarWrapper.contains(e.target)) {
    document.getElementById("diarAgentMenu")?.classList.remove("show");
    document.getElementById("diarAgentTrigger")?.classList.remove("active");
    const chev = document.getElementById("diarTriggerChevron");
    if (chev) chev.style.transform = "rotate(0deg)";
  }

  // Voice Enrollment Dropdown
  const veWrapper = document.getElementById("veAgentDropdownWrapper");
  if (veWrapper && !veWrapper.contains(e.target)) {
    document.getElementById("veAgentMenu")?.classList.remove("show");
    document.getElementById("veAgentTrigger")?.classList.remove("active");
    const chev = document.getElementById("veTriggerChevron");
    if (chev) chev.style.transform = "rotate(0deg)";
  }

  // Verification Target Dropdown
  const verifyWrapper = document.getElementById("verifyAgentDropdownWrapper");
  if (verifyWrapper && !verifyWrapper.contains(e.target)) {
    document.getElementById("verifyAgentMenu")?.classList.remove("show");
    document.getElementById("verifyAgentTrigger")?.classList.remove("active");
    const chev = document.getElementById("verifyTriggerChevron");
    if (chev) chev.style.transform = "rotate(0deg)";
  }

  // QA Call Selector Dropdown
  const qaWrapper = document.getElementById("qaCallDropdownWrapper");
  if (qaWrapper && !qaWrapper.contains(e.target)) {
    document.getElementById("qaCallMenu")?.classList.remove("show");
    document.getElementById("qaCallTrigger")?.classList.remove("active");
    const chev = document.getElementById("qaTriggerChevron");
    if (chev) chev.style.transform = "rotate(0deg)";
  }
});

function initDiarDropzone() {
  const dropzone = document.getElementById("diarDropzone");
  const fileInput = document.getElementById("diarAudioFile");
  if (!dropzone || !fileInput) return;

  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("drag-over");
    }, false);
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("drag-over");
    }, false);
  });

  dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      fileInput.files = dt.files;
      handleDiarFileSelect();
    }
  }, false);
}

function handleDiarFileSelect(e) {
  const fileInput = document.getElementById("diarAudioFile");
  const previewCard = document.getElementById("diarFilePreviewCard");
  const nameEl = document.getElementById("diarPreviewFilename");
  const sizeEl = document.getElementById("diarPreviewFilesize");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    if (previewCard) previewCard.style.display = "none";
    return;
  }

  const file = fileInput.files[0];
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    sizeEl.textContent = `${mb} MB • ${file.type || 'audio/wav'}`;
  }
  if (previewCard) previewCard.style.display = "block";
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function clearDiarSelectedFile(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const fileInput = document.getElementById("diarAudioFile");
  const previewCard = document.getElementById("diarFilePreviewCard");
  if (fileInput) fileInput.value = "";
  if (previewCard) previewCard.style.display = "none";
}

// Live Mic functions for Diarization Studio
async function startDiarMicRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    diarAudioChunks = [];
    diarMediaRecorder = new MediaRecorder(stream);
    diarMediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) diarAudioChunks.push(e.data); };
    diarMediaRecorder.onstop = () => {
      diarRecordedBlob = new Blob(diarAudioChunks, { type: "audio/wav" });
      const preview = document.getElementById("diarMicAudioPreview");
      if (preview) {
        preview.src = URL.createObjectURL(diarRecordedBlob);
        preview.style.display = "block";
      }
      document.getElementById("btnDiarClearRecord").style.display = "inline-flex";
      document.getElementById("diarMicStatusText").textContent = "Recording captured! Click 'Run Diarization & Extract Text' below.";
    };

    diarMediaRecorder.start();
    diarMicSeconds = 0;
    document.getElementById("btnDiarStartRecord").disabled = true;
    document.getElementById("btnDiarStopRecord").disabled = false;
    document.getElementById("diarMicStatusText").textContent = "🎙️ Recording live call audio...";

    diarMicTimerInterval = setInterval(() => {
      diarMicSeconds++;
      const m = String(Math.floor(diarMicSeconds / 60)).padStart(2, '0');
      const s = String(diarMicSeconds % 60).padStart(2, '0');
      document.getElementById("diarMicTimer").textContent = `${m}:${s}`;
    }, 1000);
  } catch (err) {
    showToast("Microphone access denied: " + err.message, "error");
  }
}

function stopDiarMicRecording() {
  if (diarMediaRecorder && diarMediaRecorder.state !== "inactive") {
    diarMediaRecorder.stop();
    diarMediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  clearInterval(diarMicTimerInterval);
  document.getElementById("btnDiarStartRecord").disabled = false;
  document.getElementById("btnDiarStopRecord").disabled = true;
}

function clearDiarMicRecording() {
  diarRecordedBlob = null;
  diarAudioChunks = [];
  document.getElementById("diarMicAudioPreview").style.display = "none";
  document.getElementById("btnDiarClearRecord").style.display = "none";
  document.getElementById("diarMicStatusText").textContent = "Ready to record call audio...";
  document.getElementById("diarMicTimer").textContent = "00:00";
}

function loadSelectedDiarizationDetails() {
  const callId = document.getElementById("diarCallSelect")?.value;
  const container = document.getElementById("diarResultContainer");
  if (!container) return;

  if (!callId) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
        <i data-lucide="audio-lines" style="width: 44px; height: 44px; margin-bottom: 10px; color: #cbd5e1;"></i>
        <p style="font-size: 13.5px;">Upload or select a call recording above to view diarized speaker turns and biometric matches.</p>
      </div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    return;
  }

  const call = auditsCache.find(c => strId(c.id) === strId(callId));
  renderRealDiarizationData(call);
}

let diarSessionQueue = [];
let diarQueuePollInterval = null;
let currentViewedDiarJobId = null;

function renderDiarQueueUI() {
  const section = document.getElementById("diarQueueSection");
  const list = document.getElementById("diarQueueList");
  const countBadge = document.getElementById("diarQueueCountBadge");
  if (!section || !list) return;

  if (diarSessionQueue.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  const procJobs = diarSessionQueue.filter(j => j.status === "PROCESSING");
  const pendJobs = diarSessionQueue.filter(j => j.status === "PENDING");
  const compJobs = diarSessionQueue.filter(j => j.status === "COMPLETED");

  if (countBadge) {
    if (procJobs.length > 0 && pendJobs.length > 0) {
      countBadge.className = "status-pill badge-processing";
      countBadge.innerHTML = `<span class="pulse-dot-active" style="margin-right:4px;"></span> 1 Processing, ${pendJobs.length} Queued`;
    } else if (procJobs.length > 0) {
      countBadge.className = "status-pill badge-processing";
      countBadge.innerHTML = `<span class="pulse-dot-active" style="margin-right:4px;"></span> 1 Processing`;
    } else if (pendJobs.length > 0) {
      countBadge.className = "status-pill badge-queued";
      countBadge.innerHTML = `⏳ ${pendJobs.length} in Queue`;
    } else {
      countBadge.className = "status-pill badge-completed";
      countBadge.innerHTML = `✓ ${compJobs.length} Completed`;
    }
  }

  let queuePositionCounter = 1;

  list.innerHTML = diarSessionQueue.map((job) => {
    const isProc = job.status === "PROCESSING";
    const isPend = job.status === "PENDING";
    const isComp = job.status === "COMPLETED";
    const isFail = job.status === "FAILED";

    const elapsedText = `${Math.round(job.elapsed || 0)}s`;

    if (isProc) {
      const stepMsg = (job.elapsed || 0) < 15
        ? "Stage 1/3: Whisper Speech-to-Text & Word Alignment"
        : (job.elapsed || 0) < 35
          ? "Stage 2/3: PyAnnote 3.1 Multi-Speaker Separation"
          : "Stage 3/3: Milvus ECAPA Biometric Identification";

      return `
        <div class="queue-card-item processing" style="cursor: pointer;" onclick="viewCompletedDiarJob('${job.id}')">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #1d4ed8; display: flex; align-items: center; gap: 6px;">
              <span class="pulse-dot-active"></span>
              ${job.filename}
            </strong>
            <span class="status-pill badge-processing" style="font-size: 11px;">
              <i data-lucide="loader-2" style="width: 12px; vertical-align: middle; animation: spin 1s linear infinite;"></i>
              Processing (${elapsedText})
            </span>
          </div>
          <p style="font-size: 11.5px; color: #3b82f6; margin: 0; font-weight: 500;">${stepMsg}</p>
        </div>
      `;
    }

    if (isPend) {
      const pos = queuePositionCounter++;
      return `
        <div class="queue-card-item queued">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 13px; color: #92400e; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="clock" style="width: 13px;"></i>
              ${job.filename}
            </strong>
            <span class="status-pill badge-queued" style="font-size: 11px;">Position #${pos} in Queue</span>
          </div>
          <p style="font-size: 11.5px; color: #b45309; margin: 0;">Waiting in RabbitMQ for background worker...</p>
        </div>
      `;
    }

    if (isComp) {
      const turnsCount = job.data?.transcript_json?.turns?.length || 0;
      const isSelected = currentViewedDiarJobId === job.id;
      return `
        <div class="queue-card-item completed" style="background: ${isSelected ? '#f0fdf4' : '#ffffff'}; border-color: ${isSelected ? '#86efac' : '#e2e8f0'};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 13px; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="check-circle-2" style="width: 13px; color: #16a34a;"></i>
                ${job.filename}
              </strong>
              <small style="color: #64748b; font-size: 11.5px;">${turnsCount} Diarized Turns • Ready</small>
            </div>
            <button class="btn-secondary" style="font-size: 11px; padding: 4px 10px; height: auto;" onclick="viewCompletedDiarJob('${job.id}')">
              ${isSelected ? 'Viewing' : 'View Turns'}
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="queue-card-item" style="border-color: #fecaca; background: #fef2f2;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 13px; color: #991b1b;">${job.filename}</strong>
          <span class="status-pill badge-failed" style="font-size: 11px;">Failed</span>
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function viewCompletedDiarJob(jobId) {
  currentViewedDiarJobId = jobId;
  renderDiarQueueUI();
  const job = diarSessionQueue.find(j => j.id === jobId);
  if (job && job.data && job.data.status === "COMPLETED") {
    renderRealDiarizationData(job.data);
  } else if (job && job.status === "PROCESSING") {
    renderProcessingSplash(job);
  } else {
    // Fetch directly from server
    fetch(`/api/v1/calls/${jobId}`)
      .then(res => res.json())
      .then(data => {
        if (job) job.data = data;
        renderRealDiarizationData(data);
      })
      .catch(err => console.error("Error viewing job:", err));
  }
}

function renderProcessingSplash(job) {
  const bottomSec = document.getElementById("diarDetailsBottomSection");
  if (bottomSec) bottomSec.style.display = "block";

  const container = document.getElementById("diarResultContainer");
  if (!container) return;

  const isProc = job.status === "PROCESSING";
  const statusTitle = isProc ? "Diarizing & Transcribing Audio" : "Queued in RabbitMQ";
  const statusSub = isProc
    ? "Running Faster-Whisper STT + PyAnnote 3.1 Separation + Milvus ECAPA Biometric Identification"
    : "Waiting for background worker in RabbitMQ queue...";

  container.innerHTML = `
    <div style="text-align: center; padding: 50px 20px;">
      <div style="width: 48px; height: 48px; border: 4px solid #1d61e7; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
      <h4 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">${statusTitle} (${Math.round(job.elapsed || 0)}s)...</h4>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 20px;">File: <strong>${job.filename}</strong></p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; max-width: 420px; margin: 0 auto; text-align: left; font-size: 12.5px; color: #475569; line-height: 1.6;">
        <div style="color: #1d61e7; font-weight: 600; margin-bottom: 4px;">⚡ Pipeline Progress:</div>
        <div>1. MinIO Audio Ingestion ✓</div>
        <div>2. Whisper Word-level Transcription ${isProc && (job.elapsed || 0) < 15 ? '⚙️' : '✓'}</div>
        <div>3. PyAnnote 3.1 Multi-Speaker Separation ${isProc && (job.elapsed || 0) >= 15 ? '⚙️' : '⏳'}</div>
        <div>4. Milvus 192D ECAPA Biometric Matching ${isProc && (job.elapsed || 0) >= 35 ? '⚙️' : '⏳'}</div>
      </div>
    </div>`;
}

function startDiarQueuePolling() {
  if (diarQueuePollInterval) return;

  diarQueuePollInterval = setInterval(async () => {
    const activeJobs = diarSessionQueue.filter(j => j.status === "PENDING" || j.status === "PROCESSING");

    if (activeJobs.length === 0) {
      clearInterval(diarQueuePollInterval);
      diarQueuePollInterval = null;
      return;
    }

    for (const job of activeJobs) {
      job.elapsed = (job.elapsed || 0) + 2.5;

      try {
        const res = await fetch(`/api/v1/calls/${job.id}`);
        if (!res.ok) continue;

        const data = await res.json();
        const prevStatus = job.status;
        job.status = data.status;
        job.data = data;

        // If job just transitioned to PROCESSING or COMPLETED
        if (prevStatus !== data.status) {
          if (data.status === "PROCESSING") {
            showToast(`Started processing ${job.filename}...`, "info");
            if (!currentViewedDiarJobId || currentViewedDiarJobId === job.id) {
              renderProcessingSplash(job);
            }
          } else if (data.status === "COMPLETED" && data.transcript_json?.turns?.length > 0) {
            showToast(`Speaker Diarization complete for ${job.filename}!`, "success");
            currentViewedDiarJobId = job.id;
            renderRealDiarizationData(data);
            await loadCallAudits();
            renderDiarHistoryTable();
          }
        } else if (job.status === "PROCESSING" && (!currentViewedDiarJobId || currentViewedDiarJobId === job.id)) {
          renderProcessingSplash(job);
        }
      } catch (err) {
        console.error("Queue poll error for job", job.id, err);
      }
    }

    renderDiarQueueUI();
  }, 2500);
}

async function runSpeakerDiarization(e) {
  if (e) e.preventDefault();

  const expEmpId = document.getElementById("diarExpectedEmpSelect")?.value;
  const fileInput = document.getElementById("diarAudioFile");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast("Please choose an audio file to upload", "info");
    return;
  }

  const fileToSend = fileInput.files[0];
  const filename = fileToSend.name;

  showToast(`Uploading ${filename} to RabbitMQ queue...`, "info");

  try {
    const formData = new FormData();
    formData.append("file", fileToSend);
    if (expEmpId) formData.append("expected_employee_id", expEmpId);

    const res = await fetch("/api/v1/calls/process", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Failed to process call audio");
    }

    const result = await res.json();
    showToast(`Job queued (${filename})! Processing asynchronously...`, "success");

    // Add to session queue
    const newJob = {
      id: result.id,
      filename: filename,
      status: result.status || "PENDING",
      submittedAt: Date.now(),
      elapsed: 0,
      data: null
    };

    diarSessionQueue.unshift(newJob);
    currentViewedDiarJobId = result.id;

    // Reset file input & preview card so user can upload more files immediately
    clearDiarSelectedFile();

    renderDiarQueueUI();
    renderProcessingSplash(newJob);
    startDiarQueuePolling();

  } catch (err) {
    showToast("Error uploading call audio: " + err.message, "error");
  }
}

async function pollAndRenderDiarizationResult(callJobId, originalFilename) {
  viewCompletedDiarJob(callJobId);
}

function renderRealDiarizationData(call) {
  const bottomSec = document.getElementById("diarDetailsBottomSection");
  if (bottomSec) bottomSec.style.display = call ? "block" : "none";

  const container = document.getElementById("diarResultContainer");
  if (!container) return;

  if (!call) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
        <i data-lucide="audio-lines" style="width: 44px; height: 44px; margin-bottom: 10px; color: #cbd5e1;"></i>
        <p style="font-size: 13.5px;">No diarization details available.</p>
      </div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    return;
  }

  const identEmp = employeesCache.find(e => strId(e.id) === strId(call.identified_employee_id));
  const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ""}` : "Unidentified Agent";
  const empCode = identEmp ? identEmp.employee_code : (call.identified_employee_id ? "AGNT-EMP" : "N/A");
  const deptName = (identEmp ? departmentsCache.find(d => strId(d.id) === strId(identEmp.department_id))?.name : null) || "General";

  const confPercent = call.identification_confidence !== null && call.identification_confidence !== undefined
    ? Math.round(call.identification_confidence * 100)
    : 0;

  const confBadge = call.identified_employee_id
    ? `<span class="status-pill badge-completed" style="font-size: 12px; padding: 4px 10px; display: inline-block; margin-bottom: 4px;"><i data-lucide="shield-check" style="width: 13px; vertical-align: middle;"></i> ${confPercent}% Match</span>`
    : `<span class="status-pill badge-pending" style="font-size: 12px; padding: 4px 10px; display: inline-block; margin-bottom: 4px;"><i data-lucide="help-circle" style="width: 13px; vertical-align: middle;"></i> Open Speaker</span>`;

  const transcriptJson = call.transcript_json || {};
  let turns = transcriptJson.turns || transcriptJson.segments || [];

  if (typeof turns === "string") {
    try { turns = JSON.parse(turns); } catch (e) { turns = []; }
  }

  const filename = call.audio_filename || "call_recording.wav";

  if (!turns || turns.length === 0) {
    container.innerHTML = `
      <div style="background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #bfdbfe; border-radius: 16px; padding: 18px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 14px rgba(29, 97, 231, 0.08);">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="width: 48px; height: 48px; border-radius: 14px; background: #1d61e7; color: #fff; font-size: 20px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(29, 97, 231, 0.25);">
            ${agentName.charAt(0)}
          </div>
          <div>
            <span style="font-size: 10.5px; font-weight: 700; color: #1d61e7; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">MILVUS BIOMETRIC IDENTIFIED AGENT</span>
            <h3 style="font-size: 17px; font-weight: 800; color: #0f172a; margin: 0;">${agentName} <small style="font-size: 12px; color: #64748b;">(${empCode})</small></h3>
            <span style="font-size: 12px; color: #475569; font-weight: 600;">Department: ${deptName}</span>
          </div>
        </div>
        <div style="text-align: right;">
          ${confBadge}
        </div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 24px; text-align: center; color: #64748b;">
        <i data-lucide="file-audio" style="width: 32px; height: 32px; color: #94a3b8; margin-bottom: 8px;"></i>
        <p style="font-size: 13px; margin: 0;">Status: <strong>${call.status}</strong>. Transcript turns are being extracted in the background.</p>
      </div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    return;
  }

  const fmtTime = (sec) => {
    if (sec === null || sec === undefined) return "00:00";
    if (typeof sec === "string" && sec.includes(":")) return sec;
    const s = Math.floor(Number(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  const durationSec = call.audio_duration_seconds || (turns.length > 0 ? (turns[turns.length - 1].end || 0) : 0);
  const totalWords = turns.reduce((acc, t) => acc + (t.text || "").trim().split(/\s+/).filter(Boolean).length, 0);

  // Compute talk-time split
  let agentDuration = 0;
  let customerDuration = 0;
  turns.forEach(t => {
    const spk = t.speaker || t.speaker_label || "SPEAKER_00";
    const isAgent = spk === "SPEAKER_AGENT" || spk === "SPEAKER_00" || spk === "AGENT";
    const dur = Math.max(0, (t.end || 0) - (t.start || 0));
    if (isAgent) agentDuration += dur;
    else customerDuration += dur;
  });
  const totalActiveTalk = (agentDuration + customerDuration) || 1;
  const agentPct = Math.round((agentDuration / totalActiveTalk) * 100);
  const customerPct = 100 - agentPct;

  // Completed jobs switcher tabs if there are multiple completed jobs in session
  const completedSessionJobs = diarSessionQueue.filter(j => j.status === "COMPLETED");
  const jobTabsHtml = completedSessionJobs.length > 1
    ? `<div style="display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px;">
        ${completedSessionJobs.map(j => `
          <button class="time-range-btn ${currentViewedDiarJobId === j.id ? 'active' : ''}" style="font-size: 11.5px; padding: 5px 12px; border-radius: 8px;" onclick="viewCompletedDiarJob('${j.id}')">
            <i data-lucide="file-audio" style="width: 12px;"></i> ${j.filename}
          </button>
        `).join("")}
      </div>`
    : "";

  container.innerHTML = `
    ${jobTabsHtml}

    <!-- 1. IDENTIFIED AGENT BANNER -->
    <div style="background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #bfdbfe; border-radius: 16px; padding: 18px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 14px rgba(29, 97, 231, 0.08); flex-wrap: wrap; gap: 14px;">
      <div style="display: flex; align-items: center; gap: 14px;">
        <div style="width: 48px; height: 48px; border-radius: 14px; background: #1d61e7; color: #fff; font-size: 20px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(29, 97, 231, 0.25);">
          ${agentName.charAt(0)}
        </div>
        <div>
          <span style="font-size: 10.5px; font-weight: 700; color: #1d61e7; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">MILVUS BIOMETRIC IDENTIFIED AGENT</span>
          <h3 style="font-size: 17px; font-weight: 800; color: #0f172a; margin: 0;">${agentName} <small style="font-size: 12px; color: #64748b;">(${empCode})</small></h3>
          <span style="font-size: 12px; color: #475569; font-weight: 600;">Department: ${deptName}</span>
        </div>
      </div>
      <div style="text-align: right;">
        ${confBadge}
        <small style="display: block; font-size: 11px; color: #64748b; font-family: monospace; margin-top: 2px;">Audio: ${filename}</small>
      </div>
    </div>

    <!-- 2. CALL METRICS & TALK-TIME RATIO STRIP -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 18px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px;">
        <small style="color: #64748b; font-size: 11.5px; font-weight: 600; display: block; margin-bottom: 2px;">Call Duration</small>
        <strong style="font-size: 15px; color: #0f172a;">${fmtTime(durationSec)}</strong>
        <span style="font-size: 11px; color: #94a3b8; margin-left: 4px;">(${turns.length} turns, ${totalWords} words)</span>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px;">
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 600; margin-bottom: 6px;">
          <span style="color: #1e40af;">Agent: ${agentPct}%</span>
          <span style="color: #6b21a8;">Customer: ${customerPct}%</span>
        </div>
        <div style="height: 6px; border-radius: 3px; background: #e2e8f0; overflow: hidden; display: flex;">
          <div style="width: ${agentPct}%; background: #2563eb;"></div>
          <div style="width: ${customerPct}%; background: #9333ea;"></div>
        </div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <small style="color: #64748b; font-size: 11.5px; font-weight: 600; display: block;">Speech Engine</small>
          <strong style="font-size: 12.5px; color: #0f172a;">Whisper + PyAnnote 3.1</strong>
        </div>
        <span class="status-pill badge-completed" style="font-size: 10.5px; padding: 3px 8px;">100% Processed</span>
      </div>
    </div>

    <!-- 3. TRANSCRIPT CONTROLS (SEARCH & SPEAKER FILTER) -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; gap: 6px;">
        <button class="time-range-btn active" id="btnFilterAllTurns" style="font-size: 11.5px; padding: 4px 10px; border-radius: 8px;" onclick="filterDiarTurns('ALL')">
          All Turns (${turns.length})
        </button>
        <button class="time-range-btn" id="btnFilterAgentTurns" style="font-size: 11.5px; padding: 4px 10px; border-radius: 8px;" onclick="filterDiarTurns('AGENT')">
          Agent Only
        </button>
        <button class="time-range-btn" id="btnFilterCustTurns" style="font-size: 11.5px; padding: 4px 10px; border-radius: 8px;" onclick="filterDiarTurns('CUSTOMER')">
          Customer Only
        </button>
      </div>

      <div style="position: relative; min-width: 240px; flex: 1; max-width: 320px;">
        <i data-lucide="search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 13px; color: #94a3b8;"></i>
        <input type="text" id="diarSearchTurnInput" placeholder="Search in transcript dialogue..." style="width: 100%; padding: 6px 10px 6px 30px; font-size: 12px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; background: #ffffff;" oninput="filterDiarTurns()">
      </div>
    </div>

    <!-- 4. DIARIZED TRANSCRIPT TURNS LIST -->
    <div id="diarTurnsListContainer" style="display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; padding-right: 4px;">
      ${turns.map((t, idx) => {
    const spk = t.speaker || t.speaker_label || "SPEAKER_00";
    const isAgent = spk === "SPEAKER_AGENT" || spk === "SPEAKER_00" || spk === "AGENT";
    const label = isAgent ? `Agent (${agentName})` : "Customer / Speaker 2";
    const textContent = t.text || t.transcript || t.content || "";
    const startTime = fmtTime(t.start);
    const endTime = fmtTime(t.end);

    return `
          <div class="diar-turn-item ${isAgent ? 'turn-agent' : 'turn-customer'}" data-speaker="${isAgent ? 'AGENT' : 'CUSTOMER'}" data-text="${textContent.toLowerCase()}" style="background: ${isAgent ? '#f8fafc' : '#ffffff'}; border: 1px solid ${isAgent ? '#dbeafe' : '#e2e8f0'}; border-radius: 14px; padding: 14px; transition: all 0.2s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="background: ${isAgent ? '#dbeafe' : '#f3e8ff'}; color: ${isAgent ? '#1e40af' : '#7e22ce'}; font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px;">
                <i data-lucide="${isAgent ? 'headphone-off' : 'user'}" style="width: 12px;"></i> ${label}
              </span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <small style="font-family: monospace; color: #64748b; font-size: 11.5px; font-weight: 600;">${startTime} - ${endTime}</small>
                <button type="button" style="background: none; border: none; cursor: pointer; color: #94a3b8; padding: 2px;" title="Copy turn text" onclick="copyTurnText('${escape(textContent)}')">
                  <i data-lucide="copy" style="width: 11px;"></i>
                </button>
              </div>
            </div>
            <p class="turn-text-body" style="font-size: 13.5px; color: #334155; margin: 0; line-height: 1.45; font-weight: 500;">${textContent}</p>
          </div>
        `;
  }).join("")}
    </div>
  `;

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

let currentDiarSpeakerFilter = 'ALL';

function filterDiarTurns(filterType) {
  if (filterType) {
    currentDiarSpeakerFilter = filterType;
    document.getElementById("btnFilterAllTurns")?.classList.toggle("active", filterType === "ALL");
    document.getElementById("btnFilterAgentTurns")?.classList.toggle("active", filterType === "AGENT");
    document.getElementById("btnFilterCustTurns")?.classList.toggle("active", filterType === "CUSTOMER");
  }

  const query = (document.getElementById("diarSearchTurnInput")?.value || "").toLowerCase().trim();
  const turnItems = document.querySelectorAll(".diar-turn-item");

  turnItems.forEach(item => {
    const spk = item.getAttribute("data-speaker");
    const txt = item.getAttribute("data-text") || "";

    const matchSpk = currentDiarSpeakerFilter === "ALL" || spk === currentDiarSpeakerFilter;
    const matchQuery = !query || txt.includes(query);

    item.style.display = (matchSpk && matchQuery) ? "block" : "none";
  });
}

function copyTurnText(escapedTxt) {
  const txt = unescape(escapedTxt);
  navigator.clipboard.writeText(txt).then(() => {
    showToast("Turn text copied to clipboard!", "success");
  }).catch(() => { });
}

function closeDiarDetailsPanel() {
  const bottomSec = document.getElementById("diarDetailsBottomSection");
  if (bottomSec) bottomSec.style.display = "none";
  currentViewedDiarJobId = null;
  renderDiarQueueUI();
  showToast("Processed Diarization panel closed", "info");
}

function copyCurrentDiarTranscript() {
  const activeJob = diarSessionQueue.find(j => j.id === currentViewedDiarJobId) ||
    auditsCache.find(c => c.id === currentViewedDiarJobId);
  const data = activeJob ? (activeJob.data || activeJob) : null;
  if (!data || !data.transcript_json) {
    showToast("No active transcript available to copy", "info");
    return;
  }

  const turns = data.transcript_json.turns || data.transcript_json.segments || [];
  if (turns.length === 0) {
    showToast("Transcript is empty", "info");
    return;
  }

  const identEmp = employeesCache.find(e => strId(e.id) === strId(data.identified_employee_id));
  const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ""}` : "Agent";

  const lines = turns.map(t => {
    const isAgent = (t.speaker === "SPEAKER_AGENT" || t.speaker === "SPEAKER_00" || t.speaker === "AGENT");
    const speakerLabel = isAgent ? `Agent (${agentName})` : "Customer";
    const start = typeof t.start === "number" ? `${Math.floor(t.start / 60).toString().padStart(2, '0')}:${Math.floor(t.start % 60).toString().padStart(2, '0')}` : "00:00";
    return `[${start}] ${speakerLabel}: ${t.text || t.content || ""}`;
  });

  const fullText = `=== VOXAUDIT DIARIZED CALL TRANSCRIPT ===\nCall File: ${data.audio_filename || "recording.wav"}\nIdentified Agent: ${agentName}\n\n` + lines.join("\n\n");

  navigator.clipboard.writeText(fullText).then(() => {
    showToast("Full transcript copied to clipboard!", "success");
  }).catch(err => {
    showToast("Failed to copy transcript: " + err.message, "error");
  });
}

function downloadCurrentDiarJson() {
  const activeJob = diarSessionQueue.find(j => j.id === currentViewedDiarJobId) ||
    auditsCache.find(c => c.id === currentViewedDiarJobId);
  const data = activeJob ? (activeJob.data || activeJob) : null;
  if (!data) {
    showToast("No call data available for export", "info");
    return;
  }

  const jsonStr = JSON.stringify(data.transcript_json || data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diarization_${data.audio_filename || 'call'}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Diarization JSON downloaded!", "success");
}

function triggerQaAuditFromDiar() {
  const callId = currentViewedDiarJobId;
  if (!callId) {
    showToast("No call selected for QA Audit", "info");
    return;
  }

  // Switch to QA Analysis page and auto-select this call
  switchPage("qa-analysis");
  setTimeout(() => {
    viewQaScorecardDetails(callId);
  }, 100);
}

/* ==========================================================================
   DIARIZED CALLS & TRANSCRIPTS HISTORY TABLE (PAGINATED - 5 PER PAGE)
   ========================================================================== */

let diarHistoryCurrentPage = 1;
const DIAR_HISTORY_PAGE_SIZE = 5;
let diarHistorySearchQuery = "";

function setDiarHistoryPage(pageNum) {
  diarHistoryCurrentPage = pageNum;
  renderDiarHistoryTable(diarHistorySearchQuery);
}

function changeDiarHistoryPage(direction) {
  if (direction === "prev") {
    if (diarHistoryCurrentPage > 1) {
      diarHistoryCurrentPage--;
      renderDiarHistoryTable(diarHistorySearchQuery);
    }
  } else if (direction === "next") {
    diarHistoryCurrentPage++;
    renderDiarHistoryTable(diarHistorySearchQuery);
  }
}

function filterDiarHistoryTable(val) {
  diarHistorySearchQuery = val || "";
  diarHistoryCurrentPage = 1; // Reset to first page on search
  renderDiarHistoryTable(diarHistorySearchQuery);
}

function renderDiarHistoryTable(filterQuery = null) {
  const tbody = document.getElementById("diarHistoryTableBody");
  if (!tbody) return;

  if (filterQuery !== null && filterQuery !== undefined) {
    diarHistorySearchQuery = filterQuery;
  }
  const query = (diarHistorySearchQuery || "").toLowerCase().trim();
  let calls = [...auditsCache];

  // Sort calls newest/latest first
  calls.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });

  if (query) {
    calls = calls.filter(c => {
      const fn = (c.audio_filename || c.original_file_name || "").toLowerCase();
      const ref = (c.call_reference || c.id || "").toLowerCase();
      const emp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
      const empName = emp ? `${emp.first_name} ${emp.last_name || ""}`.toLowerCase() : "";
      const empCode = emp ? (emp.employee_code || "").toLowerCase() : "";
      return fn.includes(query) || ref.includes(query) || empName.includes(query) || empCode.includes(query);
    });
  }

  const totalRecords = calls.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / DIAR_HISTORY_PAGE_SIZE));

  if (diarHistoryCurrentPage > totalPages) {
    diarHistoryCurrentPage = totalPages;
  }
  if (diarHistoryCurrentPage < 1) {
    diarHistoryCurrentPage = 1;
  }

  const paginationInfo = document.getElementById("diarHistoryPaginationInfo");
  const prevBtn = document.getElementById("diarHistPrevBtn");
  const nextBtn = document.getElementById("diarHistNextBtn");
  const pageNumbersContainer = document.getElementById("diarHistoryPageNumbers");

  if (totalRecords === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 36px 20px; color: #94a3b8;">
          <i data-lucide="inbox" style="width: 38px; height: 38px; margin-bottom: 8px; color: #cbd5e1; display: block; margin: 0 auto 8px;"></i>
          <p style="font-size: 13px; font-weight: 500; margin: 0;">${query ? 'No matching diarized calls found.' : 'No call transcripts available yet. Upload an audio recording above to generate diarized transcripts.'}</p>
        </td>
      </tr>
    `;
    if (paginationInfo) paginationInfo.innerHTML = "Showing <strong>0</strong> calls";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    return;
  }

  const startIndex = (diarHistoryCurrentPage - 1) * DIAR_HISTORY_PAGE_SIZE;
  const endIndex = Math.min(startIndex + DIAR_HISTORY_PAGE_SIZE, totalRecords);
  const pagedCalls = calls.slice(startIndex, endIndex);

  // Update Pagination Info
  if (paginationInfo) {
    paginationInfo.innerHTML = `Showing <strong>${startIndex + 1}</strong> - <strong>${endIndex}</strong> of <strong>${totalRecords}</strong> calls`;
  }

  // Update Previous / Next Button States
  if (prevBtn) {
    const isPrevDisabled = diarHistoryCurrentPage <= 1;
    prevBtn.disabled = isPrevDisabled;
    prevBtn.style.opacity = isPrevDisabled ? "0.45" : "1";
    prevBtn.style.cursor = isPrevDisabled ? "not-allowed" : "pointer";
    prevBtn.style.background = isPrevDisabled ? "#f1f5f9" : "#ffffff";
    prevBtn.style.borderColor = isPrevDisabled ? "#e2e8f0" : "#cbd5e1";
    prevBtn.style.color = isPrevDisabled ? "#94a3b8" : "#1e293b";
  }

  if (nextBtn) {
    const isNextDisabled = diarHistoryCurrentPage >= totalPages;
    nextBtn.disabled = isNextDisabled;
    nextBtn.style.opacity = isNextDisabled ? "0.45" : "1";
    nextBtn.style.cursor = isNextDisabled ? "not-allowed" : "pointer";
    nextBtn.style.background = isNextDisabled ? "#f1f5f9" : "#ffffff";
    nextBtn.style.borderColor = isNextDisabled ? "#e2e8f0" : "#cbd5e1";
    nextBtn.style.color = isNextDisabled ? "#94a3b8" : "#1e293b";
  }

  // Update Page Number Buttons (1, 2, 3, 4...)
  if (pageNumbersContainer) {
    let pagesHtml = "";
    for (let p = 1; p <= totalPages; p++) {
      const isActive = p === diarHistoryCurrentPage;
      const baseStyle = "width: 40px; height: 40px; min-width: 40px; padding: 0; border-radius: 11px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; font-family: inherit; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);";
      const btnStyle = isActive
        ? `${baseStyle} border: 1px solid #1d61e7; background: linear-gradient(135deg, #1d61e7 0%, #174ebc 100%); color: #ffffff; font-weight: 700; box-shadow: 0 4px 14px rgba(29, 97, 231, 0.4); cursor: default; transform: scale(1.05);`
        : `${baseStyle} border: 1px solid #cbd5e1; background: #ffffff; color: #334155; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.04); cursor: pointer;`;

      pagesHtml += `
        <button type="button" class="diar-page-btn ${isActive ? 'active' : ''}" style="${btnStyle}" onclick="setDiarHistoryPage(${p})" title="Page ${p}">
          ${p}
        </button>
      `;
    }
    pageNumbersContainer.innerHTML = pagesHtml;
  }

  const fmtTime = (sec) => {
    if (sec === null || sec === undefined) return "00:00";
    if (typeof sec === "string" && sec.includes(":")) return sec;
    const s = Math.floor(Number(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  tbody.innerHTML = pagedCalls.map(c => {
    const identEmp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
    const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ""}` : "Unidentified Speaker";
    const empCode = identEmp ? identEmp.employee_code : (c.identified_employee_id ? "AGNT-EMP" : "--");
    const deptName = (identEmp ? departmentsCache.find(d => strId(d.id) === strId(identEmp.department_id))?.name : null) || "Customer Care";

    const confPct = c.identification_confidence !== null && c.identification_confidence !== undefined
      ? Math.round(c.identification_confidence * 100)
      : 0;

    const confBadge = c.identified_employee_id
      ? `<span class="status-pill badge-completed" style="font-size: 11px; padding: 2px 8px;"><i data-lucide="shield-check" style="width: 12px; vertical-align: middle;"></i> ${confPct}% Match</span>`
      : `<span class="status-pill badge-pending" style="font-size: 11px; padding: 2px 8px;"><i data-lucide="globe" style="width: 12px; vertical-align: middle;"></i> Open Speaker</span>`;

    let turnsCount = 0;
    if (c.transcript_json) {
      const turns = c.transcript_json.turns || c.transcript_json.segments || [];
      turnsCount = Array.isArray(turns) ? turns.length : 0;
    }

    const durStr = fmtTime(c.audio_duration_seconds);
    const filename = c.audio_filename || c.original_file_name || "call_audio.wav";
    const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recent";

    let statusClass = "badge-completed";
    if (c.status === "PROCESSING") statusClass = "badge-processing";
    else if (c.status === "FAILED") statusClass = "badge-failed";
    else if (c.status === "PENDING") statusClass = "badge-pending";

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 34px; height: 34px; border-radius: 9px; background: rgba(29, 97, 231, 0.1); color: #1d61e7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i data-lucide="file-audio" style="width: 16px; height: 16px;"></i>
            </div>
            <div>
              <strong style="font-size: 13px; color: #0f172a; display: block;">${filename}</strong>
              <small style="font-size: 11px; color: #64748b;">${c.call_reference || c.id.substring(0, 8)} • ${dateStr}</small>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 28px; height: 28px; border-radius: 8px; background: ${identEmp ? '#1d61e7' : '#94a3b8'}; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${agentName.charAt(0)}
            </div>
            <div>
              <strong style="font-size: 12.5px; color: #1e293b; display: block;">${agentName}</strong>
              <small style="font-size: 11px; color: #64748b;">${deptName} • ${empCode}</small>
            </div>
          </div>
        </td>
        <td>${confBadge}</td>
        <td style="font-family: monospace; font-size: 12px; font-weight: 600; color: #475569;">${durStr}</td>
        <td>
          <span style="font-size: 11.5px; font-weight: 600; color: #1e293b; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
            ${turnsCount} turns
          </span>
        </td>
        <td>
          <span class="status-pill ${statusClass}">${c.status}</span>
        </td>
        <td style="text-align: right;">
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
            <button class="btn-primary" style="font-size: 11.5px; padding: 4px 10px; height: auto;" onclick="inspectDiarHistoryCall('${c.id}')" title="Inspect full turn-by-turn transcript">
              <i data-lucide="eye" style="width: 12px;"></i> View Transcript
            </button>
            <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px; height: auto;" onclick="copyDiarHistoryTranscript('${c.id}')" title="Copy transcript dialogue">
              <i data-lucide="copy" style="width: 12px;"></i>
            </button>
            <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px; height: auto;" onclick="downloadDiarHistoryJson('${c.id}')" title="Download JSON">
              <i data-lucide="download" style="width: 12px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

async function inspectDiarHistoryCall(callId) {
  let call = auditsCache.find(c => strId(c.id) === strId(callId));
  if (!call || !call.transcript_json) {
    try {
      const res = await fetch(`/api/v1/calls/${callId}`);
      if (res.ok) {
        call = await res.json();
        const idx = auditsCache.findIndex(c => strId(c.id) === strId(callId));
        if (idx >= 0) auditsCache[idx] = call;
        else auditsCache.unshift(call);
      }
    } catch (e) { }
  }

  if (!call) {
    showToast("Unable to load call details", "error");
    return;
  }

  currentViewedDiarJobId = call.id;
  renderRealDiarizationData(call);

  const detailsSec = document.getElementById("diarDetailsBottomSection");
  if (detailsSec) {
    detailsSec.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  showToast(`Loaded transcript for ${call.audio_filename || 'call'}`, "success");
}

async function copyDiarHistoryTranscript(callId) {
  let call = auditsCache.find(c => strId(c.id) === strId(callId));
  if (!call || !call.transcript_json) {
    try {
      const res = await fetch(`/api/v1/calls/${callId}`);
      if (res.ok) call = await res.json();
    } catch (e) { }
  }

  if (!call || !call.transcript_json) {
    showToast("No transcript available for this call", "info");
    return;
  }

  const turns = call.transcript_json.turns || call.transcript_json.segments || [];
  if (turns.length === 0) {
    showToast("Transcript is empty", "info");
    return;
  }

  const identEmp = employeesCache.find(e => strId(e.id) === strId(call.identified_employee_id));
  const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ""}` : "Agent";

  const lines = turns.map(t => {
    const isAgent = (t.speaker === "SPEAKER_AGENT" || t.speaker === "SPEAKER_00" || t.speaker === "AGENT");
    const speakerLabel = isAgent ? `Agent (${agentName})` : "Customer";
    const start = typeof t.start === "number" ? `${Math.floor(t.start / 60).toString().padStart(2, '0')}:${Math.floor(t.start % 60).toString().padStart(2, '0')}` : "00:00";
    return `[${start}] ${speakerLabel}: ${t.text || t.content || ""}`;
  });

  const fullText = `=== VOXAUDIT DIARIZED CALL TRANSCRIPT ===\nCall File: ${call.audio_filename || "recording.wav"}\nIdentified Agent: ${agentName}\n\n` + lines.join("\n\n");

  navigator.clipboard.writeText(fullText).then(() => {
    showToast("Transcript copied to clipboard!", "success");
  }).catch(err => {
    showToast("Failed to copy transcript: " + err.message, "error");
  });
}

async function downloadDiarHistoryJson(callId) {
  let call = auditsCache.find(c => strId(c.id) === strId(callId));
  if (!call || !call.transcript_json) {
    try {
      const res = await fetch(`/api/v1/calls/${callId}`);
      if (res.ok) call = await res.json();
    } catch (e) { }
  }

  if (!call) {
    showToast("No call data found", "error");
    return;
  }

  const jsonStr = JSON.stringify(call.transcript_json || call, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diarization_${call.audio_filename || 'call'}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Diarization JSON downloaded!", "success");
}

/* ==========================================================================
   3. QA QUALITY TEST & SCORECARDS LOGIC (DIARIZATION-STYLE STUDIO)
   ========================================================================== */

let qaPollTimer = null;
let currentViewedQaCallId = null;
let qaSessionQueue = [];

let qaHistoryCurrentPage = 1;
const QA_HISTORY_PAGE_SIZE = 5;
let qaHistorySearchQuery = "";

function populateQaCallDropdown(filterText = "") {
  const listEl = document.getElementById("qaCallOptionsList");
  if (!listEl) return;

  const currentVal = document.getElementById("qaCallSelect")?.value || "";
  const query = (filterText || "").toLowerCase().trim();

  let completedCalls = auditsCache.filter(c => c.status === "COMPLETED" || (c.transcript_json && (c.transcript_json.turns || c.transcript_json.segments)));

  if (query) {
    completedCalls = completedCalls.filter(c => {
      const fn = (c.audio_filename || c.original_file_name || "").toLowerCase();
      const ref = (c.call_reference || c.id || "").toLowerCase();
      const emp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
      const empName = emp ? `${emp.first_name} ${emp.last_name || ""}`.toLowerCase() : "";
      return fn.includes(query) || ref.includes(query) || empName.includes(query);
    });
  }

  if (completedCalls.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 18px 12px; text-align: center; color: #94a3b8; font-size: 12.5px;">
        <i data-lucide="inbox" style="width: 28px; height: 28px; margin-bottom: 6px; color: #cbd5e1; display: block; margin: 0 auto 6px;"></i>
        ${query ? 'No matching call recordings found.' : 'No completed calls available. Please run speaker diarization first.'}
      </div>
    `;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    return;
  }

  listEl.innerHTML = completedCalls.map(c => {
    const isSel = strId(c.id) === strId(currentVal);
    const callRef = c.call_reference || (c.id ? c.id.substring(0, 8) : 'CALL-REC');
    const fileName = c.audio_filename || c.original_file_name || "call_audio.wav";
    const identEmp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
    const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ''}`.trim() : "Unassigned";

    const hasQa = (c.qa_score !== null && c.qa_score !== undefined) || c.qa_scorecard_json;
    const scoreVal = hasQa ? Math.round(c.qa_score || 50) : null;
    const isPassed = scoreVal !== null ? scoreVal >= 80 : false;

    const badgeHtml = hasQa
      ? `<span class="status-pill ${isPassed ? 'badge-completed' : 'badge-inactive'}" style="font-size: 11px; padding: 2px 7px;">${scoreVal}% QA</span>`
      : `<span class="status-pill badge-processing" style="font-size: 11px; padding: 2px 7px;">Pending QA</span>`;

    return `
      <div class="agent-option-row ${isSel ? 'selected' : ''}" onclick="selectQaCallOption('${c.id}')"
        style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 10px; cursor: pointer; transition: all 0.15s ease; background: ${isSel ? '#eff6ff' : 'transparent'};">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="agent-avatar-circle" style="width: 32px; height: 32px; font-size: 11px; border-radius: 8px; background: ${hasQa ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)'};">
            <i data-lucide="${hasQa ? 'award' : 'phone'}" style="width: 15px; height: 15px;"></i>
          </div>
          <div>
            <strong style="font-size: 13px; color: #0f172a; display: block;">${callRef} • ${fileName}</strong>
            <small style="font-size: 11px; color: #64748b;">Agent: ${agentName}</small>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${badgeHtml}
          ${isSel ? '<i data-lucide="check" style="width: 14px; color: #2563eb;"></i>' : ''}
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function toggleQaCallDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("qaCallMenu");
  const trigger = document.getElementById("qaCallTrigger");
  const chevron = document.getElementById("qaTriggerChevron");
  if (!menu) return;

  const isOpen = menu.classList.contains("show");
  if (isOpen) {
    menu.classList.remove("show");
    trigger?.classList.remove("active");
    if (chevron) chevron.style.transform = "rotate(0deg)";
  } else {
    menu.classList.add("show");
    trigger?.classList.add("active");
    if (chevron) chevron.style.transform = "rotate(180deg)";
    populateQaCallDropdown();
    setTimeout(() => {
      document.getElementById("qaCallSearchInput")?.focus();
    }, 50);
  }
}

function filterQaCallDropdown(query) {
  populateQaCallDropdown(query);
}

function selectQaCallOption(callId) {
  const hiddenInput = document.getElementById("qaCallSelect");
  if (hiddenInput) hiddenInput.value = callId || "";

  const titleEl = document.getElementById("qaTriggerTitle");
  const subEl = document.getElementById("qaTriggerSubtitle");
  const avatarEl = document.getElementById("qaTriggerAvatar");
  const badgeEl = document.getElementById("qaSelectedCallStatusBadge");

  if (!callId) {
    if (titleEl) titleEl.textContent = "Choose a processed call recording...";
    if (subEl) subEl.textContent = "Browse available calls with transcripts & speaker turns";
    if (avatarEl) {
      avatarEl.style.background = "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)";
      avatarEl.innerHTML = '<i data-lucide="phone" style="width: 16px;"></i>';
    }
    if (badgeEl) badgeEl.style.display = "none";
  } else {
    const call = auditsCache.find(c => strId(c.id) === strId(callId));
    if (call) {
      const callRef = call.call_reference || (call.id ? call.id.substring(0, 8) : 'CALL-REC');
      const fileName = call.audio_filename || call.original_file_name || "call_audio.wav";
      const identEmp = employeesCache.find(e => strId(e.id) === strId(call.identified_employee_id));
      const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ''}`.trim() : "Unassigned";

      const hasQa = (call.qa_score !== null && call.qa_score !== undefined) || call.qa_scorecard_json;
      const scoreVal = hasQa ? Math.round(call.qa_score || 50) : null;

      if (titleEl) titleEl.textContent = `${callRef} • ${fileName}`;
      if (subEl) subEl.textContent = `Identified Agent: ${agentName} • ${hasQa ? `QA Score: ${scoreVal}%` : 'Ready for QA Evaluation'}`;
      if (avatarEl) {
        avatarEl.style.background = hasQa ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
        avatarEl.innerHTML = `<i data-lucide="${hasQa ? 'award' : 'phone'}" style="width: 16px;"></i>`;
      }
      if (badgeEl) {
        badgeEl.style.display = "inline-flex";
        badgeEl.className = `status-pill ${hasQa ? 'badge-completed' : 'badge-processing'}`;
        badgeEl.textContent = hasQa ? `✓ Evaluated (${scoreVal}%)` : 'Ready to Run';
      }

      if (hasQa) {
        viewQaScorecardDetails(callId);
      }
    }
  }

  // Close menu
  const menu = document.getElementById("qaCallMenu");
  const trigger = document.getElementById("qaCallTrigger");
  const chevron = document.getElementById("qaTriggerChevron");
  menu?.classList.remove("show");
  trigger?.classList.remove("active");
  if (chevron) chevron.style.transform = "rotate(0deg)";

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

async function loadQaAnalysisPage() {
  try {
    const res = await fetch("/api/v1/calls/");
    if (res.ok) auditsCache = await res.json();
  } catch (e) { }

  populateQaCallDropdown();

  const evalsEl = document.getElementById("qa-stat-evals");
  const scoreEl = document.getElementById("qa-stat-score");
  const compEl = document.getElementById("qa-stat-compliance");
  const topEl = document.getElementById("qa-stat-top-agent");

  const evaluatedCalls = auditsCache.filter(c => c.qa_score !== null && c.qa_score !== undefined);
  if (evalsEl) evalsEl.textContent = evaluatedCalls.length;

  const scores = evaluatedCalls.map(c => c.qa_score);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  if (scoreEl) scoreEl.textContent = scores.length > 0 ? `${avgScore}%` : "--";

  const passedCalls = evaluatedCalls.filter(c => c.qa_score >= 80);
  const passRate = evaluatedCalls.length > 0 ? Math.round((passedCalls.length / evaluatedCalls.length) * 100) : 100;
  if (compEl) compEl.textContent = evaluatedCalls.length > 0 ? `${passRate}%` : "100%";

  if (topEl) {
    if (evaluatedCalls.length > 0) {
      const topCall = [...evaluatedCalls].sort((a, b) => (b.qa_score || 0) - (a.qa_score || 0))[0];
      const topEmp = employeesCache.find(e => strId(e.id) === strId(topCall.identified_employee_id));
      topEl.textContent = topEmp ? `${topEmp.first_name} ${topEmp.last_name || ''}`.trim() : (topCall.call_reference || "Top Agent");
    } else {
      const topEmp = employeesCache[0];
      topEl.textContent = topEmp ? `${topEmp.first_name} ${topEmp.last_name || ''}`.trim() : "--";
    }
  }

  renderQaHistoryTable();
}

function handleQaSelectChange() {
  const callId = document.getElementById("qaCallSelect")?.value;
  if (!callId) return;

  const call = auditsCache.find(c => strId(c.id) === strId(callId));
  if (call && ((call.qa_score !== null && call.qa_score !== undefined) || call.qa_scorecard_json)) {
    viewQaScorecardDetails(callId);
  }
}

function formatTurnTime(sec) {
  if (sec === undefined || sec === null || isNaN(sec)) return "00:00";
  const total = Math.floor(Number(sec));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function copyTurnText(encodedText) {
  if (!encodedText) return;
  try {
    const text = decodeURIComponent(encodedText);
    navigator.clipboard.writeText(text).then(() => {
      showToast("Dialogue text copied to clipboard!", "success");
    }).catch(() => {
      showToast("Failed to copy dialogue text", "error");
    });
  } catch (e) {
    navigator.clipboard.writeText(encodedText);
    showToast("Dialogue text copied!", "success");
  }
}

async function viewQaScorecardDetails(callId) {
  if (!callId) return;
  currentViewedQaCallId = callId;
  const hiddenInput = document.getElementById("qaCallSelect");
  if (hiddenInput && callId) hiddenInput.value = callId;

  let call = auditsCache.find(c => strId(c.id) === strId(callId));

  // Always fetch detailed call record to ensure full transcript_json and qa_scorecard_json are loaded
  try {
    const res = await fetch(`/api/v1/calls/${callId}`);
    if (res.ok) {
      const detailedCall = await res.json();
      const idx = auditsCache.findIndex(c => strId(c.id) === strId(callId));
      if (idx !== -1) auditsCache[idx] = detailedCall;
      else auditsCache.push(detailedCall);
      call = detailedCall;
    }
  } catch (err) {
    console.warn("Could not fetch detailed call record", err);
  }

  if (!call) {
    showToast("Could not find selected call recording", "error");
    return;
  }

  // Sync trigger UI
  const titleEl = document.getElementById("qaTriggerTitle");
  const subEl = document.getElementById("qaTriggerSubtitle");
  const avatarEl = document.getElementById("qaTriggerAvatar");
  const badgeEl = document.getElementById("qaSelectedCallStatusBadge");

  const callRef = call.call_reference || (call.id ? call.id.substring(0, 8) : 'CALL-REC');
  const fileName = call.audio_filename || call.original_file_name || "call_audio.wav";
  const identEmp = employeesCache.find(e => strId(e.id) === strId(call.identified_employee_id));
  const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ''}`.trim() : "Unassigned";

  const hasQa = (call.qa_score !== null && call.qa_score !== undefined) || call.qa_scorecard_json;
  const scoreVal = hasQa ? Math.round(call.qa_score || 50) : null;

  if (titleEl) titleEl.textContent = `${callRef} • ${fileName}`;
  if (subEl) subEl.textContent = `Identified Agent: ${agentName} • ${hasQa ? `QA Score: ${scoreVal}%` : 'Ready for QA Evaluation'}`;
  if (avatarEl) {
    avatarEl.style.background = hasQa ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
    avatarEl.innerHTML = `<i data-lucide="${hasQa ? 'award' : 'phone'}" style="width: 16px;"></i>`;
  }
  if (badgeEl) {
    badgeEl.style.display = "inline-flex";
    badgeEl.className = `status-pill ${hasQa ? 'badge-completed' : 'badge-processing'}`;
    badgeEl.textContent = hasQa ? `✓ Evaluated (${scoreVal}%)` : 'Ready to Run';
  }

  const panel = document.getElementById("qaDetailsBottomSection");
  if (panel) {
    panel.style.display = "block";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  renderQaScorecardView(call);
}

function closeQaDetailsPanel() {
  const panel = document.getElementById("qaDetailsBottomSection");
  if (panel) panel.style.display = "none";
}

let currentQaState = {
  callId: null,
  categories: {},
  overallScore: 0,
  grade: 'A',
  passed: true,
  isModified: false,
  transcriptFilter: 'ALL'
};

function switchQaDetailTab(tabId) {
  ['scorecard', 'transcript', 'cx-insights'].forEach(t => {
    const btn = document.getElementById(`btnQaTab_${t}`);
    const content = document.getElementById(`qaTabContent_${t}`);
    if (btn) btn.classList.toggle('active', t === tabId);
    if (content) content.style.display = (t === tabId) ? 'block' : 'none';
  });
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function adjustQaCategoryScore(key, delta) {
  if (!currentQaState.categories[key]) return;
  const currentVal = currentQaState.categories[key].score;
  onQaCategoryScoreChange(key, currentVal + delta);
}

function onQaCategoryScoreChange(key, value) {
  if (!currentQaState.categories[key]) return;
  const max = currentQaState.categories[key].max;
  const numVal = Math.min(max, Math.max(0, parseFloat(value) || 0));
  currentQaState.categories[key].score = numVal;
  currentQaState.isModified = true;

  // Sync inputs
  const slider = document.getElementById(`qaSlider_${key}`);
  const numInput = document.getElementById(`qaInput_${key}`);
  const pctEl = document.getElementById(`qaPct_${key}`);

  if (slider && parseFloat(slider.value) !== numVal) slider.value = numVal;
  if (numInput && parseFloat(numInput.value) !== numVal) numInput.value = numVal;

  const pct = Math.round((numVal / max) * 100);
  const isPassed = pct >= 75;
  const fillColor = isPassed ? '#10b981' : (pct >= 50 ? '#f59e0b' : '#ef4444');

  if (pctEl) {
    pctEl.innerHTML = `<span style="color: ${isPassed ? '#15803d' : '#b91c1c'}; font-weight: 700;">${numVal}/${max} (${pct}%)</span>`;
  }
  if (slider) {
    slider.style.background = `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`;
  }

  // Recalculate overall score
  let totalScore = 0;
  let totalMax = 0;
  for (const k in currentQaState.categories) {
    totalScore += currentQaState.categories[k].score;
    totalMax += currentQaState.categories[k].max;
  }

  const overallScore = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';
  const passed = overallScore >= 80;

  currentQaState.overallScore = overallScore;
  currentQaState.grade = grade;
  currentQaState.passed = passed;

  // Update Overall Score Banner
  const scoreText = document.getElementById("qaOverallScoreText");
  const gradeBadge = document.getElementById("qaOverallGradeBadge");
  const statusPill = document.getElementById("qaOverallStatusPill");
  const bannerContainer = document.getElementById("qaOverallBannerContainer");
  const saveBtn = document.getElementById("btnSaveQaCalibration");

  if (scoreText) scoreText.textContent = `${overallScore}% Score`;
  if (gradeBadge) gradeBadge.textContent = `Grade ${grade}`;
  if (statusPill) {
    statusPill.className = `status-pill ${passed ? 'badge-completed' : 'badge-inactive'}`;
    statusPill.textContent = passed ? '✓ PASSED BENCHMARK' : '⚠ NEEDS IMPROVEMENT';
  }
  if (bannerContainer) {
    bannerContainer.style.background = passed ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)';
    bannerContainer.style.borderColor = passed ? '#86efac' : '#fca5a5';
  }

  if (saveBtn) {
    saveBtn.style.display = "inline-flex";
  }
}

async function saveCalibratedQaScorecard() {
  const callId = currentQaState.callId;
  if (!callId) {
    showToast("No call scorecard selected to save", "error");
    return;
  }

  const saveBtn = document.getElementById("btnSaveQaCalibration");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i data-lucide="loader-2" style="width: 13px; animation: spin 1s linear infinite;"></i> Saving Calibration...`;
  }

  try {
    const call = auditsCache.find(c => strId(c.id) === strId(callId));
    let scorecard = call?.qa_scorecard_json ? JSON.parse(JSON.stringify(call.qa_scorecard_json)) : {};
    if (!scorecard.agent_evaluation) scorecard.agent_evaluation = {};
    if (!scorecard.overall_evaluation) scorecard.overall_evaluation = {};

    scorecard.overall_qa_score = currentQaState.overallScore;
    scorecard.overall_evaluation.score = currentQaState.overallScore;
    scorecard.overall_evaluation.grade = currentQaState.grade;

    for (const k in currentQaState.categories) {
      const cat = currentQaState.categories[k];
      if (k === "compliance") {
        if (!scorecard.compliance) scorecard.compliance = {};
        scorecard.compliance.score = cat.score;
        scorecard.compliance.max_score = cat.max;
        scorecard.compliance.passed = (cat.score / cat.max) >= 0.75;
      } else {
        if (!scorecard.agent_evaluation[k]) scorecard.agent_evaluation[k] = {};
        scorecard.agent_evaluation[k].score = cat.score;
        scorecard.agent_evaluation[k].max_score = cat.max;
        scorecard.agent_evaluation[k].passed = (cat.score / cat.max) >= 0.75;
      }
    }

    const payload = {
      qa_score: currentQaState.overallScore,
      qa_scorecard_json: scorecard
    };

    const res = await fetch(`/api/v1/calls/${callId}/scorecard`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Failed to save scorecard: ${res.statusText}`);
    }

    const updatedJob = await res.json();
    showToast("✓ Calibrated QA Scorecard saved to database!", "success");

    // Update in local cache
    const idx = auditsCache.findIndex(c => strId(c.id) === strId(callId));
    if (idx !== -1) {
      auditsCache[idx] = updatedJob;
    }

    currentQaState.isModified = false;
    if (saveBtn) {
      saveBtn.style.display = "none";
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i data-lucide="save" style="width: 13px;"></i> Save Calibrated Scorecard`;
    }

    renderQaHistoryTable();
  } catch (err) {
    showToast(`Error saving scorecard: ${err.message}`, "error");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i data-lucide="save" style="width: 13px;"></i> Save Calibrated Scorecard`;
    }
  }

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function filterQaTranscriptTurns(filterType = null) {
  if (filterType !== null) {
    currentQaState.transcriptFilter = filterType;
    ['ALL', 'AGENT', 'CUSTOMER'].forEach(t => {
      const btn = document.getElementById(`btnQaTurnFilter_${t}`);
      if (btn) btn.classList.toggle('active', t === filterType);
    });
  }

  const searchInput = document.getElementById("qaTurnSearchInput");
  const query = (searchInput ? searchInput.value : "").toLowerCase().trim();
  const filter = currentQaState.transcriptFilter;

  const items = document.querySelectorAll(".qa-turn-bubble-item");
  items.forEach(el => {
    const spk = el.getAttribute("data-speaker") || "";
    const text = (el.getAttribute("data-text") || "").toLowerCase();

    const matchesSpk = (filter === "ALL") || (spk === filter);
    const matchesQuery = !query || text.includes(query);

    el.style.display = (matchesSpk && matchesQuery) ? "block" : "none";
  });
}

function renderQaScorecardView(call) {
  const container = document.getElementById("qaReportContainer");
  if (!container) return;

  const scorecard = call.qa_scorecard_json || {};
  const score = (call.qa_score !== null && call.qa_score !== undefined)
    ? Math.round(call.qa_score)
    : Math.round(scorecard.overall_qa_score || scorecard.overall_evaluation?.score || 50);

  const grade = scorecard.overall_evaluation?.grade || (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F');
  const passed = score >= 80;

  const agentEval = scorecard.agent_evaluation || {};
  const cx = scorecard.customer_experience || {};
  const compliance = scorecard.compliance || {};
  const insights = scorecard.insights || {};

  const identEmp = employeesCache.find(e => strId(e.id) === strId(call.identified_employee_id));
  const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ''}`.trim() : (scorecard.call?.agent_speaker || "Agent");

  // Extract transcript turns
  let turns = [];
  if (call.transcript_json) {
    if (Array.isArray(call.transcript_json.turns)) {
      turns = call.transcript_json.turns;
    } else if (Array.isArray(call.transcript_json.segments)) {
      turns = call.transcript_json.segments;
    }
  }

  // Build criteria list with interactive state
  const categoryKeys = [
    { key: "professional_greeting", label: "Professional Greeting & Identification", max: 10, defaultScore: 10 },
    { key: "problem_understanding", label: "Problem Understanding & Active Listening", max: 15, defaultScore: 14 },
    { key: "empathy", label: "Empathy & Customer Rapport", max: 15, defaultScore: 13 },
    { key: "communication", label: "Communication & Clarity", max: 10, defaultScore: 9 },
    { key: "professionalism", label: "Professionalism & Tone", max: 10, defaultScore: 10 },
    { key: "resolution", label: "Issue Resolution & Solution Accuracy", max: 20, defaultScore: 18 },
    { key: "professional_closing", label: "Professional Closing & Farewell", max: 5, defaultScore: 5 },
    { key: "compliance", label: "Mandatory Compliance & Disclosures", max: 15, defaultScore: 15 }
  ];

  currentQaState.callId = call.id;
  currentQaState.overallScore = score;
  currentQaState.grade = grade;
  currentQaState.passed = passed;
  currentQaState.isModified = false;
  currentQaState.categories = {};

  const categoriesHtml = categoryKeys.map(cat => {
    let item = cat.key === "compliance" ? compliance : agentEval[cat.key];
    let catScore = (item && item.score !== null && item.score !== undefined) ? item.score : Math.round((cat.defaultScore / 100) * score);
    let catMax = (item && item.max_score) ? item.max_score : cat.max;
    let pct = Math.round((catScore / catMax) * 100);
    let isCatPassed = (item && item.passed !== undefined && item.passed !== null) ? item.passed : (pct >= 75);
    let fillColor = isCatPassed ? '#10b981' : (pct >= 50 ? '#f59e0b' : '#ef4444');

    currentQaState.categories[cat.key] = {
      score: catScore,
      max: catMax,
      label: cat.label
    };

    return `
      <div class="qa-category-row-card">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 8px; flex-wrap: nowrap; gap: 8px;">
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${cat.label} <small style="color: #64748b; font-weight: 500;">(Max ${catMax} pts)</small>
          </span>
          
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <div style="display: inline-flex; align-items: center; gap: 3px;">
              <button type="button" class="btn-secondary" style="width: 24px; height: 24px; min-width: 24px; padding: 0; font-size: 13px; font-weight: 700; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;"
                onclick="adjustQaCategoryScore('${cat.key}', -1)" title="Decrease score">-</button>
              
              <input type="number" id="qaInput_${cat.key}" class="qa-score-input" min="0" max="${catMax}" value="${catScore}"
                oninput="onQaCategoryScoreChange('${cat.key}', this.value)">
              
              <button type="button" class="btn-secondary" style="width: 24px; height: 24px; min-width: 24px; padding: 0; font-size: 13px; font-weight: 700; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;"
                onclick="adjustQaCategoryScore('${cat.key}', 1)" title="Increase score">+</button>
            </div>
            
            <span id="qaPct_${cat.key}" style="font-size: 12px; min-width: 78px; text-align: right; white-space: nowrap;">
              <span style="color: ${isCatPassed ? '#15803d' : '#b91c1c'}; font-weight: 700;">${catScore}/${catMax} (${pct}%)</span>
            </span>
          </div>
        </div>

        <div style="width: 100%; display: block; margin-top: 4px;">
          <input type="range" id="qaSlider_${cat.key}" class="qa-score-slider" min="0" max="${catMax}" value="${catScore}" step="1"
            style="width: 100% !important; background: linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%);"
            oninput="onQaCategoryScoreChange('${cat.key}', this.value)">
        </div>
      </div>
    `;
  }).join("");

  // Customer Experience Signals
  const sentimentVal = cx.sentiment?.final || cx.sentiment?.initial || (passed ? "Positive" : "Neutral");
  const satisfactionVal = cx.satisfaction?.level || (passed ? "Satisfied" : "Neutral");
  const resolutionVal = cx.issue_resolution?.status || (agentEval.resolution?.resolution_status || (passed ? "Resolved" : "Partially Resolved"));

  // AI Coaching Insights
  const strengthsList = (insights.strengths && insights.strengths.length > 0)
    ? insights.strengths
    : ["Clear communication and professional tone maintained throughout the call.", "Accurately verified customer account credentials."];

  const actionItemsList = (insights.action_items && insights.action_items.length > 0)
    ? insights.action_items
    : ((insights.weaknesses && insights.weaknesses.length > 0) ? insights.weaknesses : ["State the mandatory regulatory disclosure clearly within the first 30 seconds."]);

  // Generate turns chat HTML
  const turnsHtml = turns.length === 0
    ? `<div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
        <i data-lucide="message-square-off" style="width: 36px; height: 36px; margin-bottom: 8px; display: block; margin: 0 auto 8px;"></i>
        <p style="font-size: 13px;">No audio turns or dialogue segments available for this recording.</p>
       </div>`
    : turns.map((t, idx) => {
      const spk = t.speaker || t.speaker_label || (idx % 2 === 0 ? "AGENT" : "CUSTOMER");
      const isAgent = spk === "SPEAKER_AGENT" || spk === "SPEAKER_00" || spk === "AGENT";
      const label = isAgent ? `Agent (${agentName})` : "Customer / Caller";
      const textContent = t.text || t.transcript || t.content || "";
      const startTime = formatTurnTime(t.start || 0);
      const endTime = formatTurnTime(t.end || 0);
      const enc = encodeURIComponent(textContent);

      return `
        <div class="qa-turn-bubble-item ${isAgent ? 'qa-chat-turn-agent' : 'qa-chat-turn-customer'}" data-speaker="${isAgent ? 'AGENT' : 'CUSTOMER'}" data-text="${encodeURIComponent(textContent.toLowerCase())}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="background: ${isAgent ? '#dbeafe' : '#f3e8ff'}; color: ${isAgent ? '#1e40af' : '#7e22ce'}; font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px;">
              <i data-lucide="${isAgent ? 'headset' : 'user'}" style="width: 12px;"></i> ${label}
            </span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <small style="font-family: monospace; color: #64748b; font-size: 11.5px; font-weight: 600;">${startTime} - ${endTime}</small>
              <button type="button" style="background: none; border: none; cursor: pointer; color: #94a3b8; padding: 2px;" title="Copy turn text" onclick="copyTurnText('${enc}')">
                <i data-lucide="copy" style="width: 11px;"></i>
              </button>
            </div>
          </div>
          <p style="font-size: 13px; color: #1e293b; line-height: 1.5; margin: 0; white-space: pre-wrap;">${textContent}</p>
        </div>
      `;
    }).join("");

  container.innerHTML = `
    <!-- OVERALL SCORE BANNER -->
    <div id="qaOverallBannerContainer" style="background: ${passed ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'}; border: 1.5px solid ${passed ? '#86efac' : '#fca5a5'}; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
      <div>
        <span style="font-size: 11px; font-weight: 700; color: ${passed ? '#15803d' : '#991b1b'}; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">OVERALL QA BENCHMARK SCORE • ${agentName}</span>
        <h3 style="font-size: 26px; font-weight: 800; color: ${passed ? '#166534' : '#991b1b'}; margin: 0; display: flex; align-items: center; gap: 10px;">
          <span id="qaOverallScoreText">${score}% Score</span>
          <span id="qaOverallGradeBadge" style="font-size: 15px; font-weight: 700; background: ${passed ? '#15803d' : '#991b1b'}; color: #ffffff; padding: 3px 10px; border-radius: 8px;">Grade ${grade}</span>
        </h3>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span id="qaOverallStatusPill" class="status-pill ${passed ? 'badge-completed' : 'badge-inactive'}" style="font-size: 13px; font-weight: 700; padding: 8px 16px;">
          ${passed ? '✓ PASSED BENCHMARK' : '⚠ NEEDS IMPROVEMENT'}
        </span>
      </div>
    </div>

    <!-- DUAL-COLUMN STUDIO GRID: SCORECARD CALIBRATION (LEFT 50%) & LIVE CHAT TRANSCRIPT (RIGHT 50%) -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; width: 100%;">
      
      <!-- LEFT COLUMN: 8 CATEGORY SINGLE-BAR SLIDERS & CX METRICS -->
      <div style="min-width: 0; width: 100%; display: flex; flex-direction: column; gap: 12px;">
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 14px; font-size: 12px; color: #1e40af; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="sliders" style="width: 16px; flex-shrink: 0;"></i>
          <span><strong>Auditor Interactive Calibration</strong>: Drag slider or adjust point counters to calibrate each category. Overall score updates in real-time.</span>
        </div>

        <!-- 8 Categories with Single Slider Bars -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${categoriesHtml}
        </div>

        <!-- CX Signals Row -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center;">
            <span style="font-size: 10px; color: #64748b; display: block; font-weight: 600;">SENTIMENT</span>
            <strong style="font-size: 12.5px; color: #0f172a; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
              <i data-lucide="${sentimentVal.toLowerCase() === 'positive' ? 'smile' : 'meh'}" style="width: 13px; color: #10b981;"></i> ${sentimentVal}
            </strong>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center;">
            <span style="font-size: 10px; color: #64748b; display: block; font-weight: 600;">SATISFACTION</span>
            <strong style="font-size: 12.5px; color: #0f172a; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
              <i data-lucide="thumbs-up" style="width: 13px; color: #1d61e7;"></i> ${satisfactionVal}
            </strong>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center;">
            <span style="font-size: 10px; color: #64748b; display: block; font-weight: 600;">RESOLUTION</span>
            <strong style="font-size: 12.5px; color: #0f172a; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
              <i data-lucide="check-circle" style="width: 13px; color: #059669;"></i> ${resolutionVal}
            </strong>
          </div>
        </div>

        <!-- AI Coaching Box -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
          <h5 style="font-size: 12px; font-weight: 700; color: #1d4ed8; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="sparkles" style="width: 13px;"></i> AI Coaching & Insights
          </h5>
          <div style="font-size: 11.5px; color: #334155; line-height: 1.5;">
            <strong style="color: #1e40af; display: block; margin-bottom: 2px;">Key Strengths:</strong>
            <ul style="margin: 0 0 6px 16px; padding: 0;">
              ${strengthsList.map(s => `<li>${s}</li>`).join("")}
            </ul>
            <strong style="color: #1e40af; display: block; margin-bottom: 2px;">Action Items:</strong>
            <ul style="margin: 0 0 0 16px; padding: 0;">
              ${actionItemsList.map(a => `<li>${a}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: LIVE CALL DIALOGUE CHAT TRANSCRIPT -->
      <div style="min-width: 0; width: 100%; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 16px; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div>
            <h4 style="font-size: 13.5px; font-weight: 700; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="message-square" style="width: 16px; color: #1d61e7;"></i>
              <span>Call Dialogue & Chat Transcript</span>
            </h4>
            <small style="color: #64748b; font-size: 11.5px;">${turns.length} Spoken Audio Turns in this recording</small>
          </div>
          <span class="status-pill badge-completed" style="font-size: 11px; padding: 2px 8px;">
            ${turns.length} Turns
          </span>
        </div>

        <!-- Filter & Search Strip -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="time-range-btn active" id="btnQaTurnFilter_ALL" style="font-size: 11px; padding: 4px 10px; border-radius: 8px;" onclick="filterQaTranscriptTurns('ALL')">
              All (${turns.length})
            </button>
            <button class="time-range-btn" id="btnQaTurnFilter_AGENT" style="font-size: 11px; padding: 4px 10px; border-radius: 8px;" onclick="filterQaTranscriptTurns('AGENT')">
              Agent Only
            </button>
            <button class="time-range-btn" id="btnQaTurnFilter_CUSTOMER" style="font-size: 11px; padding: 4px 10px; border-radius: 8px;" onclick="filterQaTranscriptTurns('CUSTOMER')">
              Customer Only
            </button>
          </div>

          <div style="position: relative; width: 100%;">
            <i data-lucide="search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 13px; color: #94a3b8;"></i>
            <input type="text" id="qaTurnSearchInput" placeholder="Search spoken dialogue keywords..." style="width: 100%; padding: 6px 10px 6px 30px; font-size: 12px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; background: #ffffff;" oninput="filterQaTranscriptTurns()">
          </div>
        </div>

        <!-- Chat Dialogue Stream -->
        <div class="qa-dialogue-container" style="max-height: 680px; height: 680px; overflow-y: auto; padding-right: 6px;">
          ${turnsHtml}
        </div>
      </div>

    </div>
  `;

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function copyCurrentQaScorecard() {
  const call = auditsCache.find(c => strId(c.id) === strId(currentViewedQaCallId));
  if (!call) {
    showToast("No QA Scorecard selected to copy", "info");
    return;
  }

  const score = Math.round(call.qa_score || 50);
  const ref = call.call_reference || call.id;
  const summary = `VoxAudit QA Evaluation Summary\nCall Reference: ${ref}\nOverall Score: ${score}%\nEvaluation Status: ${score >= 80 ? 'PASSED' : 'NEEDS IMPROVEMENT'}`;

  navigator.clipboard.writeText(summary).then(() => {
    showToast("QA Scorecard summary copied to clipboard!", "success");
  }).catch(err => {
    showToast("Failed to copy summary: " + err.message, "error");
  });
}

function downloadCurrentQaJson() {
  const call = auditsCache.find(c => strId(c.id) === strId(currentViewedQaCallId));
  if (!call || !call.qa_scorecard_json) {
    showToast("No QA Scorecard data available for download", "info");
    return;
  }

  const jsonStr = JSON.stringify(call.qa_scorecard_json, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qa_scorecard_${call.call_reference || 'call'}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("QA Scorecard JSON downloaded!", "success");
}

/* ==========================================================================
   QA SCORECARDS & EVALUATIONS HISTORY TABLE (PAGINATED - 5 PER PAGE)
   ========================================================================== */

function setQaHistoryPage(pageNum) {
  qaHistoryCurrentPage = pageNum;
  renderQaHistoryTable(qaHistorySearchQuery);
}

function changeQaHistoryPage(direction) {
  if (direction === "prev") {
    if (qaHistoryCurrentPage > 1) {
      qaHistoryCurrentPage--;
      renderQaHistoryTable(qaHistorySearchQuery);
    }
  } else if (direction === "next") {
    qaHistoryCurrentPage++;
    renderQaHistoryTable(qaHistorySearchQuery);
  }
}

function filterQaHistoryTable(val) {
  qaHistorySearchQuery = val || "";
  qaHistoryCurrentPage = 1;
  renderQaHistoryTable(qaHistorySearchQuery);
}

function renderQaHistoryTable(filterQuery = null) {
  const tbody = document.getElementById("qaHistoryTableBody");
  if (!tbody) return;

  if (filterQuery !== null && filterQuery !== undefined) {
    qaHistorySearchQuery = filterQuery;
  }
  const query = (qaHistorySearchQuery || "").toLowerCase().trim();
  let calls = [...auditsCache];

  // Sort calls newest/latest first
  calls.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });

  if (query) {
    calls = calls.filter(c => {
      const fn = (c.audio_filename || c.original_file_name || "").toLowerCase();
      const ref = (c.call_reference || c.id || "").toLowerCase();
      const emp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
      const empName = emp ? `${emp.first_name} ${emp.last_name || ""}`.toLowerCase() : "";
      const scoreStr = c.qa_score !== null && c.qa_score !== undefined ? `${c.qa_score}` : "";
      return fn.includes(query) || ref.includes(query) || empName.includes(query) || scoreStr.includes(query);
    });
  }

  const totalRecords = calls.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / QA_HISTORY_PAGE_SIZE));

  if (qaHistoryCurrentPage > totalPages) {
    qaHistoryCurrentPage = totalPages;
  }
  if (qaHistoryCurrentPage < 1) {
    qaHistoryCurrentPage = 1;
  }

  const paginationInfo = document.getElementById("qaHistoryPaginationInfo");
  const prevBtn = document.getElementById("qaHistPrevBtn");
  const nextBtn = document.getElementById("qaHistNextBtn");
  const pageNumbersContainer = document.getElementById("qaHistoryPageNumbers");

  if (totalRecords === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 36px 20px; color: #94a3b8;">
          <i data-lucide="inbox" style="width: 38px; height: 38px; margin-bottom: 8px; color: #cbd5e1; display: block; margin: 0 auto 8px;"></i>
          <p style="font-size: 13px; font-weight: 500; margin: 0;">${query ? 'No matching evaluated calls found.' : 'No call evaluations available yet. Select a call above to run the QA evaluation engine.'}</p>
        </td>
      </tr>
    `;
    if (paginationInfo) paginationInfo.innerHTML = "Showing <strong>0</strong> calls";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    return;
  }

  const startIndex = (qaHistoryCurrentPage - 1) * QA_HISTORY_PAGE_SIZE;
  const endIndex = Math.min(startIndex + QA_HISTORY_PAGE_SIZE, totalRecords);
  const pagedCalls = calls.slice(startIndex, endIndex);

  // Update Pagination Info
  if (paginationInfo) {
    paginationInfo.innerHTML = `Showing <strong>${startIndex + 1}</strong> - <strong>${endIndex}</strong> of <strong>${totalRecords}</strong> calls`;
  }

  // Update Previous / Next Button States
  if (prevBtn) {
    const isPrevDisabled = qaHistoryCurrentPage <= 1;
    prevBtn.disabled = isPrevDisabled;
    prevBtn.style.opacity = isPrevDisabled ? "0.45" : "1";
    prevBtn.style.cursor = isPrevDisabled ? "not-allowed" : "pointer";
    prevBtn.style.background = isPrevDisabled ? "#f1f5f9" : "#ffffff";
    prevBtn.style.borderColor = isPrevDisabled ? "#e2e8f0" : "#cbd5e1";
    prevBtn.style.color = isPrevDisabled ? "#94a3b8" : "#1e293b";
  }

  if (nextBtn) {
    const isNextDisabled = qaHistoryCurrentPage >= totalPages;
    nextBtn.disabled = isNextDisabled;
    nextBtn.style.opacity = isNextDisabled ? "0.45" : "1";
    nextBtn.style.cursor = isNextDisabled ? "not-allowed" : "pointer";
    nextBtn.style.background = isNextDisabled ? "#f1f5f9" : "#ffffff";
    nextBtn.style.borderColor = isNextDisabled ? "#e2e8f0" : "#cbd5e1";
    nextBtn.style.color = isNextDisabled ? "#94a3b8" : "#1e293b";
  }

  // Update Page Number Buttons (1, 2, 3, 4...)
  if (pageNumbersContainer) {
    let pagesHtml = "";
    for (let p = 1; p <= totalPages; p++) {
      const isActive = p === qaHistoryCurrentPage;
      const baseStyle = "width: 40px; height: 40px; min-width: 40px; padding: 0; border-radius: 11px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; font-family: inherit; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);";
      const btnStyle = isActive
        ? `${baseStyle} border: 1px solid #1d61e7; background: linear-gradient(135deg, #1d61e7 0%, #174ebc 100%); color: #ffffff; font-weight: 700; box-shadow: 0 4px 14px rgba(29, 97, 231, 0.4); cursor: default; transform: scale(1.05);`
        : `${baseStyle} border: 1px solid #cbd5e1; background: #ffffff; color: #334155; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.04); cursor: pointer;`;

      pagesHtml += `
        <button type="button" class="diar-page-btn ${isActive ? 'active' : ''}" style="${btnStyle}" onclick="setQaHistoryPage(${p})" title="Page ${p}">
          ${p}
        </button>
      `;
    }
    pageNumbersContainer.innerHTML = pagesHtml;
  }

  const fmtTime = (sec) => {
    if (sec === null || sec === undefined) return "00:00";
    if (typeof sec === "string" && sec.includes(":")) return sec;
    const s = Math.floor(Number(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  tbody.innerHTML = pagedCalls.map(c => {
    const identEmp = employeesCache.find(e => strId(e.id) === strId(c.identified_employee_id));
    const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ""}` : "Unidentified Speaker";
    const empCode = identEmp ? identEmp.employee_code : (c.identified_employee_id ? "AGNT-EMP" : "--");

    const hasQa = (c.qa_score !== null && c.qa_score !== undefined) || c.qa_scorecard_json;
    const scoreVal = hasQa ? Math.round(c.qa_score || 50) : null;
    const isPassed = scoreVal !== null ? scoreVal >= 80 : false;
    const grade = scoreVal ? (scoreVal >= 90 ? 'A' : scoreVal >= 80 ? 'B' : scoreVal >= 70 ? 'C' : scoreVal >= 60 ? 'D' : 'F') : '--';

    const cx = c.qa_scorecard_json?.customer_experience || {};
    const sentiment = cx.sentiment?.final || (hasQa ? "Positive" : "Pending");

    const scoreBadge = hasQa
      ? `<span class="status-pill ${isPassed ? 'badge-completed' : 'badge-inactive'}" style="font-size: 12px; font-weight: 700; padding: 4px 10px;">${scoreVal}% [Grade ${grade}]</span>`
      : `<span class="status-pill badge-processing" style="font-size: 11px; padding: 3px 8px;">Pending Evaluation</span>`;

    const complianceBadge = hasQa
      ? `<span class="status-pill ${isPassed ? 'badge-completed' : 'badge-inactive'}" style="font-size: 11px; padding: 3px 8px;">${isPassed ? '✓ Passed' : '⚠ Review Required'}</span>`
      : `<span style="font-size: 12px; color: #94a3b8;">--</span>`;

    const sentimentBadge = hasQa
      ? `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: ${sentiment.toLowerCase() === 'positive' ? '#15803d' : '#334155'};">
          <i data-lucide="${sentiment.toLowerCase() === 'positive' ? 'smile' : 'meh'}" style="width: 14px; color: ${sentiment.toLowerCase() === 'positive' ? '#10b981' : '#64748b'};"></i> ${sentiment}
        </span>`
      : `<span style="font-size: 12px; color: #94a3b8;">--</span>`;

    const callRef = c.call_reference || (c.id ? c.id.substring(0, 8) : 'CALL-REC');
    const fileName = c.audio_filename || c.original_file_name || "call_audio.wav";

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: #eff6ff; color: #1d4ed8; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i data-lucide="phone" style="width: 15px; height: 15px;"></i>
            </div>
            <div>
              <strong style="font-size: 13px; color: #0f172a; display: block;">${callRef}</strong>
              <small style="font-size: 11px; color: #64748b; font-family: monospace;">${fileName}</small>
            </div>
          </div>
        </td>
        <td>
          <div>
            <span style="font-weight: 600; color: #1e293b; font-size: 12.5px; display: block;">${agentName}</span>
            <small style="color: #64748b; font-size: 11px; font-family: monospace;">${empCode}</small>
          </div>
        </td>
        <td>${scoreBadge}</td>
        <td>${complianceBadge}</td>
        <td>${sentimentBadge}</td>
        <td>
          <span style="font-family: monospace; font-size: 12px; color: #334155;">${fmtTime(c.duration_seconds)}</span>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end;">
            ${hasQa ? `
              <button class="btn-secondary" style="font-size: 11.5px; padding: 5px 11px; height: auto;" onclick="viewQaScorecardDetails('${c.id}')" title="Inspect full QA scorecard breakdown">
                <i data-lucide="eye" style="width: 12px;"></i> View Scorecard
              </button>
            ` : ''}
            <button class="btn-primary" style="font-size: 11.5px; padding: 5px 11px; height: auto; background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);" onclick="triggerQaAuditFromRow('${c.id}')" title="Run AI Quality Evaluation on this call">
              <i data-lucide="play" style="width: 12px;"></i> ${hasQa ? 'Re-Audit' : 'Run Audit'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function triggerQaAuditFromRow(callId) {
  const sel = document.getElementById("qaCallSelect");
  if (sel) sel.value = callId;
  runQaEvaluation();
}

async function runQaEvaluation(e) {
  if (e) e.preventDefault();
  const callId = document.getElementById("qaCallSelect")?.value;
  if (!callId) {
    showToast("Please select a processed call recording first", "info");
    return;
  }

  const callObj = auditsCache.find(c => strId(c.id) === strId(callId));
  const refStr = callObj?.call_reference || (callId.substring(0, 8));
  const fileName = callObj?.audio_filename || callObj?.original_file_name || 'call_audio.wav';

  const btn = document.getElementById("btnRunQa");
  const origBtnHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" style="width: 14px; height: 14px;"></i> Queuing to Worker...`;
  }

  try {
    const res = await fetch(`/api/v1/calls/${callId}/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server returned status ${res.status}`);
    }

    showToast("QA Audit job sent to RabbitMQ queue! Worker is evaluating call...", "info");

    if (btn) {
      btn.innerHTML = `<i data-lucide="loader-2" style="width: 14px; height: 14px;"></i> Worker Processing...`;
    }

    // Add to session queue tracker
    const queueSection = document.getElementById("qaQueueSection");
    const queueList = document.getElementById("qaQueueList");
    const queueBadge = document.getElementById("qaQueueCountBadge");

    if (queueSection && queueList) {
      queueSection.style.display = "block";
      if (!qaSessionQueue.find(j => j.id === callId)) {
        qaSessionQueue.unshift({ id: callId, ref: refStr, filename: fileName, status: "PROCESSING" });
      }
      if (queueBadge) queueBadge.textContent = `${qaSessionQueue.length} Active`;
      
      queueList.innerHTML = qaSessionQueue.map(j => `
        <div style="background: #ffffff; border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 14px; box-shadow: 0 2px 8px rgba(37,99,235,0.06);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 13px; color: #0f172a;">${j.ref} • ${j.filename}</strong>
            <span class="status-pill badge-processing" style="font-size: 11px; padding: 2px 8px;">Evaluating</span>
          </div>
          <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
            <div style="width: 75%; height: 100%; background: linear-gradient(90deg, #2563eb, #3b82f6); border-radius: 3px; animation: pulse 1.5s infinite;"></div>
          </div>
          <small style="font-size: 11px; color: #64748b;">Ollama LLM evaluating 8 QA criteria & CX sentiment...</small>
        </div>
      `).join("");
    }

    // Start polling for QA completion
    let attempts = 0;
    const maxAttempts = 30;
    if (qaPollTimer) clearInterval(qaPollTimer);

    qaPollTimer = setInterval(async () => {
      attempts++;
      try {
        const checkRes = await fetch(`/api/v1/calls/${callId}`);
        if (checkRes.ok) {
          const updatedCall = await checkRes.json();
          if ((updatedCall.qa_score !== null && updatedCall.qa_score !== undefined) || updatedCall.qa_scorecard_json) {
            clearInterval(qaPollTimer);
            qaPollTimer = null;

            // Update in auditsCache
            const idx = auditsCache.findIndex(c => strId(c.id) === strId(callId));
            if (idx >= 0) auditsCache[idx] = updatedCall;
            else auditsCache.unshift(updatedCall);

            if (btn) {
              btn.disabled = false;
              btn.innerHTML = origBtnHtml;
            }

            // Remove from queue tracker
            qaSessionQueue = qaSessionQueue.filter(j => j.id !== callId);
            if (queueBadge) queueBadge.textContent = `${qaSessionQueue.length} Active`;
            if (qaSessionQueue.length === 0 && queueSection) {
              queueSection.style.display = "none";
            }

            loadQaAnalysisPage();
            viewQaScorecardDetails(callId);
            showToast("QA Audit & Scorecard generated successfully!", "success");
            return;
          }
        }
      } catch (err) {
        console.error("QA Poll error", err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(qaPollTimer);
        qaPollTimer = null;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origBtnHtml;
        }
        showToast("QA evaluation is taking longer than expected. Please check worker status.", "warning");
        loadQaAnalysisPage();
      }
    }, 2000);

  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnHtml;
    }
    showToast(`Error queuing QA audit: ${err.message}`, "error");
  }
}

/* ==========================================================================
   CHAT QA AUDIT & JSON TRANSCRIPT EVALUATION STUDIO
   ========================================================================== */
let chatQaHistoryCache = [];
let chatQaFilteredHistory = [];
let chatQaCurrentPage = 1;
const chatQaPageSize = 10;
let chatQaSelectedFile = null;
let currentChatQaState = {
  id: null,
  categories: {},
  overallScore: 0,
  grade: 'A',
  passed: true,
  isModified: false,
  transcriptFilter: 'ALL'
};

async function loadChatQaPage() {
  populateChatQaAgentDropdown();
  await loadChatQaHistory();
}

function populateChatQaAgentDropdown() {
  const select = document.getElementById("chatQaAgentSelect");
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = `<option value="">Auto-Detect from Transcript</option>`;

  employeesCache.forEach(emp => {
    const opt = document.createElement("option");
    opt.value = emp.id;
    opt.textContent = `${emp.first_name} ${emp.last_name || ''} (${emp.employee_code || 'EMP'})`.trim();
    select.appendChild(opt);
  });

  if (currentVal) select.value = currentVal;
}

function switchChatQaInputMode(mode) {
  const btnUpload = document.getElementById("btnChatQaMode_upload");
  const btnPaste = document.getElementById("btnChatQaMode_paste");
  const dropzoneCont = document.getElementById("chatQaDropzoneContainer");
  const pasteCont = document.getElementById("chatQaPasteContainer");

  if (mode === "upload") {
    if (btnUpload) btnUpload.classList.add("active");
    if (btnPaste) btnPaste.classList.remove("active");
    if (dropzoneCont) dropzoneCont.style.display = "block";
    if (pasteCont) pasteCont.style.display = "none";
  } else {
    if (btnUpload) btnUpload.classList.remove("active");
    if (btnPaste) btnPaste.classList.add("active");
    if (dropzoneCont) dropzoneCont.style.display = "none";
    if (pasteCont) pasteCont.style.display = "block";
  }
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function handleChatQaFileSelected(input) {
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  chatQaSelectedFile = file;

  const titleEl = document.getElementById("chatQaDropzoneTitle");
  const subEl = document.getElementById("chatQaDropzoneSubtitle");
  const titleInput = document.getElementById("chatQaTitle");

  if (titleEl) {
    titleEl.textContent = `✓ Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  }
  if (subEl) {
    subEl.textContent = "Ready to evaluate. Click 'Run AI Chat QA Evaluation' below.";
  }
  if (titleInput && !titleInput.value.trim()) {
    titleInput.value = file.name.replace(/\.[^/.]+$/, "");
  }
}

function downloadSampleChatJson() {
  const sampleData = [
    { "speaker": "agent", "text": "Thank you for contacting VoxAudit Support. My name is Alex. How may I assist you today?" },
    { "speaker": "customer", "text": "Hello Alex, I was charged twice on my monthly subscription and I need a refund for the duplicate charge." },
    { "speaker": "agent", "text": "I understand how frustrating billing errors can be. I will gladly look into this duplicate charge right away. May I please verify your account email address?" },
    { "speaker": "customer", "text": "Sure, it is customer@example.com." },
    { "speaker": "agent", "text": "Thank you. I have verified your account and I see the duplicate transaction of $49.00 processed on August 22nd. I have just initiated an immediate refund of $49.00 back to your original payment method." },
    { "speaker": "customer", "text": "That was very quick, thank you so much!" },
    { "speaker": "agent", "text": "You are very welcome! Please note that this call is recorded for quality purposes and funds typically appear within 3-5 business days. Is there anything else I can help you with today?" },
    { "speaker": "customer", "text": "No, that resolves everything. Have a great day!" },
    { "speaker": "agent", "text": "Thank you for choosing VoxAudit. Have a wonderful day and goodbye!" }
  ];

  const blob = new Blob([JSON.stringify(sampleData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample_support_chat.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Sample Chat JSON file downloaded!", "info");
}

async function runChatQaEvaluation(e) {
  if (e) e.preventDefault();

  const titleInput = document.getElementById("chatQaTitle");
  const agentSelect = document.getElementById("chatQaAgentSelect");
  const fileInput = document.getElementById("chatQaFileInput");
  const pasteArea = document.getElementById("chatQaJsonPaste");
  const btn = document.getElementById("btnRunChatQa");

  const title = titleInput ? titleInput.value.trim() : "Chat Transcript";
  const employeeId = agentSelect ? agentSelect.value : "";
  const isPasteMode = document.getElementById("chatQaPasteContainer")?.style.display !== "none";

  const formData = new FormData();
  formData.append("title", title);
  if (employeeId) formData.append("employee_id", employeeId);

  if (isPasteMode) {
    const rawJson = pasteArea ? pasteArea.value.trim() : "";
    if (!rawJson) {
      showToast("Please paste your JSON chat conversation text.", "warning");
      return;
    }
    try {
      JSON.parse(rawJson);
    } catch (err) {
      showToast("Invalid JSON syntax. Please verify JSON format.", "error");
      return;
    }
    formData.append("raw_json_str", rawJson);
  } else {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      showToast("Please select or drop a .json chat file to evaluate.", "warning");
      return;
    }
    formData.append("file", fileInput.files[0]);
  }

  const origBtnHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" style="width: 16px; animation: spin 1s linear infinite;"></i> Queuing to Worker...`;
  }

  try {
    const res = await fetch("/api/v1/chat-qa/evaluate", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `Evaluation failed (${res.status})`);
    }

    const job = await res.json();

    // Reset form inputs
    if (fileInput) fileInput.value = "";
    if (pasteArea) pasteArea.value = "";
    chatQaSelectedFile = null;
    const dropTitle = document.getElementById("chatQaDropzoneTitle");
    if (dropTitle) dropTitle.textContent = "Drag and drop your Chat JSON file here, or click to browse";

    // If completed immediately (e.g. fallback)
    if (job.qa_score !== null && job.qa_score !== undefined) {
      showToast("✓ Chat QA Evaluation complete! Scorecard generated.", "success");
      chatQaHistoryCache.unshift(job);
      updateChatQaStats();
      renderChatQaHistoryTable();
      viewChatQaDetails(job.id);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtnHtml;
      }
      return;
    }

    // Otherwise it is QUEUED in RabbitMQ for QAAuditWorker:
    showToast("⚡ Chat QA job queued! Background worker is running AI evaluation...", "info");
    if (btn) {
      btn.innerHTML = `<i data-lucide="loader-2" style="width: 16px; animation: spin 1s linear infinite;"></i> Worker Processing QA...`;
    }

    // Add queued record to history table
    chatQaHistoryCache.unshift(job);
    updateChatQaStats();
    renderChatQaHistoryTable();

    // Poll until worker finishes
    let attempts = 0;
    const maxAttempts = 45; // ~90 seconds max
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const checkRes = await fetch(`/api/v1/chat-qa/${job.id}`);
        if (checkRes.ok) {
          const updatedJob = await checkRes.json();
          if ((updatedJob.qa_score !== null && updatedJob.qa_score !== undefined) || updatedJob.qa_scorecard_json) {
            clearInterval(pollInterval);

            // Update in cache
            const idx = chatQaHistoryCache.findIndex(c => strId(c.id) === strId(job.id));
            if (idx >= 0) chatQaHistoryCache[idx] = updatedJob;
            else chatQaHistoryCache.unshift(updatedJob);

            if (btn) {
              btn.disabled = false;
              btn.innerHTML = origBtnHtml;
            }

            updateChatQaStats();
            renderChatQaHistoryTable();
            viewChatQaDetails(job.id);
            showToast("✓ Worker completed Chat QA Evaluation! Scorecard generated.", "success");
            if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
            return;
          }
        }
      } catch (pollErr) {
        console.error("Chat QA Poll error", pollErr);
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origBtnHtml;
        }
        showToast("QA evaluation is taking longer than expected. Please check QA worker status.", "warning");
        loadChatQaHistory();
      }
    }, 2000);

  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnHtml;
    }
    showToast(`Evaluation Error: ${err.message}`, "error");
  } finally {
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  }
}

async function loadChatQaHistory() {
  const tbody = document.getElementById("chatQaHistoryTableBody");
  try {
    const res = await fetch("/api/v1/chat-qa/history?limit=100");
    if (!res.ok) throw new Error("Failed to load chat QA history");

    const data = await res.json();
    chatQaHistoryCache = data.items || [];
    chatQaFilteredHistory = [...chatQaHistoryCache];

    updateChatQaStats();
    renderChatQaHistoryTable();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 24px; color: #ef4444; font-size: 13px;">
            Error loading chat QA history: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

function updateChatQaStats() {
  const totalEl = document.getElementById("chat-qa-stat-total");
  const scoreEl = document.getElementById("chat-qa-stat-score");
  const compEl = document.getElementById("chat-qa-stat-compliance");
  const sentEl = document.getElementById("chat-qa-stat-sentiment");

  const total = chatQaHistoryCache.length;
  if (totalEl) totalEl.textContent = total;

  if (total === 0) {
    if (scoreEl) scoreEl.textContent = "0%";
    if (compEl) compEl.textContent = "100%";
    if (sentEl) sentEl.textContent = "0%";
    return;
  }

  let totalScore = 0;
  let compPassed = 0;
  let posSentiment = 0;

  chatQaHistoryCache.forEach(c => {
    totalScore += (c.qa_score || 0);
    const sc = c.qa_scorecard_json || {};
    if (sc.compliance?.passed !== false) compPassed++;
    const s = sc.customer_experience?.sentiment?.final || sc.customer_experience?.sentiment?.initial || "";
    if (s.toLowerCase() === "positive") posSentiment++;
  });

  if (scoreEl) scoreEl.textContent = `${Math.round(totalScore / total)}%`;
  if (compEl) compEl.textContent = `${Math.round((compPassed / total) * 100)}%`;
  if (sentEl) sentEl.textContent = `${Math.round((posSentiment / total) * 100)}%`;
}

function filterChatQaHistoryTable(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) {
    chatQaFilteredHistory = [...chatQaHistoryCache];
  } else {
    chatQaFilteredHistory = chatQaHistoryCache.filter(c => {
      const code = (c.audit_code || c.code || "").toLowerCase();
      const title = (c.original_file_name || "").toLowerCase();
      const agent = (c.agent_name || "").toLowerCase();
      return code.includes(q) || title.includes(q) || agent.includes(q);
    });
  }
  chatQaCurrentPage = 1;
  renderChatQaHistoryTable();
}

function changeChatQaHistoryPage(dir) {
  const totalPages = Math.ceil(chatQaFilteredHistory.length / chatQaPageSize) || 1;
  if (typeof dir === "number") {
    chatQaCurrentPage = Math.max(1, Math.min(totalPages, dir));
  } else if (dir === "prev" && chatQaCurrentPage > 1) {
    chatQaCurrentPage--;
  } else if (dir === "next" && chatQaCurrentPage < totalPages) {
    chatQaCurrentPage++;
  }
  renderChatQaHistoryTable();
}

function renderChatQaHistoryTable() {
  const tbody = document.getElementById("chatQaHistoryTableBody");
  if (!tbody) return;

  if (chatQaFilteredHistory.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px 20px; color: #94a3b8;">
          <i data-lucide="messages-square" style="width: 36px; height: 36px; margin: 0 auto 8px; display: block; opacity: 0.5;"></i>
          <p style="font-size: 13px; font-weight: 600; margin: 0;">No Chat QA evaluation records found.</p>
          <small style="color: #64748b;">Upload a JSON chat log above to generate your first Chat QA audit scorecard.</small>
        </td>
      </tr>
    `;
    updateChatQaPaginationControls(0, 0, 0);
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    return;
  }

  const totalPages = Math.ceil(chatQaFilteredHistory.length / chatQaPageSize) || 1;
  chatQaCurrentPage = Math.max(1, Math.min(totalPages, chatQaCurrentPage));
  const startIdx = (chatQaCurrentPage - 1) * chatQaPageSize;
  const endIdx = Math.min(startIdx + chatQaPageSize, chatQaFilteredHistory.length);
  const pageItems = chatQaFilteredHistory.slice(startIdx, endIdx);

  tbody.innerHTML = pageItems.map(c => {
    const auditId = c.audit_code || c.code || (c.id ? `CHAT-${c.id.substring(0, 6).toUpperCase()}` : "CHAT-AUDIT");
    const title = c.original_file_name || "Chat Conversation";
    const agent = c.agent_name || "Unassigned";
    const turns = c.turns_count || (c.transcript_json?.turns?.length || 0);
    const score = (c.qa_score !== null && c.qa_score !== undefined) ? Math.round(c.qa_score) : 50;
    const passed = score >= 80;
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    const cx = c.qa_scorecard_json?.customer_experience || {};
    const sentiment = cx.sentiment?.final || cx.sentiment?.initial || (passed ? "Positive" : "Neutral");
    const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "--";

    return `
      <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;">
        <td style="padding: 10px 14px; font-weight: 700; color: #1e40af; font-family: monospace; font-size: 12.5px;">
          ${auditId}
        </td>
        <td style="padding: 10px 14px; font-weight: 600; color: #0f172a; font-size: 13px;">
          ${title}
        </td>
        <td style="padding: 10px 14px; color: #334155; font-size: 12.5px;">
          <span style="display: inline-flex; align-items: center; gap: 6px;">
            <i data-lucide="user" style="width: 13px; color: #64748b;"></i> ${agent}
          </span>
        </td>
        <td style="padding: 10px 14px; color: #64748b; font-size: 12px; font-weight: 600;">
          ${turns} Turns
        </td>
        <td style="padding: 10px 14px;">
          <span class="status-pill ${passed ? 'badge-completed' : 'badge-inactive'}" style="font-size: 11.5px; padding: 3px 10px; font-weight: 700;">
            ${score}% (Grade ${grade})
          </span>
        </td>
        <td style="padding: 10px 14px; font-size: 12px; color: #334155;">
          <span style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">
            <i data-lucide="${sentiment.toLowerCase() === 'positive' ? 'smile' : 'meh'}" style="width: 13px; color: ${sentiment.toLowerCase() === 'positive' ? '#10b981' : '#f59e0b'};"></i>
            ${sentiment}
          </span>
        </td>
        <td style="padding: 10px 14px; color: #64748b; font-size: 11.5px; white-space: nowrap;">
          ${dateStr}
        </td>
        <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
          <button type="button" class="btn-primary" style="font-size: 11.5px; padding: 5px 12px; margin-right: 4px;" onclick="viewChatQaDetails('${c.id}')" title="View Scorecard & Dialogue">
            <i data-lucide="award" style="width: 12px;"></i> View Scorecard
          </button>
          <button type="button" class="btn-secondary" style="font-size: 11.5px; padding: 5px 8px; color: #ef4444; border-color: #fca5a5;" onclick="deleteChatQaRecord('${c.id}')" title="Delete record">
            <i data-lucide="trash-2" style="width: 12px;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  updateChatQaPaginationControls(startIdx + 1, endIdx, chatQaFilteredHistory.length);
  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function updateChatQaPaginationControls(start, end, total) {
  const infoEl = document.getElementById("chatQaHistoryPaginationInfo");
  const prevBtn = document.getElementById("chatQaHistPrevBtn");
  const nextBtn = document.getElementById("chatQaHistNextBtn");
  const pagesContainer = document.getElementById("chatQaHistPageNumbers");

  if (infoEl) {
    infoEl.innerHTML = total === 0 ? "Showing 0 chat evaluations" : `Showing <strong>${start}-${end}</strong> of <strong>${total}</strong> chat evaluations`;
  }

  const totalPages = Math.ceil(total / chatQaPageSize) || 1;
  if (prevBtn) prevBtn.disabled = chatQaCurrentPage <= 1;
  if (nextBtn) nextBtn.disabled = chatQaCurrentPage >= totalPages;

  if (pagesContainer) {
    let pagesHtml = "";
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= chatQaCurrentPage - 1 && p <= chatQaCurrentPage + 1)) {
        pagesHtml += `
          <button type="button" class="diar-page-btn ${p === chatQaCurrentPage ? 'active' : ''}" onclick="changeChatQaHistoryPage(${p})">
            ${p}
          </button>
        `;
      } else if (p === chatQaCurrentPage - 2 || p === chatQaCurrentPage + 2) {
        pagesHtml += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
      }
    }
    pagesContainer.innerHTML = pagesHtml;
  }
}

async function viewChatQaDetails(id) {
  let record = chatQaHistoryCache.find(c => strId(c.id) === strId(id));
  if (!record) {
    try {
      const res = await fetch(`/api/v1/chat-qa/${id}`);
      if (res.ok) record = await res.json();
    } catch (e) {
      console.error(e);
    }
  }

  if (!record) {
    showToast("Chat QA record details not found.", "error");
    return;
  }

  const panel = document.getElementById("chatQaDetailsBottomSection");
  if (panel) {
    panel.style.display = "block";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  renderChatQaScorecardView(record);
}

function closeChatQaDetailsPanel() {
  const panel = document.getElementById("chatQaDetailsBottomSection");
  if (panel) panel.style.display = "none";
}

function onChatQaCategoryScoreChange(key, value) {
  if (!currentChatQaState.categories[key]) return;
  const max = currentChatQaState.categories[key].max;
  const numVal = Math.min(max, Math.max(0, parseFloat(value) || 0));
  currentChatQaState.categories[key].score = numVal;
  currentChatQaState.isModified = true;

  const slider = document.getElementById(`chatQaSlider_${key}`);
  const numInput = document.getElementById(`chatQaInput_${key}`);
  const pctEl = document.getElementById(`chatQaPct_${key}`);

  if (slider && parseFloat(slider.value) !== numVal) slider.value = numVal;
  if (numInput && parseFloat(numInput.value) !== numVal) numInput.value = numVal;

  const pct = Math.round((numVal / max) * 100);
  const isPassed = pct >= 75;
  const fillColor = isPassed ? '#10b981' : (pct >= 50 ? '#f59e0b' : '#ef4444');

  if (pctEl) {
    pctEl.innerHTML = `<span style="color: ${isPassed ? '#15803d' : '#b91c1c'}; font-weight: 700;">${numVal}/${max} (${pct}%)</span>`;
  }
  if (slider) {
    slider.style.background = `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`;
  }

  // Recalculate overall score
  let totalScore = 0;
  let totalMax = 0;
  for (const k in currentChatQaState.categories) {
    totalScore += currentChatQaState.categories[k].score;
    totalMax += currentChatQaState.categories[k].max;
  }

  const overallScore = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';
  const passed = overallScore >= 80;

  currentChatQaState.overallScore = overallScore;
  currentChatQaState.grade = grade;
  currentChatQaState.passed = passed;

  const scoreText = document.getElementById("chatQaOverallScoreText");
  const gradeBadge = document.getElementById("chatQaOverallGradeBadge");
  const statusPill = document.getElementById("chatQaOverallStatusPill");
  const bannerContainer = document.getElementById("chatQaOverallBannerContainer");
  const saveBtn = document.getElementById("btnSaveChatQaCalibration");

  if (scoreText) scoreText.textContent = `${overallScore}% Score`;
  if (gradeBadge) gradeBadge.textContent = `Grade ${grade}`;
  if (statusPill) {
    statusPill.className = `status-pill ${passed ? 'badge-completed' : 'badge-inactive'}`;
    statusPill.textContent = passed ? '✓ PASSED BENCHMARK' : '⚠ NEEDS IMPROVEMENT';
  }
  if (bannerContainer) {
    bannerContainer.style.background = passed ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)';
    bannerContainer.style.borderColor = passed ? '#86efac' : '#fca5a5';
  }
  if (saveBtn) saveBtn.style.display = "inline-flex";
}

function adjustChatQaCategoryScore(key, delta) {
  if (!currentChatQaState.categories[key]) return;
  const currentVal = currentChatQaState.categories[key].score;
  onChatQaCategoryScoreChange(key, currentVal + delta);
}

async function saveCalibratedChatQaScorecard() {
  const callId = currentChatQaState.id;
  if (!callId) {
    showToast("No chat scorecard selected to save", "error");
    return;
  }

  const saveBtn = document.getElementById("btnSaveChatQaCalibration");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i data-lucide="loader-2" style="width: 13px; animation: spin 1s linear infinite;"></i> Saving Calibration...`;
  }

  try {
    const record = chatQaHistoryCache.find(c => strId(c.id) === strId(callId));
    let scorecard = record?.qa_scorecard_json ? JSON.parse(JSON.stringify(record.qa_scorecard_json)) : {};
    if (!scorecard.agent_evaluation) scorecard.agent_evaluation = {};
    if (!scorecard.overall_evaluation) scorecard.overall_evaluation = {};

    scorecard.overall_qa_score = currentChatQaState.overallScore;
    scorecard.overall_evaluation.score = currentChatQaState.overallScore;
    scorecard.overall_evaluation.grade = currentChatQaState.grade;

    for (const k in currentChatQaState.categories) {
      const cat = currentChatQaState.categories[k];
      if (k === "compliance") {
        if (!scorecard.compliance) scorecard.compliance = {};
        scorecard.compliance.score = cat.score;
        scorecard.compliance.max_score = cat.max;
        scorecard.compliance.passed = (cat.score / cat.max) >= 0.75;
      } else {
        if (!scorecard.agent_evaluation[k]) scorecard.agent_evaluation[k] = {};
        scorecard.agent_evaluation[k].score = cat.score;
        scorecard.agent_evaluation[k].max_score = cat.max;
        scorecard.agent_evaluation[k].passed = (cat.score / cat.max) >= 0.75;
      }
    }

    const payload = {
      qa_score: currentChatQaState.overallScore,
      qa_scorecard_json: scorecard
    };

    const res = await fetch(`/api/v1/calls/${callId}/scorecard`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Failed to save scorecard calibration");

    const updatedJob = await res.json();
    showToast("✓ Calibrated Chat Scorecard saved to database!", "success");

    const idx = chatQaHistoryCache.findIndex(c => strId(c.id) === strId(callId));
    if (idx !== -1) chatQaHistoryCache[idx] = updatedJob;

    currentChatQaState.isModified = false;
    if (saveBtn) {
      saveBtn.style.display = "none";
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i data-lucide="save" style="width: 13px;"></i> Save Calibrated Scorecard`;
    }

    updateChatQaStats();
    renderChatQaHistoryTable();
  } catch (err) {
    showToast(`Error saving scorecard: ${err.message}`, "error");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i data-lucide="save" style="width: 13px;"></i> Save Calibrated Scorecard`;
    }
  }

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

function filterChatQaTranscriptTurns(filterType = null) {
  if (filterType !== null) {
    currentChatQaState.transcriptFilter = filterType;
    ['ALL', 'AGENT', 'CUSTOMER'].forEach(t => {
      const btn = document.getElementById(`btnChatQaTurnFilter_${t}`);
      if (btn) btn.classList.toggle('active', t === filterType);
    });
  }

  const searchInput = document.getElementById("chatQaTurnSearchInput");
  const query = (searchInput ? searchInput.value : "").toLowerCase().trim();
  const filter = currentChatQaState.transcriptFilter;

  const items = document.querySelectorAll(".chat-qa-turn-bubble-item");
  items.forEach(el => {
    const spk = el.getAttribute("data-speaker") || "";
    const text = (el.getAttribute("data-text") || "").toLowerCase();

    const matchesSpk = (filter === "ALL") || (spk === filter);
    const matchesQuery = !query || text.includes(query);

    el.style.display = (matchesSpk && matchesQuery) ? "block" : "none";
  });
}

function renderChatQaScorecardView(call) {
  const container = document.getElementById("chatQaReportContainer");
  if (!container) return;

  const scorecard = call.qa_scorecard_json || {};
  const score = (call.qa_score !== null && call.qa_score !== undefined)
    ? Math.round(call.qa_score)
    : Math.round(scorecard.overall_qa_score || scorecard.overall_evaluation?.score || 50);

  const grade = scorecard.overall_evaluation?.grade || (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F');
  const passed = score >= 80;

  const agentEval = scorecard.agent_evaluation || {};
  const cx = scorecard.customer_experience || {};
  const compliance = scorecard.compliance || {};
  const insights = scorecard.insights || {};

  const identEmp = employeesCache.find(e => strId(e.id) === strId(call.identified_employee_id));
  const agentName = identEmp ? `${identEmp.first_name} ${identEmp.last_name || ''}`.trim() : (call.agent_name || scorecard.call?.agent_speaker || "Agent");

  // Extract transcript turns
  let turns = [];
  if (call.transcript_json) {
    if (Array.isArray(call.transcript_json.turns)) turns = call.transcript_json.turns;
    else if (Array.isArray(call.transcript_json.segments)) turns = call.transcript_json.segments;
  }

  const categoryKeys = [
    { key: "professional_greeting", label: "Professional Greeting & Identification", max: 10, defaultScore: 10 },
    { key: "problem_understanding", label: "Problem Understanding & Active Listening", max: 15, defaultScore: 14 },
    { key: "empathy", label: "Empathy & Customer Rapport", max: 15, defaultScore: 13 },
    { key: "communication", label: "Communication & Clarity", max: 10, defaultScore: 9 },
    { key: "professionalism", label: "Professionalism & Tone", max: 10, defaultScore: 10 },
    { key: "resolution", label: "Issue Resolution & Solution Accuracy", max: 20, defaultScore: 18 },
    { key: "professional_closing", label: "Professional Closing & Farewell", max: 5, defaultScore: 5 },
    { key: "compliance", label: "Mandatory Compliance & Disclosures", max: 15, defaultScore: 15 }
  ];

  currentChatQaState.id = call.id;
  currentChatQaState.overallScore = score;
  currentChatQaState.grade = grade;
  currentChatQaState.passed = passed;
  currentChatQaState.isModified = false;
  currentChatQaState.categories = {};

  const categoriesHtml = categoryKeys.map(cat => {
    let item = cat.key === "compliance" ? compliance : agentEval[cat.key];
    let catScore = (item && item.score !== null && item.score !== undefined) ? item.score : Math.round((cat.defaultScore / 100) * score);
    let catMax = (item && item.max_score) ? item.max_score : cat.max;
    let pct = Math.round((catScore / catMax) * 100);
    let isCatPassed = (item && item.passed !== undefined && item.passed !== null) ? item.passed : (pct >= 75);
    let fillColor = isCatPassed ? '#10b981' : (pct >= 50 ? '#f59e0b' : '#ef4444');

    currentChatQaState.categories[cat.key] = {
      score: catScore,
      max: catMax,
      label: cat.label
    };

    return `
      <div class="qa-category-row-card">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 8px; flex-wrap: nowrap; gap: 8px;">
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${cat.label} <small style="color: #64748b; font-weight: 500;">(Max ${catMax} pts)</small>
          </span>
          
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <div style="display: inline-flex; align-items: center; gap: 3px;">
              <button type="button" class="btn-secondary" style="width: 24px; height: 24px; min-width: 24px; padding: 0; font-size: 13px; font-weight: 700; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;"
                onclick="adjustChatQaCategoryScore('${cat.key}', -1)" title="Decrease score">-</button>
              
              <input type="number" id="chatQaInput_${cat.key}" class="qa-score-input" min="0" max="${catMax}" value="${catScore}"
                oninput="onChatQaCategoryScoreChange('${cat.key}', this.value)">
              
              <button type="button" class="btn-secondary" style="width: 24px; height: 24px; min-width: 24px; padding: 0; font-size: 13px; font-weight: 700; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;"
                onclick="adjustChatQaCategoryScore('${cat.key}', 1)" title="Increase score">+</button>
            </div>
            
            <span id="chatQaPct_${cat.key}" style="font-size: 12px; min-width: 78px; text-align: right; white-space: nowrap;">
              <span style="color: ${isCatPassed ? '#15803d' : '#b91c1c'}; font-weight: 700;">${catScore}/${catMax} (${pct}%)</span>
            </span>
          </div>
        </div>

        <div style="width: 100%; display: block; margin-top: 4px;">
          <input type="range" id="chatQaSlider_${cat.key}" class="qa-score-slider" min="0" max="${catMax}" value="${catScore}" step="1"
            style="width: 100% !important; background: linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%);"
            oninput="onChatQaCategoryScoreChange('${cat.key}', this.value)">
        </div>
      </div>
    `;
  }).join("");

  const sentimentVal = cx.sentiment?.final || cx.sentiment?.initial || (passed ? "Positive" : "Neutral");
  const satisfactionVal = cx.satisfaction?.level || (passed ? "Satisfied" : "Neutral");
  const resolutionVal = cx.issue_resolution?.status || (agentEval.resolution?.resolution_status || (passed ? "Resolved" : "Partially Resolved"));

  const strengthsList = (insights.strengths && insights.strengths.length > 0)
    ? insights.strengths
    : ["Clear communication and professional tone maintained throughout the chat.", "Accurately verified customer account credentials."];

  const actionItemsList = (insights.action_items && insights.action_items.length > 0)
    ? insights.action_items
    : ((insights.weaknesses && insights.weaknesses.length > 0) ? insights.weaknesses : ["State the mandatory regulatory disclosure clearly within the first 30 seconds."]);

  const turnsHtml = turns.length === 0
    ? `<div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
        <i data-lucide="messages-square" style="width: 36px; height: 36px; margin: 0 auto 8px; display: block;"></i>
        <p style="font-size: 13px;">No dialogue turns available for this chat record.</p>
       </div>`
    : turns.map((t, idx) => {
      const spk = t.speaker || t.speaker_label || (idx % 2 === 0 ? "AGENT" : "CUSTOMER");
      const isAgent = spk === "SPEAKER_AGENT" || spk === "SPEAKER_00" || spk === "AGENT";
      const label = isAgent ? `Agent (${agentName})` : "Customer / User";
      const textContent = t.text || t.transcript || t.content || "";
      const startTime = formatTurnTime(t.start || 0);
      const endTime = formatTurnTime(t.end || 0);
      const enc = encodeURIComponent(textContent);

      return `
        <div class="chat-qa-turn-bubble-item ${isAgent ? 'qa-chat-turn-agent' : 'qa-chat-turn-customer'}" data-speaker="${isAgent ? 'AGENT' : 'CUSTOMER'}" data-text="${encodeURIComponent(textContent.toLowerCase())}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="background: ${isAgent ? '#dbeafe' : '#f3e8ff'}; color: ${isAgent ? '#1e40af' : '#7e22ce'}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
              <i data-lucide="${isAgent ? 'headset' : 'user'}" style="width: 12px;"></i> ${label}
            </span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <small style="font-family: monospace; color: #64748b; font-size: 11px; font-weight: 600;">${startTime} - ${endTime}</small>
              <button type="button" style="background: none; border: none; cursor: pointer; color: #94a3b8; padding: 2px;" title="Copy text" onclick="copyTurnText('${enc}')">
                <i data-lucide="copy" style="width: 11px;"></i>
              </button>
            </div>
          </div>
          <p style="font-size: 12.5px; color: #1e293b; line-height: 1.5; margin: 0; white-space: pre-wrap;">${textContent}</p>
        </div>
      `;
    }).join("");

  container.innerHTML = `
    <!-- OVERALL SCORE BANNER -->
    <div id="chatQaOverallBannerContainer" style="background: ${passed ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'}; border: 1.5px solid ${passed ? '#86efac' : '#fca5a5'}; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
      <div>
        <span style="font-size: 11px; font-weight: 700; color: ${passed ? '#15803d' : '#991b1b'}; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">CHAT QA BENCHMARK SCORE • ${agentName}</span>
        <h3 style="font-size: 26px; font-weight: 800; color: ${passed ? '#166534' : '#991b1b'}; margin: 0; display: flex; align-items: center; gap: 10px;">
          <span id="chatQaOverallScoreText">${score}% Score</span>
          <span id="chatQaOverallGradeBadge" style="font-size: 15px; font-weight: 700; background: ${passed ? '#15803d' : '#991b1b'}; color: #ffffff; padding: 3px 10px; border-radius: 8px;">Grade ${grade}</span>
        </h3>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span id="chatQaOverallStatusPill" class="status-pill ${passed ? 'badge-completed' : 'badge-inactive'}" style="font-size: 13px; font-weight: 700; padding: 8px 16px;">
          ${passed ? '✓ PASSED BENCHMARK' : '⚠ NEEDS IMPROVEMENT'}
        </span>
      </div>
    </div>

    <!-- DUAL-COLUMN STUDIO GRID: SCORECARD CALIBRATION (LEFT 50%) & LIVE CHAT TRANSCRIPT (RIGHT 50%) -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; width: 100%;">
      
      <!-- LEFT COLUMN: 8 CATEGORY SINGLE-BAR SLIDERS & CX METRICS -->
      <div style="min-width: 0; width: 100%; display: flex; flex-direction: column; gap: 12px;">
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 14px; font-size: 12px; color: #1e40af; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="sliders" style="width: 16px; flex-shrink: 0;"></i>
          <span><strong>Auditor Interactive Calibration</strong>: Drag slider or adjust point counters to calibrate each category. Overall score updates in real-time.</span>
        </div>

        <!-- 8 Categories with Single Slider Bars -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${categoriesHtml}
        </div>

        <!-- CX Signals Row -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center;">
            <span style="font-size: 10px; color: #64748b; display: block; font-weight: 600;">SENTIMENT</span>
            <strong style="font-size: 12.5px; color: #0f172a; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
              <i data-lucide="${sentimentVal.toLowerCase() === 'positive' ? 'smile' : 'meh'}" style="width: 13px; color: #10b981;"></i> ${sentimentVal}
            </strong>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center;">
            <span style="font-size: 10px; color: #64748b; display: block; font-weight: 600;">SATISFACTION</span>
            <strong style="font-size: 12.5px; color: #0f172a; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
              <i data-lucide="thumbs-up" style="width: 13px; color: #1d61e7;"></i> ${satisfactionVal}
            </strong>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center;">
            <span style="font-size: 10px; color: #64748b; display: block; font-weight: 600;">RESOLUTION</span>
            <strong style="font-size: 12.5px; color: #0f172a; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
              <i data-lucide="check-circle" style="width: 13px; color: #059669;"></i> ${resolutionVal}
            </strong>
          </div>
        </div>

        <!-- AI Coaching Box -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
          <h5 style="font-size: 12px; font-weight: 700; color: #1d4ed8; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="sparkles" style="width: 13px;"></i> AI Coaching & Insights
          </h5>
          <div style="font-size: 11.5px; color: #334155; line-height: 1.5;">
            <strong style="color: #1e40af; display: block; margin-bottom: 2px;">Key Strengths:</strong>
            <ul style="margin: 0 0 6px 16px; padding: 0;">
              ${strengthsList.map(s => `<li>${s}</li>`).join("")}
            </ul>
            <strong style="color: #1e40af; display: block; margin-bottom: 2px;">Action Items:</strong>
            <ul style="margin: 0 0 0 16px; padding: 0;">
              ${actionItemsList.map(a => `<li>${a}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: LIVE CALL DIALOGUE CHAT TRANSCRIPT -->
      <div style="min-width: 0; width: 100%; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 16px; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div>
            <h4 style="font-size: 13.5px; font-weight: 700; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="message-square" style="width: 16px; color: #1d61e7;"></i>
              <span>Chat Conversation Dialogue</span>
            </h4>
            <small style="color: #64748b; font-size: 11.5px;">${turns.length} Chat message turns in this session</small>
          </div>
          <span class="status-pill badge-completed" style="font-size: 11px; padding: 2px 8px;">
            ${turns.length} Turns
          </span>
        </div>

        <!-- Filter & Search Strip -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="time-range-btn active" id="btnChatQaTurnFilter_ALL" style="font-size: 11px; padding: 4px 10px; border-radius: 8px;" onclick="filterChatQaTranscriptTurns('ALL')">
              All (${turns.length})
            </button>
            <button class="time-range-btn" id="btnChatQaTurnFilter_AGENT" style="font-size: 11px; padding: 4px 10px; border-radius: 8px;" onclick="filterChatQaTranscriptTurns('AGENT')">
              Agent Only
            </button>
            <button class="time-range-btn" id="btnChatQaTurnFilter_CUSTOMER" style="font-size: 11px; padding: 4px 10px; border-radius: 8px;" onclick="filterChatQaTranscriptTurns('CUSTOMER')">
              Customer Only
            </button>
          </div>

          <div style="position: relative; width: 100%;">
            <i data-lucide="search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 13px; color: #94a3b8;"></i>
            <input type="text" id="chatQaTurnSearchInput" placeholder="Search chat messages..." style="width: 100%; padding: 6px 10px 6px 30px; font-size: 12px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; background: #ffffff;" oninput="filterChatQaTranscriptTurns()">
          </div>
        </div>

        <!-- Chat Dialogue Stream -->
        <div class="qa-dialogue-container" style="max-height: 520px; height: 520px; overflow-y: auto; padding-right: 6px;">
          ${turnsHtml}
        </div>
      </div>

    </div>
  `;

  if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
}

async function deleteChatQaRecord(id) {
  if (!confirm("Are you sure you want to delete this Chat QA evaluation record?")) return;

  try {
    const res = await fetch(`/api/v1/chat-qa/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete record");

    showToast("Chat QA record deleted successfully", "info");
    chatQaHistoryCache = chatQaHistoryCache.filter(c => strId(c.id) !== strId(id));
    chatQaFilteredHistory = chatQaFilteredHistory.filter(c => strId(c.id) !== strId(id));

    updateChatQaStats();
    renderChatQaHistoryTable();

    const panel = document.getElementById("chatQaDetailsBottomSection");
    if (panel && currentChatQaState.id === id) {
      panel.style.display = "none";
    }
  } catch (err) {
    showToast(`Error deleting record: ${err.message}`, "error");
  }
}

function copyCurrentChatQaScorecard() {
  const callId = currentChatQaState.id;
  const record = chatQaHistoryCache.find(c => strId(c.id) === strId(callId));
  if (!record) {
    showToast("No scorecard loaded to copy", "warning");
    return;
  }

  const sc = record.qa_scorecard_json || {};
  const text = `VoxAudit Chat QA Scorecard: ${record.original_file_name || 'Chat'}\nOverall Score: ${record.qa_score}%\nAgent: ${record.agent_name || 'Agent'}\nDate: ${record.created_at || ''}`;
  navigator.clipboard.writeText(text);
  showToast("✓ Chat QA scorecard summary copied to clipboard!", "success");
}

function downloadCurrentChatQaJson() {
  const callId = currentChatQaState.id;
  const record = chatQaHistoryCache.find(c => strId(c.id) === strId(callId));
  if (!record) {
    showToast("No scorecard loaded to export", "warning");
    return;
  }

  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat_qa_${record.audit_code || record.id || 'export'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Chat QA JSON exported successfully!", "info");
}

