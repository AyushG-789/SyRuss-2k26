// Demo-story panel text (components/StoryPanel.tsx), plus Hindi / Marathi versions of the 5 demo
// travellers' stories. English stays in mocks/travellers.json; storyText() picks the right one.
import { defineMessages, type Lang } from "../../i18n";

export const M = defineMessages({
  en: {
    badge: "Demo story {id}: {name}",
    kindTrack: "Live trip · at {time}",
    kindPlan: "Planning",
    kindItinerary: "Day plan",
    whatHappens: "What happens:",
    playTrack: "Play: start {card} at {clock}",
    showMoment: "Show that moment ({time})",
    settingUp: "Getting ready…",
    done: "Clock set to {time}. Now showing that moment.",
    error: "Can't reach TravelBuddy. Start the server (port 8000).",
  },
  hi: {
    badge: "डेमो कहानी {id}: {name}",
    kindTrack: "लाइव ट्रिप · {time} पर",
    kindPlan: "प्लान बनाना",
    kindItinerary: "दिन का प्लान",
    whatHappens: "क्या होता है:",
    playTrack: "चलाएँ: {clock} पर {card} शुरू करें",
    showMoment: "वह पल दिखाएँ ({time})",
    settingUp: "तैयार हो रहा है…",
    done: "घड़ी {time} पर सेट। अब वही पल दिख रहा है।",
    error: "TravelBuddy से जुड़ नहीं पाए। सर्वर चालू करें (पोर्ट 8000)।",
  },
  mr: {
    badge: "डेमो कथा {id}: {name}",
    kindTrack: "लाइव्ह ट्रिप · {time} ला",
    kindPlan: "प्लॅन करणे",
    kindItinerary: "दिवसाचा प्लॅन",
    whatHappens: "काय होते:",
    playTrack: "सुरू करा: {clock} ला {card}",
    showMoment: "तो क्षण दाखवा ({time})",
    settingUp: "तयार होत आहे…",
    done: "घड्याळ {time} वर सेट. आता तोच क्षण दिसत आहे.",
    error: "TravelBuddy शी जोडता आले नाही. सर्व्हर सुरू करा (पोर्ट 8000).",
  },
});

export interface StoryText {
  name: string;
  story: string;
  hook: string;
  watch: string;
}

/** Hindi / Marathi versions of travellers.json TR1–TR5 (name, story, demo_hook, demo.watch). */
/** Simple English versions of travellers.json TR1–TR5 (the JSON keeps the original wording). */
const STORIES_EN: Record<string, StoryText> = {
  TR1: {
    name: "Meera (uses a wheelchair)",
    story: "Lands at the airport (T2) and goes to a conference at MMRDA Grounds, BKC. She uses a wheelchair: no stairs, very little walking.",
    hook: "A normal app sends her on Metro 3 straight to BKC. But people say the lift there is not working (not sure yet, 44%). That is too risky for a wheelchair, so TravelBuddy suggests Metro 3 to Santacruz, then a taxi.",
    watch: "Routes page: see 'What Pakka Check changed' (the lift problem was counted) and 'Normal app vs TravelBuddy' (the normal app takes Metro 3 to BKC).",
  },
  TR2: {
    name: "Rohan (student, small budget)",
    story: "A student going from Ghatkopar to Juhu Beach to meet friends. ₹50 at most, fastest way, no taxis.",
    hook: "At 16:58 many brand-new accounts post 'Metro 1 is fully shut'. TravelBuddy sees this looks fake (5%) and still sends him by Metro 1. At 17:12 a real delay at Saki Naka is confirmed (news and 3 people, 83%). He is already on the train, so the app finds a new route from Andheri.",
    watch: "Live trip page: no alert for the fake posts. At 17:12 a new route shows up ('New route from Andheri (Metro 1)').",
  },
  TR3: {
    name: "Arjun (must not be late)",
    story: "Going from Thane to Wankhede for a 7 PM match. He must be inside by 18:30.",
    hook: "His cheapest route changes trains at Dadar using the foot bridge. At 17:15 Central Railway and 2 people say the bridge is closed (89% sure). New route: stay on the fast local to CSMT, then take a taxi. He still reaches before 18:30.",
    watch: "Live trip page: at 17:15 the Dadar step says 'closed, 89% sure, can't use', and a new route shows up (stay on till CSMT, then taxi).",
  },
  TR4: {
    name: "The Kulkarni family (tourists, many stops)",
    story: "First time in Mumbai, staying near CSMT. They want an afternoon in South Mumbai, ending at Marine Drive for the sunset.",
    hook: "Five stops in one afternoon, all while open (the museum closes at 18:00), and Marine Drive at 18:30 for the sunset. People say there may be flooding near Azad Maidan and CSMT (40%). The app warns them, but keeps the plan, because 'maybe' is not enough to change it.",
    watch: "Day plan page: 5 stops while open, Marine Drive at 18:30. At 17:25 a warning near CSMT about maybe flooding (40%), and the plan stays the same.",
  },
  TR5: {
    name: "Priya (no autos)",
    story: "Going from her office in Andheri to a meeting at Phoenix Palladium. No autos; local, metro, bus and cab are fine.",
    hook: "Her cheapest route takes a Western slow local from Andheri. At 17:06 a signal problem there is confirmed (news and people), so she gets a new route. Another post says 'the whole WR line is shut', but Western Railway says trains are running, so that post is not trusted.",
    watch: "Live trip page: at 17:06 the Western slow delay at Andheri is confirmed and she gets a faster train. The 'whole WR line shut' post is not trusted because of WR's notice (see How we decide).",
  },
};

