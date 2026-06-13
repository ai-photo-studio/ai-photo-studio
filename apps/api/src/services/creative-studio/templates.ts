import type { CreativeType, CreativeSceneType, FlatLayTemplate, LifestyleTemplate, VirtualModelTemplate, VideoTemplate } from "./creative-types";

export type CreativeProfile = {
  creativeType: CreativeType;
  sceneType: CreativeSceneType;
  template: FlatLayTemplate | LifestyleTemplate | VirtualModelTemplate | VideoTemplate;
  displayName: string;
  description: string;
  enabled: boolean;
};

export const FLAT_LAY_TEMPLATES: Record<string, CreativeProfile> = {
  "ecommerce-flatlay": {
    creativeType: "FLAT_LAY",
    sceneType: "TABLETOP",
    template: "ecommerce-flatlay",
    displayName: "E-commerce Flat Lay",
    description: "Standard e-commerce product flat lay with clean background",
    enabled: false
  },
  "premium-flatlay": {
    creativeType: "FLAT_LAY",
    sceneType: "STUDIO",
    template: "premium-flatlay",
    displayName: "Premium Flat Lay",
    description: "Luxury e-commerce flat lay with premium lighting",
    enabled: false
  },
  "grocery-flatlay": {
    creativeType: "FLAT_LAY",
    sceneType: "TABLETOP",
    template: "grocery-flatlay",
    displayName: "Grocery Flat Lay",
    description: "Food and grocery product flat lay setup",
    enabled: false
  }
};

export const LIFESTYLE_TEMPLATES: Record<string, CreativeProfile> = {
  "home": {
    creativeType: "LIFESTYLE_SCENE",
    sceneType: "STUDIO",
    template: "home",
    displayName: "Home Lifestyle",
    description: "Product in home living environment",
    enabled: false
  },
  "office": {
    creativeType: "LIFESTYLE_SCENE",
    sceneType: "STUDIO",
    template: "office",
    displayName: "Office Lifestyle",
    description: "Product in office workspace setting",
    enabled: false
  },
  "luxury": {
    creativeType: "LIFESTYLE_SCENE",
    sceneType: "STUDIO",
    template: "luxury",
    displayName: "Luxury Lifestyle",
    description: "Premium lifestyle scene with luxury setting",
    enabled: false
  },
  "outdoor": {
    creativeType: "LIFESTYLE_SCENE",
    sceneType: "STUDIO",
    template: "outdoor",
    displayName: "Outdoor Lifestyle",
    description: "Product in outdoor environment",
    enabled: false
  }
};

export const VIRTUAL_MODEL_TEMPLATES: Record<string, CreativeProfile> = {
  "male": {
    creativeType: "VIRTUAL_MODEL",
    sceneType: "MODEL",
    template: "male",
    displayName: "Male Model",
    description: "Product worn by male model",
    enabled: false
  },
  "female": {
    creativeType: "VIRTUAL_MODEL",
    sceneType: "MODEL",
    template: "female",
    displayName: "Female Model",
    description: "Product worn by female model",
    enabled: false
  },
  "mannequin": {
    creativeType: "VIRTUAL_MODEL",
    sceneType: "MODEL",
    template: "mannequin",
    displayName: "Mannequin",
    description: "Product displayed on mannequin",
    enabled: false
  }
};

export const VIDEO_TEMPLATES: Record<string, CreativeProfile> = {
  "rotation": {
    creativeType: "PRODUCT_VIDEO",
    sceneType: "VIDEO_LOOP",
    template: "rotation",
    displayName: "Rotation Video",
    description: "360-degree product rotation",
    enabled: false
  },
  "zoom": {
    creativeType: "PRODUCT_VIDEO",
    sceneType: "VIDEO_LOOP",
    template: "zoom",
    displayName: "Zoom Video",
    description: "Smooth zoom-in product video",
    enabled: false
  },
  "showcase": {
    creativeType: "PRODUCT_VIDEO",
    sceneType: "VIDEO_LOOP",
    template: "showcase",
    displayName: "Showcase Video",
    description: "Multi-angle product showcase",
    enabled: false
  }
};

export const CREATIVE_TEMPLATES_REGISTRY: Record<string, CreativeProfile> = {
  ...FLAT_LAY_TEMPLATES,
  ...LIFESTYLE_TEMPLATES,
  ...VIRTUAL_MODEL_TEMPLATES,
  ...VIDEO_TEMPLATES
};