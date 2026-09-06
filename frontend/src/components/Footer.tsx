export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>© {new Date().getFullYear()} Lumière Studio</span>
        <span className="footer-tag">Interactive product showcase · built on .NET + React + WebGL</span>
      </div>
    </footer>
  );
}