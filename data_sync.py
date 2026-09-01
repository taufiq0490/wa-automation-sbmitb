import csv
import io
import re
import urllib.request
import urllib.parse
from datetime import datetime, timedelta

SHEET_ID = "1uZ8MoNZPe07UFYauu-5wKyqOOOfsCqNvNTYb2xCw8_w"
DOSEN_GID = "778468163"

PRODI_CONFIG = {
    "MBAJ": {
        "code": "MBAJ",
        "name": "MBA Kampus Jakarta",
        "sheet_name": "MCP MBAJ",
        "default_location": "SBM ITB Kampus Jakarta",
        "greeting_name": "MBA Jakarta",
        "icon": "🎓"
    },
    "MBAB": {
        "code": "MBAB",
        "name": "MBA Kampus Bandung",
        "sheet_name": "MCP MBAB",
        "default_location": "SBM ITB Kampus Bandung",
        "greeting_name": "MBA Bandung",
        "icon": "🏛️"
    },
    "SW": {
        "code": "SW",
        "name": "Sarjana Kewirausahaan",
        "sheet_name": "MCP SW",
        "default_location": "SBM ITB Kampus Ganesha / Jatinangor",
        "greeting_name": "Sarjana Kewirausahaan",
        "icon": "🚀"
    },
    "SM": {
        "code": "SM",
        "name": "Sarjana Manajemen",
        "sheet_name": "MCP SM",
        "default_location": "SBM ITB Kampus Utama",
        "greeting_name": "Sarjana Manajemen",
        "icon": "💼"
    },
    "MSM": {
        "code": "MSM",
        "name": "Master of Science in Management",
        "sheet_name": "MCP MSM",
        "default_location": "SBM ITB Kampus Bandung",
        "greeting_name": "Master of Science in Management (MSM)",
        "icon": "🔬"
    },
    "DSM": {
        "code": "DSM",
        "name": "Doctor of Science in Management",
        "sheet_name": "MCP DSM",
        "default_location": "SBM ITB Kampus Jakarta / Bandung",
        "greeting_name": "Doctor of Science in Management (DSM)",
        "icon": "📜"
    }
}

def fetch_csv(sheet_name=None, gid=None):
    """Fetches CSV data from Google Sheets using public export/gviz endpoints."""
    if gid:
        url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    else:
        encoded = urllib.parse.quote(sheet_name)
        url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={encoded}"
    
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(content)))

def normalize_name(name):
    """Normalizes lecturer names for accurate matching across sheets."""
    if not name:
        return ""
    cleaned = re.sub(
        r"(?i)\b(prof|dr|rer|pol|ir|st|se|si|mm|mba|msae|meng|phd|mab|mppar|stp|mt|msi|bhsc|dosen|pengajar|kontrak|praktisi|asisten|ahli|lektor|kepala)\b",
        "",
        name
    )
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    cleaned = " ".join(cleaned.split()).lower()
    return cleaned

def extract_first_name(full_name):
    """Extracts only the clean first name from a full name, stripping academic, professional, and honorific titles."""
    if not full_name:
        return ""
    cleaned = re.sub(
        r"(?i)\b(prof|dr|rer|pol|ir|st|se|si|mm|mba|msae|meng|phd|mab|mppar|stp|mt|msi|bhsc|dosen|pengajar|kontrak|praktisi|asisten|ahli|lektor|kepala|apt|drg|h|hj|bpk|bapak|pak|ibu|bu|mas|mbak|mr|mrs|ms|s\.kom|s\.e|s\.t|s\.si|m\.m|m\.ba|m\.sc|m\.t|m\.ab|ph\.d|dr\.)\b\.?",
        "",
        str(full_name)
    )
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    words = [w.strip() for w in cleaned.split() if w.strip()]
    if words:
        return words[0].capitalize()
    return full_name.split()[0] if full_name.split() else full_name

def clean_phone(phone):
    """Formats phone number to standard international WhatsApp format without plus or symbols (e.g. 62812345678)."""
    if not phone:
        return ""
    digits = re.sub(r"[^\d+]", "", str(phone)).strip()
    if digits.startswith("08"):
        digits = "628" + digits[2:]
    elif digits.startswith("+62"):
        digits = "62" + digits[3:]
    elif digits.startswith("+"):
        digits = digits[1:]
    return digits

