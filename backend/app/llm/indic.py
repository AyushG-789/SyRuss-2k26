"""Hindi / Marathi support that works WITHOUT the AI: Devanagari place names, "from … to"
patterns, language detection and reply templates. Used by the chat fallback and fast path.
"""
from __future__ import annotations

import re

# Devanagari (and common Marathi/Hindi spellings) → the English name our place resolver knows.
PLACE_WORDS = {
    "अंधेरी": "Andheri", "ठाणे": "Thane", "ठाने": "Thane", "दादर": "Dadar", "वानखेडे": "Wankhede",
    "बीकेसी": "BKC", "वांद्रे": "Bandra", "बांद्रा": "Bandra", "बान्द्रा": "Bandra", "कुर्ला": "Kurla",
    "घाटकोपर": "Ghatkopar", "सीएसएमटी": "CSMT", "सीएसटी": "CSMT", "व्हीटी": "CSMT", "चर्चगेट": "Churchgate",
    "जुहू": "Juhu", "पवई": "Powai", "गेटवे": "Gateway of India", "विमानतळ": "Mumbai Airport Terminal 2",
    "एअरपोर्ट": "Mumbai Airport Terminal 2", "एयरपोर्ट": "Mumbai Airport Terminal 2", "सायन": "Sion",
    "शीव": "Sion", "माटुंगा": "Matunga", "बोरीवली": "Borivali", "बोरिवली": "Borivali", "मालाड": "Malad",
    "गोरेगाव": "Goregaon", "गोरेगांव": "Goregaon", "कांदिवली": "Kandivali", "जोगेश्वरी": "Jogeshwari",
    "विलेपार्ले": "Vile Parle", "पार्ले": "Vile Parle", "सांताक्रूझ": "Santacruz", "सांताक्रुज": "Santacruz",
    "खार": "Khar Road", "माहीम": "Mahim Junction", "वडाळा": "Wadala Road", "चेंबूर": "Chembur",
    "वाशी": "Vashi", "मुलुंड": "Mulund", "भांडुप": "Bhandup", "विक्रोळी": "Vikhroli", "विक्रोली": "Vikhroli",
    "साकीनाका": "Saki Naka", "मरोळ": "Marol Naka", "वर्सोवा": "Versova", "कुलाबा": "Colaba Causeway",
    "कोलाबा": "Colaba Causeway", "हाजीअली": "Haji Ali", "सिद्धिविनायक": "Shree Siddhivinayak Temple",
    "परळ": "Parel", "परेल": "Parel", "भायखळा": "Byculla", "भायखला": "Byculla", "वरळी": "Worli", "वर्ली": "Worli",
    "धारावी": "Dharavi", "मशीद": "Masjid",
    # Marathi oblique forms (before -हून / -ला): ठाण्याहून, ठाण्याला, वांद्र्याला, कुर्ल्याहून …
    "ठाण्या": "Thane", "वांद्र्या": "Bandra", "कुर्ल्या": "Kurla", "भायखळ्या": "Byculla", "वडाळ्या": "Wadala Road",
    "बीकेसीला": "BKC",
}
# Two-word names written apart.
PLACE_PHRASES = {"काळा घोडा": "Kala Ghoda", "काला घोडा": "Kala Ghoda", "साकी नाका": "Saki Naka", "विले पार्ले": "Vile Parle", "मरीन ड्राइव्ह": "Marine Drive",
                 "मरीन ड्राईव्ह": "Marine Drive", "मरीन ड्राइव": "Marine Drive", "हाजी अली": "Haji Ali",
                 "लोअर परेल": "Lower Parel", "लोअर परळ": "Lower Parel", "मुंबई सेंट्रल": "Mumbai Central",
                 "ग्रँट रोड": "Grant Road", "ग्रांट रोड": "Grant Road", "चर्नी रोड": "Charni Road",
                 "मरीन लाइन्स": "Marine Lines", "गेटवे ऑफ इंडिया": "Gateway of India", "जिओ वर्ल्ड": "Jio World Centre"}
LINE_PHRASES = {"मेट्रो 1": "metro 1", "मेट्रो वन": "metro 1", "मेट्रो 3": "metro 3", "अ‍ॅक्वा": "aqua",
                "एक्वा": "aqua", "वेस्टर्न": "western", "पश्चिम": "western", "सेंट्रल": "central", "मध्य": "central",
                "हार्बर": "harbour"}

# "from" / "to" endings and words (Marathi: -हून, -ून, पासून · Hindi: से · Hinglish: se).
FROM_SUFFIXES = ("पासून", "हून", "ून", "से")
TO_SUFFIXES = ("पर्यंत", "ला", "ना", "कडे", "तक", "को")
FROM_WORDS = {"से", "se", "from", "पासून", "हून"}
TO_WORDS = {"ला", "को", "तक", "पर्यंत", "to", "tak", "ko", "kadey", "कडे"}
TRAVEL_WORDS = re.compile(r"(जायचे|जायचं|जाऊ|जायला|जाना|जाओ|जाने|जाऊन|कसे|कैसे|रस्ता|रास्ता|मार्ग|पोहोचायचे|पहुंच|"
                          r"\bjana\b|\bjaana\b|\bjaana hai\b|\bkaise\b|\bto\b|\bse\b|\bla\b)", re.I)
