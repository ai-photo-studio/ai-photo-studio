import type { CreativeType, CreativeSceneType } from "./creative-types";

export type CreativeStudioRoute = {
  creativeType: CreativeType | null;
  sceneType: CreativeSceneType | null;
  template: string | null;
  enabled: boolean;
};

export const resolveCreativeStudioRoute = (category: string | null): CreativeStudioRoute => {
  if (!category) return { creativeType: null, sceneType: null, template: null, enabled: false };

  const creativeMap: Record<string, CreativeStudioRoute> = {
    shoes: { creativeType: "FLAT_LAY", sceneType: "TABLETOP", template: "ecommerce-flatlay", enabled: false },
    fashion: { creativeType: "FLAT_LAY", sceneType: "TABLETOP", template: "premium-flatlay", enabled: false },
    perfume: { creativeType: "VIRTUAL_MODEL", sceneType: "MODEL", template: "female", enabled: false },
    cosmetics: { creativeType: "VIRTUAL_MODEL", sceneType: "MODEL", template: "female", enabled: false },
    food: { creativeType: "FLAT_LAY", sceneType: "TABLETOP", template: "grocery-flatlay", enabled: false },
    electronics: { creativeType: "LIFESTYLE_SCENE", sceneType: "STUDIO", template: "office", enabled: false }
  };

  return creativeMap[category] ?? { creativeType: null, sceneType: null, template: null, enabled: false };
};