def parse_date(date_str):
    """Parses various date string formats into standard datetime object."""
    if not date_str:
        return None
    date_str = date_str.strip()
    for fmt in [
        "%A, %B %d, %Y",
        "%a, %B %d, %Y",
        "%B %d, %Y",
        "%d %B %Y",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y"
    ]:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None

def load_database_dosen():
    """Loads and maps lecturer profiles, phone numbers, and emails."""
    try:
        dosen_rows = fetch_csv(gid=DOSEN_GID)
    except Exception as e:
        print(f"Warning: Failed to fetch Database Dosen via GID: {e}")
        try:
            dosen_rows = fetch_csv(sheet_name="Data Base Dosen")
        except Exception as e2:
            print(f"Warning: Failed to fetch Data Base Dosen via sheet_name: {e2}")
            dosen_rows = []
            
    lookup = {}
    for d in dosen_rows:
        full_name = d.get("Nama Dosen", "").strip() or d.get("Lecturer", "").strip()
        clean_n = d.get("Nama Dosen Tanpa Gelar", "").strip()
        phone = clean_phone(d.get("No. Hand Phone", "") or d.get("Phone", ""))
        email = d.get("Email SBM", "").strip() or d.get("Email ITB", "").strip() or d.get("Email Lainnya", "").strip() or d.get("Email", "").strip()
        
        info = {
            "full_name": full_name,
            "clean_name": clean_n or full_name,
            "phone": phone,
            "email": email,
            "status": d.get("Status", "").strip(),
            "domicile": d.get("Domicile", "").strip(),
            "expertise": d.get("Kelompok Keahilan", "").strip()
        }
        
        if full_name:
            lookup[full_name.lower()] = info
            lookup[normalize_name(full_name)] = info
        if clean_n:
            lookup[clean_n.lower()] = info
            lookup[normalize_name(clean_n)] = info
            
    return lookup, dosen_rows

def get_lecturer_info(lecturer_name, dosen_lookup):
    """Finds lecturer information using strict and fuzzy normalized fallback matching."""
    if not lecturer_name:
        return {"full_name": "", "clean_name": "", "phone": "", "email": ""}
    
    lecturer_name_clean = lecturer_name.strip()
    norm = normalize_name(lecturer_name_clean)
    
    if lecturer_name_clean.lower() in dosen_lookup:
        return dosen_lookup[lecturer_name_clean.lower()]
    
    if norm in dosen_lookup:
        return dosen_lookup[norm]
        
    for k, v in dosen_lookup.items():
        if norm and k and (norm in k or k in norm):
            return v
            
    return {
        "full_name": lecturer_name_clean,
        "clean_name": lecturer_name_clean,
        "phone": "",
        "email": "",
        "status": "",
        "domicile": ""
    }

