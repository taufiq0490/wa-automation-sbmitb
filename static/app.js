// Multi-Prodi Configuration & Data
const PRODI_DATA = {
    'MBAJ': { name: 'MBA ITB Kampus Jakarta', sheet: 'MCP MBAJ', icon: '🎓', defaultLocation: 'SBM ITB Kampus Jakarta', defaultPin: '1234' },
    'MBAB': { name: 'MBA ITB Kampus Bandung', sheet: 'MCP MBAB', icon: '🏛️', defaultLocation: 'SBM ITB Kampus Bandung', defaultPin: '1234' },
    'SW':   { name: 'Sarjana Kewirausahaan', sheet: 'MCP SW', icon: '🚀', defaultLocation: 'SBM ITB Kampus Ganesha / Jatinangor', defaultPin: '1234' },
    'SM':   { name: 'Sarjana Manajemen', sheet: 'MCP SM', icon: '💼', defaultLocation: 'SBM ITB Kampus Utama', defaultPin: '1234' },
    'MSM':  { name: 'Master of Science in Management', sheet: 'MCP MSM', icon: '🔬', defaultLocation: 'SBM ITB Kampus Bandung', defaultPin: '1234' },
    'DSM':  { name: 'Doctor of Science in Management', sheet: 'MCP DSM', icon: '📜', defaultLocation: 'SBM ITB Kampus Jakarta / Bandung', defaultPin: '1234' }
};

// Global State
let currentProdi = 'MBAJ';
let pendingProdiUnlock = null;
let currentFilterType = 'weekend';
let currentGlobalLang = 'id';
let availableWeeks = [];
let selectedWeek = null;
let currentLecturers = [];
let activePhoneEditLecturer = null;
let isWaLoggedIn = false;
let isBatchSending = false;
let activeTemplateLang = 'id';
let currentTemplates = { id: {}, en: {} };
let defaultTemplates = { id: {}, en: {} };

// PIN Security Helpers
function getProdiPin(prodi) {
    return localStorage.getItem('prodi_pin_' + prodi) || PRODI_DATA[prodi]?.defaultPin || '1234';
}

function isProdiUnlocked(prodi) {
    return sessionStorage.getItem('prodi_unlocked_' + prodi) === 'true';
}

function setProdiUnlocked(prodi, val = true) {
    if (val) {
        sessionStorage.setItem('prodi_unlocked_' + prodi, 'true');
    } else {
        sessionStorage.removeItem('prodi_unlocked_' + prodi);
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    setupPinEventListeners();
    setupBroadcastEventListeners();
    switchMainTab('landing'); // Default view is SBM ITB Landing Page!
    fetchSavedBroadcastTemplates();
    fetchBroadcastLogs();
    checkWaStatus();
    setInterval(checkWaStatus, 15000); // Periodic status check
}

function updateLandingPageLockBadges() {
    Object.keys(PRODI_DATA).forEach(code => {
        const badge = document.getElementById(`badgeLock_${code}`);
        if (badge) {
            const unlocked = isProdiUnlocked(code);
            badge.className = `prodi-lock-badge ${unlocked ? 'unlocked' : 'locked'}`;
            badge.textContent = unlocked ? '🔓 Akses Terbuka' : '🔒 Perlu PIN';
        }
    });
}

function switchProdiTab(prodiCode) {
    if (!PRODI_DATA[prodiCode]) return;
    
    // Check if unlocked
    if (!isProdiUnlocked(prodiCode)) {
        openPinVerifyModal(prodiCode);
        return;
    }
    
    activateProdi(prodiCode);
}

function activateProdi(prodiCode) {
    currentProdi = prodiCode;
    const cfg = PRODI_DATA[prodiCode];
    
    // Switch view to reminder dashboard
    switchMainTab('reminder');
    
    // Update active class on prodi tabs
    document.querySelectorAll('#prodiTabsContainer .nav-tab-link').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.prodi === prodiCode);
    });
    
    // Update Prodi Sub-banner
    const iconEl = document.getElementById('prodiBadgeIcon');
    const titleEl = document.getElementById('prodiTitleText');
    const sheetEl = document.getElementById('prodiSheetSource');
    const pinPill = document.getElementById('pinStatusPill');
    const pinText = document.getElementById('pinStatusText');
    
    if (iconEl) iconEl.textContent = cfg.icon;
    if (titleEl) titleEl.textContent = cfg.name;
    if (sheetEl) sheetEl.innerHTML = `Data Realtime: Sheet <strong>${cfg.sheet}</strong>`;
    if (pinPill) {
        pinPill.className = 'pin-status-pill unlocked';
        if (pinText) pinText.textContent = `Akses PIC ${prodiCode} Terbuka`;
    }
    
    // Fetch meta & schedules for this prodi
    loadMetadata();
}

function openPinVerifyModal(prodiCode) {
    pendingProdiUnlock = prodiCode;
    const cfg = PRODI_DATA[prodiCode];
    
    const iconEl = document.getElementById('pinProdiIcon');
    const nameEl = document.getElementById('pinProdiName');
    const input = document.getElementById('inputVerifyPin');
    const errEl = document.getElementById('pinErrorMessage');
    
    if (iconEl) iconEl.textContent = cfg.icon;
    if (nameEl) nameEl.textContent = cfg.name;
    if (input) input.value = '';
    if (errEl) errEl.style.display = 'none';
    
    document.getElementById('pinVerifyModal').style.display = 'flex';
    setTimeout(() => { if (input) input.focus(); }, 150);
}

function closePinVerifyModal() {
    document.getElementById('pinVerifyModal').style.display = 'none';
    pendingProdiUnlock = null;
}

async function submitPinVerify() {
    if (!pendingProdiUnlock) return;
    const prodi = pendingProdiUnlock;
    const input = document.getElementById('inputVerifyPin');
    const errEl = document.getElementById('pinErrorMessage');
    const enteredPin = (input?.value || '').trim();
    
    if (!enteredPin) {
        if (errEl) {
            errEl.textContent = '⚠️ Masukkan PIN akses prodi.';
            errEl.style.display = 'block';
        }
        return;
    }
    
    let isValid = false;
    
    // 1. Try server verification if available
    try {
        const resp = await fetch('/api/pins/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prodi, pin: enteredPin })
        });
        if (resp.ok) {
            const data = await resp.json();
            isValid = data.valid;
        } else {
            const expected = getProdiPin(prodi);
            isValid = (enteredPin === expected);
        }
    } catch (e) {
        const expected = getProdiPin(prodi);
        isValid = (enteredPin === expected);
    }
    
    if (isValid) {
        setProdiUnlocked(prodi, true);
        closePinVerifyModal();
        activateProdi(prodi);
        showToast(`🔓 Akses PIC untuk ${PRODI_DATA[prodi].name} berhasil dibuka!`);
    } else {
        if (errEl) {
            errEl.textContent = '❌ PIN yang Anda masukkan salah. Coba lagi atau gunakan default: 1234';
            errEl.style.display = 'block';
        }
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

function openChangePinModal() {
    const cfg = PRODI_DATA[currentProdi];
    const iconEl = document.getElementById('pinChangeProdiIcon');
    const nameEl = document.getElementById('pinChangeProdiName');
    const oldInp = document.getElementById('inputOldPin');
    const newInp = document.getElementById('inputNewPin');
    const confInp = document.getElementById('inputConfirmPin');
    const errEl = document.getElementById('pinChangeErrorMessage');
    
    if (iconEl) iconEl.textContent = cfg.icon;
    if (nameEl) nameEl.textContent = cfg.name;
    if (oldInp) oldInp.value = '';
    if (newInp) newInp.value = '';
    if (confInp) confInp.value = '';
    if (errEl) errEl.style.display = 'none';
    
    document.getElementById('pinChangeModal').style.display = 'flex';
    setTimeout(() => { if (oldInp) oldInp.focus(); }, 150);
}

function closeChangePinModal() {
    document.getElementById('pinChangeModal').style.display = 'none';
}

async function submitChangePin() {
    const oldPin = (document.getElementById('inputOldPin')?.value || '').trim();
    const newPin = (document.getElementById('inputNewPin')?.value || '').trim();
    const confPin = (document.getElementById('inputConfirmPin')?.value || '').trim();
    const errEl = document.getElementById('pinChangeErrorMessage');
    
    if (!oldPin) {
        showPinChangeError('⚠️ Masukkan PIN saat ini.');
        return;
    }
    if (!newPin || newPin.length < 4) {
        showPinChangeError('⚠️ PIN baru minimal 4 karakter / angka.');
        return;
    }
    if (newPin !== confPin) {
        showPinChangeError('⚠️ Konfirmasi PIN baru tidak cocok.');
        return;
    }
    
    const currentExpected = getProdiPin(currentProdi);
    if (oldPin !== currentExpected) {
        showPinChangeError('❌ PIN lama yang Anda masukkan salah.');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('prodi_pin_' + currentProdi, newPin);
    
    // Also try syncing to backend
    try {
        await fetch('/api/pins/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prodi: currentProdi, old_pin: oldPin, new_pin: newPin })
        });
    } catch (e) {}
    
    closeChangePinModal();
    showToast(`✅ PIN untuk ${PRODI_DATA[currentProdi].name} berhasil diperbarui!`);
}

function showPinChangeError(msg) {
    const errEl = document.getElementById('pinChangeErrorMessage');
    if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }
}

function lockCurrentProdi() {
    setProdiUnlocked(currentProdi, false);
    
    // Clear displayed schedules from view for security
    currentLecturers = [];
    const list = document.getElementById('lecturersList');
    if (list) list.innerHTML = '';
    
    showToast(`🔒 Sesi untuk ${PRODI_DATA[currentProdi].name} berhasil dikunci dan sesi telah diamankan.`);
    
    // Return to Landing Page
    switchMainTab('landing');
}

function setupPinEventListeners() {
    // PIN Verify Modal
    const btnCloseVerify = document.getElementById('btnClosePinVerifyModal');
    if (btnCloseVerify) btnCloseVerify.addEventListener('click', closePinVerifyModal);
    
    const btnCancelVerify = document.getElementById('btnCancelPinVerify');
    if (btnCancelVerify) btnCancelVerify.addEventListener('click', closePinVerifyModal);
    
    const btnSubmitVerify = document.getElementById('btnSubmitPinVerify');
    if (btnSubmitVerify) btnSubmitVerify.addEventListener('click', submitPinVerify);
    
    const inputVerify = document.getElementById('inputVerifyPin');
    if (inputVerify) {
        inputVerify.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitPinVerify();
        });
    }
    
    // Change PIN Modal
    const btnOpenChange = document.getElementById('btnOpenChangePinModal');
    if (btnOpenChange) btnOpenChange.addEventListener('click', openChangePinModal);
    
    const btnCloseChange = document.getElementById('btnClosePinChangeModal');
    if (btnCloseChange) btnCloseChange.addEventListener('click', closeChangePinModal);
    
    const btnCancelChange = document.getElementById('btnCancelPinChange');
    if (btnCancelChange) btnCancelChange.addEventListener('click', closeChangePinModal);
    
    const btnSubmitChange = document.getElementById('btnSubmitPinChange');
    if (btnSubmitChange) btnSubmitChange.addEventListener('click', submitChangePin);
    
    // Lock tab button
    const btnLock = document.getElementById('btnLockCurrentProdi');
    if (btnLock) btnLock.addEventListener('click', lockCurrentProdi);
}

