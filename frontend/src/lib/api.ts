import type {
  AuthResponse,
  MeResponse,
  ModelMaterial,
  Product,
  ProductDetailResponse,
  ProductInput,
  ProductListResponse,
} from './types';

const TOKEN_KEY = 'lumiere_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string; title?: string };
      message = data.error ?? data.title ?? message;
    } catch {
      // keep default message when body is not JSON
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  register(email: string, password: string, displayName: string, role?: 'seller' | 'user'): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName, role }),
    });
  },

  me(): Promise<MeResponse> {
    return request<MeResponse>('/api/auth/me');
  },

  listProducts(params?: { category?: string; sort?: string }): Promise<ProductListResponse> {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.sort) q.set('sort', params.sort);
    const qs = q.toString();
    return request<ProductListResponse>(`/api/products${qs ? `?${qs}` : ''}`);
  },

  getProduct(slug: string): Promise<ProductDetailResponse> {
    return request<ProductDetailResponse>(`/api/products/${slug}`);
  },

  createProduct(input: ProductInput): Promise<Product> {
    return request<Product>('/api/products', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateProduct(slug: string, input: ProductInput): Promise<Product> {
    return request<Product>(`/api/products/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deleteProduct(slug: string): Promise<void> {
    return request<void>(`/api/products/${slug}`, { method: 'DELETE' });
  },

  uploadModel(slug: string, file: File): Promise<{ modelUrl: string; materials: ModelMaterial[] }> {
    const form = new FormData();
    form.append('file', file);
    return request<{ modelUrl: string; materials: ModelMaterial[] }>(`/api/products/${slug}/model`, {
      method: 'POST',
      body: form,
    });
  },

  uploadImages(slug: string, files: File[]): Promise<{ imageUrls: string[] }> {
    const form = new FormData();
    for (const file of files) {
      form.append('files', file);
    }
    return request<{ imageUrls: string[] }>(`/api/products/${slug}/images`, {
      method: 'POST',
      body: form,
    });
  },
};