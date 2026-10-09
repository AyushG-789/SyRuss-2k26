// Validation messages returned by validateForm (lib/tripForm.ts).
import { defineMessages } from "../../i18n";

export const M = defineMessages({
  en: {
    noFrom: "Pick a starting point from the list.",
    noTo: "Pick a destination from the list.",
    same: "Start and destination must be different.",
    noTime: "Enter a time.",
    noModes: "Choose at least one way to travel besides walking.",
    badBudget: "Budget must be a positive number.",
    badWalk: "Walking limit must be a positive number.",
    badChanges: "Changes must be a positive number.",
  },
  hi: {
    noFrom: "लिस्ट में से शुरू की जगह चुनें।",
    noTo: "लिस्ट में से मंज़िल चुनें।",
    same: "शुरू की जगह और मंज़िल अलग होनी चाहिए।",
    noTime: "समय डालें।",
    noModes: "पैदल के अलावा सफ़र का कम से कम एक तरीका चुनें।",
    badBudget: "बजट एक पॉज़िटिव नंबर होना चाहिए।",
    badWalk: "पैदल चलने की सीमा एक पॉज़िटिव नंबर होनी चाहिए।",
    badChanges: "बदलाव (changes) की संख्या पॉज़िटिव नंबर होनी चाहिए।",
  },
  mr: {
    noFrom: "यादीतून सुरुवातीचे ठिकाण निवडा.",
    noTo: "यादीतून पोहोचायचे ठिकाण निवडा.",
    same: "सुरुवातीचे आणि पोहोचायचे ठिकाण वेगळे असावे.",
    noTime: "वेळ टाका.",
    noModes: "चालण्याशिवाय प्रवासाचा किमान एक मार्ग निवडा.",
    badBudget: "बजेट पॉझिटिव्ह नंबर असावा.",
    badWalk: "चालण्याची मर्यादा पॉझिटिव्ह नंबर असावी.",
    badChanges: "बदलांची (changes) संख्या पॉझिटिव्ह नंबर असावी.",
  },
});
