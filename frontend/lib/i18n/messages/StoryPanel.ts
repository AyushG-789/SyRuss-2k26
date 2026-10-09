// Demo-story panel text (components/StoryPanel.tsx), plus Hindi / Marathi versions of the 5 demo
// travellers' stories. English stays in mocks/travellers.json; storyText() picks the right one.
import { defineMessages, type Lang } from "../../i18n";

export const M = defineMessages({
  en: {
    badge: "Demo story · {id} {name}",
    kindTrack: "trip story · moment at {time}",
    kindPlan: "planning story",
    kindItinerary: "day-plan story",
    whatHappens: "What happens:",
    playTrack: "Play story: start the {card} option at {clock}",
    showMoment: "Show the moment ({time})",
    settingUp: "Setting up…",
    done: "Demo clock set to {time} — the page now shows the moment.",
    error: "Couldn't reach the TravelBuddy server — start the backend on port 8000.",
  },
  hi: {
    badge: "डेमो कहानी · {id} {name}",
    kindTrack: "सफ़र की कहानी · {time} पर",
    kindPlan: "प्लानिंग की कहानी",
    kindItinerary: "दिन के प्लान की कहानी",
    whatHappens: "क्या होता है:",
    playTrack: "कहानी चलाएँ: {clock} पर {card} रूट शुरू करें",
    showMoment: "वह पल दिखाएँ ({time})",
    settingUp: "तैयार हो रहा है…",
    done: "डेमो घड़ी {time} पर सेट हो गई — पेज अब वही पल दिखा रहा है।",
    error: "TravelBuddy सर्वर से जुड़ नहीं पाए — पोर्ट 8000 पर बैकएंड चालू करें।",
  },
  mr: {
    badge: "डेमो कथा · {id} {name}",
    kindTrack: "प्रवासाची कथा · {time} वाजता",
    kindPlan: "प्लॅनिंगची कथा",
    kindItinerary: "दिवसाच्या प्लॅनची कथा",
    whatHappens: "काय होते:",
    playTrack: "कथा सुरू करा: {clock} वाजता {card} रूट सुरू करा",
    showMoment: "तो क्षण दाखवा ({time})",
    settingUp: "तयारी होत आहे…",
    done: "डेमो घड्याळ {time} वर सेट केले — पेज आता तोच क्षण दाखवत आहे.",
    error: "TravelBuddy सर्व्हरशी जोडता आले नाही — पोर्ट 8000 वर बॅकएंड सुरू करा.",
  },
});

export interface StoryText {
  name: string;
  story: string;
  hook: string;
  watch: string;
}

