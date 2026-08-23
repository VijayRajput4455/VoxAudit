/* ==========================================================================
   VoxAudit Dashboard Frontend Logic
   Matching exact enterprise voice audit dashboard
   ========================================================================== */

let departmentsCache = [];
let designationsCache = [];
let shiftsCache = [];
let employeesCache = [];
let auditsCache = [];
let auditsOverTimeChartInstance = null;

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
    if (!res.ok) throw new Error("Failed");
    closeModal("departmentModal");
    loadDepartments();
  } catch (err) { alert("Error saving department"); }
}

async function deleteDepartment(id, name) {
  if (!confirm(`Delete department '${name}'?`)) return;
  try {
    await fetch(`/api/v1/departments/${id}`, { method: "DELETE" });
    loadDepartments();
  } catch (err) {}
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
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    closeModal("designationModal");
    loadDesignations();
  } catch (err) { alert("Error saving designation"); }
}

async function deleteDesignation(id, name) {
  if (!confirm(`Delete designation '${name}'?`)) return;
  try {
    await fetch(`/api/v1/designations/${id}`, { method: "DELETE" });
    loadDesignations();
  } catch (err) {}
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
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    closeModal("shiftModal");
    loadShifts();
  } catch (err) { alert("Error saving shift"); }
}

async function deleteShift(id, name) {
  if (!confirm(`Delete shift '${name}'?`)) return;
  try {
    await fetch(`/api/v1/shifts/${id}`, { method: "DELETE" });
    loadShifts();
  } catch (err) {}
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

async function loadEmployees() {
  const tbody = document.getElementById("employeesTableBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Loading employees...</td></tr>`;

  try {
    const [empRes, deptRes, desigRes, shiftRes] = await Promise.all([
      fetch("/api/v1/employees/"),
      fetch("/api/v1/departments/"),
      fetch("/api/v1/designations/"),
      fetch("/api/v1/shifts/")
    ]);

    if (empRes.ok) employeesCache = await empRes.json();
    if (deptRes.ok) departmentsCache = await deptRes.json();
    if (desigRes.ok) designationsCache = await desigRes.json();
    if (shiftRes.ok) shiftsCache = await shiftRes.json();

    renderEmployeesTable(employeesCache);
    populateDropdowns();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color: #ef4444; text-align: center;">Error loading employees</td></tr>`;
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
  const deptsEl = document.getElementById("empMetricDepts");
  const desigsEl = document.getElementById("empMetricDesigs");

  if (totalEl) totalEl.textContent = list.length;
  if (activeEl) activeEl.textContent = list.filter(e => e.status === "ACTIVE").length;
  if (deptsEl) deptsEl.textContent = new Set(list.map(e => e.department_id).filter(Boolean)).size;
  if (desigsEl) desigsEl.textContent = new Set(list.map(e => e.designation_id).filter(Boolean)).size;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No employees found. Click "+ Add Employee" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(emp => {
    const dept = departmentsCache.find(d => strId(d.id) === strId(emp.department_id))?.name || "--";
    const desig = designationsCache.find(d => strId(d.id) === strId(emp.designation_id))?.name || "--";
    const shift = shiftsCache.find(s => strId(s.id) === strId(emp.shift_id))?.name || "--";
    const fullName = `${emp.first_name} ${emp.last_name || ""}`.trim();
    const contactInfo = emp.email || emp.phone || "--";
    const statusClass = emp.status === "ACTIVE" ? "badge-completed" : "badge-inactive";

    return `
      <tr>
        <td><code>${emp.employee_code}</code></td>
        <td><strong>${fullName}</strong></td>
        <td>${contactInfo}</td>
        <td>${dept}</td>
        <td>${desig}</td>
        <td>${shift}</td>
        <td><span class="status-pill ${statusClass}">${emp.status}</span></td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditEmployeeModal('${emp.id}')">Edit</button>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" onclick="deleteEmployee('${emp.id}', '${fullName}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

function filterEmployees() {
  const query = document.getElementById("empSearchInput")?.value.toLowerCase().trim() || "";
  const filtered = employeesCache.filter(e =>
    e.employee_code.toLowerCase().includes(query) ||
    `${e.first_name} ${e.last_name || ""}`.toLowerCase().includes(query) ||
    (e.email && e.email.toLowerCase().includes(query)) ||
    (e.phone && e.phone.includes(query))
  );
  renderEmployeesTable(filtered);
}

function filterEmpStatus(status, btn) {
  document.querySelectorAll("#view-employees .time-range-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  if (status === "ALL") renderEmployeesTable(employeesCache);
  else renderEmployeesTable(employeesCache.filter(e => e.status === status));
}

function openAddEmployeeModal() {
  document.getElementById("empModalTitle").innerHTML = `<i data-lucide="users"></i> Add Employee`;
  document.getElementById("empId").value = "";
  document.getElementById("empCode").value = "";
  document.getElementById("empFirstName").value = "";
  document.getElementById("empLastName").value = "";
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
    loadEmployees();
  } catch (err) {
    alert("Error saving employee: " + err.message);
  }
}

async function deleteEmployee(id, name) {
  if (!confirm(`Delete employee profile '${name}'? This will also clean up associated voice embeddings.`)) return;
  try {
    const res = await fetch(`/api/v1/employees/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    loadEmployees();
  } catch (err) {
    alert("Error deleting employee profile");
  }
}
