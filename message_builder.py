import re
from datetime import datetime

DAYS_ID = {
    "Monday": "Senin",
    "Tuesday": "Selasa",
    "Wednesday": "Rabu",
    "Thursday": "Kamis",
    "Friday": "Jumat",
    "Saturday": "Sabtu",
    "Sunday": "Minggu"
}

MONTHS_ID = {
    "January": "Januari",
    "February": "Februari",
    "March": "Maret",
    "April": "April",
    "May": "Mei",
    "June": "Juni",
    "July": "Juli",
    "August": "Agustus",
    "September": "September",
    "October": "Oktober",
    "November": "November",
    "December": "Desember"
}

PRODI_GREETING_NAMES = {
    "MBAJ": {"id": "MBA Jakarta", "en": "MBA Jakarta"},
    "MBAB": {"id": "MBA Bandung", "en": "MBA Bandung"},
    "SW": {"id": "Sarjana Kewirausahaan", "en": "Undergraduate Entrepreneurship"},
    "SM": {"id": "Sarjana Manajemen", "en": "Undergraduate Management"},
    "MSM": {"id": "Master of Science in Management (MSM)", "en": "Master of Science in Management (MSM)"},
    "DSM": {"id": "Doctor of Science in Management (DSM)", "en": "Doctor of Science in Management (DSM)"}
}

DEFAULT_TEMPLATES = {
    "id": {
        "intro": "Selamat pagi. Izin konfirmasi dan reminder untuk jadwal perkuliahan di {prodi_name} mendatang sebagai berikut :",
        "closing": "Demikian kami informasikan,\nTerima kasih.",
        "label_program": "Program",
        "label_course": "Mata Kuliah",
        "label_date": "Hari, Tanggal",
        "label_time": "Waktu",
        "label_room": "Ruangan",
        "label_guest_lecturer": "Dosen Tamu",
        "label_mentor": "Mentor",
        "label_remarks": "Catatan",
        "label_exam_mode": "Bentuk Ujian",
        "exam_intro_single": "Terkait sesi ujian mendatang, {question}",
        "exam_intro_multiple": "Terkait sesi ujian mendatang:\n{questions}",
        "exam_ask_all": "mohon konfirmasi apakah ujian akan dilaksanakan secara Offline (di kampus), Online, atau Take-Home?",
        "exam_ask_offline": "mohon konfirmasi apakah ujian akan dilaksanakan secara Offline (di kampus)?",
        "exam_ask_online": "mohon konfirmasi apakah ujian akan dilaksanakan secara Online?",
        "exam_ask_takehome": "mohon konfirmasi apakah ujian akan dilaksanakan secara Take-Home?"
    },
    "en": {
        "intro": "Good morning. Kindly confirm and reminder for the upcoming lecture schedule at {prodi_name} as follows :",
        "closing": "This is for your information,\nThank you.",
        "label_program": "Program",
        "label_course": "Course",
        "label_date": "Day, Date",
        "label_time": "Time",
        "label_room": "Room",
        "label_guest_lecturer": "Guest Lecturer",
        "label_mentor": "Mentor",
        "label_remarks": "Remarks",
        "label_exam_mode": "Exam Mode",
        "exam_intro_single": "Regarding the upcoming examination session, {question}",
        "exam_intro_multiple": "Regarding the upcoming examination sessions:\n{questions}",
        "exam_ask_all": "kindly confirm whether the exam will be conducted Offline (On-Campus), Online, or as a Take-Home exam?",
        "exam_ask_offline": "kindly confirm whether the exam will be conducted Offline (On-Campus)?",
        "exam_ask_online": "kindly confirm whether the exam will be conducted Online?",
        "exam_ask_takehome": "kindly confirm whether the exam will be conducted as a Take-Home exam?"
    }
}

def normalize_name(name):
    """Normalizes names for matching/comparisons."""
    if not name:
        return ""
    cleaned = re.sub(
        r"(?i)\b(prof|dr|rer|pol|ir|st|se|si|mm|mba|msae|meng|phd|mab|mppar|stp|mt|msi|bhsc|dosen|pengajar|kontrak|praktisi|asisten|ahli|lektor|kepala|bpk|ibu|bapak)\b",
        "",
        name
    )
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    cleaned = " ".join(cleaned.split()).lower()
    return cleaned

def get_time_sort_key(time_str):
    """Extracts start time in minutes for accurate chronological sorting."""
    if not time_str:
        return 9999
    m = re.search(r"(\d{1,2})[\.:](\d{2})", str(time_str))
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    return 9999

def format_date_by_lang(iso_date, formatted_date, lang="en"):
    """Formats date string according to chosen language."""
    if not iso_date:
        return formatted_date
    try:
        dt = datetime.strptime(iso_date, "%Y-%m-%d")
        if lang == "id":
            day_en = dt.strftime("%A")
            month_en = dt.strftime("%B")
            day_id = DAYS_ID.get(day_en, day_en)
            month_id = MONTHS_ID.get(month_en, month_en)
            return f"{day_id}, {dt.day} {month_id} {dt.year}"
        else:
            return dt.strftime("%A, %B %d, %Y")
    except Exception:
        return formatted_date