function setupEventListeners() {
    // Filter Type Buttons (Weekend / Weekday / All)
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilterType = btn.dataset.type;
            
            if (selectedWeek) {
                applyWeekFilterDates(selectedWeek, currentFilterType);
            }
            fetchSchedules();
        });
    });

    // Global Language Selector Buttons (ID / EN)
    document.querySelectorAll('.lang-pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.lang-pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentGlobalLang = btn.dataset.lang;
            fetchSchedules();
        });
    });

    // Week Selector Change
    const selWeek = document.getElementById('selectWeek');
    if (selWeek) {
        selWeek.addEventListener('change', (e) => {
            const weekNum = parseInt(e.target.value);
            const found = availableWeeks.find(w => w.week_number === weekNum);
            if (found) {
                selectedWeek = found;
                applyWeekFilterDates(found, currentFilterType);
                fetchSchedules();
            }
        });
    }

    // Manual Date inputs
    const startD = document.getElementById('startDate');
    if (startD) startD.addEventListener('change', () => fetchSchedules());
    const endD = document.getElementById('endDate');
    if (endD) endD.addEventListener('change', () => fetchSchedules());

    // Search input
    let searchTimeout = null;
    const searchInp = document.getElementById('searchInput');
    if (searchInp) {
        searchInp.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => fetchSchedules(), 300);
        });
    }

    // Status Radio Filters (All, Pending, Sent)
    document.querySelectorAll('input[name="statusFilter"]').forEach(radio => {
        radio.addEventListener('change', () => renderLecturerCards());
    });

    // Refresh Sheet Button
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            btnRefresh.disabled = true;
            btnRefresh.innerHTML = `
                <div class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin: 0;"></div>
                <span>Menyinkronkan...</span>
            `;
            try {
                const resp = await fetch(`/api/refresh?prodi=${currentProdi}`, { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prodi: currentProdi })
                });
                const data = await resp.json();
                showToast(`✅ Berhasil menyinkronkan data ${PRODI_DATA[currentProdi].name}!`);
                const syncTs = document.getElementById('syncTimestamp');
                if (syncTs) syncTs.textContent = `Diperbarui: ${data.last_fetched}`;
                availableWeeks = data.weeks || [];
                populateWeekDropdown();
                fetchSchedules();
            } catch (err) {
                showToast('❌ Gagal menyinkronkan Google Sheets. Cek koneksi internet Anda.');
            } finally {
                btnRefresh.disabled = false;
                btnRefresh.innerHTML = `
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                    <span>Sinkronisasi Sheet</span>
                `;
            }
        });
    }

    // Connect / Scan QR WhatsApp Button
    const btnConnect = document.getElementById('btnConnectWa');
    if (btnConnect) {
        btnConnect.addEventListener('click', async () => {
            // First, try to connect via local backend
            try {
                const resp = await fetch('/api/wa/connect', { method: 'POST' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                updateWaStatusUI(data);
                showToast('🔄 Membuka WhatsApp Web, silakan scan QR code...');
            } catch (err) {
                // No local backend — show WA Web guide
                openWaWebGuideModal();
            }
        });
    }

    // Batch Auto-Send All Button
    const btnBatch = document.getElementById('btnSendAllBatch');
    if (btnBatch) btnBatch.addEventListener('click', startBatchAutoSend);

    // Phone modal actions
    const btnClosePhone = document.getElementById('btnClosePhoneModal');
    if (btnClosePhone) btnClosePhone.addEventListener('click', closePhoneModal);
    const btnCancelPhone = document.getElementById('btnCancelPhone');
    if (btnCancelPhone) btnCancelPhone.addEventListener('click', closePhoneModal);
    const btnSavePhone = document.getElementById('btnSavePhone');
    if (btnSavePhone) btnSavePhone.addEventListener('click', savePhoneModal);

    // Master Template Modal Event Listeners
    const btnOpenTpl = document.getElementById('btnOpenTemplateModal');
    if (btnOpenTpl) btnOpenTpl.addEventListener('click', openTemplateModal);
    
    const btnCloseTpl = document.getElementById('btnCloseTemplateModal');
    if (btnCloseTpl) btnCloseTpl.addEventListener('click', closeTemplateModal);

    const btnCancelTpl = document.getElementById('btnCancelTemplate');
    if (btnCancelTpl) btnCancelTpl.addEventListener('click', closeTemplateModal);

    const btnSaveTpl = document.getElementById('btnSaveTemplate');
    if (btnSaveTpl) btnSaveTpl.addEventListener('click', saveTemplateForm);

    const btnResetTpl = document.getElementById('btnResetTemplate');
    if (btnResetTpl) btnResetTpl.addEventListener('click', resetTemplateForm);

    const tabTplId = document.getElementById('tplTabId');
    if (tabTplId) tabTplId.addEventListener('click', () => switchTemplateLang('id'));
    
    const tabTplEn = document.getElementById('tplTabEn');
    if (tabTplEn) tabTplEn.addEventListener('click', () => switchTemplateLang('en'));

    // Real-time live preview update on input typing
    const tplInputIds = [
        'inputTplIntro', 'inputTplClosing', 'inputLblProgram', 'inputLblCourse',
        'inputLblDate', 'inputLblTime', 'inputLblRoom', 'inputLblGuest',
        'inputLblMentor', 'inputLblRemarks', 'inputTplExamAskAll'
    ];
    tplInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateTemplatePreview);
        }
    });
}

function openWaWebGuideModal() {
    // Create a simple informational modal explaining WA Web 1-click approach
    let existing = document.getElementById('waGuideModal');
    if (!existing) {
        const modalHtml = `
        <div id="waGuideModal" style="
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(0,0,0,0.55); display: flex;
            align-items: center; justify-content: center; padding: 1rem;
        ">
            <div style="
                background: #ffffff; border-radius: 20px;
                padding: 2rem; max-width: 520px; width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                font-family: 'Plus Jakarta Sans', sans-serif;
            ">
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <div style="font-size: 3rem; margin-bottom: 0.5rem;">📱</div>
                    <h2 style="font-size: 1.3rem; font-weight: 800; color: #0b2545; margin-bottom: 0.5rem;">
                        Cara Kirim WhatsApp di Dashboard Ini
                    </h2>
                    <p style="font-size: 0.88rem; color: #64748b; line-height: 1.6;">
                        Dashboard ini berjalan secara <strong>online di Netlify</strong>. Pengiriman WhatsApp dilakukan langsung melalui <strong>WhatsApp Web</strong> di browser Anda, bukan melalui server otomatis.
                    </p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1.5rem;">
                    <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 0.85rem 1rem;">
                        <span style="font-size: 1.3rem;">1️⃣</span>
                        <div>
                            <strong style="color: #0369a1;">Buka Tab Prodi Anda</strong>
                            <p style="font-size: 0.82rem; color: #475569; margin-top: 0.2rem;">Pilih Program Studi (misal: MBA Jakarta), masukkan PIN, lalu pilih minggu kuliah.</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 0.85rem 1rem;">
                        <span style="font-size: 1.3rem;">2️⃣</span>
                        <div>
                            <strong style="color: #15803d;">Klik Tombol Hijau "Buka WA Web"</strong>
                            <p style="font-size: 0.82rem; color: #475569; margin-top: 0.2rem;">Di setiap kartu dosen, klik tombol <strong style="color: #25d366;">📱 Buka WA Web</strong>. Pesan sudah otomatis terisi — tinggal tekan <strong>Send</strong> di WhatsApp Web.</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: #fefce8; border: 1px solid #fde68a; border-radius: 12px; padding: 0.85rem 1rem;">
                        <span style="font-size: 1.3rem;">3️⃣</span>
                        <div>
                            <strong style="color: #92400e;">Atau Klik "Salin Pesan" → Paste di WA</strong>
                            <p style="font-size: 0.82rem; color: #475569; margin-top: 0.2rem;">Gunakan tombol <strong>📋 Salin</strong> untuk menyalin pesan, lalu paste langsung ke chat WhatsApp dosen yang bersangkutan.</p>
                        </div>
                    </div>
                </div>

                <div style="background: #f8fafc; border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 1.5rem; font-size: 0.82rem; color: #475569;">
                    💡 <strong>Ingin Auto-Send Otomatis?</strong> Jalankan <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">python app.py</code> di komputer lokal, lalu akses dashboard melalui <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">localhost:5000</code> untuk fitur auto-send penuh.
                </div>

                <div style="display: flex; gap: 0.75rem;">
                    <button onclick="document.getElementById('waGuideModal').remove(); window.open('https://web.whatsapp.com', '_blank');" style="
                        flex: 1; background: #25d366; color: #fff;
                        border: none; padding: 0.75rem 1rem; border-radius: 10px;
                        font-weight: 700; font-size: 0.88rem; cursor: pointer;
                    ">📱 Buka WhatsApp Web</button>
                    <button onclick="document.getElementById('waGuideModal').remove();" style="
                        flex: 0; background: #f1f5f9; color: #475569;
                        border: 1px solid #e2e8f0; padding: 0.75rem 1.25rem;
                        border-radius: 10px; font-weight: 600; font-size: 0.88rem; cursor: pointer;
                    ">Tutup</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } else {
        existing.style.display = 'flex';
    }
}

async function checkWaStatus() {
    try {
        const resp = await fetch('/api/wa/status');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        updateWaStatusUI(data);
    } catch (err) {
        // No local backend (Netlify / static mode) — show informational badge
        updateWaStatusUI({ logged_in: false, status: 'netlify_mode' });
    }
}

function updateWaStatusUI(data) {
    const dot = document.getElementById('waStatusDot');
    const text = document.getElementById('waStatusText');
    const btnConnect = document.getElementById('btnConnectWa');

    isWaLoggedIn = data && data.logged_in;

    if (isWaLoggedIn) {
        if (dot) dot.className = 'status-dot success';
        if (text) text.textContent = 'WhatsApp Terhubung (Auto-Send Siap)';
        if (btnConnect) btnConnect.style.display = 'none';
    } else if (data && data.status === 'initializing') {
        if (dot) dot.className = 'status-dot warning';
        if (text) text.textContent = 'Memulai Service WhatsApp...';
        if (btnConnect) btnConnect.style.display = 'none';
    } else if (data && data.status === 'netlify_mode') {
        // Running on Netlify / static — WA is sent via direct wa.me link per card
        if (dot) dot.className = 'status-dot success';
        if (text) text.textContent = 'Mode Online · Kirim via WA Web 1-Klik';
        if (btnConnect) btnConnect.style.display = 'none';
    } else {
        if (dot) dot.className = 'status-dot warning';
        if (text) text.textContent = 'Server Lokal Belum Aktif';
        if (btnConnect) {
            btnConnect.style.display = 'inline-block';
            btnConnect.textContent = 'Jalankan Server Lokal';
        }
    }
}

async function loadMetadata() {
    try {
        const resp = await fetch(`/api/meta?prodi=${currentProdi}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        
        document.getElementById('syncTimestamp').textContent = data.last_fetched 
            ? `Terakhir sinkron: ${data.last_fetched}`
            : 'Connected to Google Sheets';
            
        availableWeeks = data.weeks || [];
        populateWeekDropdown();

        // Smart Auto-Selection based on current reminder day
        currentFilterType = data.recommended_type || 'weekend';
        
        // Update filter button active class in UI
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.type === currentFilterType);
        });

        const recWeekNum = data.recommended_week || 1;
        const found = availableWeeks.find(w => w.week_number === recWeekNum);

        if (found) {
            selectedWeek = found;
            document.getElementById('selectWeek').value = found.week_number;
            applyWeekFilterDates(found, currentFilterType);
        } else if (availableWeeks.length > 0) {
            selectedWeek = availableWeeks[0];
            document.getElementById('selectWeek').value = selectedWeek.week_number;
            applyWeekFilterDates(selectedWeek, currentFilterType);
        }

        fetchSchedules();
    } catch (err) {
        console.warn('Backend API unavailable, switching to Netlify client-side Google Sheets mode:', err);
        await loadClientSideMetadata(currentProdi);
    }
}

function populateWeekDropdown() {
    const select = document.getElementById('selectWeek');
    select.innerHTML = '';
    
    if (availableWeeks.length === 0) {
        select.innerHTML = '<option value="">Tidak ada jadwal perkuliahan</option>';
        return;
    }

    availableWeeks.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.week_number;
        opt.textContent = w.label;
        select.appendChild(opt);
    });
}

function applyWeekFilterDates(week, filterType) {
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');

    if (filterType === 'weekend') {
        startInput.value = week.weekend_start;
        endInput.value = week.weekend_end;
    } else if (filterType === 'weekday') {
        startInput.value = week.weekday_start;
        endInput.value = week.weekday_end;
    } else {
        startInput.value = week.start_date;
        endInput.value = week.end_date;
    }
}

