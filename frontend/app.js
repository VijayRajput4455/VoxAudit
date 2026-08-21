/* ==========================================================================
   VoxAudit Dashboard Frontend Application Logic
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Initialize Charts
  initAuditOverviewChart();
  initSentimentDonutChart();

  // Load Live API Stats & Employees
  loadDatabaseStats();
  loadEmployees();
});

/* ==========================================================================
   CHART INITIALIZATIONS
   ========================================================================== */
function initAuditOverviewChart() {
  const ctx = document.getElementById("auditOverviewChart");
  if (!ctx) return;

  const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, "rgba(124, 58, 237, 0.25)");
  gradient.addColorStop(1, "rgba(124, 58, 237, 0.0)");

  new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Aug 15", "Aug 16", "Aug 17", "Aug 18", "Aug 19", "Aug 20", "Aug 21"],
      datasets: [
        {
          label: "Audits",
          data: [35, 42, 55, 86, 48, 70, 62],
          borderColor: "#7c3aed",
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4, // Smooth Bezier curve
          pointRadius: [0, 0, 0, 6, 0, 0, 0], // Highlight node at Aug 18
          pointBackgroundColor: "#7c3aed",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: "#0f172a",
          bodyColor: "#6366f1",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items) => items[0].label + ", 2026",
            label: (item) => `Audits: ${item.formattedValue}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8", font: { family: "Plus Jakarta Sans", size: 11 } },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: "#f1f5f9" },
          ticks: { color: "#94a3b8", font: { family: "Plus Jakarta Sans", size: 11 } },
        },
      },
    },
  });
}

function initSentimentDonutChart() {
  const ctx = document.getElementById("sentimentDonutChart");
  if (!ctx) return;

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Positive", "Neutral", "Negative", "Very Negative"],
      datasets: [
        {
          data: [45, 30, 15, 10],
          backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"],
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "75%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.label}: ${item.raw}%`,
          },
        },
      },
    },
  });
}

/* ==========================================================================
   LIVE API INTEGRATION
   ========================================================================== */
async function loadDatabaseStats() {
  try {
    const response = await fetch("/api/v1/voice-samples/summary/all");
    if (!response.ok) return;

    const data = await response.json();
    
    // Update dashboard metrics dynamically if live data is available
    if (data.total_voice_samples > 0) {
      document.getElementById("stat-total-audits").textContent = data.total_voice_samples;
    }
    if (data.total_vectors > 0) {
      document.getElementById("stat-conversations").textContent = data.total_vectors;
    }
  } catch (err) {
    console.warn("API offline or loading initial state:", err);
  }
}

async function loadEmployees() {
  const selectEl = document.getElementById("enrollEmployeeSelect");
  if (!selectEl) return;

  try {
    const res = await fetch("/api/v1/employees/");
    if (!res.ok) return;

    const employees = await res.json();
    if (employees && employees.length > 0) {
      selectEl.innerHTML = employees
        .map(
          (emp) =>
            `<option value="${emp.id}">${emp.first_name} ${emp.last_name || ""} (${emp.employee_code})</option>`
        )
        .join("");
    } else {
      selectEl.innerHTML = `<option value="">No employees found. Create employee first.</option>`;
    }
  } catch (err) {
    selectEl.innerHTML = `<option value="">Error loading employees</option>`;
  }
}

/* ==========================================================================
   MODAL CONTROLS & FORM HANDLERS
   ========================================================================== */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("active");
}

function openEnrollmentModal(e) {
  if (e) e.preventDefault();
  loadEmployees();
  openModal("enrollmentModal");
}

function openAuditModal() {
  openModal("auditModal");
}

