import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { api } from '../lib/api';
import type { ProductSummary } from '../lib/types';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
] as const;

export function CataloguePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') ?? '';
  const sort = searchParams.get('sort') ?? 'newest';

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listProducts({ category, sort })
      .then((res) => {
        setProducts(res.products);
        setCategories(res.categories);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [category, sort]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const countLabel = useMemo(() => {
    if (loading) return 'Loading…';
    return `${products.length} product${products.length === 1 ? '' : 's'}`;
  }, [loading, products.length]);

  return (
    <div className="container page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>All products</h1>
        </div>
      </header>

      <div className="toolbar">
        <div className="chips">
          <button
            type="button"
            className={category === '' ? 'chip active' : 'chip'}
            onClick={() => setParam('category', '')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? 'chip active' : 'chip'}
              onClick={() => setParam('category', c === category ? '' : c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="select-label" htmlFor="sort">Sort</label>
          <select
            id="sort"
            className="select"
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <p className="muted count-label">{countLabel}</p>

      {loading && <div className="grid"><div className="spinner" role="status" /></div>}
      {error && <p className="error-text" role="alert">{error}</p>}

      {!loading && !error && products.length === 0 && (
        <div className="empty-state">
          <p>No products found{category ? ` in ${category}` : ''}.</p>
          <Link to="/catalogue" className="btn btn-primary">Clear filters</Link>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid">
          {products.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      )}
    </div>
  );
}