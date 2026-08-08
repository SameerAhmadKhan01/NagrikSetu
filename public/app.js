document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // State Management
  const state = {
    activeTab: "citizen-portal",
    activeSubTab: "scheme-discover-tab",
    jwtToken: localStorage.getItem("admin_token") || null,
    adminUser: JSON.parse(localStorage.getItem("admin_user")) || null,
    lastChatSuggestion: null,
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false
  };

  // DOM Elements
  const tabs = document.querySelectorAll(".nav-tab");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const subTabs = document.querySelectorAll(".sub-tab");
  const subTabPanels = document.querySelectorAll(".sub-tab-panel");
  
  // Forms & Result Containers
  const schemeForm = document.getElementById("scheme-form");
  const schemeResults = document.getElementById("scheme-results");
  const grievanceForm = document.getElementById("grievance-form");
  const geoBtn = document.getElementById("geo-btn");
  const trackBtn = document.getElementById("track-btn");
  const trackIdInput = document.getElementById("track-id-input");
  const trackingResult = document.getElementById("tracking-result");
  
  // Modals
  const successModal = document.getElementById("success-modal");
  const modalTrackingId = document.getElementById("modal-tracking-id");
  const copyIdBtn = document.getElementById("copy-id-btn");
  const closeModalBtn = document.getElementById("close-modal-btn");

  // Admin Auth
  const adminLoginBox = document.getElementById("admin-login-box");
  const adminDashboardView = document.getElementById("admin-dashboard-view");
  const adminLoginForm = document.getElementById("admin-login-form");
  const loginError = document.getElementById("login-error");

  // Chatbot Elements
  const chatbotToggleBtn = document.getElementById("chatbot-toggle-btn");
  const chatbotBox = document.getElementById("chatbot-box");
  const chatMessagesContainer = document.getElementById("chat-messages-container");
  const chatTextInput = document.getElementById("chat-text-input");
  const chatSendBtn = document.getElementById("chat-send-btn");
  const chatVoiceBtn = document.getElementById("chat-voice-btn");
  const micIcon = document.getElementById("mic-icon");
  const chatSuggestionBanner = document.getElementById("chat-suggestion-banner");
  const autofillApplyBtn = document.getElementById("autofill-apply-btn");
  const autofillCloseBtn = document.getElementById("autofill-close-btn");

  // Admin Dashboard Items
  const filterStatus = document.getElementById("filter-status");
  const filterCategory = document.getElementById("filter-category");
  const retrainBtn = document.getElementById("retrain-btn");

  // --- TAB NAVIGATION HANDLER ---
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetPanel = tab.getAttribute("data-tab");
      tabs.forEach(t => t.classList.remove("active"));
      tabPanels.forEach(p => p.classList.remove("active"));
      
      tab.classList.add("active");
      document.getElementById(targetPanel).classList.add("active");
      state.activeTab = targetPanel;

      if (targetPanel === "admin-portal") {
        checkAdminAuthState();
      }
    });
  });

  subTabs.forEach(subtab => {
    subtab.addEventListener("click", () => {
      const targetSubPanel = subtab.getAttribute("data-subtab");
      subTabs.forEach(t => t.classList.remove("active"));
      subTabPanels.forEach(p => p.classList.remove("active"));

      subtab.classList.add("active");
      document.getElementById(targetSubPanel).classList.add("active");
      state.activeSubTab = targetSubPanel;
    });
  });

  // --- CITIZEN WELFARE MATCHING ---
  schemeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    schemeResults.innerHTML = `
      <div class="empty-state">
        <i data-lucide="refresh-cw" class="empty-icon rotate-animation"></i>
        <p>Matching best welfare schemes using semantic ranker...</p>
      </div>
    `;
    lucide.createIcons();

    const age = parseInt(document.getElementById("scheme-age").value) || undefined;
    const income = parseInt(document.getElementById("scheme-income").value) || undefined;
    const gender = document.getElementById("scheme-gender").value || undefined;
    const region = document.getElementById("scheme-region").value || undefined;
    const situation = document.getElementById("scheme-situation").value || undefined;

    const payload = {
      profile: { age, income, gender, region },
      situation
    };

    try {
      const res = await fetch("/api/schemes/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success && data.matchedSchemes.length > 0) {
        renderSchemes(data.matchedSchemes);
      } else {
        schemeResults.innerHTML = `
          <div class="empty-state">
            <i data-lucide="help-circle" class="empty-icon"></i>
            <p>No matching schemes found. Adjust your profile filters or add more details to your description.</p>
          </div>
        `;
        lucide.createIcons();
      }
    } catch (err) {
      console.error(err);
      schemeResults.innerHTML = `
        <div class="empty-state">
          <i data-lucide="alert-octagon" class="empty-icon text-danger"></i>
          <p>Failed to retrieve matching schemes. Please ensure the backend is running.</p>
        </div>
      `;
      lucide.createIcons();
    }
  });

  function renderSchemes(schemes) {
    schemeResults.innerHTML = "";
    schemes.forEach(match => {
      const card = document.createElement("div");
      card.className = "scheme-match-card";
      
      const scorePercentage = Math.round(match.score * 100);
      const crit = match.eligibilityCriteria;
      
      let criteriaHTML = "";
      if (crit.minAge !== undefined || crit.maxAge !== undefined) {
        criteriaHTML += `<span class="criteria-pill"><i data-lucide="user"></i> Age: ${crit.minAge || 0}-${crit.maxAge || "∞"}</span>`;
      }
      if (crit.maxIncome !== undefined) {
        criteriaHTML += `<span class="criteria-pill"><i data-lucide="indian-rupee"></i> Income < ₹${crit.maxIncome.toLocaleString()}</span>`;
      }
      if (crit.genders && crit.genders.length > 0) {
        criteriaHTML += `<span class="criteria-pill"><i data-lucide="users"></i> Gender: ${crit.genders.join(", ")}</span>`;
      }
      if (crit.regions && crit.regions.length > 0) {
        criteriaHTML += `<span class="criteria-pill"><i data-lucide="map"></i> Region: ${crit.regions.join(", ")}</span>`;
      }

      card.innerHTML = `
        <div class="scheme-card-top">
          <h3>${match.name}</h3>
          <span class="match-score-badge">${scorePercentage}% Match</span>
        </div>
        <p>${match.description}</p>
        <div class="scheme-criteria-list">
          ${criteriaHTML}
        </div>
      `;
      schemeResults.appendChild(card);
    });
    lucide.createIcons();
  }

  // --- GEOLOCATION HANDLER ---
  geoBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    
    geoBtn.innerHTML = `<i data-lucide="loader" class="rotate-animation"></i> Fetching...`;
    lucide.createIcons();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        document.getElementById("grievance-lat").value = position.coords.latitude.toFixed(6);
        document.getElementById("grievance-lng").value = position.coords.longitude.toFixed(6);
        geoBtn.innerHTML = `<i data-lucide="check"></i> Geolocation Loaded`;
        geoBtn.classList.replace("btn-secondary", "btn-success");
        lucide.createIcons();
      },
      (err) => {
        console.error(err);
        alert(`Failed to fetch location: ${err.message}. Please input coordinates manually.`);
        geoBtn.innerHTML = `<i data-lucide="map-pin"></i> Fetch Geolocation`;
        lucide.createIcons();
      }
    );
  });

  // --- SUBMIT ANONYMOUS GRIEVANCE ---
  grievanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = grievanceForm.querySelector("button[type='submit']");
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = `<i data-lucide="loader" class="rotate-animation"></i> Filing report...`;
    lucide.createIcons();

    const formData = new FormData();
    formData.append("category", document.getElementById("grievance-category").value);
    formData.append("region", document.getElementById("grievance-region").value);
    formData.append("latitude", document.getElementById("grievance-lat").value);
    formData.append("longitude", document.getElementById("grievance-lng").value);
    formData.append("description", document.getElementById("grievance-desc").value);
    
    const mediaFile = document.getElementById("grievance-media").files[0];
    if (mediaFile) {
      formData.append("media", mediaFile);
    }

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        // Reset form
        grievanceForm.reset();
        geoBtn.innerHTML = `<i data-lucide="map-pin"></i> Fetch Geolocation`;
        geoBtn.className = "btn btn-secondary btn-sm";
        
        // Show success modal
        modalTrackingId.textContent = data.trackingId;
        successModal.classList.remove("hidden");
      } else {
        alert(`Submission failed: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to submit grievance. Please verify connection to the server.");
    } finally {
      submitBtn.innerHTML = originalText;
      lucide.createIcons();
    }
  });

  // Success Modal Operations
  copyIdBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(modalTrackingId.textContent);
    copyIdBtn.innerHTML = `<i data-lucide="check"></i> Copied`;
    lucide.createIcons();
    setTimeout(() => {
      copyIdBtn.innerHTML = `<i data-lucide="copy"></i> Copy`;
      lucide.createIcons();
    }, 2000);
  });

  closeModalBtn.addEventListener("click", () => {
    successModal.classList.add("hidden");
  });

  // --- TRACK GRIEVANCE STATUS ---
  trackBtn.addEventListener("click", async () => {
    const trackingId = trackIdInput.value.trim().toUpperCase();
    if (!trackingId) return;

    trackBtn.innerHTML = `<i data-lucide="loader" class="rotate-animation"></i>`;
    lucide.createIcons();

    try {
      const res = await fetch(`/api/reports/track/${trackingId}`);
      const data = await res.json();

      if (data.success) {
        renderTrackingTimeline(data.report);
      } else {
        alert(data.error || "Grievance tracking code not found.");
        trackingResult.classList.add("hidden");
      }
    } catch (err) {
      console.error(err);
      alert("Error tracking report status.");
      trackingResult.classList.add("hidden");
    } finally {
      trackBtn.innerHTML = `<i data-lucide="search"></i> Track`;
      lucide.createIcons();
    }
  });

  function renderTrackingTimeline(report) {
    trackingResult.classList.remove("hidden");
    document.getElementById("res-code").textContent = report.trackingId;
    
    // SLA indicator
    const hoursElapsed = (new Date().getTime() - new Date(report.createdAt).getTime()) / (1000 * 60 * 60);
    const slaRemaining = Math.max(0, Math.round(report.slaHours - hoursElapsed));
    
    const resSlaBox = document.getElementById("res-sla-box");
    const resSlaText = document.getElementById("res-sla-text");
    
    if (report.status === "RESOLVED") {
      resSlaBox.style.color = "var(--success-color)";
      resSlaText.textContent = "Resolved";
    } else if (report.status === "ESCALATED" || hoursElapsed > report.slaHours) {
      resSlaBox.style.color = "var(--danger-color)";
      resSlaText.textContent = "SLA Breached / Escalated";
    } else {
      resSlaBox.style.color = "var(--warning-color)";
      resSlaText.textContent = `${slaRemaining}h SLA Left`;
    }

    // Timeline steps activation
    const steps = ["SUBMITTED", "UNDER_REVIEW", "ESCALATED", "RESOLVED"];
    const currentIdx = steps.indexOf(report.status);

    const stepSubmitted = document.getElementById("step-submitted");
    const stepReview = document.getElementById("step-review");
    const stepEscalated = document.getElementById("step-escalated");
    const stepResolved = document.getElementById("step-resolved");

    const dateSubmitted = document.getElementById("date-submitted");
    const dateReview = document.getElementById("date-review");
    const dateEscalated = document.getElementById("date-escalated");
    const dateResolved = document.getElementById("date-resolved");

    // Reset styles
    [stepSubmitted, stepReview, stepEscalated, stepResolved].forEach(s => s.classList.remove("active"));
    [dateSubmitted, dateReview, dateEscalated, dateResolved].forEach(d => d.textContent = "-");

    // Fill steps
    if (currentIdx >= 0) {
      stepSubmitted.classList.add("active");
      dateSubmitted.textContent = new Date(report.createdAt).toLocaleString();
    }
    if (currentIdx >= 1) {
      stepReview.classList.add("active");
      // Simulate review start time shortly after submission for display purpose
      dateReview.textContent = new Date(new Date(report.createdAt).getTime() + 10 * 60 * 1000).toLocaleString();
    }
    
    // Escalated step logic
    if (report.status === "ESCALATED") {
      stepEscalated.classList.add("active");
      dateEscalated.textContent = new Date().toLocaleString();
    }

    // Resolved step logic
    if (report.status === "RESOLVED" && report.resolvedAt) {
      // If it was resolved, it might not have been escalated
      stepResolved.classList.add("active");
      stepResolved.classList.add("resolved");
      dateResolved.textContent = new Date(report.resolvedAt).toLocaleString();
    } else {
      stepResolved.classList.remove("resolved");
    }
  }

  // --- FLOATING CHATBOT AI PANEL ---
  chatbotToggleBtn.addEventListener("click", () => {
    chatbotBox.classList.toggle("hidden");
    const openIcon = chatbotToggleBtn.querySelector(".chat-open-icon");
    const closeIcon = chatbotToggleBtn.querySelector(".chat-close-icon");
    
    openIcon.classList.toggle("hidden");
    closeIcon.classList.toggle("hidden");
    chatbotToggleBtn.querySelector(".chat-notification-dot").classList.add("hidden");
  });

  chatTextInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleTextChatSubmit();
  });
  chatSendBtn.addEventListener("click", handleTextChatSubmit);

  async function handleTextChatSubmit() {
    const text = chatTextInput.value.trim();
    if (!text) return;

    chatTextInput.value = "";
    appendChatMessage(text, "user");

    const typingMsg = appendChatMessage(`<i data-lucide="loader" class="rotate-animation"></i> AI is thinking...`, "bot");
    lucide.createIcons();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      typingMsg.remove();

      if (data.success) {
        appendChatMessage(data.reply, "bot");
        handleChatbotSuggestions(data.suggestedFields);
      } else {
        appendChatMessage(`Sorry, I encountered an error: ${data.error}`, "bot");
      }
    } catch (err) {
      console.error(err);
      typingMsg.remove();
      appendChatMessage(`Connection failure. Is the backend running?`, "bot");
    }
  }

  function appendChatMessage(message, sender) {
    const msg = document.createElement("div");
    msg.className = `chat-msg ${sender}`;
    msg.innerHTML = `<div class="msg-bubble">${message}</div>`;
    chatMessagesContainer.appendChild(msg);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    return msg;
  }

  function handleChatbotSuggestions(suggestions) {
    if (suggestions && (suggestions.category || suggestions.region)) {
      state.lastChatSuggestion = suggestions;
      chatSuggestionBanner.classList.remove("hidden");
    }
  }

  autofillApplyBtn.addEventListener("click", () => {
    if (state.lastChatSuggestion) {
      const sug = state.lastChatSuggestion;
      if (sug.category) {
        document.getElementById("grievance-category").value = sug.category.toLowerCase();
      }
      if (sug.region) {
        document.getElementById("grievance-region").value = sug.region;
      }
      
      // Auto switch view to filing subtab
      subTabs.forEach(t => t.classList.remove("active"));
      subTabPanels.forEach(p => p.classList.remove("active"));
      
      document.querySelector('[data-subtab="grievance-report-tab"]').classList.add("active");
      document.getElementById("grievance-report-tab").classList.add("active");
      state.activeSubTab = "grievance-report-tab";

      chatSuggestionBanner.classList.add("hidden");
      alert("Autofilled Grievance Category and Region successfully!");
    }
  });

  autofillCloseBtn.addEventListener("click", () => {
    chatSuggestionBanner.classList.add("hidden");
    state.lastChatSuggestion = null;
  });

  // --- AUDIO VOICE RECORDING (Gemini Transcribe integration) ---
  chatVoiceBtn.addEventListener("mousedown", startVoiceRecording);
  chatVoiceBtn.addEventListener("mouseup", stopVoiceRecording);
  chatVoiceBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startVoiceRecording();
  });
  chatVoiceBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    stopVoiceRecording();
  });

  async function startVoiceRecording() {
    if (state.isRecording) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];
      state.mediaRecorder = new MediaRecorder(stream);
      
      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };

      state.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(state.audioChunks, { type: "audio/webm" });
        await uploadVoiceBlob(audioBlob);
      };

      state.mediaRecorder.start();
      state.isRecording = true;
      chatVoiceBtn.classList.add("recording");
      micIcon.setAttribute("data-lucide", "square");
      chatTextInput.placeholder = "Listening...";
      lucide.createIcons();
    } catch (err) {
      console.error(err);
      alert("Microphone permission denied or audio device not found.");
    }
  }

  function stopVoiceRecording() {
    if (!state.isRecording) return;
    
    state.mediaRecorder.stop();
    state.isRecording = false;
    chatVoiceBtn.classList.remove("recording");
    micIcon.setAttribute("data-lucide", "mic");
    chatTextInput.placeholder = "Type your query here...";
    lucide.createIcons();

    // Stop tracking tracks to release mic
    state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }

  async function uploadVoiceBlob(blob) {
    const typingMsg = appendChatMessage(`<i data-lucide="loader" class="rotate-animation"></i> Transcribing voice input...`, "bot");
    lucide.createIcons();

    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");
    formData.append("languageCode", "en");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      typingMsg.remove();

      if (data.success) {
        if (data.transcript) {
          appendChatMessage(`🎙️ <em>"${data.transcript}"</em>`, "user");
        }
        appendChatMessage(data.reply, "bot");
        handleChatbotSuggestions(data.suggestedFields);
      } else {
        appendChatMessage(`Sorry, I couldn't transcribe your voice: ${data.error}`, "bot");
      }
    } catch (err) {
      console.error(err);
      typingMsg.remove();
      appendChatMessage(`Connection failed while uploading voice note.`, "bot");
    }
  }

  // --- MUNICIPAL OFFICER LOGIN ---
  adminLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.add("hidden");

    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        state.jwtToken = data.token;
        state.adminUser = data.user;
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("admin_user", JSON.stringify(data.user));
        
        showAdminDashboard();
      } else {
        loginError.textContent = data.error || "Login failed. Invalid username or password.";
        loginError.classList.remove("hidden");
      }
    } catch (err) {
      console.error(err);
      loginError.textContent = "Error authenticating. Is the backend running?";
      loginError.classList.remove("hidden");
    }
  });

  function checkAdminAuthState() {
    if (state.jwtToken) {
      showAdminDashboard();
    } else {
      adminLoginBox.classList.remove("hidden");
      adminDashboardView.classList.add("hidden");
    }
  }

  function showAdminDashboard() {
    adminLoginBox.classList.add("hidden");
    adminDashboardView.classList.remove("hidden");
    loadDashboardData();
  }

  // --- LOAD OFFICER DASHBOARD DATA & ANALYTICS ---
  async function loadDashboardData() {
    try {
      const headers = { "Authorization": `Bearer ${state.jwtToken}` };
      
      // Fetch stats
      const statsRes = await fetch("/api/admin/analytics", { headers });
      const statsData = await statsRes.json();

      if (statsData.success) {
        renderDashboardStats(statsData.analytics);
      }

      // Fetch reports queue
      await loadGrievancesQueue();
    } catch (err) {
      console.error("Dashboard load failed", err);
      // If JWT expired
      handleAdminLogout();
    }
  }

  function renderDashboardStats(analytics) {
    document.getElementById("stat-total-reports").textContent = analytics.totalReports;
    document.getElementById("stat-active-reports").textContent = analytics.activeCount;
    document.getElementById("stat-resolved-reports").textContent = analytics.resolvedCount;
    document.getElementById("stat-avg-sla").textContent = `${analytics.averageResolutionTimeHours.toFixed(1)} hrs`;
    
    // Render distributions
    renderDistributionChart("region-bar-chart", analytics.reportsByRegion);
    renderDistributionChart("uptake-bar-chart", analytics.schemeUptakeByRegion);
  }

  function renderDistributionChart(elementId, dataset) {
    const container = document.getElementById(elementId);
    container.innerHTML = "";

    const entries = Object.entries(dataset);
    if (entries.length === 0) {
      container.innerHTML = `<div class="text-muted text-center py-2">No historical metrics.</div>`;
      return;
    }

    const maxVal = Math.max(...entries.map(([_, v]) => v)) || 1;

    entries.forEach(([label, value]) => {
      const percentage = (value / maxVal) * 100;
      const row = document.createElement("div");
      row.className = "chart-bar-row";
      row.innerHTML = `
        <div class="chart-bar-label" title="${label}">${label}</div>
        <div class="chart-bar-container">
          <div class="chart-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="chart-bar-val">${value}</div>
      `;
      container.appendChild(row);
    });
  }

  async function loadGrievancesQueue() {
    const headers = { "Authorization": `Bearer ${state.jwtToken}` };
    const status = filterStatus.value;
    const category = filterCategory.value;
    
    let url = "/api/admin/reports";
    const params = [];
    if (status) params.push(`status=${status}`);
    if (category) params.push(`category=${category}`);
    if (params.length > 0) url += `?${params.join("&")}`;

    try {
      const res = await fetch(url, { headers });
      const data = await res.json();
      
      if (data.success) {
        renderGrievanceTable(data.reports);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function renderGrievanceTable(reports) {
    const tbody = document.getElementById("grievance-table-body");
    tbody.innerHTML = "";

    if (reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No grievances in queue matching current criteria.</td></tr>`;
      return;
    }

    reports.forEach(report => {
      const tr = document.createElement("tr");
      
      // SLA logic
      const hoursElapsed = (new Date().getTime() - new Date(report.createdAt).getTime()) / (1000 * 60 * 60);
      const isBreached = hoursElapsed > report.slaHours;
      const slaClass = isBreached ? "overdue" : "pending";
      const slaLabel = report.status === "RESOLVED" 
        ? "Resolved" 
        : (isBreached ? "BREACHED" : `${Math.round(report.slaHours - hoursElapsed)}h left`);

      let actionHTML = "";
      if (report.status === "SUBMITTED") {
        actionHTML = `<button class="btn btn-secondary btn-sm" onclick="updateGrievanceStatus('${report.id}', 'UNDER_REVIEW')">Start Review</button>`;
      } else if (report.status === "UNDER_REVIEW" || report.status === "ESCALATED") {
        actionHTML = `<button class="btn btn-primary btn-sm" onclick="updateGrievanceStatus('${report.id}', 'RESOLVED')">Resolve</button>`;
      } else {
        actionHTML = `<span class="text-muted">Completed</span>`;
      }

      tr.innerHTML = `
        <td><strong class="tracking-code-badge" style="font-size:0.75rem;">${report.trackingId}</strong></td>
        <td style="text-transform: capitalize;">${report.category}</td>
        <td>${report.region}</td>
        <td title="${report.description}" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${report.description}</td>
        <td><span class="sla-status-label ${slaClass}">${slaLabel}</span></td>
        <td>${actionHTML}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Bind update function globally so inline onclick events resolve
  window.updateGrievanceStatus = async function(id, nextStatus) {
    try {
      const res = await fetch(`/api/admin/reports/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${state.jwtToken}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        loadDashboardData();
      } else {
        alert(`Failed to update status: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error updating status.");
    }
  };

  filterStatus.addEventListener("change", loadGrievancesQueue);
  filterCategory.addEventListener("change", loadGrievancesQueue);

  // --- RETRAIN ML MODEL ---
  retrainBtn.addEventListener("click", async () => {
    retrainBtn.innerHTML = `<i data-lucide="refresh-cw" class="rotate-animation"></i> Retraining...`;
    lucide.createIcons();

    try {
      const res = await fetch("/api/admin/retrain-escalation-model", {
        method: "POST",
        headers: { "Authorization": `Bearer ${state.jwtToken}` }
      });
      const data = await res.json();

      if (data.success) {
        document.getElementById("model-accuracy").textContent = `${(data.accuracy * 100).toFixed(1)}%`;
        document.getElementById("model-updated").textContent = "Just Now";
        alert(`Model retrained successfully! Accuracy: ${(data.accuracy * 100).toFixed(1)}%`);
      } else {
        alert(`Retraining failed: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error retraining model.");
    } finally {
      retrainBtn.innerHTML = `<i data-lucide="refresh-cw"></i> Retrain Model`;
      lucide.createIcons();
    }
  });

  function handleAdminLogout() {
    state.jwtToken = null;
    state.adminUser = null;
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    checkAdminAuthState();
  }
});
