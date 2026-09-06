import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { averageColorFromImage } from '../lib/color';
import { emptyProduct, DEFAULT_MATERIAL, type ColorPreset, type ColorVariant, type Feature, type Material, type ModelMaterial, type ProductInput, type Spec } from '../lib/types';

const ProductViewer = lazy(() =>
  import('../components/ProductViewer').then((m) => ({ default: m.ProductViewer })),
);

const VARIANT_SUGGEST = [
  { re: /^#1a1a1a$/i, name: 'Onyx' },
  { re: /^#0d0d10$/i, name: 'Noir' },
  { re: /^#2b2b2b$/i, name: 'Graphite' },
  { re: /^#d4d4d4$/i, name: 'Silver' },
  { re: /^#e5e5e5$/i, name: 'Silver' },
  { re: /^#e8e8e8$/i, name: 'Pearl' },
  { re: /^#8b5e3c$/i, name: 'Walnut' },
  { re: /^#c9a227$/i, name: 'Gold' },
  { re: /^#bcd0d8$/i, name: 'Mist' },
];

function suggestColorName(hex: string, index: number): string {
  return VARIANT_SUGGEST.find((s) => s.re.test(hex))?.name ?? `Colour ${index + 1}`;
}

function deriveVariants(p: { colors: string[]; imageUrls: string[]; variants?: ColorVariant[]; modelMaterials?: ModelMaterial[] }): ColorVariant[] {
  if (p.variants && p.variants.length > 0) {
    return p.variants;
  }
  const materials = p.modelMaterials?.length ?? 0;
  return p.colors.map((hex, i) => ({
    id: i + 1,
    name: suggestColorName(hex, i),
    hex,
    imageUrl: p.imageUrls[i] ?? p.imageUrls[0] ?? null,
    materialIndex: i < materials ? i : null,
  }));
}

export function ProductFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const isEdit = Boolean(slug);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState<ProductInput>(() => emptyProduct());
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewVariant, setPreviewVariant] = useState<number | null>(null);
  const [modelRevision, setModelRevision] = useState<number>(0);
  const [previewBg, setPreviewBg] = useState<'white' | 'mist' | 'dark'>('white');
  const [step, setStep] = useState<1 | 2>(() => (searchParams.get('step') === '2' ? 2 : 1));
  const fileRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchParams.get('uploaded')) {
      setUploadNotice('Product created. Upload a 3D model, style its parts, and save a colour look.');
    }
  }, [searchParams]);

  useEffect(() => {
    api.listProducts().then((res) => setCategories(res.categories)).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    api
      .getProduct(slug)
      .then((res) => {
        const p = res.product;
        setForm({
          name: p.name,
          tagline: p.tagline,
          description: p.description,
          price: p.price,
          category: p.category,
          bestSeller: p.bestSeller,
          imageUrls: p.imageUrls,
          colors: p.colors,
          specs: p.specs as Spec[],
          features: p.features as Feature[],
          modelUrl: p.modelUrl,
          modelPosterUrl: p.modelPosterUrl,
          material: { ...DEFAULT_MATERIAL, ...(p.material as Material) },
          variants: deriveVariants(p).map((v) => {
            const idx = v.photoIndex ?? (v.imageUrl ? p.imageUrls.indexOf(v.imageUrl) : -1);
            return { ...v, photoIndex: idx >= 0 ? idx : undefined };
          }),
          modelMaterials: (p.modelMaterials as ModelMaterial[] | undefined) ?? [],
          colorPresets: (p.colorPresets as ColorPreset[] | undefined) ?? [],
        });
        setCategories((prev) => (prev.includes(p.category) ? prev : [...prev, p.category]));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const update = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: ProductInput = {
        ...form,
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        category: form.category.trim(),
        imageUrls: form.imageUrls.map((v) => v.trim()).filter(Boolean),
        colors: form.variants.map((v) => v.hex).filter(Boolean),
        variants: form.variants.map((v) => ({
          id: v.id,
          name: v.name.trim(),
          hex: v.hex,
          imageUrl: v.imageUrl,
          photoIndex: v.photoIndex,
          materialIndex: v.materialIndex,
          material: v.material,
          modelMaterials: v.modelMaterials,
        })),
        modelMaterials: form.modelMaterials,
        colorPresets: form.colorPresets,
      };

      if (!payload.material) payload.material = DEFAULT_MATERIAL;

      if (isEdit && slug) {
        await api.updateProduct(slug, payload);
        setUploadNotice('Saved. The live preview now matches what buyers see.');
        setModelRevision(Date.now());
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const created = await api.createProduct(payload);
        navigate(`/seller/products/${created.slug}/edit?uploaded=1&step=2`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!slug) return;
    setUploading(true);
    setError(null);
    setUploadNotice(null);
    try {
      const res = await api.uploadModel(slug, file);
      update('modelUrl', res.modelUrl);
      setModelRevision(Date.now());
      setForm((f) => ({
        ...f,
        modelMaterials: res.materials,
        variants: f.variants.map((v) =>
          v.materialIndex != null && !res.materials.some((m) => m.index === v.materialIndex)
            ? { ...v, materialIndex: null }
            : v,
        ),
      }));
      setUploadNotice(res.materials.length > 0
        ? `${file.name} uploaded — ${res.materials.length} part${res.materials.length > 1 ? 's' : ''} ready to style.`
        : `${file.name} uploaded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleImagesUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !slug) return;
    setUploadingImages(true);
    setError(null);
    setUploadNotice(null);
    try {
      const res = await api.uploadImages(slug, files);
      update('imageUrls', res.imageUrls);
      setUploadNotice(res.imageUrls.length > 1 ? `${res.imageUrls.length} photos added.` : 'Photo added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingImages(false);
      if (imagesRef.current) imagesRef.current.value = '';
    }
  };

  const addImageUrl = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    update('imageUrls', [...form.imageUrls, url]);
    setNewImageUrl('');
  };

  const removeImage = (index: number) => {
    update('imageUrls', form.imageUrls.filter((_, i) => i !== index));
  };

  const setSpec = (i: number, key: 'label' | 'value', value: string) => {
    update('specs', form.specs.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)));
  };
  const addSpec = () => update('specs', [...form.specs, { label: '', value: '' }]);
  const removeSpec = (i: number) => update('specs', form.specs.filter((_, idx) => idx !== i));

  const setFeature = (i: number, key: 'title' | 'description', value: string) => {
    update('features', form.features.map((f, idx) => (idx === i ? { ...f, [key]: value } : f)));
  };
  const addFeature = () => update('features', [...form.features, { title: '', description: '' }]);
  const removeFeature = (i: number) => update('features', form.features.filter((_, idx) => idx !== i));

  const updateVariants = (fn: (vs: ColorVariant[]) => ColorVariant[]) => {
    setForm((f) => ({ ...f, variants: fn(f.variants) }));
  };

  const setVariant = (id: number, patch: Partial<ColorVariant>) => {
    updateVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const pickVariantPhoto = (id: number, imageUrl: string | null, index: number) => {
    setVariant(id, { imageUrl, photoIndex: index >= 0 ? index : undefined });
    if (imageUrl) {
      void (async () => {
        const hex = await averageColorFromImage(imageUrl);
        if (hex) {
          setVariant(id, { hex });
        }
      })();
    }
  };
  const removeVariant = (id: number) => updateVariants((vs) => vs.filter((v) => v.id !== id));
  const addVariant = () => {
    const nextId = form.variants.reduce((max, v) => Math.max(max, v.id), 0) + 1;
    const existing = form.variants[form.variants.length - 1];
    const photoIndex = form.imageUrls.length ? Math.min(nextId - 1, form.imageUrls.length - 1) : -1;
    updateVariants((vs) => [...vs, {
      id: nextId,
      name: '',
      hex: existing ? existing.hex : '#e8e8e8',
      imageUrl: photoIndex >= 0 ? form.imageUrls[photoIndex] : null,
      photoIndex: photoIndex >= 0 ? photoIndex : undefined,
      materialIndex: null,
    }]);
    setPreviewVariant(nextId);
  };

  const applyVariantLook = (v: ColorVariant) => {
    // Switching to a colour loads that colour's saved part looks into the preview.
    // If the colour has no stored snapshot yet (new/just-added), keep the current
    // painted parts so edits are never wiped on re-selection.
    setPreviewVariant(v.id);
    if (v.material && v.modelMaterials && v.modelMaterials.length > 0) {
      update('material', v.material);
      update('modelMaterials', v.modelMaterials.map((m) => ({ ...m, material: { ...m.material } })));
    }
  };

  const setModelMaterial = (index: number, patch: Partial<Material>) => {
    setForm((f) => {
      const modelMaterials = f.modelMaterials.map((m) =>
        m.index === index ? { ...m, material: { ...m.material, ...patch } } : m,
      );
      // Mirror the edit into whichever variant is currently active in the preview,
      // so choosing another colour and coming back never reverts your paint job.
      let variants = f.variants;
      if (previewVariant != null) {
        const vi = f.variants.findIndex((v) => v.id === previewVariant);
        if (vi >= 0) {
          variants = f.variants.map((v, i) =>
            i === vi ? { ...v, modelMaterials } : v,
          );
        }
      }
      return { ...f, modelMaterials, variants };
    });
  };

  const setMaterialLabel = (index: number, label: string) => {
    setForm((f) => {
      const modelMaterials = f.modelMaterials.map((m) => (m.index === index ? { ...m, label } : m));
      let variants = f.variants;
      if (previewVariant != null) {
        const vi = f.variants.findIndex((v) => v.id === previewVariant);
        if (vi >= 0) {
          variants = f.variants.map((v, i) => i === vi ? { ...v, modelMaterials, material: v.material } : v);
        }
      }
      return { ...f, modelMaterials, variants };
    });
  };

  const resetSlotMaterial = (index: number) => {
    const currentColor = form.modelMaterials.find((m) => m.index === index)?.material.color;
    setModelMaterial(index, { ...DEFAULT_MATERIAL, color: currentColor ?? DEFAULT_MATERIAL.color });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  if (loading) {
    return <div className="container page"><div className="spinner" role="status" /></div>;
  }

  return (
    <div className="container page studio-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/seller">Seller studio</Link>
        <span>/</span>
        <span>{isEdit ? form.name || 'Edit product' : 'New product'}</span>
      </nav>

      <p className="eyebrow">{isEdit ? 'Edit product' : 'New listing'}</p>
      <h1 className="studio-title">{isEdit ? form.name || 'Edit product' : 'Create a product'}</h1>

      {uploadNotice && <div className="alert alert-success" role="status">{uploadNotice}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="studio-layout">
        <aside className="studio-rail">
          {step === 2 && (
          <section className="card">
            <div className="card-head">
              <h2>Live preview</h2>
              <span className="muted small">drag to rotate</span>
            </div>
            <Suspense fallback={<div className="model-stage studio-preview" aria-hidden="true" />}>
              {form.modelUrl ? (
                <ProductViewer modelUrl={form.modelUrl} material={form.material} modelMaterials={form.modelMaterials} revision={modelRevision || undefined} className={`model-stage studio-preview stage-${previewBg}`} />
              ) : (
                <ProductViewer material={form.material} category={form.category || 'audio'} className={`model-stage studio-preview stage-${previewBg}`} />
              )}
            </Suspense>
            <div className="stage-bg-picker" role="group" aria-label="Preview background">
              {(['white', 'mist', 'dark'] as const).map((bg) => (
                <button
                  key={bg}
                  type="button"
                  className={previewBg === bg ? 'stage-bg-swatch active' : 'stage-bg-swatch'}
                  data-bg={bg}
                  onClick={() => setPreviewBg(bg)}
                  aria-pressed={previewBg === bg}
                  title={`Background: ${bg}`}
                />
              ))}
            </div>

            {form.variants.length > 0 && (
              <div className="variant-strip" aria-label="Preview colour variants">
                {form.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={previewVariant === v.id ? 'swatch-btn active' : 'swatch-btn'}
                    onClick={() => applyVariantLook(v)}
                    title={v.name || 'Colour'}
                    aria-label={v.name || 'Colour'}
                  >
                    <span className="swatch" style={{ backgroundColor: v.hex }} />
                    <span className="swatch-btn-name">{v.name || `Colour ${v.id}`}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          )}
          {step === 1 && (
            <section className="card">
              <div className="card-head">
                <h2>Getting ready</h2>
              </div>
              <p className="muted small no-margin">Next, the <strong>Colours &amp; 3D</strong> page shows a live 3D preview with every part you can paint.</p>
            </section>
          )}

          <div className="studio-rail-actions">
            <div className="rail-actions-label"><span className="step-badge">3</span><span>Publish</span></div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
            </button>
            {isEdit && slug && (
              <Link to={`/products/${slug}`} className="btn btn-ghost btn-block">Cancel</Link>
            )}
          </div>
        </aside>

        <div className="studio-main">
          <div className="studio-steps" role="tablist" aria-label="Listing steps">
            <button type="button" role="tab" aria-selected={step === 1} className={step === 1 ? 'studio-step active' : 'studio-step'} onClick={() => setStep(1)}>
              <span className="step-badge">1</span> Photos &amp; details
            </button>
            <button type="button" role="tab" aria-selected={step === 2} className={step === 2 ? 'studio-step active' : 'studio-step'} onClick={() => setStep(2)}>
              <span className="step-badge">2</span> Colours &amp; 3D
            </button>
          </div>

          {step === 1 && (<>
          <section className="card">
            <h2><span className="step-badge">1</span> Photos</h2>
            {form.imageUrls.length > 0 && (
              <div className="image-grid">
                {form.imageUrls.map((url, i) => (
                  <div className="image-tile" key={url + i}>
                    <img src={url} alt={`Photo ${i + 1}`} />
                    <div className="image-tile-bar">
                      {i === 0 && <span className="image-tile-main">Cover</span>}
                      <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => removeImage(i)} aria-label="Remove photo">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="media-actions">
              {slug ? (
                <>
                  <input
                    ref={imagesRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden-input"
                    onChange={handleImagesUpload}
                  />
                  <button type="button" className="btn btn-ghost" onClick={() => imagesRef.current?.click()} disabled={uploadingImages}>
                    {uploadingImages ? 'Uploading…' : 'Upload photos'}
                  </button>
                </>
              ) : (
                <p className="muted small">Save the product first, then add photos here. You can add one by URL below anytime.</p>
              )}
            </div>

            <div className="url-adder">
              <input
                type="url"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addImageUrl();
                  }
                }}
                placeholder="Paste an image URL and press Enter…"
              />
              <button type="button" className="btn btn-ghost" onClick={addImageUrl}>Add URL</button>
            </div>
          </section>

          <section className="card">
            <h2><span className="step-badge">1</span> Details</h2>
            <div className="field-grid">
              <label className="field field-wide">
                <span>Name *</span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="Aurora Pro Headphones"
                />
              </label>
              <label className="field">
                <span>Category *</span>
                <input
                  type="text"
                  list="category-list"
                  required
                  value={form.category}
                  onChange={(e) => update('category', e.target.value)}
                  placeholder="Audio"
                />
                <datalist id="category-list">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label className="field">
                <span>Price (USD) *</span>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => update('price', Number(e.target.value))}
                  placeholder="349"
                />
              </label>
              <label className="field field-wide">
                <span>Tagline</span>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => update('tagline', e.target.value)}
                  placeholder="Immersive studio-grade wireless audio"
                />
              </label>
              <label className="field field-wide">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Describe what makes this product special…"
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.bestSeller}
                  onChange={(e) => update('bestSeller', e.target.checked)}
                />
                <span>Mark as best seller</span>
              </label>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Specifications</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addSpec}>+ Add spec</button>
            </div>
            {form.specs.length === 0 && <p className="muted small">No specs yet — add driving range, ports, weight, etc.</p>}
            {form.specs.map((s, i) => (
              <div className="row-editor" key={i}>
                <input
                  type="text"
                  value={s.label}
                  onChange={(e) => setSpec(i, 'label', e.target.value)}
                  placeholder="Label (e.g. Battery life)"
                  aria-label={`Spec ${i + 1} label`}
                />
                <input
                  type="text"
                  value={s.value}
                  onChange={(e) => setSpec(i, 'value', e.target.value)}
                  placeholder="Value (e.g. 40 hours)"
                  aria-label={`Spec ${i + 1} value`}
                />
                <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => removeSpec(i)} aria-label="Remove spec">✕</button>
              </div>
            ))}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Highlights</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addFeature}>+ Add highlight</button>
            </div>
            {form.features.length === 0 && <p className="muted small">No highlights yet — add 2-3 selling points.</p>}
            {form.features.map((f, i) => (
              <div className="row-editor" key={i}>
                <input
                  type="text"
                  value={f.title}
                  onChange={(e) => setFeature(i, 'title', e.target.value)}
                  placeholder="Title (e.g. Adaptive ANC)"
                  aria-label={`Highlight ${i + 1} title`}
                />
                <input
                  type="text"
                  value={f.description}
                  onChange={(e) => setFeature(i, 'description', e.target.value)}
                  placeholder="One-line description"
                  aria-label={`Highlight ${i + 1} description`}
                />
                <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => removeFeature(i)} aria-label="Remove highlight">✕</button>
              </div>
            ))}
          </section>
          </>)}

          {step === 2 && (<>
          <section className="card">
            <div className="card-head">
              <h2><span className="step-badge">2</span> Colours</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addVariant}>+ Add colour</button>
            </div>
            <p className="muted small">
              A colour is a choice buyers see on the product page (e.g. Midnight, Pearl). Pick its photo and name it — the 3D look swaps to match automatically.
            </p>

            {form.variants.length === 0 && (
              <p className="muted small">No colours yet — add one. Buyers see these as selectable colour buttons.</p>
            )}

            <div className="variant-editor-list">
              {form.variants.map((v) => (
                <div className="variant-editor" key={v.id}>
                  <label className="field variant-color-field">
                    <span>Swatch</span>
                    <span className="color-input">
                      <input
                        type="color"
                        value={v.hex}
                        onChange={(e) => setVariant(v.id, { hex: e.target.value })}
                        aria-label={`Colour ${v.id} swatch`}
                      />
                    </span>
                  </label>
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => setVariant(v.id, { name: e.target.value })}
                      placeholder="e.g. Midnight"
                    />
                  </label>
                  <div className="field">
                    <span>Photo</span>
                    <div className="photo-thumbs">
                      {form.imageUrls.length === 0 && <em className="muted">No photos yet</em>}
                      {form.imageUrls.map((url, i) => {
                        const active = v.photoIndex != null
                          ? v.photoIndex === i
                          : v.imageUrl === url;
                        return (
                          <button
                            key={i}
                            type="button"
                            className={`photo-thumb${active ? ' active' : ''}`}
                            title={`Photo ${i + 1}${i === 0 ? ' (cover)' : ''}`}
                            onClick={() => pickVariantPhoto(v.id, url, i)}
                          >
                            <img src={url} alt={`Photo ${i + 1}`} />
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className={`photo-thumb photo-thumb-none${v.imageUrl == null ? ' active' : ''}`}
                        title="No photo"
                        onClick={() => pickVariantPhoto(v.id, null, -1)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => removeVariant(v.id)} aria-label="Remove colour">✕</button>
                </div>
              ))}
            </div>
          </section>

<section className="card">
            <div className="card-head">
              <h2><span className="step-badge">2</span> 3D look &amp; parts</h2>
              {slug && <span className="muted small">{form.modelUrl ? form.modelUrl : 'no model yet'}</span>}
            </div>

            {isEdit && slug ? (
              <div
                className={dragOver ? 'upload-zone drag-active' : 'upload-zone'}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <input ref={fileRef} type="file" accept=".glb,.gltf,model/gltf-binary" className="hidden-input" onChange={handleUpload} />
                <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading…' : form.modelUrl ? 'Replace 3D model' : 'Upload 3D model'}
                </button>
                <span className="muted small">
                  Drop a .glb here or click to browse. The preview updates instantly.
                </span>
              </div>
            ) : (
              <p className="muted small">Save the product first, then drop a .glb model here.</p>
            )}

            <div className="part-list">
              <div className="part-list-head">
              <h3 className="part-list-title">Paint the parts <span className="muted small">(see it live on the preview)</span></h3>
            </div>
              {form.modelMaterials.length > 0 ? (
                form.modelMaterials.map((m, i) => (
                  <div className="part-row" key={m.index}>
                    <div className="part-row-head">
                      <input
                        className="part-label-input"
                        type="text"
                        value={m.label || `Material ${i + 1}`}
                        onChange={(e) => setMaterialLabel(m.index, e.target.value)}
                        aria-label={`Part ${i + 1} name`}
                      />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => resetSlotMaterial(m.index)}>Reset</button>
                    </div>
                    <div className="part-row-controls">
                      <label className="field part-color">
                        <input
                          type="color"
                          value={m.material.color}
                          onChange={(e) => setModelMaterial(m.index, { color: e.target.value })}
                          aria-label={`${m.label || `Material ${i + 1}`} colour`}
                        />
                      </label>
                      <label className="field part-finish">
                        <select
                          value={m.material.finish}
                          onChange={(e) => setModelMaterial(m.index, { finish: e.target.value === 'chrome' ? 'chrome' : 'matte' })}
                          aria-label={`${m.label || `Material ${i + 1}`} finish`}
                        >
                          <option value="matte">Matte</option>
                          <option value="chrome">Chrome</option>
                        </select>
                      </label>
                      <label className="field part-slider">
                        <span>Metal</span>
                        <input type="range" min={0} max={1} step={0.01} value={m.material.metalness} onChange={(e) => setModelMaterial(m.index, { metalness: Number(e.target.value) })} />
                      </label>
                      <label className="field part-slider">
                        <span>Rough</span>
                        <input type="range" min={0} max={1} step={0.01} value={m.material.roughness} onChange={(e) => setModelMaterial(m.index, { roughness: Number(e.target.value) })} />
                      </label>
                      <label className="field part-slider">
                        <span>Clear</span>
                        <input type="range" min={0} max={1} step={0.01} value={m.material.clearcoat} onChange={(e) => setModelMaterial(m.index, { clearcoat: Number(e.target.value) })} />
                      </label>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted small no-margin">No model parts yet — upload a .glb above and each part appears here.</p>
              )}
            </div>
          </section>
          </>)}

          <div className="studio-steps-nav">
            {step === 2 && (
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>← Back to photos &amp; details</button>
            )}
            <div className="spacer" />
            {step === 1 && (
              <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                {form.imageUrls.length > 0 ? 'Continue to Colours & 3D →' : 'Skip photos — set up the 3D →'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}