import MobileNavigation from './components/MobileNavigation';
import { Navigate, Route, Routes, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { setLastTrip } from './db/repo';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Toast } from './components/Layout';
import { useCurrentTripTheme, useTrips } from './hooks/data';
import { AppThemeBase } from './components/TripTheme';
import TripsPage from './features/TripsPage';
import ItineraryPage from './features/ItineraryPage';
import ItemPage from './features/ItemPage';
import DocsPage from './features/DocsPage';
import TripSettingsPage from './features/TripSettingsPage';
import DocPage from './features/DocPage';
import TemplatePage from './features/TemplatePage';
import PastePage from './features/PastePage';
import PreviewPage from './features/PreviewPage';
import LedgerPage from './features/LedgerPage';
import OutfitsPage from './features/OutfitsPage';
import FoodGalleryPage from './features/food/GalleryPage';
import FoodDatabasePage from './features/food/DatabasePage';
import FoodImportPage from './features/food/FoodImportPage';
import FoodFormPage from './features/food/FoodFormPage';
import TodayPage from './features/TodayPage';
import ItemEditPage from './features/ItemEditPage';
import UpdatePage from './features/UpdatePage';
import NotificationsPage from './features/NotificationsPage';
import { MySuggestPage, ReviewSuggestionPage, SuggestionsPage } from './features/SuggestPages';
import AccountGate from './features/AccountGate';
import { AccountSheet } from './features/AccountSheet';
import { useUI } from './store/ui';
import StoryPage from './features/StoryPage';
import GuidePage from './features/guide/GuidePage';
import CreditsPage from './features/CreditsPage';
import RestoreConfirm from './components/RestoreConfirm';
import UpdateBanner from './components/UpdateBanner';
import PageBoundary from './components/PageBoundary';

function Home() {
  const trips = useTrips();
  if (!trips) return null;
  return <Navigate to={trips.length ? '/itinerary' : '/trips'} replace />;
}

function ThemeBase() {
  const theme = useCurrentTripTheme();
  return theme ? <AppThemeBase theme={theme} /> : null;
}

/** 2026-10-23：美食册按旅程。/trip/<id>/food 先把那份旅程设成当前旅程，再进美食专区 */
function TripFood() {
  const { tripId } = useParams();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!tripId) return setReady(true);
    void setLastTrip(tripId).finally(() => setReady(true));
  }, [tripId]);
  return ready ? <Navigate to="/food" replace /> : null;
}

/** 2026-11-18：每一页（按浏览记录里的位置）各自记住滚动位置。点进去是新页 → 回到顶部；点「返回」→ 回到离开时的位置。 */
const scrollMemory = new Map<string, number>();

function ScrollTop() {
  const { pathname, key } = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    keyRef.current = key; // 先于浏览器的滚动事件切换，免得新页面被夹住的滚动值写进旧页面
  }, [key]);
  useEffect(() => {
    try {
      window.history.scrollRestoration = 'manual';
    } catch {
      /* 不支持就算了 */
    }
    const save = () => scrollMemory.set(keyRef.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);
  // 2026-10-19 修复：不能写成 useEffect(() => window.scrollTo(0, 0))。新版 Chrome 的 scrollTo 会返回 Promise，
  // React 会把它当成清理函数在换页时调用 → "n is not a function"，整个 App 卸载 → 换页白屏。
  useEffect(() => {
    const target = navType === 'POP' ? scrollMemory.get(key) ?? 0 : 0;
    window.scrollTo(0, target);
    if (target <= 0) return;
    // 行程内容是异步读出来的，刚回来时页面还没撑到那么高：等内容出来再滚（最多约 1.5 秒；用户自己动手滚了就不抢）
    let frames = 0;
    let raf = 0;
    const stop = () => cancelAnimationFrame(raf);
    const tick = () => {
      if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) > 1 && ++frames < 90) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    window.addEventListener('wheel', stop, { once: true, passive: true });
    return () => {
      stop();
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('wheel', stop);
    };
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** 侧栏「账号」打开的弹窗 */
function GlobalAccountSheet() {
  const open = useUI((s) => s.accountOpen);
  const setOpen = useUI((s) => s.setAccountOpen);
  return <AccountSheet open={open} onClose={() => setOpen(false)} />;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <AccountGate>
      <ThemeBase />
      <UpdateBanner />
      <RestoreConfirm />
      <PageBoundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/itinerary" element={<ItineraryPage />} />
        <Route path="/itinerary/:tripId" element={<ItineraryPage />} />
        <Route path="/item/:itemId" element={<ItemPage />} />
        <Route path="/item/:itemId/edit" element={<ItemEditPage />} />
        <Route path="/trip/:tripId/add" element={<ItemEditPage />} />
        <Route path="/trip/:tripId/update" element={<UpdatePage />} />
        {/* 2026-11-18 邀请码已取消：旧的邀请链接带到「收到邀请」说明 */}
        <Route path="/join/:code" element={<Navigate to="/trips#join" replace />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/trip/:tripId/suggest" element={<MySuggestPage />} />
        <Route path="/trip/:tripId/suggestions" element={<SuggestionsPage />} />
        <Route path="/trip/:tripId/suggestion/:sid" element={<ReviewSuggestionPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/trip/:tripId/settings" element={<TripSettingsPage />} />
        <Route path="/trip/:tripId/ledger" element={<LedgerPage />} />
        <Route path="/trip/:tripId/outfits" element={<OutfitsPage />} />
        <Route path="/food" element={<FoodGalleryPage />} />
        <Route path="/food/database" element={<FoodDatabasePage />} />
        <Route path="/food/ai-import" element={<FoodImportPage />} />
        <Route path="/food/database/new" element={<FoodFormPage />} />
        <Route path="/food/database/:foodId" element={<FoodFormPage />} />
        <Route path="/trip/:tripId/food" element={<TripFood />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/trip/:tripId/today" element={<TodayPage />} />
        <Route path="/trip/:tripId/story" element={<StoryPage />} />
        <Route path="/trip/:tripId/highlights" element={<GuidePage />} />
        <Route path="/credits/photos" element={<CreditsPage />} />
        <Route path="/doc/:docId" element={<DocPage />} />
        <Route path="/import/template" element={<TemplatePage />} />
        <Route path="/import/paste" element={<PastePage />} />
        <Route path="/import/preview" element={<PreviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MobileNavigation />
      </PageBoundary>
      </AccountGate>
      <GlobalAccountSheet />
      <Toast />
    </>
  );
}
