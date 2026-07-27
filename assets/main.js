// Entry point — imports from assets/js/* and calls all init functions.
// type="module" scripts are deferred by default, so the DOM is ready here.
import { initScrollReveal, initCountUp } from './js/animations.js';
import { initPasswordGate, initLogout } from './js/auth.js';
import { initDashboardNav, initDashboardSearch, initReelUpload } from './js/dashboard.js';
import { initReelFeed, initReelActions, initReelData, initLikeToggles, initReelSwipe, initReelDoubleTapLike, initReelSearch } from './js/reel.js';
import { initSegmentedControls, initMobileNav, initPhotoFallbacks } from './js/ui.js';
import { initRegisterPage } from './js/register.js';
import { initRegistrationFeed } from './js/admin.js';
import { initAdminOutreach } from './js/admin-messages.js';
import { initProfileFollow } from './js/profile.js';
import { initNotifications } from './js/notifications.js';
import { initMessages, initMyPage, initBreederMessages } from './js/messages.js';
import { initFavorites } from './js/favorites.js';
import { initBreederDeals, initAdminRevenue } from './js/revenue.js';
import { initBreederReels } from './js/breeder-reels.js';
import { initShareButtons } from './js/share.js';
import { initAutoPost } from './js/autopost.js';
import { initInstallPrompt } from './js/install.js';
import { initAuthGate } from './js/authgate.js';
import { initMotion } from './js/motion.js';

initScrollReveal();
initCountUp();
initMotion();
initPasswordGate();
initDashboardNav();
initReelActions();
initSegmentedControls();
initMobileNav();
initPhotoFallbacks();
initRegisterPage();
initRegistrationFeed();
initAdminOutreach();
initProfileFollow();
initReelUpload();
initLogout();
initNotifications();
initDashboardSearch();
initReelSearch();
initMyPage();
initBreederMessages();
initFavorites();
initBreederDeals();
initAdminRevenue();
initBreederReels();
initShareButtons();
initAutoPost();
initInstallPrompt();
initAuthGate();

// The live reel feed is rendered from real posts (falling back to the demo
// slides when there are none). It must be in the DOM before the swipe/like/
// consult handlers bind to slides, so render it first, then wire the feed.
(async () => {
  await initReelFeed();
  initLikeToggles();
  initReelData();
  initReelDoubleTapLike();
  initMessages();
  initReelSwipe();
})();

// Register the service worker so MOFUBOX is installable to the home screen (PWA).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