async function fetchSchedules() {
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');
    const list = document.getElementById('lecturersList');
    
    loading.style.display = 'block';
    empty.style.display = 'none';
    list.innerHTML = '';

    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const search = document.getElementById('searchInput').value;

    const query = new URLSearchParams({
        prodi: currentProdi,
        type: currentFilterType,
        start_date: startDate,
        end_date: endDate,
        search: search,
        lang: currentGlobalLang
    });

    try {
        const resp = await fetch(`/api/schedules?${query.toString()}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        
        currentLecturers = data.lecturers || [];
        
        updateMetrics(data);
        renderLecturerCards();
    } catch (err) {
        console.warn('Backend API unavailable, using client-side schedule fetcher:', err);
        await fetchClientSideSchedules();
    } finally {
        loading.style.display = 'none';
    }
}

function updateMetrics(data) {
    const totalLecturers = data.count || 0;
    const totalSessions = data.total_sessions || 0;
    
    const sentCount = currentLecturers.filter(l => l.is_sent).length;
    const missingPhoneCount = currentLecturers.filter(l => !l.phone).length;

    document.getElementById('statTotalLecturers').textContent = totalLecturers;
    document.getElementById('statTotalSessions').textContent = totalSessions;
    document.getElementById('statSentCount').textContent = `${sentCount} / ${totalLecturers}`;
    
    const pct = totalLecturers > 0 ? (sentCount / totalLecturers) * 100 : 0;
    document.getElementById('sentProgressBar').style.width = `${pct}%`;

    document.getElementById('statMissingPhone').textContent = missingPhoneCount;
    document.getElementById('statMissingFoot').textContent = missingPhoneCount > 0 
        ? `${missingPhoneCount} dosen belum punya no. WA` 
        : 'Semua kontak lengkap';
        
    document.getElementById('queueCountBadge').textContent = `${totalLecturers} Dosen Terjadwal`;
}

function renderLecturerCards() {
    const list = document.getElementById('lecturersList');
    const empty = document.getElementById('emptyState');
    list.innerHTML = '';

    const statusFilter = document.querySelector('input[name="statusFilter"]:checked').value;

    const filtered = currentLecturers.filter(l => {
        if (statusFilter === 'pending') return !l.is_sent;
        if (statusFilter === 'sent') return l.is_sent;
        return true;
    });

    if (filtered.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    filtered.forEach(lec => {
        const card = createLecturerCard(lec);
        list.appendChild(card);
    });
}

function createLecturerCard(lec) {
    const card = document.createElement('div');
    card.className = `lecturer-card ${lec.is_sent ? 'is-sent' : ''}`;
    card.dataset.lecturer = lec.lecturer;

    const avatarInitial = lec.lecturer.replace(/^(Prof\.|Dr\.|Ir\.)\s*/i, '').charAt(0).toUpperCase();

    // Build Sessions HTML
    let sessionsHtml = '';
    lec.sessions.forEach((s, idx) => {
        const isExam = s.is_exam;
        sessionsHtml += `
            <div class="session-item" data-session-id="${s.id}">
                <div class="session-top">
                    <span class="course-title">${idx + 1}. ${s.course}</span>
                    <span class="session-type-badge ${isExam ? 'exam' : 'lecture'}">
                        ${isExam ? (s.exam_type || 'Exam') : 'Lecture'}
                    </span>
                </div>
                <div class="session-details-grid">
                    <div class="detail-row">
                        <span class="detail-label">Kelas:</span>
                        <strong>${s.program} (${s.class_type})</strong>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Hari/Tgl:</span>
                        <span>${s.formatted_date}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Waktu:</span>
                        <span>${s.time} WIB</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Ruangan:</span>
                        <span>${s.room}</span>
                    </div>
                    ${s.mentors ? `
                    <div class="detail-row">
                        <span class="detail-label">Mentor:</span>
                        <span style="color: #4338ca; font-weight: 600;">👥 ${escapeHtml(s.mentors)}</span>
                    </div>
                    ` : ''}
                </div>

                <!-- Live Session Customizer (Guest Lecture, Mentor & Exam Mode) -->
                <div class="session-customizer">
                    <div class="inline-edit-group">
                        <div class="form-control">
                            <label>Catatan Guest Lecturer & Waktu (Opsional):</label>
                            <input type="text" class="small-input guest-lecture-input" 
                                placeholder="Contoh: Bpk. Budi Santoso (09.00 - 10.30 WIB)" 
                                data-session-id="${s.id}"
                                value="${escapeHtml(s.guest_lecturer || (s.remarks && s.remarks.toLowerCase().includes('guest') ? s.remarks : ''))}">
                        </div>
                        <div class="form-control">
                            <label>Mentor Pendamping (Opsional):</label>
                            <input type="text" class="small-input mentor-input" 
                                placeholder="Contoh: Kevin Sugiarto, dr. Tirta Mandira Hudhi, MBA" 
                                data-session-id="${s.id}"
                                value="${escapeHtml(s.mentors || '')}">
                        </div>
                        <div class="form-control">
                            <label>Opsi Pelaksanaan Ujian (Exam):</label>
                            <select class="small-select exam-mode-select" data-session-id="${s.id}">
                                <option value="" ${!isExam ? 'selected' : ''}>-- Konfirmasi Semua (Offline / Online / Take-Home) --</option>
                                <option value="ask_offline">❓ Tanya Khusus: Apakah Offline?</option>
                                <option value="ask_online">❓ Tanya Khusus: Apakah Online?</option>
                                <option value="ask_takehome">❓ Tanya Khusus: Apakah Take-Home?</option>
                                <option value="fixed_offline">✅ Sudah Pasti: Offline (Di Kampus)</option>
                                <option value="fixed_online">✅ Sudah Pasti: Online</option>
                                <option value="fixed_takehome">✅ Sudah Pasti: Take-Home Exam</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    // Build Card HTML
    card.innerHTML = `
        <div class="card-header-bar">
            <div class="lecturer-identity">
                <div class="lecturer-avatar">${avatarInitial}</div>
                <div class="lecturer-name-block">
                    <h3>${lec.lecturer}</h3>
                    <div class="lecturer-meta-tags">
                        ${lec.status ? `<span class="tag tag-status">${lec.status}</span>` : ''}
                        ${lec.domicile ? `<span class="tag tag-domicile">📍 ${lec.domicile}</span>` : ''}
                        <span class="tag tag-sessions-count">📋 ${lec.total_sessions} Sesi Minggu Ini</span>
                    </div>
                </div>
            </div>
            <div class="lecturer-contact">
                <div class="phone-badge ${!lec.phone ? 'missing' : ''}">
                    <span>📱 ${lec.phone || 'Nomor Belum Ada'}</span>
                    <button class="btn-icon-small btn-edit-phone" title="Edit Nomor WhatsApp" data-lecturer="${lec.lecturer}" data-phone="${lec.phone || ''}">
                        ✏️
                    </button>
                </div>
            </div>
        </div>

        <div class="card-body-grid">
            <div class="sessions-list-container">
                <h4>Detail Jadwal Mengajar:</h4>
                ${sessionsHtml}
            </div>

            <div class="message-preview-container">
                <div class="preview-header">
                    <div class="preview-header-left">
                        <span>💬 Draf Pesan WhatsApp</span>
                        <div class="card-lang-toggle" title="Pilih Bahasa Pesan untuk Dosen Ini">
                            <button type="button" class="mini-lang-btn ${lec.lang === 'id' ? 'active' : ''}" data-lang="id">🇮🇩 ID</button>
                            <button type="button" class="mini-lang-btn ${lec.lang === 'en' ? 'active' : ''}" data-lang="en">🇬🇧 EN</button>
                        </div>
                    </div>
                    <span class="edit-badge-pill">✏️ Klik teks untuk mengedit</span>
                </div>
                <div class="whatsapp-bubble" contenteditable="true" spellcheck="false" id="bubble_${lec.lecturer.replace(/\W/g, '_')}">${escapeHtml(lec.whatsapp_message)}</div>
            </div>
        </div>

        <div class="card-footer-actions">
            <label class="sent-toggle-label">
                <input type="checkbox" class="sent-toggle-checkbox" ${lec.is_sent ? 'checked' : ''} data-lecturer="${lec.lecturer}">
                <span>${lec.is_sent ? '✅ Sudah Terkirim' : 'Tandai Selesai Dikirim'}</span>
                ${lec.sent_at ? `<small style="color:#64748b; margin-left: 6px;">(${lec.sent_at})</small>` : ''}
            </label>

            <div class="action-buttons-group">
                <button class="btn btn-copy" data-lecturer="${lec.lecturer}" title="Salin Teks ke Clipboard">
                    📋 Salin
                </button>
                <button class="btn btn-manual-wa" data-lecturer="${lec.lecturer}" data-phone="${lec.phone}" ${!lec.phone ? 'disabled' : ''} title="Buka di WhatsApp Web (Menggunakan 1 tab tetap)">
                    🌐 Buka WA Web
                </button>
                <button class="btn btn-primary btn-auto-send" data-lecturer="${lec.lecturer}" data-phone="${lec.phone}" ${!lec.phone ? 'disabled' : ''} title="Kirim otomatis di background tanpa buka jendela baru">
                    ⚡ Kirim Langsung
                </button>
            </div>
        </div>
    `;

    // Attach Event Listeners to this specific card
    attachCardEvents(card, lec);

    return card;
}

function attachCardEvents(card, lec) {
    const bubbleId = `bubble_${lec.lecturer.replace(/\W/g, '_')}`;
    const bubbleElem = card.querySelector(`#${bubbleId}`);

    // Language switch per card (mini buttons ID/EN)
    card.querySelectorAll('.mini-lang-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetLang = btn.dataset.lang;
            card.querySelectorAll('.mini-lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            await saveOverride(`lang_${lec.lecturer}`, targetLang);
            lec.lang = targetLang;
            await refreshSingleCardMessage(lec);
            showToast(`🌐 Bahasa untuk ${lec.lecturer} diubah ke ${targetLang === 'id' ? 'Bahasa Indonesia' : 'English'}`);
        });
    });

    // Guest Lecture inputs
    let guestTimeout = null;
    card.querySelectorAll('.guest-lecture-input').forEach(input => {
        input.addEventListener('input', (e) => {
            clearTimeout(guestTimeout);
            guestTimeout = setTimeout(async () => {
                const sId = e.target.dataset.sessionId;
                await saveOverride(`${sId}_guest_lecture`, e.target.value.trim());
                refreshSingleCardMessage(lec);
            }, 600);
        });
    });

    // Mentor inputs
    let mentorTimeout = null;
    card.querySelectorAll('.mentor-input').forEach(input => {
        input.addEventListener('input', (e) => {
            clearTimeout(mentorTimeout);
            mentorTimeout = setTimeout(async () => {
                const sId = e.target.dataset.sessionId;
                await saveOverride(`${sId}_mentor`, e.target.value.trim());
                refreshSingleCardMessage(lec);
            }, 600);
        });
    });

    // Exam Mode Select
    card.querySelectorAll('.exam-mode-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const sId = e.target.dataset.sessionId;
            await saveOverride(`${sId}_exam_mode`, e.target.value.trim());
            refreshSingleCardMessage(lec);
        });
    });

    // Edit Phone Button
    card.querySelector('.btn-edit-phone').addEventListener('click', (e) => {
        openPhoneModal(lec.lecturer, lec.phone);
    });

    // Mark as Sent Checkbox
    const sentCheckbox = card.querySelector('.sent-toggle-checkbox');
    sentCheckbox.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        lec.is_sent = isChecked;
        
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        await fetch('/api/mark-sent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group_key: lec.lecturer,
                start_date: startDate,
                end_date: endDate,
                is_sent: isChecked
            })
        });

        card.classList.toggle('is-sent', isChecked);
        const labelSpan = card.querySelector('.sent-toggle-label span');
        labelSpan.textContent = isChecked ? '✅ Sudah Terkirim' : 'Tandai Selesai Dikirim';
        
        updateMetrics({ count: currentLecturers.length, total_sessions: document.getElementById('statTotalSessions').textContent });
    });

    // Copy Message Button
    card.querySelector('.btn-copy').addEventListener('click', () => {
        const msg = bubbleElem.textContent;
        navigator.clipboard.writeText(msg).then(() => {
            showToast(`📋 Pesan untuk ${lec.lecturer} berhasil disalin!`);
        });
    });

    // Manual WA Web Button (Re-using single tab 'whatsapp_tab')
    card.querySelector('.btn-manual-wa').addEventListener('click', () => {
        if (!lec.phone) {
            showToast('⚠️ Nomor WhatsApp belum ada. Silakan update nomor terlebih dahulu.');
            return;
        }

        const msg = bubbleElem.textContent;
        const encodedMsg = encodeURIComponent(msg);
        const waUrl = `https://web.whatsapp.com/send?phone=${lec.phone}&text=${encodedMsg}`;
        
        window.open(waUrl, 'whatsapp_tab');

        if (!sentCheckbox.checked) {
            sentCheckbox.checked = true;
            sentCheckbox.dispatchEvent(new Event('change'));
        }
    });

    // Auto-Send Direct Button (Background Sending)
    card.querySelector('.btn-auto-send').addEventListener('click', async () => {
        await sendSingleLecturerAuto(lec, card, bubbleElem, sentCheckbox);
    });
}