STATUS_WORDS = re.compile(r"(समस्या|प्रॉब्लेम|प्रोब्लेम|बंद|उशीर|लेट|देरी|देर|चालू|सुरू|चल रही|चल रहा|गर्दी|भीड़|"
                          r"काय झाले|क्या हुआ|क्या हाल|काय|क्या|है\?|आहे\?)")

HOURS_WORDS = re.compile(r"(कब खुलता|कब खुलेगा|कब बंद|किती वाजता|उघडते|उघडतो|उघडे|वेळ|समय|टाइमिंग|तिकीट|टिकट)")

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
MARATHI_MARKERS = re.compile(r"(आहे|आहेत|मला|जायचे|जायचं|हून|पासून|काय|कसे|नाही|चालू|उशीर|झाले|पोहोचायचे|गर्दी|कधी|उघडते|उघडतो|किती|वाजता)")
HINGLISH_MARKERS = re.compile(r"\b(hai|kya|kaise|jana|jaana|mujhe|se|tak|kab|nahi|chal|raha|rahi|problem hai)\b", re.I)


def language(text: str) -> str:
    """'mr', 'hi' or 'en' — script + a few telltale words."""
    if re.search(r"[ऀ-ॿ]", text):
        return "mr" if MARATHI_MARKERS.search(text) else "hi"
    return "hi" if HINGLISH_MARKERS.search(text) else "en"


def to_latin(text: str) -> str:
    """Replace Devanagari digits, line names and place names (with their 'from/to' endings) by the
    English names, keeping the endings as separate words: 'अंधेरीहून BKC ला' → 'Andheri हून BKC ला'."""
    out = text.translate(_DEVANAGARI_DIGITS)
    for dev, en in {**PLACE_PHRASES, **LINE_PHRASES}.items():
        out = out.replace(dev, f" {en} ")
    words = []
    for w in out.split():
        core = w.strip("?,.!।")
        if core in PLACE_WORDS:
            words.append(PLACE_WORDS[core])
            continue
        for suf in (*FROM_SUFFIXES, *TO_SUFFIXES, "च्या", "मध्ये", "मधे", "वर", "पे", "पर"):
            if core.endswith(suf) and core[: -len(suf)] in PLACE_WORDS:
                words.append(PLACE_WORDS[core[: -len(suf)]])
                words.append(suf)
                break
        else:
            words.append(w)
    return re.sub(r"\s+", " ", " ".join(words)).strip()


def find_trip(text: str, resolve) -> tuple[str, str] | None:
    """Origin + destination from a Hindi/Marathi/Hinglish request, e.g.
    'मला अंधेरीहून BKC ला जायचे आहे', 'ठाणे से वानखेडे कैसे जाऊं', 'Thane se Wankhede jana hai'."""
    latin = to_latin(text)
    if not TRAVEL_WORDS.search(text) and not TRAVEL_WORDS.search(latin):
        return None
    tokens = latin.split()
    places: list[tuple[int, str]] = []          # (token index, name) of each place mentioned
    i = 0
    while i < len(tokens):
        for span in (3, 2, 1):                  # longest names first ("Gateway of India")
            chunk = tokens[i:i + span]
            name = " ".join(chunk).strip("?,.!।")
            latin_only = len(chunk) == span and all(re.fullmatch(r"[A-Za-z0-9()&'.\-]+[?,.!।]?", t) for t in chunk)
            joiners = {"to", "se", "la", "from", "metro", "jana", "jaana", "hai", "kaise", "mujhe", "tak", "ko", "pe", "par"}
            if latin_only and not any(t.lower().strip("?,.!") in joiners for t in chunk) and resolve(name):
                places.append((i + span - 1, name))
                i += span
                break
        else:
            i += 1
    names = list(dict.fromkeys(n for _, n in places))
    if len(names) < 2:
        return None
    a, b = names[0], names[1]
    # If the second place is the one marked "from" (… हून / से), swap.
    second_end = next(idx for idx, n in places if n == b)
    if second_end + 1 < len(tokens) and tokens[second_end + 1] in FROM_WORDS | set(FROM_SUFFIXES):
        a, b = b, a
    return a, b