def build_whatsapp_message(lecturer_name, sessions, overrides=None, lang="en", templates=None, prodi="MBAJ"):
    """
    Constructs a polite, formal WhatsApp reminder message (English or Indonesian)
    using configurable master templates with graceful fallback to defaults.
    """
    overrides = overrides or {}
    
    # Check if there is an explicit per-lecturer language override
    lec_lang_override = overrides.get(f"lang_{lecturer_name}")
    if lec_lang_override in ["en", "id"]:
        lang = lec_lang_override
    
    is_id = (lang == "id")
    lang_key = "id" if is_id else "en"
    
    # Resolve prodi display name for greeting
    prodi_info = PRODI_GREETING_NAMES.get(prodi, {"id": "SBM ITB", "en": "SBM ITB"})
    prodi_greeting_name = prodi_info.get(lang_key, "SBM ITB")
    
    # Merge custom templates with default
    tpl = dict(DEFAULT_TEMPLATES.get(lang_key, {}))
    if templates and lang_key in templates and isinstance(templates[lang_key], dict):
        for k, v in templates[lang_key].items():
            if v is not None and str(v).strip():
                tpl[k] = v
    
    sorted_sessions = sorted(
        sessions,
        key=lambda s: (s.get("iso_date", ""), get_time_sort_key(overrides.get(f"{s.get('id')}_time") or s.get("time", "")))
    )
    
    raw_intro = tpl.get("intro", "").strip()
    if "{prodi_name}" in raw_intro:
        raw_intro = raw_intro.replace("{prodi_name}", prodi_greeting_name)
    elif "MBA Jakarta" in raw_intro and prodi != "MBAJ":
        raw_intro = raw_intro.replace("MBA Jakarta", prodi_greeting_name)
        
    intro = (raw_intro + "\n\n") if raw_intro else ""
    
    schedule_blocks = []
    exam_questions = []
    
    for idx, s in enumerate(sorted_sessions, 1):
        sched_id = s.get("id")
        
        custom_course = overrides.get(f"{sched_id}_course") or s.get("course")
        custom_program = overrides.get(f"{sched_id}_program") or s.get("program")
        custom_class = overrides.get(f"{sched_id}_class") or s.get("class_type")
        
        raw_date = overrides.get(f"{sched_id}_date") or s.get("formatted_date")
        iso_date = s.get("iso_date", "")
        custom_date = format_date_by_lang(iso_date, raw_date, lang=lang)
        
        custom_time = overrides.get(f"{sched_id}_time") or s.get("time")
        custom_room = overrides.get(f"{sched_id}_room") or s.get("room")
        
        is_session_exam = overrides.get(f"{sched_id}_is_exam", s.get("is_exam", False))
        exam_mode = overrides.get(f"{sched_id}_exam_mode") or ""
        
        # Check Guest Lecturer: from user override, or auto-matched from sheet
        guest_lecture = overrides.get(f"{sched_id}_guest_lecture") or s.get("guest_lecturer") or ""
        if not guest_lecture and s.get("remarks") and "guest" in s.get("remarks").lower():
            guest_lecture = s.get("remarks").strip()
            
        # Check Mentor: from user override, or auto-matched from sheet
        mentor = overrides.get(f"{sched_id}_mentor") or s.get("mentors") or ""
            
        custom_notes = overrides.get(f"{sched_id}_notes") or s.get("remarks") or ""
        
        # Determine exam label
        month_str = iso_date[5:7] if iso_date else ""
        if is_id:
            default_exam_label = "UTS" if (month_str and month_str <= "10") else "UAS"
        else:
            default_exam_label = "MID EXAM" if (month_str and month_str <= "10") else "FINAL EXAM"
            
        exam_label = overrides.get(f"{sched_id}_exam_label") or s.get("exam_type") or default_exam_label
        if is_id:
            if "mid" in exam_label.lower() or "uts" in exam_label.lower():
                exam_label = "UTS"
            elif "final" in exam_label.lower() or "uas" in exam_label.lower():
                exam_label = "UAS"
        
        # Format Time line with sessions and exam tag
        session_val = str(s.get("sessions") or "").strip()
        time_part = f"{custom_time} WIB"
        
        if session_val:
            if is_id:
                unit = "Sesi"
            else:
                unit = "Session" if session_val == "1" else "Sessions"
            session_str = f"({session_val} {unit})"
            if is_session_exam:
                time_line_val = f"{time_part} {session_str} + {exam_label}"
            else:
                time_line_val = f"{time_part} {session_str}"
        else:
            if is_session_exam:
                time_line_val = f"{time_part} + {exam_label}"
            else:
                time_line_val = f"{time_part}"
        
        program_display = custom_program
        if custom_class and custom_class != custom_program:
            program_display += f" ({custom_class})"
            
        if is_id:
            header = f"*Jadwal {idx}:*\n" if len(sorted_sessions) > 1 else ""
        else:
            header = f"*Schedule {idx}:*\n" if len(sorted_sessions) > 1 else ""
        
        lbl_prog = tpl.get("label_program", "Program")
        lbl_crs = tpl.get("label_course", "Mata Kuliah" if is_id else "Course")
        lbl_dt = tpl.get("label_date", "Hari, Tanggal" if is_id else "Day, Date")
        lbl_tm = tpl.get("label_time", "Waktu" if is_id else "Time")
        lbl_rm = tpl.get("label_room", "Ruangan" if is_id else "Room")

        lines = [
            f"{lbl_prog} : {program_display}",
            f"{lbl_crs} : {custom_course}",
            f"{lbl_dt} : {custom_date}",
            f"{lbl_tm} : {time_line_val}",
            f"{lbl_rm} : {custom_room}"
        ]
        
        # Check if the recipient lecturer IS the guest lecturer himself
        norm_lec = normalize_name(lecturer_name)
        norm_guest = normalize_name(guest_lecture)
        is_self_guest = (norm_lec and norm_guest and (norm_lec in norm_guest or norm_guest in norm_lec)) or s.get("is_guest_row", False)
        
        # Only add Guest Lecturer line if there is a guest lecturer AND recipient is not the guest lecturer himself
        if guest_lecture and guest_lecture.strip() not in ["-", "None", ""] and not is_self_guest:
            gl_label = tpl.get("label_guest_lecturer", 'Dosen Tamu' if is_id else 'Guest Lecturer')
            lines.append(f"{gl_label} : {guest_lecture.strip()}")
            
        # Add Mentor line if present
        if mentor and mentor.strip() not in ["-", "None", ""]:
            mentor_label = tpl.get("label_mentor", 'Mentor')
            lines.append(f"{mentor_label} : {mentor.strip()}")
        
        # If exam mode is specified for this session
        if is_session_exam:
            mode_label = tpl.get("label_exam_mode", 'Bentuk Ujian' if is_id else 'Exam Mode')
            if exam_mode == "fixed_offline":
                lines.append(f"{mode_label} : {'Offline (Di Kampus)' if is_id else 'Offline (On-Campus)'}")
            elif exam_mode == "fixed_online":
                lines.append(f"{mode_label} : Online")
            elif exam_mode == "fixed_takehome":
                lines.append(f"{mode_label} : Take-Home Exam")
            elif exam_mode == "ask_offline":
                exam_questions.append(tpl.get("exam_ask_offline", "mohon konfirmasi apakah ujian akan dilaksanakan secara Offline (di kampus)?" if is_id else "kindly confirm whether the exam will be conducted Offline (On-Campus)?"))
            elif exam_mode == "ask_online":
                exam_questions.append(tpl.get("exam_ask_online", "mohon konfirmasi apakah ujian akan dilaksanakan secara Online?" if is_id else "kindly confirm whether the exam will be conducted Online?"))
            elif exam_mode == "ask_takehome":
                exam_questions.append(tpl.get("exam_ask_takehome", "mohon konfirmasi apakah ujian akan dilaksanakan secara Take-Home?" if is_id else "kindly confirm whether the exam will be conducted as a Take-Home exam?"))
            elif exam_mode.startswith("custom_ask:"):
                exam_questions.append(exam_mode.replace("custom_ask:", "").strip())
            else:
                # Default: ask all options
                exam_questions.append(tpl.get("exam_ask_all", "mohon konfirmasi apakah ujian akan dilaksanakan secara Offline (di kampus), Online, atau Take-Home?" if is_id else "kindly confirm whether the exam will be conducted Offline (On-Campus), Online, or as a Take-Home exam?"))
                
        if custom_notes and custom_notes not in ["Asynchronous", "", "-"] and not custom_notes.startswith("Guest") and custom_notes != guest_lecture:
            rem_label = tpl.get("label_remarks", 'Catatan' if is_id else 'Remarks')
            lines.append(f"{rem_label} : {custom_notes}")
            
        block_text = "\n".join(lines)
        schedule_blocks.append(f"{header}{block_text}")
        
    schedules_text = "\n\n".join(schedule_blocks)
    
    # Format exam question paragraph
    exam_paragraph = ""
    if exam_questions:
        unique_q = list(dict.fromkeys(exam_questions))
        if len(unique_q) == 1:
            q_template = tpl.get("exam_intro_single", "Terkait sesi ujian mendatang, {question}" if is_id else "Regarding the upcoming examination session, {question}")
            exam_paragraph = "\n\n" + q_template.replace("{question}", unique_q[0])
        else:
            q_lines = "\n".join([f"• {q}" for q in unique_q])
            q_template = tpl.get("exam_intro_multiple", "Terkait sesi ujian mendatang:\n{questions}" if is_id else "Regarding the upcoming examination sessions:\n{questions}")
            exam_paragraph = "\n\n" + q_template.replace("{questions}", q_lines)
            
    raw_closing = tpl.get("closing", "").strip()
    closing = ("\n\n" + raw_closing) if raw_closing else ""
    
    return (intro + schedules_text + exam_paragraph + closing).strip()
