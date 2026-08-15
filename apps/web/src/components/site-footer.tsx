export const GITHUB_REPO_URL = "https://github.com/cpascoli/powerfund";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>© {new Date().getFullYear()} Power Fund</p>
      <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
    </footer>
  );
}
