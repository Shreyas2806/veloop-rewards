/**
 * NotFound/index.jsx — 404 page.
 */

import { Link } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  return (
    <div className="notfound">
      <h1 className="notfound-code">404</h1>
      <p className="notfound-msg">Page not found</p>
      <Link to="/captcha" className="btn btn-primary">Go to Earn →</Link>
    </div>
  );
}
