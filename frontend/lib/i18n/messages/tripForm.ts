// Validation messages returned by validateForm (lib/tripForm.ts).
import { defineMessages } from "../../i18n";

export const M = defineMessages({
  en: {
    noFrom: "Pick where you start from the list.",
    noTo: "Pick where you're going from the list.",
    same: "From and To can't be the same place.",
    noTime: "Enter a time.",
    noModes: "Pick at least one way to travel, not just walking.",
    badBudget: "Budget must be a number, 0 or more.",
    badWalk: "Walking time must be a number, 0 or more.",
    badChanges: "Changes must be a number, 0 or more.",
  },
  hi: {
    noFrom: "लिस्ट से चुनें कि कहाँ से जाना है।",
    noTo: "लिस्ट से चुनें कि कहाँ जाना है।",
    same: "कहाँ से और कहाँ तक एक ही जगह नहीं हो सकती।",
    noTime: "टाइम डालें।",
    noModes: "पैदल के अलावा जाने का कम से कम एक तरीका चुनें।",
    badBudget: "बजट 0 या उससे ज़्यादा का नंबर होना चाहिए।",
    badWalk: "पैदल का टाइम 0 या उससे ज़्यादा का नंबर होना चाहिए।",
    badChanges: "बदलाव 0 या उससे ज़्यादा का नंबर होना चाहिए।",
  },
  mr: {
    noFrom: "यादीतून निवडा, कुठून निघणार.",
    noTo: "यादीतून निवडा, कुठे जायचे.",
    same: "कुठून आणि कुठे एकच ठिकाण असू शकत नाही.",
    noTime: "वेळ टाका.",
    noModes: "चालण्याशिवाय जायचा किमान एक मार्ग निवडा.",
    badBudget: "बजेट 0 किंवा त्यापेक्षा जास्त नंबर असावा.",
    badWalk: "चालण्याचा वेळ 0 किंवा त्यापेक्षा जास्त नंबर असावा.",
    badChanges: "बदल 0 किंवा त्यापेक्षा जास्त नंबर असावा.",
  },
});
