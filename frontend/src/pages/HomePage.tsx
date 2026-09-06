import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { api } from '../lib/api';
import type { ProductSummary } from '../lib/types';

export function HomePage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listProducts({ sort: 'newest' })
      .then((res) => setProducts(res.products))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const featured = products.filter((p) => p.bestSeller).concat(products.filter((p) => !p.bestSeller)).slice(0, 3);
  const categories = [...new Set(products.map((p) => p.category))];

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <p className="hero-eyebrow">Interactive product marketplace</p>
          <h1 className="hero-title">
            Shop products you can <em>see</em> in 3D.
          </h1>
          <p className="hero-sub">
            Lumière lets you inspect every product as a live 3D model — rotate it, restyle its finish, and
            buy with confidence.
          </p>
          <div className="hero-actions">
            <Link to="/catalogue" className="btn btn-primary btn-lg">
              Browse the catalogue
            </Link>
            <Link to="/register?role=seller" className="btn btn-ghost btn-lg">
              Sell on Lumière
            </Link>
          </div>
          <div className="hero-stats">
            <span><strong>4</strong> products</span>
            <span><strong>{categories.length}</strong> categories</span>
            <span><strong>100%</strong> interactive</span>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Featured products</h2>
          <Link to="/catalogue" className="link-muted">View all →</Link>
        </div>
        {loading && <div className="grid"><div className="spinner" role="status" /></div>}
        {error && <p className="error-text" role="alert">{error}</p>}
        {!loading && !error && (
          <div className="grid">
            {featured.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        )}
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Browse by category</h2>
        </div>
        <div className="chips">
          {categories.map((c) => (
            <Link key={c} to={`/catalogue?category=${encodeURIComponent(c)}`} className="chip">
              {c}
            </Link>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Built for the future of commerce</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">◈</div>
            <h3>Real 3D models</h3>
            <p>Every product ships with an inspectable GLB model rendered right in your browser.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">◐</div>
            <h3>Live material preview</h3>
            <p>Sellers tune color, metalness and finish directly on the 3D model before publishing.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">§</div>
            <h3>Seller studio</h3>
            <p>An integrated dashboard to list, edit and publish products with zero plumbing.</p>
          </article>
        </div>
      </section>
    </>
  );
}