import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { api } from '../lib/api';
import { formatPrice } from '../lib/format';
import { useArSupport } from '../lib/useArSupport';
import type { Product, ProductSummary } from '../lib/types';

function usdzUrlFor(modelUrl: string): string {
  return modelUrl.replace(/\.glb(\?.*)?$/i, '.usdz');
}

// iOS Quick Look ignores a rel="ar" anchor unless it contains an <img> child.
const USDZ_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const ProductViewer = lazy(() =>
  import('../components/ProductViewer').then((m) => ({ default: m.ProductViewer })),
);

const ProductAR = lazy(() =>
  import('../components/ProductAR').then((m) => ({ default: m.ProductAR })),
);

const ProductARScan = lazy(() =>
  import('../components/ProductARScan').then((m) => ({ default: m.ProductARScan })),
);

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [view, setView] = useState<'3d' | 'photo'>('photo');
  const [activeVariant, setActiveVariant] = useState<number | null>(null);
  const [arOpen, setArOpen] = useState<'webxr' | 'scan' | null>(null);
  const [arSupported, arChecking] = useArSupport();
  // The MediaPipe wrist scan only needs a camera, so it is not a mobile-only
  // feature. Gating it behind a touch/user-agent check hid the button entirely
  // on desktops, where a webcam runs the same hand tracking just fine.
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  useEffect(() => {
    setHasCamera(typeof navigator.mediaDevices?.getUserMedia === 'function');
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    api
      .getProduct(slug)
      .then((res) => {
        setProduct(res.product);
        setRelated(res.related);
        setActiveImage(0);
        setActiveVariant(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="container page"><div className="spinner" role="status" /></div>;
  }

  if (error || !product || !slug) {
    return (
      <div className="container page">
        <div className="empty-state">
          <p className="error-text" role="alert">{error ?? 'Product not found.'}</p>
          <Link to="/catalogue" className="btn btn-primary">Back to catalogue</Link>
        </div>
      </div>
    );
  }

  const isWearable = /watch|wearable/i.test(`${product.category} ${product.slug}`);
  // Prefer WebXR where the browser exposes it, fall back to the camera scan, and
  // only offer the static USDZ link when the device can do neither.
  const arReady = !arChecking && hasCamera !== null;
  const arCanOpen = arSupported || hasCamera === true;

  // iOS only releases the camera from inside a user gesture, and the scan
  // component acquires its stream from a mount effect, by which point the click
  // that opened it is no longer "active" and the prompt is refused. Ask once
  // here, then release the tracks, so the real request later is already allowed.
  const openScan = () => {
    void navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((warmed) => warmed.getTracks().forEach((t) => t.stop()))
      .catch(() => undefined);
    setArOpen('scan');
  };
  const activeVariantData = product.variants.find((v) => v.id === activeVariant) ?? null;
  const arMaterial = activeVariantData?.material ?? product.material;
  const arModelMaterials = activeVariantData?.modelMaterials ?? product.modelMaterials;

  return (
    <div className="container page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/catalogue">Catalogue</Link>
        <span>/</span>
        <span>{product.category}</span>
        <span>/</span>
        <span className="breadcrumb-current">{product.name}</span>
      </nav>

      <div className="product-detail">
        <div className="product-detail-media">
          <div className="view-tabs" role="tablist" aria-label="Product views">
            <button
              type="button"
              role="tab"
              aria-selected={view === '3d'}
              className={view === '3d' ? 'view-tab active' : 'view-tab'}
              onClick={() => setView('3d')}
            >
              3D model
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'photo'}
              className={view === 'photo' ? 'view-tab active' : 'view-tab'}
              onClick={() => setView('photo')}
            >
              Photos
            </button>
          </div>

          {view === '3d' ? (
            <Suspense fallback={<div className="model-stage" aria-hidden="true" />}>
              <ProductViewer
                modelUrl={product.modelUrl}
                material={product.material}
                modelMaterials={product.modelMaterials}
                variant={product.variants.find((v) => v.id === activeVariant) ?? null}
                revision={product.updatedAt}
                category={product.category}
                className="model-stage"
              />
            </Suspense>
          ) : (
            <div className="photo-stage">
              <img src={product.imageUrls[activeImage]} alt={`${product.name} — photo ${activeImage + 1}`} />
            </div>
          )}

          {view === 'photo' && product.imageUrls.length > 1 && (
            <div className="thumbnails">
              {product.imageUrls.map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  className={i === activeImage ? 'thumb active' : 'thumb'}
                  onClick={() => setActiveImage(i)}
                  aria-label={`Photo ${i + 1}`}
                >
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-detail-info">
          <p className="eyebrow">{product.category}{product.bestSeller ? ' · Best seller' : ''}</p>
          <h1 className="product-title">{product.name}</h1>
          <p className="product-tagline">{product.tagline}</p>

          <div className="product-price">{formatPrice(product.price)}</div>

          {product.variants.length > 0 ? (
            <div className="variant-picker" aria-label="Colour variants">
              <p className="muted small">
                Colour: <strong>{activeVariant != null ? product.variants.find(v => v.id === activeVariant)?.name ?? 'Select' : 'Select'}</strong>
              </p>
              <div className="swatches">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={activeVariant === v.id ? 'swatch-btn active' : 'swatch-btn'}
                    title={v.name}
                    aria-label={v.name}
                    onClick={() => {
                      setActiveVariant(v.id);
                      setActiveImage(
                        v.photoIndex != null && v.photoIndex >= 0 && v.photoIndex < product.imageUrls.length
                          ? v.photoIndex
                          : v.imageUrl
                            ? product.imageUrls.indexOf(v.imageUrl)
                            : 0,
                      );
                    }}
                  >
                    <span className="swatch" style={{ backgroundColor: v.hex }} />
                    <span className="swatch-btn-name">{v.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : product.colors.length > 0 ? (
            <div className="swatches" aria-label="Available colors">
              {product.colors.map((c) => (
                <span key={c} className="swatch" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          ) : null}

          <p className="product-description">{product.description}</p>

          <button type="button" className="btn btn-primary btn-lg btn-block">
            Add to cart
          </button>

          {product.modelUrl && isWearable && arReady && arCanOpen && (
            <button
              type="button"
              className="btn btn-secondary btn-lg btn-block"
              onClick={() => (arSupported ? setArOpen('webxr') : openScan())}
            >
              Try it on your wrist (AR)
            </button>
          )}
          {product.modelUrl && isWearable && arReady && !arCanOpen && (
            <a
              className="btn btn-secondary btn-lg btn-block ar-usdz-link"
              href={usdzUrlFor(product.modelUrl)}
              rel="ar"
            >
              <img src={USDZ_POSTER} alt="" aria-hidden="true" />
              View this watch in AR
            </a>
          )}
          <p className="muted small">Demo marketplace — no checkout is wired up yet.</p>

          <div className="seller-box">
            <span className="muted small">Sold by</span>
            <span className="seller-name">{product.seller.displayName}</span>
          </div>
        </div>
      </div>

      {product.specs.length > 0 && (
        <section className="section">
          <h2>Specifications</h2>
          <div className="spec-table">
            {product.specs.map((s) => (
              <div className="spec-row" key={s.label}>
                <span className="spec-label">{s.label}</span>
                <span className="spec-value">{s.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {product.features.length > 0 && (
        <section className="section">
          <h2>Highlights</h2>
          <div className="feature-grid">
            {product.features.map((f) => (
              <article className="feature-card" key={f.title}>
                <div className="feature-icon" aria-hidden="true">✦</div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>You may also like</h2>
            <Link to="/catalogue" className="link-muted">View all →</Link>
          </div>
          <div className="grid">
            {related.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </section>
      )}

      {arOpen === 'webxr' && product.modelUrl && (
        <Suspense fallback={null}>
          <ProductAR
            modelUrl={product.modelUrl}
            material={arMaterial}
            modelMaterials={arModelMaterials}
            revision={product.updatedAt}
            onExit={() => setArOpen(null)}
          />
        </Suspense>
      )}
      {arOpen === 'scan' && product.modelUrl && (
        <Suspense fallback={null}>
          <ProductARScan
            modelUrl={product.modelUrl}
            material={arMaterial}
            modelMaterials={arModelMaterials}
            revision={product.updatedAt}
            usdzUrl={usdzUrlFor(product.modelUrl)}
            onExit={() => setArOpen(null)}
          />
        </Suspense>
      )}
    </div>
  );
}