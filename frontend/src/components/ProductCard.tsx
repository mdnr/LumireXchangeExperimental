import { Link } from 'react-router-dom';
import type { ProductSummary } from '../lib/types';
import { formatPrice } from '../lib/format';

export function ProductCard({ product }: { product: ProductSummary }) {
  const heroImage = product.imageUrls[0] ?? '';

  return (
    <Link to={`/products/${product.slug}`} className="product-card">
      <div className="product-card-media">
        {heroImage ? (
          <img src={heroImage} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-card-placeholder" aria-hidden="true">
            {product.name.slice(0, 1)}
          </div>
        )}
        {product.bestSeller && <span className="badge badge-gold">Best seller</span>}
        {product.hasModel && <span className="badge badge-model" title="Interactive 3D model available">3D</span>}
      </div>
      <div className="product-card-body">
        <div className="product-card-row">
          <span className="product-card-category">{product.category}</span>
          <span className="product-card-price">{formatPrice(product.price)}</span>
        </div>
        <h3 className="product-card-name">{product.name}</h3>
        <p className="product-card-tagline">{product.tagline}</p>
      </div>
    </Link>
  );
}