async function sendSingleLecturerAuto(lec, card, bubbleElem, sentCheckbox) {
    if (!lec.phone) {
        showToast('⚠️ Nomor WhatsApp belum ada. Silakan lengkapi nomor terlebih dahulu.');
        return false;
    }

    const btn = card ? card.querySelector('.btn-auto-send') : null;
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <div class="spinner" style="width: 12px; height: 12px; border-width: 2px; margin: 0;"></div>
            <span>Mengirim...</span>
        `;
    }

    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const message = bubbleElem ? bubbleElem.textContent : (lec.whatsapp_message || '');

    try {
        const resp = await fetch('/api/wa/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lecturer: lec.lecturer,
                phone: lec.phone,
                message: message,
                start_date: startDate,
                end_date: endDate
            })
        });

        const data = await resp.json();

        if (resp.ok && data.status === 'success') {
            showToast(`✅ Pesan untuk ${lec.lecturer} berhasil terkirim langsung!`);
            lec.is_sent = true;
            if (card) {
                card.classList.add('is-sent');
            }
            if (sentCheckbox) {
                sentCheckbox.checked = true;
                const labelSpan = card ? card.querySelector('.sent-toggle-label span') : null;
                if (labelSpan) labelSpan.textContent = '✅ Sudah Terkirim';
            }
            updateMetrics({ count: currentLecturers.length, total_sessions: document.getElementById('statTotalSessions').textContent });
            return true;
        } else {
            showToast(`❌ Gagal (${lec.lecturer}): ${data.message || 'Terjadi kesalahan saat kirim'}`);
            if (data.message && data.message.includes('belum login')) {
                document.getElementById('btnConnectWa').style.display = 'inline-block';
            }
            return false;
        }
    } catch (err) {
        showToast(`❌ Error koneksi (${lec.lecturer}): ${err.message}`);
        return false;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function startBatchAutoSend() {
    const pendingList = currentLecturers.filter(l => !l.is_sent && l.phone);

    if (pendingList.length === 0) {
        showToast('ℹ️ Semua dosen pada filter ini sudah terkirim atau belum memiliki nomor.');
        return;
    }

    if (!confirm(`Kirim pengingat otomatis ke ${pendingList.length} dosen secara berurutan di background?`)) {
        return;
    }

    const batchBtn = document.getElementById('btnSendAllBatch');
    batchBtn.disabled = true;
    isBatchSending = true;

    showToast(`🚀 Memulai pengiriman otomatis untuk ${pendingList.length} dosen...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingList.length; i++) {
        if (!isBatchSending) break;
        const lec = pendingList[i];
        batchBtn.innerHTML = `<span>⏳ Mengirim (${i + 1}/${pendingList.length}): ${lec.lecturer}...</span>`;
        
        const cards = document.querySelectorAll('.lecturer-card');
        let card = null;
        for (const c of cards) {
            if (c.dataset.lecturer === lec.lecturer) {
                card = c;
                break;
            }
        }
        
        const bubbleElem = card ? card.querySelector('.whatsapp-bubble') : null;
        const sentCheckbox = card ? card.querySelector('.sent-toggle-checkbox') : null;

        const success = await sendSingleLecturerAuto(lec, card, bubbleElem, sentCheckbox);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }

        if (i < pendingList.length - 1 && isBatchSending) {
            batchBtn.innerHTML = `<span>⏸️ Jeda 4 detik sebelum pesan berikutnya...</span>`;
            await new Promise(r => setTimeout(r, 4000));
        }
    }

    batchBtn.disabled = false;
    batchBtn.innerHTML = `<span>⚡ Kirim Semua yang Belum Terkirim</span>`;
    isBatchSending = false;
    showToast(`🎉 Pengiriman batch selesai! (Berhasil: ${successCount}, Gagal: ${failCount})`);
}

async function refreshSingleCardMessage(lec) {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    const query = new URLSearchParams({
        prodi: currentProdi,
        type: currentFilterType,
        start_date: startDate,
        end_date: endDate,
        search: lec.lecturer,
        lang: currentGlobalLang
    });

    const resp = await fetch(`/api/schedules?${query.toString()}`);
    const data = await resp.json();
    const updatedLec = (data.lecturers || []).find(l => l.lecturer === lec.lecturer);
    
    if (updatedLec) {
        lec.whatsapp_message = updatedLec.whatsapp_message;
        lec.lang = updatedLec.lang;
        const bubbleId = `bubble_${lec.lecturer.replace(/\W/g, '_')}`;
        const elem = document.getElementById(bubbleId);
        if (elem) {
            elem.textContent = updatedLec.whatsapp_message;
        }
        
        const card = document.querySelector(`.lecturer-card[data-lecturer="${lec.lecturer}"]`);
        if (card) {
            card.querySelectorAll('.mini-lang-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.lang === updatedLec.lang);
            });
        }
    }
}

async function saveOverride(key, value) {
    try {
        await fetch('/api/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });
    } catch (err) {
        console.error('Error saving override:', err);
    }
}

function openPhoneModal(lecturerName, currentPhone) {
    activePhoneEditLecturer = lecturerName;
    document.getElementById('modalLecturerName').textContent = lecturerName;
    document.getElementById('inputModalPhone').value = currentPhone || '';
    document.getElementById('phoneModal').style.display = 'flex';
}

function closePhoneModal() {
    document.getElementById('phoneModal').style.display = 'none';
    activePhoneEditLecturer = null;
}

async function savePhoneModal() {
    if (!activePhoneEditLecturer) return;
    
    const phoneInput = document.getElementById('inputModalPhone').value.trim();
    let cleaned = phoneInput.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('08')) cleaned = '628' + cleaned.substring(2);
    else if (cleaned.startsWith('+62')) cleaned = '62' + cleaned.substring(3);
    else if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);

    await saveOverride(`phone_${activePhoneEditLecturer}`, cleaned);
    showToast(`✅ Nomor WhatsApp untuk ${activePhoneEditLecturer} berhasil diperbarui!`);
    closePhoneModal();
    fetchSchedules();
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3500);
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/* =========================================================================
   BLAST WHATSAPP (BROADCAST) MANAGEMENT LOGIC
   ========================================================================= */

let currentBroadcastSource = 'sheet'; // 'sheet' | 'wa'
let currentBroadcastCategory = 'all'; // 'all' | 'scheduled' | 'dosen' | 'mentor'
let sheetContacts = [];
let waContacts = [];
let selectedRecipients = new Map(); // key: phone -> recipient object
let currentAttachment = null;
let isBroadcasting = false;

let savedBroadcastTemplates = [];
let activeBroadcastTemplateId = null;

async function fetchSavedBroadcastTemplates() {
    try {
        const resp = await fetch('/api/broadcast/templates');
        const data = await resp.json();
        savedBroadcastTemplates = data.templates || [];
        renderSavedBroadcastTemplatesDropdown();
    } catch (err) {
        console.error('Error loading broadcast templates:', err);
    }
}