# ---- Reply templates ----------------------------------------------------------------------------
T = {
    "trip": {
        "en": "{frm} → {to}: {route}, leave {depart}, arrive {arrive} ({mins} min, ₹{cost}).",
        "hi": "{frm} → {to}: {route}, {depart} पर निकलें, {arrive} तक पहुंचें ({mins} मिनट, ₹{cost}).",
        "mr": "{frm} → {to}: {route}, {depart} ला निघा, {arrive} ला पोहोचाल ({mins} मिनिटे, ₹{cost}).",
    },
    "trip_note": {
        "en": " Note: {title} is {meaning} ({pct}%).",
        "hi": " ध्यान दें: {title} — {meaning} ({pct}%).",
        "mr": " लक्षात घ्या: {title} — {meaning} ({pct}%).",
    },
    "no_route": {
        "en": "I couldn't find a route from {frm} to {to} within your limits.",
        "hi": "{frm} से {to} तक आपकी सीमा में कोई रास्ता नहीं मिला।",
        "mr": "{frm} पासून {to} पर्यंत तुमच्या मर्यादेत मार्ग सापडला नाही.",
    },
    "problem": {
        "en": "{title}: {meaning}, {pct}% ({sources}).",
        "hi": "{title}: {meaning}, {pct}% ({sources}).",
        "mr": "{title}: {meaning}, {pct}% ({sources}).",
    },
    "ignored": {
        "en": "Ignored: {title} ({meaning}).",
        "hi": "भरोसेमंद नहीं (अनदेखा): {title}.",
        "mr": "विश्वासार्ह नाही (दुर्लक्षित): {title}.",
    },
    "all_clear": {
        "en": "Good news — no confirmed or likely problems at {where} right now ({now}).",
        "hi": "अच्छी खबर — {where} पर अभी ({now}) कोई पुष्ट या संभावित समस्या नहीं है।",
        "mr": "चांगली बातमी — {where} येथे सध्या ({now}) कोणतीही खात्रीशीर किंवा संभाव्य समस्या नाही.",
    },
    "untrusted": {
        "en": " We also checked {n} report{s} there but didn't trust it — \"{title}\": only {sources}, too little evidence, so it was ignored ({pct}%).",
        "hi": " वहां {n} रिपोर्ट भी जांची गईं, पर भरोसेमंद नहीं थीं — जैसे \"{title}\": सिर्फ {sources}, इसलिए अनदेखा किया ({pct}%).",
        "mr": " तिथल्या {n} रिपोर्ट तपासल्या पण विश्वासार्ह नव्हत्या — उदा. \"{title}\": फक्त {sources}, म्हणून दुर्लक्ष केले ({pct}%).",
    },
    "fake_burst": {
        "en": " A burst of near-identical posts from brand-new accounts (\"{title}\") looks fake and was ignored ({pct}%).",
        "hi": " नए अकाउंट्स से एक जैसी कई पोस्ट (\"{title}\") नकली लगती हैं, अनदेखा किया ({pct}%).",
        "mr": " नवीन अकाउंट्सकडून एकसारख्या पोस्ट (\"{title}\") बनावट वाटतात, दुर्लक्ष केले ({pct}%).",
    },
    "place_open": {
        "en": "{name} is {hours} today ({day}){state}. Plan about {visit} min there{ticket}.{stops}",
        "hi": "{name} आज ({day}) {hours}{state}. वहां लगभग {visit} मिनट रखें{ticket}.{stops}",
        "mr": "{name} आज ({day}) {hours}{state}. तिथे सुमारे {visit} मिनिटे ठेवा{ticket}.{stops}",
    },
    "place_closed": {
        "en": "{name} is closed today ({day}). It's closed on {closed}.",
        "hi": "{name} आज ({day}) बंद है। यह {closed} को बंद रहता है।",
        "mr": "{name} आज ({day}) बंद आहे. ते {closed} रोजी बंद असते.",
    },
    "no_problems": {
        "en": "No problems reported there as of {now}.",
        "hi": "{now} तक वहां कोई समस्या रिपोर्ट नहीं हुई।",
        "mr": "{now} पर्यंत तिथे कोणतीही समस्या नोंदवलेली नाही.",
    },
    "offline": {
        "en": "The AI assistant is busy right now, so I can only answer simple questions. Try “Thane to Wankhede by 18:30”, “Is Metro 1 running?” or “Kala Ghoda opening times”.",
        "hi": "AI सहायक अभी उपलब्ध नहीं है। फिर भी मैं “ठाणे से वानखेडे” जैसा रास्ता या “मेट्रो 1 चालू है?” बता सकता हूं।",
        "mr": "AI सहाय्यक सध्या उपलब्ध नाही. तरीही मी “ठाण्याहून वानखेडेला” असा मार्ग किंवा “मेट्रो 1 चालू आहे का?” सांगू शकतो.",
    },
}
MEANING = {
    "hi": {"confirmed": "पुष्टि हुई", "possible": "संभव (अभी पुष्टि नहीं)", "ignored": "भरोसेमंद नहीं",
           "coordinated": "भरोसेमंद नहीं (नकली रिपोर्टों की बाढ़ जैसा)"},
    "mr": {"confirmed": "खात्री झाली", "possible": "शक्य (अजून खात्री नाही)", "ignored": "विश्वासार्ह नाही",
           "coordinated": "विश्वासार्ह नाही (बनावट रिपोर्टचा लोंढा)"},
}


def say(key: str, lang: str, **kw) -> str:
    return T[key].get(lang, T[key]["en"]).format(**kw)


def meaning(status: str, english: str, lang: str) -> str:
    return MEANING.get(lang, {}).get(status, english)