export const STORIES: Record<"hi" | "mr", Record<string, StoryText>> = {
  hi: {
    TR1: {
      name: "मीरा (व्हीलचेयर पर)",
      story: "कॉन्फ़्रेंस के लिए एयरपोर्ट (T2) से BKC के MMRDA Grounds जाना है। व्हीलचेयर पर है: सीढ़ी वाला रूट नहीं, पैदल बहुत कम।",
      hook: "आम ऐप उसे Metro 3 से सीधे BKC भेजता है। पर वहाँ लोग कह रहे हैं कि लिफ्ट बंद है (पक्का नहीं, 44%)। व्हीलचेयर के लिए यह ख़तरा बड़ा है, इसलिए TravelBuddy कहता है: Metro 3 से Santacruz, फिर टैक्सी।",
      watch: "रूट पेज पर: 'Pakka Check ने क्या बदला' (लिफ्ट वाली दिक्कत गिनी गई) और 'आम ऐप और TravelBuddy' (आम ऐप Metro 3 से BKC जाता है)।",
    },
    TR2: {
      name: "रोहन (स्टूडेंट, कम पैसे)",
      story: "स्टूडेंट है, दोस्तों से मिलने Ghatkopar से Juhu Beach जा रहा है। ₹50 में सबसे जल्दी रास्ता चाहिए; टैक्सी नहीं।",
      hook: "16:58 पर नए-नए अकाउंट से 'Metro 1 पूरी बंद' वाली ढेर सारी पोस्ट आती हैं। TravelBuddy इन्हें नकली मानता है (5%) और उसे Metro 1 से ही भेजता है। 17:12 पर Saki Naka पर असली देरी पक्की होती है (ख़बर और 3 लोग, 83%)। वह ट्रेन में है, तो ऐप Andheri से आगे का नया रूट बनाता है।",
      watch: "लाइव ट्रिप पेज: नकली पोस्ट से कोई अलर्ट नहीं; 17:12 पर नए रूट की पट्टी ('Andheri से नया रूट (Metro 1)')।",
    },
    TR3: {
      name: "अर्जुन (टाइम पर पहुँचना ही है)",
      story: "शाम 7 बजे के मैच के लिए Thane से Wankhede जा रहा है। 18:30 तक अंदर पहुँचना ही है।",
      hook: "उसके सबसे सस्ते रूट में Dadar पर पुल से होकर ट्रेन बदलनी है। 17:15 पर Central Railway की सूचना और 2 लोग बताते हैं कि पुल बंद है (89%)। नया रूट: फ़ास्ट लोकल में CSMT तक बैठे रहो, फिर टैक्सी। फिर भी 18:30 से पहले पहुँच जाता है।",
      watch: "लाइव ट्रिप पेज: 17:15 पर Dadar वाले स्टेप पर 'बंद पक्का 89% · इस्तेमाल नहीं कर सकते', और नए रूट की पट्टी (CSMT तक बैठे रहो, फिर टैक्सी)।",
    },
    TR4: {
      name: "कुलकर्णी परिवार (घूमने आए, एक दिन में कई जगहें)",
      story: "पहली बार मुंबई आए हैं, CSMT के पास रुके हैं। दोपहर में दक्षिण मुंबई घूमना है, शाम को Marine Drive पर सूरज ढलते देखना है।",
      hook: "एक दोपहर में पाँच जगहें, सब खुली रहते समय (म्यूज़ियम 18:00 बजे बंद)। Marine Drive 18:30 पर, सूरज ढलने के लिए। लोग Azad Maidan / CSMT के पास पानी भरने की बात कहते हैं (पक्का नहीं, 40%)। पास के हिस्सों पर चेतावनी आती है, पर प्लान वही रहता है — पक्का न हो तो प्लान नहीं बदलता।",
      watch: "दिन का प्लान: खुले समय में 5 जगहें, Marine Drive 18:30 पर; 17:25 पर CSMT के पास पानी भरने की चेतावनी (पक्का नहीं, 40%) — प्लान वही रहा।",
    },
    TR5: {
      name: "प्रिया (ऑटो नहीं लेती)",
      story: "ऑफ़िस Andheri में, मीटिंग Phoenix Palladium में। ऑटो नहीं; लोकल, मेट्रो, बस, कैब ठीक है।",
      hook: "उसके सबसे सस्ते रूट में Andheri से वेस्टर्न स्लो लोकल है। 17:06 पर वहाँ सिग्नल ख़राब, देरी पक्की (ख़बर और लोग), तो नया रूट। एक और पोस्ट कहती है 'पूरी WR लाइन बंद', पर Western Railway कहता है 'ट्रेनें ठीक चल रही हैं', तो वह पोस्ट ग़लत निकलती है।",
      watch: "लाइव ट्रिप पेज: 17:06 पर Andheri में स्लो लोकल की देरी पक्की, तो फ़ास्ट ट्रेन वाला नया रूट। 'WR पूरी बंद' वाली रिपोर्ट को WR की सूचना ग़लत बताती है ('ऐप कैसे तय करता है' पेज देखें)।",
    },
  },
  mr: {
    TR1: {
      name: "मीरा (व्हीलचेअरवर)",
      story: "कॉन्फरन्ससाठी एअरपोर्ट (T2) वरून BKC च्या MMRDA Grounds ला जायचे आहे. व्हीलचेअरवर आहे: पायऱ्या असलेला रूट नको, चालणे अगदी कमी.",
      hook: "साधे ॲप तिला Metro 3 ने थेट BKC ला पाठवते. पण तिथे लोक सांगत आहेत की लिफ्ट बंद आहे (पक्के नाही, 44%). व्हीलचेअरसाठी हा धोका मोठा आहे, म्हणून TravelBuddy सांगते: Metro 3 ने Santacruz, मग टॅक्सी.",
      watch: "रूट पेजवर: 'Pakka Check ने काय बदलले' (लिफ्टची अडचण मोजली) आणि 'साधे ॲप आणि TravelBuddy' (साधे ॲप Metro 3 ने BKC ला जाते).",
    },
    TR2: {
      name: "रोहन (विद्यार्थी, कमी पैसे)",
      story: "विद्यार्थी आहे, मित्रांना भेटायला Ghatkopar हून Juhu Beach ला जात आहे. ₹50 मध्ये सर्वात लवकरचा रस्ता हवा; टॅक्सी नको.",
      hook: "16:58 ला अगदी नव्या अकाउंटवरून 'Metro 1 पूर्ण बंद' अशा खूप पोस्ट येतात. TravelBuddy त्या खोट्या मानते (5%) आणि त्याला Metro 1 नेच पाठवते. 17:12 ला Saki Naka ला खरा उशीर पक्का होतो (बातमी आणि 3 लोक, 83%). तो ट्रेनमध्ये आहे, म्हणून ॲप Andheri पासून पुढचा नवा रूट बनवते.",
      watch: "लाइव्ह ट्रिप पेज: खोट्या पोस्टमुळे कोणताही अलर्ट नाही; 17:12 ला नव्या रूटची पट्टी ('Andheri पासून नवा रूट (Metro 1)').",
    },
    TR3: {
      name: "अर्जुन (वेळेवर पोहोचायलाच हवे)",
      story: "संध्याकाळी 7 च्या मॅचसाठी Thane हून Wankhede ला जात आहे. 18:30 पर्यंत आत पोहोचायलाच हवे.",
      hook: "त्याच्या सर्वात स्वस्त रूटमध्ये Dadar ला पुलावरून ट्रेन बदलायची आहे. 17:15 ला Central Railway ची सूचना आणि 2 लोक सांगतात की पूल बंद आहे (89%). नवा रूट: फास्ट लोकलने CSMT पर्यंत बसून राहा, मग टॅक्सी. तरीही 18:30 च्या आधी पोहोचतो.",
      watch: "लाइव्ह ट्रिप पेज: 17:15 ला Dadar च्या टप्प्यावर 'बंद पक्के 89% · वापरता येणार नाही', आणि नव्या रूटची पट्टी (CSMT पर्यंत बसून राहा, मग टॅक्सी).",
    },
    TR4: {
      name: "कुलकर्णी कुटुंब (फिरायला आले, एका दिवसात अनेक ठिकाणे)",
      story: "पहिल्यांदाच मुंबईत आले आहेत, CSMT जवळ राहत आहेत. दुपारी दक्षिण मुंबई फिरायची आहे, संध्याकाळी Marine Drive वर सूर्यास्त पाहायचा आहे.",
      hook: "एका दुपारी पाच ठिकाणे, सगळी उघडी असताना (म्युझियम 18:00 ला बंद). Marine Drive 18:30 ला, सूर्यास्तासाठी. लोक Azad Maidan / CSMT जवळ पाणी साचल्याचे सांगतात (पक्के नाही, 40%). जवळच्या भागांवर इशारा येतो, पण प्लॅन तसाच राहतो — पक्के नसेल तर प्लॅन बदलत नाही.",
      watch: "दिवसाचा प्लॅन: उघड्या वेळेत 5 ठिकाणे, Marine Drive 18:30 ला; 17:25 ला CSMT जवळ पाणी साचण्याचा इशारा (पक्के नाही, 40%) — प्लॅन तसाच राहिला.",
    },
    TR5: {
      name: "प्रिया (रिक्षा घेत नाही)",
      story: "ऑफिस Andheri मध्ये, मीटिंग Phoenix Palladium मध्ये. रिक्षा नको; लोकल, मेट्रो, बस, कॅब चालेल.",
      hook: "तिच्या सर्वात स्वस्त रूटमध्ये Andheri हून वेस्टर्न स्लो लोकल आहे. 17:06 ला तिथे सिग्नल बिघडला, उशीर पक्का (बातमी आणि लोक), म्हणून नवा रूट. आणखी एक पोस्ट म्हणते 'पूर्ण WR लाईन बंद', पण Western Railway म्हणते 'गाड्या नीट चालू आहेत', म्हणून ती पोस्ट खोटी ठरते.",
      watch: "लाइव्ह ट्रिप पेज: 17:06 ला Andheri ला स्लो लोकलचा उशीर पक्का, म्हणून फास्ट ट्रेनचा नवा रूट. 'WR पूर्ण बंद' रिपोर्ट WR च्या सूचनेने खोटा ठरतो ('ॲप कसे ठरवते' पेज पाहा).",
    },
  },
};

/** A traveller's story text in `lang`; English (from travellers.json) when there's no translation. */
export function storyText(lang: Lang, id: string, english: Partial<StoryText>): Partial<StoryText> {
  const tr = lang === "en" ? STORIES_EN[id] : STORIES[lang][id];
  if (!tr) return english;
  const out: Partial<StoryText> = {};
  for (const k of Object.keys(english) as (keyof StoryText)[]) out[k] = english[k] ? tr[k] : english[k];
  return out;
}