function renderSavedBroadcastTemplatesDropdown() {
    const select = document.getElementById('selectBroadcastTemplate');
    if (!select) return;

    select.innerHTML = '<option value="">-- Pilih Template Tersimpan atau Ketik Pesan Baru --</option>';
    savedBroadcastTemplates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `📋 ${t.title}`;
        if (activeBroadcastTemplateId && t.id === activeBroadcastTemplateId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    const btnDelete = document.getElementById('btnDeleteSelectedTemplate');
    if (btnDelete) {
        btnDelete.style.display = activeBroadcastTemplateId ? 'inline-flex' : 'none';
    }
}

function openSaveBroadcastTemplateModal() {
    const msg = (document.getElementById('inputBroadcastMessage')?.value || '').trim();
    if (!msg) {
        showToast('⚠️ Ketikkan isi pesan terlebih dahulu sebelum menyimpannya sebagai template.');
        return;
    }

    const modal = document.getElementById('saveBroadcastTemplateModal');
    const inputTitle = document.getElementById('inputSaveTemplateTitle');
    const preview = document.getElementById('saveTemplatePreviewText');

    if (modal && inputTitle && preview) {
        inputTitle.value = '';
        preview.textContent = msg;
        modal.style.display = 'flex';
        inputTitle.focus();
    }
}

function closeSaveBroadcastTemplateModal() {
    const modal = document.getElementById('saveBroadcastTemplateModal');
    if (modal) modal.style.display = 'none';
}

async function submitSaveBroadcastTemplate() {
    const title = (document.getElementById('inputSaveTemplateTitle')?.value || '').trim();
    const content = (document.getElementById('inputBroadcastMessage')?.value || '').trim();

    if (!title) {
        showToast('⚠️ Masukkan judul / nama template.');
        return;
    }
    if (!content) {
        showToast('⚠️ Isi pesan tidak boleh kosong.');
        return;
    }

    const btn = document.getElementById('btnSubmitSaveTemplate');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:2px;margin:0;"></div><span>Menyimpan...</span>`;
    }

    try {
        const resp = await fetch('/api/broadcast/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                content: content
            })
        });
        const data = await resp.json();

        if (resp.ok && data.status === 'success') {
            savedBroadcastTemplates = data.templates || [];
            activeBroadcastTemplateId = data.template ? data.template.id : null;
            renderSavedBroadcastTemplatesDropdown();
            closeSaveBroadcastTemplateModal();
            showToast(`✅ Template "${title}" berhasil disimpan!`);
        } else {
            showToast(`❌ Gagal menyimpan template: ${data.message || 'Error'}`);
        }
    } catch (err) {
        showToast('❌ Gagal menghubungi server saat menyimpan template.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}

async function deleteSelectedBroadcastTemplate() {
    if (!activeBroadcastTemplateId) return;

    const tpl = savedBroadcastTemplates.find(t => t.id === activeBroadcastTemplateId);
    const title = tpl ? tpl.title : 'ini';

    if (!confirm(`Apakah Anda yakin ingin menghapus template "${title}"?`)) {
        return;
    }

    try {
        const resp = await fetch(`/api/broadcast/templates/${activeBroadcastTemplateId}`, {
            method: 'DELETE'
        });
        const data = await resp.json();

        if (resp.ok && data.status === 'success') {
            savedBroadcastTemplates = data.templates || [];
            activeBroadcastTemplateId = null;
            renderSavedBroadcastTemplatesDropdown();
            showToast('🗑️ Template berhasil dihapus.');
        } else {
            showToast(`❌ Gagal menghapus template: ${data.message || 'Error'}`);
        }
    } catch (err) {
        showToast('❌ Terjadi kesalahan saat menghapus template.');
    }
}

let broadcastLogs = [];

async function fetchBroadcastLogs() {
    try {
        const resp = await fetch('/api/broadcast/history');
        const data = await resp.json();
        broadcastLogs = data.history || [];
        renderBroadcastLogTable();
    } catch (err) {
        console.error('Error fetching broadcast logs:', err);
    }
}

function renderBroadcastLogTable() {
    const tbody = document.getElementById('broadcastLogTableBody');
    if (!tbody) return;

    if (broadcastLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem 1rem; color: #94a3b8;">
                    <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">📭</div>
                    <div>Belum ada riwayat log pengiriman broadcast.</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    broadcastLogs.forEach((log, idx) => {
        const tr = document.createElement('tr');
        tr.id = `logItem_${log.id}`;
        
        let statusBadge = '';
        if (log.status === 'success') {
            statusBadge = `<span class="badge-status full-time" style="background:#dcfce7; color:#15803d;">✅ Berhasil</span>`;
        } else {
            statusBadge = `<span class="badge-status" style="background:#fee2e2; color:#991b1b;" title="${escapeHtml(log.error || 'Gagal')}">❌ Gagal</span>`;
        }

        tr.innerHTML = `
            <td style="text-align:center; font-weight:700; color:#64748b;">${idx + 1}</td>
            <td style="font-weight:600; color:#0b2545;">${escapeHtml(log.name)}</td>
            <td style="text-align:center; font-family:monospace;">${escapeHtml(log.phone)}</td>
            <td style="text-align:center;">${log.has_attachment ? '📎 Ya' : '-'}</td>
            <td style="text-align:center; font-size:0.8rem; color:#64748b;">${escapeHtml(log.sent_at || '-')}</td>
            <td style="text-align:center;">${statusBadge}</td>
            <td style="text-align:center;">
                <button type="button" class="btn-micro-action btn-delete-log-row" data-log-id="${log.id}" title="Hapus baris log ini" style="color:#dc2626; border-color:#fecaca; background:#fef2f2; padding: 0.25rem 0.5rem; cursor:pointer;">
                    <span>🗑️</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Attach click listeners to individual delete buttons
    tbody.querySelectorAll('.btn-delete-log-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const logId = btn.getAttribute('data-log-id');
            if (logId) deleteBroadcastLogItem(logId);
        });
    });
}

async function deleteBroadcastLogItem(logId) {
    try {
        const resp = await fetch(`/api/broadcast/history/${logId}`, {
            method: 'DELETE'
        });
        const data = await resp.json();
        if (resp.ok && data.status === 'success') {
            broadcastLogs = data.history || [];
            renderBroadcastLogTable();
            showToast('🗑️ Item log berhasil dihapus.');
        } else {
            showToast(`❌ Gagal menghapus log: ${data.message || 'Error'}`);
        }
    } catch (err) {
        showToast('❌ Terjadi kesalahan saat menghapus log.');
    }
}

async function clearAllBroadcastLogs() {
    if (broadcastLogs.length === 0) {
        showToast('ℹ️ Riwayat log pengiriman sudah kosong.');
        return;
    }

    if (!confirm('Apakah Anda yakin ingin mengosongkan SELURUH riwayat log pengiriman? Tindakan ini tidak dapat dibatalkan.')) {
        return;
    }

    try {
        const resp = await fetch('/api/broadcast/history', {
            method: 'DELETE'
        });
        const data = await resp.json();
        if (resp.ok && data.status === 'success') {
            broadcastLogs = [];
            renderBroadcastLogTable();
            showToast('🗑️ Seluruh log pengiriman berhasil dikosongkan.');
        } else {
            showToast(`❌ Gagal mengosongkan log: ${data.message || 'Error'}`);
        }
    } catch (err) {
        showToast('❌ Terjadi kesalahan saat mengosongkan log.');
    }
}

function switchMainTab(tabName) {
    const tabLinkLanding = document.getElementById('tabLinkLanding');
    const tabLinkBroadcast = document.getElementById('tabLinkBroadcast');
    const viewLanding = document.getElementById('viewLanding');
    const viewReminder = document.getElementById('viewReminder');
    const viewBroadcast = document.getElementById('viewBroadcast');
    const prodiSubBanner = document.getElementById('prodiSubBanner');

    if (tabName === 'landing') {
        document.querySelectorAll('#prodiTabsContainer .nav-tab-link').forEach(t => t.classList.remove('active'));
        if (tabLinkLanding) tabLinkLanding.classList.add('active');
        if (viewLanding) viewLanding.style.display = 'block';
        if (viewReminder) viewReminder.style.display = 'none';
        if (viewBroadcast) viewBroadcast.style.display = 'none';
        if (prodiSubBanner) prodiSubBanner.style.display = 'none';
        updateLandingPageLockBadges();
    } else if (tabName === 'broadcast') {
        document.querySelectorAll('#prodiTabsContainer .nav-tab-link').forEach(t => t.classList.remove('active'));
        if (tabLinkBroadcast) tabLinkBroadcast.classList.add('active');
        if (viewLanding) viewLanding.style.display = 'none';
        if (viewReminder) viewReminder.style.display = 'none';
        if (viewBroadcast) viewBroadcast.style.display = 'block';
        if (prodiSubBanner) prodiSubBanner.style.display = 'none';
        
        if (sheetContacts.length === 0) {
            fetchSheetContacts();
        }
        fetchSavedBroadcastTemplates();
        fetchBroadcastLogs();
        updateBroadcastPreview();
    } else {
        // 'reminder' view
        if (tabLinkLanding) tabLinkLanding.classList.remove('active');
        if (tabLinkBroadcast) tabLinkBroadcast.classList.remove('active');
        document.querySelectorAll('#prodiTabsContainer .nav-tab-link').forEach(t => {
            t.classList.toggle('active', t.dataset.prodi === currentProdi);
        });
        if (viewLanding) viewLanding.style.display = 'none';
        if (viewBroadcast) viewBroadcast.style.display = 'none';
        if (viewReminder) viewReminder.style.display = 'block';
        if (prodiSubBanner) prodiSubBanner.style.display = 'block';
    }
}

async function fetchSheetContacts() {
    const loadingState = document.getElementById('broadcastLoadingRecipients');
    const emptyState = document.getElementById('broadcastEmptyRecipients');
    if (loadingState) loadingState.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    try {
        const resp = await fetch('/api/contacts');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        sheetContacts = data.contacts || [];
        
        updateCategoryCountBadges();
        renderRecipientList();
    } catch (err) {
        console.warn('Backend contacts API unavailable, falling back to client-side Google Sheets contacts:', err);
        try {
            const db = await loadClientSideDosenDatabase();
            sheetContacts = Object.values(db).map(c => ({
                name: c.name,
                clean_name: c.name,
                first_name: extractFirstNameFrontend(c.name),
                phone: c.phone,
                role: c.status || 'Dosen',
                domicile: c.domicile || '',
                is_scheduled: true
            }));
            updateCategoryCountBadges();
            renderRecipientList();
        } catch (e2) {
            console.error('Error loading fallback contacts:', e2);
            showToast('❌ Gagal memuat daftar kontak dosen & mentor.');
        }
    } finally {
        if (loadingState) loadingState.style.display = 'none';
    }
}

async function syncWaContacts() {
    const btn = document.getElementById('btnSyncWaContacts');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner" style="width: 12px; height: 12px; border-width: 2px; margin: 0;"></div><span>Menarik Kontak...</span>`;
    }
    
    showToast('🔄 Membaca kontak dari sesi WhatsApp Web lokal...');

    try {
        const resp = await fetch('/api/wa/contacts');
        const data = await resp.json();
        
        if (resp.ok && data.success) {
            waContacts = (data.contacts || []).map(c => ({
                name: c.name || c.phone,
                clean_name: c.name || c.phone,
                first_name: extractFirstNameFrontend(c.name || c.phone),
                phone: c.phone,
                role: 'Kontak WA',
                is_scheduled: false
            }));
            
            if (waContacts.length === 0) {
                showToast('ℹ️ WhatsApp Web terhubung, tetapi belum ada kontak/chat yang terbaca. Buka salah satu chat di WhatsApp Web terlebih dahulu.');
            } else {
                showToast(`✅ Berhasil menarik ${waContacts.length} kontak dari WhatsApp Web!`);
            }
            
            // Switch to WA tab to view
            switchBroadcastSourceTab('wa');
        } else {
            showToast(`⚠️ ${data.error || 'Pastikan WhatsApp Web sudah login'}`);
        }
    } catch (err) {
        showToast('❌ Gagal menghubungi service WhatsApp Web.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}

function openManualContactModal() {
    const modal = document.getElementById('manualContactModal');
    if (modal) {
        const input = document.getElementById('inputManualContactsText');
        if (input) input.value = '';
        modal.style.display = 'flex';
    }
}

function closeManualContactModal() {
    const modal = document.getElementById('manualContactModal');
    if (modal) modal.style.display = 'none';
}

function addManualContactsSubmit() {
    const text = (document.getElementById('inputManualContactsText')?.value || '').trim();
    if (!text) {
        showToast('⚠️ Masukkan minimal 1 nomor telepon.');
        return;
    }

    const lines = text.split('\n');
    let addedCount = 0;

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        let name = '';
        let phone = '';

        if (line.includes(',')) {
            const parts = line.split(',');
            const firstPart = parts[0].trim();
            const secondPart = parts.slice(1).join(',').trim();

            if (/[0-9]/.test(firstPart) && firstPart.replace(/[^0-9]/g, '').length >= 8) {
                phone = firstPart;
                name = secondPart;
            } else {
                phone = secondPart;
                name = firstPart;
            }
        } else {
            phone = line;
        }

        // Clean phone
        phone = phone.replace(/[^0-9]/g, '');
        if (phone.startsWith('08')) phone = '628' + phone.substring(2);

        if (phone.length >= 8) {
            if (!name) name = phone;
            const firstName = extractFirstNameFrontend(name);
            const contactObj = {
                name: name,
                clean_name: name,
                first_name: firstName,
                phone: phone,
                role: 'Kontak Manual',
                is_scheduled: false
            };

            // Add to sheetContacts and select
            const exists = sheetContacts.find(c => c.phone === phone);
            if (!exists) {
                sheetContacts.unshift(contactObj);
            }
            selectedRecipients.set(phone, contactObj);
            addedCount++;
        }
    });

    if (addedCount > 0) {
        closeManualContactModal();
        updateCategoryCountBadges();
        renderRecipientList();
        updateSelectedBadgeAndButton();
        updateBroadcastPreview();
        showToast(`✅ ${addedCount} kontak berhasil ditambahkan & dipilih!`);
    } else {
        showToast('❌ Tidak ditemukan nomor WhatsApp yang valid.');
    }
}

function updateCategoryCountBadges() {
    const total = sheetContacts.length;
    const sched = sheetContacts.filter(c => c.is_scheduled).length;
    const dosen = sheetContacts.filter(c => c.role === 'Dosen').length;
    const mentor = sheetContacts.filter(c => c.role === 'Mentor').length;

    const elAll = document.getElementById('countCatAll');
    const elSched = document.getElementById('countCatSched');
    const elDosen = document.getElementById('countCatDosen');
    const elMentor = document.getElementById('countCatMentor');

    if (elAll) elAll.textContent = total;
    if (elSched) elSched.textContent = sched;
    if (elDosen) elDosen.textContent = dosen;
    if (elMentor) elMentor.textContent = mentor;
}

function switchBroadcastSourceTab(source) {
    currentBroadcastSource = source;
    
    const tabSheet = document.getElementById('tabSourceSheet');
    const tabWa = document.getElementById('tabSourceWa');
    const sheetFilters = document.getElementById('sheetCategoryFilters');

    if (tabSheet) tabSheet.classList.toggle('active', source === 'sheet');
    if (tabWa) tabWa.classList.toggle('active', source === 'wa');
    
    if (sheetFilters) {
        sheetFilters.style.display = (source === 'sheet') ? 'flex' : 'none';
    }

    if (source === 'wa' && waContacts.length === 0) {
        syncWaContacts();
    } else {
        renderRecipientList();
    }
}

function extractFirstNameFrontend(fullName) {
    if (!fullName) return "Bapak/Ibu";
    let cleaned = fullName.replace(/\b(prof|dr|rer|pol|ir|st|se|si|mm|mba|msae|meng|phd|mab|mppar|stp|mt|msi|bhsc|dosen|pengajar|kontrak|praktisi|asisten|ahli|lektor|kepala|apt|drg|h|hj|bpk|bapak|pak|ibu|bu|mas|mbak|mr|mrs|ms|s\.kom|s\.e|s\.t|s\.si|m\.m|m\.ba|m\.sc|m\.t|m\.ab|ph\.d|dr)\b\.?/gi, '');
    cleaned = cleaned.replace(/[^\w\s]/g, ' ');
    let words = cleaned.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 0) {
        return words[0].charAt(0).toUpperCase() + words[0].slice(1);
    }
    return fullName.split(' ')[0] || fullName;
}

function getFilteredContacts() {
    const list = (currentBroadcastSource === 'sheet') ? sheetContacts : waContacts;
    const search = (document.getElementById('inputBroadcastSearch')?.value || '').trim().toLowerCase();

    return list.filter(c => {
        if (currentBroadcastSource === 'sheet') {
            if (currentBroadcastCategory === 'scheduled' && !c.is_scheduled) return false;
            if (currentBroadcastCategory === 'dosen' && c.role !== 'Dosen') return false;
            if (currentBroadcastCategory === 'mentor' && c.role !== 'Mentor') return false;
        }

        if (search) {
            const matchTxt = `${c.name} ${c.clean_name || ''} ${c.phone || ''} ${c.role || ''} ${c.status || ''}`.toLowerCase();
            if (!matchTxt.includes(search)) return false;
        }

        return true;
    });
}

function renderRecipientList() {
    const container = document.getElementById('broadcastRecipientList');
    const emptyState = document.getElementById('broadcastEmptyRecipients');
    if (!container) return;

    container.innerHTML = '';
    const filtered = getFilteredContacts();

    if (filtered.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    filtered.forEach(c => {
        const itemKey = c.phone || c.name;
        const isChecked = selectedRecipients.has(itemKey);
        const hasPhone = Boolean(c.phone);

        const row = document.createElement('div');
        row.className = `recipient-item ${isChecked ? 'selected' : ''} ${!hasPhone ? 'no-phone' : ''}`;
        row.dataset.key = itemKey;

        const initial = (c.name || 'U').replace(/^(Prof\.|Dr\.|Ir\.)\s*/i, '').charAt(0).toUpperCase();

        let roleBadge = `<span class="tag tag-status">${escapeHtml(c.role || 'Kontak')}</span>`;
        if (c.role === 'Mentor') {
            roleBadge = `<span class="tag tag-status" style="background: #f3e8ff; color: #7e22ce; font-weight:700;">🤝 Mentor</span>`;
        } else if (c.role === 'Kontak WA') {
            roleBadge = `<span class="tag tag-status" style="background: #dcfce7; color: #15803d; font-weight:600;">📱 WA</span>`;
        }

        row.innerHTML = `
            <label class="recipient-checkbox-label">
                <input type="checkbox" class="rcp-checkbox" ${isChecked ? 'checked' : ''} ${!hasPhone ? 'disabled' : ''}>
                <div class="rcp-avatar">${initial}</div>
                <div class="rcp-info">
                    <div class="rcp-name-row">
                        <strong class="rcp-name">${escapeHtml(c.name)}</strong>
                        ${roleBadge}
                    </div>
                    <div class="rcp-meta-row">
                        <span class="rcp-phone ${!hasPhone ? 'missing' : ''}">
                            ${hasPhone ? `📱 ${c.phone}` : '⚠️ Belum ada no. WA'}
                        </span>
                        ${c.is_scheduled ? '<span class="tag tag-sessions-count">🎓 Terjadwal</span>' : ''}
                    </div>
                </div>
            </label>
            <button type="button" class="btn-edit-phone-micro" title="Edit Nomor WhatsApp" data-name="${escapeHtml(c.name)}" data-phone="${escapeHtml(c.phone || '')}">
                ✏️
            </button>
        `;

        // Checkbox toggle event
        const chk = row.querySelector('.rcp-checkbox');
        chk.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedRecipients.set(itemKey, c);
                row.classList.add('selected');
            } else {
                selectedRecipients.delete(itemKey);
                row.classList.remove('selected');
            }
            updateSelectedBadgeAndButton();
            updateBroadcastPreview();
        });

        // Edit Phone button event
        const btnEdit = row.querySelector('.btn-edit-phone-micro');
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            openPhoneModal(c.name, c.phone);
        });

        container.appendChild(row);
    });

    updateSelectedBadgeAndButton();
}

function updateSelectedBadgeAndButton() {
    const count = selectedRecipients.size;
    const badge = document.getElementById('broadcastSelectedBadge');
    const btnCount = document.getElementById('btnRecipientCount');
    
    if (badge) badge.textContent = `${count} Dipilih`;
    if (btnCount) btnCount.textContent = count;
}

function selectAllFilteredRecipients() {
    const filtered = getFilteredContacts();
    let addedCount = 0;
    filtered.forEach(c => {
        if (c.phone) {
            const itemKey = c.phone || c.name;
            selectedRecipients.set(itemKey, c);
            addedCount++;
        }
    });
    renderRecipientList();
    showToast(`☑️ ${addedCount} kontak berhasil dipilih.`);
}

