import copy
import json
import os
import re
import time
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, send_file
from data_sync import PRODI_CONFIG, load_schedule, load_all_contacts, load_database_dosen, extract_first_name
from message_builder import build_whatsapp_message, DEFAULT_TEMPLATES
from wa_service import wa_manager
from werkzeug.utils import secure_filename

app = Flask(__name__)

# File Paths for persistence
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
OVERRIDES_FILE = os.path.join(DATA_DIR, "overrides.json")
SENT_LOG_FILE = os.path.join(DATA_DIR, "sent_log.json")
TEMPLATES_FILE = os.path.join(DATA_DIR, "message_templates.json")
BLAST_LOG_FILE = os.path.join(DATA_DIR, "blast_log.json")
BROADCAST_TEMPLATES_FILE = os.path.join(DATA_DIR, "broadcast_templates.json")
PINS_FILE = os.path.join(DATA_DIR, "pins.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

DEFAULT_PINS = {
    "SM": "1234",
    "SW": "1234",
    "MBAJ": "1234",
    "MBAB": "1234",
    "MSM": "1234",
    "DSM": "1234"
}

# In-Memory Cache
CACHE = {
    "schedules": {},        # Dict by prodi: {"MBAJ": [...], "SW": [...], ...}
    "all_contacts": [],
    "last_fetched": {},     # Dict by prodi: {"MBAJ": "...", ...}
    "dosen_lookup": None,
    "pins": copy.deepcopy(DEFAULT_PINS),
    "overrides": {},
    "sent_log": {},
    "templates": {},
    "broadcast_templates": [],
    "blast_history": []
}

def load_local_storage():
    """Loads saved overrides, templates, sent logs, PINs, and blast logs from disk."""
    if os.path.exists(PINS_FILE):
        try:
            with open(PINS_FILE, "r", encoding="utf-8") as f:
                CACHE["pins"] = json.load(f)
        except Exception as e:
            print(f"Error loading PINs: {e}")
            CACHE["pins"] = copy.deepcopy(DEFAULT_PINS)
    else:
        CACHE["pins"] = copy.deepcopy(DEFAULT_PINS)
        save_pins()

    if os.path.exists(OVERRIDES_FILE):
        try:
            with open(OVERRIDES_FILE, "r", encoding="utf-8") as f:
                CACHE["overrides"] = json.load(f)
        except Exception as e:
            print(f"Error loading overrides: {e}")
            CACHE["overrides"] = {}

    if os.path.exists(SENT_LOG_FILE):
        try:
            with open(SENT_LOG_FILE, "r", encoding="utf-8") as f:
                CACHE["sent_log"] = json.load(f)
        except Exception as e:
            print(f"Error loading sent log: {e}")
            CACHE["sent_log"] = {}

    if os.path.exists(TEMPLATES_FILE):
        try:
            with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
                CACHE["templates"] = json.load(f)
        except Exception as e:
            print(f"Error loading templates: {e}")
            CACHE["templates"] = copy.deepcopy(DEFAULT_TEMPLATES)
    else:
        CACHE["templates"] = copy.deepcopy(DEFAULT_TEMPLATES)
        save_templates()

    if os.path.exists(BLAST_LOG_FILE):
        try:
            with open(BLAST_LOG_FILE, "r", encoding="utf-8") as f:
                CACHE["blast_history"] = json.load(f)
        except Exception as e:
            print(f"Error loading blast log: {e}")
            CACHE["blast_history"] = []

    if os.path.exists(BROADCAST_TEMPLATES_FILE):
        try:
            with open(BROADCAST_TEMPLATES_FILE, "r", encoding="utf-8") as f:
                CACHE["broadcast_templates"] = json.load(f)
        except Exception as e:
            print(f"Error loading broadcast templates: {e}")
            CACHE["broadcast_templates"] = []
    else:
        CACHE["broadcast_templates"] = []

def save_pins():
    try:
        with open(PINS_FILE, "w", encoding="utf-8") as f:
            json.dump(CACHE["pins"], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving PINs: {e}")

def save_overrides():
    try:
        with open(OVERRIDES_FILE, "w", encoding="utf-8") as f:
            json.dump(CACHE["overrides"], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving overrides: {e}")

def save_sent_log():
    try:
        with open(SENT_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(CACHE["sent_log"], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving sent log: {e}")

def save_templates():
    try:
        with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
            json.dump(CACHE["templates"], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving templates: {e}")

def save_blast_log():
    try:
        with open(BLAST_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(CACHE["blast_history"][-100:], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving blast log: {e}")

def save_broadcast_templates():
    try:
        with open(BROADCAST_TEMPLATES_FILE, "w", encoding="utf-8") as f:
            json.dump(CACHE["broadcast_templates"], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving broadcast templates: {e}")

def ensure_dosen_lookup():
    if CACHE["dosen_lookup"] is None:
        lookup, _ = load_database_dosen()
        CACHE["dosen_lookup"] = lookup
    return CACHE["dosen_lookup"]

def ensure_data(prodi="MBAJ", force=False):
    if prodi not in PRODI_CONFIG:
        prodi = "MBAJ"
        
    lookup = ensure_dosen_lookup()
    if force or prodi not in CACHE["schedules"] or not CACHE["schedules"][prodi]:
        print(f"Fetching fresh data from Google Sheets for Prodi {prodi} ({PRODI_CONFIG[prodi]['sheet_name']})...")
        CACHE["schedules"][prodi] = load_schedule(prodi, lookup)
        CACHE["last_fetched"][prodi] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"Loaded {len(CACHE['schedules'][prodi])} schedule rows for {prodi}.")
        
    if force or not CACHE["all_contacts"]:
        try:
            # Combine schedules for all known prodi for broadcast contacts
            all_scheds = []
            for p, s_list in CACHE["schedules"].items():
                all_scheds.extend(s_list)
            CACHE["all_contacts"] = load_all_contacts(all_scheds if all_scheds else None)
        except Exception as e:
            print(f"Error loading contacts: {e}")
            CACHE["all_contacts"] = []

# Group dates into weeks (Saturday to Friday cycle)
def get_available_weeks(schedules):
    """Calculates weekly buckets from Saturday to Friday (Weekend first)."""
    date_objs = []
    for s in schedules:
        if s.get("iso_date"):
            try:
                date_objs.append(datetime.strptime(s["iso_date"], "%Y-%m-%d"))
            except Exception:
                pass
                
    if not date_objs:
        return []
        
    date_objs.sort()
    min_date = date_objs[0]
    max_date = date_objs[-1]
    
    days_since_sat = (min_date.weekday() - 5) % 7
    cur_sat = min_date - timedelta(days=days_since_sat)
    
    weeks = []
    week_num = 1
    
    while cur_sat <= max_date:
        cur_sun = cur_sat + timedelta(days=1)
        cur_mon = cur_sat + timedelta(days=2)
        cur_fri = cur_sat + timedelta(days=6)
        
        has_classes = any(
            cur_sat.strftime("%Y-%m-%d") <= s.get("iso_date", "") <= cur_fri.strftime("%Y-%m-%d")
            for s in schedules
        )
        
        if has_classes:
            weeks.append({
                "week_number": week_num,
                "label": f"Week {week_num} ({cur_sat.strftime('%d %b')} - {cur_fri.strftime('%d %b %Y')})",
                "start_date": cur_sat.strftime("%Y-%m-%d"),
                "end_date": cur_fri.strftime("%Y-%m-%d"),
                "weekend_start": cur_sat.strftime("%Y-%m-%d"),
                "weekend_end": cur_sun.strftime("%Y-%m-%d"),
                "weekday_start": cur_mon.strftime("%Y-%m-%d"),
                "weekday_end": cur_fri.strftime("%Y-%m-%d")
            })
            week_num += 1
            
        cur_sat += timedelta(days=7)
        
    return weeks

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/prodi")
def api_prodi_list():
    prodi_list = []
    for code, cfg in PRODI_CONFIG.items():
        prodi_list.append({
            "code": code,
            "name": cfg["name"],
            "sheet_name": cfg["sheet_name"],
            "default_location": cfg["default_location"],
            "greeting_name": cfg["greeting_name"],
            "icon": cfg.get("icon", "🎓")
        })
    return jsonify({
        "status": "success",
        "prodis": prodi_list
    })

@app.route("/api/pins/verify", methods=["POST"])
def api_verify_pin():
    data = request.json or {}
    prodi = (data.get("prodi") or "").strip().upper()
    pin = str(data.get("pin") or "").strip()
    
    if not prodi or prodi not in PRODI_CONFIG:
        return jsonify({"status": "error", "message": "Prodi tidak valid"}), 400
        
    expected_pin = CACHE["pins"].get(prodi, "1234")
    if pin == expected_pin:
        return jsonify({"status": "success", "valid": True, "prodi": prodi})
    else:
        return jsonify({"status": "error", "valid": False, "message": "PIN yang Anda masukkan salah."}), 401

@app.route("/api/pins/update", methods=["POST"])
def api_update_pin():
    data = request.json or {}
    prodi = (data.get("prodi") or "").strip().upper()
    old_pin = str(data.get("old_pin") or "").strip()
    new_pin = str(data.get("new_pin") or "").strip()
    
    if not prodi or prodi not in PRODI_CONFIG:
        return jsonify({"status": "error", "message": "Prodi tidak valid"}), 400
    if not new_pin or len(new_pin) < 4:
        return jsonify({"status": "error", "message": "PIN baru minimal 4 karakter / angka."}), 400
        
    expected_pin = CACHE["pins"].get(prodi, "1234")
    if old_pin != expected_pin:
        return jsonify({"status": "error", "message": "PIN lama salah."}), 401
        
    CACHE["pins"][prodi] = new_pin
    save_pins()
    return jsonify({
        "status": "success",
        "message": f"PIN untuk Prodi {prodi} berhasil diperbarui!",
        "prodi": prodi
    })

@app.route("/api/meta")
def api_meta():
    prodi = request.args.get("prodi", "MBAJ").strip().upper()
    if prodi not in PRODI_CONFIG:
        prodi = "MBAJ"
        
    ensure_data(prodi)
    schedules = CACHE["schedules"].get(prodi, [])
    weeks = get_available_weeks(schedules)
    
    now = datetime.now()
    day_of_week = now.weekday()
    
    if day_of_week in [0, 1, 2]:
        rec_type = "weekend"
        days_to_sat = (5 - day_of_week)
        target_sat = now + timedelta(days=days_to_sat)
    else:
        rec_type = "weekday"
        if day_of_week in [3, 4]:
            target_sat = now + timedelta(days=(5 - day_of_week))
        else:
            target_sat = now - timedelta(days=(day_of_week - 5))
            
    target_sat_str = target_sat.strftime("%Y-%m-%d")
    
    matched_week_num = 1
    for w in weeks:
        if w["weekend_start"] == target_sat_str:
            matched_week_num = w["week_number"]
            break
        elif w["start_date"] <= target_sat_str <= w["end_date"]:
            matched_week_num = w["week_number"]
            break
            
    return jsonify({
        "prodi": prodi,
        "prodi_info": PRODI_CONFIG.get(prodi, {}),
        "last_fetched": CACHE["last_fetched"].get(prodi),
        "total_rows": len(schedules),
        "weeks": weeks,
        "recommended_week": matched_week_num,
        "recommended_type": rec_type,
        "today_day_name": now.strftime("%A"),
        "today_date": now.strftime("%Y-%m-%d")
    })

@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    data = request.json or {}
    prodi = data.get("prodi") or request.args.get("prodi", "MBAJ")
    prodi = prodi.strip().upper()
    if prodi not in PRODI_CONFIG:
        prodi = "MBAJ"
        
    ensure_data(prodi, force=True)
    schedules = CACHE["schedules"].get(prodi, [])
    weeks = get_available_weeks(schedules)
    return jsonify({
        "status": "success",
        "message": f"Data Prodi {prodi} berhasil diperbarui dari Google Sheets. Total: {len(schedules)} jadwal.",
        "last_fetched": CACHE["last_fetched"].get(prodi),
        "weeks": weeks,
        "prodi": prodi
    })

@app.route("/api/templates", methods=["GET"])
def api_get_templates():
    if not CACHE.get("templates"):
        load_local_storage()
    return jsonify({
        "templates": CACHE.get("templates", {}),
        "defaults": DEFAULT_TEMPLATES
    })

@app.route("/api/templates", methods=["POST"])
def api_save_templates():
    data = request.json or {}
    if not isinstance(data, dict):
        return jsonify({"status": "error", "message": "Invalid template data format"}), 400
    
    if not CACHE.get("templates"):
        CACHE["templates"] = copy.deepcopy(DEFAULT_TEMPLATES)
        
    if "id" in data and isinstance(data["id"], dict):
        if "id" not in CACHE["templates"]:
            CACHE["templates"]["id"] = {}
        CACHE["templates"]["id"].update(data["id"])
        
    if "en" in data and isinstance(data["en"], dict):
        if "en" not in CACHE["templates"]:
            CACHE["templates"]["en"] = {}
        CACHE["templates"]["en"].update(data["en"])
        
    save_templates()
    return jsonify({
        "status": "success",
        "message": "Master message templates saved successfully.",
        "templates": CACHE["templates"]
    })

@app.route("/api/templates/reset", methods=["POST"])
def api_reset_templates():
    CACHE["templates"] = copy.deepcopy(DEFAULT_TEMPLATES)
    save_templates()
    return jsonify({
        "status": "success",
        "message": "Master templates have been reset to default standard.",
        "templates": CACHE["templates"]
    })

@app.route("/api/schedules")
def api_schedules():
    prodi = request.args.get("prodi", "MBAJ").strip().upper()
    if prodi not in PRODI_CONFIG:
        prodi = "MBAJ"
        
    ensure_data(prodi)
    schedules = CACHE["schedules"].get(prodi, [])
    overrides = CACHE["overrides"]
    sent_log = CACHE["sent_log"]
    templates = CACHE.get("templates")
    
    filter_type = request.args.get("type", "weekend")
    start_date = request.args.get("start_date", "")
    end_date = request.args.get("end_date", "")
    search = request.args.get("search", "").strip().lower()
    global_lang = request.args.get("lang", "id")
    
    filtered = []
    for s in schedules:
        if s.get("is_mentor"):
            continue
            
        iso = s.get("iso_date", "")
        if start_date and iso < start_date:
            continue
        if end_date and iso > end_date:
            continue
            
        if filter_type == "weekend" and not s.get("is_weekend"):
            continue
        if filter_type == "weekday" and not s.get("is_weekday"):
            continue
            
        if search:
            match_txt = f"{s.get('lecturer')} {s.get('course')} {s.get('program')} {s.get('room')} {s.get('mentors', '')}".lower()
            if search not in match_txt:
                continue
                
        filtered.append(s)
        
    lecturer_groups = {}
    for s in filtered:
        lecturer_name = s.get("lecturer")
        phone_override = overrides.get(f"phone_{lecturer_name}")
        phone = phone_override or s.get("phone", "")
        
        group_key = f"{prodi}_{lecturer_name}"
        if group_key not in lecturer_groups:
            lecturer_groups[group_key] = {
                "prodi": prodi,
                "lecturer": lecturer_name,
                "matched_name": s.get("matched_name"),
                "phone": phone,
                "email": s.get("email"),
                "status": s.get("status"),
                "domicile": s.get("domicile"),
                "sessions": [],
                "is_sent": sent_log.get(f"{group_key}_{start_date}_{end_date}", False),
                "sent_at": sent_log.get(f"{group_key}_{start_date}_{end_date}_at", "")
            }
        lecturer_groups[group_key]["sessions"].append(s)
        
    def get_time_sort_key(time_str):
        if not time_str:
            return 9999
        m = re.search(r"(\d{1,2})[\.:](\d{2})", str(time_str))
        if m:
            return int(m.group(1)) * 60 + int(m.group(2))
        return 9999

    result = []
    for key, group in lecturer_groups.items():
        group["sessions"].sort(
            key=lambda s: (s.get("iso_date", ""), get_time_sort_key(overrides.get(f"{s.get('id')}_time") or s.get("time", "")))
        )
        lec_lang = overrides.get(f"lang_{group['lecturer']}") or global_lang
        msg = build_whatsapp_message(group["lecturer"], group["sessions"], overrides, lang=lec_lang, templates=templates, prodi=prodi)
        group["lang"] = lec_lang
        group["whatsapp_message"] = msg
        group["total_sessions"] = len(group["sessions"])
        result.append(group)
        
    def get_lecturer_card_sort_key(group):
        first_session = group["sessions"][0] if group["sessions"] else {}
        first_date = first_session.get("iso_date", "9999-99-99")
        first_time = get_time_sort_key(first_session.get("time", ""))
        return (group["is_sent"], first_date, first_time, group["lecturer"])

    result.sort(key=get_lecturer_card_sort_key)
    
    return jsonify({
        "prodi": prodi,
        "count": len(result),
        "total_sessions": len(filtered),
        "lecturers": result
    })

@app.route("/api/override", methods=["POST"])
def api_save_override():
    data = request.json or {}
    key = data.get("key")
    value = data.get("value")
    
    if key:
        CACHE["overrides"][key] = value
        save_overrides()
        return jsonify({"status": "success", "key": key, "value": value})
    return jsonify({"status": "error", "message": "Key is required"}), 400

@app.route("/api/mark-sent", methods=["POST"])
def api_mark_sent():
    data = request.json or {}
    group_key = data.get("group_key")
    start_date = data.get("start_date", "")
    end_date = data.get("end_date", "")
    is_sent = data.get("is_sent", True)
    
    log_key = f"{group_key}_{start_date}_{end_date}"
    CACHE["sent_log"][log_key] = is_sent
    if is_sent:
        CACHE["sent_log"][f"{log_key}_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    else:
        CACHE["sent_log"].pop(f"{log_key}_at", None)
        
    save_sent_log()
    return jsonify({"status": "success", "log_key": log_key, "is_sent": is_sent})

# WhatsApp Background Service Endpoints
@app.route("/api/wa/status")
def api_wa_status():
    res = wa_manager.run_task("status", timeout=10)
    return jsonify(res)

@app.route("/api/wa/connect", methods=["POST"])
def api_wa_connect():
    res = wa_manager.run_task("connect", timeout=15)
    return jsonify(res)

@app.route("/api/wa/send", methods=["POST"])
def api_wa_send():
    data = request.json or {}
    phone = data.get("phone")
    message = data.get("message")
    attachment_path = data.get("attachment_path")
    lecturer = data.get("lecturer")
    start_date = data.get("start_date", "")
    end_date = data.get("end_date", "")
    
    if not phone:
        return jsonify({"status": "error", "message": "Nomor telepon wajib diisi."}), 400
        
    res = wa_manager.run_task("send", {
        "phone": phone,
        "message": message,
        "attachment_path": attachment_path
    }, timeout=60)
    
    if res.get("success"):
        if lecturer:
            log_key = f"{lecturer}_{start_date}_{end_date}"
            CACHE["sent_log"][log_key] = True
            CACHE["sent_log"][f"{log_key}_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            save_sent_log()
        return jsonify({"status": "success", "message": res.get("message")})
    else:
        return jsonify({"status": "error", "message": res.get("error", "Gagal mengirim pesan.")}), 500

# Broadcast / Blast WhatsApp Endpoints
@app.route("/api/contacts")
def api_contacts():
    ensure_data()
    all_contacts = CACHE.get("all_contacts", [])
    overrides = CACHE.get("overrides", {})
    
    search = request.args.get("search", "").strip().lower()
    role_filter = request.args.get("role", "all").strip().lower()
    
    result = []
    for c in all_contacts:
        item = dict(c)
        name = item["name"]
        
        # Apply phone override if any
        phone_override = overrides.get(f"phone_{name}")
        if phone_override:
            item["phone"] = phone_override
            
        # Re-verify first name
        item["first_name"] = extract_first_name(item.get("clean_name") or name)
        
        # Filtering
        if role_filter == "dosen" and item["role"] != "Dosen":
            continue
        elif role_filter == "mentor" and item["role"] != "Mentor":
            continue
        elif role_filter == "scheduled" and not item["is_scheduled"]:
            continue
            
        if search:
            match_txt = f"{item['name']} {item.get('clean_name', '')} {item.get('status', '')} {item.get('role', '')} {item.get('domicile', '')}".lower()
            if search not in match_txt:
                continue
                
        result.append(item)
        
    return jsonify({
        "status": "success",
        "total": len(result),
        "contacts": result
    })

@app.route("/api/wa/contacts")
def api_wa_contacts():
    res = wa_manager.run_task("contacts", timeout=20)
    if res.get("success"):
        return jsonify(res)
    else:
        return jsonify({
            "success": False,
            "error": res.get("error", "Gagal mengambil kontak WhatsApp. Pastikan WhatsApp Web sudah terhubung."),
            "contacts": []
        }), 400

@app.route("/api/upload-attachment", methods=["POST"])
def api_upload_attachment():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "Tidak ada file yang diunggah."}), 400
        
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"status": "error", "message": "Nama file kosong."}), 400
        
    orig_name = file.filename
    clean_name = secure_filename(orig_name)
    if not clean_name:
        clean_name = "attachment_" + str(int(time.time()))
        
    unique_filename = f"{int(time.time())}_{clean_name}"
    save_path = os.path.join(UPLOADS_DIR, unique_filename)
    
    try:
        file.save(save_path)
        size_bytes = os.path.getsize(save_path)
        if size_bytes < 1024 * 1024:
            size_fmt = f"{size_bytes / 1024:.1f} KB"
        else:
            size_fmt = f"{size_bytes / (1024 * 1024):.1f} MB"
            
        return jsonify({
            "status": "success",
            "filename": unique_filename,
            "original_name": orig_name,
            "file_path": save_path,
            "size": size_fmt
        })
    except Exception as e:
        return jsonify({"status": "error", "message": f"Gagal menyimpan file: {str(e)}"}), 500

@app.route("/api/delete-attachment", methods=["POST"])
def api_delete_attachment():
    data = request.json or {}
    file_path = data.get("file_path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            return jsonify({"status": "success", "message": "File lampiran dihapus."})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    return jsonify({"status": "success", "message": "File tidak ditemukan atau sudah dihapus."})

@app.route("/api/wa/broadcast-single", methods=["POST"])
def api_wa_broadcast_single():
    data = request.json or {}
    recipient = data.get("recipient", {})
    message_template = data.get("message", "")
    attachment_path = data.get("attachment_path")
    
    phone = recipient.get("phone", "").strip()
    name = recipient.get("name", "").strip()
    clean_name = recipient.get("clean_name", "") or name
    first_name = recipient.get("first_name") or extract_first_name(clean_name)
    
    if not phone:
        return jsonify({"status": "error", "message": f"Kontak {name} tidak memiliki nomor WhatsApp."}), 400
        
    # Personalize message: replace {nama} with first_name, and {nama_lengkap} with full clean_name
    personalized_msg = message_template
    personalized_msg = re.sub(r"(?i)\{nama\}", first_name, personalized_msg)
    personalized_msg = re.sub(r"(?i)\{nama_lengkap\}", clean_name, personalized_msg)
    personalized_msg = re.sub(r"(?i)\{sapaan\}", f"Bapak/Ibu {first_name}", personalized_msg)
    
    res = wa_manager.run_task("send", {
        "phone": phone,
        "message": personalized_msg,
        "attachment_path": attachment_path
    }, timeout=60)
    
    log_entry = {
        "id": f"blast_{int(time.time() * 1000)}",
        "name": name,
        "phone": phone,
        "first_name": first_name,
        "has_attachment": bool(attachment_path),
        "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": "success" if res.get("success") else "failed",
        "error": res.get("error", "")
    }
    
    CACHE["blast_history"].append(log_entry)
    save_blast_log()
    
    if res.get("success"):
        return jsonify({
            "status": "success",
            "message": f"Pesan berhasil terkirim ke {name} ({phone})",
            "log": log_entry
        })
    else:
        return jsonify({
            "status": "error",
            "message": res.get("error", f"Gagal mengirim ke {name}"),
            "log": log_entry
        }), 500

@app.route("/api/broadcast/history", methods=["GET"])
def api_broadcast_history():
    if "blast_history" not in CACHE:
        load_local_storage()
    return jsonify({
        "status": "success",
        "history": list(reversed(CACHE.get("blast_history", [])))
    })

@app.route("/api/broadcast/history/<log_id>", methods=["DELETE"])
def api_delete_single_broadcast_history(log_id):
    if "blast_history" not in CACHE:
        load_local_storage()
    
    initial_len = len(CACHE["blast_history"])
    CACHE["blast_history"] = [item for item in CACHE["blast_history"] if str(item.get("id")) != str(log_id)]
    
    if len(CACHE["blast_history"]) == initial_len:
        return jsonify({"status": "error", "message": "Item log tidak ditemukan"}), 404
        
    save_blast_log()
    return jsonify({
        "status": "success",
        "message": "Item log berhasil dihapus.",
        "history": list(reversed(CACHE["blast_history"]))
    })

@app.route("/api/broadcast/history", methods=["DELETE"])
def api_clear_all_broadcast_history():
    if "blast_history" not in CACHE:
        load_local_storage()
        
    CACHE["blast_history"] = []
    save_blast_log()
    return jsonify({
        "status": "success",
        "message": "Seluruh riwayat log pengiriman broadcast berhasil dikosongkan.",
        "history": []
    })

@app.route("/api/broadcast/templates", methods=["GET"])
def api_get_broadcast_templates():
    if "broadcast_templates" not in CACHE:
        load_local_storage()
    return jsonify({
        "status": "success",
        "templates": CACHE.get("broadcast_templates", [])
    })

@app.route("/api/broadcast/templates", methods=["POST"])
def api_save_broadcast_template():
    data = request.json or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    template_id = data.get("id")

    if not title:
        return jsonify({"status": "error", "message": "Judul template tidak boleh kosong"}), 400
    if not content:
        return jsonify({"status": "error", "message": "Isi pesan template tidak boleh kosong"}), 400

    if "broadcast_templates" not in CACHE:
        load_local_storage()

    templates = CACHE.get("broadcast_templates", [])

    if template_id:
        # Update existing template
        found = False
        for t in templates:
            if t.get("id") == template_id:
                t["title"] = title
                t["content"] = content
                t["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
                found = True
                break
        if not found:
            template_id = f"tpl_{int(datetime.now().timestamp() * 1000)}"
            templates.append({
                "id": template_id,
                "title": title,
                "content": content,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
            })
    else:
        # Create new template
        template_id = f"tpl_{int(datetime.now().timestamp() * 1000)}"
        templates.append({
            "id": template_id,
            "title": title,
            "content": content,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        })

    CACHE["broadcast_templates"] = templates
    save_broadcast_templates()

    return jsonify({
        "status": "success",
        "message": f"Template '{title}' berhasil disimpan!",
        "template": {
            "id": template_id,
            "title": title,
            "content": content
        },
        "templates": templates
    })

@app.route("/api/broadcast/templates/<template_id>", methods=["DELETE"])
def api_delete_broadcast_template(template_id):
    if "broadcast_templates" not in CACHE:
        load_local_storage()

    templates = CACHE.get("broadcast_templates", [])
    new_templates = [t for t in templates if t.get("id") != template_id]

    if len(new_templates) == len(templates):
        return jsonify({"status": "error", "message": "Template tidak ditemukan"}), 404

    CACHE["broadcast_templates"] = new_templates
    save_broadcast_templates()

    return jsonify({
        "status": "success",
        "message": "Template berhasil dihapus!",
        "templates": new_templates
    })

if __name__ == "__main__":
    load_local_storage()
    ensure_data()
    print("Starting MBA Jakarta WhatsApp Reminder Dashboard...")
    app.run(host="127.0.0.1", port=5000, debug=False)
