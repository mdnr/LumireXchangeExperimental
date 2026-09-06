import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatPrice } from '../lib/format';
import type { Product } from '../lib/types';

export function SellerDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [owned, setOwned] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .listProducts()
      .then(async (res) => {
        const details = await Promise.all(
          res.products.map((p) => api.getProduct(p.slug).then((d) => d.product).catch(() => null)),
        );
        const mine = details.filter((p): p is Product => p !== null && p.seller.email === user?.email);
        setOwned(mine);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (slug: string) => {
    setDeleting(slug);
    setError(null);
    try {
      await api.deleteProduct(slug);
      setConfirmSlug(null);
      setActionMessage('Product deleted.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="container page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Seller studio</p>
          <h1>Your products</h1>
        </div>
        <Link to="/seller/new" className="btn btn-primary">+ New product</Link>
      </header>

      {actionMessage && <div className="alert alert-success" role="status">{actionMessage}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {loading && <div className="grid"><div className="spinner" role="status" /></div>}
      {!loading && !error && owned.length === 0 && (
        <div className="empty-state">
          <p>You haven't listed any products yet.</p>
          <Link to="/seller/new" className="btn btn-primary">Create your first product</Link>
        </div>
      )}

      {!loading && !error && owned.length > 0 && (
        <div className="seller-table">
          <div className="seller-row seller-row-head">
            <span>Product</span>
            <span>Category</span>
            <span>Price</span>
            <span>Model</span>
            <span>Actions</span>
          </div>
          {owned.map((p) => (
            <div className="seller-row" key={p.slug}>
              <span className="seller-name-row">
                <Link to={`/products/${p.slug}`} className="seller-link">{p.name}</Link>
                <small className="muted">{p.slug}</small>
              </span>
              <span>{p.category}</span>
              <span>{formatPrice(p.price)}</span>
              <span>
                {p.hasModel ? <span className="ok">Uploaded</span> : <span className="missing">None</span>}
              </span>
              <span className="row-actions">
                <Link to={`/seller/products/${p.slug}/edit`} className="btn btn-ghost btn-sm">Edit</Link>
                {confirmSlug === p.slug ? (
                  <span className="confirm-cluster">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={deleting === p.slug}
                      onClick={() => handleDelete(p.slug)}
                    >
                      {deleting === p.slug ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmSlug(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmSlug(p.slug)}>
                    Delete
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <aside className="seller-tip">
        <h3>Demo access</h3>
        <p>Signed in as <strong>{user?.displayName}</strong>. Publish products and upload GLB models for instant 3D preview.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/catalogue')}>View live storefront</button>
      </aside>
    </div>
  );
}