def load_schedule(prodi="MBAJ", dosen_lookup=None):
    """Loads all schedule records from specific Prodi sheet and links with lecturer contact data."""
    if prodi not in PRODI_CONFIG:
        prodi = "MBAJ"
        
    cfg = PRODI_CONFIG[prodi]
    sheet_name = cfg["sheet_name"]
    default_location = cfg["default_location"]
    
    if dosen_lookup is None:
        dosen_lookup, _ = load_database_dosen()
        
    try:
        mcp_rows = fetch_csv(sheet_name=sheet_name)
    except Exception as e:
        print(f"Error fetching sheet {sheet_name}: {e}")
        return []
    
    # First pass: identify explicit guest lecturers and mentors in the sheet
    guest_lecturers_map = {} # Key: (course, date_str, program) -> guest lecturer info
    mentors_map = {} # Key: (course, date_str, program) -> list of mentor names
    
    for r in mcp_rows:
        ditugaskan = r.get("Ditugaskan Sebagai", "").strip().lower()
        status_val = r.get("Status", "").strip().lower()
        rem = r.get("Remarks", "")
        lec = r.get("Lecturer", "").strip()
        time_slot = r.get("Time", "").strip()
        
        c = r.get("Course", "").strip()
        d = r.get("Date", "").strip() or r.get("Tgl Berangkat", "").strip()
        p = r.get("Program", "").strip() or r.get("Class", "").strip()
        
        # Check Mentor
        if "ment" in status_val or "ment" in ditugaskan or "mentor" in rem.lower():
            if (c, d, p) not in mentors_map:
                mentors_map[(c, d, p)] = []
            if lec and lec not in mentors_map[(c, d, p)]:
                mentors_map[(c, d, p)].append(lec)
        
        # Check Guest Lecturer
        if "tamu" in ditugaskan or "guest" in status_val or "dosen tamu" in ditugaskan:
            guest_text = f"{lec} ({time_slot} WIB)" if time_slot else lec
            guest_lecturers_map[(c, d, p)] = guest_text
        elif "guest" in rem.lower():
            guest_lecturers_map[(c, d, p)] = rem.strip()
            
    schedules = []
    for idx, r in enumerate(mcp_rows):
        lecturer = r.get("Lecturer", "").strip()
        if not lecturer:
            continue
            
        ditugaskan = r.get("Ditugaskan Sebagai", "").strip().lower()
        status_val = r.get("Status", "").strip().lower()
        remarks = r.get("Remarks", "").strip()
        
        is_mentor_row = "ment" in status_val or "ment" in ditugaskan or "mentor" in remarks.lower()
        is_guest_row = "tamu" in ditugaskan or "guest" in status_val
        
        date_str = r.get("Date", "").strip() or r.get("Tgl Berangkat", "").strip()
        dt = parse_date(date_str)
        
        info = get_lecturer_info(lecturer, dosen_lookup)
        
        day_of_week = dt.weekday() if dt else -1
        is_weekend = day_of_week in [5, 6]
        is_weekday = day_of_week in [0, 1, 2, 3, 4]
        
        sessions = r.get("Sessions", "").strip()
        course = r.get("Course", "").strip()
        cls = r.get("Class", "").strip()
        program = r.get("Program", "").strip() or cls or cfg["name"]
        time_slot = r.get("Time", "").strip()
        room = r.get("Room ", "").strip() or r.get("Room", "").strip() or r.get("Ruang", "").strip()
        location = r.get("Lokasi", "").strip() or default_location
        
        # Check auto-matched guest lecturer from map or remarks
        matched_guest = guest_lecturers_map.get((course, date_str, program), "")
        if not matched_guest and "guest" in remarks.lower():
            matched_guest = remarks
            
        # Check auto-matched mentors from map
        matched_mentors_list = mentors_map.get((course, date_str, program), [])
        matched_mentors_str = ", ".join(matched_mentors_list) if matched_mentors_list else ""
            
        # Detect session type: MID EXAM vs FINAL EXAM
        is_exam = False
        exam_type = None
        
        month = dt.month if dt else 0
        default_exam_label = "MID EXAM" if month <= 10 else "FINAL EXAM"
        
        rem_lower = remarks.lower()
        if "uts" in rem_lower or "mid" in rem_lower:
            is_exam = True
            exam_type = "MID EXAM"
        elif "uas" in rem_lower or "final" in rem_lower:
            is_exam = True
            exam_type = "FINAL EXAM"
        elif "exam" in rem_lower or "ujian" in rem_lower:
            is_exam = True
            exam_type = default_exam_label
        elif not sessions and ("exam" in course.lower() or "ujian" in course.lower()):
            is_exam = True
            exam_type = default_exam_label
            
        schedules.append({
            "id": f"{prodi.lower()}_sched_{idx}",
            "prodi": prodi,
            "lecturer": lecturer,
            "matched_name": info.get("full_name") or lecturer,
            "phone": info.get("phone", ""),
            "email": info.get("email", ""),
            "status": r.get("Status", "").strip() or info.get("status", ""),
            "domicile": r.get("Domicile", "").strip() or info.get("domicile", ""),
            "course": course,
            "program": program,
            "class_type": cls,
            "date_str": date_str,
            "iso_date": dt.strftime("%Y-%m-%d") if dt else "",
            "day_name": dt.strftime("%A") if dt else "",
            "formatted_date": dt.strftime("%A, %B %d, %Y") if dt else date_str,
            "time": time_slot,
            "sessions": sessions,
            "room": room,
            "location": location,
            "remarks": remarks,
            "guest_lecturer": matched_guest,
            "mentors": matched_mentors_str,
            "is_weekend": is_weekend,
            "is_weekday": is_weekday,
            "is_exam": is_exam,
            "exam_type": exam_type,
            "is_guest_row": is_guest_row,
            "is_mentor": is_mentor_row,
            "tanggal_surat_tugas": r.get("Tanggal Surat Tugas", "").strip() or r.get("Tgl Surat Tugas", "").strip(),
            "ditugaskan_sebagai": r.get("Ditugaskan Sebagai", "").strip() or ("Mentor" if is_mentor_row else "Dosen Pengajar")
        })
        
    return schedules