function deselectAllRecipients() {
    selectedRecipients.clear();
    renderRecipientList();
    showToast('⬜ Pilihan kontak dibatalkan.');
}

function insertTextAtCursor(textarea, textToInsert) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    textarea.value = val.substring(0, start) + textToInsert + val.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
    
    // Trigger input event to update live preview
    textarea.dispatchEvent(new Event('input'));
}

function updateBroadcastPreview() {
    const textarea = document.getElementById('inputBroadcastMessage');
    const previewEl = document.getElementById('broadcastLivePreview');
    const previewTarget = document.getElementById('previewSampleTarget');
    if (!textarea || !previewEl) return;

    let text = textarea.value || '';
    
    // Pick first selected recipient as sample, or fallback to first contact
    let sampleName = "Bapak/Ibu";
    let sampleCleanName = "Bapak/Ibu Dosen";
    let sampleFirstName = "Budi";

    if (selectedRecipients.size > 0) {
        const firstSelected = Array.from(selectedRecipients.values())[0];
        sampleName = firstSelected.name;
        sampleCleanName = firstSelected.clean_name || firstSelected.name;
        sampleFirstName = firstSelected.first_name || extractFirstNameFrontend(sampleCleanName);
        if (previewTarget) previewTarget.textContent = `Penerima: ${sampleFirstName} (${sampleName})`;
    } else {
        if (previewTarget) previewTarget.textContent = `Penerima: Contoh (Dr. Budi Santoso)`;
    }

    if (!text.trim()) {
        text = "💬 *Preview Pesan*: Ketik pesan di atas untuk melihat tampilan langsung di sini...";
    } else {
        text = text.replace(/\{nama\}/gi, `*${sampleFirstName}*`);
        text = text.replace(/\{nama_lengkap\}/gi, `*${sampleCleanName}*`);
        text = text.replace(/\{sapaan\}/gi, `*Bapak/Ibu ${sampleFirstName}*`);
    }

    previewEl.textContent = text;
}

// File Attachment Handlers
async function handleFileUpload(file) {
    if (!file) return;

    // Check size limit: 25MB
    if (file.size > 25 * 1024 * 1024) {
        showToast('⚠️ Ukuran file melebihi batas maksimal 25 MB.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    showToast(`⏳ Mengunggah file ${file.name}...`);

    try {
        const resp = await fetch('/api/upload-attachment', {
            method: 'POST',
            body: formData
        });
        const data = await resp.json();

        if (resp.ok && data.status === 'success') {
            currentAttachment = data;
            
            // Update UI
            document.getElementById('dropzoneEmpty').style.display = 'none';
            const card = document.getElementById('dropzoneFileCard');
            card.style.display = 'flex';
            document.getElementById('dropzoneFileName').textContent = data.original_name;
            document.getElementById('dropzoneFileSize').textContent = data.size;
            
            let icon = '📄';
            const ext = data.original_name.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) icon = '🖼️';
            else if (['xls', 'xlsx'].includes(ext)) icon = '📊';
            else if (['doc', 'docx'].includes(ext)) icon = '📝';
            else if (['pdf'].includes(ext)) icon = '📕';
            document.getElementById('dropzoneFileIcon').textContent = icon;

            // Update live preview badge
            const badge = document.getElementById('previewAttachmentBadge');
            badge.style.display = 'block';
            document.getElementById('previewAttachmentName').textContent = data.original_name;

            showToast(`✅ File ${data.original_name} siap dilampirkan!`);
        } else {
            showToast(`❌ Gagal upload: ${data.message || 'Error'}`);
        }
    } catch (err) {
        showToast('❌ Terjadi kesalahan saat mengunggah file.');
    }
}

async function removeAttachment() {
    if (!currentAttachment) return;
    
    try {
        await fetch('/api/delete-attachment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: currentAttachment.file_path })
        });
    } catch (e) {}

    currentAttachment = null;
    document.getElementById('broadcastFileInput').value = '';
    document.getElementById('dropzoneFileCard').style.display = 'none';
    document.getElementById('dropzoneEmpty').style.display = 'flex';
    document.getElementById('previewAttachmentBadge').style.display = 'none';
    showToast('🗑️ Lampiran file dihapus.');
}

// Broadcast Execution Loop
async function startBroadcastExecution() {
    const messageText = document.getElementById('inputBroadcastMessage').value.trim();
    const delaySec = parseInt(document.getElementById('selectBroadcastDelay').value) || 3;
    const recipientsList = Array.from(selectedRecipients.values());

    if (!messageText && !currentAttachment) {
        showToast('⚠️ Masukkan isi pesan WhatsApp atau lampirkan file terlebih dahulu.');
        return;
    }

    if (recipientsList.length === 0) {
        showToast('⚠️ Silakan pilih minimal 1 kontak penerima di kolom sebelah kanan.');
        return;
    }

    const confirmMsg = `Mulai kirim pesan broadcast ke ${recipientsList.length} penerima terpilih dengan jeda ${delaySec} detik per pesan?`;
    if (!confirm(confirmMsg)) return;

    // Setup UI for Sending State
    isBroadcasting = true;
    const btnStart = document.getElementById('btnStartBroadcast');
    const btnCancel = document.getElementById('btnCancelBroadcast');
    btnStart.style.display = 'none';
    btnCancel.style.display = 'inline-flex';

    const progressSec = document.getElementById('broadcastProgressSection');
    progressSec.style.display = 'block';
    progressSec.scrollIntoView({ behavior: 'smooth' });

    const logTableBody = document.getElementById('broadcastLogTableBody');
    logTableBody.innerHTML = '';

    const total = recipientsList.length;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < total; i++) {
        if (!isBroadcasting) {
            showToast('⏸️ Pengiriman broadcast dihentikan oleh pengguna.');
            break;
        }

        const rcp = recipientsList[i];
        const pct = Math.round(((i + 1) / total) * 100);

        document.getElementById('progressTitle').textContent = `🚀 Mengirim (${i + 1}/${total}): ${rcp.name}...`;
        document.getElementById('progressStatText').textContent = `${i + 1} / ${total} Kontak (${pct}%)`;
        document.getElementById('broadcastProgressBarFill').style.width = `${pct}%`;

        // Create initial log row
        const tr = document.createElement('tr');
        tr.id = `logRow_${i}`;
        tr.innerHTML = `
            <td style="text-align:center; font-weight:700; color:#64748b;">${i + 1}</td>
            <td style="font-weight:600; color:#0b2545;">${escapeHtml(rcp.name)}</td>
            <td style="text-align:center; font-family:monospace;">${escapeHtml(rcp.phone)}</td>
            <td style="text-align:center;">${currentAttachment ? '📎 Ya' : '-'}</td>
            <td style="text-align:center; font-size:0.8rem; color:#64748b;">${new Date().toLocaleTimeString()}</td>
            <td style="text-align:center;">
                <span class="badge-status part-time">⏳ Mengirim...</span>
            </td>
        `;
        logTableBody.prepend(tr);

        // Send via backend
        try {
            const resp = await fetch('/api/wa/broadcast-single', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: rcp,
                    message: messageText,
                    attachment_path: currentAttachment ? currentAttachment.file_path : null
                })
            });

            const data = await resp.json();
            const statusTd = tr.querySelector('td:last-child');

            if (resp.ok && data.status === 'success') {
                successCount++;
                statusTd.innerHTML = `<span class="badge-status full-time" style="background:#dcfce7; color:#15803d;">✅ Berhasil</span>`;
            } else {
                failCount++;
                const errMsg = data.message || 'Gagal';
                statusTd.innerHTML = `<span class="badge-status" style="background:#fee2e2; color:#991b1b;" title="${escapeHtml(errMsg)}">❌ Gagal</span>`;
            }
        } catch (err) {
            failCount++;
            const statusTd = tr.querySelector('td:last-child');
            statusTd.innerHTML = `<span class="badge-status" style="background:#fee2e2; color:#991b1b;">❌ Error Jaringan</span>`;
        }

        // Delay between recipients
        if (i < total - 1 && isBroadcasting) {
            for (let s = delaySec; s > 0; s--) {
                if (!isBroadcasting) break;
                document.getElementById('progressSubtitle').textContent = `Jeda aman anti-ban: menunggu ${s} detik sebelum mengirim ke ${recipientsList[i + 1].name}...`;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    // Finished
    isBroadcasting = false;
    btnStart.style.display = 'inline-flex';
    btnCancel.style.display = 'none';

    document.getElementById('progressTitle').textContent = `🎉 Selesai! Pengiriman Broadcast Tuntas`;
    document.getElementById('progressSubtitle').textContent = `Total berhasil: ${successCount} kontak | Total gagal: ${failCount} kontak`;
    showToast(`🎉 Broadcast selesai! Berhasil: ${successCount}, Gagal: ${failCount}`);
}

function cancelBroadcastExecution() {
    isBroadcasting = false;
    showToast('⏸️ Menghentikan antrean broadcast...');
}

// Broadcast Event Listeners
function setupBroadcastEventListeners() {
    // Saved Broadcast Template Change
    const tplSelect = document.getElementById('selectBroadcastTemplate');
    if (tplSelect) {
        tplSelect.addEventListener('change', (e) => {
            const tplId = e.target.value;
            activeBroadcastTemplateId = tplId || null;
            const textarea = document.getElementById('inputBroadcastMessage');
            const btnDel = document.getElementById('btnDeleteSelectedTemplate');
            if (btnDel) btnDel.style.display = activeBroadcastTemplateId ? 'inline-flex' : 'none';

            if (tplId) {
                const found = savedBroadcastTemplates.find(t => t.id === tplId);
                if (found && textarea) {
                    textarea.value = found.content;
                    updateBroadcastPreview();
                }
            }
        });
    }

    // Save Template Modal & Action Buttons
    const btnOpenSaveTpl = document.getElementById('btnSaveCurrentAsTemplate');
    if (btnOpenSaveTpl) btnOpenSaveTpl.addEventListener('click', openSaveBroadcastTemplateModal);

    const btnCloseSaveTpl = document.getElementById('btnCloseSaveTemplateModal');
    if (btnCloseSaveTpl) btnCloseSaveTpl.addEventListener('click', closeSaveBroadcastTemplateModal);

    const btnCancelSaveTpl = document.getElementById('btnCancelSaveTemplate');
    if (btnCancelSaveTpl) btnCancelSaveTpl.addEventListener('click', closeSaveBroadcastTemplateModal);

    const btnSubmitSaveTpl = document.getElementById('btnSubmitSaveTemplate');
    if (btnSubmitSaveTpl) btnSubmitSaveTpl.addEventListener('click', submitSaveBroadcastTemplate);

    const btnDeleteTpl = document.getElementById('btnDeleteSelectedTemplate');
    if (btnDeleteTpl) btnDeleteTpl.addEventListener('click', deleteSelectedBroadcastTemplate);

    // Message input live preview
    const broadcastMsgInput = document.getElementById('inputBroadcastMessage');
    if (broadcastMsgInput) {
        broadcastMsgInput.addEventListener('input', updateBroadcastPreview);
    }

    // Tag Insert Buttons
    const btnTagNama = document.getElementById('btnInsertTagName');
    if (btnTagNama) {
        btnTagNama.addEventListener('click', () => {
            insertTextAtCursor(document.getElementById('inputBroadcastMessage'), '{nama}');
        });
    }

    const btnTagSapaan = document.getElementById('btnInsertTagSapaan');
    if (btnTagSapaan) {
        btnTagSapaan.addEventListener('click', () => {
            insertTextAtCursor(document.getElementById('inputBroadcastMessage'), '{sapaan}');
        });
    }

    const btnTagFull = document.getElementById('btnInsertTagFullName');
    if (btnTagFull) {
        btnTagFull.addEventListener('click', () => {
            insertTextAtCursor(document.getElementById('inputBroadcastMessage'), '{nama_lengkap}');
        });
    }

    // Attachment Dropzone events
    const dropzone = document.getElementById('attachmentDropzone');
    const fileInput = document.getElementById('broadcastFileInput');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', (e) => {
            if (!e.target.closest('#btnRemoveAttachment')) {
                fileInput.click();
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
            }
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });
    }

    const btnRemoveFile = document.getElementById('btnRemoveAttachment');
    if (btnRemoveFile) {
        btnRemoveFile.addEventListener('click', (e) => {
            e.stopPropagation();
            removeAttachment();
        });
    }

    // Recipient Source Tabs (Sheet vs WA)
    const tabSourceSheet = document.getElementById('tabSourceSheet');
    if (tabSourceSheet) {
        tabSourceSheet.addEventListener('click', () => switchBroadcastSourceTab('sheet'));
    }

    const tabSourceWa = document.getElementById('tabSourceWa');
    if (tabSourceWa) {
        tabSourceWa.addEventListener('click', () => switchBroadcastSourceTab('wa'));
    }

    const btnSyncWa = document.getElementById('btnSyncWaContacts');
    if (btnSyncWa) {
        btnSyncWa.addEventListener('click', syncWaContacts);
    }

    // Category pills filter
    document.querySelectorAll('.cat-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentBroadcastCategory = pill.dataset.cat;
            renderRecipientList();
        });
    });

    // Search filter
    let bSearchTimeout = null;
    const inputBSearch = document.getElementById('inputBroadcastSearch');
    if (inputBSearch) {
        inputBSearch.addEventListener('input', () => {
            clearTimeout(bSearchTimeout);
            bSearchTimeout = setTimeout(renderRecipientList, 250);
        });
    }

    // Manual Contacts Modal Buttons
    const btnOpenManual = document.getElementById('btnOpenManualContactModal');
    if (btnOpenManual) btnOpenManual.addEventListener('click', openManualContactModal);

    const btnCloseManual = document.getElementById('btnCloseManualContactModal');
    if (btnCloseManual) btnCloseManual.addEventListener('click', closeManualContactModal);

    const btnCancelManual = document.getElementById('btnCancelManualContact');
    if (btnCancelManual) btnCancelManual.addEventListener('click', closeManualContactModal);

    const btnAddManual = document.getElementById('btnAddManualContactsSubmit');
    if (btnAddManual) btnAddManual.addEventListener('click', addManualContactsSubmit);

    // Bulk selection buttons
    const btnSelAll = document.getElementById('btnSelectAllRecipients');
    if (btnSelAll) btnSelAll.addEventListener('click', selectAllFilteredRecipients);

    const btnDeselAll = document.getElementById('btnDeselectAllRecipients');
    if (btnDeselAll) btnDeselAll.addEventListener('click', deselectAllRecipients);

    // Broadcast action buttons
    const btnStart = document.getElementById('btnStartBroadcast');
    if (btnStart) btnStart.addEventListener('click', startBroadcastExecution);

    const btnCancel = document.getElementById('btnCancelBroadcast');
    if (btnCancel) btnCancel.addEventListener('click', cancelBroadcastExecution);

    // Clear All Logs button
    const btnClearLogs = document.getElementById('btnClearAllBroadcastLogs');
    if (btnClearLogs) btnClearLogs.addEventListener('click', clearAllBroadcastLogs);
}

