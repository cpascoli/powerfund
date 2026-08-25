export const GITHUB_REPO_URL = "https://github.com/cpascoli/powerfund";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-copy">
        <p>© {new Date().getFullYear()} Power Fund</p>
        <p>
          Personal capital. Not investment advice. Not a solicitation.
        </p>
      </div>
      <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
    </footer>
  );
}
