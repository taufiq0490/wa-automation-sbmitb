import os
import re
import time
import urllib.parse
import threading
import queue
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROFILE_DIR = os.path.join(BASE_DIR, "wa_browser_profile")

class WhatsAppManager:
    def __init__(self):
        self.task_queue = queue.Queue()
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.playwright = None
        self.context = None
        self.page = None
        self.is_ready = False
        self.is_logged_in_cache = False
        self._browser_started = False
        self.worker_thread.start()

    def _ensure_browser(self):
        """Starts persistent browser on demand without unsupported flags and with full responsive viewport."""
        if self._browser_started and self.page and not self.page.is_closed():
            return True
        try:
            if not self.playwright:
                self.playwright = sync_playwright().start()
            os.makedirs(PROFILE_DIR, exist_ok=True)
            
            # Clean stale locks if any
            for lock_file in ["SingletonLock", "SingletonSocket", "SingletonCookie"]:
                lf = os.path.join(PROFILE_DIR, lock_file)
                if os.path.exists(lf):
                    try:
                        os.remove(lf)
                    except Exception:
                        pass

            # Launch without --no-sandbox to avoid warning bar, and with no_viewport=True to fill 100% of window
            self.context = self.playwright.chromium.launch_persistent_context(
                user_data_dir=PROFILE_DIR,
                channel="msedge",
                headless=False,
                no_viewport=True,
                args=[
                    "--start-maximized",
                    "--disable-blink-features=AutomationControlled"
                ]
            )
            self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
            self.page.goto("https://web.whatsapp.com", wait_until="domcontentloaded", timeout=60000)
            self._browser_started = True
            self.is_ready = True
            return True
        except Exception as e:
            print(f"[WA Browser Start Error]: {e}")
            self.is_ready = False
            return False

    def _worker_loop(self):
        """Dedicated thread for Playwright execution to ensure thread-safety."""
        while True:
            try:
                task = self.task_queue.get()
                if task is None:
                    break
                action, args, result_queue = task
                try:
                    if action == "status":
                        res = self._check_status()
                    elif action == "connect":
                        res = self._connect()
                    elif action == "contacts":
                        res = self._get_wa_contacts()
                    elif action == "send":
                        res = self._send_message(
                            args.get("phone"),
                            args.get("message"),
                            args.get("attachment_path")
                        )
                    else:
                        res = {"success": False, "error": f"Unknown action {action}"}
                except Exception as ex:
                    res = {"success": False, "error": str(ex)}
                
                result_queue.put(res)
            except Exception as e:
                print(f"[WA Worker Loop Error]: {e}")

    def _check_status(self):
        if not self._browser_started:
            return {"logged_in": False, "status": "not_started"}
        if not self.page or self.page.is_closed():
            return {"logged_in": False, "status": "closed"}
        
        try:
            is_logged = (
                self.page.locator("#pane-side").count() > 0 or
                self.page.locator("div[data-tab='3']").count() > 0 or
                self.page.locator("header").count() > 0
            )
            self.is_logged_in_cache = is_logged
            return {
                "logged_in": is_logged,
                "status": "ready" if is_logged else "qr_required"
            }
        except Exception as e:
            return {"logged_in": False, "status": f"error: {str(e)}"}

    def _connect(self):
        if not self._ensure_browser():
            return {"success": False, "message": "Gagal membuka browser Edge."}
        try:
            self.page.bring_to_front()
            self.page.goto("https://web.whatsapp.com", wait_until="domcontentloaded", timeout=30000)
            status = self._check_status()
            return {"success": True, **status}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _get_wa_contacts(self):
        if not self._ensure_browser():
            return {"success": False, "error": "Browser WhatsApp belum aktif."}
        status = self._check_status()
        if not status.get("logged_in"):
            return {
                "success": False,
                "error": "WhatsApp Web belum terhubung/login. Silakan klik 'Hubungkan WhatsApp' dan scan QR code terlebih dahulu."
            }

        try:
            contacts = self.page.evaluate(r"""
                async () => {
                    const contactsMap = {};

                    function addContact(rawId, rawName, pushname, isMyContact) {
                        if (!rawId) return;
                        const idStr = (typeof rawId === 'object') ? (rawId._serialized || rawId.user || '') : String(rawId);
                        
                        // Ignore broadcast, status, newsletter channels
                        if (idStr.includes('status') || idStr.includes('broadcast') || idStr.includes('newsletter') || idStr.includes('call')) {
                            return;
                        }

                        // Extract phone from JID or string
                        let phone = idStr.replace(/@c\.us|@s\.whatsapp\.net|@g\.us/gi, '').replace(/[^0-9]/g, '');
                        if (!phone || phone.length < 8) return;

                        // Normalize Indonesia phone if needed
                        if (phone.startsWith('08')) phone = '628' + phone.substring(2);

                        let name = (rawName || '').trim();
                        if (!name || name === phone) {
                            name = (pushname || '').trim();
                        }
                        if (!name) {
                            name = phone;
                        }

                        if (!contactsMap[phone]) {
                            contactsMap[phone] = {
                                id: idStr,
                                name: name,
                                phone: phone,
                                pushname: pushname || '',
                                is_my_contact: !!isMyContact
                            };
                        } else {
                            if (contactsMap[phone].name === phone && name !== phone) {
                                contactsMap[phone].name = name;
                            }
                            if (isMyContact) {
                                contactsMap[phone].is_my_contact = true;
                            }
                        }
                    }

                    // --- Method 1: window.Store & Webpack Collections (< 5ms) ---
                    try {
                        if (window.Store) {
                            if (window.Store.Contact && window.Store.Contact.models) {
                                window.Store.Contact.models.forEach(m => {
                                    addContact(m.id || m.__x_id, m.name || m.formattedName || m.__x_name, m.pushname || m.__x_pushname, m.isMyContact || m.__x_isMyContact);
                                });
                            }
                            if (window.Store.Chat && window.Store.Chat.models) {
                                window.Store.Chat.models.forEach(m => {
                                    addContact(m.id || m.__x_id, m.name || m.formattedTitle || m.__x_name, '', false);
                                });
                            }
                        }

                        if (window.require) {
                            try {
                                const ContactCol = window.require('WAWebContactCollection');
                                const contactsArr = ContactCol?.ContactCollection?.models || ContactCol?.default?.getModelsArray?.() || [];
                                contactsArr.forEach(m => {
                                    addContact(m.id, m.name || m.formattedName, m.pushname, m.isMyContact);
                                });
                            } catch (e) {}

                            try {
                                const ChatCol = window.require('WAWebChatCollection');
                                const chatsArr = ChatCol?.ChatCollection?.models || ChatCol?.default?.getModelsArray?.() || [];
                                chatsArr.forEach(m => {
                                    addContact(m.id, m.name || m.formattedTitle, '', false);
                                });
                            } catch (e) {}
                        }
                    } catch (e) {}

                    // --- Method 2: Fast Parallel IndexedDB with 1.2s timeout ---
                    const readIndexedDBFast = () => new Promise((resolve) => {
                        const timer = setTimeout(() => resolve(), 1200);
                        try {
                            const req = indexedDB.open('model-storage');
                            req.onsuccess = (e) => {
                                const db = e.target.result;
                                const storeNames = ['contact', 'chat'].filter(s => db.objectStoreNames && db.objectStoreNames.contains(s));
                                if (storeNames.length === 0) {
                                    clearTimeout(timer);
                                    db.close();
                                    resolve();
                                    return;
                                }
                                let remaining = storeNames.length;
                                storeNames.forEach(storeName => {
                                    try {
                                        const tx = db.transaction(storeName, 'readonly');
                                        const store = tx.objectStore(storeName);
                                        const getAllReq = store.getAll();
                                        getAllReq.onsuccess = () => {
                                            (getAllReq.result || []).forEach(item => {
                                                if (!item) return;
                                                const rawId = item.id || item.jid || item.user || item.wid;
                                                const rawName = item.name || item.formattedTitle || item.verifiedName || item.formattedName || item.displayName || '';
                                                addContact(rawId, rawName, item.pushname, item.isMyContact);
                                            });
                                            remaining--;
                                            if (remaining <= 0) {
                                                clearTimeout(timer);
                                                db.close();
                                                resolve();
                                            }
                                        };
                                        getAllReq.onerror = () => {
                                            remaining--;
                                            if (remaining <= 0) {
                                                clearTimeout(timer);
                                                db.close();
                                                resolve();
                                            }
                                        };
                                    } catch (err) {
                                        remaining--;
                                        if (remaining <= 0) {
                                            clearTimeout(timer);
                                            db.close();
                                            resolve();
                                        }
                                    }
                                });
                            };
                            req.onerror = () => {
                                clearTimeout(timer);
                                resolve();
                            };
                        } catch (err) {
                            clearTimeout(timer);
                            resolve();
                        }
                    });

                    await readIndexedDBFast();

                    // --- Method 3: DOM Scraping from WhatsApp Web Sidebar (< 10ms) ---
                    try {
                        const chatItems = document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"], div[data-testid="cell-frame-container"]');
                        chatItems.forEach(el => {
                            const titleEl = el.querySelector('span[title], span[dir="auto"]');
                            const name = titleEl ? (titleEl.getAttribute('title') || titleEl.textContent || '').trim() : '';
                            const fullText = el.innerText || '';
                            const phoneMatches = fullText.match(/(?:\+62|62|08)[0-9\s\-]{8,15}/g);
                            if (phoneMatches) {
                                phoneMatches.forEach(p => {
                                    const cleanP = p.replace(/[^0-9]/g, '');
                                    addContact(cleanP + '@c.us', name || cleanP, '', false);
                                });
                            } else if (name) {
                                const cleanNamePhone = name.replace(/[^0-9]/g, '');
                                if (cleanNamePhone.length >= 9 && (cleanNamePhone.startsWith('62') || cleanNamePhone.startsWith('08'))) {
                                    addContact(cleanNamePhone + '@c.us', name, '', false);
                                }
                            }
                        });
                    } catch (e) {}

                    return Object.values(contactsMap);
                }
            """)

            # Sort contacts alphabetically by name
            contacts_list = sorted(contacts or [], key=lambda x: str(x.get("name", "")).lower())
            return {
                "success": True,
                "contacts": contacts_list,
                "total": len(contacts_list)
            }
        except Exception as e:
            return {"success": False, "error": f"Gagal membaca kontak WhatsApp: {str(e)}"}

    def _send_message(self, phone, message, attachment_path=None):
        if not self._ensure_browser():
            return {"success": False, "error": "Gagal memulai service browser WhatsApp."}
            
        status = self._check_status()
        if not status.get("logged_in"):
            return {
                "success": False,
                "error": "WhatsApp Web belum login. Silakan klik 'Hubungkan WhatsApp' dan scan QR code terlebih dahulu."
            }

        try:
            clean_phone = re.sub(r"[^\d]", "", str(phone or ""))
            if clean_phone.startswith("08"):
                clean_phone = "628" + clean_phone[2:]
            elif clean_phone.startswith("+"):
                clean_phone = clean_phone[1:]
                
            has_attachment = bool(attachment_path and os.path.exists(attachment_path))
            
            # If sending text without attachment, encode message directly into URL
            encoded_text = urllib.parse.quote(message) if (message and not has_attachment) else ""
            target_url = f"https://web.whatsapp.com/send?phone={clean_phone}&text={encoded_text}"
            
            try:
                self.page.goto(target_url, wait_until="domcontentloaded", timeout=45000)
            except Exception as nav_ex:
                print(f"[WA Nav Warning]: {nav_ex}")
            
            send_btn_selector = (
                'button[aria-label="Send"], button[aria-label="Kirim"], '
                '[data-icon="send"], button:has([data-icon="send"]), '
                '[data-testid="send"], [data-testid="compose-btn-send"], '
                'div[role="button"][aria-label="Send"], div[role="button"][aria-label="Kirim"], '
                'span[data-icon="send"]'
            )
            input_box_selector = (
                'footer div[contenteditable="true"], '
                'div[data-tab="10"][contenteditable="true"], '
                'div[data-tab="1"][contenteditable="true"], '
                'div[data-lexical-editor="true"], '
                'footer [role="textbox"], '
                'div[role="textbox"][contenteditable="true"]'
            )
            invalid_phone_selector = (
                'div[data-animate-modal-popup="true"], div[role="dialog"], [data-testid="popup-contents"]'
            )
            mic_selector = (
                '[data-icon="ptt"], [data-icon="audio-mic"], '
                'button[aria-label="Voice message"], button[aria-label="Pesan suara"], '
                '[data-testid="ptt"]'
            )
            
            start_time = time.time()
            sent_success = False
            last_attempt_time = 0
            attachment_uploaded = False
            
            while time.time() - start_time < 50:
                # 1. Check for invalid phone number popup
                if self.page.locator(invalid_phone_selector).count() > 0:
                    try:
                        popup = self.page.locator(invalid_phone_selector).first
                        if popup.is_visible():
                            popup_text = popup.inner_text().lower()
                            if any(w in popup_text for w in ["invalid", "tidak valid", "tidak terdaftar", "url"]):
                                ok_btn = self.page.locator('div[role="dialog"] button, div[data-animate-modal-popup="true"] button')
                                if ok_btn.count() > 0 and ok_btn.first.is_visible():
                                    try:
                                        ok_btn.first.click()
                                    except Exception:
                                        pass
                                return {"success": False, "error": f"Nomor {phone} tidak terdaftar di WhatsApp atau format tidak valid."}
                    except Exception:
                        pass

                # 2. If attachment is provided, handle file upload first
                if has_attachment and not attachment_uploaded:
                    file_inputs = self.page.locator('input[type="file"]')
                    if file_inputs.count() > 0:
                        try:
                            # Use the last file input (accept="*")
                            file_inputs.last.set_input_files(attachment_path)
                            attachment_uploaded = True
                            time.sleep(2.0) # Wait for preview modal to open
                        except Exception as up_ex:
                            print(f"[WA Attachment Upload Warning]: {up_ex}")
                    else:
                        # If hidden input not ready, click attach menu if present
                        attach_btn = self.page.locator('button[aria-label="Attach"], button[aria-label="Lampirkan"], [data-icon="plus"], [data-icon="attach-menu-plus"]')
                        if attach_btn.count() > 0 and attach_btn.first.is_visible():
                            try:
                                attach_btn.first.click()
                                time.sleep(0.5)
                            except Exception:
                                pass

                # 3. Check input box and send button
                inputs = self.page.locator(input_box_selector)
                send_btns = self.page.locator(send_btn_selector)
                
                has_input = inputs.count() > 0 and inputs.first.is_visible()
                has_send_btn = send_btns.count() > 0 and send_btns.first.is_visible()
                
                if has_input or has_send_btn:
                    now = time.time()
                    
                    # If attachment modal is active and message is provided, insert message as caption
                    if has_attachment and message and inputs.count() > 0:
                        caption_el = inputs.first
                        try:
                            curr_cap = caption_el.inner_text().strip()
                        except Exception:
                            curr_cap = ""
                            
                        if not curr_cap and (now - start_time > 2):
                            try:
                                caption_el.focus()
                                self.page.keyboard.insert_text(message)
                                time.sleep(0.5)
                            except Exception:
                                pass
                    
                    # If send button is visible, click it
                    if has_send_btn:
                        if now - last_attempt_time >= 2:
                            try:
                                send_btns.first.click(timeout=3000)
                                last_attempt_time = now
                            except Exception:
                                pass
                    elif has_input and not has_attachment:
                        input_el = inputs.first
                        # Check text inside input
                        try:
                            current_text = input_el.inner_text().strip()
                        except Exception:
                            current_text = ""
                            
                        if not current_text and (now - start_time > 4):
                            # Fallback if text param not loaded by WhatsApp Web
                            try:
                                input_el.focus()
                                self.page.keyboard.insert_text(message)
                                time.sleep(0.5)
                            except Exception:
                                pass
                        elif current_text:
                            # Text is present, press Enter
                            if now - last_attempt_time >= 2:
                                try:
                                    input_el.focus()
                                    self.page.keyboard.press("Enter")
                                    last_attempt_time = now
                                except Exception:
                                    pass

                    # 4. Verify if sent!
                    if last_attempt_time > 0:
                        time.sleep(1.5)
                        curr_has_send = self.page.locator(send_btn_selector).count() > 0 and self.page.locator(send_btn_selector).first.is_visible()
                        curr_has_mic = self.page.locator(mic_selector).count() > 0 and self.page.locator(mic_selector).first.is_visible()
                        
                        # Sent confirmed if send button is gone and mic is back, or modal closed
                        if (curr_has_mic and not curr_has_send) or (not curr_has_send and not has_attachment):
                            sent_success = True
                            break
                        elif has_attachment and not curr_has_send:
                            sent_success = True
                            break
                
                time.sleep(1)

            if not sent_success:
                return {"success": False, "error": "Gagal mengirim: pesan masih tertahan di draft atau tombol kirim belum merespons."}
                
            time.sleep(2.0)
            return {"success": True, "message": f"Pesan berhasil dikirim ke {phone}"}
            
        except Exception as e:
            return {"success": False, "error": f"Gagal mengirim pesan: {str(e)}"}

    def run_task(self, action, args=None, timeout=60):
        """Thread-safe caller that puts task in queue and waits for result."""
        res_q = queue.Queue()
        self.task_queue.put((action, args or {}, res_q))
        try:
            return res_q.get(timeout=timeout)
        except queue.Empty:
            return {"success": False, "error": "Request timeout."}

wa_manager = WhatsAppManager()