// ==========================================
// MASTER TEMPLATE EDITOR LOGIC
// ==========================================

// ─── Built-in default templates (used when backend /api/templates is unavailable) ───
const CLIENT_DEFAULT_TEMPLATES = {
    id: {
        intro: 'Yth. Bapak/Ibu *{nama_dosen}*,\n\nDengan hormat, kami sampaikan jadwal mengajar untuk minggu ini:\n\n',
        closing: '\nDemikian informasi jadwal mengajar ini kami sampaikan. Atas perhatian dan kesediaan Bapak/Ibu, kami mengucapkan terima kasih.\n\nHormat kami,\n*Tim Akademik SBM ITB*',
        lbl_program: 'Program',
        lbl_course: 'Mata Kuliah',
        lbl_date: 'Hari/Tanggal',
        lbl_time: 'Waktu',
        lbl_room: 'Ruangan',
        lbl_guest: 'Guest Speaker',
        lbl_mentor: 'Mentor',
        lbl_remarks: 'Catatan',
        exam_ask_all: 'Mohon konfirmasi kehadiran Anda paling lambat H-1 sebelum jadwal dimulai.'
    },
    en: {
        intro: 'Dear *{nama_dosen}*,\n\nWe would like to inform you of your teaching schedule for this week:\n\n',
        closing: '\nThank you for your attention and continued dedication.\n\nBest regards,\n*SBM ITB Academic Team*',
        lbl_program: 'Program',
        lbl_course: 'Course',
        lbl_date: 'Day/Date',
        lbl_time: 'Time',
        lbl_room: 'Room',
        lbl_guest: 'Guest Speaker',
        lbl_mentor: 'Mentor',
        lbl_remarks: 'Remarks',
        exam_ask_all: 'Please confirm your attendance at least 1 day before the scheduled class.'
    }
};

async function openTemplateModal() {
    try {
        const resp = await fetch('/api/templates');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        currentTemplates = data.templates || { id: {}, en: {} };
        defaultTemplates = data.defaults || CLIENT_DEFAULT_TEMPLATES;
    } catch (err) {
        // Netlify / static mode: use built-in defaults, load from localStorage if saved
        console.warn('Backend /api/templates unavailable, using client-side defaults.');
        const savedRaw = localStorage.getItem('master_templates_local');
        if (savedRaw) {
            try {
                currentTemplates = JSON.parse(savedRaw);
            } catch {
                currentTemplates = JSON.parse(JSON.stringify(CLIENT_DEFAULT_TEMPLATES));
            }
        } else {
            currentTemplates = JSON.parse(JSON.stringify(CLIENT_DEFAULT_TEMPLATES));
        }
        defaultTemplates = CLIENT_DEFAULT_TEMPLATES;
    }

    activeTemplateLang = currentGlobalLang || 'id';
    updateTemplateTabUI();
    populateTemplateFormFields(activeTemplateLang);
    updateTemplatePreview();

    document.getElementById('templateModal').style.display = 'flex';
}

function closeTemplateModal() {
    document.getElementById('templateModal').style.display = 'none';
}

function switchTemplateLang(targetLang) {
    if (activeTemplateLang === targetLang) return;
    
    // Save current form values to memory
    collectCurrentFormIntoMemory();
    
    activeTemplateLang = targetLang;
    updateTemplateTabUI();
    populateTemplateFormFields(targetLang);
    updateTemplatePreview();
}

function updateTemplateTabUI() {
    const tabId = document.getElementById('tplTabId');
    const tabEn = document.getElementById('tplTabEn');
    if (tabId) tabId.classList.toggle('active', activeTemplateLang === 'id');
    if (tabEn) tabEn.classList.toggle('active', activeTemplateLang === 'en');
}

function collectCurrentFormIntoMemory() {
    if (!currentTemplates[activeTemplateLang]) {
        currentTemplates[activeTemplateLang] = {};
    }
    const cur = currentTemplates[activeTemplateLang];
    
    cur.intro = document.getElementById('inputTplIntro').value;
    cur.closing = document.getElementById('inputTplClosing').value;
    cur.label_program = document.getElementById('inputLblProgram').value;
    cur.label_course = document.getElementById('inputLblCourse').value;
    cur.label_date = document.getElementById('inputLblDate').value;
    cur.label_time = document.getElementById('inputLblTime').value;
    cur.label_room = document.getElementById('inputLblRoom').value;
    cur.label_guest_lecturer = document.getElementById('inputLblGuest').value;
    cur.label_mentor = document.getElementById('inputLblMentor').value;
    cur.label_remarks = document.getElementById('inputLblRemarks').value;
    cur.exam_ask_all = document.getElementById('inputTplExamAskAll').value;
}

function populateTemplateFormFields(lang) {
    const tpl = (currentTemplates && currentTemplates[lang]) ? currentTemplates[lang] : {};
    const dflt = (defaultTemplates && defaultTemplates[lang]) ? defaultTemplates[lang] : {};

    document.getElementById('inputTplIntro').value = (tpl.intro !== undefined) ? tpl.intro : (dflt.intro || '');
    document.getElementById('inputTplClosing').value = (tpl.closing !== undefined) ? tpl.closing : (dflt.closing || '');
    document.getElementById('inputLblProgram').value = (tpl.label_program !== undefined) ? tpl.label_program : (dflt.label_program || 'Program');
    document.getElementById('inputLblCourse').value = (tpl.label_course !== undefined) ? tpl.label_course : (dflt.label_course || (lang === 'id' ? 'Mata Kuliah' : 'Course'));
    document.getElementById('inputLblDate').value = (tpl.label_date !== undefined) ? tpl.label_date : (dflt.label_date || (lang === 'id' ? 'Hari, Tanggal' : 'Day, Date'));
    document.getElementById('inputLblTime').value = (tpl.label_time !== undefined) ? tpl.label_time : (dflt.label_time || (lang === 'id' ? 'Waktu' : 'Time'));
    document.getElementById('inputLblRoom').value = (tpl.label_room !== undefined) ? tpl.label_room : (dflt.label_room || (lang === 'id' ? 'Ruangan' : 'Room'));
    document.getElementById('inputLblGuest').value = (tpl.label_guest_lecturer !== undefined) ? tpl.label_guest_lecturer : (dflt.label_guest_lecturer || (lang === 'id' ? 'Dosen Tamu' : 'Guest Lecturer'));
    document.getElementById('inputLblMentor').value = (tpl.label_mentor !== undefined) ? tpl.label_mentor : (dflt.label_mentor || 'Mentor');
    document.getElementById('inputLblRemarks').value = (tpl.label_remarks !== undefined) ? tpl.label_remarks : (dflt.label_remarks || (lang === 'id' ? 'Catatan' : 'Remarks'));
    document.getElementById('inputTplExamAskAll').value = (tpl.exam_ask_all !== undefined) ? tpl.exam_ask_all : (dflt.exam_ask_all || '');
}

function updateTemplatePreview() {
    const isId = (activeTemplateLang === 'id');
    const introVal = document.getElementById('inputTplIntro').value.trim();
    const closingVal = document.getElementById('inputTplClosing').value.trim();
    const lblProg = document.getElementById('inputLblProgram').value.trim() || 'Program';
    const lblCourse = document.getElementById('inputLblCourse').value.trim() || (isId ? 'Mata Kuliah' : 'Course');
    const lblDate = document.getElementById('inputLblDate').value.trim() || (isId ? 'Hari, Tanggal' : 'Day, Date');
    const lblTime = document.getElementById('inputLblTime').value.trim() || (isId ? 'Waktu' : 'Time');
    const lblRoom = document.getElementById('inputLblRoom').value.trim() || (isId ? 'Ruangan' : 'Room');
    const lblGuest = document.getElementById('inputLblGuest').value.trim() || (isId ? 'Dosen Tamu' : 'Guest Lecturer');
    const lblMentor = document.getElementById('inputLblMentor').value.trim() || 'Mentor';
    const examQ = document.getElementById('inputTplExamAskAll').value.trim();

    let lines = [];
    if (introVal) lines.push(introVal + "\n");
    
    // Sample schedule block
    const sampleProg = isId ? "Eksekutif (EMBA-68)" : "Executive (EMBA-68)";
    const sampleCourse = "Strategic Management";
    const sampleDate = isId ? "Sabtu, 5 September 2026" : "Saturday, September 5, 2026";
    const sampleTime = isId ? "09.00 - 12.00 WIB (1 Sesi) + UTS" : "09.00 - 12.00 WIB (1 Session) + MID EXAM";
    const sampleRoom = isId ? "R. 301 Kampus Jakarta" : "Room 301 Jakarta Campus";
    
    lines.push(`${lblProg} : ${sampleProg}`);
    lines.push(`${lblCourse} : ${sampleCourse}`);
    lines.push(`${lblDate} : ${sampleDate}`);
    lines.push(`${lblTime} : ${sampleTime}`);
    lines.push(`${lblRoom} : ${sampleRoom}`);
    lines.push(`${lblGuest} : Ir. Budi Santoso, MBA`);
    lines.push(`${lblMentor} : Kevin Sugiarto`);

    if (examQ) {
        const examIntro = isId ? `\n\nTerkait sesi ujian mendatang, ${examQ}` : `\n\nRegarding the upcoming examination session, ${examQ}`;
        lines.push(examIntro);
    } else {
        const defaultQ = isId ? "mohon konfirmasi apakah ujian akan dilaksanakan secara Offline (di kampus), Online, atau Take-Home?" : "kindly confirm whether the exam will be conducted Offline (On-Campus), Online, or as a Take-Home exam?";
        const examIntro = isId ? `\n\nTerkait sesi ujian mendatang, ${defaultQ}` : `\n\nRegarding the upcoming examination session, ${defaultQ}`;
        lines.push(examIntro);
    }

    if (closingVal) {
        lines.push("\n" + closingVal);
    }

    const previewElem = document.getElementById('templateLivePreview');
    if (previewElem) {
        previewElem.textContent = lines.join("\n");
    }
}

async function saveTemplateForm() {
    collectCurrentFormIntoMemory();
    
    const saveBtn = document.getElementById('btnSaveTemplate');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `
        <div class="spinner" style="width: 12px; height: 12px; border-width: 2px; margin: 0;"></div>
        <span>Menyimpan...</span>
    `;

    let savedToServer = false;
    try {
        const resp = await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentTemplates)
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data.status === 'success') savedToServer = true;
        }
    } catch (err) {
        console.warn('Backend /api/templates unavailable, saving to localStorage.');
    }

    // Always save to localStorage as local backup (works on Netlify)
    localStorage.setItem('master_templates_local', JSON.stringify(currentTemplates));

    if (savedToServer) {
        showToast('✅ Master Template berhasil disimpan ke server!');
    } else {
        showToast('✅ Master Template disimpan secara lokal di browser ini.');
    }

    closeTemplateModal();
    fetchSchedules();

    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
}

