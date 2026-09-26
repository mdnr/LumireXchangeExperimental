export interface Material {
  surfaceType: 'color' | 'texture';
  color: string;
  textureUrl?: string | null;
  finish: 'matte' | 'chrome';
  metalness: number;
  roughness: number;
  clearcoat: number;
}

export interface Spec {
  label: string;
  value: string;
}

export interface Feature {
  title: string;
  description: string;
}

export interface ColorVariant {
  id: number;
  name: string;
  hex: string;
  imageUrl?: string | null;
  photoIndex?: number;
  materialIndex?: number | null;
  material?: Material;
  modelMaterials?: ModelMaterial[];
}

export interface ModelMaterial {
  index: number;
  /** Immutable GLB material name; never shown or edited. Renames of `label` can't break matching. */
  glbName?: string | null;
  label: string;
  material: Material;
}

export interface ColorPreset {
  name: string;
  material: Material;
  modelMaterials: ModelMaterial[];
}

export interface Seller {
  id: string;
  displayName: string;
  email: string;
}

/**
 * How a model sits on a wrist, chosen by the seller on the align page against a
 * reference hand and applied verbatim at try-on. Every GLB is authored
 * differently, so this is stated by a person rather than inferred from geometry.
 *
 * Rotation is a quaternion, not Euler angles: the axis order and the frame an
 * angle is measured in are exactly what goes wrong when a transform is stored
 * and read back. The align page edits in degrees for legibility and saves the
 * quaternion, so nothing depends on an order.
 *
 * Offsets are in wrist widths, the unit the tracker already measures the wrist
 * in, so one saved alignment fits any hand size.
 */
export interface ModelAlignment {
  quatX: number;
  quatY: number;
  quatZ: number;
  quatW: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  scale: number;
}

export interface ProductSummary {
  slug: string;
  name: string;
  tagline: string;
  price: number;
  category: string;
  bestSeller: boolean;
  imageUrls: string[];
  colors: string[];
  modelUrl?: string | null;
  hasModel: boolean;
  createdAt: string;
}

export interface Product extends ProductSummary {
  description: string;
  specs: Spec[];
  features: Feature[];
  modelPosterUrl?: string | null;
  material: Material;
  variants: ColorVariant[];
  modelMaterials: ModelMaterial[];
  colorPresets: ColorPreset[];
  /** Absent until a seller aligns the model on the align page. */
  modelAlignment?: ModelAlignment | null;
  seller: Seller;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  tagline: string;
  description: string;
  price: number;
  category: string;
  bestSeller: boolean;
  imageUrls: string[];
  colors: string[];
  specs: Spec[];
  features: Feature[];
  modelUrl?: string | null;
  modelPosterUrl?: string | null;
  material?: Material;
  variants: ColorVariant[];
  modelMaterials: ModelMaterial[];
  colorPresets: ColorPreset[];
}

export interface AuthResponse {
  token: string;
  email: string;
  displayName: string;
  roles: string[];
}

export interface MeResponse {
  email: string;
  displayName: string;
  roles: string[];
}

export interface ProductListResponse {
  products: ProductSummary[];
  categories: string[];
}

export interface ProductDetailResponse {
  product: Product;
  related: ProductSummary[];
}

export const DEFAULT_MATERIAL: Material = {
  surfaceType: 'color',
  color: '#e8e8e8',
  textureUrl: null,
  finish: 'matte',
  metalness: 0.2,
  roughness: 0.55,
  clearcoat: 0,
};

export function emptyProduct({ material, modelUrl }: { material?: Material; modelUrl?: string | null } = {}): ProductInput {
  return {
    name: '',
    tagline: '',
    description: '',
    price: 0,
    category: '',
    bestSeller: false,
    imageUrls: [],
    colors: [],
    specs: [],
    features: [],
    modelUrl: modelUrl ?? null,
    modelPosterUrl: null,
    material: material ?? DEFAULT_MATERIAL,
    variants: [],
    modelMaterials: [],
    colorPresets: [],
  };
}