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
    "label.optimal": {"en": "Best overall", "hi": "सबसे अच्छा", "mr": "सर्वात चांगला"},
    "label.cheapest": {"en": "Cheapest", "hi": "सबसे सस्ता", "mr": "सर्वात स्वस्त"},
    "card.reason": {"en": "{label}: {min} min, ₹{cost}, {changes}, {rel}% on time.", "hi": "{label}: {min} मिनट, ₹{cost}, {changes}, {rel}% समय पर।", "mr": "{label}: {min} मिनिटे, ₹{cost}, {changes}, {rel}% वेळेवर."},
    "changes.none": {"en": "no changes", "hi": "बदलना नहीं", "mr": "बदलणे नाही"},
    "changes.one": {"en": "1 change", "hi": "1 बार बदलना", "mr": "1 वेळा बदलणे"},
    "changes.many": {"en": "{n} changes", "hi": "{n} बार बदलना", "mr": "{n} वेळा बदलणे"},
    # ---- notes on an aware plan
    "note.avoided": {"en": "Avoided: {title} ({pct}% sure). A normal app would send you this way.", "hi": "टाला गया: {title} ({pct}% पक्का)। आम ऐप आपको इसी रास्ते भेजता।", "mr": "टाळले: {title} ({pct}% पक्के). नेहमीचे ॲप तुम्हाला याच मार्गाने पाठवले असते."},
    "note.included": {"en": "{title}: added to the time ({pct}% sure)", "hi": "{title}: समय में जोड़ा ({pct}% पक्का)", "mr": "{title}: वेळेत धरले ({pct}% पक्के)"},
    "note.risk": {"en": "{title}: not sure yet ({pct}%), so this route may be late", "hi": "{title}: अभी पक्का नहीं ({pct}%), यह रूट लेट हो सकता है", "mr": "{title}: अजून पक्के नाही ({pct}%), हा मार्ग उशिरा होऊ शकतो"},
    # ---- rejected options (readable message; the English `reason` stays for the app's logic)
    "rej.no_destination": {"en": "Please choose where you want to go.", "hi": "कृपया बताइए कहाँ जाना है।", "mr": "कृपया कुठे जायचे ते निवडा."},
    "rej.blocked": {"en": "Goes through {what}, which is closed right now", "hi": "{what} से जाता है, जो अभी बंद है", "mr": "{what} मधून जातो, जे आत्ता बंद आहे"},
    "rej.mode": {"en": "Uses {mode}, which you turned off", "hi": "{mode} से जाता है, जो आपने बंद किया है", "mr": "{mode} ने जातो, जे तुम्ही बंद केले आहे"},
    "rej.step_free": {"en": "Has stairs", "hi": "इसमें सीढ़ियाँ हैं", "mr": "यात पायऱ्या आहेत"},
    "rej.budget": {"en": "Costs about ₹{cost}, more than your ₹{max}", "hi": "लगभग ₹{cost} लगेंगे, आपके ₹{max} से ज़्यादा", "mr": "साधारण ₹{cost} लागतील, तुमच्या ₹{max} पेक्षा जास्त"},
    "rej.deadline": {"en": "Reaches at {at}, but you must be there by {by}", "hi": "{at} पर पहुँचेगा, पर आपको {by} तक पहुँचना है", "mr": "{at} ला पोहोचेल, पण तुम्हाला {by} पर्यंत पोहोचायचे आहे"},
    "rej.walk": {"en": "{walk} min walk, more than your {max} min", "hi": "{walk} मिनट पैदल, आपके {max} मिनट से ज़्यादा", "mr": "{walk} मिनिटे चालणे, तुमच्या {max} मिनिटांपेक्षा जास्त"},
    "rej.transfers": {"en": "You'd change {n} times, more than your {max}", "hi": "{n} बार बदलना पड़ेगा, आपके {max} से ज़्यादा", "mr": "{n} वेळा बदलावे लागेल, तुमच्या {max} पेक्षा जास्त"},
    "rej.no_path": {"en": "No way to get there with what you picked. Try turning on more ways to travel.", "hi": "आपके चुने साधनों से वहाँ नहीं जा सकते। और साधन चालू करके देखें।", "mr": "तुम्ही निवडलेल्या वाहनांनी तिथे जाता येत नाही. आणखी वाहने सुरू करून पाहा."},
    "rej.too_far": {"en": "No route: your {end} ({place}) is {km} km from the nearest stop. Try turning on more ways to travel.", "hi": "रूट नहीं मिला: आपकी {end} ({place}) सबसे पास वाले स्टॉप से {km} किमी दूर है। और साधन चालू करके देखें।", "mr": "मार्ग नाही: तुमचे {end} ({place}) जवळच्या स्टॉपपासून {km} किमी दूर आहे. आणखी वाहने सुरू करून पाहा."},
    "end.start": {"en": "starting point", "hi": "शुरुआत की जगह", "mr": "सुरुवातीचे ठिकाण"},
    "end.destination": {"en": "destination", "hi": "मंज़िल", "mr": "जायचे ठिकाण"},
    # ---- event titles
    "kind.delay": {"en": "delay", "hi": "देरी", "mr": "उशीर"},
    "kind.closure": {"en": "closure", "hi": "बंद", "mr": "बंद"},
    "kind.lift_out": {"en": "lift not working", "hi": "लिफ्ट बंद", "mr": "लिफ्ट बंद"},
    "kind.diversion": {"en": "route changed", "hi": "रास्ता बदला", "mr": "मार्ग बदलला"},
    "kind.crowding": {"en": "big crowd", "hi": "बहुत भीड़", "mr": "खूप गर्दी"},
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
    "replan.no_alt": {"en": "{titles} on your route is confirmed. We couldn't find another way that fits your limits.", "hi": "आपके रूट पर {titles} पक्का है। आपकी शर्तों में कोई और रास्ता नहीं मिला।", "mr": "तुमच्या मार्गावर {titles} पक्के आहे. तुमच्या अटींमध्ये दुसरा मार्ग सापडला नाही."},
    "replan.keep": {"en": "{titles} on your route is confirmed (about {min} min extra). Your route is still the best.", "hi": "आपके रूट पर {titles} पक्का है (लगभग {min} मिनट ज़्यादा)। आपका रूट अब भी सबसे अच्छा है।", "mr": "तुमच्या मार्गावर {titles} पक्के आहे (साधारण {min} मिनिटे जास्त). तुमचा मार्ग अजूनही सर्वात चांगला आहे."},
    "replan.confirmed": {"en": "{titles} is confirmed. ", "hi": "{titles} पक्का है। ", "mr": "{titles} पक्के आहे. "},
    "replan.blocked": {"en": "You can't take your planned route. ", "hi": "आपका तय रूट अभी नहीं ले सकते। ", "mr": "तुमचा ठरवलेला मार्ग आत्ता घेता येणार नाही. "},
    "replan.slower": {"en": "Your route is about {min} min late. ", "hi": "आपका रूट लगभग {min} मिनट लेट है। ", "mr": "तुमचा मार्ग साधारण {min} मिनिटे उशिरा आहे. "},
    "replan.new": {"en": "Better way from {from_}: {route}, you reach at {at}", "hi": "{from_} से बेहतर रास्ता: {route}, आप {at} पर पहुँचेंगे", "mr": "{from_} पासून चांगला मार्ग: {route}, तुम्ही {at} ला पोहोचाल"},
    "replan.late": {"en": " (later than your {by} target).", "hi": " (आपके {by} के समय से देर)।", "mr": " (तुमच्या {by} च्या वेळेपेक्षा उशिरा)."},
    "replan.end": {"en": ".", "hi": "।", "mr": "."},
    # ---- day planner
    "day.monday": {"en": "Monday", "hi": "सोमवार", "mr": "सोमवार"},
    "day.tuesday": {"en": "Tuesday", "hi": "मंगलवार", "mr": "मंगळवार"},
    "day.wednesday": {"en": "Wednesday", "hi": "बुधवार", "mr": "बुधवार"},
    "day.thursday": {"en": "Thursday", "hi": "गुरुवार", "mr": "गुरुवार"},
    "day.friday": {"en": "Friday", "hi": "शुक्रवार", "mr": "शुक्रवार"},
    "day.saturday": {"en": "Saturday", "hi": "शनिवार", "mr": "शनिवार"},
    "day.sunday": {"en": "Sunday", "hi": "रविवार", "mr": "रविवार"},
    "it.no_stops": {"en": "Add at least one place to visit.", "hi": "घूमने के लिए कम से कम एक जगह जोड़ें।", "mr": "किमान एक ठिकाण जोडा."},
    "it.unknown": {"en": "We don't know these places: {ids}", "hi": "ये जगहें हमें नहीं पता: {ids}", "mr": "ही ठिकाणे आम्हाला माहीत नाहीत: {ids}"},
    "it.none_fit": {"en": "None of these places fit in the time you gave.", "hi": "आपके दिए समय में इनमें से कोई जगह नहीं आती।", "mr": "तुम्ही दिलेल्या वेळेत यापैकी एकही ठिकाण बसत नाही."},
    "it.no_route_to": {"en": "No route to {name}.", "hi": "{name} तक कोई रूट नहीं।", "mr": "{name} पर्यंत मार्ग नाही."},
    "why.closed": {"en": "{name} is closed today ({today}). It closes on {days}.", "hi": "{name} आज ({today}) बंद होता है। यह {days} को बंद रहता है।", "mr": "{name} आज ({today}) बंद होते. ते {days} ला बंद असते."},
    "why.no_route": {"en": "Can't reach {name} with the ways to travel you picked.", "hi": "आपके चुने साधनों से {name} तक नहीं जा सकते।", "mr": "तुम्ही निवडलेल्या वाहनांनी {name} ला जाता येत नाही."},
    "why.before_start": {"en": "You picked {fixed} for {name}, but your day starts at {start}.", "hi": "आपने {name} के लिए {fixed} चुना, पर आपका दिन {start} पर शुरू होता है।", "mr": "तुम्ही {name} साठी {fixed} निवडले, पण तुमचा दिवस {start} ला सुरू होतो."},
    "why.too_late": {"en": "You picked {fixed} for {name}, but you can reach only by {earliest}.", "hi": "आपने {name} के लिए {fixed} चुना, पर आप {earliest} से पहले नहीं पहुँच सकते।", "mr": "तुम्ही {name} साठी {fixed} निवडले, पण तुम्ही {earliest} आधी पोहोचू शकत नाही."},
    "why.after_end": {"en": "You picked {fixed} for {name}, but your day ends at {end}.", "hi": "आपने {name} के लिए {fixed} चुना, पर आपका दिन {end} पर ख़त्म होता है।", "mr": "तुम्ही {name} साठी {fixed} निवडले, पण तुमचा दिवस {end} ला संपतो."},
    "why.fixed_overrun": {"en": "{name} at {fixed} for {visit} min ends at {until}, after your day ends ({end}).", "hi": "{name} पर {fixed} बजे {visit} मिनट रुकने से {until} बजेंगे, आपके दिन ({end}) के बाद।", "mr": "{name} ला {fixed} ला {visit} मिनिटे थांबल्यास {until} वाजतील, तुमचा दिवस ({end}) संपल्यावर."},
    "why.closes": {"en": "{name} closes at {closes}. To stay {visit} min you must reach by {by}, but you can reach only by {earliest}.", "hi": "{name} {closes} पर बंद होता है। {visit} मिनट रुकने के लिए {by} तक पहुँचना होगा, पर आप {earliest} तक ही पहुँच सकते हैं।", "mr": "{name} {closes} ला बंद होते. {visit} मिनिटे थांबायला {by} पर्यंत पोहोचायला हवे, पण तुम्ही {earliest} लाच पोहोचू शकता."},
    "why.day_end": {"en": "A {visit} min visit to {name} won't finish before your day ends ({end}).", "hi": "{name} पर {visit} मिनट रुकना आपके दिन ({end}) से पहले ख़त्म नहीं होगा।", "mr": "{name} ला {visit} मिनिटांची भेट तुमचा दिवस ({end}) संपण्याआधी होणार नाही."},
    "why.budget": {"en": "Going to {name} costs about ₹{cost}, more than your ₹{max}.", "hi": "{name} जाने में लगभग ₹{cost} लगेंगे, आपके ₹{max} से ज़्यादा।", "mr": "{name} ला जायला साधारण ₹{cost} लागतील, तुमच्या ₹{max} पेक्षा जास्त."},
    "why.together": {"en": " with {names}", "hi": " {names} के साथ", "mr": " {names} सोबत"},
    "why.no_room": {"en": "{name} fits alone, but not{with_} between {start} and {end} ({hours}, about {visit} min there). Make the day longer or remove a place.", "hi": "{name} अकेले आ जाता है, पर{with_} {start} से {end} के बीच नहीं ({hours}, वहाँ लगभग {visit} मिनट)। दिन लंबा करें या एक जगह हटाएँ।", "mr": "{name} एकटे बसते, पण{with_} {start} ते {end} मध्ये नाही ({hours}, तिथे साधारण {visit} मिनिटे). दिवस मोठा करा किंवा एक ठिकाण काढा."},
    "hours.24": {"en": "open all day", "hi": "पूरे दिन खुला", "mr": "दिवसभर उघडे"},
    "hours.range": {"en": "open {opens}–{closes}", "hi": "{opens}–{closes} खुला", "mr": "{opens}–{closes} उघडे"},
    "warn.problems": {"en": "Way to {name}: {n} problem(s) on the way. {rel}% on time.", "hi": "{name} का रास्ता: रास्ते में {n} समस्या। {rel}% समय पर।", "mr": "{name} चा मार्ग: वाटेत {n} अडचण. {rel}% वेळेवर."},
    "warn.nearby": {"en": "Way to {name}: {status} {kind} near {near} ({pct}% sure). Keep some extra time. Your plan stays the same.", "hi": "{name} का रास्ता: {near} के पास {status} {kind} ({pct}% पक्का)। थोड़ा ज़्यादा समय रखें। आपका प्लान वही है।", "mr": "{name} चा मार्ग: {near} जवळ {status} {kind} ({pct}% पक्के). थोडा जास्त वेळ ठेवा. तुमचा प्लॅन तसाच आहे."},
    "status.confirmed": {"en": "confirmed", "hi": "पक्की", "mr": "पक्की"},
    "status.possible": {"en": "maybe", "hi": "शायद", "mr": "कदाचित"},
}


def lang_of(language: str | None) -> Lang:
    return language if language in ("hi", "mr") else "en"


def tr(lang: str | None, key: str, **kw) -> str:
    """The sentence for `key` in `lang` (English if missing), with {placeholders} filled."""
    entry = T[key]
    text = entry.get(lang_of(lang)) or entry["en"]
    return text.format(**kw) if kw else text
