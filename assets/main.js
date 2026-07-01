// Entry point — imports from assets/js/* and calls all init functions.
// type="module" scripts are deferred by default, so the DOM is ready here.
import { initScrollReveal, initCountUp } from './js/animations.js';
import { initPasswordGate, initLogout } from './js/auth.js';
import { initDashboardNav, initDashboardSearch, initReelUpload } from './js/dashboard.js';
import { initReelActions, initReelData, initLikeToggles, initReelSwipe, initReelDoubleTapLike, initReelSearch } from './js/reel.js';
import { initSegmentedControls, initMobileNav } from './js/ui.js';
import { initRegisterPage } from './js/register.js';
import { initRegistrationFeed } from './js/admin.js';
import { initProfileFollow } from './js/profile.js';
import { initNotifications } from './js/notifications.js';

initScrollReveal();
initCountUp();
initPasswordGate();
initDashboardNav();
initReelActions();
initLikeToggles();
initReelData();
initReelSwipe();
initReelDoubleTapLike();
initSegmentedControls();
initMobileNav();
initRegisterPage();
initRegistrationFeed();
initProfileFollow();
initReelUpload();
initLogout();
initNotifications();
initDashboardSearch();
initReelSearch();