async function resetTemplateForm() {
    if (!confirm('Apakah Anda yakin ingin mengembalikan format master template ke format standar SBM ITB?')) {
        return;
    }

    let resetted = false;
    try {
        const resp = await fetch('/api/templates/reset', { method: 'POST' });
        if (resp.ok) {
            const data = await resp.json();
            if (data.status === 'success') {
                currentTemplates = data.templates || JSON.parse(JSON.stringify(CLIENT_DEFAULT_TEMPLATES));
                resetted = true;
            }
        }
    } catch (err) {
        console.warn('Backend unavailable, resetting to built-in defaults.');
    }

    if (!resetted) {
        currentTemplates = JSON.parse(JSON.stringify(CLIENT_DEFAULT_TEMPLATES));
        localStorage.removeItem('master_templates_local');
    }

    populateTemplateFormFields(activeTemplateLang);
    updateTemplatePreview();
    showToast('🔄 Master Template berhasil di-reset ke format standar SBM ITB.');
    fetchSchedules();
}
/* =========================================================================
   CLIENT-SIDE DIRECT GOOGLE SHEETS ENGINE (NETLIFY / STANDALONE MODE)
   ========================================================================= */

const GSHEET_DOC_ID = '1uZ8MoNZPe07UFYauu-5wKyqOOOfsCqNvNTYb2xCw8_w';
let clientSideDosenDb = null;
let clientSideSchedulesData = {};

async function fetchSheetCsvText(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${GSHEET_DOC_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} saat mengambil sheet ${sheetName}`);
    return await resp.text();
}

function parseCsvToRows(csvText) {
    const lines = [];
    let row = [''];
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const c = csvText[i];
        const next = csvText[i + 1];
        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push('');
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            lines.push(row);
            row = [''];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== '') lines.push(row);
    if (lines.length === 0) return [];

    const headers = lines[0].map(h => h.trim().replace(/^"|"$/g, ''));
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = (lines[i][j] || '').trim().replace(/^"|"$/g, '');
        }
        result.push(obj);
    }
    return result;
}

async function loadClientSideDosenDatabase() {
    if (clientSideDosenDb) return clientSideDosenDb;
    try {
        const csv = await fetchSheetCsvText('Data Base Dosen');
        const rows = parseCsvToRows(csv);
        const lookup = {};
        rows.forEach(r => {
            const name = (r['NAMA'] || r['Nama'] || r['Lecturer'] || '').trim();
            let phone = (r['No. Handphone'] || r['No Handphone'] || r['Phone'] || r['WA'] || '').trim();
            if (phone) {
                phone = phone.replace(/[^\d+]/g, '');
                if (phone.startsWith('08')) phone = '628' + phone.substring(2);
                else if (phone.startsWith('+62')) phone = '62' + phone.substring(3);
                else if (phone.startsWith('+')) phone = phone.substring(1);
            }
            if (name) {
                lookup[name.toLowerCase()] = {
                    name: name,
                    phone: phone,
                    domicile: (r['Domisili'] || r['Kota'] || '').trim(),
                    status: (r['Status'] || '').trim()
                };
            }
        });
        clientSideDosenDb = lookup;
        return lookup;
    } catch (e) {
        console.warn('Fallback load database dosen error:', e);
        return {};
    }
}

function parseDateString(raw) {
    if (!raw) return null;
    raw = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + 'T00:00:00');
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    }
    const clean = raw.replace(/^[A-Za-z]+,\s*/, '').trim();
    const months = {
        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
        'january': 0, 'february': 1, 'march': 2, 'june': 5, 'july': 6, 'august': 7, 'october': 9, 'december': 11
    };
    const parts = clean.split(/\s+/);
    if (parts.length >= 3) {
        const d = parseInt(parts[0]);
        const mKey = parts[1].toLowerCase();
        const y = parseInt(parts[2]);
        if (!isNaN(d) && months[mKey] !== undefined && !isNaN(y)) {
            return new Date(y, months[mKey], d);
        }
    }
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatIndonesianDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr + 'T00:00:00');
    if (isNaN(d.getTime())) return isoStr;
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

async function loadClientSideScheduleRows(prodi) {
    if (clientSideSchedulesData[prodi]) return clientSideSchedulesData[prodi];
    
    const cfg = PRODI_DATA[prodi] || PRODI_DATA['MBAJ'];
    const csvText = await fetchSheetCsvText(cfg.sheet);
    const rows = parseCsvToRows(csvText);
    const dosenLookup = await loadClientSideDosenDatabase();
    
    const schedules = [];
    rows.forEach((r, idx) => {
        const lecturerRaw = (r['Lecturer'] || r['Dosen'] || r['Nama Dosen'] || r['NAMA'] || r['Nama'] || '').trim();
        if (!lecturerRaw || lecturerRaw.toLowerCase() === 'lecturer' || lecturerRaw.toLowerCase() === 'dosen') return;
        
        const dateRaw = (r['Date'] || r['Tgl Berangkat'] || r['Hari/Tgl'] || r['Tanggal'] || r['Hari / Tanggal'] || '').trim();
        const dateObj = parseDateString(dateRaw);
        if (!dateObj) return;
        const dateIso = formatDateISO(dateObj);
        
        const course = (r['Course'] || r['Mata Kuliah'] || r['Course Title'] || '').trim();
        const program = (r['Program'] || r['Class'] || r['Kelas'] || cfg.name).trim();
        const time = (r['Time'] || r['Waktu'] || r['Jam'] || '').trim();
        const room = (r['Room'] || r['Ruangan'] || r['Room '] || '').trim();
        const mentors = (r['Mentors'] || r['Mentor'] || '').trim();
        const remarks = (r['Remarks'] || r['Catatan'] || '').trim();
        const examType = (r['Exam Type'] || r['Jenis Ujian'] || '').trim();
        const isExam = examType !== '' || /exam|uas|uts|ujian/i.test(course) || /exam|uas|uts|ujian/i.test(remarks);
        
        const contact = dosenLookup[lecturerRaw.toLowerCase()] || {};
        const phone = contact.phone || '';
        const domicile = contact.domicile || '';
        const status = contact.status || '';

        schedules.push({
            id: `${prodi}_${idx}`,
            prodi: prodi,
            program: program,
            class_type: program,
            course: course,
            lecturer: lecturerRaw,
            date: dateIso,
            day: formatIndonesianDate(dateIso).split(',')[0],
            formatted_date: formatIndonesianDate(dateIso),
            time: time,
            room: room || cfg.defaultLocation,
            mentors: mentors,
            remarks: remarks,
            is_exam: isExam,
            exam_type: examType,
            phone: phone,
            domicile: domicile,
            status: status
        });
    });
    
    clientSideSchedulesData[prodi] = schedules;
    return schedules;
}

function calculateClientSideWeeks(schedules) {
    if (!schedules || schedules.length === 0) return [];
    const dateObjs = schedules.map(s => new Date(s.date + 'T00:00:00')).filter(d => !isNaN(d.getTime()));
    if (dateObjs.length === 0) return [];
    dateObjs.sort((a, b) => a - b);
    
    const minDate = dateObjs[0];
    const maxDate = dateObjs[dateObjs.length - 1];
    
    let firstSat = new Date(minDate);
    const dayOfWeek = firstSat.getDay();
    const daysSinceSat = (dayOfWeek + 1) % 7;
    firstSat.setDate(firstSat.getDate() - daysSinceSat);
    
    const weeks = [];
    let curSat = new Date(firstSat);
    let weekNum = 1;
    
    while (curSat <= maxDate || weeks.length === 0) {
        const curSun = new Date(curSat); curSun.setDate(curSat.getDate() + 1);
        const curMon = new Date(curSat); curMon.setDate(curSat.getDate() + 2);
        const curFri = new Date(curSat); curFri.setDate(curSat.getDate() + 6);
        
        weeks.push({
            week_number: weekNum,
            label: `Minggu ${weekNum} (${curSat.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][curSat.getMonth()]} - ${curFri.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][curFri.getMonth()]})`,
            start_date: formatDateISO(curSat),
            end_date: formatDateISO(curFri),
            weekend_start: formatDateISO(curSat),
            weekend_end: formatDateISO(curSun),
            weekday_start: formatDateISO(curMon),
            weekday_end: formatDateISO(curFri)
        });
        
        curSat.setDate(curSat.getDate() + 7);
        weekNum++;
        if (weekNum > 30) break;
    }
    return weeks;
}

function buildClientSideWhatsAppMessage(lec, prodi, lang = 'id') {
    const cfg = PRODI_DATA[prodi] || PRODI_DATA['MBAJ'];
    const prodiGreeting = cfg.name;
    const isEnglish = (lang === 'en');
    
    let intro = isEnglish 
        ? `Good morning. We would like to confirm and remind you of the upcoming lecture schedule at ${prodiGreeting} as follows:\n`
        : `Selamat pagi. Izin konfirmasi dan reminder untuk jadwal perkuliahan di ${prodiGreeting} mendatang sebagai berikut :\n`;
        
    let lines = [intro];
    
    lec.sessions.forEach((s, idx) => {
        const prefix = lec.sessions.length > 1 ? `*Jadwal ${idx + 1}:*\n` : '';
        if (prefix) lines.push(prefix);
        
        lines.push(`${isEnglish ? 'Program' : 'Program'} : ${s.program}`);
        lines.push(`${isEnglish ? 'Course' : 'Mata Kuliah'} : ${s.course}`);
        lines.push(`${isEnglish ? 'Day, Date' : 'Hari, Tanggal'} : ${s.formatted_date}`);
        lines.push(`${isEnglish ? 'Time' : 'Waktu'} : ${s.time} WIB`);
        lines.push(`${isEnglish ? 'Room' : 'Ruangan'} : ${s.room}`);
        
        if (s.guest_lecturer) {
            lines.push(`${isEnglish ? 'Guest Lecturer' : 'Dosen Tamu'} : ${s.guest_lecturer}`);
        }
        if (s.mentors) {
            lines.push(`Mentor : ${s.mentors}`);
        }
        if (s.remarks) {
            lines.push(`${isEnglish ? 'Remarks' : 'Catatan'} : ${s.remarks}`);
        }
        if (s.is_exam) {
            lines.push(`\nMohon konfirmasi apakah ujian akan dilaksanakan secara offline di kampus, online, atau take-home exam?`);
        }
        lines.push('');
    });
    
    lines.push(isEnglish ? `Thank you for your attention.` : `Demikian kami informasikan, Terima kasih.`);
    return lines.join('\n');
}

async function loadClientSideMetadata(prodi) {
    try {
        const syncTs = document.getElementById('syncTimestamp');
        if (syncTs) syncTs.textContent = 'Terhubung ke Google Sheets (Mode Netlify)';
        
        const schedules = await loadClientSideScheduleRows(prodi);
        availableWeeks = calculateClientSideWeeks(schedules);
        populateWeekDropdown();
        
        currentFilterType = 'weekend';
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.type === currentFilterType);
        });

        if (availableWeeks.length > 0) {
            selectedWeek = availableWeeks[0];
            document.getElementById('selectWeek').value = selectedWeek.week_number;
            applyWeekFilterDates(selectedWeek, currentFilterType);
        }
        await fetchClientSideSchedules();
    } catch (e) {
        console.error('Client-side meta error:', e);
        showToast('❌ Gagal memuat data dari Google Sheets. Pastikan internet Anda aktif.');
    }
}

async function fetchClientSideSchedules() {
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');
    const list = document.getElementById('lecturersList');
    
    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (list) list.innerHTML = '';

    try {
        const schedules = await loadClientSideScheduleRows(currentProdi);
        const startDate = document.getElementById('startDate')?.value || '';
        const endDate = document.getElementById('endDate')?.value || '';
        const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
        
        // Filter by date range
        let filtered = schedules;
        if (startDate && endDate) {
            filtered = filtered.filter(s => s.date >= startDate && s.date <= endDate);
        }
        
        if (search) {
            filtered = filtered.filter(s => 
                s.lecturer.toLowerCase().includes(search) || 
                s.course.toLowerCase().includes(search) || 
                s.program.toLowerCase().includes(search)
            );
        }
        
        // Consolidate 1 lecturer = 1 card
        const lecMap = new Map();
        filtered.forEach(s => {
            if (!lecMap.has(s.lecturer)) {
                // Check overrides in localStorage
                const customPhone = localStorage.getItem(`override_phone_${s.lecturer}`) || s.phone;
                const sentKey = `sent_${s.lecturer}_${startDate}_${endDate}`;
                const isSent = localStorage.getItem(sentKey) === 'true';
                
                lecMap.set(s.lecturer, {
                    lecturer: s.lecturer,
                    phone: customPhone,
                    domicile: s.domicile,
                    status: s.status,
                    total_sessions: 0,
                    sessions: [],
                    is_sent: isSent,
                    lang: currentGlobalLang,
                    whatsapp_message: ''
                });
            }
            const lecObj = lecMap.get(s.lecturer);
            lecObj.sessions.push(s);
            lecObj.total_sessions++;
        });
        
        currentLecturers = Array.from(lecMap.values());
        currentLecturers.forEach(lec => {
            lec.whatsapp_message = buildClientSideWhatsAppMessage(lec, currentProdi, lec.lang);
        });
        
        updateMetrics({
            count: currentLecturers.length,
            total_sessions: filtered.length
        });
        renderLecturerCards();
    } catch (e) {
        console.error('Client side schedule error:', e);
        showToast('❌ Gagal memuat jadwal dari Google Sheets.');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}