async function openVoiceSummaryModal() {
  openModal("voiceSummaryModal");
  const contentEl = document.getElementById("voiceSummaryContent");
  contentEl.innerHTML = "<p>Loading voice database summary...</p>";

  try {
    const res = await fetch("/api/v1/voice-samples/summary/all");
    if (!res.ok) throw new Error("Failed to fetch summary.");

    const data = await res.json();
    
    let html = `
      <div style="display: flex; gap: 20px; margin-bottom: 20px;">
        <div style="background: #f5f3ff; padding: 12px 18px; border-radius: 10px;">
          <small style="color: #64748b; font-weight: 600;">Enrolled Employees</small>
          <h3 style="color: #7c3aed; font-size: 20px; font-weight: 800;">${data.total_employees_enrolled}</h3>
        </div>
        <div style="background: #eff6ff; padding: 12px 18px; border-radius: 10px;">
          <small style="color: #64748b; font-weight: 600;">Total Audio Samples</small>
          <h3 style="color: #2563eb; font-size: 20px; font-weight: 800;">${data.total_voice_samples}</h3>
        </div>
        <div style="background: #ecfdf5; padding: 12px 18px; border-radius: 10px;">
          <small style="color: #64748b; font-weight: 600;">Milvus 192D Vectors</small>
          <h3 style="color: #059669; font-size: 20px; font-weight: 800;">${data.total_vectors}</h3>
        </div>
      </div>
    `;

    if (data.profiles && data.profiles.length > 0) {
      html += `
        <table class="summary-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Code</th>
              <th>Audio Clips</th>
              <th>Status</th>
              <th>Vector ID</th>
            </tr>
          </thead>
          <tbody>
      `;

      data.profiles.forEach(prof => {
        if (prof.samples && prof.samples.length > 0) {
          prof.samples.forEach(s => {
            html += `
              <tr>
                <td><strong>${prof.first_name} ${prof.last_name || ''}</strong></td>
                <td><code>${prof.employee_code}</code></td>
                <td>${s.original_file_name}</td>
                <td><span class="badge ${s.status === 'ACTIVE' ? 'badge-positive' : 'badge-neutral'}">${s.status}</span></td>
                <td><small>${s.embedding_id || 'Queued in RabbitMQ'}</small></td>
              </tr>
            `;
          });
        }
      });

      html += `</tbody></table>`;
    } else {
      html += `<p>No voice profiles enrolled yet.</p>`;
    }

    contentEl.innerHTML = html;
  } catch (err) {
    contentEl.innerHTML = `<p style="color: #ef4444;">Error loading summary: ${err.message}</p>`;
  }
}

function handleFileSelect(input) {
  const preview = document.getElementById("fileListPreview");
  if (!preview) return;

  if (input.files && input.files.length > 0) {
    let filesHtml = Array.from(input.files)
      .map(
        (f) =>
          `<div class="file-preview-item">
            <span>📄 ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)</span>
          </div>`
      )
      .join("");
    preview.innerHTML = filesHtml;
  }
}

function handleAuditFileSelect(input) {
  const preview = document.getElementById("auditFilePreview");
  if (!preview) return;

  if (input.files && input.files.length > 0) {
    const f = input.files[0];
    preview.innerHTML = `<div class="file-preview-item">
      <span>🎧 ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)</span>
    </div>`;
  }
}

/* Form Submissions */
document.getElementById("enrollmentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const empId = document.getElementById("enrollEmployeeSelect").value;
  const filesInput = document.getElementById("enrollFiles");
  const btn = document.getElementById("btnEnrollSubmit");

  if (!empId) {
    alert("Please select an employee.");
    return;
  }
  if (!filesInput.files || filesInput.files.length === 0) {
    alert("Please select at least one audio file.");
    return;
  }

  const formData = new FormData();
  formData.append("employee_id", empId);
  Array.from(filesInput.files).forEach((f) => formData.append("files", f));

  btn.disabled = true;
  btn.innerHTML = "Submitting to Queue...";

  try {
    const res = await fetch("/api/v1/voice-samples/enroll", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      alert("Voice samples uploaded and queued in RabbitMQ successfully!");
      closeModal("enrollmentModal");
      loadDatabaseStats();
    } else {
      const err = await res.json();
      alert("Enrollment failed: " + (err.detail || "Unknown error"));
    }
  } catch (err) {
    alert("Error connecting to server: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="send"></i> Enroll Voice Samples';
    if (window.lucide) lucide.createIcons();
  }
});

document.getElementById("auditForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("auditFile");
  const btn = document.getElementById("btnAuditSubmit");

  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Please select a call recording file.");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  btn.disabled = true;
  btn.innerHTML = "Processing Call Audio...";

  try {
    const res = await fetch("/api/v1/calls/process", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      alert(`Call submitted for processing! Call ID: ${data.id}`);
      closeModal("auditModal");
    } else {
      const err = await res.json();
      alert("Call submission failed: " + (err.detail || "Unknown error"));
    }
  } catch (err) {
    alert("Error connecting to server: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="cpu"></i> Process & Audit Call';
    if (window.lucide) lucide.createIcons();
  }
});
