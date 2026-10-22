import MobileNavigation from './components/MobileNavigation';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
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
import FoodFormPage from './features/food/FoodFormPage';
import TodayPage from './features/TodayPage';
import ItemEditPage from './features/ItemEditPage';
import UpdatePage from './features/UpdatePage';
import JoinPage from './features/JoinPage';
import NotificationsPage from './features/NotificationsPage';
import { MySuggestPage, ReviewSuggestionPage, SuggestionsPage } from './features/SuggestPages';
import { initCloud } from './cloud/session';
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

/** 2026-10-18：用过同步的才在启动时恢复同步身份、检查新版本 */
function CloudBoot() {
  useEffect(() => {
    void initCloud();
  }, []);
  return null;
}

function ScrollTop() {
  const { pathname } = useLocation();
  // 2026-10-19 修复：不能写成 useEffect(() => window.scrollTo(0, 0))。新版 Chrome 的 scrollTo 会返回 Promise，
  // React 会把它当成清理函数在换页时调用 → "n is not a function"，整个 App 卸载 → 换页白屏。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <ThemeBase />
      <CloudBoot />
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
        <Route path="/join/:code" element={<JoinPage />} />
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
        <Route path="/food/database/new" element={<FoodFormPage />} />
        <Route path="/food/database/:foodId" element={<FoodFormPage />} />
        <Route path="/trip/:tripId/food" element={<Navigate to="/food" replace />} />
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
      <Toast />
    </>
  );
}
