"""People-facing sentences in English, Hindi and Marathi (the traveller's `language`).

Used for route-card reasons, the "avoided" notes, readable rejected-option messages, replan
alerts and day-plan explanations. Station / place names, line codes (WR, CR, Metro 1, BEST),
₹ amounts and times stay as they are; transport words without a natural Hindi/Marathi word use
the word Mumbaikars say (मेट्रो, लोकल, रिक्षा …), same as the frontend word guide (lib/i18n.ts).
Missing translations fall back to English.
"""
from __future__ import annotations

Lang = str  # "en" | "hi" | "mr"

T: dict[str, dict[str, str]] = {
    # ---- route cards
    "label.fastest": {"en": "Fastest", "hi": "सबसे तेज़", "mr": "सर्वात जलद"},
    "label.optimal": {"en": "Optimal", "hi": "सबसे संतुलित", "mr": "सर्वात संतुलित"},
    "label.cheapest": {"en": "Cheapest", "hi": "सबसे सस्ता", "mr": "सर्वात स्वस्त"},
    "card.reason": {
        "en": "{label}: {min} min, ₹{cost}, {transfers} transfers, reliability {rel}%.",
        "hi": "{label}: {min} मिनट, ₹{cost}, {transfers} बदलाव, विश्वसनीयता {rel}%।",
        "mr": "{label}: {min} मिनिटे, ₹{cost}, {transfers} बदल, विश्वसनीयता {rel}%.",
    },
    # ---- notes on an aware plan
    "note.avoided": {
        "en": "Avoided: {title} (confirmed {pct}%) — the schedule-only plan used it",
        "hi": "टाला गया: {title} (पक्का {pct}%) — सिर्फ़ टाइमटेबल वाला प्लान इसी से जाता",
        "mr": "टाळले: {title} (पक्की {pct}%) — फक्त वेळापत्रकावरचा प्लॅन याच मार्गाने गेला असता",
    },
    "note.included": {"en": "{title}: included ({pct}%)", "hi": "{title}: शामिल किया ({pct}%)", "mr": "{title}: धरले ({pct}%)"},
    "note.risk": {
        "en": "{title}: possible, counted as risk ({pct}%)",
        "hi": "{title}: संभावित, जोखिम के रूप में गिना ({pct}%)",
        "mr": "{title}: शक्य, धोका म्हणून धरले ({pct}%)",
    },
    # ---- rejected options (readable message; the English `reason` stays for the app's logic)
    "rej.no_destination": {
        "en": "No destination given (use the Day Itinerary for a multi-stop day).",
        "hi": "मंज़िल नहीं दी गई (कई जगहों के लिए दिन भर का प्लान इस्तेमाल करें)।",
        "mr": "ठिकाण दिलेले नाही (अनेक ठिकाणांसाठी दिवसभराचा प्लॅन वापरा).",
    },
    "rej.blocked": {
        "en": "Uses {what} (confirmed by Pakka Check)",
        "hi": "{what} से होकर जाता है (Pakka Check ने पक्का किया)",
        "mr": "{what} मार्गे जातो (Pakka Check ने पक्के केले)",
    },
    "rej.mode": {
        "en": "Uses {mode}, which you didn't allow",
        "hi": "{mode} इस्तेमाल करता है, जिसकी आपने इजाज़त नहीं दी",
        "mr": "{mode} वापरतो, ज्याला तुम्ही परवानगी दिली नाही",
    },
    "rej.step_free": {
        "en": "Not step-free (stairs or a non-accessible interchange)",
        "hi": "बिना सीढ़ी वाला नहीं (सीढ़ियाँ या मुश्किल इंटरचेंज)",
        "mr": "पायऱ्यांशिवाय नाही (पायऱ्या किंवा अवघड इंटरचेंज)",
    },
    "rej.budget": {
        "en": "Over budget (about ₹{cost}, your limit ₹{max})",
        "hi": "बजट से ज़्यादा (लगभग ₹{cost}, आपकी सीमा ₹{max})",
        "mr": "बजेटपेक्षा जास्त (साधारण ₹{cost}, तुमची मर्यादा ₹{max})",
    },
    "rej.deadline": {
        "en": "Arrives at {at}, after your strict deadline {by}",
        "hi": "{at} पर पहुँचता है, आपकी पक्की समय-सीमा {by} के बाद",
        "mr": "{at} ला पोहोचतो, तुमच्या पक्क्या वेळेच्या {by} नंतर",
    },
    "rej.walk": {
        "en": "{walk} min of walking, more than your {max} min limit",
        "hi": "{walk} मिनट पैदल, आपकी {max} मिनट की सीमा से ज़्यादा",
        "mr": "{walk} मिनिटे चालणे, तुमच्या {max} मिनिटांच्या मर्यादेपेक्षा जास्त",
    },
    "rej.transfers": {
        "en": "{n} changes, more than your limit of {max}",
        "hi": "{n} बदलाव, आपकी {max} की सीमा से ज़्यादा",
        "mr": "{n} बदल, तुमच्या {max} च्या मर्यादेपेक्षा जास्त",
    },
    "rej.no_path": {
        "en": "No connection between these places with the transport you allowed. Try allowing more modes.",
        "hi": "आपके चुने साधनों से इन जगहों के बीच कोई रास्ता नहीं। और साधन चुनकर देखें।",
        "mr": "तुम्ही निवडलेल्या वाहनांनी या ठिकाणांमध्ये मार्ग नाही. आणखी वाहने निवडून पाहा.",
    },
    "rej.too_far": {
        "en": "No route: your {end} ({place}) is {km} km from the nearest usable stop. Try allowing more transport modes.",
        "hi": "कोई रूट नहीं: आपका {end} ({place}) नज़दीकी इस्तेमाल लायक स्टॉप से {km} किमी दूर है। और साधन चुनकर देखें।",
        "mr": "मार्ग नाही: तुमचे {end} ({place}) जवळच्या वापरता येणाऱ्या स्टॉपपासून {km} किमी दूर आहे. आणखी वाहने निवडून पाहा.",
    },
    "end.start": {"en": "start", "hi": "शुरुआती जगह", "mr": "सुरुवातीचे ठिकाण"},
    "end.destination": {"en": "destination", "hi": "मंज़िल", "mr": "पोहोचण्याचे ठिकाण"},
    # ---- event titles
    "kind.delay": {"en": "delay", "hi": "देरी", "mr": "उशीर"},
    "kind.closure": {"en": "closure", "hi": "बंद", "mr": "बंद"},
    "kind.lift_out": {"en": "lift outage", "hi": "लिफ्ट बंद", "mr": "लिफ्ट बंद"},
    "kind.diversion": {"en": "diversion", "hi": "रास्ता बदला", "mr": "मार्ग बदल"},
    "kind.crowding": {"en": "heavy crowding", "hi": "भारी भीड़", "mr": "खूप गर्दी"},
    "kind.waterlogging": {"en": "waterlogging", "hi": "पानी भरा", "mr": "पाणी साचले"},
    "kind.mega_block": {"en": "mega block", "hi": "मेगा ब्लॉक", "mr": "मेगा ब्लॉक"},
    "title.at": {"en": "{line} {kind} at {stop}", "hi": "{line} पर {stop} में {kind}", "mr": "{line} वर {stop} येथे {kind}"},
    "title.plain": {"en": "{where} {kind}", "hi": "{where}: {kind}", "mr": "{where}: {kind}"},
    # ---- route words
    "word.walk": {"en": "Walk", "hi": "पैदल", "mr": "चालत"},
    "word.taxi": {"en": "Taxi", "hi": "टैक्सी", "mr": "टॅक्सी"},
    "word.auto": {"en": "Auto", "hi": "ऑटो", "mr": "रिक्षा"},
    "word.cab": {"en": "Cab", "hi": "कैब", "mr": "कॅब"},
    "word.bus": {"en": "BEST bus", "hi": "BEST बस", "mr": "BEST बस"},
    "word.ferry": {"en": "Ferry", "hi": "फ़ेरी", "mr": "फेरी बोट"},
    "word.metro": {"en": "Metro", "hi": "मेट्रो", "mr": "मेट्रो"},
    "word.local": {"en": "Local", "hi": "लोकल", "mr": "लोकल"},
    "line.slow": {"en": "Slow", "hi": "स्लो", "mr": "स्लो"},
    "line.fast": {"en": "Fast", "hi": "फ़ास्ट", "mr": "फास्ट"},
    "line.harbour": {"en": "Harbour", "hi": "हार्बर", "mr": "हार्बर"},
    # ---- replan
    "replan.no_alt": {
        "en": "Confirmed {titles} on your route. No working alternative was found within your limits.",
        "hi": "आपके रूट पर पक्का: {titles}। आपकी सीमाओं में कोई और रास्ता नहीं मिला।",
        "mr": "तुमच्या मार्गावर पक्के: {titles}. तुमच्या मर्यादांमध्ये दुसरा मार्ग सापडला नाही.",
    },
    "replan.keep": {
        "en": "Confirmed {titles} on your route (about +{min} min). Your route is still the best option.",
        "hi": "आपके रूट पर पक्का: {titles} (लगभग +{min} मिनट)। आपका रूट अब भी सबसे अच्छा है।",
        "mr": "तुमच्या मार्गावर पक्के: {titles} (साधारण +{min} मिनिटे). तुमचा मार्ग अजूनही सर्वात चांगला आहे.",
    },
    "replan.confirmed": {"en": "Confirmed {titles}. ", "hi": "पक्का: {titles}। ", "mr": "पक्के: {titles}. "},
    "replan.blocked": {
        "en": "Your planned route can't be used. ",
        "hi": "आपका तय रूट इस्तेमाल नहीं हो सकता। ",
        "mr": "तुमचा ठरवलेला मार्ग वापरता येणार नाही. ",
    },
    "replan.slower": {
        "en": "Your route is about {min} min slower. ",
        "hi": "आपका रूट लगभग {min} मिनट धीमा है। ",
        "mr": "तुमचा मार्ग साधारण {min} मिनिटे उशिराचा आहे. ",
    },
    "replan.new": {
        "en": "New route from {from_}: {route}, arriving {at}",
        "hi": "{from_} से नया रूट: {route}, {at} पर पहुँचेंगे",
        "mr": "{from_} पासून नवा मार्ग: {route}, {at} ला पोहोचाल",
    },
    "replan.late": {
        "en": " (after your {by} target).",
        "hi": " (आपके {by} के लक्ष्य के बाद)।",
        "mr": " (तुमच्या {by} च्या लक्ष्यानंतर).",
    },
    "replan.end": {"en": ".", "hi": "।", "mr": "."},
    # ---- day planner
    "day.monday": {"en": "Monday", "hi": "सोमवार", "mr": "सोमवार"},
    "day.tuesday": {"en": "Tuesday", "hi": "मंगलवार", "mr": "मंगळवार"},
    "day.wednesday": {"en": "Wednesday", "hi": "बुधवार", "mr": "बुधवार"},
    "day.thursday": {"en": "Thursday", "hi": "गुरुवार", "mr": "गुरुवार"},
    "day.friday": {"en": "Friday", "hi": "शुक्रवार", "mr": "शुक्रवार"},
    "day.saturday": {"en": "Saturday", "hi": "शनिवार", "mr": "शनिवार"},
    "day.sunday": {"en": "Sunday", "hi": "रविवार", "mr": "रविवार"},
    "it.no_stops": {"en": "No stops in the itinerary.", "hi": "प्लान में कोई जगह नहीं है।", "mr": "प्लॅनमध्ये एकही ठिकाण नाही."},
    "it.unknown": {"en": "Unknown places: {ids}", "hi": "अनजान जगहें: {ids}", "mr": "अनोळखी ठिकाणे: {ids}"},
    "it.none_fit": {
        "en": "None of these places can be visited in this time window.",
        "hi": "इस समय में इनमें से कोई भी जगह नहीं जा सकते।",
        "mr": "या वेळेत यापैकी एकही ठिकाण पाहता येणार नाही.",
    },
    "it.no_route_to": {"en": "No route to {name}.", "hi": "{name} तक कोई रूट नहीं।", "mr": "{name} पर्यंत मार्ग नाही."},
    "why.closed": {
        "en": "{name} is closed today ({today}) — it's closed on {days}.",
        "hi": "{name} आज ({today}) बंद है — यह {days} को बंद रहता है।",
        "mr": "{name} आज ({today}) बंद आहे — ते {days} ला बंद असते.",
    },
    "why.no_route": {
        "en": "There's no route to {name} with the transport you allowed.",
        "hi": "आपके चुने साधनों से {name} तक कोई रूट नहीं है।",
        "mr": "तुम्ही निवडलेल्या वाहनांनी {name} पर्यंत मार्ग नाही.",
    },
    "why.before_start": {
        "en": "You wanted to be at {name} at {fixed}, before your day starts at {start}.",
        "hi": "आप {name} पर {fixed} बजे पहुँचना चाहते थे, जो आपके दिन की शुरुआत ({start}) से पहले है।",
        "mr": "तुम्हाला {name} ला {fixed} ला पोहोचायचे होते, जे तुमचा दिवस सुरू होण्याच्या ({start}) आधी आहे.",
    },
    "why.too_late": {
        "en": "You wanted to be at {name} at {fixed}, but the earliest you can get there is {earliest}.",
        "hi": "आप {name} पर {fixed} बजे पहुँचना चाहते थे, पर सबसे जल्दी {earliest} तक पहुँच सकते हैं।",
        "mr": "तुम्हाला {name} ला {fixed} ला पोहोचायचे होते, पण सर्वात लवकर {earliest} ला पोहोचू शकता.",
    },
    "why.after_end": {
        "en": "You wanted to be at {name} at {fixed}, after your day ends at {end}.",
        "hi": "आप {name} पर {fixed} बजे पहुँचना चाहते थे, जो आपके दिन के अंत ({end}) के बाद है।",
        "mr": "तुम्हाला {name} ला {fixed} ला पोहोचायचे होते, जे तुमचा दिवस संपल्यावर ({end}) आहे.",
    },
    "why.fixed_overrun": {
        "en": "{name} is fixed at {fixed} for {visit} min, which runs to {until} — after your day ends at {end}.",
        "hi": "{name} {fixed} बजे {visit} मिनट के लिए तय है, जो {until} तक चलेगा — आपके दिन के अंत ({end}) के बाद।",
        "mr": "{name} {fixed} ला {visit} मिनिटांसाठी ठरले आहे, ते {until} पर्यंत चालेल — तुमचा दिवस संपल्यावर ({end}).",
    },
    "why.closes": {
        "en": "{name} closes at {closes}. A {visit}-min visit means arriving by {by}, but the earliest you can get there is {earliest}.",
        "hi": "{name} {closes} बजे बंद होता है। {visit} मिनट रुकने के लिए {by} तक पहुँचना होगा, पर सबसे जल्दी {earliest} तक पहुँच सकते हैं।",
        "mr": "{name} {closes} ला बंद होते. {visit} मिनिटे थांबण्यासाठी {by} पर्यंत पोहोचायला हवे, पण सर्वात लवकर {earliest} ला पोहोचू शकता.",
    },
    "why.day_end": {
        "en": "A {visit}-min visit to {name} wouldn't finish before your day ends at {end}.",
        "hi": "{name} पर {visit} मिनट की विज़िट आपके दिन के अंत ({end}) से पहले पूरी नहीं होगी।",
        "mr": "{name} ला {visit} मिनिटांची भेट तुमचा दिवस संपण्याआधी ({end}) पूर्ण होणार नाही.",
    },
    "why.budget": {
        "en": "Getting to {name} costs about ₹{cost}, more than your ₹{max} budget.",
        "hi": "{name} तक जाने में लगभग ₹{cost} लगेंगे, आपके ₹{max} बजट से ज़्यादा।",
        "mr": "{name} पर्यंत जायला साधारण ₹{cost} लागतील, तुमच्या ₹{max} बजेटपेक्षा जास्त.",
    },
    "why.together": {"en": " together with {names}", "hi": " {names} के साथ", "mr": " {names} सोबत"},
    "why.no_room": {
        "en": "{name} fits on its own, but not{with_} between {start} and {end} ({hours}, about {visit} min there). A longer day or fewer stops would make room.",
        "hi": "{name} अकेले फ़िट होता है, पर{with_} {start} से {end} के बीच नहीं ({hours}, वहाँ लगभग {visit} मिनट)। लंबा दिन या कम जगहें रखने से जगह बनेगी।",
        "mr": "{name} एकटे बसते, पण{with_} {start} ते {end} दरम्यान नाही ({hours}, तिथे साधारण {visit} मिनिटे). मोठा दिवस किंवा कमी ठिकाणे ठेवल्यास जागा होईल.",
    },
    "hours.24": {"en": "open 24 h", "hi": "24 घंटे खुला", "mr": "24 तास उघडे"},
    "hours.range": {"en": "open {opens}–{closes}", "hi": "{opens}–{closes} खुला", "mr": "{opens}–{closes} उघडे"},
    "warn.problems": {
        "en": "Route to {name}: live problems {ids} (reliability {rel}%)",
        "hi": "{name} का रूट: लाइव समस्याएँ {ids} (विश्वसनीयता {rel}%)",
        "mr": "{name} चा मार्ग: लाइव्ह अडचणी {ids} (विश्वसनीयता {rel}%)",
    },
    "warn.nearby": {
        "en": "Route to {name}: {status} {kind} reported near {near} ({pct}%) — allow extra time; plan kept.",
        "hi": "{name} का रूट: {near} के पास {status} {kind} की रिपोर्ट ({pct}%) — थोड़ा ज़्यादा समय रखें; प्लान वही रहेगा।",
        "mr": "{name} चा मार्ग: {near} जवळ {status} {kind} कळवले ({pct}%) — जरा जास्त वेळ ठेवा; प्लॅन तसाच आहे.",
    },
    "status.confirmed": {"en": "confirmed", "hi": "पक्की", "mr": "पक्की"},
    "status.possible": {"en": "possible", "hi": "संभावित", "mr": "शक्य"},
}


def lang_of(language: str | None) -> Lang:
    return language if language in ("hi", "mr") else "en"


def tr(lang: str | None, key: str, **kw) -> str:
    """The sentence for `key` in `lang` (English if missing), with {placeholders} filled."""
    entry = T[key]
    text = entry.get(lang_of(lang)) or entry["en"]
    return text.format(**kw) if kw else text