ID_MONTHS = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

def format_surat_tugas_date(dt):
    """Calculates H-1 to H+1 date range in Indonesian format with cross-month awareness."""
    if not dt:
        return ""
    h_minus_1 = dt - timedelta(days=1)
    h_plus_1 = dt + timedelta(days=1)
    
    if h_minus_1.month == h_plus_1.month:
        return f"{h_minus_1.day} - {h_plus_1.day} {ID_MONTHS[h_plus_1.month]} {h_plus_1.year}"
    else:
        d2_str = f"{h_plus_1.day:02d}"
        return f"{h_minus_1.day} {ID_MONTHS[h_minus_1.month]} - {d2_str} {ID_MONTHS[h_plus_1.month]} {h_plus_1.year}"

def load_all_contacts(schedules=None):
    """Gathers all unique Dosen & Mentors from Database Dosen and Schedule rows for broadcast."""
    dosen_lookup, dosen_rows = load_database_dosen()
    if schedules is None:
        schedules = load_schedule("MBAJ", dosen_lookup)
        
    contacts_map = {}
    
    # 1. From Database Dosen
    for d in dosen_rows:
        name = d.get("Nama Dosen", "").strip() or d.get("Lecturer", "").strip()
        if not name:
            continue
        clean_n = d.get("Nama Dosen Tanpa Gelar", "").strip() or name
        phone = clean_phone(d.get("No. Hand Phone", "") or d.get("Phone", ""))
        email = d.get("Email SBM", "").strip() or d.get("Email ITB", "").strip() or d.get("Email Lainnya", "").strip() or d.get("Email", "").strip()
        status_val = d.get("Status", "").strip()
        
        first_n = extract_first_name(clean_n or name)
        
        contacts_map[name.lower()] = {
            "name": name,
            "clean_name": clean_n,
            "first_name": first_n,
            "phone": phone,
            "email": email,
            "status": status_val,
            "domicile": d.get("Domicile", "").strip(),
            "role": "Mentor" if "ment" in status_val.lower() else "Dosen",
            "is_scheduled": False,
            "total_classes": 0
        }

    # 2. Link with Schedule rows (Mentors, Lecturers, Guest Lecturers)
    for s in schedules:
        lec = s.get("lecturer", "").strip()
        if not lec:
            continue
            
        lec_key = lec.lower()
        is_mentor = s.get("is_mentor", False) or "ment" in (s.get("status") or "").lower()
        
        if lec_key in contacts_map:
            contacts_map[lec_key]["is_scheduled"] = True
            contacts_map[lec_key]["total_classes"] += 1
            if is_mentor:
                contacts_map[lec_key]["role"] = "Mentor"
            if not contacts_map[lec_key]["phone"] and s.get("phone"):
                contacts_map[lec_key]["phone"] = s.get("phone")
        else:
            first_n = extract_first_name(s.get("matched_name") or lec)
            contacts_map[lec_key] = {
                "name": lec,
                "clean_name": s.get("matched_name") or lec,
                "first_name": first_n,
                "phone": s.get("phone", ""),
                "email": s.get("email", ""),
                "status": s.get("status", ""),
                "domicile": s.get("domicile", ""),
                "role": "Mentor" if is_mentor else ("Guest Lecturer" if s.get("is_guest_row") else "Dosen"),
                "is_scheduled": True,
                "total_classes": 1
            }

    contacts_list = sorted(list(contacts_map.values()), key=lambda c: (c["role"] != "Mentor", c["name"]))
    return contacts_list


