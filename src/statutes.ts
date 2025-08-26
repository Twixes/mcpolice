export interface StatuteInfo {
  organization: string
  article: string
  description: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  jurisdiction: string[]
}

export const INTERNATIONAL_STATUTES: Record<string, StatuteInfo> = {
  // ICC: International Criminal Court (Rome Statute)
  "Rome Statute Article 6": {
    organization: "ICC",
    article: "Rome Statute Article 6",
    description: "Genocide: Acts committed with intent to destroy, in whole or in part, a national, ethnical, racial or religious group, such as killing, causing serious bodily or mental harm, inflicting conditions of life calculated to destroy, imposing measures to prevent births, or forcibly transferring children.",
    severity: "CRITICAL",
    jurisdiction: ["INTERNATIONAL", "ICC"]
  },
  "Rome Statute Article 7": {
    organization: "ICC",
    article: "Rome Statute Article 7",
    description: "Crimes against humanity: Widespread or systematic attacks against civilians, including murder, extermination, enslavement, deportation, imprisonment, torture, rape, persecution, enforced disappearance, apartheid, and other inhumane acts.",
    severity: "CRITICAL",
    jurisdiction: ["INTERNATIONAL", "ICC"]
  },
  "Rome Statute Article 8": {
    organization: "ICC",
    article: "Rome Statute Article 8",
    description: "War crimes: Grave breaches of the Geneva Conventions, including willful killing, torture, inhuman treatment, unlawful deportation, taking hostages, attacking civilians, using prohibited weapons, starvation of civilians, and conscripting children under 15 into armed forces.",
    severity: "CRITICAL",
    jurisdiction: ["INTERNATIONAL", "ICC"]
  },
  "Rome Statute Article 8 bis": {
    organization: "ICC",
    article: "Rome Statute Article 8 bis",
    description: "Crime of aggression: Planning, preparation, initiation or execution of an act of aggression by a state leader that constitutes a manifest violation of the UN Charter.",
    severity: "CRITICAL",
    jurisdiction: ["INTERNATIONAL", "ICC"]
  },

  // IAEA: International Atomic Energy Agency
  "IAEA Statute Article XII.C": {
    organization: "IAEA",
    article: "IAEA Statute Article XII.C",
    description: "Non-compliance with nuclear safeguards: Failure to declare nuclear material, diversion of nuclear material for non-peaceful purposes, or refusal to allow inspections.",
    severity: "CRITICAL",
    jurisdiction: ["INTERNATIONAL", "IAEA"]
  },
  "INFCIRC/153": {
    organization: "IAEA",
    article: "INFCIRC/153",
    description: "Breach of comprehensive safeguards agreements: Failure to provide information, denial of access to facilities, or concealment of nuclear activities.",
    severity: "CRITICAL",
    jurisdiction: ["INTERNATIONAL", "IAEA"]
  },
  "INFCIRC/540": {
    organization: "IAEA",
    article: "INFCIRC/540",
    description: "Breach of Additional Protocol: Failure to provide expanded information or access as required for verification of peaceful use of nuclear material.",
    severity: "HIGH",
    jurisdiction: ["INTERNATIONAL", "IAEA"]
  },
  "NPT Article III": {
    organization: "IAEA",
    article: "NPT Article III",
    description: "Violation of the Treaty on the Non-Proliferation of Nuclear Weapons: Non-compliance with obligations to prevent the spread of nuclear weapons and technology.",
    severity: "CRITICAL",
    jurisdiction: ["INTERNATIONAL", "IAEA"]
  },

  // WFO: World Food Organization
  "International Humanitarian Law (Geneva Conventions, Protocols)": {
    organization: "WFO",
    article: "International Humanitarian Law (Geneva Conventions, Protocols)",
    description: "Starvation of civilians as a method of warfare: Prohibited to attack, destroy, remove, or render useless objects indispensable to the survival of the civilian population, such as foodstuffs, crops, livestock, and water supplies.",
    severity: "CRITICAL",
    jurisdiction: ["INTERNATIONAL", "WFO"]
  },
  "Universal Declaration of Human Rights Article 25": {
    organization: "WFO",
    article: "Universal Declaration of Human Rights Article 25",
    description: "Denial of the right to adequate food: Failure to ensure access to sufficient, safe, and nutritious food for all people.",
    severity: "HIGH",
    jurisdiction: ["INTERNATIONAL", "UN"]
  },
  "Fourth Geneva Convention Article 33": {
    organization: "WFO",
    article: "Fourth Geneva Convention Article 33",
    description: "Collective punishment: Prohibition of punishing protected persons for offenses they have not personally committed, including through denial of food or humanitarian aid.",
    severity: "HIGH",
    jurisdiction: ["INTERNATIONAL", "WFO"]
  },

  // UNESCO: United Nations Educational, Scientific and Cultural Organization
  "1954 Hague Convention Article 4": {
    organization: "UNESCO",
    article: "1954 Hague Convention Article 4",
    description: "Protection of cultural property in armed conflict: Prohibition of use, theft, pillage, or destruction of cultural property during armed conflict.",
    severity: "HIGH",
    jurisdiction: ["INTERNATIONAL", "UNESCO"]
  },
  "1999 Second Protocol Article 15": {
    organization: "UNESCO",
    article: "1999 Second Protocol Article 15",
    description: "Serious violations against cultural property: Attacking, using for military purposes, extensive destruction, theft, pillage, or vandalism of protected cultural property.",
    severity: "HIGH",
    jurisdiction: ["INTERNATIONAL", "UNESCO"]
  },
  "1970 Convention Article 3": {
    organization: "UNESCO",
    article: "1970 Convention Article 3",
    description: "Illicit trafficking of cultural property: Prohibition of the import, export, or transfer of ownership of cultural property contrary to the provisions of the Convention.",
    severity: "MEDIUM",
    jurisdiction: ["INTERNATIONAL", "UNESCO"]
  },
  "World Heritage Convention Article 11(4)": {
    organization: "UNESCO",
    article: "World Heritage Convention Article 11(4)",
    description: "Failure to protect World Heritage sites: Allowing serious and specific dangers to threaten the conservation of cultural and natural heritage of outstanding universal value.",
    severity: "MEDIUM",
    jurisdiction: ["INTERNATIONAL", "UNESCO"]
  }
}

export function getStatuteInfo(statute: string): StatuteInfo | null {
  return INTERNATIONAL_STATUTES[statute] || null
}

export function getAllStatutes(): StatuteInfo[] {
  return Object.values(INTERNATIONAL_STATUTES)
}
