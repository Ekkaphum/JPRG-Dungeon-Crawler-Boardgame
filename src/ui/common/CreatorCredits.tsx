import { useT } from '@content/i18n/useT';

export function CreatorCredits() {
  const t = useT();

  return (
    <footer className="creator-credits relative z-10 w-full max-w-md text-center" aria-label={t('credits.createdBy')}>
      <p className="creator-credits-label">{t('credits.createdBy')}</p>
      <div className="creator-credits-brands">
        <a href="https://lifebugs.dev" target="_blank" rel="noopener noreferrer" className="creator-credits-link">
          <img src="/assets/brand/lifebugs.webp" alt="Lifebugs" width="116" height="39" className="creator-credits-lifebugs" />
        </a>
        <span className="creator-credits-separator" aria-hidden="true">×</span>
        <a href="https://www.facebook.com/LunarGravityGames" target="_blank" rel="noopener noreferrer" className="creator-credits-link">
          <img src="/assets/brand/lunar-gravity.jpg" alt="" width="32" height="32" className="creator-credits-lunar" />
          <span>Lunar Gravity</span>
        </a>
      </div>
      <p className="creator-credits-designer">
        <span>{t('credits.gameDesign')}</span>{' '}
        <strong>Poom Phumiphan</strong>
      </p>
    </footer>
  );
}
