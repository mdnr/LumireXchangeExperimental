import { Route, Routes } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { RequireSeller } from './components/RequireSeller';
import { CataloguePage } from './pages/CataloguePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ModelAlignPage } from './pages/ModelAlignPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductFormPage } from './pages/ProductFormPage';
import { RegisterPage } from './pages/RegisterPage';
import { SellerDashboardPage } from './pages/SellerDashboardPage';

function NotFoundPage() {
  return (
    <div className="container page">
      <div className="empty-state">
        <h1>404</h1>
        <p>That page doesn't exist.</p>
        <a className="btn btn-primary" href="/">Go home</a>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalogue" element={<CataloguePage />} />
          <Route path="/products/:slug" element={<ProductDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/seller"
            element={
              <RequireSeller>
                <SellerDashboardPage />
              </RequireSeller>
            }
          />
          <Route
            path="/seller/new"
            element={
              <RequireSeller>
                <ProductFormPage />
              </RequireSeller>
            }
          />
          <Route
            path="/seller/products/:slug/edit"
            element={
              <RequireSeller>
                <ProductFormPage />
              </RequireSeller>
            }
          />
          <Route
            path="/seller/products/:slug/align"
            element={
              <RequireSeller>
                <ModelAlignPage />
              </RequireSeller>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;