/** Hindi / Marathi versions of travellers.json TR1–TR5 (name, story, demo_hook, demo.watch). */
export const STORIES: Record<"hi" | "mr", Record<string, StoryText>> = {
  hi: {
    TR1: {
      name: "मीरा (व्हीलचेयर यूज़र)",
      story: "BKC के MMRDA Grounds में कॉन्फ़्रेंस के लिए इंटरनेशनल एयरपोर्ट (T2) पर पहुँचती है। व्हीलचेयर यूज़र है: सिर्फ़ बिना सीढ़ी वाले रूट, बहुत कम पैदल चलना।",
      hook: "आम ऐप उसे Metro 3 से सीधे BKC भेजता है, जहाँ यात्री बता रहे हैं कि लिफ्ट बंद है (E_BKC_LIFT, सिर्फ़ 'संभावित', 44%)। व्हीलचेयर यूज़र के लिए यह बहुत बड़ा जोखिम है, इसलिए TravelBuddy Metro 3 से Santacruz + टैक्सी सुझाता है।",
      watch: "रूट नतीजे: 'Pakka Check ने क्या बदला' (लिफ्ट बंद होना जोखिम गिना गया) और 'आम ऐप बनाम TravelBuddy' (आम ऐप Metro 3 से BKC जाता है)।",
    },
    TR2: {
      name: "रोहन (कम बजट वाला स्टूडेंट)",
      story: "स्टूडेंट, दोस्तों से मिलने Ghatkopar से Juhu Beach जा रहा है। ₹50 बजट, उसी में सबसे जल्दी रास्ता; टैक्सी नहीं।",
      hook: "16:58 पर बिल्कुल नए अकाउंट्स से 'Metro 1 पूरी तरह बंद' वाली पोस्ट की बाढ़ आती है — TravelBuddy इसे नज़रअंदाज़ करता है (5%) और उसे Metro 1 से ही भेजता है। 17:12 पर असली Saki Naka देरी की पुष्टि होती है (ख़बर + 3 यात्री, 83%) जब वह ट्रेन में है, तो Andheri से आगे का सफ़र फिर से प्लान होता है।",
      watch: "लाइव सफ़र: नकली पोस्ट की बाढ़ से कोई अलर्ट नहीं; 17:12 पर नए रूट का बैनर ('Andheri से नया रूट (Metro 1)')।",
    },
    TR3: {
      name: "अर्जुन (पक्की डेडलाइन)",
      story: "शाम 7 बजे के मैच के लिए Thane से Wankhede जा रहा है; 18:30 तक अंदर पहुँचना ज़रूरी है।",
      hook: "उसके सबसे सस्ते रूट में Dadar पर फ़ुट-ओवरब्रिज से ट्रेन बदलनी है। 17:15 पर Central Railway की सूचना + 2 यात्री पुल बंद होने की पुष्टि करते हैं (89%) → नया रूट: फ़ास्ट लोकल में CSMT तक बैठे रहें, फिर टैक्सी — और फिर भी 18:30 की डेडलाइन पूरी।",
      watch: "लाइव सफ़र: 17:15 पर Dadar वाले ट्रेन बदलने के स्टेप पर 'बंद होने की पुष्टि 89% · इस्तेमाल नहीं कर सकते' और नए रूट का बैनर (CSMT तक बैठे रहें + टैक्सी)।",
    },
    TR4: {
      name: "कुलकर्णी परिवार (टूरिस्ट, कई जगहें एक दिन में)",
      story: "पहली बार मुंबई आए हैं, CSMT के पास रुके हैं। दक्षिण मुंबई में दोपहर बिताना चाहते हैं, आख़िर में Marine Drive पर सूर्यास्त।",
      hook: "एक दोपहर में पाँच जगहें, खुलने के समय के अंदर (म्यूज़ियम 18:00 बजे बंद होता है), Marine Drive सूर्यास्त के लिए 18:30 पर तय। जब यात्री Azad Maidan / CSMT के पास पानी भरने की संभावना बताते हैं (40%), तो पास के हिस्सों पर चेतावनी आती है पर प्लान वही रहता है — 'संभावित' से प्लान नहीं बदलता।",
      watch: "दिन का प्लान: खुलने के समय में 5 जगहें, Marine Drive 18:30 पर; 17:25 पर CSMT के पास के हिस्सों पर संभावित पानी भरने (40%) की चेतावनी — प्लान वही रहा।",
    },
    TR5: {
      name: "प्रिया (ऑटो नहीं लेती)",
      story: "ऑफ़िस Andheri में, मीटिंग Phoenix Palladium में। ऑटो नहीं लेगी; लोकल, मेट्रो, बस, कैब चलेगी।",
      hook: "उसके सबसे सस्ते रूट में Andheri से वेस्टर्न स्लो लोकल है। 17:06 पर वहाँ सिग्नल ख़राब होने से देरी की पुष्टि होती है (ख़बर + यात्री) → नया रूट। अलग से आई बढ़ा-चढ़ाकर लिखी 'पूरी WR लाइन बंद' पोस्ट को Western Railway की 'सामान्य चल रहा है' सूचना काट देती है।",
      watch: "लाइव सफ़र: 17:06 पर Andheri में वेस्टर्न स्लो की देरी की पुष्टि → फ़ास्ट ट्रेन वाला नया रूट; बढ़ा-चढ़ाकर लिखी 'WR पूरी बंद' रिपोर्ट को WR की सूचना ग़लत साबित करती है (पारदर्शिता पेज देखें)।",
    },
  },
  mr: {
    TR1: {
      name: "मीरा (व्हीलचेअर वापरणारी)",
      story: "BKC मधील MMRDA Grounds वरच्या कॉन्फरन्ससाठी इंटरनॅशनल एअरपोर्टवर (T2) येते. व्हीलचेअर वापरते: फक्त पायऱ्या नसलेले रूट, अगदी कमी चालणे.",
      hook: "साधे ॲप तिला Metro 3 ने थेट BKC ला पाठवते, जिथे प्रवासी सांगत आहेत की लिफ्ट बंद आहे (E_BKC_LIFT, फक्त 'शक्य', 44%). व्हीलचेअर वापरणाऱ्यासाठी हा धोका खूप मोठा आहे, म्हणून TravelBuddy Metro 3 ने Santacruz + टॅक्सी सुचवते.",
      watch: "रूट निकाल: 'Pakka Check ने काय बदलले' (लिफ्ट बंद असणे धोका म्हणून मोजले) आणि 'साधे ॲप विरुद्ध TravelBuddy' (साधे ॲप Metro 3 ने BKC ला जाते).",
    },
    TR2: {
      name: "रोहन (कमी बजेटचा विद्यार्थी)",
      story: "मित्रांना भेटायला Ghatkopar हून Juhu Beach ला जाणारा विद्यार्थी. ₹50 बजेट, त्यातच सर्वात जलद मार्ग; टॅक्सी नको.",
      hook: "16:58 ला अगदी नवीन अकाउंटवरून 'Metro 1 पूर्ण बंद' अशा पोस्टचा पूर येतो — TravelBuddy त्याकडे दुर्लक्ष करते (5%) आणि त्याला Metro 1 नेच पाठवते. 17:12 ला खरा Saki Naka उशीर पक्का होतो (बातमी + 3 प्रवासी, 83%) तो ट्रेनमध्ये असताना, म्हणून Andheri पासून पुढचा प्रवास पुन्हा प्लॅन होतो.",
      watch: "लाइव्ह प्रवास: खोट्या पोस्टच्या पुरामुळे कोणताही अलर्ट नाही; 17:12 ला नव्या रूटचा बॅनर ('Andheri पासून नवा रूट (Metro 1)').",
    },
    TR3: {
      name: "अर्जुन (ठरलेली डेडलाइन)",
      story: "संध्याकाळी 7 च्या मॅचसाठी Thane हून Wankhede ला जात आहे; 18:30 पर्यंत आत पोहोचायलाच हवे.",
      hook: "त्याच्या सर्वात स्वस्त रूटमध्ये Dadar ला पादचारी पुलावरून ट्रेन बदलायची आहे. 17:15 ला Central Railway ची सूचना + 2 प्रवासी पूल बंद असल्याचे पक्के करतात (89%) → नवा रूट: फास्ट लोकलने CSMT पर्यंत बसून राहा, मग टॅक्सी — आणि तरीही 18:30 ची डेडलाइन गाठली.",
      watch: "लाइव्ह प्रवास: 17:15 ला Dadar च्या ट्रेन बदलण्याच्या टप्प्यावर 'बंद पक्के 89% · वापरता येणार नाही' आणि नव्या रूटचा बॅनर (CSMT पर्यंत बसून राहा + टॅक्सी).",
    },
    TR4: {
      name: "कुलकर्णी कुटुंब (पर्यटक, एका दिवसात अनेक ठिकाणे)",
      story: "पहिल्यांदाच मुंबईत आले आहेत, CSMT जवळ राहत आहेत. दक्षिण मुंबईत दुपार घालवायची आहे, शेवटी Marine Drive वर सूर्यास्त.",
      hook: "एका दुपारी पाच ठिकाणे, उघडण्याच्या वेळेत (म्युझियम 18:00 ला बंद होते), Marine Drive सूर्यास्तासाठी 18:30 ला ठरलेले. प्रवासी Azad Maidan / CSMT जवळ पाणी साचण्याची शक्यता सांगतात (40%), तेव्हा जवळच्या टप्प्यांवर इशारा येतो पण प्लॅन तसाच राहतो — 'शक्य' इतके प्लॅन बदलायला पुरेसे नाही.",
      watch: "दिवसाचा प्लॅन: उघडण्याच्या वेळेत 5 ठिकाणे, Marine Drive 18:30 ला; 17:25 ला CSMT जवळच्या टप्प्यांवर पाणी साचण्याच्या शक्यतेचा (40%) इशारा — प्लॅन तसाच ठेवला.",
    },
    TR5: {
      name: "प्रिया (रिक्षा घेत नाही)",
      story: "ऑफिस Andheri मध्ये, मीटिंग Phoenix Palladium मध्ये. रिक्षा घेणार नाही; लोकल, मेट्रो, बस, कॅब चालेल.",
      hook: "तिच्या सर्वात स्वस्त रूटमध्ये Andheri हून वेस्टर्न स्लो लोकल आहे. 17:06 ला तिथे सिग्नल बिघाडामुळे उशीर पक्का होतो (बातमी + प्रवासी) → नवा रूट. वेगळीच अतिशयोक्त 'संपूर्ण WR लाईन बंद' पोस्ट Western Railway च्या 'सुरळीत सुरू' सूचनेने खोटी ठरते.",
      watch: "लाइव्ह प्रवास: 17:06 ला Andheri ला वेस्टर्न स्लोचा उशीर पक्का → फास्ट ट्रेनचा नवा रूट; अतिशयोक्त 'WR पूर्ण बंद' रिपोर्ट WR च्या सूचनेने खोडली जाते (पारदर्शकता पेज पहा).",
    },
  },
};

/** A traveller's story text in `lang`; English (from travellers.json) when there's no translation. */
export function storyText(lang: Lang, id: string, english: Partial<StoryText>): Partial<StoryText> {
  if (lang === "en") return english;
  const tr = STORIES[lang][id];
  if (!tr) return english;
  const out: Partial<StoryText> = {};
  for (const k of Object.keys(english) as (keyof StoryText)[]) out[k] = english[k] ? tr[k] : english[k];
  return out;
}
